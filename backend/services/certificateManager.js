// backend/services/certificateManager.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const { promisify } = require('util');
const acme = require('acme');
const forge = require('node-forge');
const cron = require('node-cron');

const execPromise = promisify(exec);

/**
 * Certificate Manager
 * Handles SSL/TLS certificate generation and renewal
 * Supports: Self-signed, Let's Encrypt (ACME), Custom
 */
class CertificateManager {
  constructor(config = {}) {
    this.certDir = config.certDir || './nginx/ssl';
    this.certFile = path.join(this.certDir, 'cert.pem');
    this.keyFile = path.join(this.certDir, 'key.pem');
    this.mode = config.mode || 'self-signed'; // self-signed, letsencrypt, custom
    this.domain = config.domain || 'hotspot.local';
    this.environment = config.environment || process.env.NODE_ENV || 'development';
    this.renewalDays = config.renewalDays || 30; // Renew 30 days before expiry
    this.acmeConfig = config.acmeConfig || {};
    this.logger = config.logger || console;

    this.ensureDirectory();
  }

  /**
   * Ensure certificate directory exists
   */
  ensureDirectory() {
    if (!fs.existsSync(this.certDir)) {
      fs.mkdirSync(this.certDir, { recursive: true });
      this.logger.info(`Created certificate directory: ${this.certDir}`);
    }
  }

  /**
   * Check if certificates exist and are valid
   */
  async checkCertificates() {
    try {
      if (!fs.existsSync(this.certFile) || !fs.existsSync(this.keyFile)) {
        this.logger.warn('Certificate or key file not found');
        return { exists: false, valid: false, reason: 'Files not found' };
      }

      const cert = fs.readFileSync(this.certFile, 'utf8');
      const expiryDate = this.getCertificateExpiry(cert);

      if (!expiryDate) {
        return { exists: true, valid: false, reason: 'Could not parse certificate' };
      }

      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

      return {
        exists: true,
        valid: daysUntilExpiry > 0,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry,
        needsRenewal: daysUntilExpiry <= this.renewalDays,
      };
    } catch (error) {
      this.logger.error('Error checking certificates:', error);
      return { exists: false, valid: false, reason: error.message };
    }
  }

