import { config } from 'dotenv';
import { z } from 'zod';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Load environment variables
config();

/**
 * Parse .edgerc file (INI format)
 * Supports standard Akamai credential file format
 */
function parseEdgerc(section: string = 'default'): Record<string, string> {
  // Check multiple locations for .edgerc
  const edgercPaths = [
    process.env.AKAMAI_EDGERC, // Custom path via env var
    join(homedir(), '.edgerc'), // Standard location
    join(PROJECT_ROOT, '.edgerc'), // Project-local
  ].filter(Boolean) as string[];

  for (const edgercPath of edgercPaths) {
    if (!existsSync(edgercPath)) continue;

    try {
      const content = readFileSync(edgercPath, 'utf-8');
      const lines = content.split('\n');
      const result: Record<string, string> = {};
      let inSection = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Section header
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          const sectionName = trimmed.slice(1, -1).trim();
          inSection = sectionName === section;
          continue;
        }

        // Key-value pair within our section
        if (inSection && trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            result[key] = value;
          }
        }
      }

      // Only return if we found credentials
      if (result.host || result.client_token) {
        return result;
      }
    } catch (e) {
      // Continue to next path
    }
  }

  return {};
}

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
    file: z.string(),
  }),
  retry: z.object({
    maxRetries: z.number().min(0).max(10).default(3),
    retryDelayMs: z.number().min(100).max(10000).default(1000),
  }),
  timeout: z.number().min(1000).max(300000).default(30000),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables or .edgerc
 *
 * Priority:
 * 1. Environment variables (AKAMAI_HOST, AKAMAI_CLIENT_TOKEN, etc.)
 * 2. .edgerc file (~/.edgerc or project-local .edgerc)
 */
export function loadConfig(): Config {
  try {
    // Get .edgerc credentials as fallback
    const edgercSection = process.env.AKAMAI_EDGERC_SECTION || 'default';
    const edgerc = parseEdgerc(edgercSection);

    // Map .edgerc keys to our naming convention
    // .edgerc uses: host, client_token, client_secret, access_token
    const rawConfig = {
      akamai: {
        host: process.env.AKAMAI_HOST || edgerc.host || '',
        clientToken: process.env.AKAMAI_CLIENT_TOKEN || edgerc.client_token || '',
        clientSecret: process.env.AKAMAI_CLIENT_SECRET || edgerc.client_secret || '',
        accessToken: process.env.AKAMAI_ACCESS_TOKEN || edgerc.access_token || '',
        accountKey: process.env.AKAMAI_ACCOUNT_KEY || edgerc.account_key,
      },
      logging: {
        level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
        file: process.env.LOG_FILE || `${PROJECT_ROOT}/logs/akamai-mcp.log`,
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
      },
      timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    };

    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${issues}\n\nMake sure you have either:\n1. Environment variables set (AKAMAI_HOST, AKAMAI_CLIENT_TOKEN, etc.)\n2. A ~/.edgerc file with valid credentials`);
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

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}
