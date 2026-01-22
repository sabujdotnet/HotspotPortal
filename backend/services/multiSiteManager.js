// backend/services/multiSiteManager.js
const axios = require('axios');
const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Multi-Site Manager
 * Manages multiple sites/branches with independent routers
 * Site 1: Connected to main Mikrotik
 * Site 2, 3...: Independent routers, managed remotely
 */
class MultiSiteManager extends EventEmitter {
  constructor(db, config = {}) {
    super();
    this.db = db;
    this.logger = config.logger || console;
    this.sites = new Map();
  }

  /**
   * ==================== SITE REGISTRATION ====================
   */

  /**
   * Register a new site/branch
   */
  async registerSite(siteData) {
    try {
      const {
        siteName,
        location,
        siteType, // 'local' (direct to main), 'remote' (via API)
        routerIP,
        routerPort,
        routerUser,
        routerPass,
        apiKey, // For remote sites
        bandwidth,
        maxUsers,
        parentSiteId, // NULL for main site, ID for child sites
      } = siteData;

      // Generate API key if not provided (for remote management)
      const generatedApiKey = apiKey || this.generateSiteAPIKey();

      const result = await this.db.query(
        `INSERT INTO sites (
          site_name, location, site_type, router_ip, router_port,
          router_user, router_pass, api_key, bandwidth, max_users,
          parent_site_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW())
        RETURNING id, site_name, api_key, site_type`,
        [
          siteName,
          location,
          siteType,
          routerIP,
          routerPort,
          routerUser,
          routerPass,
          generatedApiKey,
          bandwidth,
          maxUsers,
          parentSiteId || null,
        ]
      );

      const site = result.rows[0];

      // Store in cache
      this.sites.set(site.id, {
        ...site,
        routerIP,
        routerPort,
        routerUser,
        routerPass,
      });

      this.logger.info(`Site registered: ${siteName} (ID: ${site.id})`);
      this.emit('site:registered', site);

      return site;
    } catch (error) {
      this.logger.error('Error registering site:', error);
      throw error;
    }
  }

  /**
   * Get all registered sites
   */
  async getAllSites() {
    try {
      const result = await this.db.query(
        `SELECT id, site_name, location, site_type, router_ip, status, created_at
         FROM sites
         ORDER BY created_at DESC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting sites:', error);
      return [];
    }
  }

  /**
   * Get site details with connection status
   */
  async getSiteDetails(siteId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM sites WHERE id = $1`,
        [siteId]
      );

      if (result.rows.length === 0) {
        throw new Error('Site not found');
      }

      const site = result.rows[0];

      // Check connection status
      const connectionStatus = await this.testSiteConnection(siteId);

      // Get site statistics
      const stats = await this.getSiteStatistics(siteId);

      return {
        ...site,
        connectionStatus,
        statistics: stats,
      };
    } catch (error) {
      this.logger.error('Error getting site details:', error);
      throw error;
    }
  }

  /**
   * Generate unique site API key
   */
  generateSiteAPIKey() {
    return `SITE-${crypto.randomBytes(24).toString('hex').toUpperCase()}`;
  }

  /**
   * ==================== SITE CONNECTION MANAGEMENT ====================
   */

