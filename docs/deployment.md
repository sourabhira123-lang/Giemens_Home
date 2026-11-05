# Deployment guide

This repository supports two deployment modes:

- **Vercel:** Vite static output plus the existing Vercel serverless API
  functions.
- **Containers:** the Docker image serves the prerendered site and existing
  `/api/*` handlers from one Node.js 22 process. The same image can run on
  Azure, AWS, DigitalOcean, and a VPS.

The container runtime does not run database migrations automatically. Apply
reviewed migrations as a separate release step before shifting traffic.

## Production prerequisites

Provision PostgreSQL with network access from the app and the `giemens_crm`
schema, Upstash Redis for distributed rate limiting, a working SMTP relay, and
a verified sender/recipient mailbox. Keep secrets in the platform's secret
store; do not put production credentials in `.env`, a container image, or
GitHub Actions logs.

Set these variables in the platform:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL for the active Prisma schema and `giemens_crm` schema. |
| `VITE_SITE_URL` | Public HTTPS origin; supplied as a Docker build argument to generate canonical metadata and sitemap URLs. |
| `AUTH_RATE_LIMIT_SECRET` | At least 32 bytes; used to hash login rate-limit keys. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP relay connection/authentication. |
| `SMTP_PORT` | Optional; defaults to `587`. Port `465` uses implicit TLS. |
| `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | Real inbox and SMTP-authorized sender. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | HTTPS Upstash REST credentials for contact/lead rate limits. |
| `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER` | Private Blob account endpoint and container for document upload/download SAS URLs. The Azure template provisions the container and managed identity permissions. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies; keep at `0` unless requests can only reach the app through that proxy chain. |

This app uses opaque, random, database-backed sessions with hashed tokens and
secure cookies, not JWTs. A `JWT_SECRET` is therefore not used. Passwords and
sessions require a reachable PostgreSQL database.

## Database release steps

Use the root `prisma/schema.prisma` and `prisma/migrations` as the active
application migration source. `database/prisma/schema.prisma` is a separate
architecture blueprint and is not used by the current package scripts.

**Current status: pending.** Local PostgreSQL authentication previously
returned Prisma `P1000`. Do not run deployment, migration, seed, or table
verification commands until the database owner provides valid credentials.
The app and schema work can continue without database access.

Once credentials are available, update the ignored root `.env` file locally:

```dotenv
DATABASE_URL="postgresql://postgres:<URL-ENCODED-POSTGRES-PASSWORD>@127.0.0.1:5432/giemens?schema=giemens_crm"
ADMIN_EMAIL="admin@giemens.local"
ADMIN_NAME="GIEMENS Local Admin"
ADMIN_PASSWORD="<unique 12-128 byte bootstrap password>"
```

Replace placeholders locally only. Do not commit the file or send credentials
in chat. URL-encode special characters in the PostgreSQL password.

Then run these commands from a trusted migration runner:

```powershell
npm ci
npm run prisma:validate
npm run prisma:generate
npm run db:deploy
npm run prisma:seed
npm run db:verify
```

`npm run db:deploy` applies checked-in migrations without generating a new
migration. The seed requires a unique `ADMIN_PASSWORD` of 12–128 UTF-8 bytes
plus `ADMIN_EMAIL` and `ADMIN_NAME`. Set those in an ignored local `.env` for
Prisma CLI use, or inject them into the migration/seed job's secret environment.
Never use a default or shared production password.

After migration, verify the physical tables in schema `giemens_crm`:
`roles`, `users`, `leads`, `activities`, `customers`, `projects`, `tasks`,
`sessions`, `auth_rate_limits`, `jurivana_requests`, `request_comments`,
`documents`, `request_documents`, and `audit_logs`. `npm run db:verify` checks
this table list. Back up the database and rehearse the migration before
production. Do not run `prisma migrate dev` against production.

## Container build and local run

Copy `.env.example` to `.env`, set the required variables, and then run:

```powershell
docker compose build
docker compose up -d
Invoke-WebRequest http://localhost:3000/healthz
```

The Compose port is bound to loopback by default. Put a TLS-terminating reverse
proxy or a managed ingress in front of it. If that proxy is trusted to set
`X-Forwarded-For`, configure the exact hop count and prevent direct public
access to the container port. The app trusts no proxy headers by default.

## Azure

1. Create Azure Database for PostgreSQL Flexible Server with private networking
   where available. Create/authorize a dedicated app principal and database
   credentials; do not use a superuser for the application.
2. Create an Azure Storage account and private Blob container for future
   document storage. The current repository has document contracts only; it
   does not yet include a Blob adapter or upload API.
3. Configure an Azure Container Registry and build/push the image with the
   public `VITE_SITE_URL` as a build argument.
4. Deploy the image to Azure Container Apps or App Service for Containers.
   Configure health probing at `/healthz`, ingress/TLS, and the variables above
   using Key Vault references or platform secrets.
5. Run the database release commands before routing users to the new revision.
6. Confirm DNS/TLS, direct page refreshes, login/logout, lead access, SMTP
   delivery, rate-limit behavior, backups, logs, and alerts.

Use managed identity for Azure services when a supported adapter is implemented;
never bake storage credentials into the image.

## AWS

1. Provision PostgreSQL (for example RDS), Redis-compatible rate-limit
   infrastructure, and a private S3 bucket.
2. Push the Docker image to ECR and deploy to ECS/Fargate behind an HTTPS load
   balancer.
3. Store the environment values in Secrets Manager/Parameter Store and allow
   outbound access only to required dependencies.
4. Run migrations as a one-off release task, then verify the app health check
   and customer journeys before increasing traffic.

The app's current document interfaces do not yet implement S3 storage.

## DigitalOcean and VPS (including Contabo)

For DigitalOcean, publish the image to a container registry and deploy it using
App Platform or a Droplet behind a managed load balancer. Use managed
PostgreSQL/Spaces or an approved external service.

For a VPS, install Docker Engine and the Compose plugin, restrict inbound
firewall access to SSH and HTTPS, place Nginx or Caddy in front of the
loopback-bound container, and provision PostgreSQL/Redis/SMTP separately.
Use automated TLS, unattended security updates, encrypted off-site backups,
log rotation, monitoring, and a documented restore test. Do not expose
PostgreSQL to the public internet.

## GitHub Actions

`.github/workflows/ci.yml` validates Prisma, type-checks, runs tests, builds the
static output, and builds the container on pushes and pull requests. It does
not deploy or access production secrets. Add a separate, environment-protected
release workflow only after the target host, approvals, and secret-management
policy are selected.

## Current scope and go-live blockers

- The public site, inquiry APIs, role-aware login, and lead dashboard exist.
  Customer/project/task administration and Jurivana request workflows are
  implemented against the root Prisma schema but await the unapplied
  `20261105230000_crm_requests_and_workflows` migration.
- AI, queue, notification, document, and request service contracts are
  interfaces only. No AI execution or message broker is enabled. Azure Blob
  upload/download is wired for the configured private container; malware
  scanning and quarantine are not implemented and must be added before
  accepting untrusted customer files at scale.
- The new customer, project, task, request, activity, and dashboard surfaces
  require the migration, a successful seed, and configured Redis/SMTP at
  runtime. The public inquiry service and CRM application share this Redis
  configuration.
- SMTP is wired for the contact endpoint. Admin password reset remains a
  placeholder and must not imply that recovery is available.
- The current CRM schema is not tenant-isolated. Do not expose it as a
  multi-tenant SaaS service without tenant ownership, authorization boundaries,
  and database-level isolation.
- Complete owner/legal review, privacy/retention policy, operational monitoring,
  backup/restore testing, and dependency/security review before customer launch.
