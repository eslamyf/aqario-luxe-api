const Property    = require('../../models/property.model');
const SavedSearch = require('../../models/savedSearch.model');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const { cacheMiddleware } = require('../../middlewares/cache.middleware');
const { trackPropertyView } = require('../../services/analytics.service');
const { getPaginationParams } = require('../../utils/paginate');

// ─── Advanced Search ──────────────────────────────────────────
// @route GET /api/v1/search
exports.advancedSearch = asyncHandler(async (req, res) => {
  const {
    q, type, listingType, city, district, minPrice, maxPrice,
    minArea, maxArea, bedrooms, bathrooms, minRating,
    sortBy = 'createdAt', order = 'desc',
  } = req.query;

  const { page, limit, skip } = getPaginationParams(req.query, 12, 100);

  const filter = { isApproved: true, status: 'available' };

  // Text search — using MongoDB text index for O(log n) performance instead of O(n) $regex
  let textSearchScore = null;
  if (q) {
    filter.$text = { $search: q };
    textSearchScore = true; // Flag to include text score in projection
  }

  if (type)        filter.type        = type;
  if (listingType) filter.listingType = listingType;
  if (city) {
    if (!filter.$and) filter.$and = [];
    filter.$and.push({
      $or: [
        { 'location.city.en': city },
        { 'location.city.ar': city }
      ]
    });
  }
  if (district) {
    if (!filter.$and) filter.$and = [];
    filter.$and.push({
      $or: [
        { 'location.district.en': district },
        { 'location.district.ar': district }
      ]
    });
  }
  if (bedrooms)    filter.bedrooms  = { $gte: Number(bedrooms) };
  if (bathrooms)   filter.bathrooms = { $gte: Number(bathrooms) };
  if (minRating)   filter.avgRating = { $gte: Number(minRating) };

  const priceFilter = {};
  if (minPrice) priceFilter.$gte = Number(minPrice);
  if (maxPrice) priceFilter.$lte = Number(maxPrice);
  if (Object.keys(priceFilter).length) filter.price = priceFilter;

  const areaFilter = {};
  if (minArea) areaFilter.$gte = Number(minArea);
  if (maxArea) areaFilter.$lte = Number(maxArea);
  if (Object.keys(areaFilter).length) filter.area = areaFilter;

  const sortOrder = order === 'asc' ? 1 : -1;
  const validSorts = ['price', 'createdAt', 'avgRating', 'area', 'bedrooms'];
  const sortField  = validSorts.includes(sortBy) ? sortBy : 'createdAt';

  let query = Property.find(filter);
  
  // When using text search, include text score and prioritize by relevance
  if (textSearchScore) {
    query = query.select({ score: { $meta: 'textScore' }, '-__v': 1 });
    if (sortField === 'createdAt') {
      query = query.sort({ score: { $meta: 'textScore' }, [sortField]: sortOrder });
    } else {
      query = query.sort({ score: { $meta: 'textScore' } });
    }
  } else {
    query = query.select('-__v').sort({ [sortField]: sortOrder });
  }

  const [total, properties, priceStats] = await Promise.all([
    Property.countDocuments(filter),
    query.populate('owner', 'name email phone photo').skip(skip).limit(limit).lean(),
    Property.aggregate([
      { $match: filter },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } },
    ])
  ]);

  res.status(200).json({
    status: 'success',
    total,
    page,
    pages:  Math.ceil(total / limit),
    count:  properties.length,
    priceStats: priceStats[0] ? {
      min: Math.round(priceStats[0].min),
      max: Math.round(priceStats[0].max),
      avg: Math.round(priceStats[0].avg),
    } : null,
    data: { properties },
  });
});

// ─── Saved Searches ───────────────────────────────────────────
exports.getSavedSearches = asyncHandler(async (req, res) => {
  const searches = await SavedSearch.find({ userId: req.user._id }).sort('-createdAt');
  res.status(200).json({ status: 'success', count: searches.length, data: { searches } });
});

exports.saveSearch = asyncHandler(async (req, res, next) => {
  const { name, filters, notifyOnMatch } = req.body;
  if (!name || !filters) return next(new AppError(req.t('COMMON.VALIDATION_DATA_ERROR'), 400));

  const count = await SavedSearch.countDocuments({ userId: req.user._id });
  if (count >= 10) return next(new AppError(req.t('COMMON.NO_PERMISSION'), 400));

  const search = await SavedSearch.create({
    userId: req.user._id, name, filters, notifyOnMatch: notifyOnMatch !== false,
  });
  res.status(201).json({ status: 'success', data: { search } });
});

exports.deleteSavedSearch = asyncHandler(async (req, res, next) => {
  const search = await SavedSearch.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!search) return next(new AppError(req.t('COMMON.NOT_AUTHORIZED'), 404));
  res.status(204).json({ status: 'success', data: null });
});

// ─── Property Analytics (Owner) ───────────────────────────────
exports.getPropertyAnalytics = asyncHandler(async (req, res, next) => {
  const Property = require('../../models/property.model');
  const prop = await Property.findById(req.params.id).lean();
  if (!prop) return next(new AppError(req.t('PROPERTY.NOT_FOUND'), 404));
  if (prop.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError(req.t('COMMON.NOT_AUTHORIZED'), 403));
  }
  const { getPropertyAnalytics } = require('../../services/analytics.service');
  const days      = Number(req.query.days) || 30;
  const analytics = await getPropertyAnalytics(prop._id, days);
  res.status(200).json({ status: 'success', data: analytics });
});

// ─── Similar Properties ───────────────────────────────────────
exports.getSimilarProperties = asyncHandler(async (req, res, next) => {
  const property = await Property.findById(req.params.id).select('type listingType location.city price').lean();
  if (!property) return next(new AppError(req.t('PROPERTY.NOT_FOUND'), 404));

  const similar = await Property.find({
    _id:         { $ne: property._id },
    type:        property.type,
    listingType: property.listingType,
    $or: [
      { 'location.city.en': property.location?.city?.en },
      { 'location.city.ar': property.location?.city?.ar }
    ],
    isApproved:  true,
    status:      'available',
    price:       { $gte: property.price * 0.7, $lte: property.price * 1.3 },
  })
    .select('title price location images avgRating bedrooms bathrooms area')
    .limit(6)
    .sort('-avgRating');

  res.status(200).json({ status: 'success', count: similar.length, data: { properties: similar } });
});
