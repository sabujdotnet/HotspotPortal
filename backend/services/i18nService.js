// backend/services/i18nService.js
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * Multi-Language (i18n) Service
 * Supports 10+ languages with RTL support
 */
class I18nService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.localesDir = config.localesDir || path.join(__dirname, '../../locales');
    this.defaultLanguage = config.defaultLanguage || 'en';
    this.supportedLanguages = config.supportedLanguages || [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ar', 'hi'
    ];
    this.rtlLanguages = ['ar', 'he', 'ur', 'fa'];
    this.logger = config.logger || console;
    this.translations = {};

    this.loadTranslations();
  }

  /**
   * Load all translation files
   */
  loadTranslations() {
    try {
      this.logger.info('Loading translations...');

      for (const lang of this.supportedLanguages) {
        const langFile = path.join(this.localesDir, `${lang}.json`);

        if (fs.existsSync(langFile)) {
          const content = fs.readFileSync(langFile, 'utf8');
          this.translations[lang] = JSON.parse(content);
          this.logger.info(`✓ Loaded language: ${lang}`);
        } else {
          this.logger.warn(`Language file not found: ${langFile}`);
        }
      }

      this.logger.info(`Loaded ${Object.keys(this.translations).length} languages`);
    } catch (error) {
      this.logger.error('Error loading translations:', error);
    }
  }

  /**
   * Get translation
   */
  t(key, lang = this.defaultLanguage, params = {}) {
    try {
      // Ensure language exists, fallback to default
      if (!this.translations[lang]) {
        lang = this.defaultLanguage;
      }

      let translation = this.translations[lang][key] || key;

      // Replace parameters
      Object.keys(params).forEach((param) => {
        translation = translation.replace(`{{${param}}}`, params[param]);
      });

      return translation;
    } catch (error) {
      this.logger.error(`Error getting translation for ${key}:`, error);
      return key;
    }
  }

  /**
   * Translate entire object
   */
  translateObject(obj, lang = this.defaultLanguage) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const translated = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        translated[key] = this.t(value, lang);
      } else if (typeof value === 'object') {
        translated[key] = this.translateObject(value, lang);
      } else {
        translated[key] = value;
      }
    }

    return translated;
  }

  /**
   * Get language list with metadata
   */
  getLanguages() {
    const languageMetadata = {
      en: { name: 'English', nativeName: 'English', rtl: false },
      es: { name: 'Spanish', nativeName: 'Español', rtl: false },
      fr: { name: 'French', nativeName: 'Français', rtl: false },
      de: { name: 'German', nativeName: 'Deutsch', rtl: false },
      it: { name: 'Italian', nativeName: 'Italiano', rtl: false },
      pt: { name: 'Portuguese', nativeName: 'Português', rtl: false },
      ru: { name: 'Russian', nativeName: 'Русский', rtl: false },
      zh: { name: 'Chinese', nativeName: '中文', rtl: false },
      ja: { name: 'Japanese', nativeName: '日本語', rtl: false },
      ar: { name: 'Arabic', nativeName: 'العربية', rtl: true },
      hi: { name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
    };

    return this.supportedLanguages.map((lang) => ({
      code: lang,
      ...languageMetadata[lang],
    }));
  }

  /**
   * Check if language is RTL
   */
  isRTL(lang) {
    return this.rtlLanguages.includes(lang);
  }

  /**
   * Add or update translation
   */
  setTranslation(lang, key, value) {
    try {
      if (!this.translations[lang]) {
        this.translations[lang] = {};
      }

      this.translations[lang][key] = value;

      // Save to file
      const langFile = path.join(this.localesDir, `${lang}.json`);
      fs.writeFileSync(langFile, JSON.stringify(this.translations[lang], null, 2));

      this.emit('translation:updated', { lang, key, value });
      return true;
    } catch (error) {
      this.logger.error('Error setting translation:', error);
      return false;
    }
  }

  /**
   * Add new language
   */
  addLanguage(langCode, langName) {
    try {
      if (this.supportedLanguages.includes(langCode)) {
        throw new Error(`Language already exists: ${langCode}`);
      }

      this.supportedLanguages.push(langCode);
      this.translations[langCode] = {};

      const langFile = path.join(this.localesDir, `${langCode}.json`);
      fs.writeFileSync(langFile, JSON.stringify({}, null, 2));

      this.logger.info(`Added new language: ${langCode}`);
      this.emit('language:added', { langCode, langName });

      return true;
    } catch (error) {
      this.logger.error('Error adding language:', error);
      return false;
    }
  }

  /**
   * Detect language from request
   */
  detectLanguage(acceptLanguage) {
    try {
      if (!acceptLanguage) return this.defaultLanguage;

      // Parse Accept-Language header
      const languages = acceptLanguage
        .split(',')
        .map((lang) => {
          const parts = lang.trim().split(';');
          const code = parts[0].split('-')[0];
          const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1;
          return { code, quality };
        })
        .sort((a, b) => b.quality - a.quality);

      // Find supported language
      for (const lang of languages) {
        if (this.supportedLanguages.includes(lang.code)) {
          return lang.code;
        }
      }

      return this.defaultLanguage;
    } catch (error) {
      this.logger.error('Error detecting language:', error);
      return this.defaultLanguage;
    }
  }

  /**
   * Get text direction based on language
   */
  getTextDirection(lang) {
    return this.isRTL(lang) ? 'rtl' : 'ltr';
  }

  /**
   * Format date based on language
   */
  formatDate(date, lang = this.defaultLanguage) {
    const dateFormatter = new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return dateFormatter.format(new Date(date));
  }

  /**
   * Format currency based on language
   */
  formatCurrency(amount, currency = 'USD', lang = this.defaultLanguage) {
    const currencyFormatter = new Intl.NumberFormat(lang, {
      style: 'currency',
      currency,
    });

    return currencyFormatter.format(amount);
  }

  /**
   * Format number based on language
   */
  formatNumber(number, lang = this.defaultLanguage) {
    const numberFormatter = new Intl.NumberFormat(lang);
    return numberFormatter.format(number);
  }

  /**
   * Export all translations
   */
  exportTranslations() {
    return this.translations;
  }

  /**
   * Import translations from file
   */
  importTranslations(langCode, data) {
    try {
      if (!this.supportedLanguages.includes(langCode)) {
        this.supportedLanguages.push(langCode);
      }

      this.translations[langCode] = data;

      const langFile = path.join(this.localesDir, `${langCode}.json`);
      fs.writeFileSync(langFile, JSON.stringify(data, null, 2));

      this.logger.info(`Imported translations for: ${langCode}`);
      return true;
    } catch (error) {
      this.logger.error('Error importing translations:', error);
      return false;
    }
  }
}

module.exports = I18nService;
