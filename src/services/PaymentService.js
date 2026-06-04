const Payment = require('../models/payment.model');
const Booking = require('../models/booking.model');
const Property = require('../models/property.model');
const User = require('../models/user.model');
const ProviderFactory = require('./providers/factory');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const getPropertyTitleString = (title) => {
  if (!title) return 'Property';
  if (typeof title === 'string') return title;
  return title.en || title.ar || 'Property';
};

// ─────────────────────────────────────────────────────────────────
// Payment Service Layer
// ─────────────────────────────────────────────────────────────────
// Orchestrates payment flow: validation → creation → verification
// 3-layer architecture: Controller → Service → Provider
// ─────────────────────────────────────────────────────────────────

class PaymentService {
  /**
   * Helper: calculate 5% platform fee (Production Requirement)
   */
  calculatePlatformFee(amount) {
    return Math.round(amount * 0.05 * 100) / 100;
  }

  /**
   * Helper: route payment creation to the provider factory
   */
  async createProviderPayment(paymentMethod, params) {
    try {
      const provider = ProviderFactory.getProvider(paymentMethod);
      return await provider.createPayment(params);
    } catch (err) {
      logger.error(`[Payment] Provider error for ${paymentMethod}:`, err);
      throw new Error(`Payment provider error: ${err.message}`);
    }
  }

