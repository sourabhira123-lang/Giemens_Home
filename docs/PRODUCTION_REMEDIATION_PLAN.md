# Jurivana production remediation plan

**Company:** GIEMENS Technology Pvt Ltd
**Product:** Jurivana
**Assessment date:** 2026-11-07
**Decision:** **NOT READY FOR PRODUCTION**

> The dated implementation notes below are superseded for current release
> evidence by [GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md) and
> [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md), including the verified
> local seed and the latest migration ownership failure.

## Executive readiness summary

The existing Vite, React, TypeScript, Node.js, PostgreSQL, Prisma, Docker, and
Azure Bicep architecture is retained. The remediation implements seed input
validation and ignored env generation, SMTP abstraction, health/readiness
checks, optional OTLP and Prometheus metrics, JSON request logs, and a
fail-closed ClamAV upload workflow with bounded cleanup. PostgreSQL/Blob backup
scripts and operator runbooks have also been added.

Scores use the repository's existing 0-5 evidence scale: 0 = absent,
1 = materially blocked, 2 = partially implemented, 3 = implemented but
operationally unverified, 4 = staging-validated, 5 = production-tested with
recurring evidence. The overall score is a readiness judgment, not a weighted
compliance rating.

| Area | Score | Current evidence and remaining gap |
|---|---:|---|
| Current overall readiness | **2/5** | Important controls are implemented, but required live services, credentials, migrations, deployment, and restore drills are not all verified. |
| Database | **2/5** | User-provided baseline reports a verified PostgreSQL schema and migrations; this change adds a required document-status/`updated_at` migration and the current database could not be revalidated from this workspace. Seed and admin verification remain pending. |
| Docker | **1/5** | Both generated Compose configurations validate. Docker Desktop is installed, but its Linux engine pipe is unavailable, so no image build or container startup was verified. |
| Azure | **1/5** | Bicep source is present and updated, but `az` is unavailable; Bicep compilation, deployment, identity, Container Apps, and Blob access are unverified. |
| Security | **2/5** | Existing session/RBAC, origin checks, CSP/security headers, rate limits, validation, audit writes, and private Blob access remain. The new scanner/migration is not live; secret-store policies and production ingress still need validation. Both npm audits report four high-severity findings in the production graph through Prisma CLI/config; no non-breaking automatic fix is available. |
| SMTP | **2/5** | SMTP providers, retry logic, configuration validation, and an active health-check command are implemented and unit-tested; real provider authentication/delivery has not been tested. |
| Observability | **2/5** | Optional OTLP HTTP/Prisma instrumentation, JSON request logs, protected Prometheus metrics, and low-cardinality request/error/audit/startup/email metrics are implemented. Collector, Prometheus, Grafana, Loki, alert rules, retention, and export are not deployed/verified. |
| Backup and recovery | **2/5** | PostgreSQL/Blob backup and isolated restore scripts plus a guide exist. No backup schedule, protected destination, restore drill, or measured RPO/RTO has been verified. |

### Top 10 remaining go-live tasks

1. Replace all example values in the ignored production environment file with
   approved database, SMTP, Redis, Blob, scanner, public-origin, and secret-store
   values.
2. Restore Docker Desktop's Linux engine and verify the image build, container
   startup, health probes, and graceful shutdown.
3. Apply and verify migration
   `20261107000000_document_malware_status` against the intended database.
4. Run the seed once with an approved bootstrap password, then verify the four
   roles and the password-backed `SUPER_ADMIN` without printing the password.
5. Deploy a private ClamAV service, validate its network policy/signature
   updates, and test clean, infected, timeout, and cleanup paths.
6. Validate SMTP credentials and deliver a controlled test message for the
   selected Microsoft 365, Google Workspace, or Zoho tenant.
7. Install/login to Azure CLI, compile and validate Bicep, deploy to a
   non-production resource group, and verify managed identity and Blob access.
8. Configure an authenticated OpenTelemetry Collector plus Prometheus, Grafana,
   and Loki/compatible backends; validate dashboards, redaction, and alerts.
9. Schedule encrypted PostgreSQL and Blob backups in separate failure domains;
   complete isolated restore drills and approve RPO/RTO/retention.
10. Complete production ingress/TLS, secret-store, least-privilege, CSRF/RBAC,
    security-header, rate-limit, dependency-advisory triage, migration,
    smoke-test, rollback, and on-call sign-offs.

## Blocker 1 — Seed configuration, roles, and bootstrap administrator

1. **Root cause:** `ADMIN_PASSWORD` was absent/invalid. The original seed
   validates the password before any database work; rerunning the seed also
   resets the configured administrator password and revokes that user's
   sessions.
