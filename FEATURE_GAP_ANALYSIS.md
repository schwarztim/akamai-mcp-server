# Akamai MCP vs CLI Feature Gap Analysis

## Executive Summary

| Metric | Value |
|--------|-------|
| **MCP API Coverage** | 56 product APIs, 1,444 operations |
| **CLI Plugins** | 26 plugins |
| **Raw API Coverage** | 95%+ (all published APIs covered) |
| **Value-Add Features** | ~40% coverage (mostly aggregation tools) |

## API Coverage Status

### APIs We Have (56 products, 1,444 operations)

| CLI Plugin | MCP API Spec | Status |
|------------|--------------|--------|
| cli-property-manager | `papi` | ✅ Full API coverage |
| cli-dns | `config-dns` | ✅ Full API coverage |
| cli-purge | `ccu` | ✅ Full API coverage |
| cli-appsec | `appsec` | ✅ Full API coverage (213 operations) |
| cli-cps | `cps` | ✅ Full API coverage |
| cli-edgeworkers | `edgeworkers`, `edgekv` | ✅ Full API coverage |
| cli-cloudlets | `cloudlets` | ✅ Full API coverage |
| cli-gtm | `config-gtm`, `gtm-api`, `gtm-load-data` | ✅ Full API coverage |
| cli-image-manager | `imaging` | ✅ Full API coverage |
| cli-netstorage | `storage`, `netstorage-usage-api` | ✅ Full API coverage |
| cli-sandbox | `sandbox-api` | ✅ Full API coverage |
| cli-test-center | `test-management` | ✅ Full API coverage |
| cli-diagnostics | `edge-diagnostics` | ✅ Full API coverage |
| cli-etp | `etp-config`, `etp-report` | ✅ Full API coverage |
| cli-firewall | `firewall-rules-manager`, `siteshield` | ✅ Full API coverage |
| cli-api-gateway | `api-definitions` | ✅ Full API coverage |
| cli-mfa | `amfa` | ✅ Full API coverage |

### Missing APIs (Not in akamai-apis repo)

| CLI Plugin | API | Status | Notes |
|------------|-----|--------|-------|
| cli-mpulse | mPulse API | ❌ **NOT PUBLISHED** | Real User Monitoring data - API exists but not in public specs |
| cli-eaa | EAA API | ❌ **NOT PUBLISHED** | Enterprise Application Access - unofficial/unsupported |
| cli-visitor-prioritization | VP Cloudlet API | ⚠️ Partial | May be in cloudlets spec |

## Feature Gap Analysis

### 1. Value-Add Features Missing from MCP

These CLI features go **beyond raw API wrappers** and provide automation/workflow capabilities:

#### Critical Priority (High Impact)

| Feature | CLI Plugin | MCP Status | Impact |
|---------|-----------|------------|--------|
| **Terraform Export** | cli-terraform | ❌ Missing | Generate Terraform HCL from existing configs |
| **Multi-Environment Deployment** | cli-property-manager | ❌ Missing | Deploy properties across up to 30 environments |
| **Bulk Onboarding** | cli-onboard | ❌ Missing | CSV-based bulk property/WAF creation |
| **Pipeline Automation** | cli-property-manager | ❌ Missing | Variable templating, CI/CD integration |

#### Medium Priority

| Feature | CLI Plugin | MCP Status | Impact |
|---------|-----------|------------|--------|
| **Config-as-Code (Jsonnet)** | cli-jsonnet | ❌ Missing | Jsonnet syntax for configs |
| **Property Cloning** | cli-property-manager | ⚠️ Partial | Have API, need workflow tool |
| **Sandbox Creation** | cli-sandbox | ⚠️ Partial | Have API, need streamlined tool |
| **Test Suite Management** | cli-test-center | ⚠️ Partial | Have API, need workflow tool |
| **Certificate Audit** | cli-cps | ⚠️ Partial | Have API, need aggregation tool |

#### Lower Priority

| Feature | CLI Plugin | MCP Status | Impact |
|---------|-----------|------------|--------|
| **GTM Dry-Run Preview** | cli-gtm | ❌ Missing | Preview changes before apply |
| **Bulk Zone Operations** | cli-dns | ⚠️ Partial | Have API, need batch tool |
| **mPulse Integration** | cli-mpulse | ❌ Missing (No API) | Monitoring data export |

### 2. High-Level Tools Comparison

#### What MCP Already Has