  /**
   * Extract expiry date from certificate
   */
  getCertificateExpiry(certPem) {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      return cert.validity.notAfter;
    } catch (error) {
      this.logger.error('Error parsing certificate:', error);
      return null;
    }
  }

  /**
   * Generate self-signed certificate (Development/Quick setup)
   */
  async generateSelfSigned(options = {}) {
    try {
      this.logger.info('Generating self-signed certificate...');

      const commonName = options.domain || this.domain;
      const country = options.country || 'US';
      const state = options.state || 'State';
      const locality = options.locality || 'City';
      const organization = options.organization || 'Organization';
      const validityDays = options.validityDays || 365;

      // Use OpenSSL if available (faster and more reliable)
      if (await this.isOpenSSLAvailable()) {
        return await this.generateSelfSignedOpenSSL({
          commonName,
          country,
          state,
          locality,
          organization,
          validityDays,
        });
      }

      // Fallback to node-forge
      return await this.generateSelfSignedForge({
        commonName,
        country,
        state,
        locality,
        organization,
        validityDays,
      });
    } catch (error) {
      this.logger.error('Error generating self-signed certificate:', error);
      throw error;
    }
  }

  /**
   * Check if OpenSSL is available
   */
  async isOpenSSLAvailable() {
    try {
      await execPromise('openssl version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate self-signed certificate using OpenSSL
   */
  async generateSelfSignedOpenSSL(options) {
    try {
      const subject = `/C=${options.country}/ST=${options.state}/L=${options.locality}/O=${options.organization}/CN=${options.commonName}`;

      const command = `openssl req -x509 -newkey rsa:2048 -keyout ${this.keyFile} -out ${this.certFile} -days ${options.validityDays} -nodes -subj "${subject}" -addext "subjectAltName=DNS:${options.commonName},DNS:*.${options.commonName}"`;

      await execPromise(command);

      this.logger.info(`Self-signed certificate generated: ${this.certFile}`);
      return {
        success: true,
        method: 'openssl',
        certFile: this.certFile,
        keyFile: this.keyFile,
        domain: options.commonName,
        validityDays: options.validityDays,
      };
    } catch (error) {
      this.logger.error('OpenSSL generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate self-signed certificate using node-forge
   */
  async generateSelfSignedForge(options) {
    try {
      // Generate key pair
      const keys = forge.pki.rsa.generateKeyPair(2048);

      // Create certificate
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setDate(
        cert.validity.notAfter.getDate() + options.validityDays
      );

      const attrs = [
        { name: 'commonName', value: options.commonName },
        { name: 'countryName', value: options.country },
        { name: 'stateOrProvinceName', value: options.state },
        { name: 'localityName', value: options.locality },
        { name: 'organizationName', value: options.organization },
      ];

      cert.setSubject(attrs);
      cert.setIssuer(attrs);

      // Add extensions
      cert.setExtensions([
        {
          name: 'basicConstraints',
          cA: false,
        },
        {
          name: 'keyUsage',
          keyCertSign: false,
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true,
          dataEncipherment: true,
        },
        {
          name: 'extKeyUsage',
          serverAuth: true,
          clientAuth: false,
        },
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: options.commonName },
            { type: 2, value: `*.${options.commonName}` },
          ],
        },
      ]);

      // Self-sign
      cert.sign(keys.privateKey, forge.md.sha256.create());

      // Convert to PEM
      const certPem = forge.pki.certificateToPem(cert);
      const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

      // Write to files
      fs.writeFileSync(this.certFile, certPem);
      fs.writeFileSync(this.keyFile, keyPem);
      fs.chmodSync(this.keyFile, 0o600); // Secure permissions

      this.logger.info(`Self-signed certificate generated: ${this.certFile}`);
      return {
        success: true,
        method: 'forge',
        certFile: this.certFile,
        keyFile: this.keyFile,
        domain: options.commonName,
        validityDays: options.validityDays,
      };
    } catch (error) {
      this.logger.error('Forge generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate Let's Encrypt certificate using ACME protocol
   */
  async generateLetsEncrypt(options = {}) {
    try {
      if (this.environment !== 'production') {
        this.logger.warn('Let\'s Encrypt only recommended for production');
      }

      this.logger.info('Generating Let\'s Encrypt certificate...');

      const domain = options.domain || this.domain;
      const email = options.email || this.acmeConfig.email;

      if (!email) {
        throw new Error('Email required for Let\'s Encrypt');
      }

      // This is a simplified example - production would need full ACME implementation
      const command = `certbot certonly --standalone -d ${domain} --email ${email} --agree-tos --non-interactive`;

      await execPromise(command);

      const letsEncryptDir = `/etc/letsencrypt/live/${domain}`;
      fs.copyFileSync(`${letsEncryptDir}/fullchain.pem`, this.certFile);
      fs.copyFileSync(`${letsEncryptDir}/privkey.pem`, this.keyFile);
      fs.chmodSync(this.keyFile, 0o600);

      this.logger.info(`Let's Encrypt certificate generated: ${this.certFile}`);
      return {
        success: true,
        method: 'letsencrypt',
        certFile: this.certFile,
        keyFile: this.keyFile,
        domain,
      };
    } catch (error) {
      this.logger.error('Let\'s Encrypt generation failed:', error);
      throw error;
    }
  }

  /**
   * Auto-renew certificate if needed
   */
  async autoRenew() {
    try {
      const status = await this.checkCertificates();

      if (!status.exists) {
        this.logger.info('No certificates found, generating...');
        return await this.generateSelfSigned();
      }

      if (status.needsRenewal) {
        this.logger.info(`Certificate renewal needed (${status.daysUntilExpiry} days until expiry)`);

        if (this.mode === 'letsencrypt') {
          return await this.generateLetsEncrypt();
        } else {
          return await this.generateSelfSigned();
        }
      }

      this.logger.debug(`Certificate valid for ${status.daysUntilExpiry} more days`);
      return { success: true, renewed: false, status };
    } catch (error) {
      this.logger.error('Auto-renewal failed:', error);
      throw error;
    }
  }

  /**
   * Start automatic renewal cron job
   */
  startAutoRenewalCron() {
    // Run daily at 2:00 AM
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        this.logger.info('Running scheduled certificate renewal check...');
        await this.autoRenew();
      } catch (error) {
        this.logger.error('Scheduled renewal failed:', error);
      }
    });

    this.logger.info('Certificate auto-renewal cron job started');
    return job;
  }

  /**
   * Get certificate information
   */
  async getCertificateInfo() {
    try {
      const status = await this.checkCertificates();

      if (!status.exists) {
        return null;
      }

      const cert = fs.readFileSync(this.certFile, 'utf8');
      const parsed = forge.pki.certificateFromPem(cert);

      return {
        subject: this._formatDN(parsed.subject),
        issuer: this._formatDN(parsed.issuer),
        validFrom: parsed.validity.notBefore.toISOString(),
        validUntil: parsed.validity.notAfter.toISOString(),
        daysUntilExpiry: Math.floor(
          (parsed.validity.notAfter - new Date()) / (1000 * 60 * 60 * 24)
        ),
        serialNumber: parsed.serialNumber,
        fingerprint: this._getCertificateFingerprint(cert),
        ...status,
      };
    } catch (error) {
      this.logger.error('Error getting certificate info:', error);
      return null;
    }
  }

  /**
   * Format Distinguished Name
   */
  _formatDN(dn) {
    const attrs = {};
    dn.attributes.forEach((attr) => {
      attrs[attr.name] = attr.value;
    });
    return attrs;
  }

  /**
   * Get certificate fingerprint (SHA256)
   */
  _getCertificateFingerprint(certPem) {
    const crypto = require('crypto');
    const cert = forge.pki.certificateFromPem(certPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).bytes();
    const fingerprint = crypto
      .createHash('sha256')
      .update(Buffer.from(der, 'binary'))
      .digest('hex');
    return fingerprint;
  }

  /**
   * Backup certificate
   */
  backupCertificate(backupDir = './backups') {
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupCert = path.join(backupDir, `cert-${timestamp}.pem`);
      const backupKey = path.join(backupDir, `key-${timestamp}.pem`);

      fs.copyFileSync(this.certFile, backupCert);
      fs.copyFileSync(this.keyFile, backupKey);
      fs.chmodSync(backupKey, 0o600);

      this.logger.info(`Certificate backed up to ${backupDir}`);
      return { backupCert, backupKey, timestamp };
    } catch (error) {
      this.logger.error('Certificate backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore certificate from backup
   */
  restoreCertificate(backupCert, backupKey) {
    try {
      fs.copyFileSync(backupCert, this.certFile);
      fs.copyFileSync(backupKey, this.keyFile);
      fs.chmodSync(this.keyFile, 0o600);

      this.logger.info('Certificate restored from backup');
      return { success: true };
    } catch (error) {
      this.logger.error('Certificate restore failed:', error);
      throw error;
    }
  }
}

module.exports = CertificateManager;
