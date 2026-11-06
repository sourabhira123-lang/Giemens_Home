# GIEMENS go-live certification

**Certification snapshot:** 2026-11-07
**Decision:** **NO-GO — unresolved release blockers**
**Scope:** Certification of unresolved production gates only. Existing
application features and architecture are not being re-audited here.

## Executive summary

The source-level application checks remain green: TypeScript, production build,
Prisma schema validation, 37 tests, and production dependency audit. The
current environment does **not** certify production deployment:

- Prisma reports **P1000 authentication failure** for `postgres` at
  `127.0.0.1:5432`. Current migration/seed/data state is therefore unknown.
- Docker Compose configuration passes using dummy values, but Docker Engine is
  unavailable; build, startup, `docker ps`, health, and restart behavior cannot
  be certified.
- Azure CLI is unavailable; `az bicep build` and resource deployment remain
  unverified. The current Bicep does not integrate Key Vault.
- Malware scanning, backup/restore drills, production SMTP verification,
  application telemetry/alerts, and Linux distribution certification have no
  operational evidence.

No database write, migration, seed, reset, password recovery, Azure deployment,
or production credential change was performed for this certification.

## Certification scores

Scale: 0 = absent, 1 = blocker confirmed, 2 = static/partial evidence,
3 = implementation present but deployment evidence incomplete, 4 = staging
validated, 5 = production-tested with recurring evidence. Required score is
the minimum for controlled production approval, not a compliance rating.

| Area | Current | Required | Gap | Basis |
|---|---:|---:|---:|---|
| Database | 1/5 | 5/5 | 4 | P1000; no live schema/migration/seed certification |
| Security | 2/5 | 4/5 | 2 | Several source controls exist; ingress and document malware gaps remain |
| Docker | 2/5 | 4/5 | 2 | Compose config passes with dummy values; no Docker engine/build/run evidence |
| Azure | 1/5 | 4/5 | 3 | Bicep source exists; CLI/build/deployment and identity not tested |
| Linux | 1/5 | 3/5 | 2 | Ubuntu CI/container target only; distro runtime tests absent |
| Observability | 1/5 | 3/5 | 2 | Basic logs/platform log destination; no verified app metrics/traces/alerts |
| Backup & DR | 0/5 | 4/5 | 4 | No configured/verified backup or restore evidence |

## Blocker 1 — PostgreSQL authentication and connectivity

**Current status: FAIL.** `npx prisma migrate status --schema=prisma/schema.prisma`
returned P1000 for the configured `postgres` credentials at
`127.0.0.1:5432`. `psql` and `pg_isready` are not available on the current
PATH. This does not establish whether the password, cluster, `pg_hba.conf`,
SSL, database role, or target is the underlying cause.

### Root-cause matrix

| Possible cause | Evidence/diagnostic | PASS | FAIL / fix |
|---|---|---|---|
| Wrong password | `psql` with interactive `-W`; Prisma P1000 | Password authenticates to the confirmed cluster; never print it | Rotate/set via DBA-approved channel and update secret store; URL-encode reserved characters |
| Wrong username | `SELECT current_user`; `DATABASE_URL` username | Expected provisioned application role logs in | Correct username or provision a least-privilege login; do not use `postgres` as the app identity |
| Wrong host/port | `pg_isready -h "$PGHOST" -p "$PGPORT"` and provider endpoint comparison | Correct intended server accepts connections | Correct endpoint, DNS/private DNS, port, or service; verify the listener is the intended cluster |
| Wrong database/schema | `SELECT current_database(), current_schema()`; information schema | Database is `giemens`; application schema is `giemens_crm` | Correct URL/database/schema; do not create a competing schema to bypass mismatch |
| `pg_hba.conf` / role policy | Server-side authentication logs; DBA checks matching HBA rule | Intended host/user/database match an approved `scram-sha-256`/provider rule | Correct the specific server rule; never leave `trust` enabled or widen access publicly |
| SSL mismatch | `sslmode`, `PGSSLMODE`, `pg_stat_ssl` | Remote connection is TLS with verified certificate/hostname | Configure provider CA and `sslmode=verify-full` (or provider-approved verified TLS); do not disable TLS to make login pass |
| Network/firewall | `pg_isready`, DNS, TCP reachability, NSG/firewall and route | App host reaches private DB endpoint on approved port | Allow only app subnet/egress; repair private DNS, route, or firewall; do not expose PostgreSQL publicly |
| Insufficient privileges | `has_database_privilege`, `has_schema_privilege`, table grants | Runtime role has only required connect/schema/table privileges; migration role separate | Grant reviewed least privilege; do not grant superuser/CREATEDB/CREATEROLE to app |
| Connection limit/pool exhaustion | `pg_stat_activity`, server limits, Prisma logs | Peak replicas/pools fit budget with operational headroom | Set a bounded per-instance Prisma pool or approved pooler and capacity-test before release |

