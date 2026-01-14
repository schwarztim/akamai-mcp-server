import EdgeGrid from 'akamai-edgegrid';
import { getConfig } from '../utils/config.js';
import { getLogger, logRequest, logResponse, logError } from '../utils/logger.js';
import { withRetry, RateLimiter } from '../utils/retry.js';

/**
 * EdgeGrid API client with authentication and retry logic
 */
export class EdgeGridClient {
  private client: EdgeGrid;
  private rateLimiter: RateLimiter;

  constructor() {
    const config = getConfig();
    const logger = getLogger();

    // Initialize EdgeGrid client with new akamai-edgegrid API
    this.client = new EdgeGrid(
      config.akamai.clientToken,
      config.akamai.clientSecret,
      config.akamai.accessToken,
      config.akamai.host
    );

    this.rateLimiter = new RateLimiter(20, 2); // 20 requests, refill 2/sec

    logger.info('EdgeGrid client initialized', {
      host: config.akamai.host.substring(0, 20) + '...',
    });
  }

  /**
   * Make GET request
   */
  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  /**
   * Make POST request
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('POST', path, body, params);
  }

  /**
   * Make PUT request
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('PUT', path, body, params);
  }

  /**
   * Make DELETE request
   */
  async delete<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('DELETE', path, undefined, params);
  }

  /**
   * Generic request method with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    // Apply rate limiting
    await this.rateLimiter.acquire();

    logRequest(method, path, body);

    return withRetry(async () => {
      const startTime = Date.now();

      try {
        const response = await new Promise<{ body: T; statusCode: number }>((resolve, reject) => {
          const options: any = {
            path,  // Use original path without query string
            method,
            body: body ? JSON.stringify(body) : undefined,
            headers: body
              ? {
                  'Content-Type': 'application/json',
                }
              : undefined,
          };

          // Add query parameters using qs property
          if (params && Object.keys(params).length > 0) {
            options.qs = params;
          }

          // Chain auth() and send()
          this.client.auth(options).send((error: any, response: any, responseBody: any) => {
            if (error) {
              reject(error);
              return;
            }

            try {
              const parsedBody = responseBody ? JSON.parse(responseBody) : {};
              resolve({
                body: parsedBody as T,
                statusCode: response.statusCode || 200,
              });
            } catch (parseError) {
              // Return raw body if not JSON
              resolve({
                body: responseBody as T,
                statusCode: response.statusCode || 200,
              });
            }
          });
        });

        const duration = Date.now() - startTime;
        logResponse(method, path, response.statusCode, duration);

        // Check for HTTP errors
        if (response.statusCode >= 400) {
          const error: any = new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
          error.response = {
            status: response.statusCode,
            data: response.body,
          };
          throw error;
        }

        return response.body;
      } catch (error) {
        logError(error as Error, {
          method,
          path,
          body,
        });
        throw error;
      }
    }, `${method} ${path}`);
  }

  /**
   * Health check - verify credentials and connectivity
   */
  async healthCheck(): Promise<{ status: string; message: string }> {
    const logger = getLogger();

    try {
      // Try to access a simple endpoint to verify auth
      await this.get('/identity-management/v3/user-profile');

      logger.info('Health check passed');
      return {
        status: 'healthy',
        message: 'Successfully connected to Akamai API',
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
let clientInstance: EdgeGridClient | null = null;

/**
 * Get EdgeGrid client singleton
 */
export function getEdgeGridClient(): EdgeGridClient {
  if (!clientInstance) {
    clientInstance = new EdgeGridClient();
  }
  return clientInstance;
}
