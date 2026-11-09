# GIEMENS / Jurivana deployment runbook

This runbook deploys the current GIEMENS application using the existing Node,
PostgreSQL/Prisma, Docker Compose and Azure Bicep architecture. Jurivana remains
standalone. Deployment is **NO-GO** until every release gate in
[GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md) has evidence and
approvals.

## 1. Change and operator controls

- Identify the approved Git commit, release image digest, environment and
  rollback image before deployment.
- Require release manager, DBA, security, service owner and on-call SRE
  approval. Use two operators for production database migration/seed and
  recovery actions.
- Configure credentials only in the approved secret store. Never paste
  `.env.production`, credentials, password hashes, SAS URLs or tokens into
  logs, tickets or chat.
- The repo-local `.env.production` is ignored, generated with placeholders,
  and is not a production secret store. `npm run env:generate` does not
  overwrite existing files.
- The app container has no persistent local data volume. PostgreSQL and Azure
  Blob are external stateful dependencies; do not introduce a volume as an
  emergency workaround.
- Allow up to 120 seconds for Docker health startup and up to 110 seconds for
  the Azure Container Apps startup probe while PostgreSQL and configured
  optional integrations are checked before the HTTP listener binds.

## 2. Environment readiness

For the full CRM/authenticated server runtime, prepare the required protected
environment with:

```text
DATABASE_URL
ADMIN_EMAIL
ADMIN_NAME
ADMIN_PASSWORD
AUTH_RATE_LIMIT_SECRET
VITE_SITE_URL
VITE_JURIVANA_URL
CONTACT_FROM_EMAIL
CONTACT_TO_EMAIL
TRUST_PROXY_HOPS
```

`ENABLE_LEAD_PERSISTENCE` is optional and defaults to `false`. For the
corporate website launch, leave it false to accept valid inquiries without CRM
database writes. Set it to `true` after the production CRM schema is available.

Configure these only when activating the associated integration:

```text
METRICS_AUTH_TOKEN
SMTP_PROVIDER
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
AZURE_STORAGE_ACCOUNT_URL
AZURE_STORAGE_CONTAINER
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CLAMAV_HOST
CLAMAV_PORT
DOCUMENT_PENDING_RETENTION_HOURS
DOCUMENT_REJECTED_RETENTION_DAYS
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_EXPORTER_OTLP_HEADERS
TRUST_PROXY_HOPS
```

`SMTP_PROVIDER` is `custom`, `microsoft365`, `google-workspace`, or `zoho`.
`VITE_JURIVANA_URL` must be a non-placeholder HTTPS origin and defaults to
`https://jurivana.giemens.com`. The three portal actions link to this external
origin; verify the destination hosts Jurivana and has a valid certificate.
`DATABASE_URL` must target the approved `giemens` database and
`giemens_crm` schema and use TLS for remote hosts. Use 32-byte random secrets
for `AUTH_RATE_LIMIT_SECRET` and `METRICS_AUTH_TOKEN` when configured.
Unconfigured SMTP, Redis, ClamAV and Blob Storage are logged as disabled and
do not block startup or readiness; dependent APIs fail closed until enabled.
Confirm all configured external services are private/restricted as intended.

For local development only, create ignored files if they do not already exist:

```powershell
npm run env:generate
git check-ignore .env.development .env.production
```

Replace placeholders in the local copy. Never commit generated files.

## 3. Pre-deployment validation

