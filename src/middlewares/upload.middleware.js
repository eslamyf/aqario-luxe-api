const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const AppError = require('../utils/AppError');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = file.mimetype.startsWith('image/');
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (mimeOk && extOk) return cb(null, true);
  cb(new AppError(`File type not allowed - Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400), false);
};

const isAllowedImageBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

  return isJpeg || isPng || isWebp;
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 10 } });

const uploadToCloudinary = (buffer, folder = 'real-estate') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
      (error, result) => {
        if (error) return reject(new AppError('Failed to upload image to Cloudinary', 500));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

const handleMulterError = (uploadFn) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400));
    if (err.code === 'LIMIT_FILE_COUNT') return next(new AppError('Number of files exceeds 10 images', 400));
    next(err);
  });
};

// FIX - uploadImagesToCloud puts URLs in req.body so controllers can use them
const uploadImagesToCloud = async (req, _res, next) => {
  try {
    if (req.files && req.files.length > 0) {
      const invalidFile = req.files.find((file) => !isAllowedImageBuffer(file.buffer));
      if (invalidFile) {
        throw new AppError(`File type not allowed - Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400);
      }

      req.body.images = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file.buffer, 'real-estate/properties'))
      );
    }

    if (req.file) {
      if (!isAllowedImageBuffer(req.file.buffer)) {
        throw new AppError(`File type not allowed - Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400);
      }

      req.body.photo = await uploadToCloudinary(req.file.buffer, 'real-estate/avatars');
    }

    next();
  } catch (err) {
    next(err);
  }
};

const uploadKYCImageToCloud = async (req, _res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No image file provided', 400);
    }
    
    if (!isAllowedImageBuffer(req.file.buffer)) {
      throw new AppError(`File type not allowed - Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400);
    }

    req.body.imageUrl = await uploadToCloudinary(req.file.buffer, 'real-estate/kyc');
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadPropertyImages: [handleMulterError(upload.array('images', 10)), uploadImagesToCloud],
  uploadSingleImage: [handleMulterError(upload.single('photo')), uploadImagesToCloud],
  uploadKYCImage: [handleMulterError(upload.single('image')), uploadKYCImageToCloud],
};
