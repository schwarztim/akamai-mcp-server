/**
 * HTTP Connection Pooling
 *
 * Optimizes HTTP performance by reusing connections with keep-alive.
 * Prevents connection exhaustion and improves latency.
 */

import https from 'https';
import http from 'http';
import { getLogger } from '../utils/logger.js';

export interface ConnectionPoolOptions {
  /** Maximum sockets per host */
  maxSockets?: number;

  /** Maximum free sockets to keep alive */
  maxFreeSockets?: number;

  /** Socket timeout in ms */
  timeout?: number;

  /** Socket keep-alive timeout in ms */
  keepAliveTimeout?: number;

  /** Enable keep-alive */
  keepAlive?: boolean;
}

export interface ConnectionPoolStats {
  totalSockets: number;
  freeSockets: number;
  requestsInProgress: number;
  poolUtilization: number;
}

/**
 * Connection Pool Manager
 */
export class ConnectionPool {
  private httpsAgent: https.Agent;
  private httpAgent: http.Agent;
  private readonly logger;
  private requestCount = 0;
  private readonly options: Required<ConnectionPoolOptions>;

  constructor(options: ConnectionPoolOptions = {}) {
    this.logger = getLogger();

    // Default options optimized for Akamai APIs
    this.options = {
      maxSockets: options.maxSockets ?? 50,
      maxFreeSockets: options.maxFreeSockets ?? 10,
      timeout: options.timeout ?? 30000,
      keepAliveTimeout: options.keepAliveTimeout ?? 60000,
      keepAlive: options.keepAlive ?? true,
    };

    // Create HTTPS agent with connection pooling
    this.httpsAgent = new https.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveTimeout,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      // Reuse sockets more aggressively
      scheduling: 'fifo',
    });

    // Create HTTP agent (for potential redirects or development)
    this.httpAgent = new http.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveTimeout,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      scheduling: 'fifo',
    });

    this.logger.info('Connection pool initialized', {
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      keepAlive: this.options.keepAlive,
    });

    // Set up socket monitoring
    this.setupSocketMonitoring();
  }

  /**
   * Get the appropriate agent for a URL
   */
  getAgent(url: string): http.Agent | https.Agent {
    this.requestCount++;
    return url.startsWith('https') ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Get HTTPS agent (most common for Akamai)
   */
  getHttpsAgent(): https.Agent {
    this.requestCount++;
    return this.httpsAgent;
  }

  /**
   * Get HTTP agent
   */
  getHttpAgent(): http.Agent {
    this.requestCount++;
    return this.httpAgent;
  }

  /**
   * Get current pool statistics
   */
  getStats(): ConnectionPoolStats {
    const httpsStatus = (this.httpsAgent as any).getCurrentStatus?.() || {};
    const httpStatus = (this.httpAgent as any).getCurrentStatus?.() || {};

    // Calculate total sockets and free sockets
    const totalSockets = Object.values(httpsStatus.sockets || {}).flat().length +
                        Object.values(httpStatus.sockets || {}).flat().length;

    const freeSockets = Object.values(httpsStatus.freeSockets || {}).flat().length +
                       Object.values(httpStatus.freeSockets || {}).flat().length;

    const requestsInProgress = Object.values(httpsStatus.requests || {}).flat().length +
                              Object.values(httpStatus.requests || {}).flat().length;

    const poolUtilization = this.options.maxSockets > 0
      ? (totalSockets / this.options.maxSockets) * 100
      : 0;

    return {
      totalSockets,
      freeSockets,
      requestsInProgress,
      poolUtilization: Math.round(poolUtilization * 100) / 100,
    };
  }

  /**
   * Setup socket monitoring for debugging and metrics
   */
  private setupSocketMonitoring(): void {
    // Log high pool utilization
    setInterval(() => {
      const stats = this.getStats();

      if (stats.poolUtilization > 80) {
        this.logger.warn('Connection pool utilization high', {
          utilization: `${stats.poolUtilization}%`,
          totalSockets: stats.totalSockets,
          maxSockets: this.options.maxSockets,
        });
      }

      // Log metrics for observability
      this.logger.debug('Connection pool stats', stats);
    }, 30000); // Check every 30 seconds
  }

  /**
   * Destroy all connections and clean up
   */
  destroy(): void {
    this.logger.info('Destroying connection pool');
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }

  /**
   * Get connection pool health status
   */
  getHealth(): {
    healthy: boolean;
    utilization: number;
    message: string;
  } {
    const stats = this.getStats();

    if (stats.poolUtilization >= 95) {
      return {
        healthy: false,
        utilization: stats.poolUtilization,
        message: 'Connection pool near capacity',
      };
    }

    if (stats.poolUtilization >= 80) {
      return {
        healthy: true,
        utilization: stats.poolUtilization,
        message: 'Connection pool utilization high',
      };
    }

    return {
      healthy: true,
      utilization: stats.poolUtilization,
      message: 'Connection pool healthy',
    };
  }

  /**
   * Prune idle connections
   */
  prune(): void {
    this.logger.info('Pruning idle connections');

    // Force close idle sockets by destroying and recreating agents
    const oldHttpsAgent = this.httpsAgent;
    const oldHttpAgent = this.httpAgent;

    this.httpsAgent = new https.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveTimeout,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      scheduling: 'fifo',
    });

    this.httpAgent = new http.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveTimeout,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      scheduling: 'fifo',
    });

    // Destroy old agents
    oldHttpsAgent.destroy();
    oldHttpAgent.destroy();
  }
}

// Singleton instance
let poolInstance: ConnectionPool | null = null;

/**
 * Get the global connection pool
 */
export function getConnectionPool(options?: ConnectionPoolOptions): ConnectionPool {
  if (!poolInstance) {
    poolInstance = new ConnectionPool(options);
  }
  return poolInstance;
}

/**
 * Reset the global connection pool (useful for testing)
 */
export function resetConnectionPool(): void {
  if (poolInstance) {
    poolInstance.destroy();
    poolInstance = null;
  }
}
