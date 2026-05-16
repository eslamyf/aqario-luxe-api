const Auction  = require('../../models/auction.model');
const Bid      = require('../../models/bid.model');
const Property = require('../../models/property.model');
const asyncHandler   = require('../../utils/asyncHandler');
const AppError       = require('../../utils/AppError');
const { emitAuctionClosed } = require('../../config/socket');
const { sendAuctionWinnerEmail } = require('../../services/email.service');
const logger = require('../../utils/logger');
const { createNotification }    = require('../../utils/notificationHelper');

// ─── Create Auction ───────────────────────────────────────────
exports.createAuction = asyncHandler(async (req, res, next) => {
  const { property, startingPrice, bidIncrement, startDate, endDate } = req.body;

  if (!property || !startingPrice || !startDate || !endDate) {
    return next(new AppError(req.t('AUCTION.FIELDS_REQUIRED'), 400));
  }

  const parsedStart = new Date(startDate);
  const parsedEnd   = new Date(endDate);

  if (isNaN(parsedStart) || isNaN(parsedEnd)) {
    return next(new AppError(req.t('AUCTION.INVALID_DATE'), 400));
  }
  if (parsedStart >= parsedEnd) {
    return next(new AppError(req.t('AUCTION.START_BEFORE_END'), 400));
  }
  if (parsedStart < new Date()) {
    return next(new AppError(req.t('AUCTION.START_IN_FUTURE'), 400));
  }

  // Check property ownership
  const prop = await Property.findById(property);
  if (!prop) return next(new AppError(req.t('PROPERTY.NOT_FOUND'), 404));
  if (prop.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError(req.t('AUCTION.NO_PERMISSION_CREATE'), 403));
  }

  const existingAuction = await Auction.findOne({
    property,
    status: { $in: ['upcoming', 'active'] },
  });
  if (existingAuction) {
    return next(new AppError(req.t('AUCTION.ALREADY_ACTIVE'), 400));
  }

  const auction = await Auction.create({
    property,
    seller:       req.user._id,
    startingPrice,
    bidIncrement: bidIncrement || 100,
    startDate:    parsedStart,
    endDate:      parsedEnd,
    status:       'upcoming',
  });

  await auction.populate('property', 'title location images price');

  res.status(201).json({
    status:  'success',
    message: req.t('AUCTION.CREATED'),
    data:    { auction },
  });
});

// ─── Get All Auctions ─────────────────────────────────────────
exports.getAllAuctions = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) filter.isApproved = true;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Auction.countDocuments(filter);

  const auctions = await Auction.find(filter)
    .populate('property', 'title location images price')
    .populate('seller',   'name email')
    .populate('winner',   'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success', total, page: Number(page),
    pages:  Math.ceil(total / Number(limit)), count: auctions.length,
    data:   { auctions },
  });
});

// ─── Get Single Auction ───────────────────────────────────────
exports.getAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id).lean()
    .populate('property', 'title location images price area bedrooms bathrooms')
    .populate('seller',   'name email phone')
    .populate('winner',   'name email');

  if (!auction) return next(new AppError(req.t('AUCTION.NOT_FOUND'), 404));

  // FIX — Get real count from countDocuments instead of limit(20)
  const bidsCount = await Bid.countDocuments({ auction: req.params.id });
  const bids      = await Bid.find({ auction: req.params.id })
    .populate('bidder', 'name email')
    .sort({ amount: -1 })
    .limit(20);

  res.status(200).json({
    status: 'success',
    data:   { auction, bids, bidsCount },
  });
});

// ─── Update Auction ───────────────────────────────────────────
exports.updateAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);
  if (!auction) return next(new AppError(req.t('AUCTION.NOT_FOUND'), 404));

  if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError(req.t('AUCTION.NO_PERMISSION_EDIT'), 403));
  }
  if (auction.status !== 'upcoming') {
    return next(new AppError(req.t('AUCTION.CANNOT_EDIT_STARTED'), 400));
  }

  const allowed = ['startingPrice', 'bidIncrement', 'startDate', 'endDate'];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (updates.startDate || updates.endDate) {
    const newStart = updates.startDate ? new Date(updates.startDate) : auction.startDate;
    const newEnd   = updates.endDate   ? new Date(updates.endDate)   : auction.endDate;
    if (isNaN(newStart) || isNaN(newEnd)) return next(new AppError(req.t('AUCTION.INVALID_DATE'), 400));
    if (newStart >= newEnd)  return next(new AppError(req.t('AUCTION.START_BEFORE_END'), 400));
    if (newStart < new Date()) return next(new AppError(req.t('AUCTION.START_IN_FUTURE'), 400));
    updates.startDate = newStart;
    updates.endDate   = newEnd;
  }

  if (updates.startingPrice) updates.currentBid = updates.startingPrice;

  const updated = await Auction.findByIdAndUpdate(req.params.id, updates, {
    new: true, runValidators: true,
  }).populate('property', 'title location images price');

  res.status(200).json({ status: 'success', message: req.t('AUCTION.UPDATED'), data: { auction: updated } });
});

