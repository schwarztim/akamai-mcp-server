/**
 * Example: Using Akamai MCP Server from Node.js
 *
 * This example demonstrates how to interact with the MCP server
 * using Node.js child_process to send JSON-RPC messages.
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Call an MCP tool and return the result
 */
async function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    // Path to the built server
    const serverPath = path.join(__dirname, '..', 'dist', 'index.js');

    // Spawn the MCP server
    const server = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: process.env
    });

    let output = '';
    let errorOutput = '';

    // Collect stdout
    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Collect stderr (logs)
    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Create JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    // Send request
    server.stdin.write(JSON.stringify(request) + '\n');
    server.stdin.end();

    // Handle completion
    server.on('close', (code) => {
      if (code !== 0) {
        console.error('Server stderr:', errorOutput);
        reject(new Error(`Server exited with code ${code}`));
        return;
      }

      try {
        // Parse the response
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);

        if (response.error) {
          reject(new Error(response.error.message || 'Unknown error'));
        } else {
          resolve(response.result);
        }
      } catch (err) {
        reject(new Error(`Failed to parse response: ${err.message}\nOutput: ${output}`));
      }
    });

    // Handle errors
    server.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Example 1: Health Check
 */
async function exampleHealthCheck() {
  console.log('\n=== Example 1: Health Check ===');

  try {
    const result = await callTool('akamai_health_check');
    console.log('Health check result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

/**
 * Example 2: List Properties
 */
async function exampleListProperties() {
  console.log('\n=== Example 2: List Properties ===');

  try {
    const result = await callTool('akamai_list_properties', {
      // Optional: add contractId and groupId if known
      // contractId: 'ctr_X-XXXXX',
      // groupId: 'grp_XXXXX'
    });

    console.log('Properties:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('List properties failed:', error.message);
  }
}

/**
 * Example 3: Purge Cache (Staging)
 */
async function examplePurgeCache() {
  console.log('\n=== Example 3: Purge Cache ===');

  try {
    // Example URLs - replace with your actual URLs
    const urls = [
      'https://www.example.com/assets/image.jpg',
      'https://www.example.com/css/style.css'
    ];

    const result = await callTool('akamai_purge_by_url', {
      urls: urls,
      network: 'staging',  // Use staging for testing
      action: 'invalidate' // invalidate is safer than remove
    });

    console.log('Purge result:', JSON.stringify(result, null, 2));

    // If successful, check status
    if (result.content && result.content[0]) {
      const purgeResponse = JSON.parse(result.content[0].text);
      console.log(`Purge ID: ${purgeResponse.purgeId}`);
      console.log(`Estimated completion: ${purgeResponse.estimatedSeconds} seconds`);
    }
  } catch (error) {
    console.error('Purge failed:', error.message);
  }
}

/**
 * Example 4: List DNS Zones
 */
async function exampleListDnsZones() {
  console.log('\n=== Example 4: List DNS Zones ===');

  try {
    const result = await callTool('akamai_list_dns_zones');
    console.log('DNS zones:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('List DNS zones failed:', error.message);
  }
}

/**
 * Example 5: Get DNS Records
 */
async function exampleGetDnsRecords() {
  console.log('\n=== Example 5: Get DNS Records ===');

  try {
    // Replace with your actual zone name
    const zone = 'example.com';

    const result = await callTool('akamai_list_dns_records', {
      zone: zone
    });

    console.log(`DNS records for ${zone}:`, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Get DNS records failed:', error.message);
  }
}

/**
 * Example 6: List EdgeWorkers
 */
async function exampleListEdgeWorkers() {
  console.log('\n=== Example 6: List EdgeWorkers ===');

  try {
    const result = await callTool('akamai_list_edgeworkers');
    console.log('EdgeWorkers:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('List EdgeWorkers failed:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('Akamai MCP Server - Usage Examples');
  console.log('===================================');

  // Run examples
  // Comment out examples you don't want to run

  await exampleHealthCheck();

  // Uncomment to run other examples:
  // await exampleListProperties();
  // await examplePurgeCache();
  // await exampleListDnsZones();
  // await exampleGetDnsRecords();
  // await exampleListEdgeWorkers();

  console.log('\n=== All examples completed ===\n');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  callTool,
  exampleHealthCheck,
  exampleListProperties,
  examplePurgeCache,
  exampleListDnsZones,
  exampleGetDnsRecords,
  exampleListEdgeWorkers
};
