# Deployment Guide

This guide provides detailed instructions for deploying the Akamai MCP Server in various environments.

## Table of Contents

- [Pre-deployment Checklist](#pre-deployment-checklist)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployments](#cloud-deployments)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Testing Guide](#testing-guide)

## Pre-deployment Checklist

Before deploying, ensure you have:

- ✅ Node.js 18+ installed
- ✅ Akamai API credentials (EdgeGrid)
- ✅ Required API permissions configured in Akamai Control Center
- ✅ Network access to `*.akamaiapis.net`
- ✅ Sufficient disk space for logs (recommend 1GB+)

## Local Development

### Setup

```bash
# Clone or extract the project
cd akamai-mcp-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### Running Locally

```bash
# Development mode (with auto-reload)
npm run dev

# Production build
npm run build
npm start
```

### Verifying Installation

1. Check server startup logs
2. Run health check via MCP client
3. Verify log file creation in `logs/` directory

## Production Deployment

### Option 1: Systemd Service (Linux)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/akamai-mcp.service
```

Add the following content:

```ini
[Unit]
Description=Akamai MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/akamai-mcp-server
ExecStart=/usr/bin/node /opt/akamai-mcp-server/dist/index.js
Restart=on-failure
RestartSec=10

# Environment variables
Environment="AKAMAI_HOST=your-host.luna.akamaiapis.net"
Environment="AKAMAI_CLIENT_TOKEN=your-token"
Environment="AKAMAI_CLIENT_SECRET=your-secret"
Environment="AKAMAI_ACCESS_TOKEN=your-access"
Environment="LOG_LEVEL=info"
Environment="NODE_ENV=production"

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/akamai-mcp-server/logs

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable akamai-mcp.service

# Start service
sudo systemctl start akamai-mcp.service

# Check status
sudo systemctl status akamai-mcp.service

# View logs
sudo journalctl -u akamai-mcp.service -f
```

### Option 2: PM2 Process Manager

PM2 provides advanced process management with monitoring and auto-restart.

```bash
# Install PM2 globally
npm install -g pm2

# Build the project
npm run build

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'akamai-mcp',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      AKAMAI_HOST: 'your-host.luna.akamaiapis.net',
      AKAMAI_CLIENT_TOKEN: 'your-token',
      AKAMAI_CLIENT_SECRET: 'your-secret',
      AKAMAI_ACCESS_TOKEN: 'your-access',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M',
    autorestart: true,
    watch: false
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script (run on boot)
pm2 startup

# Monitor
pm2 monit

# View logs
pm2 logs akamai-mcp
```

### Option 3: Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  akamai-mcp:
    build: .
    container_name: akamai-mcp-server
    restart: unless-stopped
    environment:
      - AKAMAI_HOST=${AKAMAI_HOST}
      - AKAMAI_CLIENT_TOKEN=${AKAMAI_CLIENT_TOKEN}
      - AKAMAI_CLIENT_SECRET=${AKAMAI_CLIENT_SECRET}
      - AKAMAI_ACCESS_TOKEN=${AKAMAI_ACCESS_TOKEN}
      - LOG_LEVEL=info
      - NODE_ENV=production
    volumes:
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Deploy:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Docker Deployment

### Building Docker Image

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown -R node:node logs

# Switch to non-root user
USER node

# Start the server
CMD ["node", "dist/index.js"]
```

### Build and Run

```bash
# Build image
docker build -t akamai-mcp-server:latest .

# Run container
docker run -d \
  --name akamai-mcp \
  --restart unless-stopped \
  -e AKAMAI_HOST=your-host.luna.akamaiapis.net \
  -e AKAMAI_CLIENT_TOKEN=your-token \
  -e AKAMAI_CLIENT_SECRET=your-secret \
  -e AKAMAI_ACCESS_TOKEN=your-access \
  -e LOG_LEVEL=info \
  -v $(pwd)/logs:/app/logs \
  akamai-mcp-server:latest

# View logs
docker logs -f akamai-mcp

# Stop container
docker stop akamai-mcp

# Remove container
docker rm akamai-mcp
```

### Multi-stage Build Benefits

- Smaller final image (~150MB vs ~1GB)
- No development dependencies in production
- Faster deployments

## Cloud Deployments

### AWS EC2

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone/copy project
cd /opt
sudo mkdir akamai-mcp-server
sudo chown $USER:$USER akamai-mcp-server
cd akamai-mcp-server

# Install and build
npm install
npm run build

# Setup systemd service (see Option 1 above)

# Configure AWS Secrets Manager (optional)
aws secretsmanager create-secret \
  --name akamai-mcp-credentials \
  --secret-string '{
    "host":"your-host",
    "clientToken":"your-token",
    "clientSecret":"your-secret",
    "accessToken":"your-access"
  }'
```

### AWS ECS (Fargate)

Create `task-definition.json`:

```json
{
  "family": "akamai-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "akamai-mcp",
      "image": "your-ecr-repo/akamai-mcp-server:latest",
      "essential": true,
      "secrets": [
        {
          "name": "AKAMAI_HOST",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:akamai-mcp-credentials:host"
        },
        {
          "name": "AKAMAI_CLIENT_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:akamai-mcp-credentials:clientToken"
        },
        {
          "name": "AKAMAI_CLIENT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:akamai-mcp-credentials:clientSecret"
        },
        {
          "name": "AKAMAI_ACCESS_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:akamai-mcp-credentials:accessToken"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/akamai-mcp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/akamai-mcp-server

# Deploy
gcloud run deploy akamai-mcp \
  --image gcr.io/PROJECT_ID/akamai-mcp-server \
  --platform managed \
  --region us-central1 \
  --set-env-vars AKAMAI_HOST=your-host \
  --set-env-vars AKAMAI_CLIENT_TOKEN=your-token \
  --set-secrets AKAMAI_CLIENT_SECRET=akamai-secret:latest \
  --set-secrets AKAMAI_ACCESS_TOKEN=akamai-access:latest \
  --memory 512Mi \
  --cpu 1 \
  --no-allow-unauthenticated
```

### Azure Container Instances

```bash
# Create resource group
az group create --name akamai-mcp-rg --location eastus

# Create container
az container create \
  --resource-group akamai-mcp-rg \
  --name akamai-mcp-server \
  --image your-registry/akamai-mcp-server:latest \
  --cpu 1 \
  --memory 1 \
  --environment-variables \
    AKAMAI_HOST=your-host \
    AKAMAI_CLIENT_TOKEN=your-token \
  --secure-environment-variables \
    AKAMAI_CLIENT_SECRET=your-secret \
    AKAMAI_ACCESS_TOKEN=your-access \
  --restart-policy OnFailure
```

## Monitoring & Maintenance

### Health Monitoring

Create a monitoring script:

```bash
#!/bin/bash
# healthcheck.sh

# Check if process is running
if ! pgrep -f "node dist/index.js" > /dev/null; then
    echo "ERROR: Akamai MCP Server is not running"
    exit 1
fi

# Check log for recent activity (last 5 minutes)
if ! find logs/akamai-mcp.log -mmin -5 | grep -q .; then
    echo "WARNING: No recent log activity"
fi

echo "OK: Server is healthy"
exit 0
```

### Log Monitoring

```bash
# Monitor for errors in real-time
tail -f logs/akamai-mcp.log | grep ERROR

# Count errors in last hour
grep ERROR logs/akamai-mcp.log | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l

# Monitor rate limit warnings
tail -f logs/akamai-mcp.log | grep "429"
```

### Backup Strategy

```bash
# Backup logs (weekly)
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/

# Backup configuration
tar -czf config-backup-$(date +%Y%m%d).tar.gz .env ecosystem.config.js
```

### Updating the Server

```bash
# Stop the server
pm2 stop akamai-mcp
# or
sudo systemctl stop akamai-mcp

# Backup current version
cp -r /opt/akamai-mcp-server /opt/akamai-mcp-server.backup

# Pull/copy new version
cd /opt/akamai-mcp-server
git pull  # if using git

# Install dependencies and rebuild
npm install
npm run build

# Restart server
pm2 start akamai-mcp
# or
sudo systemctl start akamai-mcp

# Monitor logs
pm2 logs akamai-mcp
# or
sudo journalctl -u akamai-mcp -f
```

## Testing Guide

### Manual Testing

#### 1. Health Check Test

```bash
# Using MCP CLI
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"akamai_health_check","arguments":{}}}' | npx @modelcontextprotocol/cli run node dist/index.js
```

Expected output:
```json
{
  "status": "healthy",
  "message": "Successfully connected to Akamai API"
}
```

#### 2. List Properties Test

```json
{
  "tool": "akamai_list_properties",
  "arguments": {}
}
```

#### 3. Purge Test (Staging)

```json
{
  "tool": "akamai_purge_by_url",
  "arguments": {
    "urls": ["https://staging.example.com/test.jpg"],
    "network": "staging",
    "action": "invalidate"
  }
}
```

### Integration Testing

Create `test-integration.js`:

```javascript
const { spawn } = require('child_process');

async function testTool(tool, args) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: tool, arguments: args }
  };

  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/index.js']);

    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output));
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

// Run tests
async function runTests() {
  console.log('Testing health check...');
  const health = await testTool('akamai_health_check', {});
  console.log('✓ Health check passed');

  console.log('Testing list properties...');
  const props = await testTool('akamai_list_properties', {});
  console.log('✓ List properties passed');

  console.log('All tests passed!');
}

runTests().catch(console.error);
```

Run:
```bash
node test-integration.js
```

### Load Testing

Test rate limiting and performance:

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Simulate 100 requests with concurrency of 10
ab -n 100 -c 10 -p request.json -T application/json http://localhost:3000/
```

### Monitoring Checklist

- [ ] Server starts without errors
- [ ] Health check returns successful response
- [ ] Log file is created and updated
- [ ] Rate limiter prevents excessive requests
- [ ] Retry logic works for transient errors
- [ ] Configuration validation catches missing vars
- [ ] EdgeGrid authentication succeeds

## Troubleshooting Deployment

### Issue: Permission Denied

```bash
# Fix file permissions
sudo chown -R $USER:$USER /opt/akamai-mcp-server
chmod +x dist/index.js
```

### Issue: Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Issue: Out of Memory

```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 dist/index.js
```

### Issue: Connection Timeout

```bash
# Test DNS resolution
nslookup your-host.luna.akamaiapis.net

# Test connectivity
curl -v https://your-host.luna.akamaiapis.net

# Check firewall rules
sudo iptables -L -n -v
```

## Security Hardening

### 1. Use Secret Management

Never store credentials in plain text. Use:
- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager
- HashiCorp Vault
- Kubernetes Secrets

### 2. Network Security

```bash
# Allow only necessary outbound connections
sudo ufw allow out 443/tcp
sudo ufw default deny outgoing

# Restrict SSH access
sudo ufw allow from YOUR_IP to any port 22
```

### 3. File Permissions

```bash
# Restrict .env file
chmod 600 .env

# Restrict log directory
chmod 750 logs/
```

### 4. Regular Updates

```bash
# Update dependencies
npm audit fix

# Update Node.js
nvm install 18
nvm use 18
```

## Performance Tuning

### Optimize for High Load

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'akamai-mcp',
    script: './dist/index.js',
    instances: 4,  // Run 4 instances
    exec_mode: 'cluster',  // Use cluster mode
    max_memory_restart: '500M'
  }]
};
```

### Adjust Rate Limits

Edit `src/auth/edgegrid-client.ts`:

```typescript
// Increase rate limit (default: 20 requests, 2/sec refill)
this.rateLimiter = new RateLimiter(50, 5);
```

---

**Next Steps**:
1. Deploy to your chosen environment
2. Configure monitoring and alerting
3. Set up automated backups
4. Document your specific deployment configuration
