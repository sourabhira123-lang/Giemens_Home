# GIEMENS production readiness certification

**Audit date:** 2026-11-06
**Scope:** Current repository source/configuration and validations available in
the current Windows workspace.
**Verdict:** **❌ NOT READY FOR PRODUCTION**

## 1. Executive summary

The existing Vite + React + TypeScript frontend, Node.js + TypeScript HTTP
server, PostgreSQL + Prisma data layer, Docker packaging, and Azure Bicep
deployment are retained. The audit made incremental changes only: added
Linux-safe database verification scripts, explicit process/readiness endpoints,
Azure Blob CORS arrays with a narrow header allowlist, and operational
runbooks.

Production launch is blocked by a confirmed PostgreSQL authentication failure
(Prisma P1000), unverified migration/seed/schema state, unverified Bicep
compilation and Docker image/runtime because the local Azure CLI and Docker
engine are unavailable, and missing document malware scanning/retention,
tested restore procedures, and production observability. SMTP and Upstash
credentials/connectivity, Azure identity/permissions, and distribution-specific
Linux compatibility have not been independently validated.

No migration, seed, database reset, cloud deployment, password recovery, or
production configuration change was performed. No external credential was
printed or modified.

## 2. Architecture review

| Layer | Current implementation | Audit finding |
|---|---|---|
| Web | Vite/React/TypeScript, 35 prerendered routes reported by the project | Existing routes and branding retained; build should be re-run for the exact release commit |
| HTTP/API | Node 22 TypeScript HTTP server and API handlers | Same-origin mutation checks, bounded request bodies, CSP and security headers exist; generic operational metrics/traces are absent |
| Authentication | Database-backed opaque sessions, hashed tokens, HttpOnly/SameSite cookies, role checks | Production Secure cookie is configured; proxy/IP rate-limit behavior needs validation at the actual ingress |
| Database | PostgreSQL, Prisma models and three checked-in migrations | `prisma validate` passes; live migration status fails with P1000; no active DB state is certified |
| Documents | Private Azure Blob container, short-lived user-delegation SAS, size/type/signature/hash validation | Malware scan, quarantine, orphan cleanup, retention, and download access audit are absent |
| Email | Nodemailer SMTP used synchronously by contact API | No durable queue, retry policy, provider health check, or Microsoft/Google/Zoho OAuth validation |
| Containers | Multi-stage Node 22 Debian image, non-root runtime, Compose hardening | Compose model not rendered with required settings; Docker daemon unavailable; image not built or run |
| Azure | Container Apps, ACR pull identity, Blob container/RBAC, Log Analytics linkage | Bicep is uncompiled in this environment; Key Vault, PostgreSQL, Redis, and SMTP are external prerequisites |
| AI | No runtime agent registry, executor, or run metrics found | Must remain inactive until provider-neutral storage, policy, human review, and evaluation are approved |
| Operations | Existing deployment and local database docs | No observed restore drill, approved SLO, or certified Linux matrix |

## 3. Readiness scores

Scores are evidence-based on a 0–5 scale: 0 = absent, 1 = materially blocked,
2 = partial/static evidence, 3 = implemented but operationally unverified,
4 = validated in representative staging, 5 = production-tested with recurring
evidence. They are not a compliance opinion.

| Area | Score | Evidence and gap |
|---|---:|---|
| Database | 1/5 | Prisma schema validation passes; current credential fails with P1000; migrations, roles, seed, tables, indexes, constraints, SSL, and query performance are not currently verifiable |
| Security | 2/5 | RBAC, hashed sessions, origin checks, request limits, CSP, upload signature/hash checks, and some audit records exist; file scanning, centralized audit coverage, operational security scan, and ingress validation are incomplete |
| Infrastructure | 1/5 | Container and Bicep sources exist; Azure CLI unavailable, Docker daemon unavailable, infrastructure build/deploy not evidenced |
| Docker | 1/5 | Static Dockerfile review is positive; Compose validation is blocked by missing required environment values; image build/start/health/shutdown are unverified |
| Azure | 1/5 | Bicep defines Container Apps, managed identity, private Blob container and probes; Bicep compilation and deployed permissions/network are unverified; no Key Vault integration |
| Linux compatibility | 1/5 | Linux-targeted container and Ubuntu CI exist; no container run or RHEL/Rocky/Alma/Debian certification |
| AI platform | 0/5 | No registry/log/metrics implementation or model-provider integration verified; no agents should execute |
| Backup and DR | 0/5 | No verified backup policy, recovery point, Blob retention setup, or restore drill |
| Observability | 1/5 | Basic process logs and Azure platform log destination are present; no OpenTelemetry, service metrics, tracing, alert test, or log-redaction validation |
| Overall | **1/5 — blocked** | Weighted average is not asserted; all go-live gates below are mandatory |

## 4. Database findings and release gate

### Verified

