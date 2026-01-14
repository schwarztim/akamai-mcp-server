/**
 * Response Caching Layer
 *
 * Intelligent caching for API responses to reduce latency and API calls.
 * Supports TTL, cache invalidation, and memory management.
 */

import { getLogger } from '../utils/logger.js';

export interface CacheOptions {
  /** Default TTL in ms */
  defaultTTL?: number;

  /** Maximum cache size (number of entries) */
  maxSize?: number;

  /** Enable cache */
  enabled?: boolean;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  totalSize: number;
  maxSize: number;
}

/**
 * LRU Cache with TTL support
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder: string[] = [];
  private hits = 0;
  private misses = 0;
  private readonly logger;
  private readonly options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.logger = getLogger();

    this.options = {
      defaultTTL: options.defaultTTL ?? 60000, // 1 minute
      maxSize: options.maxSize ?? 1000,
      enabled: options.enabled ?? true,
    };

    this.logger.info('Response cache initialized', {
      defaultTTL: this.options.defaultTTL,
      maxSize: this.options.maxSize,
      enabled: this.options.enabled,
    });

    // Setup periodic cleanup
    this.setupPeriodicCleanup();
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | undefined {
    if (!this.options.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.logger.debug(`Cache expired: ${key}`);
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.misses++;
      return undefined;
    }

    // Update access tracking
    entry.hits++;
    this.updateAccessOrder(key);
    this.hits++;

    this.logger.debug(`Cache hit: ${key}`, {
      hits: entry.hits,
      age: Date.now() - entry.timestamp,
    });

    return entry.data as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    if (!this.options.enabled) {
      return;
    }

    // Enforce max size with LRU eviction
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.options.defaultTTL,
      hits: 0,
      size: this.estimateSize(data),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);

    this.logger.debug(`Cache set: ${key}`, {
      ttl: entry.ttl,
      size: entry.size,
    });
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    this.removeFromAccessOrder(key);
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.logger.info('Clearing cache');
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    this.logger.info(`Invalidated ${invalidated} cache entries`, {
      pattern: pattern.toString(),
    });

    return invalidated;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      totalSize,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Get top cached items by hit count
   */
  getTopItems(count = 10): Array<{ key: string; hits: number; age: number }> {
    const items = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        hits: entry.hits,
        age: Date.now() - entry.timestamp,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, count);

    return items;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const keyToEvict = this.accessOrder[0];
    this.cache.delete(keyToEvict);
    this.accessOrder.shift();

    this.logger.debug(`Evicted LRU entry: ${keyToEvict}`);
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Estimate size of data for memory tracking
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 1000; // Default estimate
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Setup periodic cleanup task
   */
  private setupPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  /**
   * Generate a cache key from operation and parameters
   */
  static generateKey(operationId: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    return `${operationId}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Check if an operation should be cached (GET requests only by default)
   */
  static shouldCache(method: string, statusCode: number): boolean {
    // Only cache successful GET requests
    return method === 'GET' && statusCode >= 200 && statusCode < 300;
  }

  /**
   * Get cache health status
   */
  getHealth(): {
    healthy: boolean;
    hitRate: number;
    utilizat: number;
    message: string;
  } {
    const stats = this.getStats();
    const utilization = (stats.entries / stats.maxSize) * 100;

    if (stats.hitRate < 20 && this.hits + this.misses > 100) {
      return {
        healthy: false,
        hitRate: stats.hitRate,
        utilizat: utilization,
        message: 'Cache hit rate below 20%',
      };
    }

    if (utilization > 95) {
      return {
        healthy: false,
        hitRate: stats.hitRate,
        utilizat: utilization,
        message: 'Cache near capacity',
      };
    }

    return {
      healthy: true,
      hitRate: stats.hitRate,
      utilizat: utilization,
      message: 'Cache healthy',
    };
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    this.logger.info(`Cache ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) {
      this.clear();
    }
  }
}

// Singleton instance
let cacheInstance: ResponseCache | null = null;

/**
 * Get the global response cache
 */
export function getResponseCache(options?: CacheOptions): ResponseCache {
  if (!cacheInstance) {
    cacheInstance = new ResponseCache(options);
  }
  return cacheInstance;
}

/**
 * Reset the response cache (for testing)
 */
export function resetResponseCache(): void {
  cacheInstance = null;
}