### Commands and pass criteria

Run on the actual app host/container environment after setting secrets through
the approved secret manager. On Windows, use the PostgreSQL installation's
`bin` directory for `psql.exe`/`pg_isready.exe`; do not put passwords in
arguments, transcripts, or chat.

```sh
# Check listener only; this does NOT validate credentials.
pg_isready -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER"

# Interactive password prompt when PGPASSWORD/PGPASSFILE are not configured.
psql -X -W "host=$PGHOST port=$PGPORT dbname=$PGDATABASE user=$PGUSER sslmode=$PGSSLMODE" \
  -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_user, current_schema(), current_setting('server_version');"

# Prisma CLI; uses DATABASE_URL and performs a read-only status check.
npx prisma migrate status --schema=prisma/schema.prisma

# Read-only introspection; review its output and do not overwrite the checked-in
# application schema. Use a protected output file if one is needed.
npx prisma db pull --schema=prisma/schema.prisma --print
```

`pg_isready` exit 0 means the server is accepting connections, not that
authentication succeeds. `psql` must report the intended DB, role, and schema;
Prisma status must succeed with all expected migrations applied. `db pull
--print` is inspection only; do not replace `prisma/schema.prisma` with
production introspection output.

From repository root, the added checks are:

```sh
bash scripts/connect-db.sh
bash scripts/db-health.sh
bash scripts/migration-check.sh
bash scripts/verify-db.sh
```

The DB scripts check TLS, Prisma status, 14 app tables, 28 expected indexes,
16 validated foreign keys, the four standard roles, and at least one
password-backed `SUPER_ADMIN`. They do not apply migrations or seed.

### Production impact and closure

- **Evidence required:** Successful authenticated `psql`, confirmed TLS and
  least-privilege grants, Prisma status, connection-budget review, sanitized
  operator evidence tied to the production endpoint.
- **Failure scenarios:** P1000; P1001/network unreachable; wrong cluster;
  certificate error; permission denied; connection exhaustion.
- **Fix steps:** Database owner verifies endpoint/cluster, rotates or corrects
  credentials, configures approved TLS and grants, updates the secret store,
  checks network policy and connection budget.
- **Retest:** Repeat `pg_isready`, `psql`, `prisma migrate status`, and
  `bash scripts/verify-db.sh` from the actual deployment network.
- **Production impact:** CRM/auth/Jurivana persistence and readiness cannot be
  trusted while this fails.
- **Go-live impact:** **Blocking.** Do not route customer traffic.

## Blocker 2 — Migration certification

**Current status: FAIL / UNVERIFIED.** Prisma reports P1000 before migration
state can be read. Three migrations are checked in. A prior local report said
they were applied, but that is historical evidence and does not certify the
current endpoint.

### Commands and pass criteria

After Blocker 1 passes and a current backup has been verified:

```sh
npx prisma migrate status --schema=prisma/schema.prisma

# Apply reviewed migrations only as a singleton release step after approval:
npx prisma migrate deploy --schema=prisma/schema.prisma

# Re-check after deploy:
npx prisma migrate status --schema=prisma/schema.prisma
bash scripts/verify-db.sh
```

`migrate deploy` writes schema changes. It is not part of routine
certification, must not run independently on each app replica, and must not be
run before the backup, target, pending SQL, and change window are approved.

SQL certification (read-only):

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM giemens_crm._prisma_migrations
ORDER BY started_at;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'giemens_crm' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'giemens_crm'
ORDER BY indexname;

SELECT c.conname, c.contype, c.convalidated,
       c.conrelid::regclass AS table_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'giemens_crm'
ORDER BY c.contype, c.conname;

SELECT count(*) AS foreign_keys,
       count(*) FILTER (WHERE NOT convalidated) AS unvalidated_foreign_keys
FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'giemens_crm' AND c.contype = 'f';
```

**Expected:** all three checked-in migrations applied, none failed/incomplete;
14 expected application tables; all 28 migration-defined indexes; 16
validated foreign keys; primary/unique/FK definitions match migration SQL.
Detailed names and schema checklist are in
[postgresql-troubleshooting.md](./postgresql-troubleshooting.md).

- **Failure scenarios:** Missing migration, failed/incomplete migration row,
  missing table/index/constraint, invalid FK, unexpected schema drift.
- **Fix steps:** Stop release; back up; DBA/developer review state and migration
  SQL; use a forward corrective migration or approved recovery. Never reset
  production or edit an applied migration to hide drift.
- **Retest:** Repeat status, verification script, SQL checks, and staging app
  CRUD/auth smoke tests.
- **Production impact:** Missing schema breaks core requests; drift risks data
  integrity or outage.
- **Go-live impact:** **Blocking.**

### Migration certification report

| Check | Current result | Required result |
|---|---|---|
| `migrate status` | Not certified; P1000 | All expected migrations applied, no failures |
| `migrate deploy` | Not run | Reviewed and approved singleton release execution |
| Tables/indexes/FKs | Not queried due auth failure | 14 tables, 28 indexes, 16 validated FKs |
| Rollback safety | Not proven | Prior image/schema compatibility and restore path documented |

## Blocker 3 — Seed certification

**Current status: FAIL / UNVERIFIED.** No database access means roles/users/sample
rows cannot be inspected. Existing seed creates/upserts four roles and one
configured `SUPER_ADMIN`; it updates that admin password and deletes that
user's sessions when rerun. It does **not** seed sample CRM/Jurivana data.

Read-only queries, after DB auth:

```sql
SELECT name, count(*) AS rows
FROM giemens_crm.roles
WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
GROUP BY name
ORDER BY name;

SELECT count(*) AS password_backed_super_admins
FROM giemens_crm.users AS u
JOIN giemens_crm.roles AS r ON r.id = u.role_id
WHERE r.name = 'SUPER_ADMIN' AND u.password_hash IS NOT NULL;

SELECT count(*) AS users,
       count(*) FILTER (WHERE password_hash IS NULL) AS passwordless_users
FROM giemens_crm.users;

