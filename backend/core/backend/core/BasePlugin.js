// backend/core/BasePlugin.js
/**
 * Base Plugin Class
 * All plugins should extend this class
 */
class BasePlugin {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.db = options.db;
    this.hooks = options.hooks;
    this.pluginDir = options.pluginDir;
    this.hooks_ = {};
    this.routes = null;
    this.routePrefix = '/';
    this.middleware = null;
  }

  /**
   * Register hook handler
   * Usage: this.registerHook('user:created', (user) => { ... })
   */
  registerHook(hookName, handler) {
    if (!this.hooks_[hookName]) {
      this.hooks_[hookName] = [];
    }
    this.hooks_[hookName].push(handler);
  }

  /**
   * Called when plugin is initialized
   */
  async init() {
    this.logger.debug(`Plugin initialized: ${this.constructor.name}`);
  }

  /**
   * Called when plugin is enabled
   */
  async enable() {
    this.logger.debug(`Plugin enabled: ${this.constructor.name}`);
  }

  /**
   * Called when plugin is disabled
   */
  async disable() {
    this.logger.debug(`Plugin disabled: ${this.constructor.name}`);
  }

  /**
   * Called when plugin is unloaded
   */
  async cleanup() {
    this.logger.debug(`Plugin cleanup: ${this.constructor.name}`);
  }

  /**
   * Get plugin config
   */
  getConfig() {
    try {
      const configPath = `${this.pluginDir}/config.json`;
      const fs = require('fs');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      this.logger.error('Error loading plugin config:', error);
    }
    return {};
  }

  /**
   * Save plugin config
   */
  saveConfig(config) {
    try {
      const configPath = `${this.pluginDir}/config.json`;
      const fs = require('fs');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      this.logger.error('Error saving plugin config:', error);
      return false;
    }
  }

  /**
   * Validate plugin configuration
   */
  validateConfig(schema) {
    const config = this.getConfig();
    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      if (rules.required && !config[key]) {
        errors.push(`Missing required config: ${key}`);
      }

      if (config[key] && rules.type) {
        const actualType = typeof config[key];
        if (actualType !== rules.type) {
          errors.push(
            `Invalid config type for ${key}: expected ${rules.type}, got ${actualType}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

module.exports = BasePlugin;
