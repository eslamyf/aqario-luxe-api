const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const User       = require('../models/user.model');
const { cacheGet, cacheSet } = require('./redis');
const logger     = require('../utils/logger');

let _io = null;

module.exports = (httpServer) => {
  _io = new Server(httpServer, {
    cors: {
      origin:  process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── JWT auth on each connection with Redis caching for performance ────────────────────────────
  _io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: No token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      
      // FIX — Use Redis cache to check isBanned status (TTL: 10 seconds)
      const cacheKey = `banned:${decoded.id}`;
      let cachedStatus = await cacheGet(cacheKey);
      
      if (cachedStatus !== null) {
        // Use cached status
        if (cachedStatus === '1') {
          return next(new Error('Authentication error: Account is banned or inactive'));
        }
      } else {
        // Check database if not in cache
        const user = await User.findById(decoded.id).select('isBanned isActive');
        if (!user || user.isBanned || !user.isActive) {
          // Cache banned status for 10 seconds
          await cacheSet(cacheKey, '1', 10);
          return next(new Error('Authentication error: Account is banned or inactive'));
        }
        // Cache active status for 10 seconds
        await cacheSet(cacheKey, '0', 10);
      }
      
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  _io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id} — user: ${socket.user?.id}`);

    // Join user room (for personal notifications)
    if (socket.user?.id) {
      socket.join(`user_${socket.user.id}`);
    }

    // Join/leave auction rooms
    socket.on('joinAuction', async (auctionId) => {
      try {
        const Auction = require('../models/auction.model');
        const auction = await Auction.findById(auctionId);
        if (!auction) {
          return socket.emit('error', { message: 'Auction not found' });
        }
        socket.join(`auction_${auctionId}`);
        socket.emit('auctionJoined', {
          auctionId,
          currentBid: auction.currentBid || auction.startingPrice,
          startingPrice: auction.startingPrice,
          status: auction.status,
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('leaveAuction', (auctionId) => {
      socket.leave(`auction_${auctionId}`);
    });

    // Join/leave chat rooms
    socket.on('joinChat', (chatId) => {
      socket.join(`chat_${chatId}`);
      logger.info(`🗣️ User joined chat room: chat_${chatId}`);
    });

    socket.on('leaveChat', (chatId) => {
      socket.leave(`chat_${chatId}`);
      logger.info(`🗣️ User left chat room: chat_${chatId}`);
    });

    socket.on('sendMessage', async (payload) => {
      try {
        const { chatId, text, messageType, fileUrl } = payload;
        const Message = require('../models/message.model');
        const Chat = require('../models/chat.model');
        
        const message = await Message.create({
          chatId,
          sender: socket.user.id,
          text: text || '',
          messageType: messageType || 'text',
          fileUrl: fileUrl || null
        });

        // Update Chat lastMessage
        await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

        // Populate sender info
        await message.populate('sender', 'name email photo');

        // Emit to room
        _io.to(`chat_${chatId}`).emit('newMessage', message);
        
        // Also notify user room for offline/background users
        const chat = await Chat.findById(chatId);
        if (chat && chat.participants) {
          chat.participants.forEach(pId => {
            if (pId.toString() !== socket.user.id.toString()) {
              _io.to(`user_${pId}`).emit('chatNotification', {
                chatId,
                message: message.text || `Sent an attachment`,
                sender: message.sender
              });
            }
          });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── disconnect ───────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info(`❌ Socket disconnected: ${socket.id} — reason: ${reason}`);
    });
  });

  logger.info('🔌 Socket.IO initialized');
  return _io;
};

module.exports.getIO = () => {
  if (!_io) throw new Error('Socket.IO has not been initialized');
  return _io;
};

module.exports.emitNewBid = (auctionId, bid) => {
  if (!_io) return;
  _io.to(`auction_${auctionId}`).emit('newBid', {
    auctionId,
    currentBid: bid.amount,
    bid,
  });
};


