/**
 * Certificate Provisioning System (CPS) Tools
 *
 * High-level tools for managing SSL/TLS certificates via Akamai CPS.
 * Supports certificate enrollment, lifecycle management, and DNS challenge retrieval.
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
 * List Certificates Tool
 */
export function getListCertificatesTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_certificates',
    description: `List all SSL/TLS certificates in your Akamai CPS enrollment.

Shows:
- Certificate common names and SANs
- Enrollment status (pending, active, expiring)
- Expiration dates
- Validation method (DV, OV, EV)

Example: "List all my SSL certificates"`,
    inputSchema: {
      type: 'object',
      properties: {
        contractId: {
          type: 'string',
          description: 'Filter by contract ID (optional)',
        },
        status: {
          type: 'string',
          enum: ['active', 'pending', 'expiring', 'all'],
          description: 'Filter by status (default: all)',
          default: 'all',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const contractId = args.contractId as string | undefined;
    const statusFilter = (args.status as string) || 'all';

    logger.info('Listing certificates');

    try {
      // Get enrollments from CPS API
      const queryParams: Record<string, string | boolean> = {};
      if (contractId) queryParams.contractId = contractId;

      const enrollments = await executeOperation(
        'akamai_cps_listEnrollments',
        {},
        queryParams
      );

      const enrollmentList = enrollments?.enrollments || enrollments || [];

      // Process and filter enrollments
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const certificates = enrollmentList.map((enrollment: any) => {
        const expirationDate = enrollment.pendingChanges?.[0]?.certificate?.expiration
          || enrollment.certificate?.expiration;
        const expDate = expirationDate ? new Date(expirationDate) : null;

        let status = 'active';
        if (enrollment.pendingChanges?.length > 0) {
          status = 'pending';
        } else if (expDate && expDate < thirtyDaysFromNow) {
          status = 'expiring';
        }

        return {
          enrollmentId: enrollment.id,
          commonName: enrollment.csr?.cn || enrollment.cn,
          sans: enrollment.csr?.sans || enrollment.sans || [],
          validationType: enrollment.validationType || enrollment.certificateType,
          status,
          expirationDate: expirationDate || 'N/A',
          daysUntilExpiration: expDate
            ? Math.ceil((expDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : null,
          contractId: enrollment.contractId,
          certificateChainType: enrollment.certificateChainType,
          networkConfiguration: enrollment.networkConfiguration?.geography,
        };
      });

      // Apply status filter
      const filteredCerts = statusFilter === 'all'
        ? certificates
        : certificates.filter((c: any) => c.status === statusFilter);

      // Sort by expiration (soonest first)
      filteredCerts.sort((a: any, b: any) => {
        if (!a.daysUntilExpiration) return 1;
        if (!b.daysUntilExpiration) return -1;
        return a.daysUntilExpiration - b.daysUntilExpiration;
      });

      const summary = {
        totalCertificates: filteredCerts.length,
        statusBreakdown: {
          active: certificates.filter((c: any) => c.status === 'active').length,
          pending: certificates.filter((c: any) => c.status === 'pending').length,
          expiring: certificates.filter((c: any) => c.status === 'expiring').length,
        },
        certificates: filteredCerts,
        alerts: [
          ...certificates
            .filter((c: any) => c.status === 'expiring')
            .map((c: any) => `⚠️ ${c.commonName} expires in ${c.daysUntilExpiration} days`),
          ...certificates
            .filter((c: any) => c.status === 'pending')
            .map((c: any) => `🔄 ${c.commonName} has pending changes`),
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
      logger.error(`List certificates failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error listing certificates: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get Certificate Details Tool
 */
export function getCertificateDetailsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_certificate_details',
    description: `Get detailed information about a specific certificate enrollment.

Shows:
- Full certificate details (CN, SANs, issuer)
- Validation status and requirements
- Deployment status across networks
- Pending changes if any

Example: "Show details for certificate enrollment 12345"`,
    inputSchema: {
      type: 'object',
      properties: {
        enrollmentId: {
          type: 'number',
          description: 'The enrollment ID to retrieve',
        },
      },
      required: ['enrollmentId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const enrollmentId = args.enrollmentId as number;

    logger.info(`Getting certificate details for enrollment ${enrollmentId}`);

    try {
      // Get enrollment details
      const enrollment = await executeOperation(
        'akamai_cps_getEnrollment',
        { enrollmentId }
      );

      // Get deployment status
      let deploymentStatus: any = null;
      try {
        deploymentStatus = await executeOperation(
          'akamai_cps_getDeployments',
          { enrollmentId }
        );
      } catch (e) {
        logger.debug('Could not fetch deployment status');
      }

      // Get pending changes if any
      let pendingChanges: any = null;
      if (enrollment.pendingChanges?.length > 0) {
        try {
          pendingChanges = await executeOperation(
            'akamai_cps_getChangeStatus',
            { enrollmentId, changeId: enrollment.pendingChanges[0] }
          );
        } catch (e) {
          logger.debug('Could not fetch pending change details');
        }
      }

      const details = {
        enrollmentId: enrollment.id,
        commonName: enrollment.csr?.cn || enrollment.cn,
        sans: enrollment.csr?.sans || enrollment.sans || [],
        organization: {
          name: enrollment.org?.name,
          unit: enrollment.org?.unit,
          country: enrollment.org?.country,
        },
        validationType: enrollment.validationType,
        certificateType: enrollment.certificateType,
        certificateChainType: enrollment.certificateChainType,
        signatureAlgorithm: enrollment.signatureAlgorithm,
        networkConfiguration: {
          geography: enrollment.networkConfiguration?.geography,
          mustHaveCiphers: enrollment.networkConfiguration?.mustHaveCiphers,
          preferredCiphers: enrollment.networkConfiguration?.preferredCiphers,
          sniOnly: enrollment.networkConfiguration?.sniOnly,
        },
        adminContact: enrollment.adminContact,
        techContact: enrollment.techContact,
        certificate: enrollment.certificate ? {
          expiration: enrollment.certificate.expiration,
          issuer: enrollment.certificate.issuer,
          serialNumber: enrollment.certificate.serialNumber,
        } : null,
        deploymentStatus: deploymentStatus ? {
          production: deploymentStatus.production,
          staging: deploymentStatus.staging,
        } : 'Unable to retrieve',
        pendingChanges: pendingChanges ? {
          changeType: pendingChanges.changeType,
          status: pendingChanges.statusInfo?.status,
          description: pendingChanges.statusInfo?.description,
          validationRequired: pendingChanges.allowedInput?.type,
        } : enrollment.pendingChanges?.length > 0 ? 'Pending changes exist' : 'None',
        contractId: enrollment.contractId,
        createdAt: enrollment.createdAt,
        lastModified: enrollment.lastModified,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Get certificate details failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error getting certificate details: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get DNS Challenges Tool
 */
export function getDnsChallengesTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_get_dns_challenges',
    description: `Get DNS validation challenges for a pending DV certificate enrollment.

Returns the DNS records (CNAME or TXT) that must be created to validate domain ownership.
Essential for completing DV certificate issuance.

Example: "Get DNS challenges for enrollment 12345"`,
    inputSchema: {
      type: 'object',
      properties: {
        enrollmentId: {
          type: 'number',
          description: 'The enrollment ID with pending validation',
        },
      },
      required: ['enrollmentId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const enrollmentId = args.enrollmentId as number;

    logger.info(`Getting DNS challenges for enrollment ${enrollmentId}`);

    try {
      // Get the enrollment to find pending changes
      const enrollment = await executeOperation(
        'akamai_cps_getEnrollment',
        { enrollmentId }
      );

      if (!enrollment.pendingChanges || enrollment.pendingChanges.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                enrollmentId,
                status: 'No pending validation',
                message: 'This enrollment has no pending changes requiring DNS validation.',
              }, null, 2),
            },
          ],
        };
      }

      // Get the DV challenges
      let challenges: any = null;
      try {
        challenges = await executeOperation(
          'akamai_cps_getDvHistory',
          { enrollmentId }
        );
      } catch (e) {
        // Try alternative endpoint
        try {
          challenges = await executeOperation(
            'akamai_cps_getChangeStatus',
            { enrollmentId, changeId: enrollment.pendingChanges[0] }
          );
        } catch (e2) {
          logger.debug('Could not fetch DV challenges');
        }
      }

      // Extract DNS records to create
      const dnsRecords = challenges?.dv || challenges?.validations || [];
      const formattedChallenges = dnsRecords.map((dv: any) => ({
        domain: dv.domain || dv.cn,
        validationStatus: dv.status || dv.validationStatus,
        challengeType: dv.challengeType || 'dns-01',
        dnsRecord: {
          type: dv.challenges?.[0]?.type || 'CNAME',
          name: dv.challenges?.[0]?.fullPath || `_acme-challenge.${dv.domain}`,
          value: dv.challenges?.[0]?.responseBody || dv.challenges?.[0]?.token,
        },
        expires: dv.expires,
      }));

      const result = {
        enrollmentId,
        commonName: enrollment.csr?.cn || enrollment.cn,
        validationType: enrollment.validationType,
        challengeCount: formattedChallenges.length,
        dnsRecordsToCreate: formattedChallenges,
        instructions: [
          '1. Create the DNS records shown above in your DNS provider',
          '2. Wait for DNS propagation (typically 5-15 minutes)',
          '3. Use akamai_certificate_status to check validation progress',
          '4. Once validated, the certificate will be issued automatically',
        ],
        tips: [
          '💡 Use akamai_dns_add_record if your DNS is managed by Akamai',
          '💡 DNS records can be removed after certificate issuance',
          '💡 Challenges typically expire in 7 days',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Get DNS challenges failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error getting DNS challenges: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Certificate Status Tool
 */
export function getCertificateStatusTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_certificate_status',
    description: `Check the current status of a certificate enrollment.

Shows:
- Validation progress
- Issuance status
- Deployment to staging/production
- Any blocking issues

Example: "Check status of certificate enrollment 12345"`,
    inputSchema: {
      type: 'object',
      properties: {
        enrollmentId: {
          type: 'number',
          description: 'The enrollment ID to check',
        },
      },
      required: ['enrollmentId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const enrollmentId = args.enrollmentId as number;

    logger.info(`Checking certificate status for enrollment ${enrollmentId}`);

    try {
      // Get enrollment
      const enrollment = await executeOperation(
        'akamai_cps_getEnrollment',
        { enrollmentId }
      );

      // Get change status if pending
      let changeStatus: any = null;
      if (enrollment.pendingChanges?.length > 0) {
        try {
          changeStatus = await executeOperation(
            'akamai_cps_getChangeStatus',
            { enrollmentId, changeId: enrollment.pendingChanges[0] }
          );
        } catch (e) {
          logger.debug('Could not fetch change status');
        }
      }

      // Determine overall status
      let overallStatus = 'active';
      let statusEmoji = '✅';
      let nextAction = 'Certificate is active. No action required.';

      if (changeStatus) {
        const status = changeStatus.statusInfo?.status?.toLowerCase() || 'unknown';
        if (status.includes('waiting') || status.includes('pending')) {
          overallStatus = 'waiting-validation';
          statusEmoji = '⏳';
          nextAction = 'DNS validation pending. Create required DNS records.';
        } else if (status.includes('validat')) {
          overallStatus = 'validating';
          statusEmoji = '🔄';
          nextAction = 'Validation in progress. Wait for completion.';
        } else if (status.includes('deploy')) {
          overallStatus = 'deploying';
          statusEmoji = '🚀';
          nextAction = 'Certificate is being deployed to the network.';
        } else if (status.includes('error') || status.includes('fail')) {
          overallStatus = 'error';
          statusEmoji = '❌';
          nextAction = `Error: ${changeStatus.statusInfo?.description || 'Check enrollment for details'}`;
        }
      }

      // Check expiration
      const expDate = enrollment.certificate?.expiration
        ? new Date(enrollment.certificate.expiration)
        : null;
      const now = new Date();
      const daysUntilExpiration = expDate
        ? Math.ceil((expDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      if (daysUntilExpiration !== null && daysUntilExpiration < 30) {
        overallStatus = 'expiring-soon';
        statusEmoji = '⚠️';
        nextAction = `Certificate expires in ${daysUntilExpiration} days. Renew soon.`;
      }

      const result = {
        enrollmentId,
        commonName: enrollment.csr?.cn || enrollment.cn,
        overallStatus: `${statusEmoji} ${overallStatus}`,
        nextAction,
        details: {
          validationType: enrollment.validationType,
          hasPendingChanges: enrollment.pendingChanges?.length > 0,
          changeStatus: changeStatus?.statusInfo || null,
          certificate: enrollment.certificate ? {
            expiration: enrollment.certificate.expiration,
            daysUntilExpiration,
            issuer: enrollment.certificate.issuer,
          } : null,
        },
        timeline: [
          enrollment.createdAt ? `📅 Created: ${enrollment.createdAt}` : null,
          enrollment.lastModified ? `📝 Last modified: ${enrollment.lastModified}` : null,
          expDate ? `⏰ Expires: ${expDate.toISOString().split('T')[0]}` : null,
        ].filter(Boolean),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Certificate status check failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error checking certificate status: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Enroll Certificate Tool
 */
export function getEnrollCertificateTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_enroll_certificate',
    description: `Create a new DV (Domain Validation) certificate enrollment.

Supports:
- Single domain certificates
- Multi-domain (SAN) certificates
- Automatic DNS challenge generation

Example: "Enroll a new certificate for example.com with SANs www.example.com and api.example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        commonName: {
          type: 'string',
          description: 'Primary domain name (CN) for the certificate',
        },
        sans: {
          type: 'array',
          items: { type: 'string' },
          description: 'Subject Alternative Names (additional domains)',
          default: [],
        },
        contractId: {
          type: 'string',
          description: 'Contract ID for the enrollment',
        },
        validationType: {
          type: 'string',
          enum: ['dv', 'ov', 'ev', 'third-party'],
          description: 'Validation type (default: dv)',
          default: 'dv',
        },
        networkType: {
          type: 'string',
          enum: ['standard-tls', 'enhanced-tls'],
          description: 'Network deployment type (default: enhanced-tls)',
          default: 'enhanced-tls',
        },
        sniOnly: {
          type: 'boolean',
          description: 'SNI-only deployment (default: true)',
          default: true,
        },
      },
      required: ['commonName', 'contractId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const commonName = args.commonName as string;
    const sans = (args.sans as string[]) || [];
    const contractId = args.contractId as string;
    const validationType = (args.validationType as string) || 'dv';
    const networkType = (args.networkType as string) || 'enhanced-tls';
    const sniOnly = args.sniOnly !== false;

    logger.info(`Creating certificate enrollment for ${commonName}`);

    try {
      // Build enrollment request
      const enrollmentRequest = {
        certificateType: validationType,
        validationType: validationType.toUpperCase(),
        ra: 'lets-encrypt', // Default to Let's Encrypt for DV
        networkConfiguration: {
          geography: 'core',
          secureNetwork: networkType,
          sniOnly,
          mustHaveCiphers: 'ak-akamai-2020q1',
          preferredCiphers: 'ak-akamai-2020q1',
        },
        csr: {
          cn: commonName,
          sans: sans.length > 0 ? sans : undefined,
          c: 'US',
          st: 'Massachusetts',
          l: 'Cambridge',
          o: 'Akamai Technologies',
          ou: 'Akamai',
        },
        org: {
          name: 'Akamai Technologies',
          addressLineOne: '145 Broadway',
          city: 'Cambridge',
          region: 'MA',
          postalCode: '02142',
          country: 'US',
          phone: '+1-617-444-3000',
        },
        adminContact: {
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@example.com',
          phone: '+1-617-444-3000',
        },
        techContact: {
          firstName: 'Tech',
          lastName: 'User',
          email: 'tech@example.com',
          phone: '+1-617-444-3000',
        },
        signatureAlgorithm: 'SHA-256',
        certificateChainType: 'default',
      };

      // Create enrollment
      const result = await executeOperation(
        'akamai_cps_createEnrollment',
        {},
        { contractId },
        enrollmentRequest
      );

      const enrollmentId = result?.enrollment || result?.id || result?.enrollmentId;

      const response = {
        success: true,
        enrollmentId,
        commonName,
        sans,
        validationType,
        networkType,
        message: 'Certificate enrollment created successfully',
        nextSteps: [
          '1. Run akamai_get_dns_challenges to get DNS validation records',
          '2. Create the DNS records in your DNS provider',
          '3. Run akamai_certificate_status to monitor validation progress',
          '4. Certificate will be issued automatically once validation completes',
        ],
        estimatedTime: validationType === 'dv'
          ? '5-30 minutes (after DNS records are created)'
          : '1-5 business days (manual validation required)',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Certificate enrollment failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error creating certificate enrollment: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get all certificate tools
 */
export function getCertificateTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getListCertificatesTool(),
    getCertificateDetailsTool(),
    getDnsChallengesTool(),
    getCertificateStatusTool(),
    getEnrollCertificateTool(),
  ];
}
