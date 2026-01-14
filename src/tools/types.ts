/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
}>;

/**
 * Tool definition for MCP server
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Common API response types
 */
export interface AkamaiError {
  type: string;
  title: string;
  detail: string;
  status: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems?: number;
  pageSize?: number;
  pageNumber?: number;
}

/**
 * Format successful tool response
 */
export function formatSuccess(data: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Format error tool response
 */
export function formatError(error: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unknown error occurred';

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: true,
            message: errorMessage,
          },
          null,
          2
        ),
      },
    ],
  };
}
