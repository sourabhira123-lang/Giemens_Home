# GIEMENS Go-Live Plan — 2026-11-09

## Final verdict

❌ NOT READY FOR VERCEL PRODUCTION DEPLOYMENT TODAY

The application code is substantially release-ready, but deployment is not
authorized by the evidence available in this workspace. The remaining gates
are the failed local database authentication check (production database state
is therefore unverified here), unconfigured/unknown Vercel production
secrets and verified contact mailboxes, an unresolved high-severity dependency
audit exception, and unverified Vercel/DNS/SSL production checks.

## Current readiness score

**60/100 — 6 of 10 release gates verified.** Gates counted as verified:

1. `npm install` exits successfully on the supported Node 22 runtime.
2. Prisma 6.19.3 generation and schema validation succeed.
3. TypeScript check passes with zero errors.
4. Production build, 35 prerendered routes, and the 35-route sitemap succeed.
5. All 45 automated tests pass.
6. Jurivana landing-page source, external URL configuration, generated page,
   sitemap entry, and Vercel rewrite are present.

Not verified: production database/migration access, actual Vercel production
environment values, an approved security exception/remediation for the
remaining audit findings, and the live Vercel/DNS/SSL release checks.

## Blocker summary

| Blocker | Current result | Release status |
|---|---|---|
| 1. TypeScript | Prisma regeneration removed all 14 reported errors; `tsc --noEmit` passes | Resolved in this worktree |
| 2. Prisma consistency | Root schema validates and emits all required enum exports; local migration status hit P1000 | Client/schema resolved; database state still unverified |
| 3. Production environment | Local templates now have the requested origins; Vercel secrets and verified mailbox addresses are not available here | Open |
| 4. Security audit | Prisma 6 patch update fixed the Effect advisory; three high audit entries remain for the deepmerge-ts issue | Open pending fix or approved exception |
| 5. Vercel readiness | Build settings and Jurivana static rewrite are configured and locally checked; no live deployment was performed | Open pending Vercel verification |
| 6. Jurivana routing | `/ecosystem/jurivana` is a standalone product landing page whose three actions use `VITE_JURIVANA_URL` | Resolved in code; live destination still needs smoke test |

## Blocker 1 — TypeScript failures

### Root cause

The checked-in root Prisma schema already declares the requested enums and
models, but the generated Prisma Client in `node_modules` did not match that
schema. This produced missing exports and cascading implicit-`any` callback
parameters. The application code did not need unsafe casts or type
workarounds.

### Files and exact changes

- `prisma/schema.prisma` is the schema used by the package scripts; no schema
  change was needed.
- Regenerated the ignored Prisma Client using `npm run prisma:generate`.
- Updated the locked Prisma packages to the compatible 6.19.3 patch release;
  aligned the explicitly allowed Prisma lifecycle scripts in `package.json`.
- No TypeScript source files were changed.

The 14 failures were in `api/crm.ts`, `api/documents.ts`, `server/auth.ts`,
and `src/features/leads/repository/PrismaLeadRepository.ts`: absent enum and
Prisma type exports, plus callback parameters that became implicit `any`
because those client types were unavailable.

### Validation and expected result

```powershell
npm run prisma:generate
npm run typecheck
```

Observed: Prisma Client **6.19.3** generated successfully; typecheck exited
zero and emitted no TypeScript errors.

### Rollback and production impact

If a later release regression is attributable to the Prisma patch, roll back
the application to the previous immutable Vercel deployment and revert the
release commit containing `package.json` and `package-lock.json`; regenerate
the client from the reverted lockfile before rebuilding. This change does not
alter database data or schema.

## Blocker 2 — Prisma Client, schema, and migration history

### Root cause and exact Prisma fix

The canonical schema for all package scripts is `prisma/schema.prisma`.
`npm run prisma:generate` explicitly targets it. A separate
`database/prisma/schema.prisma` is present but is not the schema selected by
the Prisma scripts; do not generate or migrate from that duplicate during
this release.

No Prisma schema edits or migrations were required. Regenerating from the
root schema exports:

- `LeadStatus`
- `BusinessDivision`
- `TaskStatus`
- `ProjectStatus`
- `JurivanaRequestType`
- `JurivanaRequestStatus`
- `DocumentCategory`
- `DocumentStatus`

### Validation and observed result

```powershell
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm exec --yes --package=node@22 -- prisma migrate status --schema=prisma/schema.prisma
```

Schema validation succeeded, generation succeeded, and typecheck passed.
The read-only migration-status command **did not verify migration history**:
it failed with Prisma `P1000` authentication against the workspace's local
PostgreSQL at `127.0.0.1:5432` for database `giemens` / schema
`giemens_crm`. No migration or database write was attempted. This contradicts
the supplied prior verification note for this workspace; confirm the
approved production database credentials and migration status from the
authorized release environment before deployment.

