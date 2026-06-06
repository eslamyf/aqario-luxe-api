const i18next    = require('i18next');
const Backend    = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path       = require('path');

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng:   'en',
    preload:       ['en', 'ar'],
    supportedLngs: ['en', 'ar'],

    // ── Namespace ──────────────────────────────────────────
    ns:        ['translation'],
    defaultNS: 'translation',

    // ── Backend: load JSON from disk ───────────────────────
    backend: {
      loadPath: path.join(__dirname, '..', 'locales', '{{lng}}', '{{ns}}.json'),
    },

    interpolation: {
      escapeValue: true,           // Prevent XSS
      format: function(value, format, lng) {
        if (value && typeof value === 'object') {
          const plainValue = typeof value.toObject === 'function'
            ? value.toObject()
            : (typeof value.toJSON === 'function' ? value.toJSON() : value);

          if (plainValue && ('en' in plainValue || 'ar' in plainValue)) {
            return plainValue[lng] || plainValue.en || plainValue.ar || '';
          }
        }
        return value;
      }
    },

    // ── Misc ───────────────────────────────────────────────
    cleanCode: true,
    debug:     false,
  });

module.exports = { i18next, i18nMiddleware: middleware };