Run on the release commit with the supported Node 22 runtime:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run prisma:validate
npm run prisma:generate
npx prisma migrate status --schema=prisma/schema.prisma
npm audit
npm audit --omit=dev
```

Stop if any command fails, if the DB target/migration history is unexpected,
or if high/critical advisories lack a tested fix or approved exception. Build
with the final Vite settings so canonical metadata and external portal links
are correct.

## 4. Database release step

1. Verify the release DB endpoint, TLS, least-privilege app/migration roles,
   ownership of the existing `DocumentStatus` type and `documents` table by
   the approved migration identity, latest protected backup and migration
   status. Runtime app roles
   must not be granted type ownership merely to make deployment pass.
2. Confirm the new migration is pending and reviewed:
   `20261107000000_document_malware_status`.
3. If Prisma has a failed record for this migration, the DBA must first verify
   from catalog state that no migration statements were applied. Only after
   this verification, mark the attempt rolled back using the authorized
   migration connection:

   ```powershell
   npx prisma migrate resolve --rolled-back 20261107000000_document_malware_status --schema=prisma/schema.prisma
   ```

4. Apply the migration once, from the approved release runner using the
   database owner or an approved migration principal that owns the enum:

   ```powershell
   npm run db:deploy
   npx prisma migrate status --schema=prisma/schema.prisma
   npm run db:verify
   ```

5. If this environment has no approved administrator yet, set a unique
   12-128 UTF-8-byte `ADMIN_PASSWORD` in the secret store and run the seed
   exactly once:

   ```powershell
   npm run prisma:seed
   ```

   Verify the four roles and exactly the intended `SUPER_ADMIN` using the
   protected database verification procedure. Never output the password or
   password hash. Seed re-execution changes the configured admin password and
   revokes sessions. Do not seed an existing production DB merely to check it.
6. If any migration/seed outcome is ambiguous, stop and involve the DBA. Never
   run `prisma migrate reset` in production.

## 5. Container build and Compose validation

The Compose service is `giemens` (not `app`). Validate and build with the
release environment file on a Linux Docker Engine:

```powershell
docker info --format '{{.OSType}}'
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build giemens
docker image inspect giemens-home:local
```

Expected Docker OS type is `linux`. The Compose service publishes only to
`127.0.0.1:${APP_PORT:-3000}`; place the approved TLS reverse proxy/ingress in
front. Compose defines no named or bind-mounted app volumes. Database, Blob,
SMTP, Redis, ClamAV and OTLP connectivity is external and checked by readiness.

## 6. Azure certification and deployment

Install Azure CLI on the approved Windows release workstation if needed:

```powershell
winget install --exact --id Microsoft.AzureCLI
```

Open a new PowerShell session, then authenticate and compile:

```powershell
az version
az login --tenant "<tenant-id>"
az account set --subscription "<subscription-id>"
az account show --query "{subscription:id,tenant:tenantId}" --output json
az bicep install
az bicep version
az bicep build --file infra\azure\main.bicep --outfile "$env:TEMP\jurivana-template.json"
```

Create a protected, ignored parameter file containing reviewed non-secret
parameters and secure values supplied through an approved method. Do not
commit it. Validate before deploying:

```powershell
az deployment group validate `
  --resource-group "<resource-group>" `
  --template-file infra\azure\main.bicep `
  --parameters "@<protected-parameter-file>"
```

Review the what-if output with the infrastructure owner. Deploy the approved
image digest and parameters:

```powershell
az deployment group create `
  --resource-group "<resource-group>" `
  --template-file infra\azure\main.bicep `
  --parameters "@<protected-parameter-file>"
```

The current Bicep uses Container App secrets and does **not** provision or
reference Key Vault. Before production, either verify the approved external
secret delivery/rotation procedure or implement and review the separately
approved Key Vault reference configuration; do not assume Key Vault is active.

Verify deployment:

```powershell
az containerapp show --resource-group "<resource-group>" --name "<app-name>" --query "properties.provisioningState" --output tsv
az containerapp revision list --resource-group "<resource-group>" --name "<app-name>" --output table
az containerapp identity show --resource-group "<resource-group>" --name "<app-name>" --output json
az containerapp logs show --resource-group "<resource-group>" --name "<app-name>" --follow false
az role assignment list --assignee "<managed-identity-principal-id>" --all --output table
az storage container show --auth-mode login --account-name "<storage-account>" --name documents --query "properties.publicAccess" --output tsv
```

Confirm successful provisioning, healthy revision, least-privilege ACR/Blob
roles, private container access and the intended secret references. Do not
print secret values from app configuration.

## 7. Start and smoke-test

### Docker Compose deployment

```powershell
docker compose --env-file .env.production up -d --wait giemens
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail 100 giemens
Invoke-WebRequest http://localhost:3000/health
Invoke-WebRequest http://localhost:3000/liveness
Invoke-WebRequest http://localhost:3000/ready
docker compose --env-file .env.production restart giemens
docker compose --env-file .env.production ps
Invoke-WebRequest http://localhost:3000/ready
```

### Application smoke tests

- `/health`, `/healthz`, `/liveness`: HTTP 200, plain `ok`.
- `/ready`: HTTP 200 only when PostgreSQL, SMTP, Blob, Redis and ClamAV checks
  pass; HTTP 503 otherwise. Response contains no secrets or provider errors.
- Confirm authenticated contact form behavior, CRM access and role boundaries.
- `npm run email:health` verifies SMTP from an approved runner; then send one
  controlled test message.
- In staging, upload an approved clean test document, verify the expected
  checksum/signature and ClamAV status; verify a test detection and scanner
  outage stay inaccessible to clients. Never place malware samples in
  production.
- Verify Prometheus scrape authentication, OTLP export, alert delivery,
  redaction, cleanup schedule and dashboard signals.
- From GIEMENS `/ecosystem/jurivana`, verify `Launch Jurivana`, `Login To
  Jurivana`, and `Request Demo` all navigate to the configured standalone
  origin.
- Verify restart behavior and graceful shutdown. Do not proceed if readiness
  returns 503 or startup dependency validation fails.

## 8. Go/no-go and completion

Release manager records the immutable commit/image digest, migration and seed
evidence, all test/probe results, monitoring and restore evidence, owner
approvals, and rollback reference. Only then change
[GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md) to a dated READY verdict.
Current recorded decision is **❌ NOT READY FOR PRODUCTION**.
