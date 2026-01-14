/**
 * Validation utilities using Zod
 */
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';

/**
 * Validate input against a Zod schema
 * Throws ValidationError with detailed field-level errors
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      throw new ValidationError(
        `Input validation failed: ${fieldErrors.map((e) => `${e.field}: ${e.message}`).join(', ')}`,
        fieldErrors
      );
    }
    throw error;
  }
}

/**
 * Common schema validators
 */
export const commonSchemas = {
  /**
   * Network environment (staging or production)
   */
  network: z.enum(['staging', 'production']).default('production'),

  /**
   * Purge action (remove or invalidate)
   */
  purgeAction: z.enum(['remove', 'invalidate']).default('remove'),

  /**
   * Akamai property ID
   */
  propertyId: z.string().regex(/^prp_\d+$/, 'Property ID must be in format prp_123456'),

  /**
   * Contract ID
   */
  contractId: z.string().regex(/^ctr_[A-Z0-9-]+$/, 'Contract ID must be in format ctr_XXX'),

  /**
   * Group ID
   */
  groupId: z.string().regex(/^grp_\d+$/, 'Group ID must be in format grp_12345'),

  /**
   * EdgeWorker ID
   */
  edgeWorkerId: z.number().int().positive('EdgeWorker ID must be a positive integer'),

  /**
   * Property version
   */
  propertyVersion: z.number().int().positive('Version must be a positive integer'),

  /**
   * Email address
   */
  email: z.string().email('Invalid email address'),

  /**
   * URL
   */
  url: z.string().url('Invalid URL format'),

  /**
   * DNS zone name
   */
  dnsZone: z.string().regex(/^[a-zA-Z0-9.-]+$/, 'Invalid DNS zone name'),

  /**
   * DNS record type
   */
  dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA', 'PTR']),

  /**
   * TTL (Time To Live) in seconds
   */
  ttl: z.number().int().min(60).max(86400, 'TTL must be between 60 and 86400 seconds'),

  /**
   * Array length constraints
   */
  maxArray: (maxLength: number) =>
    z.array(z.unknown()).max(maxLength, `Maximum ${maxLength} items allowed`),
};

/**
 * Fast Purge validation schemas
 */
export const fastPurgeSchemas = {
  purgeByUrl: z.object({
    urls: z
      .array(commonSchemas.url)
      .min(1, 'At least one URL is required')
      .max(50, 'Maximum 50 URLs per request'),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  purgeByCacheTag: z.object({
    tags: z
      .array(z.string().min(1))
      .min(1, 'At least one cache tag is required')
      .max(50, 'Maximum 50 cache tags per request'),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  purgeByCpCode: z.object({
    cpCodes: z
      .array(z.number().int().positive())
      .min(1, 'At least one CP code is required')
      .max(50, 'Maximum 50 CP codes per request'),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  getPurgeStatus: z.object({
    purgeId: z.string().min(1, 'Purge ID is required'),
  }),
};

/**
 * Property Manager validation schemas
 */
export const propertyManagerSchemas = {
  listProperties: z.object({
    contractId: commonSchemas.contractId.optional(),
    groupId: commonSchemas.groupId.optional(),
  }),

  getProperty: z.object({
    propertyId: commonSchemas.propertyId,
    contractId: commonSchemas.contractId,
    groupId: commonSchemas.groupId,
  }),

  getPropertyRules: z.object({
    propertyId: commonSchemas.propertyId,
    version: commonSchemas.propertyVersion,
    contractId: commonSchemas.contractId,
    groupId: commonSchemas.groupId,
  }),

  listPropertyHostnames: z.object({
    propertyId: commonSchemas.propertyId,
    version: commonSchemas.propertyVersion,
    contractId: commonSchemas.contractId,
    groupId: commonSchemas.groupId,
  }),

  activateProperty: z.object({
    propertyId: commonSchemas.propertyId,
    version: commonSchemas.propertyVersion,
    network: z.enum(['STAGING', 'PRODUCTION']),
    note: z.string().min(1, 'Activation note is required'),
    notifyEmails: z.array(commonSchemas.email).optional(),
    contractId: commonSchemas.contractId,
    groupId: commonSchemas.groupId,
  }),
};

/**
 * EdgeWorkers validation schemas
 */
export const edgeWorkersSchemas = {
  listEdgeWorkers: z.object({
    groupId: commonSchemas.groupId.optional(),
  }),

  getEdgeWorker: z.object({
    edgeWorkerId: commonSchemas.edgeWorkerId,
  }),

  listEdgeWorkerVersions: z.object({
    edgeWorkerId: commonSchemas.edgeWorkerId,
  }),

  getEdgeWorkerActivations: z.object({
    edgeWorkerId: commonSchemas.edgeWorkerId,
    version: z.string().optional(),
  }),

  activateEdgeWorker: z.object({
    edgeWorkerId: commonSchemas.edgeWorkerId,
    version: z.string().min(1, 'Version is required'),
    network: z.enum(['STAGING', 'PRODUCTION']),
    note: z.string().min(1, 'Activation note is required'),
  }),
};

/**
 * DNS validation schemas
 */
export const dnsSchemas = {
  listZones: z.object({
    contractId: commonSchemas.contractId.optional(),
  }),

  getZone: z.object({
    zone: commonSchemas.dnsZone,
  }),

  listRecords: z.object({
    zone: commonSchemas.dnsZone,
  }),

  getRecord: z.object({
    zone: commonSchemas.dnsZone,
    name: z.string().min(1, 'Record name is required'),
    type: commonSchemas.dnsRecordType,
  }),

  createRecord: z.object({
    zone: commonSchemas.dnsZone,
    name: z.string().min(1, 'Record name is required'),
    type: commonSchemas.dnsRecordType,
    ttl: commonSchemas.ttl.default(300),
    rdata: z.array(z.string()).min(1, 'At least one rdata value is required'),
  }),

  updateRecord: z.object({
    zone: commonSchemas.dnsZone,
    name: z.string().min(1, 'Record name is required'),
    type: commonSchemas.dnsRecordType,
    ttl: commonSchemas.ttl,
    rdata: z.array(z.string()).min(1, 'At least one rdata value is required'),
  }),

  deleteRecord: z.object({
    zone: commonSchemas.dnsZone,
    name: z.string().min(1, 'Record name is required'),
    type: commonSchemas.dnsRecordType,
  }),
};
