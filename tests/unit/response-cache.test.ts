/**
 * Response Cache Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseCache } from '../../src/cache/response-cache.js';

describe('Response Cache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache({
      defaultTTL: 1000,
      maxSize: 10,
      enabled: true,
    });
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', { data: 'value1' });
      const result = cache.get('key1');

      expect(result).toEqual({ data: 'value1' });
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should delete keys', () => {
      cache.set('key1', { data: 'value1' });
      cache.delete('key1');

      const result = cache.get('key1');
      expect(result).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: 'value2' });

      cache.clear();

      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', { data: 'value1' }, 100);

      // Should exist immediately
      expect(cache.get('key1')).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should use default TTL when not specified', async () => {
      cache.set('key1', { data: 'value1' });

      // Should exist immediately
      expect(cache.get('key1')).toBeDefined();

      // Wait past default TTL (1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when max size reached', () => {
      // Fill cache to max size
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { data: `value${i}` });
      }

      // Add one more (should evict key0)
      cache.set('key10', { data: 'value10' });

      expect(cache.get('key0')).toBeUndefined();
      expect(cache.get('key10')).toBeDefined();
    });

    it('should update access order on get', () => {
      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { data: `value${i}` });
      }

      // Access key0 (makes it most recently used)
      cache.get('key0');

      // Add new entry (should evict key1, not key0)
      cache.set('key10', { data: 'value10' });

      expect(cache.get('key0')).toBeDefined();
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', { data: 'value1' });

      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key1'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track entry count', () => {
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: 'value2' });

      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
    });

    it('should reset stats on clear', () => {
      cache.set('key1', { data: 'value1' });
      cache.get('key1');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate entries matching pattern', () => {
      cache.set('users:1', { data: 'user1' });
      cache.set('users:2', { data: 'user2' });
      cache.set('posts:1', { data: 'post1' });

      const invalidated = cache.invalidatePattern(/^users:/);

      expect(invalidated).toBe(2);
      expect(cache.get('users:1')).toBeUndefined();
      expect(cache.get('users:2')).toBeUndefined();
      expect(cache.get('posts:1')).toBeDefined();
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent keys', () => {
      const key1 = ResponseCache.generateKey('getUser', { id: 1, name: 'test' });
      const key2 = ResponseCache.generateKey('getUser', { name: 'test', id: 1 });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different operations', () => {
      const key1 = ResponseCache.generateKey('getUser', { id: 1 });
      const key2 = ResponseCache.generateKey('getPost', { id: 1 });

      expect(key1).not.toBe(key2);
    });
  });

  describe('Should Cache', () => {
    it('should cache GET requests with 2xx status', () => {
      expect(ResponseCache.shouldCache('GET', 200)).toBe(true);
      expect(ResponseCache.shouldCache('GET', 204)).toBe(true);
    });

    it('should not cache non-GET requests', () => {
      expect(ResponseCache.shouldCache('POST', 200)).toBe(false);
      expect(ResponseCache.shouldCache('PUT', 200)).toBe(false);
      expect(ResponseCache.shouldCache('DELETE', 200)).toBe(false);
    });

    it('should not cache error responses', () => {
      expect(ResponseCache.shouldCache('GET', 400)).toBe(false);
      expect(ResponseCache.shouldCache('GET', 500)).toBe(false);
    });
  });

  describe('Disabled Cache', () => {
    it('should not cache when disabled', () => {
      cache.setEnabled(false);

      cache.set('key1', { data: 'value1' });
      const result = cache.get('key1');

      expect(result).toBeUndefined();
    });

    it('should clear cache when disabled', () => {
      cache.set('key1', { data: 'value1' });
      cache.setEnabled(false);

      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', () => {
      cache.set('key1', { data: 'value1' });
      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      const health = cache.getHealth();
      expect(health.healthy).toBe(true);
    });

    it('should report unhealthy with low hit rate', () => {
      // First set some keys to establish cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { data: `value${i}` });
      }

      // Generate many misses (much more than hits)
      for (let i = 10; i < 150; i++) {
        cache.get(`key${i}`);
      }

      // Get a few hits
      for (let i = 0; i < 10; i++) {
        cache.get(`key${i}`);
      }

      const health = cache.getHealth();
      // Hit rate should be around 10/(140+10) = 6.7%, which is below 20%
      expect(health.healthy).toBe(false);
      expect(health.message).toContain('hit rate');
    });
  });
});
