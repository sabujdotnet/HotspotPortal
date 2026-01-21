// backend/routes/certificate.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

/**
 * Certificate Management Routes
 */

module.exports = (certManager) => {
  /**
   * GET /api/certificates/info
   * Get certificate information
   */
  router.get('/info', authMiddleware, async (req, res) => {
    try {
      const info = await certManager.getCertificateInfo();
      res.json(info || { error: 'No certificate found' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/certificates/status
   * Get certificate status
   */
  router.get('/status', authMiddleware, async (req, res) => {
    try {
      const status = await certManager.checkCertificates();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/certificates/generate-self-signed
   * Generate self-signed certificate
   */
  router.post('/generate-self-signed', authMiddleware, async (req, res) => {
    try {
      const { domain, validityDays } = req.body;
      const result = await certManager.generateSelfSigned({
        domain: domain || 'hotspot.local',
        validityDays: validityDays || 365,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/certificates/generate-letsencrypt
   * Generate Let's Encrypt certificate
   */
  router.post('/generate-letsencrypt', authMiddleware, async (req, res) => {
    try {
      const { domain, email } = req.body;
      const result = await certManager.generateLetsEncrypt({
        domain,
        email,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/certificates/renew
   * Manually renew certificate
   */
  router.post('/renew', authMiddleware, async (req, res) => {
    try {
      const result = await certManager.autoRenew();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/certificates/backup
   * Backup current certificate
   */
  router.post('/backup', authMiddleware, async (req, res) => {
    try {
      const { backupDir } = req.body;
      const result = certManager.backupCertificate(backupDir);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
