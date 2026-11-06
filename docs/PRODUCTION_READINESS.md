# GIEMENS / Jurivana production readiness

**Assessment date:** 2026-11-07
**Release window:** Planned for 2026-11-08
**Verdict:** **❌ NOT READY FOR PRODUCTION**

## Executive decision

The existing application stack and deployment architecture are retained.
Jurivana remains a separate application. The GIEMENS `/ecosystem/jurivana`
page is informational and sends each call to action to the configurable
standalone Jurivana HTTPS origin (`VITE_JURIVANA_URL`, default
`https://jurivana.giemens.com`). GIEMENS does not proxy or embed the Jurivana
client portal.

The source contains the planned operational controls and the local build,
typecheck, Prisma generation/validation, and automated tests can be run here.
The deployment cannot be certified for tomorrow: live credentials and service
connectivity are not confirmed, the DB migration/seed have not been executed
against the release database, the Docker Linux engine is unavailable, Azure
CLI/Bicep validation cannot run, and there is no verified live restore or
monitoring drill. A release must stop until every blocker in this document is
closed with evidence.

## Readiness scores

Evidence scale: 0 = absent; 1 = materially blocked; 2 = implemented/static
evidence but unverified; 3 = verified in a representative staging environment;
4 = release-tested; 5 = production-tested with recurring evidence. Scores are
not compliance ratings.

| Area | Score | Evidence and gap |
|---|---:|---|
| Current readiness | **2/5** | Application controls are implemented; service integration and release execution are not certified. |
| Security | **2/5** | The existing Node HTTP middleware supplies Helmet-equivalent security headers/CSP, same-origin mutation checks, secure session settings, validation, RBAC, rate limits, audit records, secret preflight, and scanner gating. The Express Helmet package is not used. Live ingress, identity, scanning and vulnerability disposition remain. |
| Infrastructure | **1/5** | Compose and Bicep sources exist; neither the Docker engine nor Azure deployment toolchain is available for this certification. |
| Docker | **1/5** | Compose configuration can be parsed; Linux image build, container start/restart, networking and runtime probes cannot be exercised without Docker Engine. |
| Azure | **1/5** | Bicep source exists; `az bicep build`, deployment, Container Apps, managed identity, Blob, Key Vault and ACR authorization are not validated. |
| Database | **2/5** | User-provided baseline states the database/schema and prior migrations are healthy. The current commit adds a migration; it is not applied and seed rows/admin have not been verified against the release target. |
| SMTP | **2/5** | M365, Google Workspace, Zoho and custom SMTP adapter, bounded retry and health check are implemented and unit-tested. Real account verification/delivery is pending. |
| Observability | **2/5** | Structured logs, request/error/audit/startup metrics, authenticated Prometheus scrape and optional OTLP are implemented. Collector, dashboards, alerts and retention are not operationally verified. |
| Linux compatibility | **1/5** | Node 22 Linux container configuration is present; WSL has no installed Linux distribution in this workspace and no target Linux image was run. |
| Backup and recovery | **2/5** | PostgreSQL/Blob scripts and procedures exist; execution, protected destinations, scheduling and restore drills are not verified. |

## Confirmed source-level changes

- Startup environment validation rejects missing/placeholder database, SMTP,
  Blob, Redis and scanner values and enforces remote PostgreSQL TLS.
- Startup now verifies PostgreSQL, SMTP, Azure Blob container access, Upstash
  Redis and ClamAV before opening the HTTP listener.
- HTTP header hardening remains in the existing Node middleware; no Express
  middleware or framework change was introduced. Tests cover security headers
  and same-origin mutation rejection.
- `/ready` checks those same five dependencies and returns only `ready` or
  `not ready`; `/health`, `/healthz` and `/liveness` are process-only probes.
- The standalone Jurivana portal is reached using external links on the
  GIEMENS product information page. `VITE_JURIVANA_URL` must be an HTTPS
  origin; it defaults to `https://jurivana.giemens.com`.
- Document uploads remain quarantined until ClamAV approves them; cleanup is
  bounded and retention-configurable.
- Full automated audit previously reported four high-severity findings in the
  installed production graph through Prisma 6.19 config dependencies
  (`deepmerge-ts` and `effect`). The automated fix proposes a major Prisma 7
  upgrade and was not applied. Resolve through a tested supported update or
  formally approved exception before release.