| Tool | Description | Status |
|------|-------------|--------|
| `akamai_account_overview` | Account summary with parallel API calls | ✅ Done |
| `akamai_list_all_hostnames` | All hostnames across all properties | ✅ Done |
| `akamai_list_all_properties` | All properties with filtering | ✅ Done |
| `akamai_diagnose_url` | URL diagnostics | ✅ Done |
| `akamai_connectivity_test` | Origin connectivity testing | ✅ Done |
| `akamai_dns_overview` | DNS zones summary | ✅ Done |
| `akamai_dns_records` | DNS record management | ✅ Done |
| `akamai_purge_cache` | Fast purge operations | ✅ Done |

#### What MCP Needs

| Tool | Description | Priority |
|------|-------------|----------|
| `akamai_terraform_export` | Export configs to Terraform HCL | 🔴 Critical |
| `akamai_bulk_activate` | Activate multiple properties at once | 🔴 Critical |
| `akamai_environment_deploy` | Deploy property across environments | 🔴 Critical |
| `akamai_security_overview` | Security config summary across account | 🟡 High |
| `akamai_certificate_audit` | Certificate status and expiry report | 🟡 High |
| `akamai_edgeworker_deploy` | Streamlined EW deployment workflow | 🟡 High |
| `akamai_gtm_overview` | GTM datacenter/property summary | 🟡 High |
| `akamai_sandbox_create` | Create sandbox with property clone | 🟠 Medium |
| `akamai_bulk_onboard` | Onboard multiple hostnames/properties | 🟠 Medium |
| `akamai_test_suite_run` | Run test suites and report results | 🟠 Medium |

### 3. Unpublished/Internal APIs

Based on research, these APIs exist but are not in the public akamai-apis repo:

| API | Used By | Status | Notes |
|-----|---------|--------|-------|
| **mPulse API** | cli-mpulse | Not in public specs | Real User Monitoring |
| **EAA Internal API** | cli-eaa | Unofficial/unsupported | Enterprise App Access |
| **Utility Internal APIs** | cli-utility | Internal only | Some Akamai employee tools |

## Implementation Plan

### Phase 1: Critical Workflow Tools (Week 1-2)

1. **Terraform Export Tool** (`akamai_terraform_export`)
   - Export property configs to Terraform HCL
   - Support: properties, DNS zones, GTM, certificates
   - Use Akamai Terraform provider schemas

2. **Bulk Activation Tool** (`akamai_bulk_activate`)
   - Activate multiple properties at once
   - Support staging and production networks
   - Parallel activation with status tracking

3. **Environment Deployment Tool** (`akamai_environment_deploy`)
   - Variable templating for environment configs
   - Deploy property version to target environment
   - Support: staging → production promotion

### Phase 2: Security & Visibility Tools (Week 2-3)

4. **Security Overview Tool** (`akamai_security_overview`)
   - Aggregate security configs across account
   - WAF policies, rate limits, bot detection
   - Network lists and IP blocking summary

5. **Certificate Audit Tool** (`akamai_certificate_audit`)
   - List all certificates with expiry dates
   - Alert on upcoming expirations
   - Show certificate-to-property mappings

6. **GTM Overview Tool** (`akamai_gtm_overview`)
   - All GTM domains, datacenters, properties
   - Current traffic distribution
   - Liveness test status

### Phase 3: Workflow Automation (Week 3-4)

7. **EdgeWorker Deploy Tool** (`akamai_edgeworker_deploy`)
   - Upload bundle, create version, activate
   - Single command deployment
   - Rollback support

8. **Sandbox Create Tool** (`akamai_sandbox_create`)
   - Clone property to sandbox
   - Automatic JWT generation
   - Development environment setup

9. **Bulk Onboard Tool** (`akamai_bulk_onboard`)
   - Accept list of hostnames
   - Create properties and edge hostnames
   - Optional: attach to WAF policy

### Phase 4: Monitoring & Reporting (Week 4+)

10. **Test Suite Runner** (`akamai_test_suite_run`)
    - Execute test suites from Test Center
    - Report results with pass/fail status
    - Integration testing for deployments

11. **Usage Report Tool** (`akamai_usage_report`)
    - Traffic statistics across properties
    - Cache hit rates
    - Error rates and trends

## Technical Implementation Notes

### Terraform Export Approach

```typescript
// Pseudo-code for terraform export
async function exportToTerraform(resourceType: 'property' | 'dns' | 'gtm', resourceId: string) {
  // 1. Fetch resource configuration from API
  const config = await fetchResourceConfig(resourceType, resourceId);

  // 2. Map to Terraform schema
  const tfSchema = mapToTerraformSchema(config, resourceType);

  // 3. Generate HCL
  return generateHCL(tfSchema);
}
```

### Bulk Activation Pattern

