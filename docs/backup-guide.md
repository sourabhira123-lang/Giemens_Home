# Backup and disaster recovery guide

## Readiness status and proposed objectives

No database backup schedule, archive destination, Blob versioning/retention
configuration, restore drill, or recovery objective is verified by this
repository audit. The values below are proposed service objectives, not
measured commitments:

| Service | Proposed RPO | Proposed RTO |
|---|---:|---:|
| PostgreSQL CRM | 15 minutes with continuous WAL archiving; 24 hours with daily logical backups only | 4 hours |
| Blob documents | 1 hour with versioning/point-in-time protection; up to 24 hours with daily copy only | 8 hours |
| Full application | Up to 24 hours for non-database configuration; no user uploads lost beyond Blob RPO | 8 hours |

The business owner must approve these objectives and fund storage, replication,
and on-call coverage. The achieved RPO/RTO is the latest successful measured
restore, not the configured schedule.

## PostgreSQL logical backup

Use encrypted, access-controlled storage in a separate failure domain. The
database role needs read access to application data and sequences. Keep backup
encryption keys separate from the backup files.

```sh
export BACKUP_DIRECTORY=/secure-backup/giemens/postgres
bash scripts/backup-postgres.sh
```

For cluster-level recovery, separately capture role/grant definitions with
`pg_dumpall --globals-only` using an appropriately authorized account. Treat
that output as sensitive because it may contain password verifiers. Do not
upload it to an unencrypted or public location. Prefer managed PostgreSQL
automated backups and point-in-time recovery for production; retain logical
exports as an independent recovery path.

## PostgreSQL restore drill

Restore into a separately provisioned, isolated recovery database. Confirm
database, schema, version compatibility, and target host with two operators
before running restore commands. The following may overwrite target objects
and must never target production by accident:

```sh
export BACKUP_FILE="/secure-backup/giemens/postgres/<backup>.dump"
export RESTORE_CONFIRM_DATABASE=giemens_restore_drill
export PGHOST="<isolated-recovery-host>"
export PGPORT=5432
export PGDATABASE=giemens_restore_drill
export PGUSER="<recovery-role>"
# Provide PGPASSWORD through the protected job secret store, not a command argument.
bash scripts/restore-postgres.sh
```

Set the recovery connection through protected `PG*` environment variables or a
restricted passfile; never put passwords in command arguments. Run schema,
constraint, index, migration, seed-state, and application smoke checks against
the restored database. Record restore start/end time, row/table counts, and
data-loss interval. Keep the recovered database isolated until verified.

## Blob backup and restore

- Enable Blob versioning, soft delete, and point-in-time restore where supported
  by the chosen account type/region; verify the account's feature prerequisites
  and cost before enabling.
- Use a separate account or immutable backup destination with a separate
  identity and restricted delete permissions. The app identity must not be able
  to purge backups.
- Inventory documents by database `storageKey` and checksum; reconcile database
  metadata against Blob inventory.
- Test restore of a deleted and a corrupted sample blob into an isolated
  container, then verify SHA-256 against the `documents.checksum_sha256` value.
- Do not expose a public container or use long-lived SAS tokens for backup.

Uploads stay `PENDING_UPLOAD` and cannot receive download URLs until ClamAV
reports them clean. A detected file is marked `REJECTED`. Schedule the bounded
cleanup job using the application identity:

```powershell
npm run documents:cleanup
```

`DOCUMENT_PENDING_RETENTION_HOURS` defaults to 24 (allowed 1-168) and removes
abandoned uploads; `DOCUMENT_REJECTED_RETENTION_DAYS` defaults to 30 (allowed
1-3650) removes rejected objects and metadata. The job retries `EXPIRING`
records after interruptions and records cleanup actions in the audit table. It
does not delete `READY` documents: approve per-record-class retention and
legal-hold rules before configuring deletion for customer records. This job
does not replace Blob versioning, soft delete, or independent backups.

Current Bicep creates a private container and disables shared-key access, but
does not configure soft delete, versioning, point-in-time recovery, a backup
vault, or a restore drill.

For an independent file-level copy, use an approved backup identity with
Microsoft Entra authentication (not a long-lived SAS). Example with AzCopy:

```sh
export BLOB_SOURCE_URL="https://<storage-account>.blob.core.windows.net/documents"
export BLOB_BACKUP_ROOT="https://<backup-account>.blob.core.windows.net/giemens"
export BLOB_BACKUP_CONFIRM_ROOT="$BLOB_BACKUP_ROOT"
bash scripts/backup-blob.sh
```

Restore into an isolated recovery account/container first, reconcile object
names to the database `storageKey` inventory, and validate stored SHA-256
checksums before routing application traffic:

```sh
export BLOB_BACKUP_URL="https://<backup-account>.blob.core.windows.net/giemens/documents-<utc-date>"
export BLOB_RESTORE_DESTINATION="https://<recovery-storage-account>.blob.core.windows.net/documents"
export BLOB_RESTORE_CONFIRM_DESTINATION="$BLOB_RESTORE_DESTINATION"
bash scripts/restore-blob.sh
```

The backup identity needs source read and destination write permissions; it
must not be the application's Blob identity. These copy commands do not
preserve deleted Blob versions or account-level configuration; they supplement
versioning/point-in-time protection rather than replace it.

## Retention and disaster recovery

1. Approve retention periods by record class, contract, and applicable law.
   Legal holds override automated deletion; retention must not be inferred from
   application status.
2. Keep daily encrypted logical backups for at least 35 days and monthly
   recovery points for at least 12 months as an initial policy proposal.
   Select longer retention only after legal/privacy review.
3. Alert on backup age, failed backup jobs, storage capacity, checksum mismatch,
   and restore-test age. A green backup job is not a successful restore.
4. Store application image digests, Bicep/Compose configuration, migration
   history, secret references, DNS/TLS instructions, and runbooks in a protected
   recovery location. Do not back up secret values in plain text.
5. Perform quarterly database and Blob restore drills and an annual regional
   disaster-recovery exercise. Record actual RPO/RTO and corrective actions.

## Failure response and rollback

Declare an incident, stop destructive maintenance, preserve database/Blob
logs, and identify the last known-good recovery points. Recover PostgreSQL and
Blob data into a clean environment, validate integrity and authorization, and
only then route traffic. If an application release caused the incident, first
roll back to a compatible image; restore database data only when a reviewed
recovery decision requires it. Do not apply a schema downgrade or reset during
incident response.
