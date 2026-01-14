import winston from 'winston';
import { getConfig } from './config.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

let logger: winston.Logger | null = null;

/**
 * Initialize and return Winston logger instance
 */
export function getLogger(): winston.Logger {
  if (logger) {
    return logger;
  }

  const config = getConfig();

  // Ensure log directory exists
  const logDir = dirname(config.logging.file);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Create custom format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }

      // Add stack trace if present
      if (stack) {
        log += `\n${stack}`;
      }

      return log;
    })
  );

  // Create logger
  logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports: [
      // Console transport with color
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          logFormat
        ),
      }),
      // File transport
      new winston.transports.File({
        filename: config.logging.file,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        tailable: true,
      }),
    ],
  });

  return logger;
}

/**
 * Log API request details
 */
export function logRequest(method: string, path: string, params?: unknown): void {
  const logger = getLogger();
  logger.info('API Request', {
    method,
    path,
    params: params ? JSON.stringify(params) : undefined,
  });
}

/**
 * Log API response details
 */
export function logResponse(method: string, path: string, status: number, duration: number): void {
  const logger = getLogger();
  logger.info('API Response', {
    method,
    path,
    status,
    duration: `${duration}ms`,
  });
}

/**
 * Log errors with context
 */
export function logError(error: Error, context?: Record<string, unknown>): void {
  const logger = getLogger();
  logger.error(error.message, {
    error: error.name,
    stack: error.stack,
    ...context,
  });
}