- The active Prisma schema is `prisma/schema.prisma`, provider `postgresql`,
  schema `giemens_crm`.
- `npm run prisma:validate` passed.
- Three migrations are checked in.
- A prior local report dated 2026-11-05 stated that 14 tables were present and
  migrations applied. The current active `.env` credentials may not target the
  same state.
- On 2026-11-06, `prisma migrate status --schema=prisma/schema.prisma` failed
  with **P1000: authentication failed** for `postgres` at
  `127.0.0.1:5432`. No secret value was displayed.

### Not verified / required actions

1. A database owner must correct the ignored environment configuration for the
   intended PostgreSQL cluster. URL-encode reserved characters; do not share
   or commit the URL.
2. Verify target host, port, database `giemens`, schema `giemens_crm`, TLS
   mode, and a least-privilege app role. Do not use a PostgreSQL superuser for
   application traffic.
3. Run `bash scripts/connect-db.sh`, `bash scripts/db-health.sh`,
   `bash scripts/migration-check.sh`, then `bash scripts/verify-db.sh`.
4. Review the migration status and a current backup before running
   `npm run db:deploy` once as a release step. Never use `migrate reset` for
   production.
5. Run the seed only for an approved bootstrap. The current seed upserts all
   four roles, updates the configured super-admin name/role/password, and
   deletes that user's sessions; rerunning it is a credential/session change,
   not a harmless verification.
6. Confirm `Role`, `User`, `Lead`, `Activity`, `Customer`, `Project`, `Task`,
   `Document`, `AuditLog`, `JurivanaRequest`, and `RequestComment` map to
   existing tables. The verification script checks all 14 application tables,
   28 declared indexes, 16 validated foreign keys, four roles, and at least one
   password-backed `SUPER_ADMIN`.
7. Run the index/constraint SQL and representative `EXPLAIN (ANALYZE, BUFFERS)`
   statements in [PostgreSQL troubleshooting](./postgresql-troubleshooting.md).
   Do not run `ANALYZE` on write-heavy production queries during peak traffic
   without DBA review.

The exact SQL and release checklist are in
[postgresql-troubleshooting.md](./postgresql-troubleshooting.md).

## 5. Security gap matrix

| Risk | Current evidence | Gap / exact components | Priority |
|---|---|---|---|
| Critical — database identity unavailable | P1000 from active `.env` | `DATABASE_URL`, PostgreSQL role/password, `prisma/schema.prisma`, migration release; no live data state is certifiable | P0 |
| High — unscanned customer files | Document API verifies declared type, size, signature, and SHA-256 | `api/documents.ts`, `server/azure-blob-storage.ts`, `prisma/schema.prisma`, Blob lifecycle; `READY` does not mean malware-free | P0 |
| High — incomplete disaster recovery | No restore evidence/configuration in repository | PostgreSQL backups, Blob versioning/soft delete, key custody, operator runbooks | P0 |
| High — no readiness evidence for runtime | Docker/Azure tooling unavailable; DB readiness is newly implemented but not container-tested | `server/http.ts`, `Dockerfile`, `docker-compose.yml`, `infra/azure/main.bicep` | P0 |
| High — proxy trust/rate-limit topology unknown | Node supports `TRUST_PROXY_HOPS`; Bicep sets `0`; auth rate limit keys derive from client IP | `server/http.ts`, `server/auth.ts`, ACA ingress and reverse proxy | P1 |
| High — audit coverage not comprehensive | `AuditLog` exists; CRM/document mutation paths write some events | Login/logout failures, document download, authorization-sensitive read, retention/immutability need policy | P1 |
| Medium — synchronous SMTP delivery | Contact request waits for Nodemailer `sendMail`; no durable retry queue | `api/contact.ts`, `docker-compose.yml`, runtime env | P1 |
| Medium — CSRF relies on same-origin policy | CRM/document/auth mutation handlers check `Origin`; cookie is SameSite Lax | Maintain exact-origin rejection for authenticated writes; test missing/foreign origins and proxy host handling | P1 |
| Medium — CSP uses inline styles | Custom CSP in `server/http.ts` includes `style-src 'unsafe-inline'`; script is hash constrained | UI styling/build output and CSP policy; remove only after staging hash/nonce tests | P2 |
| Medium — dependency/security coverage incomplete | CI runs runtime `npm audit`; no verified SAST/image scan/SBOM/signing | `.github/workflows/ci.yml`, Docker image release | P1 |
| Low/Medium — public forms trust inferred client IP | Public contact/lead routes use proxy-derived IP for Upstash rate limits | Verify proxy headers at each deployment and retain fail-closed Redis behavior | P1 |
| Medium — secrets have no Key Vault references in template | Bicep secure inputs become Container App secret values | `infra/azure/main.bicep`, deployment identities, rotation procedure | P1 |

### Security architecture and middleware order