// ─── Delete Auction ───────────────────────────────────────────
exports.deleteAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);
  if (!auction) return next(new AppError(req.t('AUCTION.NOT_FOUND'), 404));

  const isOwner = auction.seller.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    return next(new AppError(req.t('AUCTION.NO_PERMISSION_DELETE'), 403));
  }
  if (auction.status === 'active') {
    const hasBids = await Bid.exists({ auction: req.params.id });
    if (hasBids) return next(new AppError(req.t('AUCTION.CANNOT_DELETE_ACTIVE'), 400));
  }

  await Auction.findByIdAndDelete(req.params.id);
  await Bid.deleteMany({ auction: req.params.id });

  res.status(200).json({ status: 'success', message: req.t('AUCTION.DELETED'), data: null });
});

// ─── Close Auction ────────────────────────────────────────────
exports.closeAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);
  if (!auction) return next(new AppError(req.t('AUCTION.NOT_FOUND'), 404));
  if (auction.status === 'closed')    return next(new AppError(req.t('AUCTION.ALREADY_CLOSED'), 400));
  if (auction.status === 'cancelled') return next(new AppError(req.t('AUCTION.CANCELLED_NO_CLOSE'), 400));

  const winningBid = await Bid.findOne({ auction: req.params.id, isWinning: true })
    .populate('bidder', 'name email');

  const winner   = winningBid?.bidder || null;
  const finalBid = winningBid?.amount || null;

  const closed = await Auction.findByIdAndUpdate(
    req.params.id,
    { status: 'closed', winner: winner?._id || null },
    { new: true }
  )
    .populate('property', 'title location images')
    .populate('seller',   'name email')
    .populate('winner',   'name email');

  emitAuctionClosed(req.params.id, winner, finalBid);

  // FIX — Winner email notification was completely missing
  if (winner?.email) {
    await sendAuctionWinnerEmail(winner.email, {
      propertyTitle: closed.property?.title || 'Property',
      finalBid,
    }).catch((e) => logger.error(`[CloseAuction] Winner email error: ${e.message}`));

    await createNotification(req.io, winner._id, {
      type:    'auction',
      title:   req.t('NOTIFICATION.AUCTION_WON'),
      message: req.t('NOTIFICATION.AUCTION_WON_MSG', { property: closed.property?.title, amount: finalBid }),
      link:    `/auctions/${req.params.id}`,
    }).catch(() => {});
  }

  res.status(200).json({
    status:  'success',
    message: winner
      ? req.t('AUCTION.CLOSED_WITH_WINNER', { winner: winner.name, amount: finalBid })
      : req.t('AUCTION.CLOSED_NO_BIDS'),
    data:    { auction: closed, winner, finalBid },
  });
});

// ─── Get My Auctions ──────────────────────────────────────────
exports.getMyAuctions = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { seller: req.user._id };
  if (status) filter.status = status;

  const auctions = await Auction.find(filter)
    .populate('property', 'title location images price')
    .populate('winner',   'name email')
    .sort({ createdAt: -1 });

  // FIX — Use one aggregation instead of N+1 queries
  const auctionIds = auctions.map((a) => a._id);
  const bidCounts  = await Bid.aggregate([
    { $match: { auction: { $in: auctionIds } } },
    { $group: { _id: '$auction', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(bidCounts.map((b) => [b._id.toString(), b.count]));

  const result = auctions.map((a) => ({
    ...a.toObject(),
    bidCount: countMap[a._id.toString()] || 0,
  }));

  res.status(200).json({ status: 'success', count: auctions.length, data: { auctions: result } });
});

// ─── Approve Auction (Admin) ──────────────────────────────────
// FIX — Approval keeps status: upcoming — the cron job is what converts it to active
exports.approveAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findByIdAndUpdate(
    req.params.id,
    { isApproved: true }, // FIX — Remove status: 'active' from here
    { new: true }
  ).populate('property', 'title location images price');

  if (!auction) return next(new AppError(req.t('AUCTION.NOT_FOUND'), 404));

  // Notify auction owner
  await createNotification(req.io, auction.seller, {
    type:    'auction',
    title:   req.t('NOTIFICATION.AUCTION_APPROVED_TITLE'),
    message: req.t('NOTIFICATION.AUCTION_APPROVED_MSG', { property: auction.property?.title }),
    link:    `/auctions/${auction._id}`,
  }).catch(() => {});

  res.status(200).json({ status: 'success', message: req.t('AUCTION.APPROVED'), data: { auction } });
});
