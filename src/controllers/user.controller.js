const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

// Fields that must never be returned to any client — not even admins
const SAFE_USER_PROJECTION = '-bankAccounts.ibanEncrypted -loginAttempts -lockUntil -__v';

// ─── Get All Users (Admin) ────────────────────────────────────
exports.getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    User.countDocuments(),
    User.find()
      .select(SAFE_USER_PROJECTION)
      .skip(skip)
      .limit(limit)
      .sort('-createdAt')
      .lean(),
  ]);

  const mappedUsers = users.map(user => {
    return {
      ...user,
      photo: user.photo || '',
      kycStatus: user.kyc?.status || 'not_submitted',
      isBanned: user.status === 'banned',
      isVerified: user.security?.emailVerified || user.kyc?.status === 'approved'
    };
  });

  res.status(200).json({
    status: 'success',
    results: mappedUsers.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: { users: mappedUsers },
  });
});

// ─── Get Single User (Admin) ──────────────────────────────────
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select(SAFE_USER_PROJECTION)
    .lean();
  if (!user) return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
  res.status(200).json({ status: 'success', data: { user } });
});

// ─── Get My Profile with Real Estate Dashboard ────────────────────
// Returns user profile + role-specific dashboard data.
// All independent queries within each branch run in parallel (Promise.all).
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  const dashboard = {};

  if (user.role === 'owner' || user.role === 'agent') {
    // ── Owner / Agent dashboard ──────────────────────────────
    const Property = require('../models/property.model');
    const Booking = require('../models/booking.model');
    const ViewingRequest = require('../models/viewingRequest.model');

    const [properties, totalProperties, activeListings] = await Promise.all([
      Property.find({ owner: user._id })
        .limit(5)
        .select('title price bedrooms bathrooms area photo')
        .lean(),
      Property.countDocuments({ owner: user._id }),
      Property.countDocuments({ owner: user._id, status: 'available' }),
    ]);

    const propertyIds = properties.map(p => p._id);

    const [bookingRequests, upcomingViewings] = await Promise.all([
      Booking.countDocuments({ property: { $in: propertyIds }, status: 'pending' }),
      ViewingRequest.countDocuments({ property: { $in: propertyIds }, status: 'pending' }),
    ]);

    dashboard.properties = properties;
    dashboard.totalProperties = totalProperties;
    dashboard.activeListings = activeListings;
    dashboard.bookingRequests = bookingRequests;
    dashboard.upcomingViewings = upcomingViewings;

  } else if (user.role === 'buyer') {
    // ── Buyer dashboard ──────────────────────────────────────
    const Favorite = require('../models/favorite.model');
    const Booking = require('../models/booking.model');
    const ViewingRequest = require('../models/viewingRequest.model');

    const [savedPropertiesCount, myBookings, viewingRequests] = await Promise.all([
      Favorite.countDocuments({ userId: user._id }),
      Booking.find({ buyer: user._id })
        .limit(5)
        .select('property status checkInDate checkOutDate')
        .lean(),
      ViewingRequest.find({ userId: user._id })
        .limit(5)
        .select('property status scheduledDate')
        .lean(),
    ]);

    dashboard.savedPropertiesCount = savedPropertiesCount;
    dashboard.myBookings = myBookings;
    dashboard.viewingRequests = viewingRequests;

  } else if (user.role === 'admin') {
    // ── Admin dashboard ──────────────────────────────────────
    const Property = require('../models/property.model');
    const Booking = require('../models/booking.model');

    const [totalUsers, totalProperties, totalBookings, pendingVerifications] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Booking.countDocuments(),
      User.countDocuments({ isVerified: false }),
    ]);

    dashboard.totalUsers = totalUsers;
    dashboard.totalProperties = totalProperties;
    dashboard.totalBookings = totalBookings;
    dashboard.pendingVerifications = pendingVerifications;
  }

  // Flattening data to maintain frontend compatibility
  user.isVerified = user.security?.emailVerified || user.kyc?.status === 'approved';
  user.kycStatus = user.kyc?.status || 'not_submitted';
  user.kycRejectionReason = user.kyc?.rejectionReason || null;
  user.photo = user.photo || '';
  user.bio = user.bio || '';

  res.status(200).json({
    status: 'success',
    data: {
      user,
      dashboard: {
        role: user.role,
        isVerified: user.isVerified,
        kycStatus: user.kycStatus,
        kycApproved: user.kycStatus === 'approved',
        kycRejected: user.kycStatus === 'rejected',
        kycPending: user.kycStatus === 'pending',
        kycRejectionReason: user.kycRejectionReason,
        ...dashboard,
      },
    },
  });
});

// ─── Update My Profile ────────────────────────────────────────
exports.updateMe = asyncHandler(async (req, res) => {
  // Prevent clients from escalating privileges via these fields
  const { password, role, photo, bio, name, phone, ...otherData } = req.body;

  const updateData = { ...otherData };

  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;

  // Map flat frontend properties to schema structure
  if (photo !== undefined) updateData.photo = photo;
  if (bio !== undefined) updateData.bio = bio;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updateData }, {
    new: true,
    runValidators: true,
  }).lean();

  // Flatten the returned user object for frontend consistency
  user.isVerified = user.security?.emailVerified || user.kyc?.status === 'approved';
  user.kycStatus = user.kyc?.status || 'not_submitted';
  user.photo = user.photo || '';
  user.bio = user.bio || '';

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── Change Password ──────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  // comparePassword is async (bcrypt.compare) — must be awaited
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ status: 'fail', message: req.t('AUTH.CURRENT_PASSWORD_INCORRECT') });
  }

  user.password = newPassword;
  await user.save();

  // Revoke all old refresh tokens after password change
  await RefreshToken.updateMany({ userId: user._id }, { isRevoked: true });

  // Issue new tokens after password change
  const { signToken, signRefreshToken } = require('../utils/jwt');
  const accessToken = signToken(user._id, user.tokenVersion);
  const newRefreshToken = signRefreshToken(user._id, user.tokenVersion);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: RefreshToken.hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip || '',
  });

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.status(200).json({
    status: 'success',
    message: req.t('AUTH.PASSWORD_CHANGED'),
    token: accessToken,
  });
});

// ─── Delete User (Admin) ──────────────────────────────────────
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError(req.t('AUTH.USER_NOT_FOUND'), 404));

  // Revoke all user tokens before deletion
  await RefreshToken.deleteMany({ userId: user._id });
  await user.deleteOne();

  res.status(204).send();
});