### Rollback and production impact

This work applies no migration, so there is no database rollback to perform.
Do not run `migrate reset`. If production reports pending migrations, stop
and follow the DBA-approved migration procedure and backup/restore runbook;
roll back application code independently. Prisma is used by API handlers, so
the generated client must match the production schema before traffic is
enabled.

## Blocker 3 — Production environment configuration

### Root cause and exact files

The production site origin was not consistently available to the build,
preventing reliable canonical metadata and sitemap generation. Updated:

- `.env.example`: set `VITE_SITE_URL=https://giemens.com` and documented
  verified-email placeholders.
- `scripts/generate-env.mjs`: changed its local production template to
  `https://giemens.com` and stopped generating Jurivana example-domain email
  values.
- `scripts/validate-env.mjs`: production Vercel builds now require
  `VITE_JURIVANA_URL` as well as `VITE_SITE_URL`.
- Generated ignored `.env.production` and `.env.development` files with
  `npm run env:generate`. They are excluded by `.gitignore`; they are not
  Vercel secrets or deployable production credentials.

### Exact Vercel Production variables

Set these in the Vercel project's **Production** environment. Do not commit
values or copy template placeholders into Vercel.

**Required Vercel production configuration**

```text
VITE_SITE_URL=https://giemens.com
VITE_JURIVANA_URL=https://jurivana.giemens.com
CONTACT_FROM_EMAIL=<personal email address>
CONTACT_TO_EMAIL=<personal email address>
```

`VITE_CONTACT_ENDPOINT=/api/contact` is optional and is the client default.
The Vercel build does not require the standalone server's database or
authentication settings. `DATABASE_URL` and `AUTH_RATE_LIMIT_SECRET` remain
required when running the full CRM/authenticated Node server.

**Optional integrations**

Set complete credentials only when enabling each integration:

```text
SMTP_HOST                     # custom provider; named providers have defaults
SMTP_PORT                     # optional; default 587
SMTP_PROVIDER                 # custom, microsoft365, google-workspace, zoho
SMTP_USER
SMTP_PASSWORD
UPSTASH_REDIS_REST_URL        # HTTPS
UPSTASH_REDIS_REST_TOKEN
CLAMAV_HOST
CLAMAV_PORT                   # optional; default 3310
AZURE_STORAGE_ACCOUNT_URL
AZURE_STORAGE_CONTAINER
```

If an optional integration is missing or incomplete, its validator emits a
warning and the build proceeds. Readiness reports each as `disabled`. Contact
leads are persisted to PostgreSQL without SMTP, but no email notification is
sent; the form reports that status. Without Redis, form APIs use a bounded
per-instance rate limiter. Document workflows still require Blob Storage and
ClamAV.
Configure `ADMIN_EMAIL`, `ADMIN_NAME`, and a unique `ADMIN_PASSWORD` only
through the approved secret store if production bootstrap/seed is required.
`METRICS_AUTH_TOKEN` is optional; when set it must be at least 32 bytes.
Add OTLP and retention settings only when those services/features are enabled.

### Validation and expected result

The validator was exercised with disposable, non-production values and
reported `Build environment validation passed.` A local production build
also passed with the ignored local template and generated the sitemap.
These checks do **not** prove that Vercel has verified contact mailbox values,
or that any optional integration has been activated and can deliver/serve
traffic.

Before release, run the production build in Vercel with the actual protected
variables. Expected output includes:

```text
Build environment validation passed.
SMTP not configured. Contact notifications disabled.
Redis integration disabled
ClamAV integration disabled
Blob Storage integration disabled
Generated HTML metadata for 35 routes.
Generated sitemap.xml with 35 routes.
```

### Rollback and production impact

If configuration breaks a release, restore the previous Vercel environment
values and promote the previous deployment. Never commit `.env.production`
or paste secrets into logs. Incorrect database, SMTP, storage, or rate-limit
values can disable API operations; incorrect public origins can produce
incorrect canonical URLs and Jurivana links.

## Blocker 4 — Security audit findings

### Findings and disposition

The initial audit reported four high-severity dependency entries. Updated the
Prisma packages only within the existing Prisma 6 line, from 6.19.0 to
6.19.3. This updates Effect to 3.21.0, outside the affected `<3.20.0` range.
The remaining audit output is:

| Package entry | Severity | Finding / dependency path | Disposition |
|---|---|---|---|
| `deepmerge-ts` | High | GHSA-ggr8-5vv4-36mx; stack exhaustion on recursive object graphs; affected `<8.0.0` | Still present as Prisma config dependency |
| `@prisma/config` | High | Transitive impact from vulnerable `deepmerge-ts` | Still reported |
| `prisma` | High | Transitive impact through `@prisma/config` | Still reported |
| `effect` | Previously high | GHSA-38f7-945m-qr2g; affected `<3.20.0` | Fixed by Prisma 6.19.3 / Effect 3.21.0 |

