const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

// ─── Fail-Fast System: Block startup if config is invalid ───
if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name' ||
  !process.env.CLOUDINARY_API_KEY ||
  process.env.CLOUDINARY_API_KEY === 'your_api_key' ||
  !process.env.CLOUDINARY_API_SECRET ||
  process.env.CLOUDINARY_API_SECRET === 'your_api_secret'
) {
  logger.error('❌ Cloudinary config is invalid or using placeholders. Server cannot start. Fix your .env file.');
  throw new Error('❌ OPERATIONALLY BLOCKED: Cloudinary config is missing or invalid.');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;