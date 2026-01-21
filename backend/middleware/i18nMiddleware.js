
// backend/middleware/i18nMiddleware.js
/**
 * i18n Middleware
 * Detects language and attaches i18n service to request
 */
module.exports = (i18nService) => {
  return (req, res, next) => {
    // Get language from query, cookie, header, or default
    let lang = 
      req.query.lang ||
      req.cookies?.lang ||
      i18nService.detectLanguage(req.headers['accept-language']) ||
      i18nService.defaultLanguage;

    // Validate language
    if (!i18nService.supportedLanguages.includes(lang)) {
      lang = i18nService.defaultLanguage;
    }

    // Attach to request
    req.lang = lang;
    req.i18n = {
      t: (key, params) => i18nService.t(key, lang, params),
      lang,
      isRTL: i18nService.isRTL(lang),
      direction: i18nService.getTextDirection(lang),
      formatDate: (date) => i18nService.formatDate(date, lang),
      formatCurrency: (amount, currency) => i18nService.formatCurrency(amount, currency, lang),
      formatNumber: (number) => i18nService.formatNumber(number, lang),
    };

    // Set response headers
    res.set('Content-Language', lang);

    next();
  };
};
