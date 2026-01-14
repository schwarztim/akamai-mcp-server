/**
 * Test setup and global configuration for Vitest
 */
import { beforeAll, afterAll, afterEach } from 'vitest';

// Setup test environment
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
});

// Clean up after each test
afterEach(() => {
  // Reset any mocks or stubs
});

afterAll(() => {
  // Final cleanup
});
