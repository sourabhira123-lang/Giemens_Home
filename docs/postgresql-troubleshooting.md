# PostgreSQL and Prisma connection troubleshooting

## Readiness audit update — 2026-11-06

The current checkout was tested with
`prisma migrate status --schema=prisma/schema.prisma`. Prisma returned
**P1000: authentication failed** for the
credentials in the active `.env` configuration at `127.0.0.1:5432`. The
password was not printed, changed, or recovered. `npm run db:verify` also could
not connect, so the current migration, seed, table, index, and constraint state
cannot be certified from this run.

A previous local validation recorded all three migrations and 14 tables as
applied on 2026-11-05. That historical result does not prove that the current
`.env` credentials point to the same database or still authenticate. No
migration, seed, reset, password change, or database write was performed during
this audit.

Use the Linux scripts from the repository root after correcting the credential
in the ignored environment file:

```sh
bash scripts/connect-db.sh
bash scripts/db-health.sh
bash scripts/migration-check.sh
bash scripts/verify-db.sh
```

`verify-db.sh` is a validation gate; it does not deploy migrations or seed. See
[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for the release blocker
and [backup-guide.md](./backup-guide.md) before any production change.

## Findings from the local configuration review

- Both `prisma/schema.prisma` (the active schema used by `package.json` scripts)
  and `database/prisma/schema.prisma` (an architecture blueprint) declare the
  PostgreSQL provider and schema `giemens_crm`. Use only the root `prisma`
  directory for application migrations.
- The active Prisma datasource reads `DATABASE_URL` from the process
  environment. Its expected target is database `giemens` on
  `127.0.0.1:5432`, with `schema=giemens_crm`.
- `.env.example` has the correct connection URL shape, but its password is only
  a placeholder. It is not a usable credential.
- `.env.local` targets the expected host, database, and schema, but its password
  contains a raw `@`. A reserved character in a PostgreSQL URL password must be
  percent-encoded (`@` becomes `%40`). The verification helper normalizes this
  in memory without printing or changing the password, but the files should
  still be corrected.
- The ignored root `.env` has a different `DATABASE_URL` and omits the
  `schema=giemens_crm` parameter. Prisma CLI normally loads `.env`, while Vite
  loads `.env.local`; keeping these values inconsistent can make different
  commands use different database targets. `scripts/verify-db.ps1` explicitly
  uses `.env.local` and warns if the values differ.
- `prisma/migrations/20260711000000_initial_crm/migration.sql` creates
  `giemens_crm`; do not manually create a competing schema before applying the
  migration.
- A listener is available on TCP port 5432. PostgreSQL services 14, 17, and 18
  are installed/running, so confirm which cluster owns the target port before
  changing a service or its `pg_hba.conf`. A reachable port does not prove that
  the password is correct.
- A previous read-only Prisma migration-status check succeeded when the local
  password was URL-encoded in memory. It confirmed the credentials work and
  initially reported three migrations, with
  `20261105230000_crm_requests_and_workflows` pending.
- A previous local run applied the pending additive migration and then
  reported all 14 expected tables present and migrations up to date. The
  current P1000 means those results must be re-established against the current
  configured target before release.

No password, token, or full connection URL is included in this report.

## Required connection format

Use the same URL in ignored `.env` and `.env.local`:

```text
postgresql://postgres:URL_ENCODED_PASSWORD@127.0.0.1:5432/giemens?schema=giemens_crm
```

Percent-encode reserved characters in the username/password. For example, an
`@` in the password is `%40`. Do not surround a value-containing placeholder
with `${...}` in a `.env` URL; put the actual locally configured URL-encoded
password there. Do not copy a production credential into this local file.

The PostgreSQL provider is `postgresql`; Prisma's generated client provider is
`prisma-client-js`. The schema is a PostgreSQL namespace, not a separate
database. The database is `giemens`.

## Password recovery with pgAdmin

### If another PostgreSQL superuser can connect

1. In pgAdmin, connect to the cluster listening on port `5432`. The local
   machine has multiple PostgreSQL Windows services; inspect **Windows
   Services > PostgreSQL > Properties > Path to executable** to identify the
   service and its `-D` data directory. Confirm it is the cluster used by
   `127.0.0.1:5432`.
2. Expand **Login/Group Roles**, right-click `postgres`, and choose **Properties**.
3. Open **Definition**, enter and confirm a new unique local-development
   password, then save. Do not reuse the example placeholder or disclose the
   password in chat.
4. Update `DATABASE_URL` in both `.env.local` and `.env`. URL-encode reserved
   password characters; keep host, port, database, and schema as shown above.
5. Continue with [connection verification](#verify-before-migrating).

### If no superuser password is available

pgAdmin cannot bypass PostgreSQL authentication by itself. For a local machine
you administer, use a brief, loopback-only `pg_hba.conf` recovery window:

1. In Windows Services, identify the PostgreSQL service whose cluster listens
   on port `5432`. Confirm its data directory from the service's **Path to
   executable** (`-D` argument). Do not assume it is the newest installed
   version.
2. Stop that specific PostgreSQL service. Back up its `pg_hba.conf` to a
   separate file before editing.
3. As a Windows administrator, temporarily add these lines at the **top** of
   that file, before broader matching host rules:

   ```text
   host    all    postgres    127.0.0.1/32    trust
   host    all    postgres    ::1/128         trust
   ```

   This temporarily permits local processes to connect as `postgres` without
   a password. Do this only on a trusted development machine, with no
   untrusted local users, and only for the time required to reset the password.
4. Start the same PostgreSQL service. In pgAdmin, register/connect to
   `127.0.0.1`, port `5432`, maintenance database `postgres`, user `postgres`,
   and leave the password blank for this temporary local connection.
5. In **Login/Group Roles > postgres > Properties > Definition**, set and save
   a new unique password. Using the role properties UI avoids putting the new
   password in a SQL query/history.
6. Immediately stop the service, restore the original `pg_hba.conf` backup
   exactly, and start the service again. Verify the temporary `trust` rules are
   gone before continuing.
7. Reconnect in pgAdmin using the new password. Update both ignored `.env`
   files with the URL-encoded value.

If pgAdmin cannot connect after the temporary local rule, stop and check that
you edited the configuration for the exact cluster listening on port 5432.
Do not leave `trust` authentication enabled.

## Verify before migrating

From the repository root on Linux/macOS:

```sh
bash scripts/connect-db.sh
bash scripts/verify-db.sh
```

`connect-db.sh` opens `psql` without displaying a password. `db-health.sh`
checks the server/schema/TLS connection. `migration-check.sh` reports Prisma
migration state. `verify-db.sh` validates the Prisma schema, generates the
client, checks all 14 mapped tables, 28 declared indexes, validated foreign
keys, and the expected RBAC seed records. None of these scripts applies
migrations or seed data.

On Windows, the existing `connect-db.ps1` and `verify-db.ps1` remain available.

If Windows local script execution is blocked by policy, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\connect-db.ps1
.\scripts\verify-db.ps1
```

These commands only relax execution policy for the current PowerShell process.
Do not put a password on a command line or in shell history.

## Migration and seed status

As of the 2026-11-06 audit, the currently configured credentials fail
authentication, so migration/table/seed state is **unverified**. The historical
2026-11-05 record reports three migrations and 14 tables applied. The Prisma
seed was not run in that recorded check. Before using the standard npm scripts,
update both ignored `.env` files to the same valid, URL-encoded connection
string; do not paste a credential into chat or commit it.

For a fresh local database, only after `verify-db.ps1` succeeds and the
database owner confirms the target, run:

Keep the root `.env` and `.env.local` `DATABASE_URL` entries identical, then
run:

```powershell
npm run db:deploy
npm run prisma:seed
npm run db:verify
```

`db:deploy` applies checked-in migrations; it is not a schema reset. Do not
echo a URL containing credentials into the terminal.

## Exact read-only verification queries

Run these through `psql` after `bash scripts/db-health.sh` succeeds. The
queries report metadata only; they do not expose passwords or document content.

### Connection, TLS, version and role attributes

```sql
SELECT current_database() AS database,
       current_user AS connected_role,
       current_schema() AS current_schema,
       current_setting('server_version') AS postgres_version,
       s.ssl AS tls_enabled,
       s.version AS tls_version,
       r.rolsuper,
       r.rolcreatedb,
       r.rolcreaterole,
       r.rolcanlogin
FROM pg_stat_ssl AS s
JOIN pg_roles AS r ON r.rolname = current_user
WHERE s.pid = pg_backend_pid();
```

For an application login, `rolsuper`, `rolcreatedb`, and `rolcreaterole` should
be false. Require TLS for remote production connections and verify the
certificate/hostname using the database provider's CA chain.

### Schema and all Prisma-mapped application tables

```sql
WITH expected(table_name) AS (
  SELECT unnest(ARRAY[
    'roles', 'users', 'leads', 'activities', 'customers', 'projects', 'tasks',
    'sessions', 'auth_rate_limits', 'jurivana_requests', 'request_comments',
    'documents', 'request_documents', 'audit_logs'
  ])
)
SELECT expected.table_name,
       actual.table_name IS NOT NULL AS exists
FROM expected
LEFT JOIN information_schema.tables AS actual
  ON actual.table_schema = 'giemens_crm'
 AND actual.table_type = 'BASE TABLE'
 AND actual.table_name = expected.table_name
ORDER BY expected.table_name;
```

Every `exists` value must be true. The requested models map as follows:
`Role` → `roles`, `User` → `users`, `Lead` → `leads`, `Activity` →
`activities`, `Customer` → `customers`, `Project` → `projects`, `Task` →
`tasks`, `Document` → `documents`, `AuditLog` → `audit_logs`,
`JurivanaRequest` → `jurivana_requests`, `RequestComment` →
`request_comments`.

### Migration state

```sql
SELECT migration_name,
       started_at,
       finished_at,
       rolled_back_at,
       CASE
         WHEN rolled_back_at IS NOT NULL THEN 'rolled back'
         WHEN finished_at IS NULL THEN 'incomplete'
         ELSE 'applied'
       END AS state
FROM giemens_crm._prisma_migrations
ORDER BY started_at;
```

Use `prisma migrate status` as the authoritative CLI check. Every migration
expected for the release must be applied, no failed/incomplete row may remain,
and the migration names must match the reviewed `prisma/migrations` directory.
Do not edit applied migration files.

### Seed and role verification

```sql
SELECT name, count(*) AS rows
FROM giemens_crm.roles
WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
GROUP BY name
ORDER BY name;

SELECT count(*) AS password_backed_super_admins
FROM giemens_crm.users AS u
JOIN giemens_crm.roles AS r ON r.id = u.role_id
WHERE r.name = 'SUPER_ADMIN'
  AND u.password_hash IS NOT NULL;
```

All four roles must have exactly one row. The second query must return at least
one. It intentionally does not display a user email or password hash. Do not
re-run `prisma:seed` as a health check: the current seed updates the configured
super-admin password and deletes that user's sessions.

### Index validation

```sql
WITH expected(index_name) AS (
  SELECT unnest(ARRAY[
    'roles_name_key', 'users_email_key', 'users_role_id_idx',
    'leads_status_created_at_idx', 'leads_division_status_created_at_idx',
    'leads_email_idx', 'activities_lead_id_created_at_idx',
    'customers_lead_id_key', 'customers_email_idx', 'projects_customer_id_idx',
    'tasks_project_id_status_idx', 'tasks_assigned_to_id_status_idx',
    'tasks_status_due_at_idx', 'sessions_token_hash_key',
    'sessions_user_id_expires_at_idx', 'sessions_expires_at_idx',
    'auth_rate_limits_window_started_at_idx',
    'jurivana_requests_customer_id_created_at_idx',
    'jurivana_requests_type_status_created_at_idx',
    'jurivana_requests_assigned_to_id_status_idx',
    'request_comments_request_id_created_at_idx',
    'documents_storage_key_key', 'documents_owner_user_id_created_at_idx',
    'documents_category_created_at_idx', 'documents_status_created_at_idx',
    'request_documents_document_id_idx',
    'audit_logs_actor_user_id_created_at_idx',
    'audit_logs_entity_type_entity_id_created_at_idx'
  ])
)
SELECT expected.index_name,
       actual.indexname IS NOT NULL AS exists,
       actual.indexdef
FROM expected
LEFT JOIN pg_indexes AS actual
  ON actual.schemaname = 'giemens_crm'
 AND actual.indexname = expected.index_name
ORDER BY expected.index_name;
```

All 28 `exists` values must be true; review `indexdef` against the checked-in
migrations. Do not drop an index just because it is not used in a short test.

### Constraint validation

```sql
SELECT c.conname,
       c.contype,
       c.convalidated,
       c.condeferrable,
       c.condeferred,
       c.conrelid::regclass AS table_name
FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'giemens_crm'
ORDER BY c.contype, c.conrelid::regclass::text, c.conname;

SELECT count(*) AS foreign_key_count,
       count(*) FILTER (WHERE NOT convalidated) AS unvalidated_foreign_keys
FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'giemens_crm' AND c.contype = 'f';
```

Expect 16 declared foreign keys and zero unvalidated foreign keys for the
current migrations. Review primary keys, unique constraints, and deletion
actions against the migration SQL.

### Application privileges

Replace `giemens_app` with the approved application role; do not grant it
superuser, role creation, schema ownership, or migration DDL in production.

```sql
SELECT has_database_privilege('giemens_app', 'giemens', 'CONNECT') AS can_connect,
       has_schema_privilege('giemens_app', 'giemens_crm', 'USAGE') AS schema_usage,
       has_schema_privilege('giemens_app', 'giemens_crm', 'CREATE') AS can_create_objects;

SELECT table_name,
       privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'giemens_crm'
  AND grantee = 'giemens_app'
ORDER BY table_name, privilege_type;
```

Application role requires only the runtime privileges established by a DBA;
use a separate short-lived migration role for DDL. Ensure new tables receive
the intended grants through reviewed default privileges.

### Performance spot checks

Run on staging with production-like data and realistic parameters. Capture
baseline plans before changes; `EXPLAIN ANALYZE` executes the query.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, email, status, created_at
FROM giemens_crm.leads
WHERE division = 'JURIVANA' AND status = 'NEW'
ORDER BY created_at DESC
LIMIT 25;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, status, due_at
FROM giemens_crm.tasks
WHERE assigned_to_id = '<valid-user-uuid>' AND status = 'OPEN'
ORDER BY due_at
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, file_name, created_at
FROM giemens_crm.documents
WHERE owner_user_id = '<valid-user-uuid>' AND status = 'READY'
ORDER BY created_at DESC
LIMIT 100;
```

Review estimated versus actual rows, sequential scans on large tables, buffer
reads, sort spills, and p95 latency. Do not add indexes based only on one plan;
measure write overhead and representative concurrent load.

## Migration verification checklist

- [ ] Confirm intended database/schema/role and remote TLS; verify latest
  successful backup and restore point.
- [ ] `prisma validate` and `prisma migrate status` succeed; inspect each
  pending SQL migration for locks, table rewrites, backfill duration, and
  backwards compatibility.
- [ ] Apply reviewed migrations once via a singleton release identity/process,
  never on every app replica.
- [ ] Re-run migration status, table/index/FK SQL, and app smoke checks.
- [ ] Record migration name, artifact/image digest, operator, timestamp, and
  observed duration. Keep credentials and full connection strings out of logs.
- [ ] If deployment fails, prefer a forward-compatible application rollback;
  never reset production or edit an applied migration to conceal drift.

## Seed verification checklist

- [ ] Confirm whether this environment has been seeded before; verify role rows
  and a password-backed super-admin using the queries above.
- [ ] Obtain explicit owner approval before any first-time production bootstrap.
- [ ] Set `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` through a secret
  manager; use a unique password meeting the seed's 12–128 byte requirement.
- [ ] Run the seed once in a controlled maintenance/release step only. Current
  seed upserts the admin password and deletes sessions on rerun.
- [ ] Verify login via a secure staging smoke test; do not print credentials.
- [ ] Rotate bootstrap credentials and revoke temporary access after handoff.

## Connection pooling

The application currently constructs a standard Prisma client and does not
configure a PgBouncer-specific mode. For production, determine the PostgreSQL
connection budget and deployment replica/worker counts. Bound per-instance
Prisma connections with the provider-supported `connection_limit` URL
parameter or an approved pooler; ensure
`(max app replicas × per-instance pool) + migration/monitoring headroom` stays
below server limits. If using PgBouncer transaction pooling, validate Prisma's
prepared-statement compatibility and the provider-supported
`pgbouncer=true` configuration against the exact Prisma version. Load-test
pool saturation, timeouts, failover, and connection churn before release.

### Destructive local-only reset

`scripts/reset-local-dev.ps1` is deliberately separate from verification and
migration deployment. It runs `prisma migrate reset`, which drops and recreates
the local `giemens_crm` schema and can run the configured seed. It refuses
non-loopback hosts or databases other than `giemens`, requires the explicit
`-IUnderstandDataLoss` switch, and asks for a typed confirmation:

```powershell
.\scripts\reset-local-dev.ps1 -IUnderstandDataLoss
```

Do not use it to troubleshoot a password, against production, or where local
data must be preserved.
