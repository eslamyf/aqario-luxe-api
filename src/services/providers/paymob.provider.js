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
        logger.info(`[Paymob] Using dummy API key, returning mock checkout URL.`);

        // Auto-approve the booking payment for local testing
        const Booking = require('../../models/booking.model');
        await Booking.findByIdAndUpdate(data.bookingId, { paymentStatus: 'paid', paidAmount: amount });

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

      // Step 1: Get authentication token
      const authToken = await this.getAuthToken();

      // Step 2: Create order
      const orderData = {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: Math.round(amount * 100), // Convert to cents
        currency: currency || 'EGP',
        merchant_order_id: paymentId, // Link to our payment ID
        items: [
          {
            name: propertyName,
            amount_cents: Math.round(amount * 100),
            quantity: 1,
            description: `Booking for ${propertyName}`,
          },
        ],
        customer: {
          first_name: 'Customer',
          last_name: 'User',
          email: `user_${userId}@realestate.local`,
          phone_number: '+20100000000',
        },
      };

      const orderResponse = await postJson(`${this.apiUrl}/ecommerce/orders`, orderData);
      const orderId = orderResponse.data.id;

      logger.info(`[Paymob] Order created: ${orderId}`);

      // Step 3: Generate payment key
      const paymentKeyData = {
        auth_token: authToken,
        amount_cents: Math.round(amount * 100),
        expiration: 3600, // 1 hour
        order_id: orderId,
        billing_data: {
          apartment: 'NA',
          email: `user_${userId}@realestate.local`,
          floor: 'NA',
          first_name: 'Customer',
          street: 'NA',
          building: 'NA',
          postal_code: 'NA',
          city: 'NA',
          country: 'NA',
          last_name: 'User',
          phone_number: '+20100000000',
          state: 'NA',
        },
        currency: currency || 'EGP',
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
