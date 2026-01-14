#!/usr/bin/env node

/**
 * Validate Registry Loading
 *
 * Tests that the operation registry loads successfully and reports statistics.
 */

import { getOperationRegistry } from '../dist/registry/operation-registry.js';
import { getToolGenerator } from '../dist/generator/tool-generator.js';

async function main() {
  console.log('🔍 Validating operation registry...\n');

  try {
    // Load registry
    console.log('Loading registry...');
    const registry = await getOperationRegistry();

    // Get statistics
    const stats = registry.getStats();
    console.log('\n📊 Registry Statistics:');
    console.log(`   Total Operations: ${stats.totalOperations}`);
    console.log(`   Specs Loaded: ${stats.specsLoaded}`);
    console.log(`   Paginatable Operations: ${stats.paginatableOperations}`);
    console.log(`   Operations with Body: ${stats.operationsWithBody}`);

    console.log('\n📦 Operations by Product:');
    const products = Object.entries(stats.operationsByProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    products.forEach(([product, count]) => {
      console.log(`   ${product}: ${count}`);
    });

    console.log('\n🔧 Operations by Method:');
    Object.entries(stats.operationsByMethod).forEach(([method, count]) => {
      console.log(`   ${method}: ${count}`);
    });

    // Test tool generation
    console.log('\n⚙️  Testing tool generation...');
    const generator = getToolGenerator();
    const operations = registry.getAllOperations();
    const tools = await generator.generateAll(operations);

    console.log(`   Generated ${tools.length} MCP tools`);

    // Show sample tool names
    console.log('\n🔨 Sample Tool Names (first 10):');
    tools.slice(0, 10).forEach(tool => {
      console.log(`   - ${tool.definition.name}`);
    });

    // Validate coverage
    console.log('\n✅ Validation Results:');
    if (stats.totalOperations === tools.length) {
      console.log(`   ✓ Coverage: 100% (${tools.length}/${stats.totalOperations} operations)`);
    } else {
      console.log(`   ⚠ Coverage: ${Math.round((tools.length / stats.totalOperations) * 100)}% (${tools.length}/${stats.totalOperations} operations)`);
    }

    // Test search functionality
    console.log('\n🔍 Testing search...');
    const ccuOps = registry.search({ product: 'ccu' });
    console.log(`   Found ${ccuOps.length} CCU operations`);

    const getOps = registry.search({ method: 'GET' });
    console.log(`   Found ${getOps.length} GET operations`);

    const paginatableOps = registry.search({ paginatable: true });
    console.log(`   Found ${paginatableOps.length} paginatable operations`);

    console.log('\n✅ Registry validation passed!\n');

  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  }
}

main();
