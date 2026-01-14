import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// Configuration schema with validation
const configSchema = z.object({
  akamai: z.object({
    host: z.string().min(1, 'AKAMAI_HOST is required'),
    clientToken: z.string().min(1, 'AKAMAI_CLIENT_TOKEN is required'),
    clientSecret: z.string().min(1, 'AKAMAI_CLIENT_SECRET is required'),
    accessToken: z.string().min(1, 'AKAMAI_ACCESS_TOKEN is required'),
    accountKey: z.string().optional(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.string().default('logs/akamai-mcp.log'),
  }),
  retry: z.object({
    maxRetries: z.number().min(0).max(10).default(3),
    delayMs: z.number().min(100).max(10000).default(1000),
  }),
  timeout: z.number().min(1000).max(300000).default(30000),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  try {
    const rawConfig = {
      akamai: {
        host: process.env.AKAMAI_HOST || '',
        clientToken: process.env.AKAMAI_CLIENT_TOKEN || '',
        clientSecret: process.env.AKAMAI_CLIENT_SECRET || '',
        accessToken: process.env.AKAMAI_ACCESS_TOKEN || '',
        accountKey: process.env.AKAMAI_ACCOUNT_KEY,
      },
      logging: {
        level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
        file: process.env.LOG_FILE || 'logs/akamai-mcp.log',
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
      },
      timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    };

    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${issues}`);
    }
    throw error;
  }
}

/**
 * Get configuration singleton
 */
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
