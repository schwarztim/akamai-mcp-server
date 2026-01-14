/**
 * Test helpers for creating mock operation definitions
 */
import type { OperationDefinition, ParameterDefinition } from '../../src/registry/types.js';

export function createMockOperation(
  overrides: Partial<OperationDefinition> = {}
): OperationDefinition {
  const defaults: OperationDefinition = {
    toolName: 'akamai_test_operation',
    operationId: 'testOperation',
    method: 'GET',
    path: '/test',
    summary: 'Test operation',
    product: 'test',
    version: 'v1',
    specFile: '/specs/test/v1/openapi.json',
    tags: [],
    pathParameters: [],
    queryParameters: [],
    headerParameters: [],
    responses: {
      '200': {
        statusCode: '200',
        description: 'Success',
      },
    },
    supportsPagination: false,
    servers: [{ url: 'https://akab-xxx.luna.akamaiapis.net' }],
  };

  return { ...defaults, ...overrides };
}

export function createMockParameter(
  overrides: Partial<ParameterDefinition> = {}
): ParameterDefinition {
  const defaults: ParameterDefinition = {
    name: 'testParam',
    in: 'query',
    required: false,
    schema: { type: 'string' },
  };

  return { ...defaults, ...overrides };
}