  /**
   * Test connection to remote site
   */
  async testSiteConnection(siteId) {
    try {
      const site = await this.db.query(
        `SELECT router_ip, router_port, router_user, router_pass, site_type
         FROM sites WHERE id = $1`,
        [siteId]
      );

      if (site.rows.length === 0) {
        return { connected: false, error: 'Site not found' };
      }

      const siteData = site.rows[0];

      // For remote sites, test via REST API
      if (siteData.site_type === 'remote') {
        const response = await axios.get(
          `http://${siteData.router_ip}:${siteData.router_port || 8728}/rest/system/identity`,
          {
            auth: {
              username: siteData.router_user,
              password: siteData.router_pass,
            },
            timeout: 5000,
          }
        );

        return {
          connected: true,
          identity: response.data[0]?.name,
          uptime: new Date(),
        };
      } else {
        // For local sites, direct connection test
        return { connected: true, type: 'local' };
      }
    } catch (error) {
      this.logger.error(`Connection test failed for site ${siteId}:`, error.message);
      return {
        connected: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Keep site connection alive (heartbeat)
   */
  async startSiteHeartbeat(siteId, interval = 60000) {
    try {
      const heartbeat = setInterval(async () => {
        const status = await this.testSiteConnection(siteId);

        // Update site status in database
        await this.db.query(
          `UPDATE sites SET last_heartbeat = NOW(), status = $1 WHERE id = $2`,
          [status.connected ? 'online' : 'offline', siteId]
        );

        this.emit('site:heartbeat', { siteId, status });
      }, interval);

      return heartbeat;
    } catch (error) {
      this.logger.error('Error starting heartbeat:', error);
      throw error;
    }
  }

  /**
   * ==================== REMOTE API CLIENT ====================
   */

  /**
   * Call API on remote site
   */
  async callSiteAPI(siteId, endpoint, method = 'GET', data = null) {
    try {
      const siteResult = await this.db.query(
        `SELECT router_ip, router_port, router_user, router_pass, site_type
         FROM sites WHERE id = $1`,
        [siteId]
      );

      if (siteResult.rows.length === 0) {
        throw new Error('Site not found');
      }

      const site = siteResult.rows[0];

      // Only for remote sites
      if (site.site_type !== 'remote') {
        throw new Error('Can only call API on remote sites');
      }

      const url = `http://${site.router_ip}:${site.router_port || 8728}/rest${endpoint}`;

      const config = {
        method,
        url,
        auth: {
          username: site.router_user,
          password: site.router_pass,
        },
        timeout: 10000,
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);

      // Log API call
      await this.logSiteAPICall(siteId, endpoint, method, response.status);

      return response.data;
    } catch (error) {
      this.logger.error(`API call failed for site ${siteId}:`, error.message);
      throw error;
    }
  }

  /**
   * Log API calls for audit trail
   */
  async logSiteAPICall(siteId, endpoint, method, statusCode) {
    try {
      await this.db.query(
        `INSERT INTO site_api_logs (site_id, endpoint, method, status_code, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [siteId, endpoint, method, statusCode]
      );
    } catch (error) {
      this.logger.warn('Error logging API call:', error.message);
    }
  }

  /**
   * ==================== REMOTE SITE USER MANAGEMENT ====================
   */

  /**
   * Create user on remote site
   */
  async createRemoteUser(siteId, username, password, options = {}) {
    try {
      const payload = {
        name: username,
        password: password,
        'limit-bytes-out': options.bandwidthLimit || 0,
        'limit-uptime': options.sessionTimeout || 0,
        ...options,
      };

      const result = await this.callSiteAPI(
        siteId,
        '/ip/hotspot/user',
        'POST',
        payload
      );

      // Also record in local database for tracking
      await this.db.query(
        `INSERT INTO remote_users (site_id, username, password, bandwidth_limit, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [siteId, username, password, options.bandwidthLimit || 0]
      );

      this.logger.info(`Created user ${username} on site ${siteId}`);
      return { success: true, user: result };
    } catch (error) {
      this.logger.error('Error creating remote user:', error);
      throw error;
    }
  }

  /**
   * Update user on remote site
   */
  async updateRemoteUser(siteId, username, updates = {}) {
    try {
      // Get user ID from remote site
      const users = await this.callSiteAPI(siteId, '/ip/hotspot/user', 'GET');
      const user = users.find((u) => u.name === username);

      if (!user) {
        throw new Error(`User not found on remote site: ${username}`);
      }

      // Update on remote site
      const result = await this.callSiteAPI(
        siteId,
        `/ip/hotspot/user/${user['.id']}`,
        'PUT',
        updates
      );

      // Update in local database
      await this.db.query(
        `UPDATE remote_users SET ${Object.keys(updates)
          .map((k, i) => `${k} = $${i + 2}`)
          .join(', ')} WHERE site_id = $1 AND username = $${Object.keys(updates).length + 2}`,
        [siteId, ...Object.values(updates), username]
      );

      this.logger.info(`Updated user ${username} on site ${siteId}`);
      return { success: true, user: result };
    } catch (error) {
      this.logger.error('Error updating remote user:', error);
      throw error;
    }
  }

  /**
   * Delete user from remote site
   */
  async deleteRemoteUser(siteId, username) {
    try {
      const users = await this.callSiteAPI(siteId, '/ip/hotspot/user', 'GET');
      const user = users.find((u) => u.name === username);

      if (!user) {
        throw new Error(`User not found on remote site: ${username}`);
      }

      await this.callSiteAPI(
        siteId,
        `/ip/hotspot/user/${user['.id']}`,
        'DELETE'
      );

      // Remove from local database
      await this.db.query(
        `DELETE FROM remote_users WHERE site_id = $1 AND username = $2`,
        [siteId, username]
      );

      this.logger.info(`Deleted user ${username} from site ${siteId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting remote user:', error);
      throw error;
    }
  }

  /**
   * Get all users from remote site
   */
  async getRemoteUsers(siteId) {
    try {
      const users = await this.callSiteAPI(siteId, '/ip/hotspot/user', 'GET');
      return users;
    } catch (error) {
      this.logger.error('Error getting remote users:', error);
      return [];
    }
  }

  /**
   * ==================== REMOTE SITE BANDWIDTH MANAGEMENT ====================
   */

  /**
   * Create queue on remote site
   */
  async createRemoteQueue(siteId, username, bandwidth) {
    try {
      const payload = {
        name: `queue-${username}`,
        target: `${username}/32`,
        'max-limit': `${bandwidth}M/${bandwidth}M`,
        'limit-at': `${Math.floor(bandwidth / 2)}M/${Math.floor(bandwidth / 2)}M`,
      };

      const result = await this.callSiteAPI(
        siteId,
        '/queue/simple',
        'POST',
        payload
      );

      return { success: true, queue: result };
    } catch (error) {
      this.logger.error('Error creating remote queue:', error);
      throw error;
    }
  }

  /**
   * Update queue bandwidth on remote site
   */
  async updateRemoteQueueBandwidth(siteId, username, bandwidth) {
    try {
      const queues = await this.callSiteAPI(siteId, '/queue/simple', 'GET');
      const queue = queues.find((q) => q.name === `queue-${username}`);

      if (!queue) {
        throw new Error(`Queue not found for user: ${username}`);
      }

      const updates = {
        'max-limit': `${bandwidth}M/${bandwidth}M`,
        'limit-at': `${Math.floor(bandwidth / 2)}M/${Math.floor(bandwidth / 2)}M`,
      };

      const result = await this.callSiteAPI(
        siteId,
        `/queue/simple/${queue['.id']}`,
        'PUT',
        updates
      );

      this.logger.info(`Updated queue for ${username} on site ${siteId}`);
      return { success: true, queue: result };
    } catch (error) {
      this.logger.error('Error updating remote queue:', error);
      throw error;
    }
  }

  /**
   * Get queue bandwidth usage
   */
  async getRemoteQueueStats(siteId, username) {
    try {
      const stats = await this.callSiteAPI(
        siteId,
        `/queue/simple?numbers=${username}`,
        'GET'
      );

      return stats;
    } catch (error) {
      this.logger.error('Error getting queue stats:', error);
      return null;
    }
  }

  /**
   * ==================== REMOTE SITE MONITORING ====================
   */

  /**
   * Get remote site APs/interfaces
   */
  async getRemoteAPs(siteId) {
    try {
      const aps = await this.callSiteAPI(
        siteId,
        '/interface/wireless',
        'GET'
      );

      return aps.map((ap) => ({
        id: ap['.id'],
        name: ap.name,
        ssid: ap.ssid,
        frequency: ap.frequency,
        band: ap.band,
        mode: ap.mode,
        running: ap.running,
      }));
    } catch (error) {
      this.logger.error('Error getting remote APs:', error);
      return [];
    }
  }

  /**
   * Get connected clients on remote AP
   */
  async getRemoteAPClients(siteId, interfaceName) {
    try {
      const clients = await this.callSiteAPI(
        siteId,
        '/interface/wireless/registration-table',
        'GET'
      );

      return clients
        .filter((c) => c.interface === interfaceName)
        .map((c) => ({
          macAddress: c['mac-address'],
          ipAddress: c['ipv4-address'] || 'N/A',
          signal: c.signal,
          txRate: c['tx-rate'],
          rxRate: c['rx-rate'],
          uptime: c.uptime,
        }));
    } catch (error) {
      this.logger.error('Error getting remote AP clients:', error);
      return [];
    }
  }

  /**
   * Get remote site router info
   */
  async getRemoteRouterInfo(siteId) {
    try {
      const info = await this.callSiteAPI(
        siteId,
        '/system/identity',
        'GET'
      );

      const resources = await this.callSiteAPI(
        siteId,
        '/system/resource',
        'GET'
      );

      return {
        identity: info[0],
        resources: resources[0],
      };
    } catch (error) {
      this.logger.error('Error getting remote router info:', error);
      return null;
    }
  }

  /**
   * Get remote site statistics
   */
  async getSiteStatistics(siteId) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(DISTINCT ru.username) as total_users,
          SUM(CASE WHEN ru.status = 'active' THEN 1 ELSE 0 END) as active_users,
          AVG(ru.bandwidth_limit) as avg_bandwidth,
          SUM(ru.session_count) as total_sessions,
          MAX(ru.last_login) as last_activity
         FROM remote_users ru
         WHERE ru.site_id = $1`,
        [siteId]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting site statistics:', error);
      return null;
    }
  }

  /**
   * ==================== MULTI-SITE DASHBOARD ====================
   */

  /**
   * Get dashboard overview for all sites
   */
  async getMultiSiteDashboard() {
    try {
      const sitesResult = await this.db.query(
        `SELECT id, site_name, location, status FROM sites ORDER BY created_at ASC`
      );

      const sites = sitesResult.rows;
      const siteDashboards = [];

      for (const site of sites) {
        const stats = await this.getSiteStatistics(site.id);
        const connectionStatus = await this.testSiteConnection(site.id);

        siteDashboards.push({
          ...site,
          connectionStatus: connectionStatus.connected ? 'online' : 'offline',
          statistics: stats,
        });
      }

      // Calculate totals
      const totals = {
        totalSites: sites.length,
        onlineSites: siteDashboards.filter((s) => s.connectionStatus === 'online').length,
        totalUsers: siteDashboards.reduce((sum, s) => sum + (s.statistics?.total_users || 0), 0),
        totalSessions: siteDashboards.reduce((sum, s) => sum + (s.statistics?.total_sessions || 0), 0),
      };

      return {
        totals,
        sites: siteDashboards,
      };
    } catch (error) {
      this.logger.error('Error getting multi-site dashboard:', error);
      throw error;
    }
  }

  /**
   * ==================== CENTRAL MANAGEMENT ====================
   */

  /**
   * Create user across multiple sites
   */
  async createUserAcrossMultipleSites(username, password, siteIds, options = {}) {
    try {
      const results = [];

      for (const siteId of siteIds) {
        try {
          const result = await this.createRemoteUser(siteId, username, password, options);
          results.push({ siteId, success: true, result });
        } catch (error) {
          results.push({ siteId, success: false, error: error.message });
        }
      }

      return { username, results };
    } catch (error) {
      this.logger.error('Error creating user across sites:', error);
      throw error;
    }
  }

  /**
   * Update bandwidth across multiple sites
   */
  async updateBandwidthAcrossMultipleSites(username, bandwidth, siteIds) {
    try {
      const results = [];

      for (const siteId of siteIds) {
        try {
          const result = await this.updateRemoteQueueBandwidth(siteId, username, bandwidth);
          results.push({ siteId, success: true });
        } catch (error) {
          results.push({ siteId, success: false, error: error.message });
        }
      }

      return { username, bandwidth, results };
    } catch (error) {
      this.logger.error('Error updating bandwidth across sites:', error);
      throw error;
    }
  }

  /**
   * Sync user across all sites
   */
  async syncUserAcrossAllSites(username, password, options = {}) {
    try {
      const sitesResult = await this.db.query(
        `SELECT id FROM sites WHERE status = 'active'`
      );

      const siteIds = sitesResult.rows.map((s) => s.id);

      return await this.createUserAcrossMultipleSites(
        username,
        password,
        siteIds,
        options
      );
    } catch (error) {
      this.logger.error('Error syncing user across all sites:', error);
      throw error;
    }
  }

  /**
   * ==================== MANAGEMENT TOKENS ====================
   */

  /**
   * Generate management token for remote access
   */
  async generateManagementToken(siteId, permissions = []) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      const result = await this.db.query(
        `INSERT INTO site_management_tokens (site_id, token, permissions, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING token, expires_at`,
        [siteId, token, JSON.stringify(permissions), expiresAt]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error generating management token:', error);
      throw error;
    }
  }

  /**
   * Verify management token
   */
  async verifyManagementToken(siteId, token) {
    try {
      const result = await this.db.query(
        `SELECT * FROM site_management_tokens 
         WHERE site_id = $1 AND token = $2 AND expires_at > NOW()`,
        [siteId, token]
      );

      return result.rows.length > 0;
    } catch (error) {
      this.logger.error('Error verifying token:', error);
      return false;
    }
  }
}

module.exports = MultiSiteManager;