2. **Current status:** Seed configuration now validates UTF-8 byte length,
   rejects empty/common placeholder values, and normalizes/validates email and
   name. `npm run env:generate` creates ignored local files with fresh random
   admin/rate-limit/metrics secrets. Seed execution and database row verification
   are **not complete** because the generated database URL is intentionally a
   placeholder and the new migration is not applied.
3. **Exact files:** `prisma/seed.ts`, `server/seed-config.ts`,
   `tests/seed-config.test.ts`, `scripts/generate-env.mjs`, `package.json`,
   `.env.example`.
4. **Exact code changes:** The seed calls `readAdminSeedConfig()` before hashing
   or database access; password rules are 12-128 UTF-8 bytes and reject
   blank/common placeholder values. `seed:development` loads the ignored
   `.env.development` file. No default password is committed.
5. **Environment variables:** `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_NAME`,
   `ADMIN_PASSWORD`. The generated admin password is local-only; set a unique
   production secret using the platform secret store instead.
6. **Validation commands:**

   ```powershell
   npm run env:generate
   npm run typecheck
   npm test
   # After setting real local database credentials and applying migrations:
   npm run seed:development
   npm run db:verify
   ```

7. **Expected output:** Seed output is `Seeded 4 roles and the configured local
   administrator.` For row verification, use a protected psql session:

   ```bash
   source scripts/db-common.sh
   db_load_connection
   db_psql -c "SELECT name FROM giemens_crm.roles ORDER BY name;"
   db_psql -c "SELECT u.email, u.name, r.name AS role, (u.password_hash IS NOT NULL) AS has_password FROM giemens_crm.users u JOIN giemens_crm.roles r ON r.id = u.role_id WHERE r.name = 'SUPER_ADMIN';"
   ```

   Expected roles: `ADMIN`, `EMPLOYEE`, `MANAGER`, `SUPER_ADMIN`; expected
   admin query: one configured administrator with `role = SUPER_ADMIN` and
   `has_password = true`. Do not select or print `password_hash`.
8. **Rollback:** Do not roll back by deleting the administrator. To restore a
   previous bootstrap credential, use an approved password-reset operation and
   revoke existing sessions. Do not run `prisma migrate reset` in production.
9. **Production impact:** Until this passes, no initial administrator exists
   for CRM/Jurivana operations, or its credential may not be the approved one.
10. **Readiness improvement:** A repeatable, testable seed preflight and a
   cryptographically random local bootstrap password remove the known
   configuration failure without embedding a shared credential.

## Blocker 2 — Environment files and Compose validation

1. **Root cause:** Compose requires public origin, database, auth secret,
   storage, SMTP, and Upstash values; the root `.env` did not contain the
   required Compose values.
2. **Current status:** `npm run env:generate` created ignored
   `.env.development` and `.env.production` files. Both Compose configurations
   passed `docker compose --env-file <file> config --quiet`. Generated files
   contain random local secrets but deliberately contain example endpoints and
   `REPLACE_*` provider/database values; they are not deployable secrets and
   application startup rejects placeholder values.
3. **Exact files:** `.env.example`, ignored `.env.development`,
   ignored `.env.production`, `scripts/generate-env.mjs`,
   `scripts/validate-runtime-env.mjs`, `docker-compose.yml`,
   `scripts/validate-env.mjs`.
4. **Exact code changes:** Added one-shot generation that refuses overwrites,
   32-byte random secrets, SMTP provider selection, ClamAV/retention settings,
   and OTLP/metrics settings. Runtime validation rejects placeholder values.
5. **Environment variables:** `VITE_SITE_URL`, `VITE_JURIVANA_URL`,
   `VITE_CONTACT_ENDPOINT`,
   `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`,
   `AUTH_RATE_LIMIT_SECRET`, `METRICS_AUTH_TOKEN`, `SMTP_PROVIDER`, `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `CONTACT_TO_EMAIL`,
   `CONTACT_FROM_EMAIL`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `AZURE_STORAGE_ACCOUNT_URL`,
   `AZURE_STORAGE_CONTAINER`, `CLAMAV_HOST`, `CLAMAV_PORT`,
   `DOCUMENT_PENDING_RETENTION_HOURS`,
   `DOCUMENT_REJECTED_RETENTION_DAYS`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_HEADERS`, and `TRUST_PROXY_HOPS`.
6. **Validation commands:**

   ```powershell
   npm run env:generate
   docker compose --env-file .env.development config --quiet
   docker compose --env-file .env.production config --quiet
   ```

7. **Expected output:** Both config commands exit 0 with no output. `npm start` must reject example
   URLs/credentials until replaced; only Compose interpolation, not service
   connectivity, is validated here.
