// plugins/2fa-authentication/index.js
const express = require('express');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const BasePlugin = require('../../core/BasePlugin');

class TwoFactorAuthPlugin extends BasePlugin {
  constructor(options) {
    super(options);
    this.routePrefix = '/plugins/2fa';
    this.setupRoutes();
  }

  async init() {
    this.logger.info('2FA Authentication Plugin initialized');

    this.registerHook('auth:login', async (user) => {
      await this.checkTwoFactor(user);
    });
  }

  setupRoutes() {
    const router = express.Router();

    // Generate 2FA secret
    router.post('/setup', async (req, res) => {
      try {
        const { username } = req.body;
        const secret = speakeasy.generateSecret({
          name: `Hotspot (${username})`,
          length: 32,
        });

        const qrCode = await QRCode.toDataURL(secret.otpauth_url);

        res.json({
          secret: secret.base32,
          qrCode,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Verify 2FA code
    router.post('/verify', async (req, res) => {
      try {
        const { username, token, secret } = req.body;
        const verified = speakeasy.totp.verify({
          secret,
          encoding: 'base32',
          token,
        });

        if (verified) {
          res.json({ verified: true });
        } else {
          res.status(400).json({ error: 'Invalid 2FA code' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.routes = router;
  }

  async checkTwoFactor(user) {
    this.logger.debug(`Checking 2FA for user: ${user.username}`);
  }
}

module.exports = TwoFactorAuthPlugin;