Preserve the current Node HTTP architecture; it does not use Express and should
not add Express solely to attach Helmet. The existing equivalent controls are
applied at the HTTP server/API handlers. Keep the order:

1. Validate method, URL, host, body size, and content type.
2. Apply security headers and no-store behavior for API responses.
3. Derive client IP only from the verified socket/proxy chain.
4. Check same-origin for state-changing requests.
5. Authenticate the opaque session and resolve the current role.
6. Apply role, ownership, and resource authorization before data access.
7. Validate input and rate limit expensive/public actions.
8. Use Prisma parameterized operations; never concatenate user SQL.
9. Perform mutation and its audit write in one transaction where possible.
10. Return minimal errors; log event names/trace IDs without credentials or PII.

The current app already uses a CSP, frame denial, `nosniff`, referrer and
permissions policies, HSTS, HttpOnly/SameSite cookies, bounded bodies,
Prisma, and route-level RBAC. Do not duplicate these controls with an
ineffective Express Helmet middleware. If a future HTTP adapter introduces
Express, configure Helmet before routes and preserve the existing tested CSP:

```ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'sha256-K8HZdC/RJBVlqxAmswWtEiwUEPiVPo5VUOiZn8e6ziI='"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
```

This is an adapter example, not a request to add Express or replace the current
server.

### Implementation-ready validation examples

The codebase uses Upstash for rate limiting; keep it shared across replicas and
fail closed when it is unavailable. Existing origin validation is the current
CSRF defense. For any future cookie-authenticated state-changing endpoint,
require a parsed `Origin` exactly matching the canonical request origin (or a
cryptographically checked CSRF token); never allow a missing origin to bypass
that endpoint's protection.

```ts
if (request.method !== "GET" && !hasSameOrigin(request)) {
  sendJson(response, 403, { error: "This request is not allowed." });
  return;
}
```

Production session cookies must remain `HttpOnly; Secure; SameSite=Lax;
Path=/`, with an explicit bounded lifetime. Do not store session tokens in
browser local storage.

If Zod is selected as a dependency in a separately reviewed change, validate
untrusted JSON with `safeParse` before reaching Prisma and return only the
public validation issue:

```ts
const input = z.object({
  email: z.string().email().max(254),
  message: z.string().trim().min(1).max(5000),
}).strict().safeParse(body);
if (!input.success) {
  sendJson(response, 400, { error: "Submit valid request details." });
  return;
}
```

Do not install Zod or Helmet solely to duplicate the current manual validators
and native Node security-header implementation. Any audit-log mutation should
be transactionally coupled to the business write:

```ts
await prisma.$transaction(async (tx) => {
  const record = await tx.customer.update({ where: { id }, data });
  await tx.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "customer.updated",
      entityType: "customer",
      entityId: record.id,
    },
  });
});
```

Do not put passwords, full document URLs, message bodies, or bearer/SAS tokens
in `AuditLog.details`.

## 6. Document security design

Current uploads use private Azure Blob Storage, five-minute SAS URLs, metadata
checks, allowed content types, magic-byte checks, and SHA-256. The current
`DocumentStatus` has only `PENDING_UPLOAD` and `READY`; there is no malware
scanner, quarantine state, archive validation, cleanup worker, retention engine,
or download audit. **Do not accept arbitrary external documents in production
until an approved scan gate exists.**

Target lifecycle, preserving the existing API/Blob architecture:

```text
Upload -> Quarantine -> Scan -> Approve -> Store -> Download -> Archive -> Delete
```

1. Create a pending document record and upload only to an isolated quarantine
   container with a short write SAS.
2. Verify actual size, hash, and file signature; reject polyglots, invalid
   archives, excessive expansion ratios, unsupported encryption, and parser
   timeouts.
3. Enqueue a durable, idempotent scan job using a PostgreSQL outbox; do not
   rely on an in-memory queue or an HTTP process staying alive.
4. A least-privilege scanner worker reads quarantine content, records engine
   and signature versions, and produces `CLEAN`, `MALICIOUS`, or `ERROR`.
   Scan errors/timeouts remain quarantined and are never downloadable.
5. On clean result, move/copy to the private approved container, verify the
   destination checksum, then atomically mark the record approved/ready. Only
   approved records receive download SAS URLs.
6. Log owner, actor, download issuance, scan state, approval, archive, and
   deletion without logging SAS tokens. Keep access events under a retention
   and legal-hold policy.
7. Periodically remove expired pending uploads and orphaned quarantine blobs
   only after comparing them to database records and applying a grace period.
8. Archive according to approved retention classes; deletion must cover Blob
   versions, quarantine, replicas, backups, and legal holds.

Keep the scanner behind a vendor-neutral `DocumentScanner` interface. ClamAV
in a separately isolated worker is a portable starting option; Azure-native
scanning can be an adapter, not an application requirement. Before adding
document states and a worker, approve scanner engine, event transport,
retention, failure policy, and data residency, then ship an additive Prisma
migration with a tested backfill/rollback plan.

