// Stripe provider removed as Stripe integration is deprecated.
module.exports = class StripeProvider {
  constructor() {
    throw new Error('Stripe integration has been deprecated and removed.');
  }
};
