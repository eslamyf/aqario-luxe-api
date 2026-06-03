/**
 * Jest globalSetup — runs ONCE before any test file is loaded.
 * Sets the env vars that jwt.js / server.js need at module-load time.
 */
module.exports = async () => {
  process.env.JWT_SECRET         = 'test_secret_key_at_least_32_chars_long_for_test';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_different_key_for_test_env';
  process.env.JWT_EXPIRES_IN     = '1d';
  process.env.NODE_ENV           = 'test';
  process.env.CLIENT_URL         = 'http://localhost:3000';
  process.env.REDIS_URL          = '';
  process.env.MONGOMS_SPAWN_TIMEOUT = '60000';
};