8. **Rollback:** Keep the ignored files for local recovery or remove only those
   two named files after confirming they contain no user changes. To roll back
   code, revert the environment generator and compose changes; never copy
   generated local secret values into Git.
9. **Production impact:** Incomplete values prevent container configuration or
   startup; example endpoints must never be treated as production services.
10. **Readiness improvement:** Compose variable omissions are surfaced during
   config validation; secret placeholders are no longer accepted at runtime.

## Blocker 3 — Docker Desktop Linux engine and startup

1. **Root cause:** Docker CLI and Compose are installed, but the Linux daemon
   named pipe `dockerDesktopLinuxEngine` does not exist. WSL reports no
   installed Linux distributions, so Docker engine readiness and distro
   integration are unverified.
2. **Current status:** Compose config validation passes for both local env
   files. `docker info` and `docker compose build` fail to connect. WSL reports
   no installed distributions. Container startup, network reachability, and
   application health probes could not be run.
3. **Exact files:** `Dockerfile`, `docker-compose.yml`,
   `.dockerignore`, `docs/deployment.md`.
4. **Exact code changes:** Existing multi-stage Node 22 image/non-root runtime
   remains; cleanup and email health scripts are copied into the runtime image.
   No Docker engine setting can be changed safely from this workspace.
5. **Environment variables:** Use the complete Blocker 2 set; replace
   `VITE_SITE_URL`, `VITE_JURIVANA_URL`, `DATABASE_URL`, SMTP/Redis/Blob/ClamAV values, and
   `AUTH_RATE_LIMIT_SECRET` with valid environment-specific values.
6. **Validation commands (Windows PowerShell):**

   ```powershell
   wsl --status
   wsl --list --verbose
   wsl --update
   wsl --set-default-version 2
   wsl --install -d Ubuntu
   docker context ls
   docker context use desktop-linux
   docker info --format '{{.OSType}}'
   ```

   Complete the requested WSL reboot/restart, then enable the installed
   distribution in Docker Desktop. In **Settings → General**, select the WSL 2
   engine; in
   **Settings → Resources → WSL Integration**, enable the intended Linux
   distribution; apply/restart and select **Switch to Linux containers** if
   Docker reports Windows containers. Then run:

   ```powershell
   docker compose --env-file .env.development config --quiet
   docker compose --env-file .env.development build
   docker compose --env-file .env.development up -d
   docker compose --env-file .env.development ps
   Invoke-WebRequest http://localhost:3000/liveness
   Invoke-WebRequest http://localhost:3000/ready
   docker compose --env-file .env.development logs --tail 100 giemens
   ```

7. **Expected output:** `docker info` prints `linux`; build succeeds; container
   is running; `/liveness` is HTTP 200
   with `ok`; `/ready` is HTTP 200 with `ready` only when PostgreSQL, SMTP,
   Blob, Redis and ClamAV are reachable. Verify graceful stop with
   `docker compose down` after the
   smoke test.
8. **Rollback:** `docker compose down`; restore the previously deployed image
   digest. Do not prune volumes or images as part of rollback.
9. **Production impact:** No release image can be certified until build/start
   and health probes pass on a working Linux engine.
10. **Readiness improvement:** The container remains non-root, uses a
   liveness-only Docker health check, and requires database, SMTP, Blob,
   Redis, and scanner checks at startup and readiness.

## Blocker 4 — Health, readiness, liveness, and dependency checks

1. **Root cause:** Health routes existed, but production readiness did not
   validate all required external service dependencies.
2. **Current status:** `/health`, `/healthz`, `/liveness`, and `/ready` are
   implemented. Startup and `/ready` now check PostgreSQL, SMTP, Azure Blob
   container access, Upstash Redis and ClamAV. Unit tests cover readiness
   orchestration and HTTP response behavior. Live service probes remain
   unverified.
3. **Exact files:** `server/http.ts`, `server/readiness.ts`,
   `server/clamav.ts`, `server/azure-blob-storage.ts`,
   `scripts/validate-runtime-env.mjs`, `Dockerfile`,
   `infra/azure/main.bicep`, `tests/http.test.ts`,
   `tests/readiness.test.ts`.
4. **Exact code changes:** Health routes run before API body parsing;
   liveness does not depend on external services; startup exits nonzero when
   any required dependency check fails; readiness returns only `ready`/
   `not ready` and HTTP 200/503. Logs identify failed dependency names but do
   not include provider error details or secrets.
