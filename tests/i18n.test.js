'use strict';

const path = require('path');
const fs = require('fs');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const localesBase = path.join(__dirname, '..', 'src', 'locales');

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      acc.push(...flattenKeys(v, key));
    } else {
      acc.push(key);
    }
    return acc;
  }, []);
}

describe('i18n Localization System', () => {
  let en, ar;
  let enKeys, arKeys;

  beforeAll((done) => {
    // Load translation files
    en = JSON.parse(fs.readFileSync(path.join(localesBase, 'en', 'translation.json'), 'utf8'));
    ar = JSON.parse(fs.readFileSync(path.join(localesBase, 'ar', 'translation.json'), 'utf8'));
    enKeys = flattenKeys(en);
    arKeys = flattenKeys(ar);

    // Initialise i18next engine
    i18next
      .use(Backend)
      .init(
        {
          supportedLngs: ['en', 'ar'],
          fallbackLng: 'en',
          preload: ['en', 'ar'],
          ns: ['translation'],
          defaultNS: 'translation',
          backend: {
            loadPath: path.join(localesBase, '{{lng}}', '{{ns}}.json'),
          },
          interpolation: { escapeValue: false },
          debug: false,
        },
        (err) => {
          if (err) return done(err);
          done();
        }
      );
  });

  it('should load translation files and have non-empty keys', () => {
    expect(en).toBeDefined();
    expect(ar).toBeDefined();
    expect(enKeys.length).toBeGreaterThan(0);
    expect(arKeys.length).toBeGreaterThan(0);
  });

  it('should have key parity between English and Arabic', () => {
    const missingInAR = enKeys.filter((k) => !arKeys.includes(k));
    const missingInEN = arKeys.filter((k) => !enKeys.includes(k));

    expect(missingInAR).toEqual([]);
    expect(missingInEN).toEqual([]);
  });

  describe('Key Resolution: English', () => {
    const EN_SPOT_CHECKS = [
      ['AUTH.EMAIL_IN_USE', 'Email already in use'],
      ['AUTH.INVALID_CREDENTIALS', 'Email or password is incorrect'],
      ['PROPERTY.NOT_FOUND', 'Property not found'],
      ['BOOKING.DATE_CONFLICT', 'The property is booked during this time range'],
      ['PAYMENT.NOT_FOUND', 'Payment not found'],
      ['KYC.SUBMITTED', 'KYC documents submitted successfully! Awaiting admin review.'],
      ['COMMON.NOT_AUTHORIZED', 'Not authorized'],
    ];

    EN_SPOT_CHECKS.forEach(([key, expected]) => {
      it(`resolves ${key} in English`, () => {
        const result = i18next.t(key, { lng: 'en' });
        expect(result).not.toBe(key);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Key Resolution: Arabic', () => {
    const AR_SPOT_CHECKS = [
      ['AUTH.EMAIL_IN_USE', 'البريد الإلكتروني مستخدم بالفعل'],
      ['AUTH.INVALID_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
      ['PROPERTY.NOT_FOUND', 'العقار غير موجود'],
      ['BOOKING.DATE_CONFLICT', 'العقار محجوز في هذا النطاق الزمني'],
      ['PAYMENT.NOT_FOUND', 'عملية الدفع غير موجودة'],
      ['COMMON.NOT_AUTHORIZED', 'غير مصرح لك'],
    ];

    AR_SPOT_CHECKS.forEach(([key, expected]) => {
      it(`resolves ${key} in Arabic`, () => {
        const result = i18next.t(key, { lng: 'ar' });
        expect(result).not.toBe(key);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Interpolation ({{variable}} substitution)', () => {
    const interpTests = [
      { key: 'ERRORS.CAST_ERROR', lng: 'en', vars: { path: '_id' }, contains: '_id' },
      { key: 'ERRORS.DUPLICATE_KEY', lng: 'ar', vars: { field: 'email' }, contains: 'email' },
      { key: 'NOTIFICATION.NEW_BID_MSG', lng: 'ar', vars: { name: 'Sara', amount: 2000 }, contains: 'Sara' },
      { key: 'COMMON.PATH_NOT_FOUND', lng: 'en', vars: { path: '/api/v1/test' }, contains: '/api/v1/test' },
    ];

    interpTests.forEach(({ key, lng, vars, contains }) => {
      it(`interpolates ${key} in ${lng.toUpperCase()}`, () => {
        const result = i18next.t(key, { lng, ...vars });
        expect(result).not.toBe(key);
        expect(result).toContain(contains);
      });
    });
  });

  it('should fallback to English for unsupported language', () => {
    const fallbackResult = i18next.t('AUTH.EMAIL_IN_USE', { lng: 'fr' });
    expect(fallbackResult).toBe('Email already in use');
  });

  it('should have no untranslated keys in either locale', () => {
    enKeys.forEach((key) => {
      const result = i18next.t(key, { lng: 'en' });
      expect(result).not.toBe(key);
    });

    arKeys.forEach((key) => {
      const result = i18next.t(key, { lng: 'ar' });
      expect(result).not.toBe(key);
    });
  });

  it('should cover all critical runtime keys in both locales', () => {
    const CRITICAL_KEYS = [
      // Auth pipeline
      'AUTH.EMAIL_IN_USE',
      'AUTH.INVALID_CREDENTIALS',
      'AUTH.VERIFY_EMAIL_FIRST',
      'AUTH.ACCOUNT_LOCKED',
      'AUTH.INVALID_REFRESH_TOKEN',
      'AUTH.LOGOUT_SUCCESS',
      // Property
      'PROPERTY.NOT_FOUND',
      'PROPERTY.NOT_AVAILABLE',
      'PROPERTY.FOR_SALE_ONLY',
      // Booking
      'BOOKING.NOT_FOUND',
      'BOOKING.DATE_CONFLICT',
      'BOOKING.APPROVED',
      'BOOKING.REJECTED',
      // Payment
      'PAYMENT.NOT_FOUND',
      'PAYMENT.ALREADY_VERIFIED',
      'PAYMENT.INITIATED',
      // Auction
      'AUCTION.NOT_FOUND',
      'AUCTION.CLOSED_WITH_WINNER',
      'AUCTION.CLOSED_NO_BIDS',
      // Bid
      'BID.MINIMUM_BID',
      'BID.OWN_AUCTION',
      'BID.PLACED',
      // KYC
      'KYC.REQUIRED',
      'KYC.SUBMITTED',
      'KYC.APPROVED',
      'KYC.REJECTED',
      // Common
      'COMMON.NOT_AUTHORIZED',
      'COMMON.ACCOUNT_SUSPENDED',
      // Errors
      'ERRORS.CAST_ERROR',
      'ERRORS.DUPLICATE_KEY',
      // Validation
      'VALIDATION.EMAIL_INVALID',
      'VALIDATION.PASSWORD_MIN',
    ];

    CRITICAL_KEYS.forEach((key) => {
      const enVal = i18next.t(key, { lng: 'en' });
      const arVal = i18next.t(key, { lng: 'ar' });

      expect(enVal).not.toBe(key);
      expect(arVal).not.toBe(key);
    });
  });
});
