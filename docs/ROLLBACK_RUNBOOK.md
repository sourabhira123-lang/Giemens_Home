# GIEMENS / Jurivana rollback runbook

Use this runbook when a deployment causes an error-rate/readiness regression,
security issue, failed dependency integration or critical customer impact.
Rollback is led by the incident commander with release manager, DBA and SRE.
Preserve evidence and avoid irreversible data actions.

## 1. Trigger and immediate response

Trigger rollback for a failed startup/readiness gate, repeated 5xx/latency
above the approved SLO, auth/RBAC or document-security regression, corrupted
release configuration, or confirmed critical vulnerability. Follow the
incident process and:

1. Declare the incident, record start time, commit/image digest, revision and
   operator.
2. Pause further rollout, migration, seed and cleanup jobs. Preserve sanitized
   application, platform and database logs.
3. If unsafe document access or authorization is suspected, restrict ingress
   and affected operations immediately; do not restore an unsafe code path.
4. Check whether the release applied a database migration or wrote data.
   Application rollback does not roll back database state.

## 2. Application rollback

### Azure Container Apps

List revisions and identify the last known-good image/revision:

```powershell
az containerapp revision list --resource-group "<resource-group>" --name "<app-name>" --output table
az containerapp show --resource-group "<resource-group>" --name "<app-name>" --query "properties.configuration.ingress.traffic" --output json
```

If the known-good revision is retained and compatible, route traffic to it:

```powershell
az containerapp ingress traffic set `
  --resource-group "<resource-group>" `
  --name "<app-name>" `
  --revision-weight "<known-good-revision>=100"
```

If the platform requires a new revision, redeploy the last approved immutable
image digest with the reviewed known-good configuration using the
[deployment runbook](./DEPLOYMENT_RUNBOOK.md). Do not use a mutable `latest`
tag or print secure app settings.

Verify the selected revision, `/health`, `/liveness`, `/ready`, error rate and
customer journeys before declaring recovery. Preserve the failed revision and
logs for diagnosis.

### Docker Compose

Do not rebuild the failed source during rollback. Restore the saved previous
image digest into the Compose image tag, then recreate the service:

```powershell
docker image inspect "<known-good-image-digest>"
docker tag "<known-good-image-digest>" giemens-home:local
docker compose --env-file .env.production up -d --no-build --force-recreate giemens
docker compose --env-file .env.production ps
Invoke-WebRequest http://localhost:3000/liveness
Invoke-WebRequest http://localhost:3000/ready
```

If the previous image is unavailable, stop and retrieve the approved artifact
from the protected registry. Do not prune images or volumes during incident
response.

## 3. Database and migration safety

- Never run `prisma migrate reset`, drop schemas/tables, or restore over the
  production database as an application rollback.
- The new document malware migration is additive. If applied, keep the enum
  values and `updated_at` column; deploy a compatible application or use a
  DBA-reviewed forward fix. Do not downgrade enum/schema objects under live
  traffic.
- If migration execution failed partway or status is ambiguous, pause traffic
  and cleanup jobs. DBA verifies `prisma migrate status`, migration table,
  schema and current backup before any action.
- Seed re-execution resets the configured bootstrap admin password and revokes
  sessions. Do not seed as a rollback or routine health check.
- Restore database data only for confirmed corruption/data loss, into a
  reviewed recovery target, with incident commander and DBA approval. Prefer
  managed point-in-time recovery to a new isolated instance.

## 4. Blob/document recovery

- Keep document objects private. Do not issue broad SAS links or relax RBAC to
  recover availability.
- Do not re-enable the previous “checksum-only means safe” behavior. If ClamAV
  is unavailable, pause uploads or restore scanner service; clean existing
  ready documents remain governed by their stored state and access policy.
- For deleted/corrupt content, restore from versioning/backup into an isolated
  container, reconcile `storageKey` and SHA-256 against DB metadata, then
  request approval before routing traffic.
- Do not run rejected/pending cleanup while incident scope or legal hold is
  unknown. Preserve quarantine records and audit logs.

## 5. Environment, identity and external services

- Revert to the last reviewed secret references/config revision. Never restore
  a secret value from shell history or logs.
- Verify DB, SMTP, Redis, Blob and ClamAV access from the restored revision.
- If role assignments or ingress were changed, restore only the recorded
  least-privilege configuration. Do not grant broad subscription-level roles
  or public PostgreSQL/Blob access as a workaround.
- For the independent Jurivana portal, revert only the approved
  `VITE_JURIVANA_URL` build configuration or DNS cutover. Confirm the target
  Jurivana application remains separate and do not route its client traffic
  through GIEMENS.

## 6. Recovery validation and closure

1. Confirm application revision/image, database migration compatibility and
   external service connectivity.
2. Verify liveness and readiness, then perform authenticated smoke tests for
   contact, CRM/RBAC and documents.
3. Verify external Jurivana links, TLS, alerting, log redaction and request
   error rates.
4. Preserve incident timeline, artifacts, DB migration state, backup/restore
   evidence and root-cause follow-ups. Notify affected stakeholders under the
   incident policy.
5. Resume paused migration/cleanup/deployment activities only after owner
   approval. Re-certify with [GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md).

## 7. Recovery objectives and constraints

Current proposed—not measured—targets are PostgreSQL RPO 15 minutes with WAL
archiving (24 hours with daily logical backups), RTO 4 hours; Blob RPO 1 hour
with point-in-time protection (24 hours with daily copies), RTO 8 hours. Do not
claim these objectives until restore drills establish them. See
[backup-guide.md](./backup-guide.md).
