// backend/src/monitoring/prometheus.js
const prometheus = require('prom-client');
const express = require('express');

class PrometheusMonitoring {
  constructor() {
    this.register = new prometheus.Registry();
    
    // Default metrics
    prometheus.collectDefaultMetrics({ register: this.register });

    // Custom Metrics
    this.httpRequestDuration = new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    this.httpRequestCounter = new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.userCounter = new prometheus.Gauge({
      name: 'active_users_total',
      help: 'Total active users',
      registers: [this.register],
    });

    this.bandwidthUsed = new prometheus.Gauge({
      name: 'bandwidth_used_gb',
      help: 'Total bandwidth used in GB',
      labelNames: ['period'],
      registers: [this.register],
    });

    this.vouchersSold = new prometheus.Counter({
      name: 'vouchers_sold_total',
      help: 'Total vouchers sold',
      labelNames: ['duration'],
      registers: [this.register],
    });

    this.revenueGenerated = new prometheus.Gauge({
      name: 'revenue_total',
      help: 'Total revenue in currency',
      labelNames: ['currency'],
      registers: [this.register],
    });

    this.databaseConnections = new prometheus.Gauge({
      name: 'database_connections_active',
      help: 'Active database connections',
      registers: [this.register],
    });

    this.redisConnections = new prometheus.Gauge({
      name: 'redis_connections_active',
      help: 'Active Redis connections',
      registers: [this.register],
    });

    this.cacheHitRate = new prometheus.Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      registers: [this.register],
    });

    this.apiLatency = new prometheus.Histogram({
      name: 'api_latency_ms',
      help: 'API endpoint latency in milliseconds',
      labelNames: ['endpoint', 'method'],
      buckets: [10, 50, 100, 500, 1000, 5000],
      registers: [this.register],
    });

    this.errorRate = new prometheus.Counter({
      name: 'errors_total',
      help: 'Total errors',
      labelNames: ['type', 'status_code'],
      registers: [this.register],
    });
  }
