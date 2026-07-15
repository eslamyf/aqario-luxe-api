const cron = require('node-cron');
const Property    = require('../models/property.model');
const SavedSearch = require('../models/savedSearch.model');
const { createNotification } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

let _io = null;

const runSavedSearchJob = async (io) => {
  try {
    const currentIo = io || _io;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Get all new properties in one query
    const newProperties = await Property.find({
      createdAt: { $gte: oneHourAgo },
      isApproved: true,
      status: 'available',
    }).lean();

    if (newProperties.length === 0) return { checked: 0, sent: 0 };

    // Get all active saved searches
    const searches = await SavedSearch.find({ notifyOnMatch: true }).lean();
    
    if (searches.length === 0) return { checked: newProperties.length, sent: 0 };

    // Batch process matches and notifications
    const notificationBatch = [];
    const updateBatch = [];

    for (const property of newProperties) {
      for (const search of searches) {
        const f = search.filters;
        let match = true;

        // Apply all filters
        if (f.listingType && f.listingType !== property.listingType) match = false;
        if (f.type && f.type !== property.type) match = false;
        if (f.city && !property.location?.city?.toLowerCase().includes(f.city.toLowerCase())) match = false;
        if (f.minPrice && property.price < f.minPrice) match = false;
        if (f.maxPrice && property.price > f.maxPrice) match = false;
        if (f.bedrooms && property.bedrooms < f.bedrooms) match = false;
        if (f.bathrooms && property.bathrooms < f.bathrooms) match = false;
        if (f.minArea && property.area < f.minArea) match = false;
        if (f.maxArea && property.area > f.maxArea) match = false;

        if (match) {
          notificationBatch.push({
            userId: search.userId,
            property,
            search,
          });
          updateBatch.push({
            updateOne: {
              filter: { _id: search._id },
              update: { $set: { lastNotifiedAt: new Date() } },
            },
          });
        }
      }
    }

    // Send notifications in parallel
    if (notificationBatch.length > 0) {
      await Promise.all(
        notificationBatch.map((item) =>
          createNotification(currentIo, item.userId, {
            type: 'system',
            title: '🏠 New property matches your search',
            message: `"${item.property.title}" in ${item.property.location?.city} matches your saved search "${item.search.name}"`,
            link: `/properties/${item.property._id}`,
          }).catch(() => {})
        )
      );
    }

    // Batch update lastNotifiedAt
    if (updateBatch.length > 0) {
      await SavedSearch.bulkWrite(updateBatch).catch(() => {});
    }

    logger.info(`[SavedSearchJob] Checked ${newProperties.length} properties, sent ${notificationBatch.length} notifications`);
    return { checked: newProperties.length, sent: notificationBatch.length };
  } catch (err) {
    logger.error('[SavedSearchJob] Error:', err.message);
    throw err;
  }
};

const initSavedSearchJob = (io) => {
  _io = io;

  // FIX — Use batch processing instead of nested loops (O(n*m)) to improve performance
  cron.schedule('0 * * * *', async () => {
    await runSavedSearchJob(io);
  });

  logger.info('⏰ SavedSearch job started');
};

module.exports = { initSavedSearchJob, runSavedSearchJob };