  /**
   * PHASE 1: Initiate Payment
   * Called after booking is APPROVED by owner/admin
   * 
   * Security checks:
   * 1. Amount validated on SERVER (never trust frontend)
   * 2. Property price verified
   * 3. Double-payment check (booking can't have 2 payments)
   * 4. KYC verified (already protected by middleware)
   */
  async initiatePayment(bookingId, paymentMethod, userId, ipAddress, userAgent) {
    try {
      logger.info(`[Payment] Initiating payment for booking ${bookingId}, method: ${paymentMethod}`);

      // 1. Fetch booking and related data
      const booking = await Booking.findById(bookingId).populate('property_id');
      if (!booking) {
        throw new Error('Booking not found');
      }

      const property = booking.property_id;
      if (!property) {
        throw new Error('Property not found');
      }

      // 2. CRITICAL: Calculate amount on SERVER (never trust frontend)
      const propertyPrice = property.price;
      if (!propertyPrice || propertyPrice <= 0) {
        throw new Error('Invalid property price');
      }

      // Platform service fee calculation (centralized helper)
      const platformFee = this.calculatePlatformFee(propertyPrice);
      const totalAmount = propertyPrice + platformFee;
      const netAmount = propertyPrice; // Owner receives the property price, platform takes the fee

      logger.info(`[Payment] Amount breakdown - Price: ${propertyPrice}, Fee: ${platformFee}, Total: ${totalAmount}`);

      // 3. CRITICAL: Double-payment prevention
      // Check if booking already has a non-failed payment
      const existingPayment = await Payment.findOne({
        booking: bookingId,
        status: { $nin: ['failed', 'expired'] },
      });

      if (existingPayment) {
        // BUG-10 FIX: Idempotent retry — return existing pending payment instead of
        // deleting it.
        if (existingPayment.status === 'pending') {
          logger.info(`[Payment] Idempotent resume: existing pending payment ${existingPayment._id} returned for booking ${bookingId}`);
          return {
            paymentId: existingPayment._id,
            status: 'pending',
            propertyPrice: existingPayment.propertyPrice,
            platformFee: existingPayment.platformFee,
            totalAmount: existingPayment.totalAmount,
            netAmount: existingPayment.netAmount,
            paymentMethod: existingPayment.paymentMethod,
            expiresAt: existingPayment.expiresAt,
            paymentKey: existingPayment.paymentKey || null,
            paymentUrl: existingPayment.metadata?.iframeUrl || null,
            resumed: true, // signal to controller that this was a resumed session
          };
        }
        // Non-pending (processing, paid, failed, expired): hard reject
        throw new Error(
          `Payment already initiated for this booking. Status: ${existingPayment.status}. ` +
          `Cannot create another payment until this one is resolved.`
        );
      }

      let finalCurrency = property.currency || 'EGP';
      let finalPropertyPrice = propertyPrice;
      let finalPlatformFee = platformFee;
      let finalTotalAmount = totalAmount;
      let finalNetAmount = netAmount;

      if (paymentMethod === 'paypal') {
        // PayPal requires USD. Convert from EGP to USD if property is in EGP.
        if (finalCurrency.toUpperCase() === 'EGP') {
          const exchangeRate = 50.0;
          finalCurrency = 'USD';
          finalPropertyPrice = Math.round((propertyPrice / exchangeRate) * 100) / 100;
          finalPlatformFee = Math.round((platformFee / exchangeRate) * 100) / 100;
          finalTotalAmount = Math.round((totalAmount / exchangeRate) * 100) / 100;
          finalNetAmount = Math.round((netAmount / exchangeRate) * 100) / 100;
          logger.info(`[Payment] PayPal payment: Converted EGP to USD. Price: ${finalPropertyPrice}, Fee: ${finalPlatformFee}, Total: ${finalTotalAmount}`);
        }
      }

      // 4. Create payment record (status: pending)
      const payment = new Payment({
        user: userId,
        property: property._id,
        booking: bookingId,
        propertyPrice: finalPropertyPrice,
        platformFee: finalPlatformFee,
        netAmount: finalNetAmount,
        totalAmount: finalTotalAmount,
        paymentMethod,
        currency: finalCurrency,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        ipAddress,
        userAgent,
      });

      await payment.save();

      logger.info(`[Payment] Payment record created: ${payment._id}, status: PENDING`);

      // 5. Route to provider using unified helper
      let providerResult;
      try {
        providerResult = await this.createProviderPayment(paymentMethod, {
          amount: totalAmount,
          paymentId: payment._id.toString(),
          userId: userId,
          propertyId: property._id.toString(),
          bookingId: bookingId,
          propertyName: getPropertyTitleString(property.title),
          currency: payment.currency,
        });
      } catch (providerErr) {
        // Provider creation failed, mark payment as failed
        payment.status = 'failed';
        await payment.save();
        throw providerErr;
      }

      // 6. Update payment with provider response
      payment.paymentKey = providerResult.paymentKey || null;
      payment.provider = paymentMethod;
      payment.metadata = providerResult.metadata || {};
      await payment.save();

      logger.info(`[Payment] Provider integration complete, paymentKey: ${payment.paymentKey}`);

      return {
        paymentId: payment._id,
        status: 'pending',
        propertyPrice,
        platformFee,
        totalAmount,
        netAmount,
        paymentMethod,
        expiresAt: payment.expiresAt,
        // Return provider-specific data
        paymentUrl: providerResult.paymentUrl || providerResult.iframeKey || null,
        paymentKey: providerResult.paymentKey || null,
      };
    } catch (err) {
      logger.error('[Payment] initiatePayment error:', err);
      throw err;
    }
  }

