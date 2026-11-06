import { metrics, trace, type Attributes } from "@opentelemetry/api";

const meter = metrics.getMeter("jurivana-server");
const requestCounter = meter.createCounter("http.server.requests");
const requestDuration = meter.createHistogram("http.server.request.duration", {
  unit: "s",
});
const errorCounter = meter.createCounter("http.server.errors");
const auditCounter = meter.createCounter("application.audit.events");
const startupCounter = meter.createCounter("application.startup.events");
const emailCounter = meter.createCounter("application.email.deliveries");
const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const requestTotals = new Map<string, number>();
const requestDurations = new Map<string, {
  count: number;
  sum: number;
  buckets: number[];
}>();
const errorTotals = new Map<string, number>();
const auditTotals = new Map<string, number>();
const startupTotals = new Map<string, number>();
const emailTotals = new Map<string, number>();

const routeTemplates = new Set([
  "/",
  "/health",
  "/healthz",
  "/liveness",
  "/ready",
  "/api/contact",
  "/api/leads",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/crm",
  "/api/documents",
]);

export function routeTemplate(pathname: string): string {
  if (routeTemplates.has(pathname)) return pathname;
  return pathname.startsWith("/api/") ? "/api/*" : "/static/*";
}

function increment(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

export function recordHttpRequest(
  methodValue: string | undefined,
  pathname: string,
  statusCode: number,
  durationSeconds: number,
): void {
  const method = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    .includes(methodValue ?? "")
    ? methodValue!
    : "OTHER";
  const route = routeTemplate(pathname);
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  const key = `${method}\t${route}\t${statusClass}`;
  increment(requestTotals, key);
  const stats = requestDurations.get(key) ?? {
    count: 0,
    sum: 0,
    buckets: durationBuckets.map(() => 0),
  };
  stats.count += 1;
  stats.sum += durationSeconds;
  durationBuckets.forEach((bucket, index) => {
    if (durationSeconds <= bucket) stats.buckets[index] += 1;
  });
  requestDurations.set(key, stats);

  const attributes: Attributes = {
    method,
    route,
    status_class: statusClass,
  };
  requestCounter.add(1, attributes);
  requestDuration.record(durationSeconds, attributes);
  if (statusCode >= 500) {
    increment(errorTotals, statusClass);
    errorCounter.add(1, { status_class: statusClass });
  }
}

export function recordAuditEvent(action: string): void {
  const allowed = new Set([
    "document.upload.initiated",
    "document.scan.rejected",
    "document.upload.completed",
    "document.cleanup.deleted",
    "crm.create",
    "crm.update",
  ]);
  const label = allowed.has(action) ? action : "other";
  increment(auditTotals, label);
  auditCounter.add(1, { action: label });
}

export function recordStartup(outcome: "started" | "error"): void {
  increment(startupTotals, outcome);
  startupCounter.add(1, { outcome });
}

export function recordEmailDelivery(
  provider: string,
  outcome: "success" | "failure",
): void {
  const name = ["custom", "microsoft365", "google-workspace", "zoho"]
    .includes(provider)
    ? provider
    : "other";
  increment(emailTotals, `${name}\t${outcome}`);
  emailCounter.add(1, { provider: name, outcome });
}

export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: level,
    service: "jurivana",
    environment: process.env.NODE_ENV ?? "development",
    traceId: trace.getActiveSpan()?.spanContext().traceId,
    event,
    ...fields,
  });
  console[level](entry);
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export function renderPrometheusMetrics(): string {
  const lines = [
    "# HELP http_server_requests_total Total HTTP requests by bounded route and status class.",
    "# TYPE http_server_requests_total counter",
  ];
  for (const [key, count] of requestTotals) {
    const [method, route, statusClass] = key.split("\t");
    lines.push(
      `http_server_requests_total{method="${method}",route="${escapeLabel(route)}",status_class="${statusClass}"} ${count}`,
    );
  }
  lines.push(
    "# HELP http_server_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE http_server_request_duration_seconds histogram",
  );
  for (const [key, stats] of requestDurations) {
    const [method, route, statusClass] = key.split("\t");
    const labels = `method="${method}",route="${escapeLabel(route)}",status_class="${statusClass}"`;
    durationBuckets.forEach((bucket, index) => {
      lines.push(
        `http_server_request_duration_seconds_bucket{${labels},le="${bucket}"} ${stats.buckets[index]}`,
      );
    });
    lines.push(
      `http_server_request_duration_seconds_bucket{${labels},le="+Inf"} ${stats.count}`,
      `http_server_request_duration_seconds_sum{${labels}} ${stats.sum}`,
      `http_server_request_duration_seconds_count{${labels}} ${stats.count}`,
    );
  }
  lines.push(
    "# HELP http_server_errors_total Total HTTP 5xx responses.",
    "# TYPE http_server_errors_total counter",
  );
  for (const [statusClass, count] of errorTotals) {
    lines.push(`http_server_errors_total{status_class="${statusClass}"} ${count}`);
  }
  lines.push(
    "# HELP application_audit_events_total Persisted audit events by action class.",
    "# TYPE application_audit_events_total counter",
  );
  for (const [action, count] of auditTotals) {
    lines.push(`application_audit_events_total{action="${action}"} ${count}`);
  }
  lines.push(
    "# HELP application_startup_events_total Application startup events.",
    "# TYPE application_startup_events_total counter",
  );
  for (const [outcome, count] of startupTotals) {
    lines.push(`application_startup_events_total{outcome="${outcome}"} ${count}`);
  }
  lines.push(
    "# HELP application_email_deliveries_total Email delivery attempts by provider and outcome.",
    "# TYPE application_email_deliveries_total counter",
  );
  for (const [key, count] of emailTotals) {
    const [provider, outcome] = key.split("\t");
    lines.push(`application_email_deliveries_total{provider="${provider}",outcome="${outcome}"} ${count}`);
  }
  return `${lines.join("\n")}\n`;
}
