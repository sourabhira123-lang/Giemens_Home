# Monitoring and observability guide

## Current state

The Node server now has optional OpenTelemetry OTLP tracing/metrics with HTTP
and Prisma instrumentation, JSON request/startup/error logs, bounded-cardinality
request/error/audit/startup/email metrics, and an in-process Prometheus
`/metrics` endpoint. The scrape endpoint is hidden unless a 32-byte
`METRICS_AUTH_TOKEN` is configured and a matching Bearer token is supplied.
In-process Prometheus counters reset on restart; use OTLP export for retained
and cross-replica telemetry. No collector, Prometheus server, Grafana, or Loki
deployment is included or verified. The Bicep template sends platform logs to
Log Analytics, but platform logging alone is not an alerting or tracing setup.

## Portable target

Keep instrumentation vendor-neutral:

1. Instrument the existing Node.js HTTP server and Prisma client with the
   OpenTelemetry JavaScript SDK and HTTP/Prisma instrumentation.
2. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an authenticated, private collector
   endpoint. The application uses OTLP/HTTP; applications should
   know only the collector endpoint, not Azure Monitor, Grafana Cloud, or any
   other backend.
3. Configure the collector to fan out to a Prometheus-compatible metrics
   backend, Loki-compatible log backend, and an OTLP trace backend. Azure
   Monitor/Application Insights may be an additional exporter, not a required
   dependency.
4. Run Grafana dashboards and alert rules against the selected metrics, logs,
   and traces stores. Self-hosted or managed implementations remain deployable
   without changing application instrumentation.

Before enabling exporters, approve a collector endpoint, data residency,
retention, authentication, and egress policy.

## Metrics and SLOs

Instrument low-cardinality metrics. Do not use email addresses, user IDs,
request paths containing IDs, document names, or raw exception messages as
labels.

Implemented in the Node server:

| Metric | Type / labels | Initial alert |
|---|---|---|
| `http_server_requests_total` | Counter: method, route template, status class | 5xx ratio > 2% for 5 minutes |
| `http_server_request_duration_seconds` | Histogram: method, route template, status class | p95 > 1 second for 10 minutes; tune upload/API routes |
| `http_server_errors_total` | Counter: status class | 5xx ratio > 2% for 5 minutes |
| `application_audit_events_total` | Counter: bounded action | Sudden change in audit volume |
| `application_startup_events_total` | Counter: started/error | Unexpected restart loops |
| `application_email_deliveries_total` | Counter: provider/outcome | Delivery failures > 1% over 15 minutes |

OpenTelemetry exports HTTP and Prisma traces/metrics to OTLP when configured.
Database-operation dashboards, auth-failure counters, document workflow-age
gauges, active-request gauges, process resource metrics, and alert rules remain
collector/backend configuration work and are not represented as implemented
application metrics.

Set SLOs with business owners after measuring a representative baseline.
Candidate launch objectives are 99.9% monthly availability for public
read-only pages and 99.5% for authenticated APIs; these are proposals, not
current commitments. Exclude planned maintenance only through a published,
approved policy.

## Logging and tracing

- Emit one JSON object per event with UTC timestamp, severity, service,
  environment, trace ID when available, request ID, route template, status, and
  duration.
- Redact `Cookie`, `Set-Cookie`, `Authorization`, connection strings, passwords,
  tokens, SAS query strings, message bodies, and personal data before export.
- Keep audit events separate from diagnostic logs. Restrict audit-log reads,
  record actor/action/entity/time, and use immutable export/retention controls.
- Propagate W3C `traceparent`; do not accept arbitrary trace baggage as trusted
  identity or authorization data.
- Sample successful traces; retain errors and slow requests with a bounded
  sampling policy.

## Health probes

- `/liveness` and compatibility route `/healthz` indicate only that the HTTP
  process can answer requests. They must not depend on PostgreSQL or Redis.
- Startup and `/ready` check PostgreSQL, SMTP, Azure Blob container access,
  Upstash Redis and private ClamAV TCP reachability. A failure prevents startup
  or returns 503 for readiness; it is not a migration or data-integrity test.
- `/health` is a liveness alias for operators and generic load balancers.
- `/metrics` returns Prometheus text only when `METRICS_AUTH_TOKEN` is set and
  the caller presents the configured Bearer token. Keep it on a private
  scrape network.
- Never return versions, connection details, secrets, or exception messages
  from health endpoints.

## Deployment and validation

1. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the collector base URL. Configure
   `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and
   `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` only when the collector uses different
   paths. Set `OTEL_EXPORTER_OTLP_HEADERS` through protected runtime
   configuration when authentication is required. Do not bake credentials into
   the image.
2. Set `METRICS_AUTH_TOKEN` to a unique random value of at least 32 bytes and
   configure Prometheus to scrape `/metrics` using a protected credential file:

   ```yaml
   scrape_configs:
     - job_name: jurivana
       metrics_path: /metrics
       authorization:
         type: Bearer
         credentials_file: /run/secrets/jurivana-metrics-token
       static_configs:
         - targets: ["jurivana.internal:3000"]
   ```

3. Deploy a collector with authenticated ingress and explicit egress allowlists.
4. Validate traces across an HTTP request and Prisma call; verify metric names,
   alert evaluation, dashboard panels, and log redaction in a non-production
   environment.
5. Simulate collector outage and confirm requests continue while telemetry is
   buffered/dropped according to policy, with bounded memory and no secret
   logging.
6. Document retention, backup, access control, and deletion for all telemetry
   stores before production data is exported.

## Rollback

Disable the exporter or revert its deployment configuration while keeping the
application operational. Do not make application readiness depend on the
telemetry backend. Revert package/configuration changes if they increase
startup latency, memory, or error rates; preserve already-exported incident
evidence according to retention policy.
