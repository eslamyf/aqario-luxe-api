const SavedSearch = require('../models/savedSearch.model');
const Property    = require('../models/property.model');
const { createNotification } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

/**
 * Check saved searches and match them with a new property
 * Called when a new property is added
 */
const checkSavedSearches = async (io, property) => {
  try {
    const searches = await SavedSearch.find({
      notifyOnMatch: true,
      'filters.listingType': property.listingType,
    }).populate('userId', '_id name');

    for (const search of searches) {
      const f = search.filters;
      let match = true;

      if (f.type        && f.type        !== property.type)                  match = false;
      if (f.city        && f.city        !== property.location?.city)        match = false;
      if (f.district    && f.district    !== property.location?.district)    match = false;
      if (f.minPrice    && property.price < f.minPrice)                      match = false;
      if (f.maxPrice    && property.price > f.maxPrice)                      match = false;
      if (f.minArea     && property.area  < f.minArea)                       match = false;
      if (f.maxArea     && property.area  > f.maxArea)                       match = false;
      if (f.bedrooms    && property.bedrooms  < f.bedrooms)                  match = false;
      if (f.bathrooms   && property.bathrooms < f.bathrooms)                 match = false;

      if (match && search.userId) {
        await createNotification(io, search.userId._id, {
          type:    'system',
          title:   '🏠 New property matching your search',
          message: `Property "${property.title?.en || property.title?.ar || 'Property'}" in ${property.location?.city?.en || property.location?.city?.ar || ''} matches your search criteria "${search.name}"`,
          link:    `/properties/${property._id}`,
          meta:    { propertyId: property._id, searchId: search._id },
        });
        await SavedSearch.findByIdAndUpdate(search._id, { lastNotifiedAt: new Date() });
      }
    }
  } catch (err) {
    logger.error('SavedSearch check error:', err.message);
  }
};

module.exports = { checkSavedSearches };