SELECT 'leads' AS entity, count(*) AS rows FROM giemens_crm.leads
UNION ALL SELECT 'customers', count(*) FROM giemens_crm.customers
UNION ALL SELECT 'projects', count(*) FROM giemens_crm.projects
UNION ALL SELECT 'tasks', count(*) FROM giemens_crm.tasks
UNION ALL SELECT 'jurivana_requests', count(*) FROM giemens_crm.jurivana_requests;
```

The expected baseline is exactly one of each standard role, at least one
password-backed super-admin, no accidental passwordless interactive accounts,
and zero sample business records unless approved fixtures have been separately
loaded. Never expose user emails/hashes in an audit report.

- **Evidence required:** Sanitized query output, approved admin bootstrap
  record, successful controlled login, no unintended sample data.
- **Failure scenarios:** Missing/duplicate roles, no usable super-admin,
  passwordless account, unapproved sample/customer data.
- **Fix steps:** Owner authorizes a one-time seed/bootstrap; set unique
  `ADMIN_*` values through secrets management; review seed side effects first.
  Remove unauthorized fixtures via approved data-management process.
- **Retest:** Run the queries, controlled login/logout and role checks. Do not
  re-run seed merely to verify status.
- **Production impact:** May prevent administration or create unauthorized
  accounts/data.
- **Go-live impact:** **Blocking** until verified; seed execution itself is
  conditional and must not be repeated blindly.

### Seed certification report

| Check | Current result | Required result |
|---|---|---|
| Four RBAC roles | Unverified | Exactly one expected row for each |
| Super-admin | Unverified | At least one approved, password-backed account |
| User hygiene | Unverified | No unintended passwordless interactive users |
| Sample data | No sample-data seed found; live DB unverified | None unless explicitly approved fixtures |
| Seed execution | Not run during this audit | Run only if bootstrap is explicitly required |

## Blocker 4 — Docker certification

**Current status: PARTIAL.** `docker compose config --quiet` passed with dummy
validation values. Docker Engine is unavailable, so image build, `docker
compose up`, `docker ps`, health transitions, logs, restart policy, and
shutdown are **not certified**.

On a Linux host with Docker installed, provide a protected staging `.env` and
run:

```sh
docker info
docker build --build-arg VITE_SITE_URL=https://www.giemens.com \
  -t giemens-home:<immutable-test-tag> .
docker compose config --quiet
docker compose up -d --build
docker ps --filter name=giemens
docker compose logs --tail 200 giemens
docker inspect --format '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}' \
  "$(docker compose ps -q giemens)"

curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/liveness
curl --fail http://127.0.0.1:3000/ready

docker compose restart giemens
docker compose ps
docker compose down
```

Use environment variables/secret files from the platform; do not paste secrets
into command history. The `ready` endpoint intentionally returns 503 when DB
connectivity fails; `health`/`liveness` must remain process-only. Confirm the
probe status changes when DB connectivity is removed/restored in staging.

- **Evidence required:** Build digest, Compose output, startup logs, non-root
  identity, health state, restart count, probe results, SIGTERM exit.
- **Failure scenarios:** Build dependency/Prisma failure; missing env; restart
  loop; DB readiness stays false; memory/CPU OOM; probe path misconfiguration.
- **Fix steps:** Correct image/build configuration or staging secrets; retain
  least privilege and resource limits; diagnose logs; never disable probes to
  mask failures.
- **Retest:** Rebuild immutable tag; repeat full commands; test restart and
  graceful stop with previous tag retained.
- **Production impact:** Container cannot be deployed safely or traffic
  readiness determined.
- **Go-live impact:** **Blocking** for Docker deployment.

### Docker certification report

| Check | Current result |
|---|---|
| Compose config | PASS with dummy values; this is interpolation/static validation |
| `docker build` | Not run; engine unavailable |
| `docker compose up` / `docker ps` | Not run; engine unavailable |
| Logs/restart/shutdown | Not run |
| `/health`, `/liveness` | Route unit tests pass; container test pending |
| `/ready` | Unit test covers success/failure; actual DB/container test pending |

## Blocker 5 — Azure certification

**Current status: FAIL / UNVERIFIED.** Azure CLI is unavailable, so
`az bicep build` and subscription deployment were not run. Current source
specifies Container Apps `cpu: 0.5`, `memory: '1Gi'`; actual resource validity
and application sizing need Bicep compile and load evidence. Blob CORS arrays
have been corrected in source but are not deployed/tested. Bicep creates a
user-assigned identity for ACR pull and Blob access. **Key Vault is not
integrated**; secure parameters are Container App secret values.

Run in CI or an authorized Azure operator environment:

```sh
az version
az bicep build --file infra/azure/main.bicep --stdout > /dev/null
az account show --output table
az deployment group what-if \
  --resource-group <staging-resource-group> \
  --template-file infra/azure/main.bicep \
  --parameters @<protected-staging-parameters.json>