5. **Environment variables:** `DATABASE_URL`, `SMTP_PROVIDER`, `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `AZURE_STORAGE_ACCOUNT_URL`,
   `AZURE_STORAGE_CONTAINER`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `CLAMAV_HOST`, `CLAMAV_PORT`, `PORT`, `HOST`,
   `TRUST_PROXY_HOPS`.
6. **Validation commands:**

   ```powershell
   npm test
   Invoke-WebRequest http://localhost:3000/health
   Invoke-WebRequest http://localhost:3000/liveness
   Invoke-WebRequest http://localhost:3000/ready
   ```

7. **Expected output:** Unit/integration tests pass. `/health` and `/liveness`
   return `200 ok`; `/ready` returns `200 ready` only when all five
   dependencies are healthy or `503 not ready` otherwise. Startup validates
   them before binding the listener.
8. **Rollback:** Revert the `/ready` ClamAV dependency only if document uploads
   are disabled before traffic is directed to the reverted release. Keep
   liveness independent of dependency outages.
9. **Production impact:** An unavailable database or scanner keeps instances
   out of traffic; this prevents unsafe uploads but can reduce availability
   until dependencies recover.
10. **Readiness improvement:** Platform probes distinguish process health from
   required dependency health and prevent clean-status documents from bypassing
   scanning.

## Blocker 5 — Azure CLI, Bicep, Container Apps, identity, and Blob

1. **Root cause:** Azure CLI is not installed (`az` is unavailable), so Azure
   login, Bicep compilation, remote validation, deployment, managed identity,
   and Blob authorization have not been tested.
2. **Current status:** Bicep source includes Container Apps, the existing
   managed identity, private Blob configuration, health probes, secure app
   secrets, ClamAV host, SMTP provider, metrics token, and optional OTLP
   endpoint. No Azure resource deployment or permission test was performed.
3. **Exact files:** `infra/azure/main.bicep`, `infra/azure/README.md`,
   `docs/deployment.md`.
4. **Exact code changes:** Added `metricsAuthToken`, SMTP provider selection,
   ClamAV host/port, document cleanup settings, and optional collector endpoint
   to Container Apps configuration. The ClamAV endpoint must be private and
   reachable from the app. A real production parameter file is intentionally
   not generated or committed.
5. **Environment variables/parameters:** `databaseUrl`, `authRateLimitSecret`,
   `metricsAuthToken`, `smtpProvider`, `smtpHost`, `smtpPort`, `smtpUser`,
   `smtpPassword`, `contactToEmail`, `contactFromEmail`, `redisRestUrl`,
   `redisRestToken`, `clamavHost`, `clamavPort`, `otelExporterOtlpEndpoint`,
   `appName`, `storageAccountName`, `logAnalyticsWorkspaceName`,
   `siteOrigin`, `containerRegistryName`, `containerRegistryServer`,
   `containerImage`, `minReplicas`, `maxReplicas`, and `location`.
   Secure parameters must be supplied using protected local/platform secret
   input, not committed JSON.
6. **Validation commands (Windows PowerShell):**

   ```powershell
   winget install --exact --id Microsoft.AzureCLI
   # Open a new PowerShell window after installation.
   az version
   az login --tenant "<tenant-id>"
   az account set --subscription "<subscription-id>"
   az account show --query "{subscription:id,tenant:tenantId,user:user.name}" --output json
   az bicep install
   az bicep version
   az bicep build --file infra\azure\main.bicep --outfile "$env:TEMP\jurivana-template.json"
   az deployment group validate `
     --resource-group "<resource-group>" `
     --template-file infra\azure\main.bicep `
     --parameters "@infra\azure\production.parameters.json"
   ```

   After deployment:

   ```powershell
   az containerapp show --resource-group "<resource-group>" --name "<app-name>" --query "properties.provisioningState" --output tsv
   az containerapp revision list --resource-group "<resource-group>" --name "<app-name>" --output table
   az containerapp logs show --resource-group "<resource-group>" --name "<app-name>" --follow false
   az containerapp identity show --resource-group "<resource-group>" --name "<app-name>" --output json
   az role assignment list --assignee "<managed-identity-principal-id>" --all --output table
   az storage container show --auth-mode login --account-name "<storage-account>" --name documents --query "properties.publicAccess" --output tsv
   az storage blob list --auth-mode login --account-name "<storage-account>" --container-name documents --output table
   ```

7. **Expected output:** Account output identifies the intended tenant/subscription;
   Bicep build succeeds; deployment validation reports `provisioningState:
   Succeeded`; the parameter file is protected and ignored. After deployment,
   the active revision is healthy; identity is assigned; scoped
   `AcrPull`, `Storage Blob Data Contributor`, and `Storage Blob Delegator`
   assignments exist; container public access is `None`; authorized identity
   can list only intended objects.
