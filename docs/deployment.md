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

For CRM and authenticated server features, provision PostgreSQL with network
access from the app and the `giemens_crm` schema. PostgreSQL is required to
persist contact leads. SMTP, Upstash Redis, Azure Blob Storage, and ClamAV are
optional integrations. Without SMTP, leads are still persisted but no contact
notification email is sent. Without Redis, form APIs use a bounded,
per-instance rate limiter; configure Redis for shared limits across serverless
instances. Document workflows remain unavailable until Blob Storage and
ClamAV are configured. Keep secrets in the platform's secret store; do not put
production credentials in `.env`, a container image, or GitHub Actions logs.

Set these variables in the platform:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL for the active Prisma schema and `giemens_crm` schema. |
| `VITE_SITE_URL` | Public HTTPS origin; supplied as a Docker build argument to generate canonical metadata and sitemap URLs. |
| `VITE_JURIVANA_URL` | Standalone Jurivana HTTPS origin, baked into the client build; required for Vercel production. |
| `AUTH_RATE_LIMIT_SECRET` | At least 32 bytes; used to hash login rate-limit keys. |
| `METRICS_AUTH_TOKEN` | Optional private Prometheus scrape token; at least 32 bytes when set. |
| `SMTP_PROVIDER` | Optional; `custom`, `microsoft365`, `google-workspace`, or `zoho`; defaults to `custom`. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Optional SMTP relay connection/authentication. SMTP is disabled unless credentials and a usable host are configured. |
| `SMTP_PORT` | Optional; defaults to `587` when SMTP is enabled. Port `465` uses implicit TLS. |
| `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | Required contact addresses (personal addresses may be used temporarily); they do not send email unless SMTP is configured. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional HTTPS Upstash REST credentials for contact/lead rate limits; both are needed to enable Redis. |
| `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER` | Optional private Blob account endpoint and container for document upload/download SAS URLs. Configure both to enable Blob Storage. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Optional private ClamAV daemon; TCP 3310 by default. Scanning is disabled when the host is unset. |
| `DOCUMENT_PENDING_RETENTION_HOURS`, `DOCUMENT_REJECTED_RETENTION_DAYS` | Cleanup policy for abandoned uploads and rejected quarantine objects; defaults are 24 hours and 30 days. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP/HTTP collector base URL. OTLP export is disabled when unset. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional collector authentication headers; keep in the platform secret store. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Optional service-principal credentials for hosts without workload/user-assigned identity. Store them as secrets; Azure Container Apps uses its managed identity instead. |
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

Generate ignored local development/production env files, replace all `REPLACE_*`
and example endpoints with real platform values, then validate Compose:

```powershell
npm run env:generate
docker compose --env-file .env.development config --quiet
docker compose --env-file .env.development build
docker compose --env-file .env.development up -d
Invoke-WebRequest http://localhost:3000/liveness
Invoke-WebRequest http://localhost:3000/ready
```

The generated files contain fresh local `ADMIN_PASSWORD`,
`AUTH_RATE_LIMIT_SECRET`, and `METRICS_AUTH_TOKEN` values, but example
database/provider endpoints and placeholder credentials. They are ignored by
Git. Do not use the generated production file as real production secrets.
Run `npm run seed:development` only after replacing its database URL and
reviewing the local bootstrap account settings.

The Compose port is bound to loopback by default. Put a TLS-terminating reverse
proxy or a managed ingress in front of it. If that proxy is trusted to set
`X-Forwarded-For`, configure the exact hop count and prevent direct public
access to the container port. The app trusts no proxy headers by default.

## Azure

1. Create Azure Database for PostgreSQL Flexible Server with private networking
   where available. Create/authorize a dedicated app principal and database
   credentials; do not use a superuser for the application.
2. The upload API uses an Azure private Blob container, user-delegation SAS
   URLs, type/size/signature/checksum verification, and fail-closed ClamAV
   scanning. Configure Blob Storage and deploy a private ClamAV service
   reachable as `CLAMAV_HOST` before enabling document uploads. Startup and
   `/ready` require PostgreSQL and check each configured optional integration;
   unconfigured SMTP, Blob Storage, Redis and ClamAV are reported as disabled.
3. Configure an Azure Container Registry and build/push the image with the
   public `VITE_SITE_URL` and standalone `VITE_JURIVANA_URL` as build arguments.
4. Create a Log Analytics workspace and prepare an untracked, ignored
   `infra/azure/production.parameters.json` file using the parameters described
   in [the Azure template guide](../infra/azure/README.md).
5. Deploy the Bicep template to create the Container Apps environment, app,
   private Blob container, user-assigned identity, health probes, CORS rule and
   scoped storage/registry roles:

   ```powershell
   az deployment group create `
     --resource-group <resource-group> `
     --template-file infra/azure/main.bicep `
     --parameters @infra/azure/production.parameters.json
   ```

6. Configure custom domain/TLS and network access. The Container App ingress
   must reach PostgreSQL and Upstash; keep PostgreSQL private and restrict its
   firewall to the app network.
7. Run the database release checklist before routing customer traffic.
8. Confirm direct page refreshes, login/logout, role restrictions, customer and
   request workflows, SMTP, document upload/download, rate limits, backups,
   logs and alerts.

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

`.github/workflows/ci.yml` validates Prisma, type-checks, runs tests, audits
runtime dependencies, builds the static output and container, and compiles the
Bicep template on pushes and pull requests. It does not deploy or access
production secrets. Add a separate, environment-protected release workflow
only after host approvals and secret-management policies are selected.

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
