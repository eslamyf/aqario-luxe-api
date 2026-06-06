const Notification = require('../models/notification.model');
const logger = require('./logger');

/**
 * إنشاء إشعار وإرساله عبر Socket.IO
 * @param {Object} io - Socket.IO instance
 * @param {string} userId - ID المستخدم المستلم
 * @param {Object} data - بيانات الإشعار
 */
const createNotification = async (io, userId, { type, title, message, link = null, meta = {}, targetUrl = null, metadata = null }) => {
  try {
    const finalTargetUrl = targetUrl || link;
    
    let refId = null;
    if (meta && (meta.id || meta.referenceId || meta.bookingId || meta.propertyId)) {
      refId = meta.id || meta.referenceId || meta.bookingId || meta.propertyId;
    } else if (link && typeof link === 'string') {
      const parts = link.split('/');
      const last = parts[parts.length - 1];
      if (last && last.match(/^[0-9a-fA-F]{24}$/)) {
        refId = last;
      }
    }
    
    const finalMetadata = metadata || {
      type: type,
      referenceId: refId ? refId.toString() : null
    };

    const notif = await Notification.create({
      userId,
      type,
      title,
      message,
      link: link || finalTargetUrl,
      meta,
      targetUrl: finalTargetUrl,
      metadata: finalMetadata
    });

    if (io) {
      io.to(`user_${userId}`).emit('notification', {
        _id:       notif._id,
        type,
        title,
        message,
        link:      notif.link,
        targetUrl: notif.targetUrl,
        metadata:  notif.metadata,
        isRead:    false,
        createdAt: notif.createdAt,
      });
    }
    return notif;
  } catch (err) {
    logger.error(`[Notification] Failed to create notification: ${err.message}`);
  }
};

module.exports = { createNotification };
