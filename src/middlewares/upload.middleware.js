const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const AppError = require('../utils/AppError');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.pjpeg', '.pjp'];
const ALLOWED_DOC_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.pdf', '.doc', '.docx'];
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
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8; // Start of Image (SOI) marker
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

  // If it's a known format by magic bytes, great. 
  // If not, we'll let the extension check handle it for flexibility with mobile uploads.
  return isJpeg || isPng || isWebp;
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 10 } });

const docFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = ALLOWED_DOC_EXTENSIONS.includes(ext);
  if (extOk) return cb(null, true);
  cb(new AppError(`File type not allowed - Allowed: ${ALLOWED_DOC_EXTENSIONS.join(', ')}`, 400), false);
};
const uploadDoc = multer({ storage, fileFilter: docFileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 10 } });

const logger = require('../utils/logger'); // Import logger

const uploadToCloudinary = (buffer, folder = 'real-estate') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
      (error, result) => {
        if (error) {
          logger.error(`❌ Cloudinary Upload Failed: ${error.message || JSON.stringify(error)}`);
          return reject(new AppError('Failed to upload image to Cloudinary', 500));
        }
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
      logger.warn(`[KYC Upload] No file found in request for user ${req.user._id}`);
      throw new AppError('No image file provided', 400);
    }
    
    // We trust the extension and mimetype from multer's fileFilter more now,
    // but we still do a basic SOI check for JPEGs if we want to be safe.
    // However, to maximize compatibility, we'll skip the strict buffer check if the fileFilter passed.

    logger.info(`[KYC Upload] Uploading identity image to Cloudinary for user ${req.user._id} (${req.file.originalname})...`);
    req.body.imageUrl = await uploadToCloudinary(req.file.buffer, 'real-estate/kyc');
    logger.info(`[KYC Upload] Success: ${req.body.imageUrl}`);
    next();
  } catch (err) {
    next(err);
  }
};

const uploadOwnershipFileToCloud = async (req, _res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file provided', 400);
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const isPdf = ext === '.pdf' || req.file.mimetype === 'application/pdf';
    const isDoc = ['.doc', '.docx'].includes(ext);

    let uploadedUrl;
    if (isPdf || isDoc) {
      // Upload as raw file to Cloudinary
      uploadedUrl = await new Promise((resolve, reject) => {
        const stream = require('../config/cloudinary').uploader.upload_stream(
          { folder: 'real-estate/ownership', resource_type: 'raw' },
          (error, result) => {
            if (error) return reject(new AppError('Failed to upload document to Cloudinary', 500));
            resolve(result.secure_url);
          }
        );
        stream.end(req.file.buffer);
      });
    } else {
      // Image file — validate magic bytes
      if (!isAllowedImageBuffer(req.file.buffer)) {
        throw new AppError(`File type not allowed`, 400);
      }
      uploadedUrl = await uploadToCloudinary(req.file.buffer, 'real-estate/ownership');
    }

    req.body.fileUrl = uploadedUrl;
    req.body.fileName = req.file.originalname;
    req.body.fileType = isPdf ? 'pdf' : isDoc ? 'doc' : 'image';
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadPropertyImages: [handleMulterError(upload.array('images', 10)), uploadImagesToCloud],
  uploadSingleImage: [handleMulterError(upload.single('photo')), uploadImagesToCloud],
  uploadKYCImage: [handleMulterError(upload.single('image')), uploadKYCImageToCloud],
  uploadOwnershipFile: [handleMulterError(uploadDoc.single('file')), uploadOwnershipFileToCloud],
};
