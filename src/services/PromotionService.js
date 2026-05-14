const Property = require('../models/property.model');
const PromotionTransaction = require('../models/promotionTransaction.model');
const logger = require('../utils/logger');
const { getIO } = require('../config/socket');

class PromotionService {
  /**
   * Activate promotion after successful payment
   */
  async activatePromotion(transactionId) {
    try {
      const transaction = await PromotionTransaction.findById(transactionId);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.status === 'paid') return; // Already active

      const property = await Property.findById(transaction.property);
      if (!property) throw new Error('Property not found');

      const now = new Date();
      let durationDays = 0;
      let scoreIncrease = 0;

      switch (transaction.type) {
        case 'featured':
          durationDays = 30;
          scoreIncrease = 1000;
          property.promotion.isFeatured = true;
          property.promotion.featuredUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
          break;
        case 'boost':
          durationDays = 7;
          scoreIncrease = 500;
          property.promotion.isBoosted = true;
          property.promotion.boostedUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
          break;
        case 'badge':
          scoreIncrease = 100;
          property.promotion.hasPremiumBadge = true;
          break;
      }

      property.promotionScore += scoreIncrease;
      await property.save();

      transaction.status = 'paid';
      transaction.paidAt = now;
      transaction.expiresAt = durationDays > 0 ? property.promotion[transaction.type + 'Until'] : null;
      await transaction.save();

      logger.info(`[Promotion] Activated ${transaction.type} for property ${property._id}`);

      // Emit real-time notification
      const io = getIO();
      io.to(`user_${transaction.user}`).emit('notification', {
        type: 'PROMOTION_ACTIVATED',
        message: `Your ${transaction.type} promotion for "${property.title}" is now active!`,
        propertyId: property._id,
      });

      return property;
    } catch (err) {
      logger.error('[PromotionService] activatePromotion error:', err);
      throw err;
    }
  }

  /**
   * Deactivate expired promotions (Cron job would call this)
   */
  async cleanupExpiredPromotions() {
    const now = new Date();
    
    // Find properties with expired featured/boost
    const expiredFeatured = await Property.find({
      'promotion.isFeatured': true,
      'promotion.featuredUntil': { $lt: now }
    });

    for (const property of expiredFeatured) {
      property.promotion.isFeatured = false;
      property.promotionScore -= 1000;
      await property.save();
      logger.info(`[Promotion] Deactivated featured for ${property._id}`);
    }

    const expiredBoosted = await Property.find({
      'promotion.isBoosted': true,
      'promotion.boostedUntil': { $lt: now }
    });

    for (const property of expiredBoosted) {
      property.promotion.isBoosted = false;
      property.promotionScore -= 500;
      await property.save();
      logger.info(`[Promotion] Deactivated boost for ${property._id}`);
    }
  }
}

module.exports = new PromotionService();