8. **Rollback:** Use a prior known-good Container Apps revision/image. Revert
   Bicep with a reviewed deployment; do not delete the storage account,
   container, identity, or data during rollback. Preserve secrets in the
   platform store.
9. **Production impact:** Without Azure CLI/Bicep validation, Azure deployment
   and identity/storage behavior are unproven; there is no Azure production
   sign-off.
10. **Readiness improvement:** Template now carries the app's required
   scanner/observability settings and keeps credentials in Container App
   secrets, but runtime identity still requires live authorization tests.

## Blocker 6 — SMTP foundation and provider validation

1. **Root cause:** Contact email used a direct Nodemailer transport without a
   provider abstraction, retry classification, or runnable provider
   connectivity check.
2. **Current status:** `EmailProvider`, `EmailService`, `EmailHealthCheck`,
   bounded retries for known transient errors, provider defaults, and
   startup configuration validation are implemented. Unit tests pass. No
   external SMTP credentials, delivery, sender alignment, or provider tenant
   policy were tested.
3. **Exact files:** `server/email-service.ts`, `api/contact.ts`,
   `scripts/check-email.ts`, `scripts/validate-runtime-env.mjs`,
   `scripts/validate-env.mjs`, `tests/email-service.test.ts`,
   `docker-compose.yml`, `infra/azure/main.bicep`.
4. **Exact code changes:** Providers support `custom`, `microsoft365`
   (`smtp.office365.com`), `google-workspace` (`smtp.gmail.com`), and `zoho`
   (`smtp.zoho.com`) with host override. Port 465 uses TLS; otherwise Nodemailer
   uses authenticated SMTP with connection timeouts. Retry is bounded to three
   attempts and only retries known transient network/SMTP 4xx failures.
   Permanent authentication/content errors are surfaced without retry.
5. **Environment variables:** `SMTP_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASSWORD`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`.
   Store provider credentials in Azure Container App secrets or the selected
   platform secret store. Microsoft 365 SMTP AUTH, Google Workspace app
   password/policy, and Zoho app-password settings are tenant-specific.
6. **Validation commands:**

   ```powershell
   npm test
   # From an environment with the real provider credentials:
   npm run email:health
   ```

7. **Expected output:** Tests cover provider defaults, retry/non-retry, and error propagation.
   Expected live check is a JSON `email.health_check.passed` event. Then send
   one approved test inquiry and confirm only the intended recipient received
   it. No delivery should be claimed until this passes.
8. **Rollback:** Restore the last tested SMTP secret/provider configuration or
   previous app image. Do not fall back to writing email credentials or message
   bodies to logs.
9. **Production impact:** Contact inquiries fail with a safe 502 if delivery
   fails; app startup fails fast on malformed/missing SMTP configuration, but
   does not require the mail provider to be online at process start.
10. **Readiness improvement:** Provider configuration is explicit, retry
   behavior is bounded, delivery outcomes are metered, and operations can
   validate connectivity without sending a message.

## Blocker 7 — OpenTelemetry and operational observability

1. **Root cause:** The prior app had basic console logging but no OpenTelemetry
   SDK, low-cardinality metrics, authenticated scrape endpoint, or
   application-level traces.
2. **Current status:** SDK dependencies, HTTP/Prisma instrumentation, optional
   OTLP/HTTP export, JSON logs, request/error/audit/startup/email metrics, and
   token-protected Prometheus scrape output are implemented. Typecheck and HTTP
   tests pass. No collector, Prometheus/Grafana/Loki backend, alert, or export
   validation was completed.
3. **Exact files:** `server/instrumentation.ts`,
   `server/observability.ts`, `server/http.ts`, `api/contact.ts`,
   `api/crm.ts`, `api/documents.ts`, `package.json`, `package-lock.json`,
   `docker-compose.yml`, `infra/azure/main.bicep`,
   `docs/monitoring-guide.md`.
4. **Exact code changes:** NodeSDK starts before the HTTP server when
   `OTEL_EXPORTER_OTLP_ENDPOINT` is configured; HTTP and Prisma
   instrumentation export traces and metrics. Request labels are restricted
   to method, route template, and status class. Logs include request ID,
   route template, duration, severity, environment, and trace ID when present.
   `/metrics` is hidden without a 32-byte token and uses constant-time bearer
   comparison. Metrics counters are in-process and reset on restart.
5. **Environment variables:** `OTEL_EXPORTER_OTLP_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
   `METRICS_AUTH_TOKEN`, `NODE_ENV`. Keep credentials in protected
   configuration. Collector endpoint must be private/authenticated as
   appropriate.
