/**
 * Unit tests for Tool Generator
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolGenerator } from '../../src/generator/tool-generator.js';
import type { OperationDefinition } from '../../src/registry/types.js';

describe('Tool Generator', () => {
  let generator: ToolGenerator;

  beforeEach(() => {
    generator = new ToolGenerator();
  });

  describe('Initialization', () => {
    it('should create a new generator instance', () => {
      expect(generator).toBeInstanceOf(ToolGenerator);
    });
  });

  describe('Generate Tool', () => {
    it('should generate a tool from operation definition', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_listProperties',
        operationId: 'listProperties',
        method: 'GET',
        path: '/papi/v1/properties',
        summary: 'List all properties',
        description: 'Returns a list of properties in the specified group',
        product: 'papi',
        version: 'v1',
        tags: ['Property'],
        parameters: [
          {
            name: 'contractId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Contract identifier',
          },
          {
            name: 'groupId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Group identifier',
          },
        ],
        paginatable: true,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool).toHaveProperty('definition');
      expect(tool).toHaveProperty('handler');
      expect(tool.definition.name).toBe('akamai_papi_listProperties');
      expect(tool.definition.description).toContain('List all properties');
      expect(tool.definition.inputSchema).toBeDefined();
    });

    it('should include pagination options for paginatable operations', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_listProperties',
        operationId: 'listProperties',
        method: 'GET',
        path: '/papi/v1/properties',
        summary: 'List properties',
        product: 'papi',
        version: 'v1',
        parameters: [],
        paginatable: true,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('paginate');
      expect(tool.definition.inputSchema.properties).toHaveProperty('maxPages');
      expect(tool.definition.description).toContain('pagination');
    });

    it('should not include pagination options for non-paginatable operations', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_getProperty',
        operationId: 'getProperty',
        method: 'GET',
        path: '/papi/v1/properties/{propertyId}',
        summary: 'Get property details',
        product: 'papi',
        version: 'v1',
        parameters: [],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).not.toHaveProperty('paginate');
      expect(tool.definition.inputSchema.properties).not.toHaveProperty('maxPages');
    });

    it('should handle operations with path parameters', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_getProperty',
        operationId: 'getProperty',
        method: 'GET',
        path: '/papi/v1/properties/{propertyId}',
        summary: 'Get property',
        product: 'papi',
        version: 'v1',
        parameters: [
          {
            name: 'propertyId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Property ID',
          },
        ],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('propertyId');
      expect(tool.definition.inputSchema.required).toContain('propertyId');
    });

    it('should handle operations with request body', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_createProperty',
        operationId: 'createProperty',
        method: 'POST',
        path: '/papi/v1/properties',
        summary: 'Create property',
        product: 'papi',
        version: 'v1',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  propertyName: { type: 'string' },
                  productId: { type: 'string' },
                },
                required: ['propertyName', 'productId'],
              },
            },
          },
        },
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('body');
    });
  });

  describe('Generate All', () => {
    it('should generate tools for multiple operations', async () => {
      const operations: OperationDefinition[] = [
        {
          toolName: 'akamai_papi_listProperties',
          operationId: 'listProperties',
          method: 'GET',
          path: '/papi/v1/properties',
          summary: 'List properties',
          product: 'papi',
          version: 'v1',
          parameters: [],
          paginatable: true,
          servers: ['https://akab-xxx.luna.akamaiapis.net'],
        },
        {
          toolName: 'akamai_ccu_purgeByUrl',
          operationId: 'purgeByUrl',
          method: 'POST',
          path: '/ccu/v3/delete/url',
          summary: 'Purge by URL',
          product: 'ccu',
          version: 'v3',
          parameters: [],
          paginatable: false,
          servers: ['https://akab-xxx.luna.akamaiapis.net'],
        },
      ];

      const tools = await generator.generateAll(operations);

      expect(tools).toHaveLength(2);
      expect(tools[0].definition.name).toBe('akamai_papi_listProperties');
      expect(tools[1].definition.name).toBe('akamai_ccu_purgeByUrl');
    });

    it('should handle empty operations array', async () => {
      const tools = await generator.generateAll([]);
      expect(tools).toHaveLength(0);
    });
  });

  describe('Input Schema Generation', () => {
    it('should mark required parameters', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_test_operation',
        operationId: 'testOp',
        method: 'GET',
        path: '/test',
        summary: 'Test operation',
        product: 'test',
        version: 'v1',
        parameters: [
          {
            name: 'requiredParam',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'optionalParam',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
        ],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.required).toContain('requiredParam');
      expect(tool.definition.inputSchema.required).not.toContain('optionalParam');
    });

    it('should handle different parameter types', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_test_operation',
        operationId: 'testOp',
        method: 'GET',
        path: '/test/{id}',
        summary: 'Test operation',
        product: 'test',
        version: 'v1',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'filter',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
          {
            name: 'x-request-id',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('id');
      expect(tool.definition.inputSchema.properties).toHaveProperty('filter');
      expect(tool.definition.inputSchema.properties).toHaveProperty('x-request-id');
    });
  });

  describe('Tool Description Generation', () => {
    it('should include method and path in description', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_test_operation',
        operationId: 'testOp',
        method: 'POST',
        path: '/test/endpoint',
        summary: 'Test operation',
        product: 'test',
        version: 'v1',
        parameters: [],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.description).toContain('POST');
      expect(tool.definition.description).toContain('/test/endpoint');
    });

    it('should include product and version in description', async () => {
      const mockOperation: OperationDefinition = {
        toolName: 'akamai_papi_listProperties',
        operationId: 'listProperties',
        method: 'GET',
        path: '/papi/v1/properties',
        summary: 'List properties',
        product: 'papi',
        version: 'v1',
        parameters: [],
        paginatable: false,
        servers: ['https://akab-xxx.luna.akamaiapis.net'],
      };

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.description).toContain('papi');
      expect(tool.definition.description).toContain('v1');
    });
  });
});
