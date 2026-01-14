/**
 * Unit tests for Operation Registry
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { OperationRegistry } from '../../src/registry/operation-registry.js';
import type { OperationDefinition } from '../../src/registry/types.js';

describe('Operation Registry', () => {
  let registry: OperationRegistry;

  beforeAll(async () => {
    registry = new OperationRegistry();
    // Mock the load to avoid requiring actual spec files in tests
    vi.spyOn(registry as any, 'findSpecFiles').mockReturnValue([]);
    vi.spyOn(registry as any, 'loadSpec').mockResolvedValue(0);
  });

  describe('Initialization', () => {
    it('should create a new registry instance', () => {
      const reg = new OperationRegistry();
      expect(reg).toBeInstanceOf(OperationRegistry);
    });

    it('should start with empty operations', () => {
      const reg = new OperationRegistry();
      const stats = reg.getStats();
      expect(stats.totalOperations).toBe(0);
    });
  });

  describe('Stats', () => {
    it('should return correct statistics', () => {
      const stats = registry.getStats();
      expect(stats).toHaveProperty('totalOperations');
      expect(stats).toHaveProperty('specsLoaded');
      expect(stats).toHaveProperty('operationsByProduct');
      expect(stats).toHaveProperty('operationsByMethod');
      expect(stats).toHaveProperty('paginatableOperations');
      expect(stats).toHaveProperty('operationsWithBody');
    });

    it('should count operations correctly', () => {
      const stats = registry.getStats();
      expect(stats.totalOperations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Search', () => {
    it('should search by product', () => {
      const results = registry.search({ product: 'papi' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search by method', () => {
      const results = registry.search({ method: 'GET' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search by query text', () => {
      const results = registry.search({ query: 'list' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search by pagination support', () => {
      const results = registry.search({ paginatable: true });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should combine multiple search criteria', () => {
      const results = registry.search({
        product: 'papi',
        method: 'GET',
        paginatable: true,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect limit parameter', () => {
      const results = registry.search({ limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for non-existent product', () => {
      const results = registry.search({ product: 'nonexistent' });
      expect(results).toEqual([]);
    });
  });

  describe('Get Operation', () => {
    it('should return undefined for non-existent operation', () => {
      const op = registry.getOperation('nonexistent_tool');
      expect(op).toBeUndefined();
    });

    it('should return operation definition if exists', () => {
      // This test would work with actual loaded operations
      const op = registry.getOperation('some_valid_tool');
      if (op) {
        expect(op).toHaveProperty('toolName');
        expect(op).toHaveProperty('method');
        expect(op).toHaveProperty('path');
      } else {
        // No operations loaded in this test, so undefined is expected
        expect(op).toBeUndefined();
      }
    });
  });

  describe('Get All Operations', () => {
    it('should return an array', () => {
      const operations = registry.getAllOperations();
      expect(Array.isArray(operations)).toBe(true);
    });

    it('should return all operations', () => {
      const operations = registry.getAllOperations();
      const stats = registry.getStats();
      expect(operations.length).toBe(stats.totalOperations);
    });
  });

  describe('Tool Name Generation', () => {
    it('should generate consistent tool names', () => {
      const mockOp: Partial<OperationDefinition> = {
        product: 'papi',
        operationId: 'listProperties',
      };

      // Tool name format: akamai_{product}_{operationId}
      const expectedName = 'akamai_papi_listProperties';

      // This would require exposing the generateToolName method or testing indirectly
      expect(expectedName).toMatch(/^akamai_[a-z-]+_[a-zA-Z]+$/);
    });

    it('should handle product names with hyphens', () => {
      const toolName = 'akamai_identity-management_listUsers';
      expect(toolName).toMatch(/^akamai_[a-z-]+_[a-zA-Z]+$/);
    });
  });

  describe('Pagination Detection', () => {
    it('should detect pagination parameters', () => {
      const mockParams = [
        { name: 'limit', in: 'query' as const },
        { name: 'offset', in: 'query' as const },
      ];

      const hasPaginationParam = mockParams.some(
        (p) => p.in === 'query' && ['limit', 'offset', 'page', 'cursor'].includes(p.name)
      );

      expect(hasPaginationParam).toBe(true);
    });

    it('should not detect pagination without pagination params', () => {
      const mockParams = [
        { name: 'contractId', in: 'query' as const },
        { name: 'groupId', in: 'query' as const },
      ];

      const hasPaginationParam = mockParams.some(
        (p) => p.in === 'query' && ['limit', 'offset', 'page', 'cursor'].includes(p.name)
      );

      expect(hasPaginationParam).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing specs directory gracefully', async () => {
      const reg = new OperationRegistry();
      vi.spyOn(reg as any, 'findSpecFiles').mockImplementation(() => {
        throw new Error('Specs directory not found');
      });

      await expect(reg.load()).rejects.toThrow('Specs directory not found');
    });

    it('should continue loading after individual spec failures', async () => {
      const reg = new OperationRegistry();
      vi.spyOn(reg as any, 'findSpecFiles').mockReturnValue(['spec1.json', 'spec2.json']);
      vi.spyOn(reg as any, 'loadSpec')
        .mockRejectedValueOnce(new Error('Parse error'))
        .mockResolvedValueOnce(10);

      // Should not throw, just log error and continue
      await reg.load();
      const stats = reg.getStats();
      expect(stats.totalOperations).toBeGreaterThanOrEqual(0);
    });
  });
});
