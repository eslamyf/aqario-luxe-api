const Bid = require('../../models/bid.model');
const Auction = require('../../models/auction.model');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Place a bid on an auction
 */
exports.placeBid = asyncHandler(async (req, res) => {
  const { auctionId, amount } = req.body;

  if (!auctionId || !amount) {
    return res.status(400).json({
      status: 'fail',
      message: 'Auction ID and bid amount are required.',
    });
  }

  const auction = await Auction.findById(auctionId);
  if (!auction) {
    return res.status(404).json({
      status: 'fail',
      message: 'Auction not found.',
    });
  }

  // Check if auction is active
  if (auction.status !== 'active') {
    return res.status(400).json({
      status: 'fail',
      message: 'Bids can only be placed on active auctions.',
    });
  }

  // Validate bid amount
  const currentHighest = auction.currentBid || auction.startingPrice;
  if (amount <= currentHighest) {
    return res.status(400).json({
      status: 'fail',
      message: 'Bid amount must be higher than the current bid.',
    });
  }

  // Create bid
  const bid = await Bid.create({
    auction: auctionId,
    bidder: req.user._id,
    amount,
  });

  // Update auction's current bid
  auction.currentBid = amount;
  await auction.save();

  res.status(201).json({
    status: 'success',
    data: {
      bid,
    },
  });
});
