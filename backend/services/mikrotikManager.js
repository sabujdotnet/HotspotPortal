// backend/services/mikrotikManager.js
const axios = require('axios');
const EventEmitter = require('events');

/**
 * Advanced Mikrotik Manager
 * Handles REST API, RADIUS, User Manager, and Queue management
 */
class MikrotikManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.host = config.host || process.env.MIKROTIK_HOST;
    this.user = config.user || process.env.MIKROTIK_USER;
    this.pass = config.pass || process.env.MIKROTIK_PASS;
    this.port = config.port || 8728;
    this.apiPort = config.apiPort || 8728;
    this.useSSL = config.useSSL || false;
    this.timeout = config.timeout || 5000;
    this.logger = config.logger || console;

    this.baseURL = `http${this.useSSL ? 's' : ''}://${this.host}:${this.apiPort}/rest`;
    this.auth = { username: this.user, password: this.pass };

    // Cache for performance
    this.cache = {
      users: null,
      queues: null,
      aps: null,
      lastUpdate: 0,
    };
  }

  /**
   * Test Mikrotik connection
   */
  async testConnection() {
    try {
      this.logger.info('Testing Mikrotik connection...');
      const response = await axios.get(`${this.baseURL}/system/identity`, {
        auth: this.auth,
        timeout: this.timeout,
      });
      this.logger.info(`✓ Connected to Mikrotik: ${response.data[0].name}`);
      return { success: true, identity: response.data[0].name };
    } catch (error) {
      this.logger.error('Mikrotik connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * ==================== HOTSPOT USER MANAGEMENT ====================
   */

  /**
   * Create hotspot user
   */
  async createHotspotUser(username, password, options = {}) {
    try {
      const payload = {
        name: username,
        password: password,
        'limit-bytes-out': options.bandwidthLimit || 0,
        'limit-uptime': options.sessionTimeout || 0,
        'limit-bytes-in': options.uploadLimit || 0,
        ...options,
      };

      const response = await axios.post(
        `${this.baseURL}/ip/hotspot/user`,
        payload,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Created hotspot user: ${username}`);
      this.cache.users = null; // Invalidate cache
      return { success: true, user: response.data };
    } catch (error) {
      this.logger.error(`Error creating hotspot user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update hotspot user
   */
  async updateHotspotUser(username, updates = {}) {
    try {
      // First get the user ID
      const users = await this.getHotspotUsers();
      const user = users.find((u) => u.name === username);

      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      const response = await axios.put(
        `${this.baseURL}/ip/hotspot/user/${user['.id']}`,
        updates,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Updated hotspot user: ${username}`);
      this.cache.users = null;
      return { success: true, user: response.data };
    } catch (error) {
      this.logger.error(`Error updating hotspot user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete hotspot user
   */
  async deleteHotspotUser(username) {
    try {
      const users = await this.getHotspotUsers();
      const user = users.find((u) => u.name === username);

      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      await axios.delete(
        `${this.baseURL}/ip/hotspot/user/${user['.id']}`,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Deleted hotspot user: ${username}`);
      this.cache.users = null;
      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting hotspot user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all hotspot users
   */
  async getHotspotUsers() {
    try {
      // Use cache if fresh (5 minutes)
      if (
        this.cache.users &&
        Date.now() - this.cache.lastUpdate < 5 * 60 * 1000
      ) {
        return this.cache.users;
      }

      const response = await axios.get(
        `${this.baseURL}/ip/hotspot/user`,
        { auth: this.auth, timeout: this.timeout }
      );

      this.cache.users = response.data;
      this.cache.lastUpdate = Date.now();
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting hotspot users: ${error.message}`);
      return [];
    }
  }

  /**
   * Get hotspot user statistics
   */
  async getHotspotUserStats(username) {
    try {
      const response = await axios.get(
        `${this.baseURL}/ip/hotspot/stat`,
        { auth: this.auth, timeout: this.timeout }
      );

      const userStats = response.data.find((s) => s.user === username);
      return userStats || null;
    } catch (error) {
      this.logger.error(
        `Error getting hotspot user stats: ${error.message}`
      );
      return null;
    }
  }

  /**
   * ==================== RADIUS SERVER MANAGEMENT ====================
   */

  /**
   * Configure RADIUS server
   */
  async configureRADIUSServer(config = {}) {
    try {
      const radiusConfig = {
        'address': config.address || '127.0.0.1',
        'secret': config.secret || 'hotspot-radius-secret',
        'service': config.service || 'hotspot',
        'timeout': config.timeout || 3,
        'retries': config.retries || 3,
      };

      // Set RADIUS server
      const response = await axios.post(
        `${this.baseURL}/radius`,
        radiusConfig,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info('RADIUS server configured');
      return { success: true, config: response.data };
    } catch (error) {
      this.logger.error(`Error configuring RADIUS: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enable RADIUS authentication for hotspot
   */
  async enableRADIUSAuth(hotspotName = 'hotspot1') {
    try {
      const response = await axios.get(
        `${this.baseURL}/ip/hotspot`,
        { auth: this.auth, timeout: this.timeout }
      );

      const hotspot = response.data.find((h) => h.name === hotspotName);
      if (!hotspot) {
        throw new Error(`Hotspot not found: ${hotspotName}`);
      }

      // Update hotspot to use RADIUS
      await axios.put(
        `${this.baseURL}/ip/hotspot/${hotspot['.id']}`,
        { 'use-radius': 'yes' },
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`RADIUS enabled for hotspot: ${hotspotName}`);
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error enabling RADIUS auth: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * ==================== USER MANAGER INTEGRATION ====================
   */

  /**
   * Create user in User Manager
   */
  async createUserManagerUser(username, password, options = {}) {
    try {
      const payload = {
        'username': username,
        'password': password,
        'comment': options.comment || username,
        'group': options.group || 'default',
        'profile': options.profile || 'default',
        ...options,
      };

      const response = await axios.post(
        `${this.baseURL}/user-manager/user`,
        payload,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Created User Manager user: ${username}`);
      return { success: true, user: response.data };
    } catch (error) {
      this.logger.error(`Error creating User Manager user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get User Manager users
   */
  async getUserManagerUsers() {
    try {
      const response = await axios.get(
        `${this.baseURL}/user-manager/user`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error getting User Manager users: ${error.message}`);
      return [];
    }
  }

  /**
   * Create User Manager user account
   */
  async createUserAccount(username, options = {}) {
    try {
      const account = {
        'username': username,
        'account-type': options.accountType || 'prepaid',
        'profile': options.profile || 'default',
        'upload-limit': options.uploadLimit || 0,
        'download-limit': options.downloadLimit || 0,
        'upload-speed-limit': options.uploadSpeed || 0,
        'download-speed-limit': options.downloadSpeed || 0,
        ...options,
      };

      const response = await axios.post(
        `${this.baseURL}/user-manager/user-account`,
        account,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Created User Manager account: ${username}`);
      return { success: true, account: response.data };
    } catch (error) {
      this.logger.error(
        `Error creating User Manager account: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * ==================== QUEUE MANAGEMENT ====================
   */

  /**
   * Create queue (bandwidth limit)
   */
  async createQueue(username, options = {}) {
    try {
      const queue = {
        'name': `queue-${username}`,
        'target': options.target || `${username}/32`,
        'max-limit': options.maxLimit || '10M/10M',
        'limit-at': options.limitAt || '5M/5M',
        'burst-limit': options.burstLimit || '15M/15M',
        'burst-time': options.burstTime || '10s',
        'comment': options.comment || `Queue for ${username}`,
        ...options,
      };

      const response = await axios.post(
        `${this.baseURL}/queue/simple`,
        queue,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Created queue for user: ${username}`);
      this.cache.queues = null;
      return { success: true, queue: response.data };
    } catch (error) {
      this.logger.error(`Error creating queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update queue bandwidth
   */
  async updateQueueBandwidth(username, bandwidth = {}) {
    try {
      const queues = await this.getQueues();
      const queue = queues.find((q) => q.name === `queue-${username}`);

      if (!queue) {
        throw new Error(`Queue not found for user: ${username}`);
      }

      const updates = {
        'max-limit': bandwidth.maxLimit || '10M/10M',
        'limit-at': bandwidth.limitAt || '5M/5M',
        'burst-limit': bandwidth.burstLimit || '15M/15M',
      };

      await axios.put(
        `${this.baseURL}/queue/simple/${queue['.id']}`,
        updates,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Updated queue bandwidth for: ${username}`);
      this.cache.queues = null;
      return { success: true };
    } catch (error) {
      this.logger.error(`Error updating queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete queue
   */
  async deleteQueue(username) {
    try {
      const queues = await this.getQueues();
      const queue = queues.find((q) => q.name === `queue-${username}`);

      if (!queue) {
        throw new Error(`Queue not found for user: ${username}`);
      }

      await axios.delete(
        `${this.baseURL}/queue/simple/${queue['.id']}`,
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info(`Deleted queue for user: ${username}`);
      this.cache.queues = null;
      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all queues
   */
  async getQueues() {
    try {
      if (
        this.cache.queues &&
        Date.now() - this.cache.lastUpdate < 5 * 60 * 1000
      ) {
        return this.cache.queues;
      }

      const response = await axios.get(
        `${this.baseURL}/queue/simple`,
        { auth: this.auth, timeout: this.timeout }
      );

      this.cache.queues = response.data;
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting queues: ${error.message}`);
      return [];
    }
  }

  /**
   * ==================== WIRELESS ACCESS POINTS ====================
   */

  /**
   * Get all wireless interfaces (APs)
   */
  async getAccessPoints() {
    try {
      if (
        this.cache.aps &&
        Date.now() - this.cache.lastUpdate < 5 * 60 * 1000
      ) {
        return this.cache.aps;
      }

      const response = await axios.get(
        `${this.baseURL}/interface/wireless`,
        { auth: this.auth, timeout: this.timeout }
      );

      this.cache.aps = response.data.map((ap) => ({
        id: ap['.id'],
        name: ap.name,
        ssid: ap.ssid,
        frequency: ap.frequency,
        band: ap.band,
        mode: ap.mode,
        running: ap.running,
        disabled: ap.disabled,
      }));

      return this.cache.aps;
    } catch (error) {
      this.logger.error(`Error getting access points: ${error.message}`);
      return [];
    }
  }

  /**
   * Get wireless statistics
   */
  async getAPStatistics() {
    try {
      const response = await axios.get(
        `${this.baseURL}/interface/wireless/stats`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error getting AP statistics: ${error.message}`);
      return [];
    }
  }

  /**
   * Get connected clients on AP
   */
  async getConnectedClients(interfaceName = null) {
    try {
      const response = await axios.get(
        `${this.baseURL}/interface/wireless/registration-table`,
        { auth: this.auth, timeout: this.timeout }
      );

      let clients = response.data;

      if (interfaceName) {
        clients = clients.filter(
          (c) => c.interface === interfaceName
        );
      }

      return clients.map((c) => ({
        interface: c.interface,
        macAddress: c['mac-address'],
        ipAddress: c['ipv4-address'] || 'N/A',
        signal: c.signal,
        rssi: c.rssi,
        txRate: c['tx-rate'],
        rxRate: c['rx-rate'],
        uptime: c.uptime,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting connected clients: ${error.message}`
      );
      return [];
    }
  }

  /**
   * ==================== ROUTER INFORMATION ====================
   */

  /**
   * Get router identity and info
   */
  async getRouterInfo() {
    try {
      const response = await axios.get(
        `${this.baseURL}/system/identity`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data[0];
    } catch (error) {
      this.logger.error(`Error getting router info: ${error.message}`);
      return null;
    }
  }

  /**
   * Get router resources (CPU, memory, etc.)
   */
  async getRouterResources() {
    try {
      const response = await axios.get(
        `${this.baseURL}/system/resource`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data[0];
    } catch (error) {
      this.logger.error(`Error getting router resources: ${error.message}`);
      return null;
    }
  }

  /**
   * Get system uptime and info
   */
  async getSystemStatus() {
    try {
      const response = await axios.get(
        `${this.baseURL}/system/package`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data[0];
    } catch (error) {
      this.logger.error(`Error getting system status: ${error.message}`);
      return null;
    }
  }

  /**
   * ==================== NETWORK MONITORING ====================
   */

  /**
   * Get interface statistics
   */
  async getInterfaceStats() {
    try {
      const response = await axios.get(
        `${this.baseURL}/interface`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data.map((iface) => ({
        name: iface.name,
        type: iface.type,
        mtu: iface.mtu,
        rxBytes: iface['rx-bytes'] || 0,
        txBytes: iface['tx-bytes'] || 0,
        rxPackets: iface['rx-packets'] || 0,
        txPackets: iface['tx-packets'] || 0,
        running: iface.running,
      }));
    } catch (error) {
      this.logger.error(`Error getting interface stats: ${error.message}`);
      return [];
    }
  }

  /**
   * Get IP routes
   */
  async getRoutes() {
    try {
      const response = await axios.get(
        `${this.baseURL}/ip/route`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error getting routes: ${error.message}`);
      return [];
    }
  }

  /**
   * Get IP addresses
   */
  async getIPAddresses() {
    try {
      const response = await axios.get(
        `${this.baseURL}/ip/address`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error getting IP addresses: ${error.message}`);
      return [];
    }
  }

  /**
   * ==================== BACKUP & RESTORE ====================
   */

  /**
   * Create system backup
   */
  async createBackup() {
    try {
      const response = await axios.post(
        `${this.baseURL}/system/backup/save`,
        { 'password': '' },
        { auth: this.auth, timeout: this.timeout }
      );

      this.logger.info('System backup created');
      return { success: true, backup: response.data };
    } catch (error) {
      this.logger.error(`Error creating backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get system backups
   */
  async getBackups() {
    try {
      const response = await axios.get(
        `${this.baseURL}/file`,
        { auth: this.auth, timeout: this.timeout }
      );

      return response.data.filter((f) => f.name.includes('.backup'));
    } catch (error) {
      this.logger.error(`Error getting backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache = {
      users: null,
      queues: null,
      aps: null,
      lastUpdate: 0,
    };
    this.logger.info('Caches cleared');
  }

  /**
   * Sync user with Mikrotik (hotspot + user manager)
   */
  async syncUser(username, userData) {
    try {
      this.logger.info(`Syncing user with Mikrotik: ${username}`);

      // Create hotspot user
      await this.createHotspotUser(username, userData.password, {
        bandwidthLimit: userData.bandwidthLimit,
        sessionTimeout: userData.sessionTimeout,
      });

      // Create User Manager user
      if (userData.createUserManager) {
        await this.createUserManagerUser(username, userData.password, {
          comment: userData.email,
          profile: userData.userManagerProfile || 'default',
        });
      }

      // Create queue for bandwidth management
      if (userData.bandwidthLimit) {
        await this.createQueue(username, {
          maxLimit: `${userData.bandwidthLimit}M/${userData.bandwidthLimit}M`,
          limitAt: `${Math.floor(userData.bandwidthLimit / 2)}M/${Math.floor(userData.bandwidthLimit / 2)}M`,
        });
      }

      this.emit('user:synced', { username, userData });
      return { success: true, synced: true };
    } catch (error) {
      this.logger.error(`Error syncing user: ${error.message}`);
      throw error;
    }
  }
}

module.exports = MikrotikManager;