6. **Validation commands:**

   ```powershell
   npm run typecheck
   npm test
   # Configure METRICS_AUTH_TOKEN in the running process:
   Invoke-WebRequest -Headers @{ Authorization = "Bearer $env:METRICS_AUTH_TOKEN" } http://localhost:3000/metrics
   ```

7. **Expected output:** `/metrics` returns Prometheus text types for
   `http_server_requests_total`, `http_server_request_duration_seconds`,
   `http_server_errors_total`, `application_audit_events_total`,
   `application_startup_events_total`, and
   `application_email_deliveries_total`. No token returns 404. OTLP validation
   requires a reachable test collector and exported HTTP/Prisma spans.
8. **Rollback:** Remove/clear the OTLP endpoint to stop export; keep request
   logs and local metrics available. Revert instrumentation dependencies only
   with a tested prior image. Do not make readiness depend on the collector.
9. **Production impact:** Local logs and protected metrics are available, but
   there is no centralized retention/alerting until the collector and backend
   are provisioned.
10. **Readiness improvement:** The app now emits correlated structured request
   events and instrumented telemetry without binding instrumentation to Azure.

## Blocker 8 — Malware scanning, quarantine, and cleanup

1. **Root cause:** Upload completion previously set `READY` after signature,
   size, and checksum checks only. There was no malware scan or abandoned
   upload/rejected file cleanup.
2. **Current status:** Uploads remain private and inaccessible while
   `PENDING_UPLOAD`; ClamAV INSTREAM scanning is fail-closed; clean files become
   `READY`, detections become `REJECTED`, and stale objects enter `EXPIRING`
   before deletion. A bounded cleanup script and audit records are implemented.
   Scanner deployment, new migration, actual malware-test file, and scheduled
   job are **not yet validated**.
3. **Exact files:** `server/clamav.ts`, `server/azure-blob-storage.ts`,
   `api/documents.ts`, `prisma/schema.prisma`,
   `prisma/migrations/20261107000000_document_malware_status/migration.sql`,
   `scripts/cleanup-documents.ts`, `package.json`, `docker-compose.yml`,
   `infra/azure/main.bicep`, `docs/backup-guide.md`.
4. **Exact code changes:** ClamAV streams the verified private Blob object
   without buffering the whole file. Scanner connection, timeout, protocol, and
   size-limit errors return 503 and do not mark a document `READY`. A detection
   is recorded as `REJECTED` and is never listed or given a SAS download link.
   Cleanup transitions eligible old records to `EXPIRING`, deletes the Blob
   idempotently, then deletes metadata and records the audit event. The
   database migration adds `REJECTED`, `EXPIRING`, and `documents.updated_at`.
5. **Environment variables:** `CLAMAV_HOST`, `CLAMAV_PORT`,
   `DOCUMENT_PENDING_RETENTION_HOURS` (1-168, default 24),
   `DOCUMENT_REJECTED_RETENTION_DAYS` (1-3650, default 30),
   `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER`, `DATABASE_URL`.
   ClamAV must be private, patched, signature-updated, network-restricted, and
   sized for 20 MB file scans/concurrency.
6. **Validation commands:**

   ```powershell
   npm run prisma:validate
   npm run prisma:generate
   npm test
   npm run db:deploy
   npm run documents:cleanup
   ```

7. **Expected output:** The test suite verifies INSTREAM framing, clean/infected responses, size
   rejection, and fail-closed API behavior. After a controlled staging upload,
   expected clean result is HTTP 200 and `READY`; infected is HTTP 422 and
   `REJECTED`; unavailable scanner is HTTP 503 and remains unavailable for
   download. Cleanup emits `document.cleanup.completed` and counts examined/
   failed. Do not introduce a live malware sample into production.
8. **Rollback:** Keep the additive migration; do not remove enum values or
   `updated_at`. If scanner service fails, stop new uploads/route traffic or
   restore scanner availability; never restore the former “integrity-only
   means safe” behavior. Roll back application code only after checking no
   `REJECTED`/`EXPIRING` rows need handling.
9. **Production impact:** New uploads cannot complete when scanning is
   unavailable; previously `READY` documents remain accessible. Cleanup must be
   scheduled or abandoned/rejected objects persist.
10. **Readiness improvement:** Untrusted content is gated by a malware decision,
   scanner failures fail closed, rejected data is isolated by status and
   private storage, and cleanup is retryable/audited.

## Blocker 9 — PostgreSQL/Blob backup and disaster recovery

1. **Root cause:** There was no executable database/Blob backup and isolated
   restore workflow, no verified recovery destination, and no restore evidence.
