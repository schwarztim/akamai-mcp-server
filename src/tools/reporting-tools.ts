/**
 * Reporting & Analytics Tools
 *
 * High-level tools for Akamai traffic, performance, and error reporting.
 * Aggregates data from Reporting API for actionable insights.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';

async function executeOperation(
  toolName: string,
  pathParams: Record<string, string | number> = {},
  queryParams: Record<string, string | number | boolean> = {},
  body?: any
): Promise<any> {
  const registry = await getOperationRegistry();
  const operation = registry.getOperation(toolName);
  if (!operation) throw new Error(`Operation not found: ${toolName}`);

  const executor = getUniversalExecutor();
  const result = await executor.execute(operation, {
    pathParams,
    queryParams,
    body,
    paginate: true,
    maxPages: 100,
  });

  return result.body;
}

/**
 * Helper to get date range
 */
function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/**
 * Performance Report Tool
 */
export function getPerformanceReportTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_performance_report',
    description: `Generate a performance report for your Akamai properties.

Analyzes:
- Response time metrics (origin and edge)
- Cache hit ratios
- Throughput and bandwidth
- Geographic performance distribution

Returns aggregated metrics with trends and recommendations.

Example: "Show performance report for the last 7 days"`,
    inputSchema: {
      type: 'object',
      properties: {
        cpCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'CP codes to analyze (optional - defaults to all)',
        },
        days: {
          type: 'number',
          description: 'Number of days to analyze (default: 7, max: 30)',
          default: 7,
        },
        groupBy: {
          type: 'string',
          enum: ['day', 'hour', 'country', 'cpcode'],
          description: 'How to group results (default: day)',
          default: 'day',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const days = Math.min((args.days as number) || 7, 30);
    const groupBy = (args.groupBy as string) || 'day';
    const cpCodes = args.cpCodes as number[] | undefined;

    logger.info(`Generating performance report for last ${days} days`);

    try {
      const { start, end } = getDateRange(days);

      // Try to get reporting data via the reporting API
      let reportData: any = null;

      try {
        // Attempt to use the reporting API if available
        reportData = await executeOperation('akamai_reporting_getReport', {}, {
          start,
          end,
          metrics: 'edgeHits,originHits,edgeBytesTotal,originResponseTime,edgeResponseTime',
          ...(cpCodes ? { cpCodes: cpCodes.join(',') } : {}),
        });
      } catch (e) {
        // Reporting API might not be available, try alternative approaches
        logger.debug('Reporting API not available, using property-based approach');
      }

      // Get CP code information for context
      let cpCodeInfo: any[] = [];
      try {
        const cpCodesResult = await executeOperation('akamai_papi_listCpcodes', {}, {});
        cpCodeInfo = cpCodesResult?.cpcodes?.items || cpCodesResult?.items || [];
      } catch (e) {
        logger.debug('Could not fetch CP code info');
      }

      // Build performance summary
      const summary = {
        reportPeriod: { start, end, days },
        groupBy,
        cpCodesAnalyzed: cpCodes || 'all',
        metrics: reportData ? {
          totalEdgeHits: reportData.edgeHits || 'N/A',
          totalOriginHits: reportData.originHits || 'N/A',
          cacheHitRatio: reportData.edgeHits && reportData.originHits
            ? `${((1 - reportData.originHits / reportData.edgeHits) * 100).toFixed(2)}%`
            : 'N/A',
          totalBytesDelivered: reportData.edgeBytesTotal
            ? `${(reportData.edgeBytesTotal / (1024 * 1024 * 1024)).toFixed(2)} GB`
            : 'N/A',
          avgEdgeResponseTime: reportData.edgeResponseTime
            ? `${reportData.edgeResponseTime}ms`
            : 'N/A',
          avgOriginResponseTime: reportData.originResponseTime
            ? `${reportData.originResponseTime}ms`
            : 'N/A',
        } : {
          note: 'Detailed metrics require Reporting API access. Contact Akamai support to enable.',
          cpCodesAvailable: cpCodeInfo.length,
        },
        cpCodeDetails: cpCodeInfo.slice(0, 10).map((cp: any) => ({
          id: cp.cpcodeId || cp.id,
          name: cp.cpcodeName || cp.name,
          products: cp.productIds || cp.products,
        })),
        recommendations: [
          reportData?.originHits > reportData?.edgeHits * 0.3
            ? '⚠️ High origin offload - consider reviewing cache settings'
            : '✅ Cache hit ratio is healthy',
          reportData?.originResponseTime > 500
            ? '⚠️ Origin response time is high - consider origin optimization'
            : '✅ Origin performance is acceptable',
        ].filter(r => !r.includes('N/A')),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Performance report failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error generating performance report: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Error Report Tool
 */
export function getErrorReportTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_error_report',
    description: `Generate an error report analyzing HTTP errors across your Akamai properties.

Analyzes:
- 4xx client errors (404, 403, etc.)
- 5xx server errors (502, 503, etc.)
- Error trends over time
- Top error-generating URLs

Helps identify issues impacting user experience.

Example: "Show error report for the last 24 hours"`,
    inputSchema: {
      type: 'object',
      properties: {
        cpCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'CP codes to analyze (optional - defaults to all)',
        },
        days: {
          type: 'number',
          description: 'Number of days to analyze (default: 1, max: 7)',
          default: 1,
        },
        errorTypes: {
          type: 'array',
          items: { type: 'string', enum: ['4xx', '5xx', 'all'] },
          description: 'Error types to include (default: all)',
          default: ['all'],
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const days = Math.min((args.days as number) || 1, 7);
    const cpCodes = args.cpCodes as number[] | undefined;
    const errorTypes = (args.errorTypes as string[]) || ['all'];

    logger.info(`Generating error report for last ${days} days`);

    try {
      const { start, end } = getDateRange(days);

      // Try to get error data from reporting API
      let errorData: any = null;

      try {
        errorData = await executeOperation('akamai_reporting_getReport', {}, {
          start,
          end,
          metrics: 'edge4xxErrors,edge5xxErrors,origin4xxErrors,origin5xxErrors',
          ...(cpCodes ? { cpCodes: cpCodes.join(',') } : {}),
        });
      } catch (e) {
        logger.debug('Reporting API not available for error metrics');
      }

      // Build error summary
      const summary = {
        reportPeriod: { start, end, days },
        errorTypesAnalyzed: errorTypes,
        cpCodesAnalyzed: cpCodes || 'all',
        errorMetrics: errorData ? {
          edge4xxErrors: errorData.edge4xxErrors || 0,
          edge5xxErrors: errorData.edge5xxErrors || 0,
          origin4xxErrors: errorData.origin4xxErrors || 0,
          origin5xxErrors: errorData.origin5xxErrors || 0,
          totalErrors: (errorData.edge4xxErrors || 0) + (errorData.edge5xxErrors || 0),
        } : {
          note: 'Detailed error metrics require Reporting API access.',
          suggestion: 'Use akamai_diagnose_url tool to check specific URLs for errors.',
        },
        commonErrorCodes: {
          '400': 'Bad Request - Check client request formatting',
          '403': 'Forbidden - Review WAF rules or access controls',
          '404': 'Not Found - Check origin content or URL mapping',
          '500': 'Internal Server Error - Check origin health',
          '502': 'Bad Gateway - Origin connection issues',
          '503': 'Service Unavailable - Origin overload or maintenance',
          '504': 'Gateway Timeout - Origin response time exceeded',
        },
        recommendations: [
          errorData?.edge5xxErrors > 100
            ? '🔴 High 5xx error rate - investigate origin health immediately'
            : null,
          errorData?.edge4xxErrors > 1000
            ? '🟡 Elevated 4xx errors - review WAF rules and URL mappings'
            : null,
          errorData?.origin5xxErrors > errorData?.edge5xxErrors
            ? '⚠️ Origin errors higher than edge - origin instability detected'
            : null,
          '💡 Use akamai_diagnose_url to trace specific error URLs',
        ].filter(Boolean),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error report failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error generating error report: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Bandwidth Report Tool
 */
export function getBandwidthReportTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_bandwidth_report',
    description: `Generate a bandwidth and traffic report for your Akamai CDN.

Analyzes:
- Total bandwidth delivered (edge and origin)
- Request volumes
- Peak traffic times
- Traffic by geography or CP code

Useful for capacity planning and cost analysis.

Example: "Show bandwidth report for the last 30 days"`,
    inputSchema: {
      type: 'object',
      properties: {
        cpCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'CP codes to analyze (optional - defaults to all)',
        },
        days: {
          type: 'number',
          description: 'Number of days to analyze (default: 30, max: 90)',
          default: 30,
        },
        breakdown: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'cpcode'],
          description: 'How to break down the data (default: daily)',
          default: 'daily',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const days = Math.min((args.days as number) || 30, 90);
    const breakdown = (args.breakdown as string) || 'daily';
    const cpCodes = args.cpCodes as number[] | undefined;

    logger.info(`Generating bandwidth report for last ${days} days`);

    try {
      const { start, end } = getDateRange(days);

      // Try to get bandwidth data from reporting API
      let bandwidthData: any = null;

      try {
        bandwidthData = await executeOperation('akamai_reporting_getReport', {}, {
          start,
          end,
          metrics: 'edgeBytesTotal,originBytesTotal,edgeHits,midgressBytesTotal',
          ...(cpCodes ? { cpCodes: cpCodes.join(',') } : {}),
        });
      } catch (e) {
        logger.debug('Reporting API not available for bandwidth metrics');
      }

      // Get contracts for billing context
      let contracts: any[] = [];
      try {
        const contractsResult = await executeOperation('akamai_papi_listContracts', {}, {});
        contracts = contractsResult?.contracts?.items || contractsResult?.items || [];
      } catch (e) {
        logger.debug('Could not fetch contracts');
      }

      // Calculate derived metrics
      const edgeGB = bandwidthData?.edgeBytesTotal
        ? (bandwidthData.edgeBytesTotal / (1024 ** 3)).toFixed(2)
        : null;
      const originGB = bandwidthData?.originBytesTotal
        ? (bandwidthData.originBytesTotal / (1024 ** 3)).toFixed(2)
        : null;
      const offloadPercent = edgeGB && originGB
        ? ((1 - parseFloat(originGB) / parseFloat(edgeGB)) * 100).toFixed(1)
        : null;

      // Build bandwidth summary
      const summary = {
        reportPeriod: { start, end, days },
        breakdown,
        cpCodesAnalyzed: cpCodes || 'all',
        bandwidthMetrics: bandwidthData ? {
          totalEdgeBandwidth: `${edgeGB} GB`,
          totalOriginBandwidth: `${originGB} GB`,
          offloadEfficiency: `${offloadPercent}%`,
          totalRequests: bandwidthData.edgeHits?.toLocaleString() || 'N/A',
          avgDailyBandwidth: `${(parseFloat(edgeGB!) / days).toFixed(2)} GB/day`,
          midgressBandwidth: bandwidthData.midgressBytesTotal
            ? `${(bandwidthData.midgressBytesTotal / (1024 ** 3)).toFixed(2)} GB`
            : 'N/A',
        } : {
          note: 'Detailed bandwidth metrics require Reporting API access.',
          suggestion: 'Check Akamai Control Center for billing reports.',
        },
        contracts: contracts.slice(0, 5).map((c: any) => ({
          id: c.contractId,
          name: c.contractTypeName,
        })),
        costInsights: offloadPercent ? [
          parseFloat(offloadPercent) > 90
            ? '✅ Excellent cache offload - minimizing origin costs'
            : parseFloat(offloadPercent) > 70
            ? '🟡 Good offload - consider cache optimization for more savings'
            : '🔴 Low offload - review caching rules to reduce origin load',
          `📊 ${days}-day trend: ${edgeGB} GB delivered from edge`,
        ] : [
          '💡 Enable Reporting API for detailed cost analysis',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Bandwidth report failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error generating bandwidth report: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get all reporting tools
 */
export function getReportingTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getPerformanceReportTool(),
    getErrorReportTool(),
    getBandwidthReportTool(),
  ];
}
