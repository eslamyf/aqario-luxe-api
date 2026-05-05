const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/user.model');

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ status: 'fail', message: req.t('COMMON.LOGIN_REQUIRED') });
    }

    // ✅ We used clean function instead of jwt.verify directly
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.id).select('+passwordChangedAt +isActive +isBanned +isVerified');
    if (!user) {
      return res.status(401).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    if (!user.isActive) {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.ACCOUNT_SUSPENDED') });
    }

    if (user.isBanned) {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.ACCOUNT_BANNED') });
    }

    if (!user.isVerified) {
      return res.status(403).json({ status: 'fail', message: req.t('AUTH.VERIFY_EMAIL_FIRST') });
    }

    // Check if password was changed after token was issued
    if (user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < changedAt) {
        return res.status(401).json({ status: 'fail', message: req.t('ERRORS.PASSWORD_CHANGED_LOGIN') });
      }
    }

    const tokenVersion = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;
    if (tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ status: 'fail', message: req.t('ERRORS.SESSION_INVALID') });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ status: 'fail', message: req.t('COMMON.INVALID_TOKEN') });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'fail', message: req.t('COMMON.TOKEN_EXPIRED') });
    }
    next(err);
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};
