const paymentService = require('../services/PaymentService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────
// Payment Controller
// ─────────────────────────────────────────────────────────────────
// Handles payment endpoints, validates input, delegates to service
// ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payments/checkout
 * Initiate payment after booking is approved
 * 
 * Body:
 * {
 *   bookingId: ObjectId,
 *   paymentMethod: 'paymob' | 'paypal' | 'bank_transfer' | 'cash'
 * }
 */
exports.initiatePayment = async (req, res, next) => {
  try {
    const { bookingId, paymentMethod } = req.body;

    // Validate input
    if (!bookingId) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.BOOKING_ID_REQUIRED'),
      });
    }

    const validMethods = ['cash', 'bank_transfer', 'paypal', 'paymob'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.INVALID_METHOD', { methods: validMethods.join(', ') }),
      });
    }

    const backendUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : `${req.protocol}://${req.get('host')}`;

    // Call service
    const result = await paymentService.initiatePayment(
      bookingId,
      paymentMethod,
      req.user._id,
      req.ip,
      req.headers['user-agent'],
      backendUrl
    );

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.INITIATED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments/:id
 * Get payment status
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentStatus(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments
 * List user payment history
 */
exports.listPayments = async (req, res, next) => {
  try {
    let queryPage = req.query.page;
    if (Array.isArray(queryPage)) queryPage = queryPage[0];
    let queryLimit = req.query.limit;
    if (Array.isArray(queryLimit)) queryLimit = queryLimit[0];

    const page = Math.max(1, parseInt(queryPage, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(queryLimit, 10) || 10));

    const result = await paymentService.listPayments(req.user._id, page, limit);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/:id/refund
 * Refund payment (admin only)
 */
exports.refundPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const result = await paymentService.refundPayment(req.params.id, reason, req.user._id);

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.REFUNDED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/verify
 * Verify payment via provider (polling)
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.PAYMENT_ID_REQUIRED'),
      });
    }

    const result = await paymentService.verifyPayment(paymentId);

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.VERIFIED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments/verify/:bookingId
 * BUG-07 FIX: Poll payment status by bookingId — used by payment-success.component.ts
 * The Angular frontend polls this endpoint after redirect from Paymob to confirm payment.
 * Without this endpoint, users were stuck on "Confirming Payment..." indefinitely (404 loop).
 */