2. **Current status:** `backup-guide.md` now documents objectives and
   operations; scripts perform PostgreSQL custom-format backup/checksum,
   explicitly guarded isolated restore, and identity-authenticated Blob copy
   backup/restore. No schedule, backup execution, Blob protection setting, or
   restore drill has been verified. RPO/RTO remain proposals.
3. **Exact files:** `scripts/backup-postgres.sh`,
   `scripts/restore-postgres.sh`, `scripts/backup-blob.sh`,
   `scripts/restore-blob.sh`, `scripts/db-common.sh`,
   `docs/backup-guide.md`, `.github/workflows/ci.yml`.
4. **Exact code changes:** Database backups use custom `pg_dump`, mode 0600,
   schema scope `giemens_crm`, and SHA-256 sidecars. Restore requires the
   explicit target `giemens_restore_drill`, checks the digest and dump, and
   refuses other database names. Blob copy scripts require explicit
   destination confirmation, Microsoft Entra managed-identity login, and
   non-overwrite copy. Neither script stores credentials in arguments.
5. **Environment variables:** PostgreSQL backup:
   `BACKUP_DIRECTORY` plus protected root `.env` `DATABASE_URL`. Restore:
   `BACKUP_FILE`, `RESTORE_CONFIRM_DATABASE`, `PGHOST`, `PGPORT`, `PGDATABASE`,
   `PGUSER`, protected `PGPASSWORD`/passfile. Blob backup:
   `BLOB_SOURCE_URL`, `BLOB_BACKUP_ROOT`, `BLOB_BACKUP_CONFIRM_ROOT`. Restore:
   `BLOB_BACKUP_URL`, `BLOB_RESTORE_DESTINATION`,
   `BLOB_RESTORE_CONFIRM_DESTINATION`.
6. **Validation commands:**

   ```bash
   bash -n scripts/backup-postgres.sh scripts/restore-postgres.sh scripts/backup-blob.sh scripts/restore-blob.sh
   export BACKUP_DIRECTORY=/secure-backup/giemens/postgres
   bash scripts/backup-postgres.sh
   ```

7. **Expected output:** A private `.dump` plus `.sha256`; restore output names only the
   isolated database; Blob scripts report copied destination. Full validation
   requires a separately approved test database, storage account, and actual
   restore verification/checksum reconciliation. Proposed objectives are
   PostgreSQL RPO 15 minutes with WAL archiving (24 hours with daily logical
   backup only), RTO 4 hours; Blob RPO 1 hour with point-in-time protection
   (24 hours with daily copy only), RTO 8 hours. These are not achieved
   commitments.
8. **Rollback:** Stop a failed backup/restore job and preserve logs; do not
   restore over production. Recover to an isolated environment, verify
   checksums/permissions, and only then approve traffic. Keep existing backup
   points until two-operator validation.
9. **Production impact:** Without configured backup destinations and tested
   restores, data loss/recovery time is unknown. Blob versioning/soft delete
   and database PITR are not enabled by these scripts.
10. **Readiness improvement:** Repeatable, least-disclosure backup/restore
   procedures now exist and prevent accidental restore to a non-drill database
   name.

## Blocker 10 — Production hardening and middleware order

1. **Root cause:** Some hardening already existed in the custom Node HTTP
   server, but there was no unified documented processing order or evidence
   that all route policies were tested at the production ingress.
2. **Current status:** Secure session cookies, RBAC, same-origin mutation
   checks, CSP/security headers, bounded body parsing, request validation,
   route-specific rate limits, database audit writes, runtime secret
   validation, safe errors, and protected metrics are present. A standalone
   `helmet` package is not used because the application uses the existing
   built-in Node HTTP server rather than Express; the existing header middleware
   supplies the required policy. Production proxy, TLS, secret-store, CSP
   browser compatibility, and full endpoint coverage remain unverified.
   `npm audit` and `npm audit --omit=dev` each report four high-severity
   findings in the installed production dependency graph:
   `@prisma/client` → `prisma@6.19.0` → `@prisma/config` → `deepmerge-ts@7.1.5`
   and `effect@3.18.4`. The suggested automatic fix requires a breaking
   Prisma 7 upgrade; it was not applied. This remains a release blocker until
   a supported remediation is tested or an explicitly approved risk exception
   is documented.
3. **Exact files:** `server/http.ts`, `api/auth/*.ts`, `api/contact.ts`,
   `api/leads.ts`, `api/crm.ts`, `api/documents.ts`, `server/auth.ts`,
   `scripts/validate-runtime-env.mjs`, `docker-compose.yml`,
   `infra/azure/main.bicep`, `package.json`, `package-lock.json`.