```

After approved staging deployment, inspect the Container App managed identity,
ACR pull role, scoped Blob roles, app revision/probes, storage account TLS,
public access/shared-key settings, CORS rule, firewall/private endpoint, and
diagnostic destination. Do not print secure parameter values. Validate
`curl` from the actual allowed site origin and reject an unapproved origin.

- **Evidence required:** Bicep build output, reviewed `what-if`, deployed
  resource config, identity/RBAC scope, CORS test, app probe/log evidence.
- **Failure scenarios:** Bicep compile/parameter errors, invalid CPU-memory
  pair, failed image pull, wrong managed identity/client ID, insufficient Blob
  RBAC, CORS denial, unexpected public exposure, missing secret rotation.
- **Fix steps:** Correct Bicep/parameters and permissions in staging; validate
  resource quota/pair with Azure provider; restrict storage/network; integrate
  Key Vault references or document approved secret rotation and access controls
  before production.
- **Retest:** Rebuild, `what-if`, deploy staging, inspect actual state, run
  identity/CORS/upload/readiness tests, then obtain security approval.
- **Production impact:** Deployment, image pull, document storage, and secrets
  may fail or be exposed.
- **Go-live impact:** **Blocking** for Azure deployment.

### Azure certification report

| Check | Current result | Required result |
|---|---|---|
| `az bicep build` | Not run; Azure CLI unavailable | Successful CI/operator compile |
| CPU/memory | Source: 0.5 CPU / 1Gi; not cloud-validated | Provider-valid and load-tested |
| CORS | Array shape/source allowlist updated; not deployed | Allowed origin upload succeeds; foreign origin denied |
| Managed identity | User-assigned identity source present; not deployed | ACR and least-scope Blob role tests pass |
| Blob | Private container/source settings present; retention/scanning absent | Private, tested access plus retention/restore policy |
| Key Vault | No integration in template | Production secret references/rotation approved and validated |
| Diagnostics | Log Analytics destination in source; not deployed | Runtime logs visible; alerts tested |

## Blocker 6 — Security certification

**Current status: PARTIAL.** Source review shows session cookies, CSP, same-origin
mutation checks, Upstash rate limits, manual request validation, and some
transactional audit events. No deployed ingress/security test is available.
There is no Express middleware stack; do not treat lack of Helmet as lack of
headers—the Node server sets headers directly. Verify response behavior in the
deployed endpoint.

| Control | Status | Risk | Required action | Blocking? (Y/N) |
|---|---|---|---|---|
| Secure cookies | Implemented for production (`HttpOnly`, `SameSite=Lax`, `Secure`, bounded session); deployment unverified | High if proxy/TLS is wrong | Verify `Set-Cookie` on HTTPS; confirm no token in local storage and logout revocation | Y |
| CSP/security headers | Custom CSP and Node headers present; CSP allows inline styles; deployed headers unverified | Medium | Capture static/API headers; check CSP violations and allowed origins in staging; retain exact app behavior | Y |
| CSRF | Same-origin checks on authenticated mutations; no separate token; negative cases require ingress test | High | Verify foreign/missing Origin behavior and proxy host handling for every mutation | Y |
| Rate limiting | Upstash sliding windows for contact/leads/doc uploads; DB HMAC login limiter | High if proxy IP/Redis failure semantics differ | Verify shared multi-replica enforcement, trusted proxy chain, fail-closed behavior and alerting | Y |
| Helmet | No Helmet/Express middleware; Node-native security headers provide overlapping controls | Low by itself | Verify effective headers; no need to add Express/Helmet solely for a label | N |
| Audit logging | AuditLog model and selected CRM/document mutation writes | High | Verify transaction coverage for critical changes, download/access/security events, retention and restricted reads | Y |
| Request validation | Manual schema/size/content-type checks exist across handlers | Medium | Run malformed/oversize/type-fuzz cases on staging; verify no raw DB errors | Y |
| Malware scanning | Absent | Critical for untrusted files | Keep document uploads disabled/quarantined until scanning passes | Y |

**Validation commands/evidence:** HTTPS `curl -sS -D - -o /dev/null <URL>` for
headers; automate same-origin/foreign-origin/missing-origin mutation tests;
test rate limits across two replicas and Redis failure; review audit rows using
an authorized auditor; exercise malformed JSON/oversized payloads. Do not send
real passwords/tokens to command output.

- **Failure scenarios:** Missing Secure cookie, permissive origin, spoofable
  proxy IP, Redis outage silently disabling limits, missing audit record,
  malformed input causing 500 or injection.
- **Fix steps:** Correct TLS/proxy configuration, preserve fail-closed limits,
  patch individual validation/audit gaps, retain direct Node middleware order.
- **Retest:** Repeat automated security tests and staging response-header/
  authorization matrix after each change.
- **Production impact:** Account compromise, cross-origin action, abuse,
  unauthorized data access, or inadequate incident evidence.
- **Go-live impact:** **Blocking** for failed critical controls; Helmet itself
  is not a blocker when native controls are verified.

## Blocker 7 — Document security certification

**Current status: FAIL.** The app validates file size, declared MIME type,
signature, and checksum, but does not scan malware. `PENDING_UPLOAD` is an
upload state, not a security quarantine. No orphan cleanup job, Blob retention
policy, restore test, or download access audit was verified.

| Control | Current status | Evidence required to pass |
|---|---|---|
| Malware scanning | Absent | Isolated staging scan tests including EICAR, malicious, malformed and timeout/error cases |
| Quarantine | No scanner quarantine; pending records are not sufficient | Private quarantine storage; only clean approved objects can receive download SAS |
| Cleanup jobs | None verified | Scheduled idempotent cleanup, age threshold, DB/blob reconciliation, audit and dry-run |
| Blob retention | No versioning/soft-delete/retention configured in checked Bicep | Approved retention/legal hold and deletion/version restore evidence |

- **Failure scenarios:** Malware, scanner outage treated as clean, direct SAS
  download before approval, orphaned sensitive objects, premature deletion.
- **Fix steps:** Block external document upload or keep all content inaccessible;
  implement approved fail-closed scanner/quarantine and retention/cleanup
  controls before launch.
- **Retest:** Staging malware corpus, scanner failure/retry, authorization,
  cleanup dry-run, retention deletion/legal hold, and Blob restore/checksum.
- **Production impact:** Customer/employee endpoints and sensitive data at risk.
- **Go-live impact:** **Blocking** if customer uploads remain enabled.

## Blocker 8 — SMTP certification

**Current status: PARTIAL / NOT CERTIFIED.** Application validates required
SMTP fields and sends via Nodemailer; contact errors return a failure rather
than false success. Sending is synchronous; no durable queue or retry strategy
was found. Production credentials and provider connectivity were not tested.
Microsoft 365, Google Workspace, and Zoho are not certified by generic SMTP
support; each tenant's SMTP AUTH/OAuth policy must be checked.

Configuration variables currently used: `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`.

Safe checks (do not include AUTH commands or credentials in shell history):

```sh
# DNS and TCP/TLS negotiation only; does not authenticate or prove delivery.
openssl s_client -starttls smtp -connect "$SMTP_HOST:$SMTP_PORT" \
  -servername "$SMTP_HOST" -verify_return_error
