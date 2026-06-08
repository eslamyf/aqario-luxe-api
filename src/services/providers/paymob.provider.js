const BaseProvider = require('./baseProvider');
const logger = require('../../utils/logger');
const encryption = require('../../utils/encryption.utils');

const postJson = async (url, body, headers = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) { }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.response = { data };
    throw err;
  }

  return { data };
};

// ─────────────────────────────────────────────────────────────────
// Paymob Provider (Egyptian Payment Gateway)
// ─────────────────────────────────────────────────────────────────
// Supports: Credit/Debit Cards, Wallets, Bank Transfers
// Webhook: POST to /webhook/paymob
// ─────────────────────────────────────────────────────────────────

class PaymobProvider extends BaseProvider {
  constructor() {
    super('Paymob');
    this.apiUrl = 'https://accept.paymob.com/api';
    this.apiKey = process.env.PAYMOB_API_KEY;
    this.iframeId = process.env.PAYMOB_IFRAME_ID;
    this.integrationId = process.env.PAYMOB_INTEGRATION_ID;
    this.webhookSecret = process.env.PAYMOB_WEBHOOK_SECRET;

    if (!this.apiKey || !this.iframeId || !this.integrationId) {
      throw new Error('Missing Paymob configuration in .env');
    }
  }

  /**
   * Create payment
   * 1. Get auth token
   * 2. Create order
   * 3. Generate payment key (iframe token)
   */
  async createPayment(data) {
    try {
      const { amount, paymentId, userId, propertyName, currency } = data;

      logger.info(`[Paymob] Creating payment: ${paymentId}, amount: ${amount}`);

      // MOCK for local development without real API keys
      if (this.apiKey === 'dummy_api_key') {
        logger.info(`[Paymob] Using dummy API key, executing mock database updates for booking ${data.bookingId}`);

        const Booking = require('../../models/booking.model');
        const Payment = require('../../models/payment.model');
        const User = require('../../models/user.model');
        const Transaction = require('../../models/transaction.model');
        const Property = require('../../models/property.model');

        // 1. Update booking status to completed and paymentStatus to paid
        const booking = await Booking.findByIdAndUpdate(
          data.bookingId,
          { paymentStatus: 'paid', paidAmount: amount, status: 'completed' },
          { new: true }
        );

        // ── Deduplicate Booking & Payments for same User/Property pair ──
        if (booking) {
          const duplicateBookings = await Booking.find({
            user_id: booking.user_id,
            property_id: booking.property_id,
            _id: { $ne: booking._id },
            status: { $in: ['pending', 'approved'] }
          });

          if (duplicateBookings.length > 0) {
            const duplicateBookingIds = duplicateBookings.map(b => b._id);
            await Booking.updateMany(
              { _id: { $in: duplicateBookingIds } },
              { $set: { status: 'cancelled' } }
            );
            await Payment.updateMany(
              { booking: { $in: duplicateBookingIds }, status: 'pending' },
              { $set: { status: 'failed' } }
            );
            logger.info(`[Deduplication - Mock Paymob] Cancelled ${duplicateBookingIds.length} duplicate bookings and set their pending payments to failed.`);
          }
        }

        // 2. Find and update the corresponding Payment record
        const payment = await Payment.findOne({ booking: data.bookingId, status: 'pending' });
        if (payment) {
          payment.status = 'paid';
          payment.isVerified = true;
          payment.transactionId = 'mock_tx_' + Date.now();
          payment.verifiedAt = new Date();
          await payment.save();

          // 3. Update property statistics
          const propertyDoc = await Property.findByIdAndUpdate(
            payment.property,
            { $inc: { successfulBookings: 1 } },
            { new: true }
          );

          if (propertyDoc) {
            // 4. Update the owner's USD balance (95% net revenue split)
            const ownerId = propertyDoc.owner;
            const netAmount = payment.netAmount;
            const platformFee = payment.platformFee;

            await User.updateOne(
              { _id: ownerId },
              { $inc: { balance_USD: netAmount } }
            );

            // Fetch the updated user for the socket notification
            const updatedUser = await User.findById(ownerId);
            try {
              const socketIO = require('../../config/socket').getIO();
              socketIO.to(`user_${ownerId}`).emit('balanceUpdate', { balance_USD: updatedUser.balance_USD });
            } catch (socketErr) {
              logger.error('[Mock Paymob] Failed to emit socket balance update:', socketErr.message);
            }

            // 5. Create a new transaction record linked to the owner
            await Transaction.create({
              owner: ownerId,
              property: propertyDoc._id,
              booking: booking._id,
              payment: payment._id,
              amount: payment.totalAmount,
              commission: platformFee,
              netAmount: netAmount,
              currency: 'USD',
              status: 'completed',
              type: 'booking_income'
            });

            logger.info(`[Payout Split - Mock Paymob] Credited owner ${ownerId} balance with net revenue: ${netAmount}. Commission of ${platformFee} recorded.`);
          }
        }

        return {
          paymentKey: 'mock_payment_key_123',
          iframeKey: 'mock_payment_key_123',
          paymentUrl: `${process.env.CLIENT_URL || 'http://localhost:4200'}/payment/success?bookingId=${data.bookingId}`,
          metadata: {
            orderId: 'mock_order_123',
            integrationId: this.integrationId,
          },
        };
      }

      // Load user details for mandatory billing info
      const User = require('../../models/user.model');
      const user = await User.findById(userId);

      const nameParts = (user?.name || 'Customer User').trim().split(/\s+/);
      const userFirstName = nameParts[0] || 'Customer';
      const userLastName = nameParts.slice(1).join(' ') || 'User';
      const userEmail = user?.email || `user_${userId}@realestate.local`;
      
      let userPhone = user?.phone || '+20100000000';
      userPhone = userPhone.replace(/[^\d+]/g, '');
      if (userPhone.startsWith('01') && userPhone.length === 11) {
        userPhone = '+20' + userPhone.substring(1);
      } else if (!userPhone.startsWith('+')) {
        userPhone = '+' + userPhone;
      }
      if (userPhone === '+' || userPhone.length < 5) {
        userPhone = '+20100000000';
      }

      const getFallbackString = (val) => {
        if (!val) return 'NA';
        const cleaned = String(val).trim();
        return cleaned.length > 0 ? cleaned : 'NA';
      };

      // Convert currency to EGP if not already EGP
      let finalAmount = amount;
      let finalCurrency = 'EGP'; // Force explicit currency validation mapping to EGP

      if (currency && currency.toUpperCase() !== 'EGP') {
        const exchangeRate = 50.0;
        finalAmount = amount * exchangeRate;
        logger.info(`[Paymob] Converted ${amount} ${currency} to ${finalAmount} EGP (rate: ${exchangeRate})`);
      }

      // Safe-capping mechanism for non-production environments
      if (process.env.NODE_ENV !== 'production' && finalAmount > 100000) {
        logger.info(`[Paymob] [SANDBOX] Testing amount ${finalAmount} EGP exceeds threshold. Intercepted and capped to 100 EGP for upstream aggregator call.`);
        finalAmount = 100;
      }

      // Step 1: Get authentication token
      const authToken = await this.getAuthToken();

      // Step 2: Create order
      const orderData = {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: Math.round(finalAmount * 100), // Convert to cents
        currency: finalCurrency,
        merchant_order_id: paymentId, // Link to our payment ID
        items: [
          {
            name: propertyName,
            amount_cents: Math.round(finalAmount * 100),
            quantity: 1,
            description: `Booking for ${propertyName}`,
          },
        ],
        customer: {
          first_name: getFallbackString(userFirstName),
          last_name: getFallbackString(userLastName),
          email: getFallbackString(userEmail),
          phone_number: getFallbackString(userPhone),
        },
      };

      const orderResponse = await postJson(`${this.apiUrl}/ecommerce/orders`, orderData);
      const orderId = orderResponse.data.id;

      logger.info(`[Paymob] Order created: ${orderId}`);

      // Step 3: Generate payment key
      const paymentKeyData = {
        auth_token: authToken,
        amount_cents: Math.round(finalAmount * 100),
        expiration: 3600, // 1 hour
        order_id: orderId,
        billing_data: {
          apartment: getFallbackString(user?.apartment),
          email: getFallbackString(userEmail),
          floor: getFallbackString(user?.floor),
          first_name: getFallbackString(userFirstName),
          street: getFallbackString(user?.street),
          building: getFallbackString(user?.building),
          postal_code: getFallbackString(user?.postalCode || user?.postal_code),
          city: getFallbackString(user?.city),
          country: getFallbackString(user?.country),
          last_name: getFallbackString(userLastName),
          phone_number: getFallbackString(userPhone),
          state: getFallbackString(user?.state),
        },
        currency: finalCurrency,
        integration_id: this.integrationId,
      };

      const paymentKeyResponse = await postJson(`${this.apiUrl}/acceptance/payment_keys`, paymentKeyData);

      const paymentKey = paymentKeyResponse.data.token;

      logger.info(`[Paymob] Payment key generated: ${paymentKey}`);

      // Return payment key and iframe URL
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentKey}`;

      return {
        paymentKey,
        iframeKey: paymentKey,
        paymentUrl: iframeUrl,
        metadata: {
          orderId,
          integrationId: this.integrationId,
        },
      };
    } catch (err) {
      logger.error('[Paymob] createPayment error:', err.response?.data || err.message);
      throw new Error(`Paymob payment creation failed: ${err.message}`);
    }
  }

  /**
   * Verify payment by querying Paymob API
   */
  async verifyPayment(paymentKey) {
    try {
      logger.info(`[Paymob] Verifying payment key: ${paymentKey}`);

      // This would typically involve querying Paymob's order status
      // For now, we rely on webhooks (more reliable)
      throw new Error('Paymob verification via polling not fully implemented. Use webhooks.');
    } catch (err) {
      logger.error('[Paymob] verifyPayment error:', err);
      throw err;
    }
  }

  /**
   * Handle webhook from Paymob
   * Paymob sends: { type: 'TRANSACTION', obj: { ... } }
   */
  async handleWebhook(payload, payment) {
    try {
      logger.info(`[Paymob] Handling webhook for payment: ${payment._id}`);

      // Verify webhook signature (if Paymob sends it)
      // For now, assume webhook is verified by controller

      const transaction = payload.obj || payload;

      // Check if transaction was successful
      if (transaction.success !== true) {
        logger.error('[Paymob] Transaction failed:', transaction);
        return {
          success: false,
          error: transaction.error_message || 'Payment failed',
        };
      }

      // Extract transaction ID
      const transactionId = transaction.id || transaction.transaction_id;

      logger.info(`[Paymob] Payment successful! Transaction ID: ${transactionId}`);

      return {
        success: true,
        transactionId,
        metadata: {
          orderId: transaction.order_id,
          amount: transaction.amount_cents,
          currency: transaction.currency,
        },
      };
    } catch (err) {
      logger.error('[Paymob] handleWebhook error:', err);
      throw err;
    }
  }

  /**
   * Get authentication token from Paymob
   */
  async getAuthToken() {
    try {
      const response = await postJson(`${this.apiUrl}/auth/tokens`, {
        api_key: this.apiKey,
      });

      return response.data.token;
    } catch (err) {
      logger.error('[Paymob] getAuthToken error:', err.response?.data || err.message);
      throw new Error('Failed to authenticate with Paymob');
    }
  }

  /**
   * Refund payment (Paymob support)
   */
  async refund(transactionId) {
    try {
      logger.info(`[Paymob] Refunding transaction: ${transactionId}`);

      const authToken = await this.getAuthToken();

      const response = await postJson(`${this.apiUrl}/acceptance/void_refund/refund`, {
        auth_token: authToken,
        transaction_id: transactionId,
      });

      return {
        transactionId: response.data.id,
      };
    } catch (err) {
      logger.error('[Paymob] refund error:', err);
      throw new Error(`Paymob refund failed: ${err.message}`);
    }
  }
}

module.exports = PaymobProvider;
