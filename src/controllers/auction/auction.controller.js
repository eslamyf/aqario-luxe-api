const Auction = require('../../models/auction.model');
const Property = require('../../models/property.model');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Create an auction for a property
 */
exports.createAuction = asyncHandler(async (req, res) => {
  const { property, startingPrice, bidIncrement, startDate, endDate } = req.body;

  if (!property || !startingPrice || !bidIncrement || !startDate || !endDate) {
    return res.status(400).json({
      status: 'fail',
      message: 'All fields (property, startingPrice, bidIncrement, startDate, endDate) are required.',
    });
  }

  const prop = await Property.findById(property);
  if (!prop) {
    return res.status(404).json({
      status: 'fail',
      message: 'Property not found.',
    });
  }

  // Enforce property owner validation if required, but allow admin
  if (prop.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only the property owner can create an auction.',
    });
  }

  const auction = await Auction.create({
    property,
    seller: req.user._id,
    startingPrice,
    currentBid: startingPrice,
    bidIncrement,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status: 'pending',
  });

  res.status(201).json({
    status: 'success',
    data: {
      auction,
    },
  });
});

/**
 * Get auction by ID
 */
exports.getAuctionById = asyncHandler(async (req, res) => {
  const auction = await Auction.findById(req.params.id).populate('property');
  if (!auction) {
    return res.status(404).json({
      status: 'fail',
      message: 'Auction not found.',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      auction,
    },
  });
});

/**
 * List all auctions
 */
exports.listAuctions = asyncHandler(async (req, res) => {
  const auctions = await Auction.find().populate('property');
  res.status(200).json({
    status: 'success',
    data: {
      auctions,
    },
  });
});