exports.verifyByBooking = async (req, res, next) => {
  try {
    const Payment = require('../models/payment.model');

    const payment = await Payment.findOne({
      booking: req.params.bookingId,
      user:    req.user._id,
    }).sort({ createdAt: -1 }); // Get the most recent payment for this booking

    if (!payment) {
      return res.status(404).json({
        status:  'fail',
        message: req.t('PAYMENT.NOT_FOUND'),
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        paid:          payment.status === 'paid',
        paymentStatus: payment.status,
        verified:      payment.isVerified,
        transactionId: payment.transactionId || null,
        provider:      payment.provider || payment.paymentMethod,
        expiresAt:     payment.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/promotion
 * Initiate payment for property promotion
 */
exports.initiatePromotion = async (req, res, next) => {
  try {
    const { propertyId, type, paymentMethod } = req.body;

    if (!propertyId || !type || !paymentMethod) {
      return res.status(400).json({
        status: 'fail',
        message: 'propertyId, type, and paymentMethod are required',
      });
    }

    const backendUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : `${req.protocol}://${req.get('host')}`;

    const result = await paymentService.initiatePromotion(
      propertyId,
      type,
      paymentMethod,
      req.user._id,
      backendUrl
    );

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

exports.capturePaypalOrder = async (req, res, next) => {
  try {
    // 1. Robust Request Body Parsing & Parameter Validation
    const { bookingId, token, payerId } = req.body;

    if (!bookingId || !token || !payerId) {
      return res.status(400).json({
        status: 'fail',
        message: 'bookingId, token, and payerId are required',
      });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    const baseUrl = mode === 'live' || mode === 'production'
      ? 'https://api.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        status: 'error',
        message: 'PayPal credentials are not configured in environment variables.',
      });
    }

    // 2. Generate PayPal Access Token Dynamically
    let access_token;
    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: 'grant_type=client_credentials',
      });

      if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({}));
        logger.error('[PayPal Capture] Failed to retrieve access token:', errorData);
        return res.status(tokenRes.status).json({
          status: 'fail',
          message: 'Failed to generate PayPal access token',
          error: errorData,
        });
      }

      const tokenData = await tokenRes.json();
      access_token = tokenData.access_token;
    } catch (tokenErr) {
      logger.error('[PayPal Capture] Token generation network error:', tokenErr);
      return res.status(500).json({
        status: 'error',
        message: 'Network error generating PayPal access token',
        error: tokenErr.message,
      });
    }

    // 3. Execute the PayPal v2 Orders Capture Call
    let captureData;
    try {
      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${token}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({}),
      });

      captureData = await captureRes.json().catch(() => ({}));

      if (!captureRes.ok) {
        const isComplianceViolation =
          process.env.NODE_ENV !== 'production' &&
          captureRes.status === 422 &&
          Array.isArray(captureData.details) &&
          captureData.details.some(d => d.issue === 'COMPLIANCE_VIOLATION');

        if (isComplianceViolation) {
          logger.warn('[PayPal Capture] COMPLIANCE_VIOLATION detected in sandbox environment. Proceeding with mock capture success.');
          captureData = {
            status: 'COMPLETED',
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: `mock-capture-${token}`,
                    }
                  ]
                }
              }
            ]
          };
        } else {
          // 4. Defensive Error Handling & Response Mapping
          logger.error('[PayPal Capture] Capture order error response:', captureData);
          return res.status(captureRes.status).json({
            status: 'fail',
            message: captureData.message || 'PayPal capture failed',
            error: captureData,
          });
        }
      }
    } catch (captureErr) {
      logger.error('[PayPal Capture] Orders capture network error:', captureErr);
      return res.status(500).json({
        status: 'error',
        message: 'Network error executing PayPal capture call',
        error: captureErr.message,
      });
    }

    // 4. Update Database upon successful capture within a transaction session
    if (captureData.status === 'COMPLETED' || captureData.status === 'APPROVED') {
      const Payment = require('../models/payment.model');
      const Booking = require('../models/booking.model');
      const Property = require('../models/property.model');
      const User = require('../models/user.model');
      const Transaction = require('../models/transaction.model');
      const mongoose = require('mongoose');

      const useTransaction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';
      const session = useTransaction ? await mongoose.startSession() : null;
      if (session) session.startTransaction();

      try {
        const payment = await Payment.findOne({
          booking: bookingId,
          user: req.user._id,
          paymentMethod: 'paypal',
        }).session(session);

        if (!payment) {
          if (session) await session.abortTransaction();
          return res.status(404).json({
            status: 'fail',
            message: 'Matching payment record not found in database',
          });
        }

        // Update payment record
        payment.isVerified = true;
        payment.status = 'paid'; // matches Payment model schema validation
        payment.transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || token;
        payment.verifiedAt = new Date();
        payment.metadata = { ...payment.metadata, payerId, captureData };
        await payment.save({ session });

        // Update booking status (and advance status to completed)
        const booking = await Booking.findByIdAndUpdate(bookingId, {
          paymentStatus: 'paid', // matches Booking model schema validation
          paidAmount: payment.totalAmount,
          status: 'completed',
        }, { session, new: true });

        // ── Deduplicate Booking & Payments for same User/Property pair ──
        if (booking) {
          const duplicateBookings = await Booking.find({
            user_id: booking.user_id,
            property_id: booking.property_id,
            _id: { $ne: booking._id },
            status: { $in: ['pending', 'approved'] }
          }).session(session);

          if (duplicateBookings.length > 0) {
            const duplicateBookingIds = duplicateBookings.map(b => b._id);
            await Booking.deleteMany(
              { _id: { $in: duplicateBookingIds } },
              { session }
            );
            await Payment.deleteMany(
              { booking: { $in: duplicateBookingIds }, status: 'pending' },
              { session }
            );
            logger.info(`[Deduplication - PayPal Capture] Purged ${duplicateBookingIds.length} duplicate bookings and their pending payments.`);
          }
        }

        // Update property statistics
        const propertyDoc = await Property.findByIdAndUpdate(payment.property, {
          $inc: { successfulBookings: 1 },
        }, { session, new: true });

        // ── Automated Owner Payout Split Logic for PayPal Capture ──
        if (propertyDoc) {
          const ownerId = propertyDoc.owner;
          const netAmount = payment.netAmount;
          const platformFee = payment.platformFee;

          // 1. Update the owner's balance_USD and wallet
          await User.updateOne({ _id: ownerId }, { $inc: { balance_USD: netAmount, wallet: netAmount } }).session(session);
          const updatedUser = await User.findById(ownerId).session(session);

          // Emit real-time event hook
          try {
            const socketIO = require('../config/socket').getIO();
            socketIO.to(`user_${ownerId}`).emit('balanceUpdate', { 
              balance_USD: updatedUser.balance_USD,
              wallet: updatedUser.wallet || 0
            });
          } catch (socketErr) {
            logger.error('[PayPal Capture] Failed to emit socket balance update:', socketErr.message);
          }

          // 2. Create a new transaction record linked to the owner
          await Transaction.create([{
            owner: ownerId,
            property: propertyDoc._id,
            booking: payment.booking,
            payment: payment._id,
            amount: payment.totalAmount,
            commission: platformFee,
            netAmount: netAmount,
            currency: 'USD',
            status: 'completed',
            type: 'booking_income'
          }], { session });

          logger.info(`[Payout Split - PayPal Capture] Credited owner ${ownerId} balance_USD with net revenue: ${netAmount}. Commission of ${platformFee} recorded.`);
        }

        if (session) await session.commitTransaction();

        logger.info(`[PayPal Capture] Booking ${bookingId} successfully captured & marked completed.`);

        return res.status(200).json({
          status: 'success',
          message: 'PayPal payment captured successfully',
          data: {
            paymentStatus: 'paid',
            transactionId: payment.transactionId,
          },
        });
      } catch (err) {
        if (session) await session.abortTransaction();
        throw err;
      } finally {
        if (session) session.endSession();
      }
    } else {
      return res.status(400).json({
        status: 'fail',
        message: `PayPal order has status: ${captureData.status}`,
        data: captureData,
      });
    }
  } catch (err) {
    logger.error('[PayPal Capture] Unexpected controller exception:', err);
    next(err);
  }
};

