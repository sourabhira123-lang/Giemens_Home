# GIEMENS / Jurivana go-live certification

**Certification date:** 2026-11-07
**Planned release:** 2026-11-08
**Current verdict:** **❌ NOT READY FOR PRODUCTION**

## Certification scope

This certification uses evidence available from the current source tree and
local Windows environment. It does not claim that external production services
are healthy. The intended architecture remains unchanged: GIEMENS presents
corporate and product information; Jurivana is a separate application. The
GIEMENS Jurivana page provides an overview and external CTAs using
`VITE_JURIVANA_URL` (default `https://jurivana.giemens.com`).

## Automated checks and evidence

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | Passed | Completed after the portal/readiness changes. |
| `npm test` | **45 passed, 0 failed** | Includes readiness dependency orchestration tests. |
| `npm run build` | Passed | Vite build and prerender produced metadata/sitemap for 35 routes. |
| `npm run prisma:validate` | Passed | Prisma 6.19 prints a `package.json#prisma` deprecation notice. |
| `npm run prisma:generate` | Passed | Prisma Client generated successfully. |
| `prisma migrate status` | **FAIL — pending/failed migration** | Migration attempt returned PostgreSQL `42501`; migration user is not owner of `DocumentStatus`. |
| `npm run db:verify` | Passed | Read-only check found all 14 expected application tables. |
| `npm run prisma:seed` | Passed on local DB only | Created 4 roles and the configured local administrator using the generated ignored password. Counts confirmed one user and one password-backed `SUPER_ADMIN`; production remains unverified. |
| `docker compose config --quiet` | Passed for development and production env files | Compose service is `giemens`. |
| `docker build` / `docker compose up` / restart | Blocked | Docker Engine pipe is unavailable and WSL has no installed Linux distribution. |
| `/health`, `/ready`, `/liveness` | Unit-tested | Active checks require database, SMTP, Blob, Redis and ClamAV; only the local database was contacted. |
| `npm run email:health` | Failed before network verification | SMTP environment credentials are absent in this shell; no real provider check was made. |
| Blob health | Not run against live Azure | Startup/readiness verifies the container properties with workload identity. |
| `az bicep build` / Azure deployment | Blocked | Azure CLI not available in this workspace. |
| Backup/restore | Not run against actual services | Run isolated database and Blob restore drills first. |

## Certification gates

All gates are mandatory; a local build alone is not a release certificate.

- [ ] Exact release commit is built with Node 22 and release environment
      variables; `npm run typecheck`, `npm test`, `npm run build`,
      Prisma validate/generate all pass.
- [ ] `prisma migrate status --schema=prisma/schema.prisma` confirms the
      expected release DB and applied history; the new
      `20261107000000_document_malware_status` migration has a reviewed backup
      and is deployed successfully.
- [ ] Run `npm run prisma:seed` once only after the DBA and release owner
      confirm the target. Verify `ADMIN`, `EMPLOYEE`, `MANAGER`,
      `SUPER_ADMIN` and the approved admin without displaying a password or
      password hash.
- [ ] Compose config, image build, container startup, restart, health check,
      outbound network and shutdown pass on a Linux Docker Engine. There are no
      local persistent app volumes; PostgreSQL and Blob are external.
- [ ] `/health` and `/liveness` return HTTP 200. `/ready` returns 200 only
      when database, SMTP, Blob, Redis and ClamAV are healthy; prove failure
      returns 503 without leaking credentials/provider detail.
- [ ] SMTP provider login/verification and one controlled inquiry delivery
      pass. Sender is authorized for the chosen M365, Workspace, Zoho or
      custom account.
- [ ] Managed identity can read the configured private Blob container and the
      app can complete upload, signature/hash validation, ClamAV scan and
      authorized download. Infected and scanner-failure cases remain blocked.
- [ ] Azure CLI is tenant/subscription-confirmed; `az bicep build` and
      non-production validation pass. Container Apps probes, ACR pull, managed
      identity, Blob permissions, network path and secret references are
      independently checked. Key Vault integration is not declared in the
      current Bicep and needs an approved secret mechanism.
- [ ] Production OTLP, metrics scrape auth, dashboards, logs, alerts,
      redaction and retention are tested.
- [ ] Encrypted off-host DB/Blob backups and isolated restore drills pass;
      approved RPO/RTO are supported by measured runs.
- [ ] Dependency audit findings are resolved via supported updates or an
      explicitly approved, time-bound risk exception. Four high findings were
      reported in the installed production dependency graph; automatic fix
      requires a breaking Prisma 7 upgrade.
- [ ] The standalone portal FQDN resolves to the Jurivana application with a
      valid certificate. Launch, login and demo links use the approved
      destination, and the GIEMENS page does not proxy/host the client app.
- [ ] Release manager, product owner, DBA, security and on-call SRE sign off;
      rollback image/configuration and incident contacts are ready.

## External blockers confirmed in this workspace

1. Docker cannot connect to `dockerDesktopLinuxEngine`; WSL reports no
   installed Linux distributions.
2. `az` is not installed, so Bicep compilation and Azure authentication cannot
   be performed here.
3. This certification did not use production database, SMTP, Redis, Blob,
   ClamAV or OTLP credentials. The local migration failed on type ownership;
   the local seed succeeded and is not production evidence.
4. No restore drill or external monitoring/alert test is available as
   evidence.
5. Four high dependency advisories need a supported fix or accepted exception.

## Decision

**❌ NOT READY FOR PRODUCTION.**

The listed gates remain release-blocking. The local migration failed because
the connected migration principal does not own the PostgreSQL
`DocumentStatus` type. No migration DDL was applied; the failed migration
record remains and must be cleared by an authorized DBA only after confirming
no partial changes, then deployed with the approved owner role. The local
seed succeeded on the empty development database only. Re-certify production
after the actual target migration, seed and dependency probes are verified.

See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md),
[DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md), and
[ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md).
