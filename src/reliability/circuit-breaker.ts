/**
 * Circuit Breaker Pattern
 *
 * Prevents cascade failures by detecting unhealthy services and temporarily
 * stopping requests to them, giving them time to recover.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail fast
 * - HALF_OPEN: Testing if service recovered, limited requests pass through
 */

import { getLogger } from '../utils/logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Failure threshold to open circuit */
  failureThreshold: number;

  /** Success threshold to close circuit from half-open */
  successThreshold: number;

  /** Time in ms to wait before attempting recovery */
  timeout: number;

  /** Time window in ms for failure tracking */
  windowSize: number;

  /** Name for logging */
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  rejectedRequests: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private rejectedCount: number = 0;
  private totalCount: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private failureTimestamps: number[] = [];
  private readonly logger;
  private readonly name: string;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.logger = getLogger();
    this.name = options.name || 'CircuitBreaker';
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCount++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < (this.nextAttemptTime || 0)) {
        this.rejectedCount++;
        throw new Error(
          `Circuit breaker is OPEN for ${this.name}. Next attempt at ${new Date(this.nextAttemptTime!).toISOString()}`
        );
      }

      // Timeout elapsed, try half-open
      this.transitionToHalfOpen();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.failureTimestamps = [];
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record failed execution
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.failureTimestamps.push(Date.now());

    // Remove old failures outside the window
    const cutoffTime = Date.now() - this.options.windowSize;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoffTime);

    // Check if threshold exceeded
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.failureTimestamps.length >= this.options.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.logger.info(`Circuit breaker ${this.name}: CLOSED (healthy)`);
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = undefined;
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.logger.warn(`Circuit breaker ${this.name}: OPEN (unhealthy) - too many failures`);
    this.state = CircuitState.OPEN;
    this.successCount = 0;
    this.nextAttemptTime = Date.now() + this.options.timeout;
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.logger.info(`Circuit breaker ${this.name}: HALF_OPEN (testing recovery)`);
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      rejectedRequests: this.rejectedCount,
      totalRequests: this.totalCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.logger.info(`Circuit breaker ${this.name}: Manual reset`);
    this.transitionToClosed();
    this.rejectedCount = 0;
    this.totalCount = 0;
    this.failureTimestamps = [];
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    return Date.now() >= (this.nextAttemptTime || 0);
  }
}

/**
 * Circuit breaker manager for multiple services
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    windowSize: 10000, // 10 seconds
  };

  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker({
          ...this.defaultOptions,
          ...options,
          name,
        })
      );
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get circuit breaker health summary
   */
  getHealthSummary(): { healthy: number; unhealthy: number; testing: number } {
    let healthy = 0;
    let unhealthy = 0;
    let testing = 0;

    for (const breaker of this.breakers.values()) {
      const state = breaker.getState();
      if (state === CircuitState.CLOSED) healthy++;
      else if (state === CircuitState.OPEN) unhealthy++;
      else testing++;
    }

    return { healthy, unhealthy, testing };
  }
}

// Singleton instance
let managerInstance: CircuitBreakerManager | null = null;

/**
 * Get the global circuit breaker manager
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
  if (!managerInstance) {
    managerInstance = new CircuitBreakerManager();
  }
  return managerInstance;
}