After the patch update, both `npm audit` and `npm audit --omit=dev` report
**three high entries**, all for the deepmerge-ts advisory chain, and exit
nonzero. npm's proposed automatic fix is a Prisma 7.10.1 major upgrade.
That major upgrade was deliberately not applied. The available Prisma
6.19.3 config dependency still uses `deepmerge-ts` 7.1.5; a forced transitive
override is not recommended without Prisma compatibility testing.

### Is this deploy-blocking?

There is no identified request handler that directly invokes Prisma config
merging, and the reported stack-exhaustion condition requires recursive
configuration input rather than ordinary application traffic. However, the
dependency remains in the install graph (including `npm audit --omit=dev`)
and can affect trusted build/Prisma CLI configuration processing. The audit
gate is not clean. Treat it as a **release-policy blocker until the CISO or
security owner records a time-bounded risk exception**. Do not call it
remediated or silently suppress the audit.

### Remediation recommendation, files, validation, rollback, impact

- Files: `package.json` and `package-lock.json`; current Prisma schema and
  application sources need no security-driven change.
- Keep the tested Prisma 6.19.3 patch. For a release today, document approval,
  owner, expiry, trusted-build restrictions, and a tracked update date.
- Avoid untrusted Prisma config changes in build jobs; restrict release builds
  to reviewed commits and preserve the lockfile/build provenance.
- Re-run `npm audit` and `npm audit --omit=dev` when Prisma publishes a
  compatible Prisma 6 fix for the deepmerge dependency. Review and test that
  patch before deployment. Handle a Prisma major upgrade as a separate,
  explicitly tested change.
- Validation: current audit result is **3 high, 0 critical**; it is not a
  passing zero-vulnerability audit.
- Rollback: restore the previous tested app deployment and dependency lock
  from the release commit if the patch causes an application regression.
  Do not use `npm audit fix --force` as a rollback or remediation.
- Production impact: no UI change; Prisma CLI/config processing remains the
  known exposure. Exception approval is needed before treating this gate as
  accepted.

## Blocker 5 — Vercel production readiness

### Root cause

The existing Vercel file specified the Vite build and `dist` output but did
not declare the requested install command or an explicit mapping for the
prerendered nested Jurivana route. The live Vercel project settings and
deployment are not accessible from this workspace.

### Exact project configuration

`vercel.json` now explicitly sets the requested install/build/output values
and the prerendered Jurivana route:

```json
{
  "framework": "vite",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/ecosystem/jurivana",
      "destination": "/ecosystem/jurivana/index.html"
    }
  ]
}
```

The existing API function durations, route mappings, and security headers
remain in `vercel.json`. `package.json` declares Node `22.x`; set the Vercel
project runtime to Node 22. Leave Jurivana deployed separately.

### Validation and expected result

The JSON config and target rewrite were parsed and checked. `npm run build`
completed, generated metadata for 35 routes, wrote a 35-URL sitemap, and
confirmed the Jurivana canonical URL and robots sitemap.

Local Vite preview does not apply Vercel rewrites: direct
`/ecosystem/jurivana` preview lookup returned the root HTML, while the
prerendered file exists at `dist/ecosystem/jurivana/index.html`. The explicit
Vercel rewrite targets that prerendered file. A live Vercel preview/production
smoke test is still required; none was run from this workspace.

Vercel Build & Development Settings:

```text
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
Node.js Version: 22.x
```

### Rollback and production impact

If a deployment fails, promote the last known-good Vercel deployment and
revert this release's `vercel.json` change only through a reviewed code
rollback. No database migration is part of this routing/configuration change.
Incorrect output or route settings can break static pages, SEO metadata, or
the Jurivana landing-page route.

## Blocker 6 — Jurivana routing

### Root cause and exact files

The application already defined the Jurivana product page and its external
actions, but Vercel had no explicit rewrite for the nested
`/ecosystem/jurivana` prerendered HTML path. The route and metadata are in
`src/App.tsx`, `src/pages.tsx`, and `src/page-meta.json`; its prerendered file
is produced by `scripts/prerender-routes.mjs`. Added the single static mapping
to `vercel.json`.

`/ecosystem/jurivana` and `/jurivana` render the existing Jurivana product
landing page, not the Jurivana application. In `src/pages.tsx`, Launch
Jurivana, Request Demo, and Login To Jurivana all use
`import.meta.env.VITE_JURIVANA_URL` (fallback:
`https://jurivana.giemens.com`). No Jurivana codebase or backend was added.
The Vercel rewrite serves the generated route-specific HTML.

