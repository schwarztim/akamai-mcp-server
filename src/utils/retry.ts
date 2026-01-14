import { getConfig } from './config.js';
import { getLogger } from './logger.js';

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { response?: { status?: number }; code?: string };

  // Retry on network errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    return true;
  }

  // Retry on specific HTTP status codes
  if (err.response?.status) {
    const status = err.response.status;
    // 429: Too Many Requests, 500-504: Server errors
    return status === 429 || (status >= 500 && status <= 504);
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Add jitter (random 0-20% variation) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * Math.random();

  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  const config = getConfig();
  const logger = getLogger();
  const { maxRetries, delayMs } = config.retry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        logger.error(`Non-retryable error in ${operation}`, { error });
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        logger.error(`Max retries (${maxRetries}) exceeded for ${operation}`, { error });
        break;
      }

      // Calculate delay and retry
      const delay = calculateDelay(attempt, delayMs);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} for ${operation} after ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number = 20, refillRate: number = 2) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
    await sleep(waitTime);
    this.tokens = 0; // Token used
  }
}
