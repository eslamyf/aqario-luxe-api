const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { protect } = require('../middlewares/auth.middleware');
const { uploadChatAttachment } = require('../middlewares/upload.middleware');

router.use(protect);

router.post('/', chatController.initiateChat);
router.get('/', chatController.getUserChats);
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/upload', uploadChatAttachment, chatController.uploadAttachment);

module.exports = router;
