const crypto = require('crypto');
const logger = require('./logger');

// ─────────────────────────────────────────────────────────────────
// Encryption Utilities (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────
// Used for encrypting sensitive data like IBAN, bank account details
// Provides authenticated encryption (detect tampering)
// ─────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
let DERIVED_KEY = null;

const getDerivedKey = () => {
  if (DERIVED_KEY) return DERIVED_KEY;

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    // Don't crash the server at require-time — only fail when encryption is actually used.
    logger.error('[Encryption] ENCRYPTION_KEY not set in .env');
    const err = new Error('ENCRYPTION_KEY environment variable is required for encryption');
    err.code = 'ENCRYPTION_KEY_MISSING';
    throw err;
  }

  DERIVED_KEY = crypto.scryptSync(encryptionKey, 'payment-system', 32);
  return DERIVED_KEY;
};

/**
 * Encrypt a sensitive field (e.g., IBAN)
 * Returns: { encrypted, iv, authTag } for storage
 */
exports.encryptField = (value) => {
  try {
    if (!value) return null;

    // Generate random IV (Initialization Vector)
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, getDerivedKey(), iv);

    // Encrypt the value
    let encrypted = cipher.update(String(value), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag (detects tampering)
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (err) {
    logger.error('[Encryption] encryptField error:', err);
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt a sensitive field
 * Expects: { encrypted, iv, authTag }
 */
exports.decryptField = (encryptedData) => {
  try {
    if (!encryptedData || !encryptedData.encrypted) return null;

    const { encrypted, iv, authTag } = encryptedData;

    // Recreate decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedKey(), Buffer.from(iv, 'hex'));

    // Set auth tag (verify not tampered)
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    logger.error('[Encryption] decryptField error:', err);
    throw new Error('Decryption failed - data may be tampered');
  }
};

/**
 * Extract last 4 characters (for display without encryption)
 * E.g., IBAN "DE89370400440532013000" → "3000"
 */
exports.extractLast4 = (value) => {
  if (!value) return '';
  return String(value).slice(-4);
};

/**
 * Validate IBAN format (basic check)
 * Full validation would require provider-specific rules
 */
exports.validateIBAN = (iban) => {
  if (!iban) return false;
  // Remove spaces and convert to uppercase
  const cleanIBAN = String(iban).replace(/\s/g, '').toUpperCase();
  // Basic: IBAN is 15-34 characters
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(cleanIBAN);
};

/**
 * Hash sensitive data for comparison (one-way)
 * Used for fraud detection, duplicate detection
 */
exports.hashField = (value) => {
  try {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  } catch (err) {
    logger.error('[Encryption] hashField error:', err);
    throw new Error('Hash failed');
  }
};

/**
 * Generate secure random token (for payment verification, etc.)
 */
exports.generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Verify webhook signature (prevent spoofing)
 * Paymob/PayPal sends signature, we verify with our secret
 */
exports.verifyWebhookSignature = (payload, signature, secret) => {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    logger.error('[Encryption] verifyWebhookSignature error:', err);
    return false;
  }
};

/**
 * Verify Paymob webhook signature using HMAC-SHA512
 * Paymob requires alphabetical concatenation of specific fields from the payload object.
 */
exports.verifyPaymobSignature = (payloadObj, signature, secret) => {
  try {
    if (!payloadObj || !signature || !secret) return false;

    // Helper to extract nested properties safely
    const getValue = (obj, path) => path.split('.').reduce((o, i) => (o !== undefined && o !== null ? o[i] : ''), obj) ?? '';
    
    const fields = [
      'amount_cents',
      'created_at',
      'currency',
      'error_occured',
      'has_parent_transaction',
      'id',
      'integration_id',
      'is_3d_secure',
      'is_auth',
      'is_capture',
      'is_refunded',
      'is_standalone_payment',
      'is_voided',
      'order.id',
      'owner',
      'pending',
      'source_data.pan',
      'source_data.sub_type',
      'source_data.type',
      'success'
    ];
    
    // Concatenate fields exactly as strings
    const concatenatedString = fields.map(field => {
      const val = getValue(payloadObj, field);
      // Strict equality to handle boolean true/false correctly as strings
      return val !== null && val !== undefined && val !== '' ? String(val) : '';
    }).join('');

    const hmac = crypto.createHmac('sha512', secret);
    hmac.update(concatenatedString);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    logger.error('[Encryption] verifyPaymobSignature error:', err);
    return false;
  }
};

module.exports = Object.freeze({
  encryptField: exports.encryptField,
  decryptField: exports.decryptField,
  extractLast4: exports.extractLast4,
  validateIBAN: exports.validateIBAN,
  hashField: exports.hashField,
  generateToken: exports.generateToken,
  verifyWebhookSignature: exports.verifyWebhookSignature,
  verifyPaymobSignature: exports.verifyPaymobSignature,
});
