/**
 * Instrumentation
 *
 * Automatic metrics collection for key server operations.
 */

import { getMetricsCollector } from './metrics-collector.js';

/**
 * Instrument tool execution
 */
export function instrumentToolCall(
  toolName: string,
  product: string,
  method: string
): { recordSuccess: (duration: number) => void; recordError: (error: Error) => void } {
  const metrics = getMetricsCollector();
  const startTime = Date.now();

  metrics.incrementCounter('akamai_mcp_tool_calls_total', {
    tool: toolName,
    product,
    method,
  });

  return {
    recordSuccess: (duration: number) => {
      metrics.incrementCounter('akamai_mcp_tool_calls_success_total', {
        tool: toolName,
        product,
        method,
      });

      metrics.recordHistogram(
        'akamai_mcp_tool_duration_seconds',
        duration / 1000,
        { tool: toolName, product, method }
      );
    },

    recordError: (error: Error) => {
      metrics.incrementCounter('akamai_mcp_tool_calls_error_total', {
        tool: toolName,
        product,
        method,
        error: error.name,
      });
    },
  };
}

/**
 * Instrument API request
 */
export function instrumentApiRequest(
  operation: string,
  method: string,
  product: string
): {
  recordResponse: (statusCode: number, duration: number) => void;
  recordError: (error: Error) => void;
} {
  const metrics = getMetricsCollector();

  metrics.incrementCounter('akamai_api_requests_total', {
    operation,
    method,
    product,
  });

  return {
    recordResponse: (statusCode: number, duration: number) => {
      const statusClass = `${Math.floor(statusCode / 100)}xx`;

      metrics.incrementCounter('akamai_api_requests_by_status_total', {
        operation,
        method,
        product,
        status: statusCode.toString(),
        status_class: statusClass,
      });

      metrics.recordHistogram(
        'akamai_api_request_duration_seconds',
        duration / 1000,
        { operation, method, product, status_class: statusClass }
      );
    },

    recordError: (error: Error) => {
      metrics.incrementCounter('akamai_api_errors_total', {
        operation,
        method,
        product,
        error: error.name,
      });
    },
  };
}

/**
 * Instrument pagination
 */
export function recordPagination(
  operation: string,
  pageCount: number,
  totalItems: number,
  duration: number
): void {
  const metrics = getMetricsCollector();

  metrics.recordHistogram('akamai_mcp_pagination_pages', pageCount, {
    operation,
  });

  metrics.recordHistogram('akamai_mcp_pagination_items', totalItems, {
    operation,
  });

  metrics.recordHistogram(
    'akamai_mcp_pagination_duration_seconds',
    duration / 1000,
    { operation }
  );
}

/**
 * Record registry loading metrics
 */
export function recordRegistryLoad(
  operationsCount: number,
  specsCount: number,
  duration: number
): void {
  const metrics = getMetricsCollector();

  metrics.setGauge('akamai_mcp_registry_operations_total', operationsCount);
  metrics.setGauge('akamai_mcp_registry_specs_loaded', specsCount);
  metrics.recordHistogram(
    'akamai_mcp_registry_load_duration_seconds',
    duration / 1000
  );
}

/**
 * Record tool generation metrics
 */
export function recordToolGeneration(toolsCount: number, duration: number): void {
  const metrics = getMetricsCollector();

  metrics.setGauge('akamai_mcp_tools_generated_total', toolsCount);
  metrics.recordHistogram(
    'akamai_mcp_tool_generation_duration_seconds',
    duration / 1000
  );
}

/**
 * Record retry metrics
 */
export function recordRetry(operation: string, attemptNumber: number, success: boolean): void {
  const metrics = getMetricsCollector();

  metrics.incrementCounter('akamai_mcp_retries_total', {
    operation,
    attempt: attemptNumber.toString(),
    success: success.toString(),
  });
}

/**
 * Record cache hit/miss
 */
export function recordCacheAccess(hit: boolean, key: string): void {
  const metrics = getMetricsCollector();

  const result = hit ? 'hit' : 'miss';
  metrics.incrementCounter('akamai_mcp_cache_access_total', {
    result,
    key_type: key.split(':')[0] || 'unknown',
  });
}

/**
 * Update active connections gauge
 */
export function updateActiveConnections(count: number): void {
  const metrics = getMetricsCollector();
  metrics.setGauge('akamai_mcp_active_connections', count);
}

/**
 * Record server startup
 */
export function recordServerStartup(duration: number, success: boolean): void {
  const metrics = getMetricsCollector();

  metrics.recordHistogram('akamai_mcp_server_startup_duration_seconds', duration / 1000);
  metrics.incrementCounter('akamai_mcp_server_starts_total', {
    success: success.toString(),
  });
}
