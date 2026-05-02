const cron    = require('node-cron');
const Auction = require('../models/auction.model');
const Bid     = require('../models/bid.model');
const { sendAuctionWinnerEmail } = require('../services/email.service');
const { createNotification }     = require('../utils/notificationHelper');
const logger = require('../utils/logger');

let _io = null;

const initAuctionJob = (io) => {
  _io = io;

  let isProcessing = false;
  cron.schedule('* * * * *', async () => {
    if (isProcessing) {
      logger.warn('[AuctionJob] Previous job still running, skipping this execution');
      return;
    }
    isProcessing = true;
    try {
      const now = new Date();

      const activated = await Auction.updateMany(
        { status: 'upcoming', isApproved: true, startDate: { $lte: now } },
        { $set: { status: 'active' } }
      );
      if (activated.modifiedCount > 0) {
        logger.info(`[AuctionJob] Activated ${activated.modifiedCount} auction(s)`);
      }

      const expiredAuctions = await Auction.find({
        status:  'active',
        endDate: { $lt: now },
      }).populate('property', 'title').populate('seller', 'email name');

      // Refactored to process concurrently and prevent node-cron missed execution warnings
      const auctionPromises = expiredAuctions.map(async (auction) => {
        const winningBid = await Bid.findOne({ auction: auction._id, isWinning: true })
          .populate('bidder', 'name email');

        const winner   = winningBid?.bidder || null;
        const finalBid = winningBid?.amount  || null;

        await Auction.findByIdAndUpdate(auction._id, {
          status: 'closed',
          winner: winner?._id || null,
        });

        if (_io) {
          _io.to(`auction_${auction._id}`).emit('auctionClosed', {
            auctionId: auction._id,
            winner:    winner   || null,
            finalBid:  finalBid || null,
            message:   winner
              ? `Auction ended — Winner: ${winner.name} with bid ${finalBid}`
              : 'Auction ended with no bids',
            closedAt:  new Date(),
          });
        }

        const notificationPromises = [];

        if (winner?.email) {
          notificationPromises.push(
            sendAuctionWinnerEmail(winner.email, {
              propertyTitle: auction.property?.title || 'Property',
              finalBid,
            }).catch((e) => logger.error(`[AuctionJob] Winner email error: ${e.message}`))
          );

          notificationPromises.push(
            createNotification(_io, winner._id, {
              type:    'auction',
              title:   '🏆 Congratulations! You won the auction',
              message: `You won the auction for "${auction.property?.title}" with a bid of ${finalBid}`,
              link:    `/auctions/${auction._id}`,
            }).catch(() => {})
          );
        }

        notificationPromises.push(
          createNotification(_io, auction.seller._id, {
            type:    'auction',
            title:   winner ? 'Your auction ended successfully' : 'Your auction ended with no bids',
            message: winner
              ? `Auction for "${auction.property?.title}" ended — Winner: ${winner.name} with bid ${finalBid}`
              : `Auction for "${auction.property?.title}" ended with no bids`,
            link: `/auctions/${auction._id}`,
          }).catch(() => {})
        );

        // Execute all heavy IO (emails & socket notifications) for this auction concurrently
        await Promise.all(notificationPromises);

        logger.info(`[AuctionJob] Closed auction ${auction._id} — Winner: ${winner?.name || 'None'}`);
      });

      // Settle all auctions concurrently. If one fails, the others still process.
      await Promise.allSettled(auctionPromises);
    } catch (err) {
      logger.error(`[AuctionJob] Error: ${err.message}`);
    } finally {
      isProcessing = false;
    }
  });

  logger.info('⏰ Auction scheduler started');
};

module.exports = { initAuctionJob };