## Blocking issues for deployment tomorrow

1. **Database migration and seed:** The local target
   `giemens/giemens_crm` was read-only verified to contain 14 tables and no
   users/roles. The one-time local seed succeeded with the random password in
   ignored `.env.development`; verification found the four default roles and
   one password-backed `SUPER_ADMIN`. The new migration attempt failed with
   PostgreSQL `42501` because the migration role is not the owner of
   `DocumentStatus`; Prisma recorded the migration failure, but catalog checks
   confirmed neither enum values nor `documents.updated_at` were applied.
   The migration identity must own or be authorized to alter the `documents`
   table as well as `DocumentStatus`. The DB owner must verify the failed
   migration has no partial DDL, resolve the failed migration record as rolled
   back, and re-run deployment using the authorized migration owner.
   Production DB status/seed are not certified.
2. **Real environment configuration:** `.env.development` and
   `.env.production` are ignored local files, generated with placeholders for
   external systems. Replace all placeholder endpoints and credentials via
   approved secret management. Do not copy secrets into Git or support tickets.
3. **Docker certification:** Docker Desktop reports that
   `dockerDesktopLinuxEngine` is unavailable; WSL reports no installed Linux
   distributions. Image build, `compose up`, restart, external networking and
   probes are unverified.
4. **Azure certification:** `az` is unavailable. Bicep compile/deployment and
   Container Apps, ACR, managed identity, Blob access and Key Vault/secret
   references remain unverified. The current Bicep does not provision a Key
   Vault; document and verify the chosen external secret-reference mechanism.
5. **Live dependency readiness:** The new active health checks are covered by
   unit-level dependency orchestration tests only. Startup and `/ready` need a
   staging run with the actual database, SMTP, Blob, Redis and ClamAV services.
6. **SMTP:** Perform provider authentication, sender authorization and a
   controlled inquiry delivery test. Confirm tenant SMTP AUTH policy.
7. **Document security:** Deploy a private, updated ClamAV service; apply the
   migration; test clean/infected/unavailable paths; schedule and observe the
   cleanup job before accepting customer uploads.
8. **Observability:** Configure the OTLP receiver and authenticated
   Prometheus/Grafana/Loki-compatible services; validate alert delivery,
   sensitive-field redaction, retention and recovery.
9. **Backup/DR:** Configure encrypted off-host PostgreSQL and Blob backups;
   complete isolated restores, reconcile document hashes, and approve measured
   RPO/RTO and retention.
10. **Security/dependency release gate:** Close or formally accept the four
    high audit findings; review TLS, ingress, cookie, CSRF, CSP, secret-store,
    RBAC, rate-limit and audit-retention behavior on the release host.
11. **Standalone domain:** Verify DNS, TLS certificate, production app
    availability and all three links at `https://jurivana.giemens.com`. Verify
    that the GIEMENS site has no reverse proxy or embedded Jurivana app.

## Required manual actions and ownership

| Owner | Required action | Evidence |
|---|---|---|
| DBA | Confirm target, TLS, backup; apply migration; run one-time seed; verify roles/admin | Sanitized migration status and row counts; no password/hash |
| Release engineer | Populate protected environment settings; build/launch Linux image; test restart/network/probes | Build digest, Compose status and probe results |
| Azure administrator | Install/login CLI; compile Bicep; validate non-production deployment and identity/storage access | Bicep build/validation and permission checks |
| Email owner | Verify SMTP account, authorized sender and controlled delivery | Health result and recipient confirmation |
| Security owner | Triage dependency findings; certify ingress, secret references and content controls | Approved scan/exception and configuration review |
| SRE/operations | Configure alerts, backups, cleanup schedule and complete restore drill | Alert test, backup checksums and timed restore evidence |
| Product owner | Confirm Jurivana standalone DNS/certificate and request-demo destination behavior | External link smoke-test record |

## Final recommendation

**❌ NOT READY FOR PRODUCTION.** Do not route production traffic tomorrow unless
all eleven blockers above are closed, their evidence is reviewed, and Release
Management records a Go decision. Code-level green checks cannot substitute
for an unavailable Docker engine, live Azure/database credentials, service
health, or a tested recovery.

See [GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md),
[DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md),
[ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md), and
[backup-guide.md](./backup-guide.md).