## 7. Azure and Docker findings

### Azure

- `infra/azure/main.bicep` provisions Container Apps, a pull identity, storage
  account/container, Blob role assignments, ingress, probes, and Log Analytics
  linkage. PostgreSQL, Redis, ACR, SMTP, and the workspace remain external.
- The Blob CORS rule was corrected to array-valued origins/methods/headers and
  an explicit `content-type`/`x-ms-blob-type` request-header allowlist.
- The corrected template shape is:

  ```bicep
  corsRules: [
    {
      allowedOrigins: [siteOrigin]
      allowedMethods: ['PUT', 'OPTIONS', 'HEAD']
      allowedHeaders: ['content-type', 'x-ms-blob-type']
      exposedHeaders: ['ETag', 'x-ms-request-id']
      maxAgeInSeconds: 300
    }
  ]
  ```

- CPU `0.5` and memory `1Gi` are the current fixed values. Validate allowed
  Container Apps resource combinations and load-test peak memory before
  changing them.
- Readiness now targets `/ready`; liveness/startup target `/liveness`. Preserve
  `/healthz` for old probes.
- The template does not integrate Key Vault references, PostgreSQL Flexible
  Server, an observability collector, Blob soft delete/versioning, or private
  networking. Blob storage currently has public network access enabled even
  though public blob access and shared key are disabled; review private endpoint
  and egress controls with the network owner.
- The same user-assigned identity is used for registry pull and Blob operations.
  Split identities only after verifying Container Apps identity semantics and
  deployment role assignments in a test subscription.
- Azure CLI was unavailable during this audit. **`az bicep build` has not been
  verified.** Run it in CI and from an Azure-enabled release environment.

### Docker

The Dockerfile is multi-stage, Node 22, runs as `node`, and retains an
application-level health check. Docker Engine was not reachable and Compose
configuration fails without the required settings. Image build, service
startup, probes, graceful shutdown, and network behavior are **unverified**.
The host smoke-test record in
[docker-validation-report.md](./docker-validation-report.md) is not a
container test.

Before release, with a non-secret validation env file, run:

```sh
docker compose --env-file <protected-validation-env> config --quiet
docker compose --env-file <protected-validation-env> build
docker compose --env-file <protected-validation-env> up -d
docker compose --env-file <protected-validation-env> ps
curl --fail http://127.0.0.1:<APP_PORT>/liveness
curl --fail http://127.0.0.1:<APP_PORT>/ready
docker compose --env-file <protected-validation-env> down
```

Use dummy credentials only for config rendering; use real credentials only in
a controlled staging environment. Do not include an env file in command
transcripts.

## 8. Email foundation

The current API validates SMTP config and sends contact email synchronously.
Nodemailer supports SMTP transport, but Microsoft 365, Google Workspace, and
Zoho support depends on each tenant's SMTP AUTH/OAuth policy; the current
username/password config is not proof of provider compatibility. Email is not
durably queued or retried.

Production-safe target: retain `EmailService` as an interface over
`EmailProvider.send(message)`, implement provider adapters using SMTP or
OAuth2 where approved, and persist a transactional outbox row with the inquiry.
A worker claims rows with bounded leases, exponential backoff and jitter,
idempotency keys, dead-letter state, and operator replay. Return inquiry
acceptance after durable outbox commit rather than waiting on an SMTP socket.
An email outage must not lose accepted inquiries or make duplicate sends
untraceable.