/**
 * POST /api/v1/payments/payout
 * Request withdrawal of collected balance (owner/agent only)
 */
exports.requestPayout = async (req, res, next) => {
  const Payout = require('../models/payout.model');
  const User = require('../models/user.model');
  const mongoose = require('mongoose');

  const useTransaction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    let { amount, method, accountDetails } = req.body;

    if (method === 'paymob') {
      method = 'paymob_wallet';
    }

    if (!amount || amount <= 0) {
      if (session) await session.abortTransaction();
      if (session) session.endSession();
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid payout amount',
      });
    }

    const validMethods = ['paymob_wallet', 'paypal'];
    if (!validMethods.includes(method)) {
      if (session) await session.abortTransaction();
      if (session) session.endSession();
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid payout method',
      });
    }

    if (!accountDetails) {
      if (session) await session.abortTransaction();
      if (session) session.endSession();
      return res.status(400).json({
        status: 'fail',
        message: 'Account details are required',
      });
    }

    // 1. Atomic Deductions Lock: instantly validate and deduct balance_USD and wallet
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.id || req.user._id, balance_USD: { $gte: amount } },
      { $inc: { balance_USD: -amount, wallet: -amount } },
      { new: true, session }
    );

    if (!updatedUser) {
      if (session) await session.abortTransaction();
      if (session) session.endSession();
      return res.status(400).json({
        status: 'fail',
        message: `Insufficient available balance. Required: ${amount} USD.`,
      });
    }

    // 2. Create payout record inside transaction
    const payoutArray = await Payout.create([{
      ownerId: req.user.id || req.user._id,
      amount,
      method,
      accountDetails,
      status: 'pending',
      currency: 'USD',
    }], { session });

    const payout = payoutArray[0];

    // Commit DB lock before performing slow upstream HTTP requests
    if (session) await session.commitTransaction();
    if (session) session.endSession();

    // 2. Direct Gateway Dispatching: outside DB lock
    let gatewaySuccess = false;
    let transactionId = null;
    let errorDetails = null;

    try {
      if (method === 'paypal') {
        const mode = process.env.PAYPAL_MODE || 'sandbox';
        const paypalBaseUrl = mode === 'live' || mode === 'production' ? 'https://api.paypal.com' : 'https://api-m.sandbox.paypal.com';
        const clientId = process.env.PAYPAL_CLIENT_ID;
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          throw new Error('PayPal credentials are not configured in environment variables.');
        }

        // Get Access Token
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
          body: 'grant_type=client_credentials',
        });

        if (!tokenRes.ok) {
          throw new Error(`PayPal oauth token generation failed: HTTP ${tokenRes.status}`);
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        // Call PayPal Payouts
        const payoutRes = await fetch(`${paypalBaseUrl}/v1/payouts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            sender_batch_header: {
              sender_batch_id: `payout-${payout._id}-${Date.now()}`,
              email_subject: "You have received a payout",
              recipient_type: "EMAIL"
            },
            items: [
              {
                recipient_type: "EMAIL",
                amount: {
                  value: String(amount),
                  currency: "USD"
                },
                note: "Instant autonomous withdrawal from Luxe Estates",
                receiver: accountDetails
              }
            ]
          })
        });

        const payoutData = await payoutRes.json();

        if (payoutRes.ok) {
          gatewaySuccess = true;
          transactionId = payoutData.batch_header?.payout_batch_id || `pp-batch-${Date.now()}`;
        } else {
          throw new Error(payoutData.message || JSON.stringify(payoutData));
        }
      } else {
        // Paymob Wallet Cashout
        const paymobApiKey = process.env.PAYMOB_API_KEY;

        if (!paymobApiKey) {
          throw new Error('Paymob credentials are not configured.');
        }

        // Step 1: Get authentication token
        const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: paymobApiKey })
        });

        if (!authRes.ok) {
          throw new Error(`Paymob authentication failed: HTTP ${authRes.status}`);
        }

        const authData = await authRes.json();
        const paymobAuthToken = authData.token;

        // Step 2: Determine issuer
        let issuer = 'vodafone';
        if (accountDetails.startsWith('011')) issuer = 'etisalat';
        else if (accountDetails.startsWith('012')) issuer = 'orange';
        else if (accountDetails.startsWith('015')) issuer = 'we';

        // Step 3: Trigger disburse request
        const paymobDisburseRes = await fetch('https://accept.paymob.com/api/secure/disburse/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${paymobAuthToken}`
          },
          body: JSON.stringify({
            issuer,
            amount: Number(amount),
            msisdn: accountDetails,
            national_id: updatedUser.kycNationality || '29001010101010',
            client_reference_id: `payout-${payout._id}`,
            customer_bears_fees: false
          })
        });

        const disburseData = await paymobDisburseRes.json();

        if (paymobDisburseRes.ok) {
          gatewaySuccess = true;
          transactionId = disburseData.transaction_id || `pm-disb-${Date.now()}`;
        } else {
          throw new Error(disburseData.message || JSON.stringify(disburseData));
        }
      }
    } catch (apiErr) {
      logger.error(`[Payout Gateway Error] ${method} payout failed:`, apiErr.message);
      errorDetails = apiErr.message;
    }

    // 3. Transactional Safeguard: Rollback or Complete
    if (gatewaySuccess) {
      payout.status = 'completed';
      payout.payoutTransactionId = transactionId;
      await payout.save();

      logger.info(`[Payout Success] Payout ${payout._id} of ${amount} USD completed successfully.`);

      return res.status(200).json({
        status: 'success',
        message: 'Payout processed successfully',
        data: { payout },
      });
    } else {
      // Trigger rollback in a new transaction session block
      const rollbackSession = useTransaction ? await mongoose.startSession() : null;
      if (rollbackSession) rollbackSession.startTransaction();

      try {
        await User.updateOne(
          { _id: req.user.id || req.user._id },
          { $inc: { balance_USD: amount, wallet: amount } },
          { session: rollbackSession }
        );

        payout.status = 'failed';
        payout.errorDetails = errorDetails || 'Unknown payout error';
        await payout.save({ session: rollbackSession });

        if (rollbackSession) await rollbackSession.commitTransaction();
        logger.warn(`[Payout Failed - Rollback Success] Payout ${payout._id} failed. Balance refunded inside new session block. Error: ${errorDetails}`);
      } catch (rollbackErr) {
        if (rollbackSession) await rollbackSession.abortTransaction();
        logger.error('[Payout Rollback Error] Failed to execute rollback transaction:', rollbackErr);
      } finally {
        if (rollbackSession) rollbackSession.endSession();
      }

      return res.status(400).json({
        status: 'fail',
        message: `Payout gateway disbursement failed. Refunding balance. Reason: ${errorDetails || 'Gateway error'}`,
        data: { payout },
      });
    }
  } catch (err) {
    if (session) {
      if (session.inTransaction()) await session.abortTransaction();
      session.endSession();
    }
    next(err);
  }
};

