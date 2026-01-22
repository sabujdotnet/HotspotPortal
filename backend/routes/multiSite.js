// backend/routes/multiSite.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

/**
 * Multi-Site Management Routes
 * Manage multiple sites from central dashboard
 */

module.exports = (multiSiteManager) => {
  /**
   * ==================== SITE MANAGEMENT ====================
   */

  /**
   * POST /api/sites/register
   * Register a new site/branch
   */
  router.post('/register', authMiddleware, async (req, res) => {
    try {
      const {
        siteName,
        location,
        siteType, // 'local' or 'remote'
        routerIP,
        routerPort,
        routerUser,
        routerPass,
        bandwidth,
        maxUsers,
      } = req.body;

      const site = await multiSiteManager.registerSite({
        siteName,
        location,
        siteType,
        routerIP,
        routerPort,
        routerUser,
        routerPass,
        bandwidth,
        maxUsers,
      });

      // Start heartbeat monitoring
      multiSiteManager.startSiteHeartbeat(site.id);

      res.json({
        success: true,
        message: `Site '${siteName}' registered successfully`,
        site,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites
   * Get all registered sites
   */
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const sites = await multiSiteManager.getAllSites();
      res.json(sites);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites/:id
   * Get site details with status and statistics
   */
  router.get('/:id', authMiddleware, async (req, res) => {
    try {
      const site = await multiSiteManager.getSiteDetails(req.params.id);
      res.json(site);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sites/:id/test-connection
   * Test connection to site
   */
  router.post('/:id/test-connection', authMiddleware, async (req, res) => {
    try {
      const status = await multiSiteManager.testSiteConnection(req.params.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ==================== REMOTE USER MANAGEMENT ====================
   */

  /**
   * POST /api/sites/:id/users
   * Create user on remote site
   */
  router.post('/:id/users', authMiddleware, async (req, res) => {
    try {
      const { username, password, bandwidthLimit, sessionTimeout } = req.body;

      const result = await multiSiteManager.createRemoteUser(
        req.params.id,
        username,
        password,
        { bandwidthLimit, sessionTimeout }
      );

      res.json({
        success: true,
        message: `User '${username}' created on site`,
        user: result,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites/:id/users
   * Get all users on remote site
   */
  router.get('/:id/users', authMiddleware, async (req, res) => {
    try {
      const users = await multiSiteManager.getRemoteUsers(req.params.id);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/sites/:id/users/:username
   * Update user on remote site
   */
  router.put('/:id/users/:username', authMiddleware, async (req, res) => {
    try {
      const { bandwidthLimit, sessionTimeout } = req.body;

      const result = await multiSiteManager.updateRemoteUser(
        req.params.id,
        req.params.username,
        { 'limit-bytes-out': bandwidthLimit, 'limit-uptime': sessionTimeout }
      );

      res.json({
        success: true,
        message: `User '${req.params.username}' updated`,
        user: result,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/sites/:id/users/:username
   * Delete user from remote site
   */
  router.delete('/:id/users/:username', authMiddleware, async (req, res) => {
    try {
      await multiSiteManager.deleteRemoteUser(
        req.params.id,
        req.params.username
      );

      res.json({
        success: true,
        message: `User '${req.params.username}' deleted from site`,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ==================== BANDWIDTH MANAGEMENT ====================
   */

  /**
   * POST /api/sites/:id/bandwidth
   * Create bandwidth queue on remote site
   */
  router.post('/:id/bandwidth', authMiddleware, async (req, res) => {
    try {
      const { username, bandwidth } = req.body;

      const result = await multiSiteManager.createRemoteQueue(
        req.params.id,
        username,
        bandwidth
      );

      res.json({
        success: true,
        message: `Bandwidth queue created for '${username}'`,
        queue: result,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/sites/:id/bandwidth/:username
   * Update bandwidth on remote site
   */
  router.put('/:id/bandwidth/:username', authMiddleware, async (req, res) => {
    try {
      const { bandwidth } = req.body;

      const result = await multiSiteManager.updateRemoteQueueBandwidth(
        req.params.id,
        req.params.username,
        bandwidth
      );

      res.json({
        success: true,
        message: `Bandwidth updated to ${bandwidth}Mbps for '${req.params.username}'`,
        queue: result,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites/:id/bandwidth/:username/stats
   * Get bandwidth usage stats
   */
  router.get('/:id/bandwidth/:username/stats', authMiddleware, async (req, res) => {
    try {
      const stats = await multiSiteManager.getRemoteQueueStats(
        req.params.id,
        req.params.username
      );

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ==================== REMOTE MONITORING ====================
   */

  /**
   * GET /api/sites/:id/aps
   * Get access points on remote site
   */
  router.get('/:id/aps', authMiddleware, async (req, res) => {
    try {
      const aps = await multiSiteManager.getRemoteAPs(req.params.id);
      res.json(aps);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites/:id/aps/:apName/clients
   * Get clients connected to AP on remote site
   */
  router.get('/:id/aps/:apName/clients', authMiddleware, async (req, res) => {
    try {
      const clients = await multiSiteManager.getRemoteAPClients(
        req.params.id,
        req.params.apName
      );

      res.json({
        ap: req.params.apName,
        clientCount: clients.length,
        clients,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sites/:id/router-info
   * Get router info on remote site
   */
  router.get('/:id/router-info', authMiddleware, async (req, res) => {
    try {
      const info = await multiSiteManager.getRemoteRouterInfo(req.params.id);
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ==================== MULTI-SITE OPERATIONS ====================
   */

  /**
   * GET /api/sites/dashboard/overview
   * Get dashboard overview for all sites
   */
  router.get('/dashboard/overview', authMiddleware, async (req, res) => {
    try {
      const dashboard = await multiSiteManager.getMultiSiteDashboard();
      res.json(dashboard);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sites/users/create-multi
   * Create user across multiple sites
   */
  router.post('/users/create-multi', authMiddleware, async (req, res) => {
    try {
      const { username, password, siteIds, bandwidthLimit } = req.body;

      const result = await multiSiteManager.createUserAcrossMultipleSites(
        username,
        password,
        siteIds,
        { bandwidthLimit }
      );

      res.json({
        success: true,
        message: `User '${username}' created across ${siteIds.length} sites`,
        results: result.results,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sites/users/sync-all
   * Sync user across all sites
   */
  router.post('/users/sync-all', authMiddleware, async (req, res) => {
    try {
      const { username, password, bandwidthLimit } = req.body;

      const result = await multiSiteManager.syncUserAcrossAllSites(
        username,
        password,
        { bandwidthLimit }
      );

      res.json({
        success: true,
        message: `User '${username}' synced across all active sites`,
        results: result.results,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sites/bandwidth/update-multi
   * Update bandwidth across multiple sites
   */
  router.post('/bandwidth/update-multi', authMiddleware, async (req, res) => {
    try {
      const { username, bandwidth, siteIds } = req.body;

      const result = await multiSiteManager.updateBandwidthAcrossMultipleSites(
        username,
        bandwidth,
        siteIds
      );

      res.json({
        success: true,
        message: `Bandwidth updated to ${bandwidth}Mbps for '${username}' across ${siteIds.length} sites`,
        results: result.results,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ==================== MANAGEMENT TOKENS ====================
   */

  /**
   * POST /api/sites/:id/tokens
   * Generate management token for remote access
   */
  router.post('/:id/tokens', authMiddleware, async (req, res) => {
    try {
      const { permissions } = req.body;

      const token = await multiSiteManager.generateManagementToken(
        req.params.id,
        permissions || ['read', 'write']
      );

      res.json({
        success: true,
        message: 'Management token generated',
        token: token.token,
        expiresAt: token.expires_at,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

---

// ARCHITECTURE DIAGRAM
/*

╔════════════════════════════════════════════════════════════════════════════════╗
║                      MULTI-SITE HOTSPOT MANAGEMENT SYSTEM                      ║
╚════════════════════════════════════════════════════════════════════════════════╝

                            ┌─────────────────────────────┐
                            │  Central Management Portal   │
                            │   (Admin Dashboard)         │
                            │   - All Sites Dashboard     │
                            │   - Central User Management │
                            │   - Analytics Across Sites  │
                            └────────────┬────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
            ┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
            │   AREA 1       │  │   AREA 2       │  │   AREA 3       │
            │  (Main Site)   │  │ (Remote Site)  │  │ (Remote Site)  │
            ├────────────────┤  ├────────────────┤  ├────────────────┤
            │ Mikrotik Router│  │  Router/AP     │  │  Router/AP     │
            │ 192.168.1.1    │  │  (Different    │  │  (Different    │
            │                │  │   ISP)         │  │   ISP)         │
            │ Direct         │  │ Internet       │  │ Internet       │
            │ Connection     │  │ Connection     │  │ Connection     │
            └────┬───────────┘  └────┬───────────┘  └────┬───────────┘
                 │                   │                    │
            ┌────▼───┐          ┌────▼───┐           ┌────▼───┐
            │  AP 1  │          │  AP 1  │           │  AP 1  │
            │  AP 2  │          │  AP 2  │           │  AP 2  │
            │  AP 3  │          │  AP 3  │           │  AP 3  │
            │  AP 4  │          │  AP 4  │           │  AP 4  │
            └────┬───┘          └────┬───┘           └────┬───┘
                 │                   │                    │
            Connected          Connected              Connected
            Clients            Clients                Clients
            (100+)             (50+)                  (50+)


╔════════════════════════════════════════════════════════════════════════════════╗
║                           MANAGEMENT FLOW                                       ║
╚════════════════════════════════════════════════════════════════════════════════╝

Central Dashboard
       │
       ├─► Register Site (Area 2)
       │   └─► API Key Generated
       │       └─► Start Heartbeat Monitoring
       │
       ├─► Create User "john" on All Sites
       │   ├─► Area 1 ✓ (Direct)
       │   ├─► Area 2 ✓ (Remote API)
       │   └─► Area 3 ✓ (Remote API)
       │
       ├─► Update john's Bandwidth (5Mbps)
       │   ├─► Area 1 ✓
       │   ├─► Area 2 ✓
       │   └─► Area 3 ✓
       │
       ├─► Monitor All Sites
       │   ├─► Connected Clients
       │   ├─► Bandwidth Usage
       │   ├─► Router Stats
       │   └─► Connection Status
       │
       └─► Generate Reports
           ├─► Total Users: 200
           ├─► Total Bandwidth: 1.5TB
           ├─► Revenue: $5,000
           └─► Sites Online: 3/3


╔════════════════════════════════════════════════════════════════════════════════╗
║                        COMMUNICATION PROTOCOL                                   ║
╚════════════════════════════════════════════════════════════════════════════════╝

AREA 1 (Direct):
  Central API ──► Mikrotik Router (192.168.1.1:8728)
  └─► Real-time sync via REST API

AREA 2 & 3 (Remote):
  Central API ──► Remote Router REST API (via Internet)
  │
  ├─► Create User → Call /ip/hotspot/user (POST)
  ├─► Update User → Call /ip/hotspot/user/{id} (PUT)
  ├─► Delete User → Call /ip/hotspot/user/{id} (DELETE)
  ├─► Create Queue → Call /queue/simple (POST)
  ├─► Update Queue → Call /queue/simple/{id} (PUT)
  ├─► Get Status → Call /system/identity (GET)
  └─► Get Clients → Call /interface/wireless/registration-table (GET)


╔════════════════════════════════════════════════════════════════════════════════╗
║                        DATABASE STRUCTURE                                       ║
╚════════════════════════════════════════════════════════════════════════════════╝

sites (Main Table)
├── id
├── site_name
├── location
├── site_type (local/remote)
├── router_ip
├── router_port
├── router_user
├── router_pass
├── api_key
├── status (online/offline)
├── last_heartbeat
└── created_at

remote_users (User Tracking)
├── id
├── site_id (FK → sites)
├── username
├── password
├── bandwidth_limit
├── status
└── created_at

site_api_logs (Audit Trail)
├── id
├── site_id (FK → sites)
├── endpoint
├── method
├── status_code
└── created_at

site_management_tokens (Access Tokens)
├── id
├── site_id (FK → sites)
├── token
├── permissions (JSON)
├── expires_at
└── created_at
*/
