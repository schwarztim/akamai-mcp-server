/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitState, CircuitBreakerManager } from '../../src/reliability/circuit-breaker.js';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      windowSize: 5000,
      name: 'test-breaker',
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isAvailable()).toBe(true);
    });

    it('should have zero failures initially', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });
  });

  describe('Success Execution', () => {
    it('should execute successful function', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledOnce();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track successful executions', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await circuitBreaker.execute(fn);
      await circuitBreaker.execute(fn);

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(2);
    });
  });

  describe('Failure Handling', () => {
    it('should allow failures below threshold', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');
      await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after threshold failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail threshold times
      await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      await expect(circuitBreaker.execute(fn)).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isAvailable()).toBe(false);
    });

    it('should reject requests when circuit is open', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      // Try to execute when open
      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');

      const stats = circuitBreaker.getStats();
      expect(stats.rejectedRequests).toBe(1);
    });
  });

  describe('Half-Open State', () => {
    it('should transition to half-open after timeout', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next execution should transition to half-open
      fn.mockResolvedValue('success');
      await circuitBreaker.execute(fn);

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(1);
    });

    it('should close circuit after success threshold in half-open', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Succeed threshold times
      fn.mockResolvedValue('success');
      await circuitBreaker.execute(fn);
      await circuitBreaker.execute(fn);

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failure in half-open', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Fail in half-open
      await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Reset', () => {
    it('should reset circuit breaker state', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });
  });
});

describe('Circuit Breaker Manager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  it('should create and retrieve circuit breakers', () => {
    const breaker1 = manager.getBreaker('service1');
    const breaker2 = manager.getBreaker('service1');

    expect(breaker1).toBe(breaker2);
  });

  it('should manage multiple circuit breakers', () => {
    manager.getBreaker('service1');
    manager.getBreaker('service2');

    const stats = manager.getAllStats();
    expect(Object.keys(stats)).toHaveLength(2);
  });

  it('should get health summary', async () => {
    const breaker = manager.getBreaker('service1');
    const fn = vi.fn().mockRejectedValue(new Error('failure'));

    // Open circuit
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }

    const summary = manager.getHealthSummary();
    expect(summary.unhealthy).toBe(1);
    expect(summary.healthy).toBe(0);
  });

  it('should reset all circuit breakers', async () => {
    const breaker1 = manager.getBreaker('service1');
    const breaker2 = manager.getBreaker('service2');

    const fn = vi.fn().mockRejectedValue(new Error('failure'));

    // Open circuits
    for (let i = 0; i < 5; i++) {
      await expect(breaker1.execute(fn)).rejects.toThrow();
      await expect(breaker2.execute(fn)).rejects.toThrow();
    }

    manager.resetAll();

    expect(breaker1.getState()).toBe(CircuitState.CLOSED);
    expect(breaker2.getState()).toBe(CircuitState.CLOSED);
  });
});