Proposed runtime config: `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` or provider OAuth client/tenant/
refresh-token secrets, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`,
`EMAIL_CONNECT_TIMEOUT_MS`, `EMAIL_RETRY_MAX_ATTEMPTS`, and
`EMAIL_QUEUE_POLL_INTERVAL_MS`. Keep secret values in a secret manager.
Implement a low-impact startup configuration validation and operator-only
health check that does not send a real email. Validate each provider in staging
with a verified sender, TLS, throttling, bounce handling, retry, and outage
tests before enabling.

## 9. AI platform foundation

No agent registry, execution log, metrics, or inference adapter exists in the
audited code. Keep agents disabled until policy, data residency, security
review, and evaluation are approved. Do not activate future agents.

Provider-neutral additive schema proposal:

- `AgentRegistry`: UUID `id`, unique `name`, `version`, `status`, `enabled`,
  `createdAt`, `updatedAt`.
- `AgentExecutionLog`: UUID `id`, FK `agentId`, `startedAt`, nullable
  `endedAt`, `durationMs`, `status`, redacted JSON `result`, trace/correlation
  ID, error category (not raw prompt or secrets).
- Metrics are derived from immutable runs:
  `COUNT(*) runs`, successful count, failed count, and average duration by
  `agentId` and time bucket. Do not maintain a separately mutable counter that
  can diverge from logs.
- Initial enabled registry entries only: `AI Receptionist`, `Lead
  Qualification Agent`, and `Proposal Generator`. Create
  `Legal Assistant`, `Compliance Assistant`, `Property Agent`, `GST Agent`,
  `Invoice Agent`, `HR Agent`, `Recruitment Agent`, and `CEO Copilot` disabled.
- Registry `enabled=true` is only metadata; execution remains unavailable until
  a separately authorized provider-neutral executor, tool allowlist, per-agent
  data access, human approval, budget/time limits, prompt-injection controls,
  redaction, evaluation set, and kill switch are implemented and tested.

Implement via an additive Prisma migration and seed changes only after database
authentication is restored and migration ownership approves the change. Model
provider integrations behind `ModelProvider`/`AgentExecutor` interfaces; no
vendor API key or provider lock-in is part of the schema.

## 10. Observability

The current server has basic logs and an Azure platform log destination, but no
verified OpenTelemetry SDK, application metrics, traces, or alerts.
[monitoring-guide.md](./monitoring-guide.md) defines a cloud-agnostic OTLP
Collector + Prometheus-compatible metrics + Grafana + Loki implementation,
redaction rules, metrics, SLO candidates, health probes, validation, and
rollback. Do not make telemetry backend availability a request-readiness
dependency.

## 11. Linux certification

Linux compatibility is not certified. The image is Linux-based and GitHub
Actions uses Ubuntu, but no runtime container was started. See
[linux-deployment.md](./linux-deployment.md) and
[rhel10-deployment.md](./rhel10-deployment.md) for per-distribution acceptance
criteria. Require a recorded test on Ubuntu, Debian, RHEL 10, Rocky Linux, and
AlmaLinux before making those deployment claims. Windows PowerShell database
helpers are not server dependencies.

## 12. CI/CD validation

Current CI stages are npm install, Prisma validate/generate, typecheck, tests,
runtime dependency audit, Vite build, Bicep build, and Docker build. The current
workflow does not run a dedicated linter, migration integration test against a
disposable PostgreSQL service, full dependency/SAST scan, secret scan,
container vulnerability scan, SBOM generation, image signing, or deployment
approval. The Bicep and Docker steps exist in CI but were not executed from this
workspace.

Recommended gated flow:

1. Lockfile install (`npm ci`) and source-format/lint checks.
2. Prisma validate/generate and disposable PostgreSQL migration/constraint test.
3. Typecheck and unit/integration tests.
4. Full dependency audit, secret scanning, and source analysis; triage findings
   instead of suppressing checks.
5. Production build, Bicep compile, Docker build, image SBOM and vulnerability
   scan.
6. Sign and publish immutable image digest only after required jobs pass.
7. Deploy to staging with approval, run smoke/security/restore checks, then
   production migration as a singleton release task.
8. Environment-protected production deployment with manual approval, audit
   record, health gate, and tested rollback target.

Do not grant pull-request workflows production credentials. Pin third-party
actions to reviewed commit SHAs before treating CI as a supply-chain control.

## 13. Prioritized implementation plan

Every action below includes impact, scope, implementation, verification,
rollback, and production-readiness effect. Risk denotes risk if the item is
left unresolved.

### P0 — Restore and verify PostgreSQL access

- **Business impact:** CRM, authentication, and Jurivana persistence cannot be
  relied on at launch.
- **Technical impact:** Current Prisma connection fails P1000; migrations and
  application schema state are unknown.
- **Risk level:** Critical.
- **Components/files:** PostgreSQL cluster/role; `DATABASE_URL`;
  `prisma/schema.prisma`; `scripts/db-config.mjs`;
  `scripts/{connect-db,db-health,migration-check,verify-db}.sh`.
- **Implementation approach:** Database owner verifies the intended cluster,
  resets/rotates credentials only through approved access, synchronizes ignored
  local configuration, provisions least-privilege login, and enables TLS for
  remote connections. Do not use or disclose a superuser credential.
- **Validation procedure:** `bash scripts/connect-db.sh`,
  `bash scripts/db-health.sh`, `bash scripts/migration-check.sh`, then
  `bash scripts/verify-db.sh`; record only sanitized outcomes.
- **Rollback procedure:** If connection changes fail, revert the local
  environment entry to the previous secret version; do not alter database
  contents. Credential rollback must be coordinated with the DBA.
- **Production readiness impact:** Mandatory release blocker; unblocks all
  subsequent database validation.

### P0 — Validate migration, schema and seed state

- **Business impact:** Prevents launch-time data loss, missing tables, or
  unavailable administrator access.
- **Technical impact:** Three migrations are present; live migration/seed state
  is unverified.
- **Risk level:** Critical.
- **Components/files:** Prisma schema/migrations/seed; PostgreSQL tables,
  indexes, FKs, and RBAC rows; `scripts/verify-db.sh`.
- **Implementation approach:** Back up first, review `prisma migrate status`,
  apply reviewed additive migrations once as a release task, verify 14 tables,
  28 indexes, 16 validated foreign keys, four roles, and one password-backed
  `SUPER_ADMIN`. Treat seed as a privileged bootstrap; current seed updates
  super-admin credentials and revokes sessions on rerun.
- **Validation procedure:** `bash scripts/verify-db.sh`, SQL checks in
  `postgresql-troubleshooting.md`, and application smoke tests against a
  restored/staging database.
- **Rollback procedure:** Do not reset or automatically downgrade. Roll back
  application code only if schema remains backward compatible; restore from a
  verified backup only through an incident-approved recovery.
- **Production readiness impact:** Mandatory; establishes authenticated,
  migration-consistent data foundation.

### P0 — Gate untrusted files on malware scan

- **Business impact:** Reduces risk of malware entering employee/customer
  workflows or downstream systems.
- **Technical impact:** Hash/signature checks prove integrity/type cues, not
  cleanliness; current READY status is assigned before scanning.
- **Risk level:** High.
- **Components/files:** `api/documents.ts`, `server/azure-blob-storage.ts`,
  `prisma/schema.prisma` and additive migration, private quarantine/approved
  Blob containers, scanner worker/outbox.
- **Implementation approach:** Implement the state machine in section 6 with
  fail-closed quarantine, provider-neutral scanner adapter, durable outbox,
  access audit, cleanup/retention, and malware test corpus. Select a scanner
  and retention policy before coding/deployment.
- **Validation procedure:** EICAR test in isolated staging, malformed/oversize
  archive and timeout tests, scan error/retry tests, direct-SAS bypass attempt,
  download authorization and cleanup tests.
- **Rollback procedure:** Disable new uploads or keep all new objects
  quarantined; never mark unscanned content READY. Keep old clean records
  available only if their provenance is approved.
- **Production readiness impact:** Mandatory while accepting customer files.

### P0 — Prove build, Bicep and runtime probes

- **Business impact:** Avoids failed release or unhealthy production instances.
- **Technical impact:** Current machine cannot run Docker or Azure CLI; changes
  to `/ready`, `/liveness`, and Blob CORS need execution evidence.
- **Risk level:** High.
- **Components/files:** `Dockerfile`, `docker-compose.yml`,
  `server/http.ts`, `tests/http.test.ts`, `infra/azure/main.bicep`,
  `.github/workflows/ci.yml`.
- **Implementation approach:** Run CI on Linux with validated sample
  parameters, then deploy only to a non-production Azure subscription and
  test actual identity, CORS, resource shape, and probes.
- **Validation procedure:** `az bicep build --file infra/azure/main.bicep`;
  `docker compose config/build/up`; test `/liveness` and PostgreSQL-dependent
  `/ready`; verify startup, shutdown, and Blob upload from the approved origin.
- **Rollback procedure:** Keep previous immutable image and Bicep deployment
  state; restore old revision if probes fail. Do not roll back a completed DB
  migration without a compatibility review.
- **Production readiness impact:** Mandatory deployment validation.

### P0 — Establish backup and restore evidence

- **Business impact:** Limits loss of CRM records and customer documents.
- **Technical impact:** No verified database/Blob recovery point or restore
  time is available.
- **Risk level:** Critical.
- **Components/files:** PostgreSQL managed backup/WAL or `pg_dump`; Blob
  retention/versioning; backup storage/key access; [backup-guide.md](./backup-guide.md).
- **Implementation approach:** Approve RPO/RTO, enable encrypted database and
  Blob recovery, retain independent copies, restrict delete rights, and run a
  full isolated restore drill.
- **Validation procedure:** Restore DB and representative Blob objects,
  validate checksums, migrations, constraints, authorization, and measured
  RPO/RTO. Attach sanitized evidence to the release.
- **Rollback procedure:** Restore into a new isolated target and switch traffic
  only after validation; retain original systems for forensic recovery.
- **Production readiness impact:** Mandatory before customer data is accepted.

### P1 — Validate auth ingress, rate limits and authorization

- **Business impact:** Protects accounts and customer records from abuse and
  cross-role access.
- **Technical impact:** Client-IP correctness depends on proxy topology;
  per-IP limits may collapse to one proxy IP or be spoofable if misconfigured.
- **Risk level:** High.
- **Components/files:** `server/auth.ts`, `server/http.ts`, `api/auth/*`,
  `api/crm.ts`, `api/documents.ts`, `infra/azure/main.bicep`, production proxy.
- **Implementation approach:** Document trusted hop count; verify the proxy
  overwrites/appends headers; set `TRUST_PROXY_HOPS` only after a staged test;
  retain same-origin and role/owner checks; consider account+IP keyed login
  limits using HMAC keys without logging account identifiers.
- **Validation procedure:** Test forged X-Forwarded-For, actual proxy chains,
  login lockout across instances, CSRF origin cases, role matrix, IDOR for
  requests/documents, and revocation after logout.
- **Rollback procedure:** Return to conservative direct-peer IP attribution
  while accepting reduced rate-limit precision; disable affected sensitive
  writes if authorization tests regress.
- **Production readiness impact:** Required before public ingress.

### P1 — Complete audit trail and log redaction

- **Business impact:** Supports incident investigation and customer/legal
  accountability.
- **Technical impact:** Existing AuditLog is only called on some mutations;
  downloads and authentication events need defined coverage.
- **Risk level:** High.
- **Components/files:** `prisma/schema.prisma`, auth/CRM/document handlers,
  retention/export storage, monitoring pipeline.
- **Implementation approach:** Define event taxonomy; transactionally record
  security-relevant changes and document-access issuance; restrict reads and
  export to tamper-resistant retention. Redact secrets and personal data from
  diagnostics.
- **Validation procedure:** Automated tests assert events for success/failure
  actions and absence of secrets; role tests prevent unauthorized audit reads;
  verify retention and export restore.
- **Rollback procedure:** Disable only the new exporter/consumer if it fails;
  keep database audit writes and alert on audit-write failure for critical
  mutations.
- **Production readiness impact:** Required for enterprise operations and
  regulated/customer data.

### P1 — Establish durable email delivery

- **Business impact:** Prevents lost or duplicated customer inquiries during
  SMTP outages.
- **Technical impact:** Current contact route waits for SMTP and has no
  durable retry/outbox.
- **Risk level:** Medium/High.
- **Components/files:** `api/contact.ts`, Prisma outbox migration, email worker,
  provider adapter, deployment secrets and queue metrics.
- **Implementation approach:** Add a transactionally persisted outbox,
  provider abstraction, bounded retries/dead-letter/manual replay, and
  provider-specific SMTP/OAuth configuration without hard-coding a vendor.
- **Validation procedure:** Test M365/Google/Zoho tenant policy in staging,
  TLS, transient/permanent failures, retry idempotency, throttling, and queue
  drain.
- **Rollback procedure:** Stop the worker without dropping queued rows; route
  inquiries to a manually monitored fallback during recovery.
- **Production readiness impact:** Required if contact inquiries are a
  customer-critical business process.

### P1 — CI supply-chain and deployment gates

- **Business impact:** Reduces chance of vulnerable or unreviewed code reaching
  production.
- **Technical impact:** Existing CI lacks verified SAST, secret/image scan,
  SBOM, signing, migration integration test, and environment approval.
- **Risk level:** High.
- **Components/files:** `.github/workflows/ci.yml`, package lock, image registry,
  release environment.
- **Implementation approach:** Add staged jobs with pinned actions, least
  privilege, disposable PostgreSQL migration tests, security scans, image
  provenance/SBOM, immutable digest, and manual production approval.
- **Validation procedure:** Exercise successful and intentionally failing
  sample gates; verify no PR job can access production secrets.
- **Rollback procedure:** Revert workflow changes while preserving existing
  checks; do not bypass failing required security checks to release.
- **Production readiness impact:** Mandatory deployment control.

### P1 — Instrument service telemetry

- **Business impact:** Shortens incident detection and recovery.
- **Technical impact:** No app-level OTel metrics/tracing/alerts currently
  verified.
- **Risk level:** Medium/High.
- **Components/files:** Node HTTP server, Prisma, collector, monitoring backends,
  [monitoring-guide.md](./monitoring-guide.md).
- **Implementation approach:** Add OTel SDK and collector with OTLP, bounded
  labels, redaction, metrics, traces, and alert rules; keep backend vendor
  optional.
- **Validation procedure:** Verify one full HTTP-to-DB trace, alert firing,
  redaction, collector outage behavior, and bounded memory.
- **Rollback procedure:** Disable export without affecting readiness or request
  handling.
- **Production readiness impact:** Required before operating without
  observability blind spots.

### P2 — Add AI registry only after data/security approvals

- **Business impact:** Enables controlled future automation without
  inadvertently executing unapproved agents.
- **Technical impact:** No registry/run store/provider abstraction presently
  exists; new persistence requires an additive Prisma migration.
- **Risk level:** Medium.
- **Components/files:** `prisma/schema.prisma`, additive migration, seed,
  provider-neutral agent service, authorization/audit policy.
- **Implementation approach:** Implement registry/run schema and derived
  metrics; register only the three named initial agents as enabled and all
  future placeholders disabled. Keep execution behind a default-off kill
  switch until approved.
- **Validation procedure:** Migration/rollback compatibility, role access,
  result redaction, run-limit and disabled-agent tests, metrics aggregation,
  evaluation and human approval.
- **Rollback procedure:** Disable execution and preserve run/audit data; revert
  UI/API exposure but do not drop populated tables.
- **Production readiness impact:** Not a prerequisite for the existing CRM
  launch; required before activating AI features.

### Remaining risks

- Database access, role privileges, migration state, and seed state are
  unverified because of P1000.
- Documents can be uploaded without malware scanning; disable customer
  uploads or keep them inaccessible until a fail-closed scan pipeline exists.
- There is no verified disaster-recovery path, tested restore, or measured RPO /
  RTO.
- Docker image execution and Bicep compilation/deployment are unverified in
  this environment.
- Proxy-derived rate-limit identity, SMTP/Redis production connectivity, and
  actual Azure managed-identity permissions have not been tested end-to-end.
- OpenTelemetry, service alerts, email queue/retries, and Linux distribution
  certifications are not implemented or evidenced.

### Remaining manual tasks

1. A database owner must rotate/correct credentials through the approved
   channel and run the four Linux verification scripts. Do not send secrets to
   the developer or put them in Git.
2. The DBA must approve a least-privilege app role, separate migration role,
   TLS policy, pool budget, backup, migration, and seed plan.
3. An Azure subscription owner must run `az bicep build`, deploy to a
   non-production resource group, and verify identity assignments, storage
   CORS, network boundaries, probes, logs, and Key Vault strategy.
4. A Linux release operator must build/start the image on an approved Linux
   host and attach Compose/container results; schedule RHEL/Rocky/Alma/Debian
   certification if those are advertised deployment targets.
5. Security and product owners must select malware scanning, retention/legal
   hold, durable email queue, telemetry retention, and AI data/provider
   policies before those features accept production data.
6. Release management must schedule database/Blob restore drills, security
   review, staging acceptance, owner sign-off, and on-call handover.

## 14. Deployment checklist

- [ ] Resolve P1000 and verify the intended database identity, TLS, schema,
  migrations, indexes, constraints, and seed state.
- [ ] Take and verify current PostgreSQL and Blob recovery points.
- [ ] Run unit, typecheck, production build, Bicep compile, Docker build/start,
  and staging health/security tests on Linux.
- [ ] Complete staging document malware scan, quarantine, access-control,
  retention, and cleanup tests before enabling uploads.
- [ ] Verify SMTP and Redis health/rate limiting under real platform ingress.
- [ ] Review Key Vault/secret references, identity scope, network access,
  custom TLS/domain, and external database firewall.
- [ ] Establish audit access, log redaction, alerts, on-call ownership, and
  tested incident/restore runbooks.
- [ ] Obtain application owner, DBA, Security, and Release Manager approvals.

## 15. Rollback checklist

- [ ] Record previous immutable image digest and deployment configuration.
- [ ] Confirm schema compatibility with previous application version.
- [ ] Stop traffic shift if liveness/readiness or error-rate gates fail.
- [ ] Roll back application revision without resetting/dropping database data.
- [ ] Preserve logs, audit events, queued emails, and quarantined documents.
- [ ] Restore database/Blob only under the approved DR procedure and only after
  target verification.
- [ ] Verify login, role boundaries, CRM/Jurivana workflows, upload/download,
  contact delivery, and health endpoints after rollback.

## 16. Disaster recovery summary

Current achieved RPO/RTO is **unknown**. Adopt the proposals in
[backup-guide.md](./backup-guide.md) only after business approval. Required
before launch: encrypted recoverable PostgreSQL backups, Blob versioning or
independent copies, protected keys, isolated restore test, verified checksums,
and measured time to service restoration.

## 17. Compliance considerations

Determine data controller/processor roles, data residency, lawful basis,
retention, deletion, consent, data-subject request, breach notification, and
cross-border transfer requirements for each launch jurisdiction. Legal requests,
identity documents, and customer uploads may contain sensitive personal or
privileged information. Apply least privilege, purpose limitation, encryption,
access logging, retention/legal hold, and incident notification obligations.
This technical audit is not legal advice or a compliance certification.

## 18. Go-live recommendation

**❌ NOT READY FOR PRODUCTION**

Release remains blocked until all P0 items are closed with evidence:

1. PostgreSQL authentication restored and live schema/migration/seed state
   verified.
2. A tested database and Blob backup/restore path with approved RPO/RTO.
3. Malware scanning/quarantine for externally uploaded documents, or uploads
   disabled until that control exists.
4. Successful Linux CI build, Prisma validation/migration integration,
   `az bicep build`, Docker build/start, and readiness/liveness tests.
5. Verified production ingress/proxy identity and role/resource access tests.

Before a full production customer launch, also close P1 email durability,
security/audit coverage, CI supply-chain gates, secrets/identity review,
observability/alerts, and distribution-specific compatibility claims. Do not
represent AI foundation or OS certification as complete until implemented and
tested; keep all AI execution disabled.
