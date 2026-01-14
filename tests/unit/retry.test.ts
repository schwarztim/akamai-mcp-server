/**
 * Unit tests for retry logic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../../src/utils/retry.js';

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const successFn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(successFn, {
      maxRetries: 3,
      delayMs: 100,
    });

    expect(result).toBe('success');
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      delayMs: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        delayMs: 10,
      })
    ).rejects.toThrow('Persistent failure');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should apply exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await withRetry(fn, {
      maxRetries: 2,
      delayMs: 100,
    });

    const duration = Date.now() - startTime;

    // Should have at least one delay
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it('should handle non-retryable errors immediately', async () => {
    const error = new Error('Non-retryable');
    (error as any).status = 400; // Client error

    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        delayMs: 10,
      })
    ).rejects.toThrow('Non-retryable');

    // Should not retry on 4xx errors
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
