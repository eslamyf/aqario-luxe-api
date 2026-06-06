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
      participants: { $all: [req.user.id, participantId] },
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
    const chats = await Chat.find({
      participants: req.user.id,
    })
      .populate('participants', 'name email photo role')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email photo' }
      })
      .sort({ updatedAt: -1 });

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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
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
