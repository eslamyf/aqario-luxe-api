const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bid/bid.controller');
const { protect } = require('../middlewares/auth.middleware');

router.post('/', protect, bidController.placeBid);

module.exports = router;