```

With approved credentials injected only into the protected staging process, use
a one-off Nodemailer `transporter.verify()` check and send a controlled test
message to an internal mailbox; report only pass/fail and provider response
class. Do not print config, message contents, or credential-bearing debug logs.

- **Evidence required:** TLS-valid connection, successful authenticated
  staging delivery, allowed sender, provider-specific tenant policy, bounce/
  throttle/error handling and alert evidence.
- **Failure scenarios:** SMTP AUTH disabled, OAuth required, TLS/certificate
  failure, sender rejection, throttling, timeout, provider outage, inquiry
  accepted in UI but lost before delivery.
- **Fix steps:** Configure approved provider credentials/OAuth and sender
  policy; keep current 502 failure semantics; establish a monitored durable
  inquiry fallback/queue before declaring customer-critical delivery reliable.
- **Retest:** Microsoft 365, Google Workspace, or Zoho selected provider
  staging delivery plus transient/permanent failure, rate limit, and retry/
  duplicate test. Do not claim all three supported until separately tested.
- **Production impact:** Contact inquiries may not reach GIEMENS.
- **Go-live impact:** **Blocking** if Contact is a required customer intake
  channel; otherwise obtain explicit business-owner risk acceptance and a
  staffed fallback.

### SMTP readiness report

| Check | Current result |
|---|---|
| Configuration validation | Implemented; live values not audited |
| Connection/authentication | Not run |
| Retry/queue | No durable retry/outbox verified |
| Failure handling | API returns failure on SMTP exception/rejection |
| Microsoft 365 / Google Workspace / Zoho | Not individually certified |

## Blocker 9 — Observability readiness

**Current status: FAIL / PARTIAL.** Basic `console.info`/`console.error` and
Azure Log Analytics routing are present in source. Structured JSON logging,
OpenTelemetry instrumentation, Prometheus metrics, Grafana dashboards, Loki
queries, distributed tracing, error alerts, and audit alerts are not verified.

| Capability | Current result | Pass evidence |
|---|---|---|
| Structured logging | Partial; console messages are not a verified consistent JSON schema | Sanitized JSON logs with timestamp/severity/service/trace ID and no secrets/PII |
| Metrics | No app-level request/DB/error metrics verified | Scrape/export and alert firing for request errors, latency, DB, startup, audit |
| Tracing | No distributed tracing verified | HTTP-to-Prisma trace in staging with W3C propagation |
| Error monitoring | Basic error logs only | Tested alert routes to named on-call owner |
| Audit monitoring | Audit table/selected writes exist; alerts/retention unverified | Restricted access and alert for audit-write failure/suspicious events |
| OpenTelemetry | Not integrated | Collector/export outage test and bounded-resource behavior |
| Prometheus/Grafana/Loki | Not deployed/verified | Dashboard, log search, alert and retention evidence |

- **Failure scenarios:** Silent 5xx/DB outage, lost logs, secret/PII leakage,
  unbounded metric cardinality, exporter outage affecting requests, alerts with
  no owner.
- **Fix steps:** Deploy the current monitoring guide's cloud-agnostic OTLP
  pipeline and alerts; assign on-call owner; redact sensitive fields. Do not
  make telemetry availability a request-readiness dependency.
- **Retest:** Generate known errors, verify metrics/trace/log correlation,
  redaction, alert delivery, and telemetry-backend outage behavior.
- **Production impact:** Incidents may remain undetected or unresolved.
- **Go-live impact:** **Blocking** for an operated production service until
  minimum error/availability alerts and on-call response are verified.

## Blocker 10 — Backup and disaster recovery certification

**Current status: FAIL.** No scheduled PostgreSQL backup, PITR/WAL evidence,
Blob backup/retention configuration, or restore drill is verified. The backup
guide contains procedures and proposed objectives only; this is not backup
evidence.

| Service | Proposed RPO | Proposed RTO | Current achieved |
|---|---:|---:|---|
| PostgreSQL | 15 minutes with continuous WAL/PITR; 24 hours with daily logical backup only | 4 hours | Unknown |
| Blob documents | 1 hour with supported versioning/PITR; up to 24 hours with daily copy | 8 hours | Unknown |
| Full service | At most 24 hours for non-data config; data by DB/Blob objective | 8 hours | Unknown |

The owner must approve these objectives. They are not measured guarantees.

- **Evidence required:** Recent encrypted backups in a separate failure domain,
  retention/access policy, checksum, successful isolated PostgreSQL and Blob
  restore, measured RPO/RTO, named operators.
- **Failure scenarios:** Missing/corrupt backup, lost encryption key, Blob
  metadata/object mismatch, restore too slow, backup identity can be deleted by
  app identity, no legal-hold handling.
- **Fix steps:** Enable provider-supported database PITR/WAL and Blob
  versioning/soft-delete or independent backup; isolate credentials and
  destinations; schedule restore drills and alerts.
- **Retest:** Restore database and representative blobs into isolated targets,
  run schema/index/FK/app smoke tests and SHA-256 reconciliation, record
  measured recovery times.
- **Production impact:** Irrecoverable data loss or prolonged outage.
- **Go-live impact:** **Blocking** before production customer data is accepted.

## Linux certification

**Current status: NOT CERTIFIED.** The current environment is Windows. CI
targets Ubuntu, but no runtime container was started. RHEL 10, Rocky Linux,
AlmaLinux, Debian, and Ubuntu compatibility are unverified at runtime.

**Evidence required:** For every distribution advertised, record OS/kernel,
container engine/Compose versions, image digest, non-root status, health/
readiness, network/TLS, SIGTERM, restart, and restore smoke results from a
clean host. `bash scripts/verify-db.sh` is syntax-checked, not validated
against a live Linux PostgreSQL database.

- **Failure scenarios:** SELinux/firewall denial, unavailable Compose/runtime,
  architecture mismatch, DNS/TLS/proxy differences, filesystem/permission
  assumptions.
- **Fix steps:** Fix only observed compatibility failures; keep container
  deployment and app image unchanged otherwise.
- **Retest:** Run documented [Linux deployment](./linux-deployment.md) matrix
  per OS; RHEL-specific steps in [RHEL 10 deployment](./rhel10-deployment.md).
- **Production impact:** Operators may be unable to deploy/support advertised
  Linux targets.
- **Go-live impact:** **Blocking** for any OS explicitly included in the launch
  support commitment; otherwise limit launch to the tested platform.

## Top 5 actions required to reach production

1. **Restore and verify PostgreSQL access.** Resolve P1000 with the DBA, then
   pass authenticated `psql`, TLS/permission review, migration status, and
   `verify-db.sh`.
2. **Prove migration and seed state safely.** Take a verified backup, review
   pending migration SQL, deploy once if needed, verify tables/indexes/FKs and
   approved roles/admin; do not seed repeatedly.
3. **Run release build/runtime certification.** On Linux CI/operator host,
   pass Bicep build, Docker build/start, probe/restart/log checks, and deployed
   Azure identity/CORS/secret validation.
4. **Protect customer documents and recovery.** Keep uploads disabled or
   quarantined until malware scan passes; configure PostgreSQL/Blob retention
   and complete an isolated restore drill with measured RPO/RTO.
5. **Establish minimum operated-production controls.** Validate Secure cookie,
   CSRF, trusted proxy/rate limits, SMTP staging delivery/fallback, and
   availability/error/audit alerts with named on-call owners.

## GO / NO-GO decision

# NO-GO

Release remains blocked by:

1. Confirmed PostgreSQL P1000 and unverified live data/migration/seed state.
2. Uncertified Docker image/runtime because the engine is unavailable.
3. Uncertified Azure Bicep compilation and deployed configuration because the
   Azure CLI/subscription validation was unavailable.
4. No malware scan/quarantine/retention gate for uploaded documents.
5. No verified PostgreSQL/Blob backup restore or measured RPO/RTO.
6. No tested production SMTP provider delivery and durable retry/monitoring.
7. No deployed observability/on-call alert evidence.
8. No runtime Linux certification for promised host distributions.

Reissue certification only after the applicable blockers have passed with
sanitized, date-stamped evidence from the intended staging/production topology.
