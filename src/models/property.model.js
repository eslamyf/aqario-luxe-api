const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'VALIDATION.TITLE_REQUIRED'],
      trim: true,
      minlength: [10, 'VALIDATION.TITLE_LENGTH'],
      maxlength: [100, 'VALIDATION.TITLE_MAX'],
    },
    description: {
      type: String,
      required: [true, 'VALIDATION.DESCRIPTION_REQUIRED'],
      minlength: [20, 'VALIDATION.DESCRIPTION_MIN'],
    },
    price: {
      type: Number,
      required: [true, 'VALIDATION.PRICE_REQUIRED'],
      min: [0, 'VALIDATION.PRICE_MIN'],
    },
    // ── FIX #5: currency — stored per property ──────────────────────────────
    currency: {
      type: String,
      enum: { values: ['USD', 'GBP', 'EUR', 'AED', 'SAR', 'EGP'], message: 'VALIDATION.CURRENCY_INVALID' },
      default: 'USD',
    },
    type: {
      type: String,
      required: [true, 'VALIDATION.TYPE_REQUIRED'],
      enum: {
        values: ['apartment', 'villa', 'house', 'studio', 'office', 'shop', 'land', 'commercial'],
        message: 'VALIDATION.TYPE_INVALID',
      },
    },
    listingType: {
      type: String,
      enum: { values: ['sale', 'rent'], message: 'VALIDATION.LISTING_TYPE_INVALID' },
      default: 'sale',
    },
    status: {
      type: String,
      enum: ['available', 'reserved', 'sold'],
      default: 'available',
    },
    location: {
      city:     { type: String, required: [true, 'VALIDATION.CITY_REQUIRED'] },
      district: { type: String, required: [true, 'VALIDATION.DISTRICT_REQUIRED'] },
      street:   { type: String },
    },
    area:      { type: Number, min: [0, 'VALIDATION.AREA_MIN'] },
    bedrooms:  { type: Number, default: 0, min: 0 },
    bathrooms: { type: Number, default: 0, min: 0 },
    images:    { type: [String], default: [] },
    // ── FIX #5: features — list of amenities ────────────────────────────────
    features: {
      type: [String],
      default: [],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'VALIDATION.PROPERTY_OWNER_REQUIRED'],
    },
    avgRating: {
      type: Number,
      default: 0,
      min: [0, 'VALIDATION.RATING_MIN'],
      max: [5, 'VALIDATION.RATING_MAX'],
      set: (val) => Math.round(val * 10) / 10,
    },
    reviewCount: { type: Number, default: 0 },
    isApproved:  { type: Boolean, default: false }, // العقار يحتاج موافقة الأدمن قبل النشر
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);


// Indexes for query performance
propertySchema.index({ price: 1 });
propertySchema.index({ type: 1 });
propertySchema.index({ listingType: 1 });
propertySchema.index({ 'location.city': 1 });
propertySchema.index({ owner: 1 });
propertySchema.index({ status: 1 });
propertySchema.index({ isApproved: 1, status: 1 });
propertySchema.index({ owner: 1, createdAt: -1 });

// Compound indexes for optimized filtering
propertySchema.index({ 'location.city': 1, 'location.district': 1 });
propertySchema.index({ price: 1, type: 1, listingType: 1 });

// Text Index for full-text search engine
propertySchema.index(
  { title: 'text', description: 'text', 'location.city': 'text', 'location.district': 'text' },
  { weights: { title: 10, description: 5, 'location.city': 5, 'location.district': 1 } }
);

// Virtual populate for reviews
propertySchema.virtual('reviews', {
  ref:          'Review',
  foreignField: 'propertyId',
  localField:   '_id',
});

// FIX #5 — badge virtual: derived from listingType so frontend gets it automatically
propertySchema.virtual('badge').get(function () {
  return this.listingType === 'rent' ? 'For Rent' : 'For Sale';
});

module.exports = mongoose.model('Property', propertySchema);