Validation confirmed the route's prerendered title/canonical, sitemap entry,
and compiled `https://jurivana.giemens.com` origin. Before production, open
each action and verify the external Jurivana application and its TLS
certificate are live. Roll back the Vercel deployment if the landing route
or external links are wrong; this site release must not change Jurivana's
deployment.

## Final validation checklist

Run from the release commit using Node 22:

| Command | Expected result | Current evidence |
|---|---|---|
| `npm install` | Exit 0; packages up to date. npm reports 3 high audit entries; this is separately gated above. | Passed; `up to date, audited 250 packages` |
| `npm run prisma:generate` | Exit 0; generate Prisma Client 6.19.3 from `prisma/schema.prisma`. | Passed; all eight enum exports verified |
| `npm run typecheck` | Exit 0; no TypeScript errors. | Passed |
| `npm run build` | Exit 0; environment validation passes, 35 metadata routes and 35 sitemap URLs generated. | Passed locally |
| `git status --short` | Only intentional release-plan/code/lockfile modifications; ignored environment files and build artifacts do not appear. | Check again before commit/deploy |

Additional release checks:

```powershell
npm test
npm run prisma:validate
npm audit
npm audit --omit=dev
npm exec --yes --package=node@22 -- prisma migrate status --schema=prisma/schema.prisma
```

Current results: 45/45 tests pass; Prisma schema validates; audit reports
three high findings; migration status fails locally with P1000 and must be
re-verified against the approved production database.

`npm install` also warns that the `protobufjs@7.6.6` postinstall is not in the
script allowlist. Its inspected script only checks the dependency's version
scheme; it was not approved or executed, and the application build and test
suite pass without it.

## Deployment checklist

- [ ] Resolve the production database authentication/state discrepancy with
      the DBA; verify migration status before any write.
- [ ] Set all required Vercel Production variables to actual, protected
      values; replace contact placeholders with verified sender/recipient
      mailboxes.
- [ ] Obtain and record the time-bounded security exception for the remaining
      Prisma/deepmerge audit entries, or wait for and validate a supported
      fix.
- [ ] Run the final build in Vercel with actual production variables.
- [ ] Verify `giemens.com`, contact form, API health/readiness, database,
      email delivery, rate limiting, document storage/scanning, and logs.
- [ ] Verify `/ecosystem/jurivana` returns its route-specific page and all
      three actions reach the standalone Jurivana application.
- [ ] Keep Jurivana's deployment and database out of this release.
- [ ] Record the deployed commit, Vercel deployment ID, approvals, and
      previous deployment ID for rollback.

## Vercel checklist

- [ ] Framework Vite; install `npm install`; build `npm run build`; output
      `dist`; Node 22.x.
- [ ] Production environment variables are present, scoped to Production,
      and contain no placeholders.
- [ ] Preview deployment passes route, API, and security-header smoke tests.
- [ ] Production deployment uses the approved commit and configured domain.
- [ ] Rollback deployment is available and the release owner knows how to
      promote it.

## DNS checklist

- [ ] In Vercel Domains, add `giemens.com` and the desired `www` hostname and
      copy the exact records Vercel presents; do not guess or overwrite
      unrelated records.
- [ ] Remove conflicting apex A/AAAA or `www` CNAME records only after
      confirming ownership and the Vercel target.
- [ ] Verify DNS resolution for `giemens.com` and `www.giemens.com` from
      public resolvers after propagation.
- [ ] Verify `jurivana.giemens.com` continues resolving to its existing
      standalone service; do not point it at this Vercel project.

## SSL checklist

- [ ] Wait for Vercel domain verification and certificate issuance.
- [ ] Check HTTPS and certificate hostname/validity for `giemens.com` and
      `www.giemens.com`; confirm HTTP redirects to the canonical HTTPS origin.
- [ ] Independently verify HTTPS for `jurivana.giemens.com` before users
      follow the external actions.
- [ ] Confirm the existing HSTS `includeSubDomains` header is safe for every
      GIEMENS subdomain in use before launch.

## Rollback checklist

- [ ] Keep the previous successful Vercel deployment ID and known-good commit.
- [ ] If health checks fail, promote the previous Vercel deployment and
      restore the prior environment-variable version.
- [ ] Verify apex/`www` routing, the previous static pages, and API health
      after rollback.
- [ ] Do not roll back database state automatically. This change includes no
      migration; if a separate migration was run, stop and use the DBA's
      reviewed recovery plan. Never use `migrate reset` in production.
- [ ] Keep Jurivana's deployment, DNS, and rollback independent.

## Production impact

The validated code changes do not redesign the application or change its
branding, UI, feature set, or database schema. They correct generated Prisma
types, pin a compatible Prisma 6 patch, define the production site origin,
fail early when the production Jurivana origin is absent, and explicitly map
the Jurivana landing-page route. Production launch remains blocked by the
open gates above.
