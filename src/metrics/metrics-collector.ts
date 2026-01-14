/**
 * Metrics Collector
 *
 * Lightweight metrics collection system for monitoring server performance
 * and API usage patterns. Provides Prometheus-compatible metrics export.
 */

import { getLogger } from '../utils/logger.js';

/** Metric types supported */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/** Individual metric definition */
interface Metric {
  type: MetricType;
  name: string;
  help: string;
  value: number;
  labels?: Record<string, string>;
  buckets?: number[]; // For histograms
  observations?: number[]; // For histograms
}

/** Histogram bucket */
interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Metrics Collector
 *
 * Thread-safe metrics collection with automatic aggregation.
 */
export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();
  private logger = getLogger();

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const key = this.getKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type !== 'counter') {
      this.logger.warn(`Metric ${name} exists but is not a counter`);
      return;
    }

    if (existing) {
      existing.value += value;
    } else {
      this.metrics.set(key, {
        type: 'counter',
        name,
        help: `Counter: ${name}`,
        value,
        labels,
      });
    }
  }

  /**
   * Set a gauge metric
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type !== 'gauge') {
      this.logger.warn(`Metric ${name} exists but is not a gauge`);
      return;
    }

    if (existing) {
      existing.value = value;
    } else {
      this.metrics.set(key, {
        type: 'gauge',
        name,
        help: `Gauge: ${name}`,
        value,
        labels,
      });
    }
  }

  /**
   * Record histogram observation
   */
  recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): void {
    const key = this.getKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type !== 'histogram') {
      this.logger.warn(`Metric ${name} exists but is not a histogram`);
      return;
    }

    if (existing) {
      if (!existing.observations) existing.observations = [];
      existing.observations.push(value);
    } else {
      this.metrics.set(key, {
        type: 'histogram',
        name,
        help: `Histogram: ${name}`,
        value: 0,
        labels,
        buckets,
        observations: [value],
      });
    }
  }

  /**
   * Get all metrics in Prometheus text format
   */
  exportPrometheusFormat(): string {
    const lines: string[] = [];
    const processedMetrics = new Set<string>();

    for (const [, metric] of this.metrics) {
      // Only output HELP and TYPE once per metric name
      if (!processedMetrics.has(metric.name)) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} ${metric.type}`);
        processedMetrics.add(metric.name);
      }

      const labelsStr = metric.labels ? this.formatLabels(metric.labels) : '';

      if (metric.type === 'histogram') {
        this.exportHistogram(metric, labelsStr, lines);
      } else {
        lines.push(`${metric.name}${labelsStr} ${metric.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Export histogram metric
   */
  private exportHistogram(metric: Metric, labelsStr: string, lines: string[]): void {
    if (!metric.observations || !metric.buckets) return;

    const sorted = metric.observations.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const count = sorted.length;

    // Calculate buckets
    const buckets: HistogramBucket[] = metric.buckets.map((le) => ({
      le,
      count: sorted.filter((v) => v <= le).length,
    }));

    // Add +Inf bucket
    buckets.push({ le: Infinity, count });

    // Export buckets
    for (const bucket of buckets) {
      const leStr = bucket.le === Infinity ? '+Inf' : bucket.le.toString();
      const bucketLabels = metric.labels
        ? { ...metric.labels, le: leStr }
        : { le: leStr };
      lines.push(
        `${metric.name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`
      );
    }

    // Export sum and count
    lines.push(`${metric.name}_sum${labelsStr} ${sum}`);
    lines.push(`${metric.name}_count${labelsStr} ${count}`);
  }

  /**
   * Get metrics as JSON
   */
  exportJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, metric] of this.metrics) {
      const metricData: Record<string, unknown> = {
        type: metric.type,
        value: metric.value,
      };

      if (metric.labels) {
        metricData.labels = metric.labels;
      }

      if (metric.type === 'histogram' && metric.observations) {
        const sorted = metric.observations.slice().sort((a, b) => a - b);
        const sum = sorted.reduce((acc, val) => acc + val, 0);
        metricData.count = sorted.length;
        metricData.sum = sum;
        metricData.avg = sum / sorted.length || 0;
        metricData.min = sorted[0] || 0;
        metricData.max = sorted[sorted.length - 1] || 0;
        metricData.p50 = this.percentile(sorted, 0.5);
        metricData.p95 = this.percentile(sorted, 0.95);
        metricData.p99 = this.percentile(sorted, 0.99);
      }

      result[key] = metricData;
    }

    return result;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
  }

  /**
   * Generate unique key for metric with labels
   */
  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const sortedLabels = Object.keys(labels)
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');

    return `${name}{${sortedLabels}}`;
  }

  /**
   * Format labels for Prometheus
   */
  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);

    return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;

    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton instance
let instance: MetricsCollector | null = null;

/**
 * Get singleton metrics collector
 */
export function getMetricsCollector(): MetricsCollector {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

/**
 * Reset metrics collector (for testing)
 */
export function resetMetricsCollector(): void {
  instance = null;
}
