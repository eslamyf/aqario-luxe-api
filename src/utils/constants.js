/**
 * APPLICATION CONSTANTS
 * 
 * Single source of truth for enum values used throughout the application.
 * Prevents bugs caused by hardcoded strings that don't match model enums.
 * 
 * Usage: const { PAYMENT_STATUS } = require('../utils/constants');
 *        { $match: { status: PAYMENT_STATUS.PAID } }
 */

/**
 * PAYMENT STATUS CONSTANTS
 * Must match Payment model enum: ['pending', 'paid', 'refunded', 'failed']
 * 
 * Benefits:
 * - IDE autocomplete for status values
 * - Compile-time type checking
 * - Single point to update if status values change
 * - Prevents silent failures from enum mismatches
 */
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Basic',
    price: 300,
    currency: 'EGP',
    maxListings: 3,
    durationDays: 30,
    features: ['Up to 3 active listings', 'Standard support'],
  },
  pro: {
    name: 'Pro',
    price: 1200,
    currency: 'EGP',
    maxListings: 10,
    durationDays: 30,
    features: ['Up to 10 active listings', 'Priority support', 'Featured listing (1)'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 5000,
    currency: 'EGP',
    maxListings: -1, // unlimited
    durationDays: 30,
    features: ['Unlimited listings', 'Account manager', 'Featured listings (5)', 'Bulk upload'],
  },
};

module.exports = {
  PAYMENT_STATUS: Object.freeze(PAYMENT_STATUS),
  SUBSCRIPTION_STATUS: Object.freeze(SUBSCRIPTION_STATUS),
  SUBSCRIPTION_PLANS: Object.freeze(SUBSCRIPTION_PLANS),
};
