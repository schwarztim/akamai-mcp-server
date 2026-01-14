#!/usr/bin/env node

/**
 * Health Check CLI
 *
 * Comprehensive health check tool for monitoring server status,
 * reliability patterns, and system metrics.
 */

import { getCircuitBreakerManager } from '../reliability/circuit-breaker.js';
import { getConnectionPool } from '../reliability/connection-pool.js';
import { getResponseCache } from '../cache/response-cache.js';
import { getResponseValidator } from '../validation/response-validator.js';

interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  components: {
    [key: string]: {
      healthy: boolean;
      message: string;
      details?: any;
    };
  };
}

/**
 * Health Check CLI
 */
class HealthCheckCLI {
  /**
   * Run health check
   */
  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const components: HealthStatus['components'] = {};

    // Check Circuit Breakers
    try {
      const cbManager = getCircuitBreakerManager();
      const summary = cbManager.getHealthSummary();

      components.circuitBreakers = {
        healthy: summary.unhealthy === 0,
        message:
          summary.unhealthy === 0
            ? 'All circuit breakers healthy'
            : `${summary.unhealthy} circuit breakers open`,
        details: summary,
      };
    } catch (error) {
      components.circuitBreakers = {
        healthy: false,
        message: 'Circuit breaker check failed',
        details: { error: String(error) },
      };
    }

    // Check Connection Pool
    try {
      const pool = getConnectionPool();
      const health = pool.getHealth();

      components.connectionPool = {
        healthy: health.healthy,
        message: health.message,
        details: {
          utilization: `${health.utilization}%`,
          stats: pool.getStats(),
        },
      };
    } catch (error) {
      components.connectionPool = {
        healthy: false,
        message: 'Connection pool check failed',
        details: { error: String(error) },
      };
    }

    // Check Response Cache
    try {
      const cache = getResponseCache();
      const health = cache.getHealth();

      components.responseCache = {
        healthy: health.healthy,
        message: health.message,
        details: {
          hitRate: `${health.hitRate}%`,
          stats: cache.getStats(),
        },
      };
    } catch (error) {
      components.responseCache = {
        healthy: false,
        message: 'Response cache check failed',
        details: { error: String(error) },
      };
    }

    // Check Response Validator
    try {
      const validator = getResponseValidator();
      const health = validator.getHealth();

      components.responseValidator = {
        healthy: health.healthy,
        message: health.message,
        details: {
          successRate: `${health.successRate}%`,
          stats: validator.getStats(),
        },
      };
    } catch (error) {
      components.responseValidator = {
        healthy: false,
        message: 'Response validator check failed',
        details: { error: String(error) },
      };
    }

    // Determine overall health
    const allHealthy = Object.values(components).every((c) => c.healthy);

    return {
      healthy: allHealthy,
      timestamp,
      components,
    };
  }

  /**
   * Display health status
   */
  displayHealth(status: HealthStatus): void {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║  Akamai MCP Server - Health Check                    ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    const overallIcon = status.healthy ? '✅' : '❌';
    console.log(`${overallIcon} Overall Status: ${status.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    console.log(`🕐 Timestamp: ${status.timestamp}\n`);

    console.log('Components:\n');

    for (const [name, component] of Object.entries(status.components)) {
      const icon = component.healthy ? '✅' : '❌';
      console.log(`${icon} ${name}`);
      console.log(`   ${component.message}`);

      if (component.details) {
        console.log(`   Details:`, JSON.stringify(component.details, null, 2).split('\n').slice(0, 10).join('\n   '));
      }

      console.log('');
    }

    // Exit code based on health
    process.exit(status.healthy ? 0 : 1);
  }

  /**
   * Display health in JSON format
   */
  displayJSON(status: HealthStatus): void {
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.healthy ? 0 : 1);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const cli = new HealthCheckCLI();
  const jsonOutput = process.argv.includes('--json');

  try {
    const status = await cli.check();

    if (jsonOutput) {
      cli.displayJSON(status);
    } else {
      cli.displayHealth(status);
    }
  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { HealthCheckCLI };