4. **Exact code changes and middleware/request order:** The existing Node
   pipeline applies:
   (1) request ID, security headers, timing/structured logging; (2) liveness,
   readiness, and protected metrics routes; (3) API request body size cap and
   body read; (4) route dispatch; (5) handler method/content-type and
   same-origin/CSRF checks for mutations; (6) input validation; (7) session
   authentication and role authorization where required; (8) route-specific
   Upstash/DB rate limit; (9) service/database transaction; (10) audit write;
   (11) safe status/error mapping. Static GET/HEAD requests use the same
   response security headers. Liveness does not invoke database/scanner.
5. **Environment variables:** `NODE_ENV`, `DATABASE_URL`,
   `AUTH_RATE_LIMIT_SECRET`, `METRICS_AUTH_TOKEN`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `TRUST_PROXY_HOPS`,
   `OTEL_EXPORTER_OTLP_HEADERS`, and platform secret references for SMTP/Blob.
   Only set `TRUST_PROXY_HOPS` when the origin is inaccessible except through
   the trusted proxy chain.
6. **Validation commands:**

   ```powershell
   npm run typecheck
   npm test
   npm run build
   npm run start
   npm audit
   npm audit --omit=dev
   ```

7. **Expected output:** CSP and security headers on API/static/health
   responses; mutation requests with a wrong origin return 403; unauthenticated
   protected CRM and document routes return 401; invalid payloads return 400;
   oversized bodies return 413; rate-limited requests return 429; secrets and
   raw exception messages never appear in responses/logs. Start requires valid
   non-placeholder configuration; readiness requires PostgreSQL, SMTP, Blob,
   Redis and ClamAV.
   Production dependency audit must have no unresolved high/critical findings,
   or an approved, documented risk exception with verified runtime reachability.
8. **Rollback:** Revert the specific application release to a known-good image.
   Do not disable CSRF, secure cookies, rate limiting, CSP, or scanner
   enforcement as an emergency workaround. If CSP blocks a required existing
   asset, change only its approved directive and retest.
9. **Production impact:** Misconfigured proxy trust can corrupt client IP
   decisions; bad SMTP/Redis/Blob/DB secrets break the associated route;
   untrusted origins are rejected. Header or endpoint configuration changes
   must be validated against existing journeys.
10. **Readiness improvement:** The existing security pipeline is explicit and
   tested at boundaries; the remaining work is production-environment
   validation, not a technology or architecture redesign.

## Go-live checklist

- [ ] Replace generated example endpoints and `REPLACE_*` values in the
      ignored production environment/secret store.
- [ ] Confirm intended database host/schema, least-privilege role, TLS, current
      backup, migration status, and new migration applied.
- [ ] Run seed once with approved credentials; verify four roles and exactly the
      intended bootstrap admin; keep password in an approved secret manager.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, Compose config/build,
      container start/stop, and `/health`/`/ready` probes pass.
- [ ] ClamAV is private, reachable, signature-current, resource-tested, and
      clean/infected/unavailable/cleanup cases pass in staging.
- [ ] SMTP provider login, sender authorization, delivery, and health check
      pass for the selected tenant.
- [ ] Azure CLI tenant/subscription is correct; Bicep compiles/validates;
      Container App revision, managed identity roles, private Blob, registry
      pull, and network paths are verified.
- [ ] OTLP traces/metrics, Prometheus scrape authentication, dashboards,
      alert firing, log redaction, and retention are tested.
- [ ] Database and Blob backups run to protected destinations; isolated restore
      and checksum/data reconciliation drills pass; owner approves measured
      RPO/RTO and retention/legal hold.
- [ ] TLS/custom domain, ingress restrictions, secrets, proxy hop count,
      security headers, RBAC, rate limits, audit retention, rollback image,
      dependency advisories, on-call owner, and incident runbooks are signed
      off.

## Final go/no-go decision

**NOT READY FOR PRODUCTION.**

Remaining release blockers: generated production env values are placeholders;
database seed and the new migration have not been executed/verified; Docker
Desktop's Linux engine and a WSL Linux distribution are unavailable; Azure
CLI/Bicep/deployment/identity/storage validation is unavailable; live SMTP
credentials and delivery are untested; a private ClamAV service and scheduled
cleanup have not been deployed; OTLP collector/Prometheus/Grafana/Loki and
alerts are not deployed; PostgreSQL and Blob backup schedules, retention
settings, and restore drills are unverified; npm audit reports four high
findings in the production dependency graph whose suggested automatic fix
upgrades Prisma to 7; and production TLS, ingress, secret-store, and sign-off
checks are incomplete.
