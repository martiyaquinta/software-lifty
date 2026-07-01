type MetricName = string;
type LabelSet = Record<string, string>;

interface SerializedMetric {
  name: MetricName;
  type: string;
  help: string;
  values: { labels: LabelSet; value: number }[];
}

class Counter {
  private name: MetricName;
  private help: string;
  private data: Map<string, { labels: LabelSet; value: number }>;

  constructor(name: MetricName, help: string) {
    this.name = name;
    this.help = help;
    this.data = new Map();
  }

  inc(labels: LabelSet, n = 1) {
    const key = JSON.stringify(labels);
    const existing = this.data.get(key);
    if (existing) {
      existing.value += n;
    } else {
      this.data.set(key, { labels, value: n });
    }
  }

  collect(): SerializedMetric {
    return {
      name: this.name,
      type: 'counter',
      help: this.help,
      values: Array.from(this.data.values()),
    };
  }
}

class Gauge {
  private name: MetricName;
  private help: string;
  private data: Map<string, { labels: LabelSet; value: number }>;

  constructor(name: MetricName, help: string) {
    this.name = name;
    this.help = help;
    this.data = new Map();
  }

  set(labels: LabelSet, value: number) {
    const key = JSON.stringify(labels);
    this.data.set(key, { labels, value });
  }

  collect(): SerializedMetric {
    return {
      name: this.name,
      type: 'gauge',
      help: this.help,
      values: Array.from(this.data.values()),
    };
  }
}

class Histogram {
  private name: MetricName;
  private help: string;
  private buckets: number[];
  private data: Map<string, { labels: LabelSet; sum: number; count: number; buckets: number[] }>;

  constructor(name: MetricName, help: string, buckets?: number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.data = new Map();
  }

  observe(labels: LabelSet, value: number) {
    const key = JSON.stringify(labels);
    let entry = this.data.get(key);
    if (!entry) {
      entry = { labels, sum: 0, count: 0, buckets: new Array(this.buckets.length).fill(0) };
      this.data.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) entry.buckets[i]++;
    }
  }

  collect(): SerializedMetric[] {
    const results: SerializedMetric[] = [];
    for (const [_key, entry] of this.data) {
      const baseName = this.name;
      results.push({ name: `${baseName}_bucket`, type: 'histogram', help: this.help, values: [] });
      results.push({ name: `${baseName}_sum`, type: 'histogram', help: this.help, values: [] });
      results.push({ name: `${baseName}_count`, type: 'histogram', help: this.help, values: [] });
    }
    for (const [_key, entry] of this.data) {
      for (let i = 0; i < this.buckets.length; i++) {
        const le = i < this.buckets.length - 1 ? this.buckets[i] : Number.POSITIVE_INFINITY;
        results[0].values.push({
          labels: { ...entry.labels, le: String(le) },
          value: entry.buckets[i],
        });
      }
      results[1].values.push({ labels: entry.labels, value: entry.sum });
      results[2].values.push({ labels: entry.labels, value: entry.count });
    }
    return results;
  }
}

class Registry {
  private collectors: (Counter | Gauge | Histogram)[];

  constructor() {
    this.collectors = [];
  }

  register(collector: Counter | Gauge | Histogram) {
    this.collectors.push(collector);
    return collector;
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const collector of this.collectors) {
      const metrics = collector.collect();
      const list = Array.isArray(metrics) ? metrics : [metrics];

      for (const m of list) {
        const key = `${m.name}:${m.type}`;
        if (!seen.has(key)) {
          lines.push(`# HELP ${m.name} ${m.help}`);
          lines.push(`# TYPE ${m.name} ${m.type}`);
          seen.add(key);
        }
        for (const v of m.values) {
          const labelPairs = Object.entries(v.labels)
            .map(([k, val]) => `${k}="${val}"`)
            .join(',');
          const labelStr = labelPairs ? `{${labelPairs}}` : '';
          lines.push(`${m.name}${labelStr} ${v.value}`);
        }
      }
    }

    return `${lines.join('\n')}\n`;
  }
}

export const registry = new Registry();

export const httpRequestsTotal = registry.register(
  new Counter('http_requests_total', 'Total HTTP requests processed'),
) as Counter;

export const httpRequestDurationSeconds = registry.register(
  new Histogram('http_request_duration_seconds', 'HTTP request duration in seconds'),
) as Histogram;

export const dbPoolSize = registry.register(
  new Gauge('db_pool_size', 'Current database pool size'),
) as Gauge;

export const dbPoolAvailable = registry.register(
  new Gauge('db_pool_available', 'Available database connections in pool'),
) as Gauge;
