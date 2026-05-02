'use strict';

/**
 * Google OAuth Service
 * ─────────────────────────────────────────────────────────────
 * Architecture: Token-Verify pattern
 *   - Frontend (Angular) triggers Google Sign-In via @google/oauth2
 *   - Frontend receives idToken from Google
 *   - Frontend sends idToken to POST /api/v1/auth/google
 *   - Backend (this service) verifies the idToken cryptographically
 *     using google-auth-library → no redirect / no OAuth callback URL
 *
 * Security guarantees:
 *   - Audience check: rejects tokens issued for other Client IDs
 *   - Expiry check: google-auth-library rejects expired tokens
 *   - Signature check: verified against Google's public keys
 */

const { OAuth2Client } = require('google-auth-library');

// Configuration: strictly rely on environment variables (no hardcoded fallbacks for security)
const clientID = process.env.GOOGLE_CLIENT_ID;

// Validation: ensure CLIENT_ID is correctly loaded and not a placeholder
// This runs at module-load time to catch configuration errors immediately.
if (!clientID || clientID.includes('your_google_client_id_here') || !clientID.endsWith('.apps.googleusercontent.com')) {
  throw new Error(
    `[CRITICAL] GOOGLE_CLIENT_ID is missing or invalid in .env. ` +
    `Expected a valid Google OAuth Client ID ending in '.apps.googleusercontent.com', but got: ${clientID || 'UNDEFINED'}. ` +
    `Please set it correctly in your .env file.`
  );
}

// Singleton client — created once per process, reused per request
let _client = null;
const getClient = () => {
  if (!_client) {
    console.log(`[GoogleAuth] Loaded CLIENT_ID: ${clientID}`);
    _client = new OAuth2Client(clientID);
  }
  return _client;
};

/**
 * verifyGoogleToken
 * ─────────────────────────────────────────────────────────────
 * @param {string} idToken   - Raw Google ID token from frontend
 * @returns {Promise<{googleId, email, name, picture, emailVerified}>}
 * @throws  {Error}          - If token is invalid, expired, or audience mismatch
 */
const verifyGoogleToken = async (idToken) => {
  const client = getClient();

  // Debug: Log the token prefix and client ID being used
  console.log(`[Auth-Debug] Client ID in use: ${clientID}`);
  console.log(`[Auth-Debug] Token prefix (first 50 chars): ${idToken.substring(0, 50)}...`);

  try {
    // verifyIdToken performs:
    //   1. Cryptographic signature verification (RSA)
    //   2. Expiry check
    //   3. Audience (aud) check against CLIENT_ID
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientID,
    });

    const payload = ticket.getPayload();

    // Google guarantees these fields exist for G-accounts
    console.log(`[Auth-Debug] Token verified successfully for email: ${payload.email}`);
    return {
      googleId:      payload.sub,              // Stable unique Google user ID
      email:         payload.email,
      emailVerified: payload.email_verified,   // Google-verified email flag
      name:          payload.name,
      picture:       payload.picture || null,
    };
  } catch (err) {
    console.error(`[Auth-Debug] Token verification error:`);
    console.error(`  Message: ${err.message}`);
    console.error(`  Code: ${err.code || 'N/A'}`);
    console.error(`  Expected audience: ${clientID}`);
    console.error('[Auth-Error-Message]:', err.message);
    console.error('[Auth-Error-Stack]:', err.stack);
    throw err;
  }
};

module.exports = { verifyGoogleToken };
