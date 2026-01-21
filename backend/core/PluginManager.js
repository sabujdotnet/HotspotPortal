// backend/core/PluginManager.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const EventEmitter = require('events');

/**
 * Plugin Manager
 * Handles plugin discovery, loading, installation, and management
 */
class PluginManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.pluginDir = config.pluginDir || './plugins';
    this.plugins = new Map();
    this.hooks = new Map();
    this.middleware = [];
    this.routes = [];
    this.logger = config.logger || console;
    this.db = config.db || null;

    this.ensurePluginDirectory();
  }

  /**
   * Ensure plugin directory exists
   */
  ensurePluginDirectory() {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
      this.logger.info(`Created plugin directory: ${this.pluginDir}`);
    }

    // Create index.json if not exists
    const indexFile = path.join(this.pluginDir, 'index.json');
    if (!fs.existsSync(indexFile)) {
      fs.writeFileSync(indexFile, JSON.stringify({ plugins: [] }, null, 2));
    }
  }

  /**
   * Discover all plugins
   */
  discoverPlugins() {
    try {
      this.logger.info('Discovering plugins...');
      const pluginDirs = fs.readdirSync(this.pluginDir);

      const plugins = pluginDirs
        .filter((dir) => {
          const pluginPath = path.join(this.pluginDir, dir);
          return (
            fs.statSync(pluginPath).isDirectory() &&
            fs.existsSync(path.join(pluginPath, 'plugin.json'))
          );
        })
        .map((dir) => ({
          name: dir,
          path: path.join(this.pluginDir, dir),
        }));

      this.logger.info(`Found ${plugins.length} plugin(s)`);
      return plugins;
    } catch (error) {
      this.logger.error('Error discovering plugins:', error);
      return [];
    }
  }

  /**
   * Load plugin manifest
   */
  loadPluginManifest(pluginPath) {
    try {
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Validate manifest
      if (!manifest.name || !manifest.version) {
        throw new Error('Invalid plugin manifest: missing name or version');
      }

      return manifest;
    } catch (error) {
      this.logger.error(`Error loading plugin manifest: ${error.message}`);
      return null;
    }
  }

  /**
   * Install plugin from GitHub/NPM/ZIP
   */
  async installPlugin(source, options = {}) {
    try {
      this.logger.info(`Installing plugin from: ${source}`);

      let pluginPath;

      if (source.startsWith('http')) {
        // Install from URL
        pluginPath = await this.installFromURL(source, options);
      } else if (source.startsWith('.') || source.startsWith('/')) {
        // Install from local path
        pluginPath = await this.installFromLocal(source, options);
      } else {
        // Install from NPM
        pluginPath = await this.installFromNPM(source, options);
      }

      // Load and initialize plugin
      return await this.loadPlugin(pluginPath);
    } catch (error) {
      this.logger.error(`Plugin installation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install plugin from URL (GitHub/ZIP)
   */
  async installFromURL(url, options = {}) {
    try {
      const axios = require('axios');
      const unzipper = require('unzipper');

      this.logger.info('Downloading plugin...');

      const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
      });

      const pluginName = options.name || url.split('/').pop().replace('.zip', '');
      const extractPath = path.join(this.pluginDir, pluginName);

      // Extract ZIP
      return new Promise((resolve, reject) => {
        response.data
          .pipe(unzipper.Extract({ path: extractPath }))
          .on('close', () => {
            this.logger.info(`Plugin extracted to ${extractPath}`);
            resolve(extractPath);
          })
          .on('error', reject);
      });
    } catch (error) {
      this.logger.error('Error installing from URL:', error);
      throw error;
    }
  }

  /**
   * Install plugin from local path
   */
  async installFromLocal(sourcePath, options = {}) {
    try {
      const absolutePath = path.resolve(sourcePath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Plugin path not found: ${absolutePath}`);
      }

      const pluginName = options.name || path.basename(absolutePath);
      const destinationPath = path.join(this.pluginDir, pluginName);

      // Copy plugin files
      this.copyDirectory(absolutePath, destinationPath);

      this.logger.info(`Plugin copied to ${destinationPath}`);
      return destinationPath;
    } catch (error) {
      this.logger.error('Error installing from local path:', error);
      throw error;
    }
  }

  /**
   * Install plugin from NPM
   */
  async installFromNPM(packageName, options = {}) {
    try {
      this.logger.info(`Installing from NPM: ${packageName}`);

      const pluginPath = path.join(this.pluginDir, packageName);

      // Create plugin directory
      if (!fs.existsSync(pluginPath)) {
        fs.mkdirSync(pluginPath, { recursive: true });
      }

      // Install NPM package
      execSync(`npm install ${packageName} --prefix ${pluginPath}`, {
        stdio: 'inherit',
      });

      // Copy to plugin directory if needed
      const nodeModulesPath = path.join(pluginPath, 'node_modules', packageName);
      if (fs.existsSync(nodeModulesPath)) {
        this.copyDirectory(nodeModulesPath, pluginPath);
      }

      this.logger.info(`Installed NPM package: ${packageName}`);
      return pluginPath;
    } catch (error) {
      this.logger.error('Error installing from NPM:', error);
      throw error;
    }
  }

  /**
   * Load and initialize plugin
   */
  async loadPlugin(pluginPath) {
    try {
      const manifest = this.loadPluginManifest(pluginPath);

      if (!manifest) {
        throw new Error('Could not load plugin manifest');
      }

      this.logger.info(`Loading plugin: ${manifest.name} v${manifest.version}`);

      // Check dependencies
      if (manifest.dependencies) {
        await this.checkPluginDependencies(manifest.dependencies);
      }

      // Load plugin main file
      const mainFile = path.join(pluginPath, manifest.main || 'index.js');

      if (!fs.existsSync(mainFile)) {
        throw new Error(`Plugin main file not found: ${mainFile}`);
      }

      // Clear require cache to allow plugin reloading
      delete require.cache[require.resolve(mainFile)];

      // Load plugin
      const PluginClass = require(mainFile);
      const plugin = new PluginClass({
        logger: this.logger,
        db: this.db,
        hooks: this.hooks,
        pluginDir: pluginPath,
      });

      // Register hooks
      if (plugin.hooks) {
        Object.entries(plugin.hooks).forEach(([hookName, hookFn]) => {
          this.registerHook(manifest.name, hookName, hookFn);
        });
      }

      // Register routes
      if (plugin.routes) {
        this.routes.push({
          prefix: plugin.routePrefix || `/plugins/${manifest.name}`,
          router: plugin.routes,
          plugin: manifest.name,
        });
      }

      // Register middleware
      if (plugin.middleware) {
        this.middleware.push({
          fn: plugin.middleware,
          plugin: manifest.name,
        });
      }

      // Store plugin
      this.plugins.set(manifest.name, {
        manifest,
        path: pluginPath,
        instance: plugin,
        status: 'active',
      });

      // Initialize plugin
      if (plugin.init && typeof plugin.init === 'function') {
        await plugin.init();
      }

      this.logger.info(`✓ Plugin loaded: ${manifest.name}`);
      this.emit('plugin:loaded', { name: manifest.name, version: manifest.version });

      return { name: manifest.name, version: manifest.version, status: 'active' };
    } catch (error) {
      this.logger.error(`Error loading plugin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check plugin dependencies
   */
  async checkPluginDependencies(dependencies) {
    for (const [depName, depVersion] of Object.entries(dependencies)) {
      if (!this.plugins.has(depName)) {
        throw new Error(
          `Plugin dependency not found: ${depName} (required by plugin)`
        );
      }

      const plugin = this.plugins.get(depName);
      if (!this.versionMatches(plugin.manifest.version, depVersion)) {
        throw new Error(
          `Plugin version mismatch: ${depName} requires ${depVersion}`
        );
      }
    }
  }

  /**
   * Check if version matches requirement
   */
  versionMatches(version, requirement) {
    // Simple version matching (can be enhanced with semver)
    if (requirement === '*') return true;
    return version === requirement || version.startsWith(requirement);
  }

  /**
   * Unload plugin
   */
  async unloadPlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);

      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginName}`);
      }

      this.logger.info(`Unloading plugin: ${pluginName}`);

      // Call plugin cleanup
      if (plugin.instance.cleanup && typeof plugin.instance.cleanup === 'function') {
        await plugin.instance.cleanup();
      }

      // Remove hooks
      this.hooks.forEach((hookFns, hookName) => {
        this.hooks.set(
          hookName,
          hookFns.filter((fn) => fn.plugin !== pluginName)
        );
      });

      // Remove routes
      this.routes = this.routes.filter((r) => r.plugin !== pluginName);

      // Remove middleware
      this.middleware = this.middleware.filter((m) => m.plugin !== pluginName);

      // Remove plugin
      this.plugins.delete(pluginName);

      this.logger.info(`✓ Plugin unloaded: ${pluginName}`);
      this.emit('plugin:unloaded', { name: pluginName });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error unloading plugin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enable plugin
   */
  async enablePlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);

      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginName}`);
      }

      plugin.status = 'active';

      if (plugin.instance.enable && typeof plugin.instance.enable === 'function') {
        await plugin.instance.enable();
      }

      this.logger.info(`✓ Plugin enabled: ${pluginName}`);
      return { name: pluginName, status: 'active' };
    } catch (error) {
      this.logger.error(`Error enabling plugin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Disable plugin
   */
  async disablePlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);

      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginName}`);
      }

      plugin.status = 'inactive';

      if (plugin.instance.disable && typeof plugin.instance.disable === 'function') {
        await plugin.instance.disable();
      }

      this.logger.info(`✓ Plugin disabled: ${pluginName}`);
      return { name: pluginName, status: 'inactive' };
    } catch (error) {
      this.logger.error(`Error disabling plugin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register hook
   */
  registerHook(pluginName, hookName, hookFn) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({
      fn: hookFn,
      plugin: pluginName,
    });

    this.logger.debug(`Hook registered: ${hookName} (${pluginName})`);
  }

  /**
   * Execute hook
   */
  async executeHook(hookName, context = {}) {
    const hookFns = this.hooks.get(hookName) || [];

    for (const hookObj of hookFns) {
      try {
        await hookObj.fn(context);
      } catch (error) {
        this.logger.error(
          `Error executing hook ${hookName} (${hookObj.plugin}):`,
          error
        );
      }
    }
  }

  /**
   * Get all plugins
   */
  getPlugins() {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      status: p.status,
      description: p.manifest.description,
      author: p.manifest.author,
    }));
  }

  /**
   * Get plugin info
   */
  getPluginInfo(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      return null;
    }

    return {
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      status: plugin.status,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      homepage: plugin.manifest.homepage,
      license: plugin.manifest.license,
      dependencies: plugin.manifest.dependencies,
    };
  }

  /**
   * Copy directory recursively
   */
  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src).forEach((file) => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);

      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  /**
   * Load all discovered plugins
   */
  async loadAllPlugins() {
    try {
      const discoveredPlugins = this.discoverPlugins();
      const loadedPlugins = [];

      for (const plugin of discoveredPlugins) {
        try {
          await this.loadPlugin(plugin.path);
          loadedPlugins.push(plugin.name);
        } catch (error) {
          this.logger.warn(`Failed to load plugin ${plugin.name}: ${error.message}`);
        }
      }

      this.logger.info(`${loadedPlugins.length} plugin(s) loaded successfully`);
      return loadedPlugins;
    } catch (error) {
      this.logger.error('Error loading plugins:', error);
      throw error;
    }
  }
}

module.exports = PluginManager;
