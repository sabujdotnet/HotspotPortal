// backend/routes/i18n.js
const express = require('express');
const router = express.Router();

/**
 * i18n API Routes
 */

module.exports = (i18nService) => {
  /**
   * GET /api/i18n/languages
   * Get available languages
   */
  router.get('/languages', (req, res) => {
    const languages = i18nService.getLanguages();
    res.json(languages);
  });

  /**
   * GET /api/i18n/translations/:lang
   * Get all translations for a language
   */
  router.get('/translations/:lang', (req, res) => {
    const { lang } = req.params;
    const translations = i18nService.translations[lang];

    if (!translations) {
      return res.status(404).json({ error: 'Language not found' });
    }

    res.json(translations);
  });

  /**
   * GET /api/i18n/direction/:lang
   * Get text direction for language
   */
  router.get('/direction/:lang', (req, res) => {
    const { lang } = req.params;
    const direction = i18nService.getTextDirection(lang);

    res.json({ lang, direction, isRTL: i18nService.isRTL(lang) });
  });

  /**
   * POST /api/i18n/translations/:lang/:key
   * Set translation
   */
  router.post('/translations/:lang/:key', (req, res) => {
    const { lang, key } = req.params;
    const { value } = req.body;

    const success = i18nService.setTranslation(lang, key, value);

    if (success) {
      res.json({ success: true, message: 'Translation updated' });
    } else {
      res.status(400).json({ error: 'Failed to update translation' });
    }
  });

  /**
   * GET /api/i18n/export/:lang
   * Export translations
   */
  router.get('/export/:lang', (req, res) => {
    const { lang } = req.params;
    const translations = i18nService.translations[lang];

    if (!translations) {
      return res.status(404).json({ error: 'Language not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="translations-${lang}.json"`);
    res.send(JSON.stringify(translations, null, 2));
  });

  /**
   * POST /api/i18n/import/:lang
   * Import translations
   */
  router.post('/import/:lang', (req, res) => {
    const { lang } = req.params;
    const { translations } = req.body;

    const success = i18nService.importTranslations(lang, translations);

    if (success) {
      res.json({ success: true, message: 'Translations imported' });
    } else {
      res.status(400).json({ error: 'Failed to import translations' });
    }
  });

  return router;
};
