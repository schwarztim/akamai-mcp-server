/**
 * Unit tests for validation utilities
 */
import { describe, it, expect } from 'vitest';
import {
  validateInput,
  fastPurgeSchemas,
  propertyManagerSchemas,
  edgeWorkersSchemas,
  dnsSchemas,
} from '../../src/utils/validation.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Validation', () => {
  describe('validateInput', () => {
    it('should validate correct input', () => {
      const result = validateInput(fastPurgeSchemas.purgeByUrl, {
        urls: ['https://example.com/page1', 'https://example.com/page2'],
      });

      expect(result.urls).toHaveLength(2);
      expect(result.network).toBe('production'); // default
      expect(result.action).toBe('remove'); // default
    });

    it('should throw ValidationError for invalid input', () => {
      expect(() =>
        validateInput(fastPurgeSchemas.purgeByUrl, {
          urls: [], // empty array not allowed
        })
      ).toThrow(ValidationError);
    });

    it('should include field-level errors', () => {
      try {
        validateInput(fastPurgeSchemas.purgeByUrl, {
          urls: ['not-a-url'], // invalid URL
        });
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.errors).toBeDefined();
        expect(validationError.errors).toHaveLength(1);
      }
    });
  });

  describe('Fast Purge Schemas', () => {
    describe('purgeByUrl', () => {
      it('should validate valid URLs', () => {
        const result = validateInput(fastPurgeSchemas.purgeByUrl, {
          urls: ['https://example.com/page1'],
          network: 'staging',
          action: 'invalidate',
        });

        expect(result.urls).toEqual(['https://example.com/page1']);
        expect(result.network).toBe('staging');
        expect(result.action).toBe('invalidate');
      });

      it('should reject invalid URLs', () => {
        expect(() =>
          validateInput(fastPurgeSchemas.purgeByUrl, {
            urls: ['not-a-url'],
          })
        ).toThrow(ValidationError);
      });

      it('should reject too many URLs', () => {
        const manyUrls = Array.from({ length: 51 }, (_, i) => `https://example.com/page${i}`);

        expect(() =>
          validateInput(fastPurgeSchemas.purgeByUrl, {
            urls: manyUrls,
          })
        ).toThrow(ValidationError);
      });

      it('should require at least one URL', () => {
        expect(() =>
          validateInput(fastPurgeSchemas.purgeByUrl, {
            urls: [],
          })
        ).toThrow(ValidationError);
      });
    });

    describe('purgeByCpCode', () => {
      it('should validate valid CP codes', () => {
        const result = validateInput(fastPurgeSchemas.purgeByCpCode, {
          cpCodes: [12345, 67890],
        });

        expect(result.cpCodes).toEqual([12345, 67890]);
      });

      it('should reject negative CP codes', () => {
        expect(() =>
          validateInput(fastPurgeSchemas.purgeByCpCode, {
            cpCodes: [-1],
          })
        ).toThrow(ValidationError);
      });

      it('should reject string CP codes', () => {
        expect(() =>
          validateInput(fastPurgeSchemas.purgeByCpCode, {
            cpCodes: ['12345'], // strings not allowed
          })
        ).toThrow(ValidationError);
      });
    });

    describe('getPurgeStatus', () => {
      it('should validate valid purge ID', () => {
        const result = validateInput(fastPurgeSchemas.getPurgeStatus, {
          purgeId: 'abc123-def456',
        });

        expect(result.purgeId).toBe('abc123-def456');
      });

      it('should reject empty purge ID', () => {
        expect(() =>
          validateInput(fastPurgeSchemas.getPurgeStatus, {
            purgeId: '',
          })
        ).toThrow(ValidationError);
      });
    });
  });

  describe('Property Manager Schemas', () => {
    describe('getProperty', () => {
      it('should validate valid property identifiers', () => {
        const result = validateInput(propertyManagerSchemas.getProperty, {
          propertyId: 'prp_123456',
          contractId: 'ctr_ABC-123',
          groupId: 'grp_12345',
        });

        expect(result.propertyId).toBe('prp_123456');
        expect(result.contractId).toBe('ctr_ABC-123');
        expect(result.groupId).toBe('grp_12345');
      });

      it('should reject invalid property ID format', () => {
        expect(() =>
          validateInput(propertyManagerSchemas.getProperty, {
            propertyId: 'invalid',
            contractId: 'ctr_ABC-123',
            groupId: 'grp_12345',
          })
        ).toThrow(ValidationError);
      });

      it('should reject invalid contract ID format', () => {
        expect(() =>
          validateInput(propertyManagerSchemas.getProperty, {
            propertyId: 'prp_123456',
            contractId: 'invalid',
            groupId: 'grp_12345',
          })
        ).toThrow(ValidationError);
      });
    });

    describe('activateProperty', () => {
      it('should validate activation with notify emails', () => {
        const result = validateInput(propertyManagerSchemas.activateProperty, {
          propertyId: 'prp_123456',
          version: 5,
          network: 'STAGING',
          note: 'Test activation',
          notifyEmails: ['user@example.com'],
          contractId: 'ctr_ABC-123',
          groupId: 'grp_12345',
        });

        expect(result.notifyEmails).toEqual(['user@example.com']);
      });

      it('should reject invalid email addresses', () => {
        expect(() =>
          validateInput(propertyManagerSchemas.activateProperty, {
            propertyId: 'prp_123456',
            version: 5,
            network: 'STAGING',
            note: 'Test',
            notifyEmails: ['invalid-email'],
            contractId: 'ctr_ABC-123',
            groupId: 'grp_12345',
          })
        ).toThrow(ValidationError);
      });

      it('should require activation note', () => {
        expect(() =>
          validateInput(propertyManagerSchemas.activateProperty, {
            propertyId: 'prp_123456',
            version: 5,
            network: 'STAGING',
            note: '',
            contractId: 'ctr_ABC-123',
            groupId: 'grp_12345',
          })
        ).toThrow(ValidationError);
      });
    });
  });

  describe('EdgeWorkers Schemas', () => {
    describe('activateEdgeWorker', () => {
      it('should validate valid EdgeWorker activation', () => {
        const result = validateInput(edgeWorkersSchemas.activateEdgeWorker, {
          edgeWorkerId: 12345,
          version: '1.0.0',
          network: 'PRODUCTION',
          note: 'Deploying new version',
        });

        expect(result.edgeWorkerId).toBe(12345);
        expect(result.version).toBe('1.0.0');
      });

      it('should reject negative EdgeWorker ID', () => {
        expect(() =>
          validateInput(edgeWorkersSchemas.activateEdgeWorker, {
            edgeWorkerId: -1,
            version: '1.0.0',
            network: 'PRODUCTION',
            note: 'Test',
          })
        ).toThrow(ValidationError);
      });

      it('should reject string EdgeWorker ID', () => {
        expect(() =>
          validateInput(edgeWorkersSchemas.activateEdgeWorker, {
            edgeWorkerId: '12345', // should be number
            version: '1.0.0',
            network: 'PRODUCTION',
            note: 'Test',
          })
        ).toThrow(ValidationError);
      });
    });
  });

  describe('DNS Schemas', () => {
    describe('createRecord', () => {
      it('should validate valid DNS record', () => {
        const result = validateInput(dnsSchemas.createRecord, {
          zone: 'example.com',
          name: 'www',
          type: 'A',
          ttl: 300,
          rdata: ['192.0.2.1'],
        });

        expect(result.zone).toBe('example.com');
        expect(result.name).toBe('www');
        expect(result.type).toBe('A');
        expect(result.ttl).toBe(300);
        expect(result.rdata).toEqual(['192.0.2.1']);
      });

      it('should use default TTL if not provided', () => {
        const result = validateInput(dnsSchemas.createRecord, {
          zone: 'example.com',
          name: 'www',
          type: 'A',
          rdata: ['192.0.2.1'],
        });

        expect(result.ttl).toBe(300); // default
      });

      it('should reject invalid TTL', () => {
        expect(() =>
          validateInput(dnsSchemas.createRecord, {
            zone: 'example.com',
            name: 'www',
            type: 'A',
            ttl: 30, // too low (min 60)
            rdata: ['192.0.2.1'],
          })
        ).toThrow(ValidationError);
      });

      it('should reject empty rdata', () => {
        expect(() =>
          validateInput(dnsSchemas.createRecord, {
            zone: 'example.com',
            name: 'www',
            type: 'A',
            rdata: [],
          })
        ).toThrow(ValidationError);
      });
    });
  });
});
