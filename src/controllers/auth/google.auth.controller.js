'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const User = require('../../models/user.model');
const RefreshToken = require('../../models/refreshToken.model');
const { signToken, signRefreshToken } = require('../../utils/jwt');
const { verifyGoogleToken } = require('../../services/google.auth.service');
const logger = require('../../utils/logger');

const SAFE_PROJECTION = '-password -googleId -otpHash -otpExpires -otpAttempts '
  + '-passwordResetToken -passwordResetExpiry -loginAttempts -lockUntil '
  + '-tokenVersion -__v -kycDocuments';

exports.googleAuth = asyncHandler(async (req, res, next) => {
  const { idToken } = req.body;

  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    return next(new AppError(req.t('AUTH.GOOGLE_TOKEN_REQUIRED'), 400));
  }

  console.log(`[GoogleAuth] Received idToken (first 20 chars): ${idToken.substring(0, 20)}...`);

  let googlePayload;
  try {
    googlePayload = await verifyGoogleToken(idToken.trim());
  } catch (err) {
    logger.warn(`[GoogleAuth] Token verification failed: ${err.message}`);
    return next(new AppError(req.t('AUTH.GOOGLE_INVALID_TOKEN'), 401));
  }

  const { googleId, email, name, picture, emailVerified } = googlePayload;

  if (!emailVerified) {
    return next(new AppError(req.t('AUTH.GOOGLE_EMAIL_NOT_VERIFIED'), 400));
  }

  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  }).select('+googleId +tokenVersion');

  if (user) {
    if (user.isBanned) {
      return next(new AppError(req.t('COMMON.ACCOUNT_BANNED'), 403));
    }
    if (!user.isActive) {
      return next(new AppError(req.t('COMMON.ACCOUNT_SUSPENDED'), 403));
    }

    if (!user.googleId) {
      const updateData = {
        googleId,
        authProvider: 'google',
        isVerified: true,
      };
      if (!user.photo && picture) {
        updateData.photo = picture;
      }
      await User.updateOne({ _id: user._id }, { $set: updateData }, { runValidators: false });
      logger.info(`[GoogleAuth] Linked Google account to existing user: ${user._id}`);
    }
  } else {
    user = await User.create({
      name,
      email,
      googleId,
      authProvider: 'google',
      photo: picture || null,
      isVerified: true,
      role: 'buyer',
    });
    logger.info(`[GoogleAuth] New user registered via Google: ${user._id} (${email})`);
  }

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

  const safeUser = await User.findById(user._id).select(SAFE_PROJECTION).lean();
  if (safeUser && safeUser.bankAccounts !== undefined) {
    delete safeUser.bankAccounts;
  }

  res.status(200).json({
    status: 'success',
    message: req.t('AUTH.GOOGLE_LOGIN_SUCCESS'),
    data: {
      accessToken,
      user: safeUser,
    },
  });
});
