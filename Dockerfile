# Multi-stage Dockerfile for Akamai MCP Server
# Production-optimized with security best practices

# Stage 1: Build
FROM node:18-alpine AS builder

LABEL maintainer="Akamai MCP Server Team"
LABEL description="Model Context Protocol server for Akamai APIs"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S akamai && \
    adduser -S -u 1001 -G akamai akamai

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create logs directory with correct permissions
RUN mkdir -p logs && \
    chown -R akamai:akamai /app && \
    chmod 755 /app && \
    chmod 755 logs

# Switch to non-root user
USER akamai

# Health check (optional - checks if process is running)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    LOG_FILE=logs/akamai-mcp.log

# Expose stdio (no network ports needed for MCP)
# Container communicates via stdin/stdout

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the server
CMD ["node", "dist/index.js"]