  /**
   * PHASE 2: Verify Payment
   * Called either by:
   * A) Webhook from provider (Paymob, PayPal)
   * B) Polling query to provider API
   * 
   * CRITICAL: Idempotency guard prevents webhook from processing twice
   */
  async verifyPayment(paymentId, webhookData = null) {
    const useTransaction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';
    const session = useTransaction ? await mongoose.startSession() : null;
    if (session) session.startTransaction();

    try {
      logger.info(`[Payment] Verifying payment: ${paymentId}`);

      const payment = await Payment.findById(paymentId).session(session);
      if (!payment) {
        throw new AppError(`Payment ${paymentId} not found`, 404);
      }

      // CRITICAL: Idempotency guard
      if (payment.isVerified) {
        logger.warn(`[Payment] Payment already verified (idempotency check): ${paymentId}`);
        if (session) await session.abortTransaction();
        return { status: 'already_verified', payment };
      }

      // Check expiry
      if (payment.expiresAt < new Date()) {
        payment.status = 'expired';
        await payment.save({ session });
        if (session) await session.commitTransaction();
        logger.warn(`[Payment] Payment expired: ${paymentId}`);
        throw new Error('Payment expired');
      }

      // Get provider
      const provider = ProviderFactory.getProvider(payment.paymentMethod);

      // Verify with provider
      let verified;
      if (webhookData) {
        verified = await provider.handleWebhook(webhookData, payment);
      } else {
        verified = await provider.verifyPayment(payment.paymentKey);
      }

      if (!verified.success) {
        payment.status = 'failed';
        await payment.save({ session });
        if (session) await session.commitTransaction();
        logger.error(`[Payment] Verification failed for payment: ${paymentId}`);
        throw new Error('Payment verification failed');
      }

      // ─────────────────────────────────────────────────────────────
      // SUCCESS: Update payment and booking atomically
      // ─────────────────────────────────────────────────────────────
      payment.isVerified = true; // ← IDEMPOTENCY FLAG (prevents re-processing)
      payment.status = 'paid';
      payment.transactionId = verified.transactionId;
      payment.verifiedAt = new Date();
      payment.metadata = { ...payment.metadata, ...verified.metadata };
      await payment.save({ session });

      logger.info(`[Payment] Payment verified and marked PAID: ${paymentId}`);

      // Update booking status
      const booking = await Booking.findByIdAndUpdate(
        payment.booking,
        {
          paymentStatus: 'paid',
          paidAmount: payment.totalAmount,
        },
        { session, new: true }
      );

      // Update property metadata (increment successful bookings)
      await Property.findByIdAndUpdate(
        payment.property,
        { $inc: { successfulBookings: 1 } },
        { session }
      );

      if (session) await session.commitTransaction();

      // Emit event for workers/webhooks (e.g., send confirmation email)
      logger.info(`[Payment] Transaction complete. Booking ${booking._id} marked as PAID`);

      return {
        success: true,
        payment,
        booking,
      };
    } catch (err) {
      if (session) await session.abortTransaction();
      logger.error('[Payment] verifyPayment error:', err);
      throw err;
    } finally {
      if (session) session.endSession();
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId, userId = null) {
    try {
      const query = { _id: paymentId };
      if (userId) {
        query.user = userId; // User can only see their own payments
      }

      const payment = await Payment.findOne(query)
        .populate('user', 'name email')
        .populate('property', 'title price') // BUG-15 FIX (Extra-D): Property model uses `title`, not `name`
        .populate('booking', '_id amount');

      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      return {
        paymentId: payment._id,
        status: payment.status,
        totalAmount: payment.totalAmount,
        netAmount: payment.netAmount,
        platformFee: payment.platformFee,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        expiresAt: payment.expiresAt,
        verifiedAt: payment.verifiedAt,
        createdAt: payment.createdAt,
        property: payment.property,
        booking: payment.booking,
      };
    } catch (err) {
      logger.error('[Payment] getPaymentStatus error:', err);
      throw err;
    }
  }

  /**
   * List user payments (transaction history)
   */
  async listPayments(userId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      const payments = await Payment.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('property', 'name price')
        .populate('booking', '_id');

      const total = await Payment.countDocuments({ user: userId });

      return {
        payments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error('[Payment] listPayments error:', err);
      throw err;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId, reason = '', adminId = null) {
    try {
      logger.info(`[Payment] Refund request: ${paymentId}, reason: ${reason}`);

      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      if (payment.status !== 'paid') {
        throw new Error('Can only refund paid payments');
      }

      // Get provider
      const provider = ProviderFactory.getProvider(payment.paymentMethod);

      // Call provider refund (not all providers support it)
      if (provider.refund) {
        const refundResult = await provider.refund(payment.transactionId);
        payment.refundTransactionId = refundResult.transactionId;
      }

      // Mark as refunded
      payment.status = 'refunded';
      payment.refundReason = reason;
      payment.refundedAt = new Date();
      await payment.save();

      // Update booking
      await Booking.findByIdAndUpdate(payment.booking, {
        paymentStatus: 'refunded',
      });

      logger.info(`[Payment] Refund completed: ${paymentId}, amount: ${payment.totalAmount}`);

      return payment;
    } catch (err) {
      logger.error('[Payment] refundPayment error:', err);
      throw err;
    }
  }
  /**
   * PHASE 3: Initiate Promotion Payment
   * 
   * Monetization for:
   * - Featured Listing ($49.99 / EGP 1500)
   * - Boost Listing ($24.99 / EGP 750)
   * - Premium Badge ($14.99 / EGP 400)
   */
  async initiatePromotion(propertyId, type, paymentMethod, userId) {
    try {
      logger.info(`[Payment] Initiating promotion ${type} for property ${propertyId}`);

      const Property = require('../models/property.model');
      const property = await Property.findById(propertyId);
      if (!property) throw new Error('Property not found');

      // Define pricing
      const prices = {
        featured: { USD: 49.99, EGP: 1500 },
        boost:    { USD: 24.99, EGP: 750  },
        badge:    { USD: 14.99, EGP: 400  },
      };

      const promotionPrice = prices[type];
      if (!promotionPrice) throw new Error('Invalid promotion type');

      // Determine currency based on provider
      const currency = paymentMethod === 'paymob' ? 'EGP' : 'USD';
      const amount = promotionPrice[currency];

      // Service fee (5%) added to promotion price as well
      const serviceFee = this.calculatePlatformFee(amount);
      const totalAmount = amount + serviceFee;

      const PromotionTransaction = require('../models/promotionTransaction.model');
      const transaction = new PromotionTransaction({
        user: userId,
        property: propertyId,
        type,
        amount,
        currency,
        provider: paymentMethod,
        status: 'pending',
        metadata: { serviceFee, totalAmount }
      });

      await transaction.save();

      // Route to provider using unified helper
      let providerResult;
      try {
        providerResult = await this.createProviderPayment(paymentMethod, {
          amount: totalAmount,
          paymentId: transaction._id.toString(),
          userId,
          propertyId,
          propertyName: `Promotion: ${type} - ${getPropertyTitleString(property.title)}`,
          currency,
        });
      } catch (providerErr) {
        transaction.status = 'failed';
        await transaction.save();
        throw providerErr;
      }

      transaction.transactionId = providerResult.paymentKey;
      await transaction.save();

      return {
        paymentId: transaction._id,
        paymentUrl: providerResult.paymentUrl || providerResult.iframeKey || null,
        totalAmount,
        currency
      };
    } catch (err) {
      logger.error('[Payment] initiatePromotion error:', err);
      throw err;
    }
  }

  /**
   * Capture and execute approved PayPal payment order
   */
  async capturePaypalOrder(bookingId, token, payerId, userId) {
    try {
      logger.info(`[PaymentService] capturePaypalOrder for booking: ${bookingId}, token: ${token}`);

      // 1. Find the pending payment record for this booking & user
      const payment = await Payment.findOne({
        booking: bookingId,
        user: userId,
        paymentMethod: 'paypal',
        status: 'pending',
      });

      if (!payment) {
        // If it's already paid, return success (idempotent)
        const alreadyPaid = await Payment.findOne({
          booking: bookingId,
          user: userId,
          paymentMethod: 'paypal',
          status: 'paid',
        });
        if (alreadyPaid) {
          logger.info(`[PaymentService] PayPal order already captured previously: ${token}`);
          return { success: true, payment: alreadyPaid };
        }
        throw new Error('Pending PayPal payment record not found for this booking');
      }

      // If the client PayerID is provided, store it in metadata
      if (payerId) {
        payment.metadata = { ...payment.metadata, payerId };
        await payment.save();
      }

      // 2. Call verifyPayment. It retrieves order details, captures order, 
      // and atomically marks both payment and booking as PAID in a transaction.
      const result = await this.verifyPayment(payment._id);
      return result;
    } catch (err) {
      logger.error('[PaymentService] capturePaypalOrder error:', err);
      throw err;
    }
  }
}

module.exports = new PaymentService();
