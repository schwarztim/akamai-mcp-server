# Docker Deployment Guide
## Akamai MCP Server Container Deployment

This guide covers deploying the Akamai MCP Server using Docker and Docker Compose.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Image](#docker-image)
3. [Docker Compose](#docker-compose)
4. [Configuration](#configuration)
5. [Security](#security)
6. [Networking](#networking)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Using Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/akamai-mcp-server.git
cd akamai-mcp-server

# 2. Create .env file with your credentials
cp .env.example .env
# Edit .env with your Akamai credentials

# 3. Build and start the container
docker-compose up -d

# 4. View logs
docker-compose logs -f

# 5. Stop the container
docker-compose down
```

### Using Docker CLI

```bash
# Build the image
docker build -t akamai-mcp-server:latest .

# Run the container
docker run -d \
  --name akamai-mcp-server \
  --restart unless-stopped \
  -e AKAMAI_HOST=your-host.luna.akamaiapis.net \
  -e AKAMAI_CLIENT_TOKEN=your-token \
  -e AKAMAI_CLIENT_SECRET=your-secret \
  -e AKAMAI_ACCESS_TOKEN=your-access \
  -v $(pwd)/logs:/app/logs \
  akamai-mcp-server:latest

# View logs
docker logs -f akamai-mcp-server

# Stop the container
docker stop akamai-mcp-server
```

---

## Docker Image

### Image Details

- **Base Image**: `node:18-alpine`
- **Size**: ~150MB (optimized multi-stage build)
- **User**: Non-root user (`akamai:akamai`, UID/GID 1001)
- **Security**: Minimal attack surface, no unnecessary packages

### Multi-Stage Build

The Dockerfile uses a two-stage build process:

1. **Builder Stage**: Compiles TypeScript with all dependencies
2. **Production Stage**: Contains only runtime dependencies and compiled code

**Benefits**:
- Smaller final image (~150MB vs ~1GB)
- No development tools in production image
- Faster deployment and startup

### Building the Image

```bash
# Build with default tag
docker build -t akamai-mcp-server:latest .

# Build with specific tag
docker build -t akamai-mcp-server:1.0.0 .

# Build with build arguments
docker build \
  --build-arg NODE_VERSION=18 \
  -t akamai-mcp-server:latest .

# Multi-platform build (ARM + x86)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t akamai-mcp-server:latest .
```

### Image Inspection

```bash
# View image details
docker image inspect akamai-mcp-server:latest

# Check image size
docker image ls akamai-mcp-server

# View image layers
docker history akamai-mcp-server:latest

# Scan for vulnerabilities (if Trivy installed)
trivy image akamai-mcp-server:latest
```

---

## Docker Compose

### Configuration

The `docker-compose.yml` file provides a production-ready configuration:

```yaml
version: '3.8'

services:
  akamai-mcp:
    build: .
    image: akamai-mcp-server:latest
    container_name: akamai-mcp-server
    restart: unless-stopped
    environment:
      AKAMAI_HOST: ${AKAMAI_HOST}
      AKAMAI_CLIENT_TOKEN: ${AKAMAI_CLIENT_TOKEN}
      AKAMAI_CLIENT_SECRET: ${AKAMAI_CLIENT_SECRET}
      AKAMAI_ACCESS_TOKEN: ${AKAMAI_ACCESS_TOKEN}
      LOG_LEVEL: info
    volumes:
      - ./logs:/app/logs
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
```

### Common Operations

```bash
# Start services
docker-compose up -d

# View logs (follow)
docker-compose logs -f

# View logs (last 100 lines)
docker-compose logs --tail=100

# Restart services
docker-compose restart

# Stop services
docker-compose stop

# Stop and remove containers
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Scale services (if needed)
docker-compose up -d --scale akamai-mcp=3
```

### Multiple Environments

```bash
# Development
docker-compose -f docker-compose.yml \
  -f docker-compose.dev.yml up -d

# Production
docker-compose -f docker-compose.yml \
  -f docker-compose.prod.yml up -d

# Staging
docker-compose -f docker-compose.yml \
  -f docker-compose.staging.yml up -d
```

---

## Configuration

### Environment Variables

All configuration is done via environment variables:

```bash
# Required
AKAMAI_HOST=akab-xxx.luna.akamaiapis.net
AKAMAI_CLIENT_TOKEN=akab-xxx
AKAMAI_CLIENT_SECRET=xxx
AKAMAI_ACCESS_TOKEN=akab-xxx

# Optional
AKAMAI_ACCOUNT_KEY=          # For account switching
LOG_LEVEL=info               # error, warn, info, debug
LOG_FILE=logs/akamai-mcp.log
MAX_RETRIES=3
RETRY_DELAY_MS=1000
REQUEST_TIMEOUT=30000
NODE_ENV=production
```

### Using .env File

```bash
# Create .env file
cat > .env << EOF
AKAMAI_HOST=your-host.luna.akamaiapis.net
AKAMAI_CLIENT_TOKEN=your-token
AKAMAI_CLIENT_SECRET=your-secret
AKAMAI_ACCESS_TOKEN=your-access
LOG_LEVEL=info
EOF

# Set secure permissions
chmod 600 .env

# Docker Compose will automatically load .env
docker-compose up -d
```

### Using Docker Secrets (Swarm Mode)

```bash
# Create secrets
echo "your-secret" | docker secret create akamai_client_secret -
echo "your-access" | docker secret create akamai_access_token -

# Reference in docker-compose.yml
services:
  akamai-mcp:
    secrets:
      - akamai_client_secret
      - akamai_access_token

secrets:
  akamai_client_secret:
    external: true
  akamai_access_token:
    external: true
```

---

## Security

### Security Best Practices

#### 1. Non-Root User

The container runs as non-root user (`akamai:akamai`, UID 1001):

```dockerfile
USER akamai
```

#### 2. No New Privileges

Prevents privilege escalation:

```yaml
security_opt:
  - no-new-privileges:true
```

#### 3. Read-Only Root Filesystem (Optional)

```yaml
read_only: true
tmpfs:
  - /tmp
  - /app/logs
```

#### 4. Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

#### 5. Minimal Base Image

Uses Alpine Linux for minimal attack surface:
- Only essential packages
- No shells or utilities beyond what's needed
- Regular security updates

### Security Scanning

```bash
# Scan with Trivy
trivy image akamai-mcp-server:latest

# Scan with Anchore
anchore-cli image add akamai-mcp-server:latest
anchore-cli image vuln akamai-mcp-server:latest all

# Scan with Clair
docker run -p 6060:6060 -d quay.io/coreos/clair:latest
```

---

## Networking

### Network Isolation

The container doesn't need network access for MCP communication (stdio only), but needs outbound HTTPS for Akamai APIs.

#### Option 1: Default Bridge Network

```yaml
# Allows outbound HTTPS
networks:
  default:
    driver: bridge
```

#### Option 2: No Network (Maximum Isolation)

```yaml
network_mode: none  # No network at all
```

**Note**: This prevents Akamai API calls. Only use if you need to test stdio communication.

#### Option 3: Custom Network

```yaml
networks:
  akamai-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### Firewall Rules (Host)

```bash
# Allow only outbound HTTPS to Akamai
sudo iptables -A OUTPUT -p tcp --dport 443 -d *.akamaiapis.net -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP

# Or use Docker network policies
```

---

## Monitoring

### Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1
```

Check health status:

```bash
# View health status
docker inspect --format='{{.State.Health.Status}}' akamai-mcp-server

# View health check logs
docker inspect --format='{{json .State.Health}}' akamai-mcp-server | jq
```

### Log Monitoring

```bash
# Follow logs
docker logs -f akamai-mcp-server

# Last 100 lines
docker logs --tail=100 akamai-mcp-server

# Since specific time
docker logs --since=1h akamai-mcp-server

# Filter logs
docker logs akamai-mcp-server 2>&1 | grep ERROR

# Export logs
docker logs akamai-mcp-server > server.log 2>&1
```

### Metrics Collection

#### Prometheus Integration

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
```

#### Grafana Dashboard

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker logs akamai-mcp-server

# Check container status
docker ps -a | grep akamai-mcp

# Inspect container
docker inspect akamai-mcp-server

# Check for resource issues
docker stats akamai-mcp-server
```

### Permission Denied Errors

```bash
# Check file permissions
ls -la logs/

# Fix permissions
sudo chown -R 1001:1001 logs/

# Or run as root (not recommended)
docker run --user root ...
```

### Network Issues

```bash
# Test DNS resolution
docker exec akamai-mcp-server nslookup your-host.luna.akamaiapis.net

# Test connectivity
docker exec akamai-mcp-server wget -O- https://your-host.luna.akamaiapis.net

# Check network mode
docker inspect -f '{{.HostConfig.NetworkMode}}' akamai-mcp-server
```

### Memory Issues

```bash
# Check memory usage
docker stats akamai-mcp-server

# Increase memory limit
docker update --memory=1g akamai-mcp-server

# Or in docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 1G
```

### Debugging

```bash
# Run with interactive shell
docker run -it --rm \
  --entrypoint /bin/sh \
  akamai-mcp-server:latest

# Execute commands in running container
docker exec -it akamai-mcp-server /bin/sh

# View environment variables
docker exec akamai-mcp-server env

# Check process list
docker exec akamai-mcp-server ps aux
```

---

## Advanced Topics

### Building for Multiple Platforms

```bash
# Setup buildx
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t akamai-mcp-server:latest \
  --push .
```

### Using Docker Registry

```bash
# Tag image
docker tag akamai-mcp-server:latest registry.example.com/akamai-mcp:1.0.0

# Push to registry
docker push registry.example.com/akamai-mcp:1.0.0

# Pull from registry
docker pull registry.example.com/akamai-mcp:1.0.0
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: akamai-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: akamai-mcp
  template:
    metadata:
      labels:
        app: akamai-mcp
    spec:
      containers:
      - name: akamai-mcp
        image: akamai-mcp-server:latest
        env:
        - name: AKAMAI_HOST
          valueFrom:
            secretKeyRef:
              name: akamai-credentials
              key: host
        resources:
          limits:
            memory: "512Mi"
            cpu: "1000m"
```

---

## Best Practices

1. **Always use specific tags** (not `:latest`) in production
2. **Enable health checks** for automatic restart
3. **Set resource limits** to prevent resource exhaustion
4. **Use secrets management** (Docker secrets, Kubernetes secrets, Vault)
5. **Run as non-root** for security
6. **Regularly update base image** for security patches
7. **Monitor logs and metrics** for operational visibility
8. **Backup configurations** before making changes
9. **Test in staging** before deploying to production
10. **Document custom configurations** for team knowledge

---

## References

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Alpine Linux Documentation](https://wiki.alpinelinux.org/)

---

**Last Updated**: 2026-01-14
