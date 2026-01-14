/**
 * Unit tests for configuration module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfig, resetConfig } from '../../src/utils/config.js';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    resetConfig(); // Reset singleton between tests
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it('should load valid configuration from environment variables', () => {
    process.env.AKAMAI_HOST = 'test-host.luna.akamaiapis.net';
    process.env.AKAMAI_CLIENT_TOKEN = 'test-client-token';
    process.env.AKAMAI_CLIENT_SECRET = 'test-client-secret';
    process.env.AKAMAI_ACCESS_TOKEN = 'test-access-token';

    const config = getConfig();

    expect(config.akamai.host).toBe('test-host.luna.akamaiapis.net');
    expect(config.akamai.clientToken).toBe('test-client-token');
    expect(config.akamai.clientSecret).toBe('test-client-secret');
    expect(config.akamai.accessToken).toBe('test-access-token');
  });

  it('should throw error when required fields are missing', () => {
    process.env.AKAMAI_HOST = '';

    expect(() => getConfig()).toThrow();
  });

  it('should use default values for optional configuration', () => {
    process.env.AKAMAI_HOST = 'test-host.luna.akamaiapis.net';
    process.env.AKAMAI_CLIENT_TOKEN = 'test-client-token';
    process.env.AKAMAI_CLIENT_SECRET = 'test-client-secret';
    process.env.AKAMAI_ACCESS_TOKEN = 'test-access-token';

    const config = getConfig();

    expect(config.logging.level).toBeDefined();
    expect(config.retry.maxRetries).toBeGreaterThan(0);
  });

  it('should validate retry configuration values', () => {
    process.env.AKAMAI_HOST = 'test-host.luna.akamaiapis.net';
    process.env.AKAMAI_CLIENT_TOKEN = 'test-client-token';
    process.env.AKAMAI_CLIENT_SECRET = 'test-client-secret';
    process.env.AKAMAI_ACCESS_TOKEN = 'test-access-token';
    process.env.MAX_RETRIES = '5';
    process.env.RETRY_DELAY_MS = '2000';

    const config = getConfig();

    expect(config.retry.maxRetries).toBe(5);
    expect(config.retry.retryDelayMs).toBe(2000);
  });
});
