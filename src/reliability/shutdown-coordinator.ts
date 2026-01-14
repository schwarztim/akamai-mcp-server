/**
 * Graceful Shutdown Coordinator
 *
 * Ensures clean shutdown of the server by:
 * - Stopping new request acceptance
 * - Waiting for in-flight requests to complete
 * - Cleaning up resources (connections, file handles, etc.)
 * - Coordinating shutdown across multiple services
 */

import { getLogger } from '../utils/logger.js';

export interface ShutdownOptions {
  /** Timeout in ms to wait for in-flight requests */
  timeout?: number;

  /** Force shutdown after timeout */
  forceShutdown?: boolean;
}

type ShutdownHandler = () => Promise<void> | void;

export interface ShutdownStats {
  shutdownStarted: boolean;
  shutdownCompleted: boolean;
  inFlightRequests: number;
  handlersRegistered: number;
  handlersCompleted: number;
  shutdownStartTime?: number;
  shutdownDuration?: number;
}

/**
 * Graceful Shutdown Coordinator
 */
export class ShutdownCoordinator {
  private shutdownStarted = false;
  private shutdownCompleted = false;
  private inFlightRequests = 0;
  private handlers: Map<string, ShutdownHandler> = new Map();
  private shutdownStartTime?: number;
  private shutdownDuration?: number;
  private shutdownPromise?: Promise<void>;
  private readonly logger;

  constructor(private readonly options: ShutdownOptions = {}) {
    this.logger = getLogger();

    // Register signal handlers
    this.setupSignalHandlers();
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // SIGTERM - Kubernetes/Docker graceful shutdown
    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM signal');
      this.shutdown().catch((error) => {
        this.logger.error('Shutdown error', { error });
        process.exit(1);
      });
    });

    // SIGINT - Ctrl+C
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT signal');
      this.shutdown().catch((error) => {
        this.logger.error('Shutdown error', { error });
        process.exit(1);
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error });
      this.shutdown(true).catch(() => {
        process.exit(1);
      });
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', { reason, promise });
      this.shutdown(true).catch(() => {
        process.exit(1);
      });
    });
  }

  /**
   * Register a shutdown handler
   */
  registerHandler(name: string, handler: ShutdownHandler): void {
    if (this.shutdownStarted) {
      this.logger.warn(`Cannot register handler '${name}' during shutdown`);
      return;
    }

    this.handlers.set(name, handler);
    this.logger.debug(`Registered shutdown handler: ${name}`);
  }

  /**
   * Unregister a shutdown handler
   */
  unregisterHandler(name: string): void {
    this.handlers.delete(name);
    this.logger.debug(`Unregistered shutdown handler: ${name}`);
  }

  /**
   * Track a request starting
   */
  requestStart(): void {
    if (this.shutdownStarted) {
      throw new Error('Server is shutting down, cannot accept new requests');
    }
    this.inFlightRequests++;
  }

  /**
   * Track a request completing
   */
  requestEnd(): void {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);

    // If we're shutting down and this was the last request, trigger final cleanup
    if (this.shutdownStarted && this.inFlightRequests === 0) {
      this.logger.info('All in-flight requests completed');
    }
  }

  /**
   * Check if shutdown has started
   */
  isShuttingDown(): boolean {
    return this.shutdownStarted;
  }

  /**
   * Get current in-flight request count
   */
  getInFlightCount(): number {
    return this.inFlightRequests;
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(force = false): Promise<void> {
    // Prevent multiple shutdown calls
    if (this.shutdownStarted) {
      this.logger.warn('Shutdown already in progress');
      return this.shutdownPromise;
    }

    this.shutdownStarted = true;
    this.shutdownStartTime = Date.now();

    this.logger.info('Starting graceful shutdown', {
      inFlightRequests: this.inFlightRequests,
      handlersToRun: this.handlers.size,
      force,
    });

    this.shutdownPromise = this.executeShutdown(force);
    return this.shutdownPromise;
  }

  /**
   * Execute the shutdown sequence
   */
  private async executeShutdown(force: boolean): Promise<void> {
    try {
      // Step 1: Wait for in-flight requests (unless force shutdown)
      if (!force && this.inFlightRequests > 0) {
        await this.waitForInFlightRequests();
      }

      // Step 2: Run all shutdown handlers
      await this.runShutdownHandlers();

      this.shutdownCompleted = true;
      this.shutdownDuration = Date.now() - (this.shutdownStartTime || 0);

      this.logger.info('Graceful shutdown completed', {
        duration: `${this.shutdownDuration}ms`,
        handlersRun: this.handlers.size,
      });

      process.exit(0);
    } catch (error) {
      this.logger.error('Shutdown error', { error });
      throw error;
    }
  }

  /**
   * Wait for in-flight requests to complete
   */
  private async waitForInFlightRequests(): Promise<void> {
    const timeout = this.options.timeout || 30000;
    const checkInterval = 100;
    let waited = 0;

    this.logger.info(`Waiting for ${this.inFlightRequests} in-flight requests...`);

    while (this.inFlightRequests > 0 && waited < timeout) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;

      if (waited % 5000 === 0) {
        this.logger.info(`Still waiting... ${this.inFlightRequests} requests remaining`);
      }
    }

    if (this.inFlightRequests > 0) {
      const message = `Timeout waiting for in-flight requests (${this.inFlightRequests} remaining)`;

      if (this.options.forceShutdown) {
        this.logger.warn(message + ' - forcing shutdown');
      } else {
        throw new Error(message);
      }
    } else {
      this.logger.info('All in-flight requests completed successfully');
    }
  }

  /**
   * Run all registered shutdown handlers
   */
  private async runShutdownHandlers(): Promise<void> {
    this.logger.info(`Running ${this.handlers.size} shutdown handlers...`);

    let completed = 0;

    for (const [name, handler] of this.handlers.entries()) {
      try {
        this.logger.debug(`Running shutdown handler: ${name}`);
        await handler();
        completed++;
        this.logger.debug(`Completed shutdown handler: ${name}`);
      } catch (error) {
        this.logger.error(`Shutdown handler '${name}' failed`, { error });

        // Continue with other handlers even if one fails
        if (!this.options.forceShutdown) {
          throw error;
        }
      }
    }

    this.logger.info(`Completed ${completed}/${this.handlers.size} shutdown handlers`);
  }

  /**
   * Get shutdown statistics
   */
  getStats(): ShutdownStats {
    return {
      shutdownStarted: this.shutdownStarted,
      shutdownCompleted: this.shutdownCompleted,
      inFlightRequests: this.inFlightRequests,
      handlersRegistered: this.handlers.size,
      handlersCompleted: this.shutdownCompleted ? this.handlers.size : 0,
      shutdownStartTime: this.shutdownStartTime,
      shutdownDuration: this.shutdownDuration,
    };
  }

  /**
   * Create a wrapped handler that tracks request lifecycle
   */
  wrapHandler<T>(handler: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.requestStart();
      try {
        return await handler();
      } finally {
        this.requestEnd();
      }
    };
  }
}

// Singleton instance
let coordinatorInstance: ShutdownCoordinator | null = null;

/**
 * Get the global shutdown coordinator
 */
export function getShutdownCoordinator(options?: ShutdownOptions): ShutdownCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new ShutdownCoordinator(options);
  }
  return coordinatorInstance;
}

/**
 * Reset the shutdown coordinator (for testing)
 */
export function resetShutdownCoordinator(): void {
  coordinatorInstance = null;
}
