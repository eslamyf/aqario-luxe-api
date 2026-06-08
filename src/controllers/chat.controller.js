const Chat = require('../models/chat.model');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');

// Initiate a chat between logged-in user and another participant
exports.initiateChat = async (req, res, next) => {
  try {
    const { participantId } = req.body;
    if (!participantId) return next(new AppError('Participant ID is required', 400));
    if (participantId === req.user.id) return next(new AppError('You cannot initiate a chat with yourself', 400));

    // Check if user exists
    const userExists = await User.findById(participantId);
    if (!userExists) return next(new AppError('Participant not found', 404));

    // Check if chat already exists
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, participantId], $size: 2 },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, participantId],
      });
    }

    await chat.populate('participants', 'name email photo role');

    res.status(200).json({
      status: 'success',
      data: { chat },
    });
  } catch (err) {
    next(err);
  }
};

// Get all chats of the active user
exports.getUserChats = async (req, res, next) => {
  try {
    const Inquiry = require('../models/inquiry.model');
    const Message = require('../models/message.model');

    // 1. Scan for resolved inquiries containing replies that lack a corresponding Chat room
    const inquiries = await Inquiry.find({
      $or: [{ sender: req.user.id }, { receiver: req.user.id }],
      replies: { $exists: true, $not: { $size: 0 } }
    });

    for (const inq of inquiries) {
      let chat = await Chat.findOne({
        participants: { $all: [inq.sender, inq.receiver], $size: 2 }
      });
      if (!chat) {
        chat = await Chat.create({
          participants: [inq.sender, inq.receiver],
          inquiryId: inq._id
        });
        
        let lastMsgId = null;
        for (const reply of inq.replies) {
          const msg = await Message.create({
            chatId: chat._id,
            sender: reply.from,
            text: reply.message,
            messageType: 'text',
            createdAt: reply.createdAt
          });
          lastMsgId = msg._id;
        }
        
        if (lastMsgId) {
          chat.lastMessage = lastMsgId;
          await chat.save();
        }
      }
    }

    // 2. Fetch all chats of the active user and merge duplicates on-the-fly
    const rawChats = await Chat.find({
      participants: req.user.id,
    })
      .populate('participants', 'name email photo role')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email photo' }
      })
      .sort({ updatedAt: -1 });

    const chats = [];
    const seenPairs = new Set();
    const logger = require('../utils/logger');

    for (const chat of rawChats) {
      if (!chat.participants || chat.participants.length !== 2) {
        chats.push(chat);
        continue;
      }
      const p1 = chat.participants[0]._id.toString();
      const p2 = chat.participants[1]._id.toString();
      const pairKey = [p1, p2].sort().join('-');

      if (seenPairs.has(pairKey)) {
        // Duplicate chat room found. Merge messages into primary chat
        const primaryChat = chats.find(c => {
          const cp1 = c.participants[0]._id.toString();
          const cp2 = c.participants[1]._id.toString();
          return [cp1, cp2].sort().join('-') === pairKey;
        });

        if (primaryChat) {
          try {
            await Message.updateMany({ chatId: chat._id }, { chatId: primaryChat._id });
            await Chat.findByIdAndDelete(chat._id);
            logger.info(`[Chat Deduplication] Merged duplicate chat ${chat._id} into primary chat ${primaryChat._id}`);

            // Re-resolve the last message of the primary chat
            const latestMsg = await Message.findOne({ chatId: primaryChat._id }).sort({ createdAt: -1 });
            if (latestMsg) {
              primaryChat.lastMessage = latestMsg._id;
              await primaryChat.save();
            }
          } catch (mergeErr) {
            logger.error(`[Chat Deduplication] Error merging chat ${chat._id}:`, mergeErr);
          }
        }
      } else {
        seenPairs.add(pairKey);
        chats.push(chat);
      }
    }

    res.status(200).json({
      status: 'success',
      results: chats.length,
      data: { chats },
    });
  } catch (err) {
    next(err);
  }
};

// Get messages for a chat
exports.getChatMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    let queryPage = req.query.page;
    if (Array.isArray(queryPage)) queryPage = queryPage[0];
    let queryLimit = req.query.limit;
    if (Array.isArray(queryLimit)) queryLimit = queryLimit[0];

    const page = Math.max(1, parseInt(queryPage, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(queryLimit, 10) || 50));
    const skip = (page - 1) * limit;

    // Check if chat exists and user is a participant
    const chat = await Chat.findById(chatId);
    if (!chat) return next(new AppError('Chat not found', 404));
    if (!chat.participants.includes(req.user.id)) {
      return next(new AppError('You are not authorized to view messages in this chat', 403));
    }

    const messages = await Message.find({ chatId })
      .populate('sender', 'name email photo')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      results: messages.length,
      data: { messages },
    });
  } catch (err) {
    next(err);
  }
};

// Upload attachment endpoint
exports.uploadAttachment = async (req, res, next) => {
  try {
    if (!req.body.fileUrl) {
      return next(new AppError('File upload failed', 400));
    }
    res.status(200).json({
      status: 'success',
      data: {
        secure_url: req.body.fileUrl,
        fileName: req.body.fileName,
        fileType: req.body.fileType
      }
    });
  } catch (err) {
    next(err);
  }
};
