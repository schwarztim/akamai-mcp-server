#!/usr/bin/env node

/**
 * Developer CLI
 *
 * Interactive CLI for testing and debugging Akamai MCP operations.
 * Provides operation browsing, testing, and request/response inspection.
 */

import * as readline from 'readline';
import { getOperationRegistry } from '../registry/operation-registry.js';
import { UniversalExecutor } from '../executor/universal-executor.js';
import type { OperationDefinition } from '../registry/types.js';

interface DevCLIOptions {
  mockMode?: boolean;
  verboseMode?: boolean;
}

/**
 * Developer CLI for testing operations
 */
class DevCLI {
  private rl: readline.Interface;
  private executor: UniversalExecutor;
  private operations: OperationDefinition[] = [];
  private readonly options: DevCLIOptions;
  private history: Array<{ operation: string; timestamp: number; success: boolean }> = [];

  constructor(options: DevCLIOptions = {}) {
    this.options = options;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'akamai-mcp> ',
    });

    this.executor = new UniversalExecutor();
  }

  /**
   * Start the CLI
   */
  async start(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   Akamai MCP Developer CLI v3.0                       ║');
    console.log('║   Interactive testing and debugging tool              ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    if (this.options.mockMode) {
      console.log('⚠️  Running in MOCK MODE - No real API calls\n');
    }

    // Load registry
    await this.loadOperations();

    // Show help
    this.showHelp();

    // Setup command handlers
    this.setupHandlers();

    // Start prompt
    this.rl.prompt();
  }

  /**
   * Load operations from registry
   */
  private async loadOperations(): Promise<void> {
    try {
      const registry = await getOperationRegistry();
      this.operations = registry.getAllOperations();

      console.log(`✅ Loaded ${this.operations.length} operations\n`);
    } catch (error) {
      console.error('❌ Failed to load operations:', error);
      process.exit(1);
    }
  }

  /**
   * Setup command handlers
   */
  private setupHandlers(): void {
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      const [command, ...args] = trimmed.split(' ');

      try {
        await this.handleCommand(command, args);
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }

  /**
   * Handle CLI commands
   */
  private async handleCommand(command: string, args: string[]): Promise<void> {
    switch (command.toLowerCase()) {
      case 'help':
      case 'h':
        this.showHelp();
        break;

      case 'list':
      case 'ls':
        this.listOperations(args[0]);
        break;

      case 'search':
        this.searchOperations(args.join(' '));
        break;

      case 'info':
        this.showOperationInfo(args[0]);
        break;

      case 'test':
        await this.testOperation(args[0], args.slice(1));
        break;

      case 'stats':
        this.showStats();
        break;

      case 'history':
        this.showHistory();
        break;

      case 'clear':
        console.clear();
        break;

      case 'exit':
      case 'quit':
      case 'q':
        this.rl.close();
        break;

      case 'mock':
        this.toggleMockMode();
        break;

      case 'verbose':
        this.toggleVerboseMode();
        break;

      default:
        console.log(`❌ Unknown command: ${command}`);
        console.log('Type "help" for available commands');
    }
  }

  /**
   * Show help menu
   */
  private showHelp(): void {
    console.log('Available Commands:');
    console.log('  help, h              Show this help menu');
    console.log('  list [product]       List all operations (optionally filter by product)');
    console.log('  search <query>       Search operations by keyword');
    console.log('  info <operationId>   Show detailed info about an operation');
    console.log('  test <operationId>   Test an operation (interactive)');
    console.log('  stats                Show registry statistics');
    console.log('  history              Show test history');
    console.log('  mock                 Toggle mock mode');
    console.log('  verbose              Toggle verbose mode');
    console.log('  clear                Clear screen');
    console.log('  exit, quit, q        Exit CLI\n');
  }

  /**
   * List operations
   */
  private listOperations(productFilter?: string): void {
    let filtered = this.operations;

    if (productFilter) {
      filtered = this.operations.filter((op) =>
        op.product.toLowerCase().includes(productFilter.toLowerCase())
      );
    }

    if (filtered.length === 0) {
      console.log('No operations found');
      return;
    }

    console.log(`\nFound ${filtered.length} operations:\n`);

    // Group by product
    const byProduct = new Map<string, OperationDefinition[]>();
    for (const op of filtered) {
      const ops = byProduct.get(op.product) || [];
      ops.push(op);
      byProduct.set(op.product, ops);
    }

    for (const [product, ops] of byProduct.entries()) {
      console.log(`📦 ${product} (${ops.length})`);
      for (const op of ops.slice(0, 5)) {
        console.log(`  - ${op.operationId} [${op.method}] ${op.summary || ''}`);
      }
      if (ops.length > 5) {
        console.log(`  ... and ${ops.length - 5} more`);
      }
      console.log('');
    }
  }

  /**
   * Search operations
   */
  private searchOperations(query: string): void {
    if (!query) {
      console.log('Usage: search <query>');
      return;
    }

    const results = this.operations.filter(
      (op) =>
        op.operationId.toLowerCase().includes(query.toLowerCase()) ||
        (op.summary || '').toLowerCase().includes(query.toLowerCase()) ||
        op.path.toLowerCase().includes(query.toLowerCase())
    );

    if (results.length === 0) {
      console.log(`No operations found matching "${query}"`);
      return;
    }

    console.log(`\nFound ${results.length} operations matching "${query}":\n`);

    for (const op of results.slice(0, 10)) {
      console.log(`📌 ${op.operationId}`);
      console.log(`   ${op.method.toUpperCase()} ${op.path}`);
      console.log(`   ${op.summary || 'No summary'}`);
      console.log('');
    }

    if (results.length > 10) {
      console.log(`... and ${results.length - 10} more results`);
    }
  }

  /**
   * Show operation info
   */
  private showOperationInfo(operationId: string): void {
    if (!operationId) {
      console.log('Usage: info <operationId>');
      return;
    }

    const op = this.operations.find((o) => o.operationId === operationId);

    if (!op) {
      console.log(`❌ Operation not found: ${operationId}`);
      return;
    }

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log(`║ ${op.operationId.padEnd(53)} ║`);
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log(`Product:     ${op.product}`);
    console.log(`Method:      ${op.method.toUpperCase()}`);
    console.log(`Path:        ${op.path}`);
    console.log(`Summary:     ${op.summary || 'No summary'}`);
    console.log(`Description: ${op.description || 'N/A'}`);

    console.log('\nNote: Use test command to execute this operation');

    console.log('');
  }

  /**
   * Test an operation
   */
  private async testOperation(operationId: string, args: string[]): Promise<void> {
    if (!operationId) {
      console.log('Usage: test <operationId> [--param key=value ...]');
      return;
    }

    const op = this.operations.find((o) => o.operationId === operationId);

    if (!op) {
      console.log(`❌ Operation not found: ${operationId}`);
      return;
    }

    if (this.options.mockMode) {
      this.mockTestOperation(op);
      return;
    }

    // Parse parameters from args
    const params = this.parseParams(args);

    console.log(`\n🧪 Testing: ${op.operationId}`);
    console.log(`📍 ${op.method.toUpperCase()} ${op.path}\n`);

    if (Object.keys(params).length > 0) {
      console.log('Parameters:', JSON.stringify(params, null, 2));
    }

    try {
      const startTime = Date.now();
      const result = await this.executor.execute(op, params);
      const duration = Date.now() - startTime;

      console.log(`\n✅ Success (${duration}ms)`);
      console.log(`Status: ${result.status}`);
      console.log(`Response:\n${JSON.stringify(result.body, null, 2).slice(0, 500)}`);

      if (JSON.stringify(result.body).length > 500) {
        console.log('\n... (response truncated, use verbose mode for full output)');
      }

      this.history.push({
        operation: operationId,
        timestamp: Date.now(),
        success: true,
      });
    } catch (error) {
      console.log('\n❌ Failed');
      console.log('Error:', error instanceof Error ? error.message : String(error));

      this.history.push({
        operation: operationId,
        timestamp: Date.now(),
        success: false,
      });
    }
  }

  /**
   * Mock test operation
   */
  private mockTestOperation(op: OperationDefinition): void {
    console.log(`\n🧪 [MOCK] Testing: ${op.operationId}`);
    console.log(`📍 ${op.method.toUpperCase()} ${op.path}\n`);
    console.log('✅ Mock Success (10ms)');
    console.log('Status: 200');
    console.log('Response: { "mock": true, "data": [...] }');
  }

  /**
   * Parse parameters from command args
   */
  private parseParams(args: string[]): any {
    const params: any = {};

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--param' && i + 1 < args.length) {
        const [key, ...valueParts] = args[i + 1].split('=');
        params[key] = valueParts.join('=');
        i++;
      }
    }

    return params;
  }

  /**
   * Show statistics
   */
  private showStats(): void {
    const byProduct = new Map<string, number>();
    const byMethod = new Map<string, number>();

    for (const op of this.operations) {
      byProduct.set(op.product, (byProduct.get(op.product) || 0) + 1);
      byMethod.set(op.method, (byMethod.get(op.method) || 0) + 1);
    }

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║  Registry Statistics                                  ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log(`Total Operations: ${this.operations.length}`);
    console.log(`\nTop Products:`);

    const sortedProducts = Array.from(byProduct.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [product, count] of sortedProducts) {
      console.log(`  ${product}: ${count}`);
    }

    console.log(`\nBy Method:`);
    for (const [method, count] of byMethod.entries()) {
      console.log(`  ${method.toUpperCase()}: ${count}`);
    }

    console.log('');
  }

  /**
   * Show test history
   */
  private showHistory(): void {
    if (this.history.length === 0) {
      console.log('No test history');
      return;
    }

    console.log('\n📜 Test History (last 10):\n');

    const recent = this.history.slice(-10).reverse();

    for (const entry of recent) {
      const icon = entry.success ? '✅' : '❌';
      const time = new Date(entry.timestamp).toLocaleTimeString();
      console.log(`${icon} ${entry.operation} at ${time}`);
    }

    console.log('');
  }

  /**
   * Toggle mock mode
   */
  private toggleMockMode(): void {
    this.options.mockMode = !this.options.mockMode;
    console.log(`Mock mode: ${this.options.mockMode ? 'ON' : 'OFF'}`);
  }

  /**
   * Toggle verbose mode
   */
  private toggleVerboseMode(): void {
    this.options.verboseMode = !this.options.verboseMode;
    console.log(`Verbose mode: ${this.options.verboseMode ? 'ON' : 'OFF'}`);
  }
}

/**
 * Run the CLI
 */
async function main(): Promise<void> {
  const cli = new DevCLI({
    mockMode: process.argv.includes('--mock'),
    verboseMode: process.argv.includes('--verbose'),
  });

  await cli.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
