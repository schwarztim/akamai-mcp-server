/**
 * Unit tests for Tool Generator
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolGenerator } from '../../src/generator/tool-generator.js';
import { createMockOperation, createMockParameter } from '../helpers/mock-operations.js';

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
      const mockOperation = createMockOperation({
        toolName: 'akamai_papi_listProperties',
        operationId: 'listProperties',
        method: 'GET',
        path: '/papi/v1/properties',
        summary: 'List all properties',
        product: 'papi',
        version: 'v1',
        queryParameters: [
          createMockParameter({
            name: 'contractId',
            in: 'query',
            required: true,
            description: 'Contract identifier',
          }),
          createMockParameter({
            name: 'groupId',
            in: 'query',
            required: true,
            description: 'Group identifier',
          }),
        ],
        supportsPagination: true,
      });

      const tool = await generator.generate(mockOperation);

      expect(tool).toHaveProperty('definition');
      expect(tool).toHaveProperty('handler');
      expect(tool.definition.name).toBe('akamai_papi_listProperties');
      // Description is intentionally empty to minimize context bloat with 1,444 tools
      expect(tool.definition.description).toBe('');
      expect(tool.definition.inputSchema).toBeDefined();
    });

    it('should include pagination options for paginatable operations', async () => {
      const mockOperation = createMockOperation({
        supportsPagination: true,
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('paginate');
      expect(tool.definition.inputSchema.properties).toHaveProperty('maxPages');
      // Description is intentionally empty to minimize context bloat with 1,444 tools
      expect(tool.definition.description).toBe('');
    });

    it('should not include pagination options for non-paginatable operations', async () => {
      const mockOperation = createMockOperation({
        supportsPagination: false,
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).not.toHaveProperty('paginate');
      expect(tool.definition.inputSchema.properties).not.toHaveProperty('maxPages');
    });

    it('should handle operations with path parameters', async () => {
      const mockOperation = createMockOperation({
        path: '/papi/v1/properties/{propertyId}',
        pathParameters: [
          createMockParameter({
            name: 'propertyId',
            in: 'path',
            required: true,
            description: 'Property ID',
          }),
        ],
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('propertyId');
      expect(tool.definition.inputSchema.required).toContain('propertyId');
    });

    it('should handle operations with request body', async () => {
      const mockOperation = createMockOperation({
        method: 'POST',
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
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('body');
    });
  });

  describe('Generate All', () => {
    it('should generate tools for multiple operations', async () => {
      const operations = [
        createMockOperation({
          toolName: 'akamai_papi_listProperties',
          operationId: 'listProperties',
          product: 'papi',
          supportsPagination: true,
        }),
        createMockOperation({
          toolName: 'akamai_ccu_purgeByUrl',
          operationId: 'purgeByUrl',
          method: 'POST',
          product: 'ccu',
          supportsPagination: false,
        }),
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
      const mockOperation = createMockOperation({
        queryParameters: [
          createMockParameter({
            name: 'requiredParam',
            required: true,
          }),
          createMockParameter({
            name: 'optionalParam',
            required: false,
          }),
        ],
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.required).toContain('requiredParam');
      expect(tool.definition.inputSchema.required).not.toContain('optionalParam');
    });

    it('should handle different parameter types', async () => {
      const mockOperation = createMockOperation({
        path: '/test/{id}',
        pathParameters: [
          createMockParameter({
            name: 'id',
            in: 'path',
            required: true,
          }),
        ],
        queryParameters: [
          createMockParameter({
            name: 'filter',
            in: 'query',
          }),
        ],
        headerParameters: [
          createMockParameter({
            name: 'x-request-id',
            in: 'header',
          }),
        ],
      });

      const tool = await generator.generate(mockOperation);

      expect(tool.definition.inputSchema.properties).toHaveProperty('id');
      expect(tool.definition.inputSchema.properties).toHaveProperty('filter');
      expect(tool.definition.inputSchema.properties).toHaveProperty('x-request-id');
    });
  });

  describe('Tool Description Generation', () => {
    it('should return empty description to minimize context bloat', async () => {
      const mockOperation = createMockOperation({
        method: 'POST',
        path: '/test/endpoint',
      });

      const tool = await generator.generate(mockOperation);

      // Description is intentionally empty to minimize context bloat with 1,444 tools
      // Tool names are descriptive enough (akamai_product_operation format)
      expect(tool.definition.description).toBe('');
    });

    it('should consistently return empty descriptions for all operations', async () => {
      const mockOperation = createMockOperation({
        product: 'papi',
        version: 'v1',
        summary: 'Some detailed summary',
      });

      const tool = await generator.generate(mockOperation);

      // Description is intentionally empty to minimize context bloat with 1,444 tools
      expect(tool.definition.description).toBe('');
    });
  });
});
