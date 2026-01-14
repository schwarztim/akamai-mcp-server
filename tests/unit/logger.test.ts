/**
 * Unit tests for logger module
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getLogger } from '../../src/utils/logger.js';

describe('Logger', () => {
  it('should create a logger instance', () => {
    const logger = getLogger();

    expect(logger).toBeDefined();
    expect(logger.info).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.debug).toBeTypeOf('function');
  });

  it('should return singleton logger instance', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();

    expect(logger1).toBe(logger2);
  });

  it('should support different log levels', () => {
    const logger = getLogger();

    // Should not throw errors
    expect(() => logger.info('Test info message')).not.toThrow();
    expect(() => logger.error('Test error message')).not.toThrow();
    expect(() => logger.warn('Test warn message')).not.toThrow();
    expect(() => logger.debug('Test debug message')).not.toThrow();
  });
});
