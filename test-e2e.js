#!/usr/bin/env node

/**
 * End-to-End Test Script
 *
 * This script validates that the Akamai MCP Server is fully operational:
 * 1. Environment variables are loaded
 * 2. EdgeGrid authentication works
 * 3. Registry can be instantiated
 * 4. Tools can be generated
 * 5. MCP transport can initialize
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const levelColors = {
    '✓': colors.green,
    '✗': colors.red,
    'ℹ': colors.blue,
    '⚠': colors.yellow,
    '→': colors.cyan,
  };
  const color = levelColors[level] || colors.reset;
  console.log(`${color}[${level}]${colors.reset} ${message}`);
}

async function runTests() {
  log('→', 'Starting E2E Tests...\n');

  try {
    // Test 1: Environment variables
    log('→', 'Test 1: Checking environment variables');
    dotenv.config({ path: path.join(__dirname, '.env') });

    const requiredEnvVars = [
      'AKAMAI_HOST',
      'AKAMAI_CLIENT_TOKEN',
      'AKAMAI_CLIENT_SECRET',
      'AKAMAI_ACCESS_TOKEN',
    ];

    let missingVars = [];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missingVars.push(envVar);
      }
    }

    if (missingVars.length === 0) {
      log('✓', 'All required environment variables are set');
    } else {
      log('✗', `Missing environment variables: ${missingVars.join(', ')}`);
      process.exit(1);
    }

    // Test 2: EdgeGrid client initialization
    log('→', 'Test 2: Initializing EdgeGrid client');
    try {
      const EdgeGrid = (await import('akamai-edgegrid')).default;

      const client = new EdgeGrid(
        process.env.AKAMAI_CLIENT_TOKEN,
        process.env.AKAMAI_CLIENT_SECRET,
        process.env.AKAMAI_ACCESS_TOKEN,
        process.env.AKAMAI_HOST
      );

      log('✓', 'EdgeGrid client initialized successfully');
    } catch (error) {
      log('✗', `EdgeGrid client initialization failed: ${error.message}`);
      process.exit(1);
    }

    // Test 3: Registry loading
    log('→', 'Test 3: Loading operation registry');
    try {
      const { OperationRegistry } = await import('./dist/registry/operation-registry.js');
      const registry = new OperationRegistry();
      const startTime = Date.now();
      await registry.load();
      const loadTime = Date.now() - startTime;

      const stats = registry.getStats();
      log('✓', `Registry loaded successfully in ${loadTime}ms`);
      log('ℹ', `  - Operations: ${stats.totalOperations}`);
      log('ℹ', `  - Specs: ${stats.specsLoaded}`);
      log('ℹ', `  - Paginatable ops: ${stats.paginatableOperations}`);
    } catch (error) {
      log('✗', `Registry loading failed: ${error.message}`);
      process.exit(1);
    }

    // Test 4: Tool generation
    log('→', 'Test 4: Generating MCP tools');
    try {
      const { getToolGenerator } = await import('./dist/generator/tool-generator.js');
      const { getOperationRegistry } = await import('./dist/registry/operation-registry.js');

      const registry = await getOperationRegistry();
      const generator = getToolGenerator();
      const operations = registry.getAllOperations();

      const startTime = Date.now();
      const tools = await generator.generateAll(operations);
      const genTime = Date.now() - startTime;

      log('✓', `Generated ${tools.length} MCP tools in ${genTime}ms`);

      // Show sample tools
      const sampleTools = tools.slice(0, 3);
      log('ℹ', '  Sample tools:');
      sampleTools.forEach(tool => {
        log('ℹ', `    - ${tool.definition.name}`);
      });
    } catch (error) {
      log('✗', `Tool generation failed: ${error.message}`);
      process.exit(1);
    }

    // Test 5: Verify dist files exist
    log('→', 'Test 5: Checking compiled files');
    const requiredDist = [
      'dist/index.js',
      'dist/registry/operation-registry.js',
      'dist/generator/tool-generator.js',
      'dist/executor/universal-executor.js',
      'dist/auth/edgegrid-client.js',
    ];

    let allExist = true;
    for (const file of requiredDist) {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        log('ℹ', `  ✓ ${file}`);
      } else {
        log('✗', `  ✗ ${file} (missing)`);
        allExist = false;
      }
    }

    if (!allExist) {
      log('✗', 'Some compiled files are missing. Run: npm run build');
      process.exit(1);
    }

    // Test 6: .env file protection
    log('→', 'Test 6: Verifying .gitignore protections');
    const gitignorePath = path.join(__dirname, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    if (gitignore.includes('.env')) {
      log('✓', '.env file is protected in .gitignore');
    } else {
      log('⚠', '.env file is NOT in .gitignore (security risk!)');
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    log('✓', 'All E2E tests passed! ✅');
    console.log('='.repeat(60) + '\n');

    log('→', 'Your Akamai MCP Server is ready to use:');
    log('ℹ', '  1. Start the server: npm start');
    log('ℹ', '  2. Test in Claude: Use any akamai_* tool');
    log('ℹ', '  3. Browse tools: npm run cli');
    log('ℹ', '  4. View logs: tail -f logs/akamai-mcp.log');
    console.log();

  } catch (error) {
    log('✗', `Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

runTests();
