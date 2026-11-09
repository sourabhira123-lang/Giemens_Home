# GIEMENS Corporate Website

## Local development

```bash
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

For local PostgreSQL and Prisma setup, follow
[the database setup guide](./docs/local-postgresql-setup.md). Set
`DATABASE_URL` in the ignored `.env` and `.env.local` files to your local
database, replacing the password placeholder locally. Prisma CLI reads `.env`;
Vite reads `.env.local`. Never commit either file or paste database credentials
into chat. CRM migrations are scoped to the `giemens_crm` schema.
Database authentication is currently pending. Do not run migrations or seed
until valid PostgreSQL credentials are available. See the migration checklist
in [the deployment guide](./docs/deployment.md).
For admin login and role permissions, see
[the authentication guide](./docs/authentication.md).

For the production-readiness verdict, database recovery gates, Linux
certification, monitoring, and backup/restore procedures, start with
[the production readiness assessment](./docs/PRODUCTION_READINESS.md).
The latest deployment gate and blocker evidence is in the
[go-live certification](./docs/GO_LIVE_CERTIFICATION.md).

`npm run dev` starts the Vite website. To run the Vercel serverless contact
function locally, add the required development credentials to `.env.local`,
then run `npx vercel dev`. Opening the site with
`npm run dev` alone serves only the frontend; Vite does not execute the
serverless `/api/contact` function. Vercel CLI may ask you to authenticate or
link the project. Do not enter production secrets into a public or shared
environment.

## GitHub push on commit

This workspace is configured to push the current branch to `origin` after each
Git commit. To enable the same behavior in another clone, run:

```bash
git config core.hooksPath .githooks
```

Changes must still be committed explicitly; saving a file does not create or
push a commit. GitHub authentication must be configured for pushes to succeed.

## Environment variables

Configure these in the deployment platform's secret/environment settings.
Values in the browser must use the `VITE_` prefix; never put API keys in a
`VITE_` variable.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SITE_URL` | Required for Vercel production | Public HTTPS site origin; used for canonical tags and sitemap URLs. |
| `VITE_JURIVANA_URL` | Required for Vercel production | HTTPS origin for the standalone Jurivana application. |
| `VITE_CONTACT_ENDPOINT` | Optional | Same-origin contact API path; defaults to `/api/contact`. |
| `DATABASE_URL` | Required for CRM and admin server runtime | PostgreSQL connection URL for the `giemens_crm` schema. |
| `AUTH_RATE_LIMIT_SECRET` | Required for authenticated server runtime | Random secret of at least 32 bytes for hashing login rate-limit keys. |
| `SMTP_HOST` | Optional | SMTP relay hostname; custom providers need a host, named providers have defaults. |
| `SMTP_PORT` | Optional | SMTP port; defaults to `587` and uses implicit TLS on port `465`. |
| `SMTP_USER` | Optional | SMTP authentication username; SMTP is disabled unless credentials are configured. |
| `SMTP_PASSWORD` | Optional | SMTP authentication password; keep it in a secret store. |
| `CONTACT_TO_EMAIL` | Required for Vercel production | Personal or company destination address; no email is sent while SMTP is disabled. |
| `CONTACT_FROM_EMAIL` | Required for Vercel production | Personal or company sender address for future SMTP delivery; no email is sent while SMTP is disabled. |
| `UPSTASH_REDIS_REST_URL` | Optional | HTTPS REST URL for Upstash distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Secret Upstash REST token; Redis is disabled unless URL and token are configured. |
| `TRUST_PROXY_HOPS` | Optional | Number of trusted reverse proxies in front of the Node runtime; leave at `0` unless configured and network-restricted. |
| `AZURE_STORAGE_ACCOUNT_URL` | Optional | HTTPS Blob account endpoint; Azure production uses managed identity. |
| `AZURE_STORAGE_CONTAINER` | Optional | Private Blob container name; configure with the account URL to enable document storage. |
| `CLAMAV_HOST` | Optional | Private ClamAV daemon; configure to enable document scanning. |

Missing optional integrations emit a warning and do not block a Vercel build.
Readiness reports unconfigured SMTP, Redis, ClamAV, and Blob Storage as
`disabled`. When SMTP is absent, lead submissions are still saved to
PostgreSQL and the contact API explicitly reports that email notifications are
disabled; no email is sent. Without Redis, contact and lead APIs use a bounded,
per-instance fallback rate limiter (five attempts per IP per 15 minutes); use
Redis for shared rate limits across serverless instances. Document workflows
that depend on Blob Storage or ClamAV remain unavailable until those
integrations are configured. Keep credentials in the deployment platform's
secret store and rotate them if exposed.

The project targets Node.js 22.x on Vercel. Its npm `allowScripts` policy
approves the locked `esbuild` install script required to install esbuild's
platform binary; update that pinned approval when intentionally upgrading
esbuild.

## Tests and production build

```bash
npm run typecheck
npm test
npm run prisma:validate
npm run prisma:generate
npm run build
npm audit --omit=dev --omit=optional --omit=peer
```

The build validates the public URL and contact endpoint, emits a metadata-ready
HTML entry for every route, and generates `dist/sitemap.xml` plus the sitemap
directive in `dist/robots.txt` when `VITE_SITE_URL` is configured. A Vercel
Production build fails if those public URL settings are missing.

## Deployment

The repository includes a Docker image that serves the prerendered Vite site
and the existing `/api/*` handlers from one Node.js process. See
[the deployment guide](./docs/deployment.md) for Azure, AWS, DigitalOcean, and
VPS steps. Vercel remains supported via `vercel.json`.
Linux operators can use the database verification scripts
`scripts/connect-db.sh`, `scripts/db-health.sh`,
`scripts/migration-check.sh`, and `scripts/verify-db.sh` after supplying
`DATABASE_URL` through a protected environment or ignored `.env` file.

The contact API saves leads before attempting email delivery. Without SMTP, it
does not send an email and reports this state explicitly after lead persistence.
When SMTP is configured, it sends plain-text inquiries through the relay and
reports delivery success only after acceptance. It validates request origin,
content type, size, fields, phone/email formats, honeypot and rate limits.

## Owner review before launch

- Confirm the exact legal company name, brand relationship, advertised
  capabilities and whether each listed service is currently available.
- Supply and verify the actual receiving mailbox and SMTP sender identity.
- Have the Privacy Policy, Terms and Disclaimer reviewed for the operating
  jurisdictions, actual data retention/processor practices and applicable
  regulations. Current copy is general website information, not legal advice.
- Review the external Unsplash photography and Google Fonts usage/licensing and
  replace or approve the selected assets.
- Add any real registered address, phone, or public contact details only after
  the owner provides and approves them.
