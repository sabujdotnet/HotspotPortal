// backend/routes/plugins.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

/**
 * Plugin Management Routes
 */

module.exports = (pluginManager) => {
  /**
   * GET /api/plugins
   * List all plugins
   */
  router.get('/', authMiddleware, (req, res) => {
    try {
      const plugins = pluginManager.getPlugins();
      res.json({ plugins, total: plugins.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/plugins/:name
   * Get plugin details
   */
  router.get('/:name', authMiddleware, (req, res) => {
    try {
      const info = pluginManager.getPluginInfo(req.params.name);
      if (!info) {
        return res.status(404).json({ error: 'Plugin not found' });
      }
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/plugins/install
   * Install a new plugin
   */
  router.post('/install', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { source, name, options = {} } = req.body;

      if (!source) {
        return res.status(400).json({ error: 'Source is required' });
      }

      const result = await pluginManager.installPlugin(source, {
        name,
        ...options,
      });

      res.json({
        success: true,
        plugin: result,
        message: `Plugin installed successfully`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/plugins/:name/enable
   * Enable plugin
   */
  router.post('/:name/enable', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await pluginManager.enablePlugin(req.params.name);
      res.json({ success: true, plugin: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/plugins/:name/disable
   * Disable plugin
   */
  router.post('/:name/disable', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await pluginManager.disablePlugin(req.params.name);
      res.json({ success: true, plugin: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/plugins/:name/unload
   * Unload plugin
   */
  router.post('/:name/unload', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await pluginManager.unloadPlugin(req.params.name);
      res.json({ success: true, message: `Plugin ${req.params.name} unloaded` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/plugins/discover
   * Discover available plugins
   */
  router.get('/discover', authMiddleware, adminMiddleware, (req, res) => {
    try {
      const discovered = pluginManager.discoverPlugins();
      res.json({ plugins: discovered, total: discovered.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
