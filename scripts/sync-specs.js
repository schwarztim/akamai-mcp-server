#!/usr/bin/env node

/**
 * Sync Akamai OpenAPI Specifications
 *
 * This script clones the akamai-apis repository and copies all OpenAPI specs
 * to the local specs/ directory for vendoring.
 *
 * Security note: Uses execSync with hardcoded commands only (no user input).
 */

import { execSync } from 'child_process';
import { mkdirSync, cpSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SPECS_DIR = join(ROOT_DIR, 'specs');
const TMP_DIR = '/tmp/akamai-apis-sync';

console.log('🔄 Syncing Akamai OpenAPI specifications...\n');

// Clean up temporary directory
if (existsSync(TMP_DIR)) {
  console.log('🧹 Cleaning up temporary directory...');
  rmSync(TMP_DIR, { recursive: true, force: true });
}

// Clone the akamai-apis repository (hardcoded URL - no user input)
console.log('📥 Cloning akamai-apis repository...');
try {
  execSync(`git clone --depth 1 https://github.com/akamai/akamai-apis.git ${TMP_DIR}`, {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('❌ Failed to clone repository');
  process.exit(1);
}

// Create specs directory
if (!existsSync(SPECS_DIR)) {
  mkdirSync(SPECS_DIR, { recursive: true });
}

// Copy OpenAPI specs
console.log('\n📋 Copying OpenAPI specifications...');
const apisDir = join(TMP_DIR, 'apis');

if (!existsSync(apisDir)) {
  console.error('❌ APIs directory not found in repository');
  process.exit(1);
}

// Recursively find all openapi.json files
function findOpenApiSpecs(dir, baseDir = dir) {
  const specs = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      specs.push(...findOpenApiSpecs(fullPath, baseDir));
    } else if (entry.name === 'openapi.json') {
      // Found an OpenAPI spec
      const relativePath = fullPath.replace(baseDir + '/', '');
      specs.push({
        fullPath,
        relativePath,
        dir: dirname(fullPath),
        name: dirname(relativePath),
      });
    }
  }

  return specs;
}

const specs = findOpenApiSpecs(apisDir);
console.log(`Found ${specs.length} OpenAPI specifications\n`);

let copiedCount = 0;
let errorCount = 0;

for (const spec of specs) {
  const destPath = join(SPECS_DIR, spec.name);

  try {
    // Create destination directory
    if (!existsSync(destPath)) {
      mkdirSync(destPath, { recursive: true });
    }

    // Copy openapi.json
    cpSync(spec.fullPath, join(destPath, 'openapi.json'));

    // Also copy component subdirectories if they exist
    const componentDirs = ['errors', 'examples', 'headers', 'parameters', 'paths', 'schemas', 'responses'];
    for (const compDir of componentDirs) {
      const sourcePath = join(spec.dir, compDir);
      if (existsSync(sourcePath)) {
        cpSync(sourcePath, join(destPath, compDir), { recursive: true });
      }
    }

    copiedCount++;
    console.log(`  ✓ ${spec.name}`);
  } catch (error) {
    errorCount++;
    console.error(`  ✗ ${spec.name}: ${error.message}`);
  }
}

// Clean up temporary directory
console.log('\n🧹 Cleaning up...');
rmSync(TMP_DIR, { recursive: true, force: true });

// Summary
console.log('\n📊 Summary:');
console.log(`  ✓ Successfully copied: ${copiedCount} API specifications`);
if (errorCount > 0) {
  console.log(`  ✗ Errors: ${errorCount}`);
}
console.log(`  📁 Specs directory: ${SPECS_DIR}\n`);

if (copiedCount === 0) {
  console.error('❌ No specifications were copied');
  process.exit(1);
}

console.log('✅ Spec sync complete!\n');
console.log('Next steps:');
console.log('  1. Run: npm run generate');
console.log('  2. Run: npm run build');
console.log('  3. Run: npm test\n');
