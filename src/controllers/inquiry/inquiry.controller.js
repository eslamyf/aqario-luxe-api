const Inquiry  = require('../../models/inquiry.model');
const Property = require('../../models/property.model');
const Chat     = require('../../models/chat.model');
const Message  = require('../../models/message.model');
const { createNotification } = require('../../utils/notificationHelper');

exports.sendInquiry = async (req, res, next) => {
  try {
    const { propertyId, message } = req.body;

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ status: 'fail', message: req.t('PROPERTY.NOT_FOUND') });
    if (property.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ status: 'fail', message: req.t('INQUIRY.OWN_PROPERTY') });
    }

    const inquiry = await Inquiry.create({
      sender:   req.user._id,
      receiver: property.owner,
      property: propertyId,
      content:  message,
    });

    await inquiry.populate([
      { path: 'sender',   select: 'name email photo' },
      { path: 'property', select: 'title price location' },
    ]);

    // Notify property owner
    await createNotification(req.io, property.owner, {
      type:    'inquiry',
      title:   req.t('NOTIFICATION.NEW_INQUIRY'),
      message: req.t('NOTIFICATION.NEW_INQUIRY_MSG', { name: req.user.name, property: property.title }),
      link:    `/inquiries/${inquiry._id}`,
    }).catch(() => {});

    res.status(201).json({ status: 'success', message: req.t('INQUIRY.SENT'), data: { inquiry } });
  } catch (err) {
    next(err);
  }
};

exports.getInquiriesByProperty = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    if (!property) return res.status(404).json({ status: 'fail', message: req.t('PROPERTY.NOT_FOUND') });
    if (property.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }
    const inquiries = await Inquiry.find({ property: req.params.propertyId })
      .populate('sender', 'name email photo').sort('-createdAt');
    res.status(200).json({ status: 'success', results: inquiries.length, data: { inquiries } });
  } catch (err) {
    next(err);
  }
};

exports.getMyInbox = async (req, res, next) => {
  try {
    const inquiries = await Inquiry.find({ receiver: req.user._id })
      .populate('sender',   'name email photo')
      .populate('property', 'title price location images').sort('-createdAt');
    res.status(200).json({ status: 'success', results: inquiries.length, data: { inquiries } });
  } catch (err) {
    next(err);
  }
};

exports.getMySentInquiries = async (req, res, next) => {
  try {
    const inquiries = await Inquiry.find({ sender: req.user._id })
      .populate('receiver', 'name email')
      .populate('property', 'title price location images').sort('-createdAt');
    res.status(200).json({ status: 'success', results: inquiries.length, data: { inquiries } });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id).lean();
    if (!inquiry) return res.status(404).json({ status: 'fail', message: req.t('INQUIRY.NOT_FOUND') });
    if (inquiry.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }
    inquiry.isRead = true;
    await inquiry.save();
    res.status(200).json({ status: 'success', message: req.t('INQUIRY.MARKED_READ'), data: { inquiry } });
  } catch (err) {
    next(err);
  }
};

// FIX — Add reply mechanism
exports.replyToInquiry = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ status: 'fail', message: req.t('INQUIRY.MESSAGE_REQUIRED') });

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ status: 'fail', message: req.t('INQUIRY.NOT_FOUND') });
    if (inquiry.receiver.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }

    inquiry.replies = inquiry.replies || [];
    inquiry.replies.push({ from: req.user._id, message, createdAt: new Date() });
    inquiry.isRead = true;
    await inquiry.save();

    // Find or atomically initialize a verified Chat room document mapping the participants
    let chat = await Chat.findOne({
      participants: { $all: [inquiry.sender, inquiry.receiver], $size: 2 }
    });
    if (!chat) {
      chat = await Chat.create({
        participants: [inquiry.sender, inquiry.receiver],
        inquiryId: inquiry._id,
      });
    }

    // Create message document representing this reply
    const savedMessage = await Message.create({
      chatId: chat._id,
      sender: req.user._id,
      text: message,
      messageType: 'text',
    });

    // Populate sender info for frontend live rendering
    await savedMessage.populate('sender', 'name email photo');

    // Update Chat lastMessage
    chat.lastMessage = savedMessage._id;
    await chat.save();

    // Emit the saved message instantly to the room channel
    if (req.io) {
      req.io.to(`chat_${chat._id}`).emit('newMessage', savedMessage);
    }

    // Notify sender with populated metadata and targetUrl
    await createNotification(req.io, inquiry.sender, {
      type:    'inquiry',
      title:   req.t('NOTIFICATION.INQUIRY_REPLY'),
      message: req.t('NOTIFICATION.INQUIRY_REPLY_MSG'),
      link:    `/dashboard/chat/${chat._id}`,
      targetUrl: `/dashboard/chat/${chat._id}`,
      metadata: {
        type: 'inquiry',
        referenceId: inquiry._id.toString(),
        chatId: chat._id.toString()
      }
    }).catch(() => {});

    res.status(200).json({ status: 'success', message: req.t('INQUIRY.REPLY_SENT'), data: { inquiry } });
  } catch (err) {
    next(err);
  }
};

exports.deleteInquiry = async (req, res, next) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ status: 'fail', message: req.t('INQUIRY.NOT_FOUND') });
    if (inquiry.sender.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }
    await inquiry.deleteOne();
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerInquiries = async (req, res, next) => {
  try {
    const inquiries = await Inquiry.find({ receiver: req.user._id })
      .populate('sender', 'name email photo phone')
      .populate('property', 'title price location images')
      .sort('-createdAt');
    res.status(200).json({ status: 'success', results: inquiries.length, data: { inquiries } });
  } catch (err) {
    next(err);
  }
};
