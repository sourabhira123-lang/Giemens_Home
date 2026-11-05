# PostgreSQL and Prisma connection troubleshooting

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
- A read-only Prisma migration-status check succeeded when the current local
  password was URL-encoded in memory. It confirmed the credentials work and
  initially reported three migrations, with
  `20261105230000_crm_requests_and_workflows` pending.
- After that authentication check, the pending additive migration was applied
  with `prisma migrate deploy`. `npm run db:verify` then verified all 14
  expected tables in `giemens_crm`, and `prisma migrate status` reported the
  database up to date. No database reset or seed was run.

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

From the repository root in PowerShell:

```powershell
.\scripts\connect-db.ps1
.\scripts\verify-db.ps1
```

`connect-db.ps1` prompts for the PostgreSQL password and checks that database
`giemens` is reachable and schema `giemens_crm` exists. `verify-db.ps1` validates
the URL target without printing its password, checks TCP reachability, validates
the Prisma schema, generates Prisma Client, and runs `prisma migrate status`. It
treats pending migrations as a successful authentication/status check and
reports them. It does **not** apply migrations or seed data.

If local script execution is blocked by policy, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\connect-db.ps1
.\scripts\verify-db.ps1
```

These commands only relax execution policy for the current PowerShell process.
Do not put a password on a command line or in shell history.

## Migration and seed status

The local database migration is complete: all three checked-in migrations are
applied and the 14 expected tables were verified. The Prisma seed was not run.
Before using the standard npm scripts again, update both ignored `.env` files
to the same valid, URL-encoded connection string; the local verification helper
uses `.env.local` without editing either file.

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
