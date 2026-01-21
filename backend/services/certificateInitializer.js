// backend/services/certificateInitializer.js
const CertificateManager = require('./certificateManager');

/**
 * Initialize certificates on application startup
 */
async function initializeCertificates(config = {}) {
  const certManager = new CertificateManager(config);

  try {
    console.log('[SSL] Checking certificates...');

    const status = await certManager.checkCertificates();

    if (!status.exists) {
      console.log('[SSL] No certificates found, generating...');
      await certManager.generateSelfSigned({
        domain: config.domain || 'hotspot.local',
        validityDays: config.validityDays || 365,
      });

      console.log('[SSL] ✓ Self-signed certificate generated successfully');
    } else if (!status.valid) {
      console.log('[SSL] Certificate is invalid, regenerating...');
      await certManager.generateSelfSigned({
        domain: config.domain || 'hotspot.local',
        validityDays: config.validityDays || 365,
      });

      console.log('[SSL] ✓ Certificate regenerated successfully');
    } else {
      console.log(`[SSL] ✓ Certificate valid for ${status.daysUntilExpiry} more days`);

      if (status.needsRenewal) {
        console.log('[SSL] Certificate needs renewal, will renew...');
        await certManager.autoRenew();
        console.log('[SSL] ✓ Certificate renewed');
      }
    }

    // Start auto-renewal cron
    certManager.startAutoRenewalCron();

    return certManager;
  } catch (error) {
    console.error('[SSL] Error initializing certificates:', error);
    throw error;
  }
}

module.exports = { initializeCertificates, CertificateManager };