/**
 * GET /api/v1/payments/payouts
 * Get active user's payout history
 */
exports.getPayouts = async (req, res, next) => {
  try {
    const Payout = require('../models/payout.model');
    
    let queryPage = req.query.page;
    if (Array.isArray(queryPage)) queryPage = queryPage[0];
    let queryLimit = req.query.limit;
    if (Array.isArray(queryLimit)) queryLimit = queryLimit[0];

    const page = Math.max(1, parseInt(queryPage, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(queryLimit, 10) || 10));
    const skip = (page - 1) * limit;

    const userId = req.user.id || req.user._id;
    const payouts = await Payout.find({ ownerId: userId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      results: payouts.length,
      data: { payouts },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments/admin/payouts
 * List all payouts (admin only)
 */
exports.adminGetPayouts = async (req, res, next) => {
  try {
    const Payout = require('../models/payout.model');
    const payouts = await Payout.find()
      .populate('ownerId', 'name email photo')
      .sort({ created_at: -1 });

    res.status(200).json({
      status: 'success',
      results: payouts.length,
      data: { payouts },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/payments/admin/payouts/:id
 * Approve or reject payout request (admin only)
 */
exports.adminUpdatePayout = async (req, res, next) => {
  const mongoose = require('mongoose');
  const useTransaction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const Payout = require('../models/payout.model');
    const User = require('../models/user.model');
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Status must be either approved or rejected',
      });
    }

    const payout = await Payout.findById(req.params.id).session(session);
    if (!payout) {
      throw new Error('Payout request not found');
    }

    if (payout.status !== 'pending') {
      throw new Error('Payout request is already resolved');
    }

    if (status === 'approved') {
      // Fetch owner balance inside the session
      const owner = await User.findById(payout.ownerId).session(session);
      if (!owner || owner.balance_USD < payout.amount) {
        throw new Error('Owner has insufficient balance to complete this payout');
      }

      // Decrement the balance and wallet
      await User.findByIdAndUpdate(
        payout.ownerId,
        { $inc: { balance_USD: -payout.amount, wallet: -payout.amount } },
        { session }
      );
    }

    payout.status = status;
    await payout.save({ session });

    if (session) await session.commitTransaction();

    logger.info(`[Payout Admin] Payout request ${payout._id} for ${payout.amount} EGP was ${status.toUpperCase()} by admin ${req.user._id}`);

    res.status(200).json({
      status: 'success',
      data: { payout },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

module.exports = exports;
