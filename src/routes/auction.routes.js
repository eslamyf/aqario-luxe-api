const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auction/auction.controller');
const { protect } = require('../middlewares/auth.middleware');

router.post('/', protect, auctionController.createAuction);
router.get('/', auctionController.listAuctions);
router.get('/:id', auctionController.getAuctionById);

module.exports = router;