```typescript
// Parallel activation with status tracking
async function bulkActivate(properties: string[], network: 'STAGING' | 'PRODUCTION') {
  const results = await Promise.allSettled(
    properties.map(async (propId) => {
      const activation = await activateProperty(propId, network);
      return pollActivationStatus(activation.activationId);
    })
  );
  return results;
}
```

### Variable Templating for Environments

```typescript
// Environment-specific variable substitution
interface EnvironmentConfig {
  name: string;
  variables: Record<string, string>;
  origins: string[];
  edgeHostnames: string[];
}

function applyEnvironmentVariables(template: PropertyRule, env: EnvironmentConfig): PropertyRule {
  // Replace ${VAR_NAME} with environment-specific values
  return JSON.parse(
    JSON.stringify(template).replace(/\$\{(\w+)\}/g, (_, varName) => env.variables[varName] || '')
  );
}
```

## Recommendations

### Immediate Actions

1. **Create `akamai_terraform_export`** - Most requested feature for IaC adoption
2. **Create `akamai_bulk_activate`** - Essential for deployment automation
3. **Create `akamai_security_overview`** - Critical visibility tool

### Long-term Strategy

1. **Request mPulse API publication** - File feature request with Akamai
2. **Build CI/CD integration guide** - Document MCP in pipelines
3. **Create MCP CLI wrapper** - `akamai-mcp` command for terminal users

## Appendix: Full API Coverage Matrix

<details>
<summary>Click to expand full coverage matrix</summary>

| Product | Operations | MCP Spec | CLI Plugin |
|---------|------------|----------|------------|
| adaptive-acceleration | ~10 | ✅ | - |
| alerts | ~15 | ✅ | - |
| amfa | ~25 | ✅ | cli-mfa |
| api-definitions | ~50 | ✅ | cli-api-gateway |
| apikey-manager-api | ~20 | ✅ | - |
| appsec | 213 | ✅ | cli-appsec |
| cam | ~30 | ✅ | - |
| case-management | ~20 | ✅ | - |
| ccu | 48 | ✅ | cli-purge |
| chinacdn | ~15 | ✅ | - |
| client-access-control | ~10 | ✅ | - |
| cloud-wrapper | ~40 | ✅ | - |
| cloudlets | ~80 | ✅ | cli-cloudlets |
| config-dns | ~60 | ✅ | cli-dns |
| config-gtm | ~50 | ✅ | cli-gtm |
| config-media-live | ~20 | ✅ | - |
| contract-api | ~25 | ✅ | - |
| cprg | ~15 | ✅ | - |
| cps | ~70 | ✅ | cli-cps |
| crux | 172 | ✅ | - |
| datastore | ~20 | ✅ | - |
| datastream-config-api | ~30 | ✅ | - |
| dcp-api | ~15 | ✅ | - |
| eccu-api | ~10 | ✅ | - |
| edge-data-stream | ~25 | ✅ | - |
| edge-diagnostics | ~40 | ✅ | cli-diagnostics |
| edgekv | ~30 | ✅ | cli-edgeworkers |
| edgeworkers | 289 | ✅ | cli-edgeworkers |
| etp-config | ~40 | ✅ | cli-etp |
| etp-report | ~30 | ✅ | cli-etp |
| event-viewer | ~15 | ✅ | - |
| events | ~25 | ✅ | - |
| firewall-rules-manager | ~35 | ✅ | cli-firewall |
| gtm-api | ~45 | ✅ | cli-gtm |
| gtm-load-data | ~10 | ✅ | cli-gtm |
| identity-management | 185 | ✅ | - |
| imaging | ~50 | ✅ | cli-image-manager |
| invoicing | ~20 | ✅ | - |
| ip-protect | ~15 | ✅ | - |
| jwt-api | ~10 | ✅ | - |
| live-archive | ~15 | ✅ | - |
| media-reports | ~30 | ✅ | - |
| netstorage-usage-api | ~15 | ✅ | cli-netstorage |
| network-lists | ~30 | ✅ | cli-appsec |
| ota | ~10 | ✅ | - |
| papi | ~100 | ✅ | cli-property-manager |
| prolexic-analytics | ~20 | ✅ | - |
| reporting-api | ~40 | ✅ | - |
| sandbox-api | ~25 | ✅ | cli-sandbox |
| script-management | ~20 | ✅ | - |
| siem | ~15 | ✅ | - |
| siteshield | ~15 | ✅ | cli-firewall |
| sla-api | ~10 | ✅ | - |
| storage | ~30 | ✅ | cli-netstorage |
| taas | ~20 | ✅ | - |
| test-management | ~100 | ✅ | cli-test-center |

</details>
