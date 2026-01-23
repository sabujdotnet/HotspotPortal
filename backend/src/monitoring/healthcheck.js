
  // Middleware for tracking HTTP requests
  middleware() {
    return (req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.httpRequestDuration.observe(
          { method: req.method, route: req.route?.path || req.path, status_code: res.statusCode },
          duration
        );
        this.httpRequestCounter.inc({
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode,
        });
      });

      next();
    };
  }

  // Endpoint to expose metrics
  metricsEndpoint() {
    return async (req, res) => {
      res.set('Content-Type', this.register.contentType);
      res.end(await this.register.metrics());
    };
  }

  // Update custom metrics
  updateActiveUsers(count) {
    this.userCounter.set(count);
  }

  updateBandwidth(gb, period = 'daily') {
    this.bandwidthUsed.set({ period }, gb);
  }

  recordVoucherSale(duration, count = 1) {
    this.vouchersSold.inc({ duration }, count);
  }

  updateRevenue(amount, currency = 'USD') {
    this.revenueGenerated.set({ currency }, amount);
  }

  recordDatabaseConnections(count) {
    this.databaseConnections.set(count);
  }

  recordRedisConnections(count) {
    this.redisConnections.set(count);
  }

  recordCacheHitRate(percentage) {
    this.cacheHitRate.set(percentage);
  }

  recordApiLatency(endpoint, method, latencyMs) {
    this.apiLatency.observe({ endpoint, method }, latencyMs);
  }

  recordError(type, statusCode) {
    this.errorRate.inc({ type, status_code: statusCode });
  }
}

module.exports = PrometheusMonitoring;

// backend/src/monitoring/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

class Logger {
  constructor() {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta,
        });
      })
    );

    const transports = [
      // Console output
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),

      // Error logs
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        level: 'error',
        format: logFormat,
      }),

      // Combined logs
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
      }),

      // API logs
      new DailyRotateFile({
        filename: 'logs/api-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '7d',
        format: logFormat,
      }),

      // Security logs
      new DailyRotateFile({
        filename: 'logs/security-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        format: logFormat,
      }),
    ];

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'hotspot-portal' },
      transports,
    });
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, error = null, meta = {}) {
    this.logger.error(message, {
      ...meta,
      error: error?.message,
      stack: error?.stack,
    });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  http(req, res, responseTime) {
    this.logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  security(event, details = {}) {
    this.logger.warn(`[SECURITY] ${event}`, details);
  }

  audit(action, userId, resourceId, changes = {}) {
    this.logger.info('Audit Log', {
      action,
      userId,
      resourceId,
      changes,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new Logger();

// backend/src/monitoring/alerts.js
class AlertManager {
  constructor(prometheus, logger) {
    this.prometheus = prometheus;
    this.logger = logger;
    this.alertThresholds = {
      errorRate: 0.05, // 5%
      highLatency: 2000, // 2 seconds
      bandwidthThreshold: 1000, // 1000 GB
      lowDiskSpace: 10, // 10% remaining
      highMemoryUsage: 0.85, // 85%
      databaseConnectionPool: 0.9, // 90% usage
    };
  }

  checkErrorRate(errorCount, totalRequests) {
    const rate = errorCount / totalRequests;
    if (rate > this.alertThresholds.errorRate) {
      this.sendAlert('HIGH_ERROR_RATE', {
        rate: (rate * 100).toFixed(2) + '%',
        threshold: (this.alertThresholds.errorRate * 100) + '%',
        severity: 'critical',
      });
    }
  }

  checkLatency(latency) {
    if (latency > this.alertThresholds.highLatency) {
      this.sendAlert('HIGH_LATENCY', {
        latency: latency + 'ms',
        threshold: this.alertThresholds.highLatency + 'ms',
        severity: 'warning',
      });
    }
  }

  checkBandwidth(bandwidthUsed) {
    if (bandwidthUsed > this.alertThresholds.bandwidthThreshold) {
      this.sendAlert('HIGH_BANDWIDTH_USAGE', {
        used: bandwidthUsed + ' GB',
        threshold: this.alertThresholds.bandwidthThreshold + ' GB',
        severity: 'warning',
      });
    }
  }

  checkMemory(usagePercentage) {
    if (usagePercentage > this.alertThresholds.highMemoryUsage) {
      this.sendAlert('HIGH_MEMORY_USAGE', {
        usage: (usagePercentage * 100).toFixed(2) + '%',
        threshold: (this.alertThresholds.highMemoryUsage * 100) + '%',
        severity: 'warning',
      });
    }
  }

  checkDatabasePool(activeConnections, maxConnections) {
    const usage = activeConnections / maxConnections;
    if (usage > this.alertThresholds.databaseConnectionPool) {
      this.sendAlert('HIGH_DB_CONNECTION_USAGE', {
        active: activeConnections,
        max: maxConnections,
        usage: (usage * 100).toFixed(2) + '%',
        severity: 'warning',
      });
    }
  }

  sendAlert(alertType, details = {}) {
    this.logger.security(alertType, details);
    
    // Send to monitoring service (e.g., PagerDuty, Slack)
    if (details.severity === 'critical') {
      console.error(`🚨 CRITICAL ALERT: ${alertType}`, details);
      // Call webhook or notification service
    }
  }
}

module.exports = AlertManager;

// backend/src/monitoring/healthcheck.js
class HealthCheck {
  constructor(pool, redisClient) {
    this.pool = pool;
    this.redisClient = redisClient;
  }

  async getStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      system: this.checkSystem(),
    };
  }

  async checkDatabase() {
    try {
      const result = await this.pool.query('SELECT NOW()');
      return {
        status: 'connected',
        latency: result.command.startTime ? Date.now() - result.command.startTime : 0,
      };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error.message,
      };
    }
  }

  async checkRedis() {
    try {
      const ping = await this.redisClient.ping();
      return {
        status: ping === 'PONG' ? 'connected' : 'error',
      };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error.message,
      };
    }
  }

  checkSystem() {
    const os = require('os');
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercentage: (usedMemory / totalMemory) * 100,
      },
      cpuCount: os.cpus().length,
      uptime: process.uptime(),
    };
  }

  async detailedStatus() {
    const status = await this.getStatus();
    
    if (status.database.status !== 'connected' || status.redis.status !== 'connected') {
      return {
        ...status,
        health: 'unhealthy',
      };
    }

    const systemUsage = status.system.memory.usagePercentage;
    if (systemUsage > 85) {
      return {
        ...status,
        health: 'degraded',
        warning: 'High memory usage detected',
      };
    }

    return {
      ...status,
      health: 'healthy',
    };
  }
}

module.exports = HealthCheck;

// Integration in backend/src/index.js
const PrometheusMonitoring = require('./monitoring/prometheus');
const Logger = require('./monitoring/logger');
const AlertManager = require('./monitoring/alerts');
const HealthCheck = require('./monitoring/healthcheck');

const app = express();
const prometheus = new PrometheusMonitoring();
const alertManager = new AlertManager(prometheus, Logger);
const healthCheck = new HealthCheck(pool, redisClient);

// Add monitoring middleware
app.use(prometheus.middleware());

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = await healthCheck.detailedStatus();
  const statusCode = health.health === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Metrics endpoint
app.get('/metrics', prometheus.metricsEndpoint());

// Error handling with monitoring
app.use((err, req, res, next) => {
  Logger.error(err.message, err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });
  
  prometheus.recordError(err.name, res.statusCode || 500);
  alertManager.checkErrorRate(prometheus.errorRate._value, prometheus.httpRequestCounter._value);
  
  res.status(err.status || 500).json({
    error: err.message,
  });
});
