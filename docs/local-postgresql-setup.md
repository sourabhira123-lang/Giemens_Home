# Local PostgreSQL and Prisma setup

This project uses the PostgreSQL database `giemens` and the Prisma schema
`giemens_crm`. The checked-in initial migration creates that schema and the
project tables; Prisma does not reset or drop the database when applying it.
See [PostgreSQL connection troubleshooting](./postgresql-troubleshooting.md)
for the local environment findings, pgAdmin password recovery steps, and
verification scripts.

## 1. Configure local environment

Keep `.env` and `.env.local` out of Git. `.env.example` is the committed
template. Set `DATABASE_URL` in both local files to your actual local PostgreSQL
credentials. Never commit a real password.

Prisma CLI loads `.env`; Vite loads `.env.local`. If `.env` does not exist,
create it from the example in PowerShell:

```powershell
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}
if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
}
```

`.env.local` is a local template and is ignored by Git. The `DATABASE_URL` in
both files should use this shape (URL-encode reserved characters in the
password, for example `@` as `%40`):

```text
postgresql://postgres:<your-local-password>@127.0.0.1:5432/giemens?schema=giemens_crm
```

The seed reads `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` from `.env`.
The default email and name are `admin@giemens.local` and
`GIEMENS Local Admin`; set a unique password of at least 12 characters in
`.env` before seeding.

## 2. Create the local database if needed

Run this only if database `giemens` does not already exist. Supply the local
PostgreSQL administrator password when prompted:

```powershell
createdb -h 127.0.0.1 -p 5432 -U postgres giemens
```

Do not run `dropdb`, `prisma migrate reset`, or destructive SQL.

## 3. Validate and generate Prisma Client

From the repository root:

```powershell
npm install
npm run prisma:validate
npm run prisma:generate
```

These commands validate the local schema and generate the client without
applying a database migration.

## 4. Apply checked-in migrations

First verify the connection and migration status without changing the database:

```powershell
.\scripts\connect-db.ps1
.\scripts\verify-db.ps1
```

After both checks succeed and the local database owner confirms the target,
apply the reviewed, additive migrations:

```powershell
npm run db:deploy
```

This runs `prisma migrate deploy` and applies only checked-in migrations. It
does not generate a migration or reset the database.

The currently inspected local database has all three checked-in migrations
applied and all 14 expected tables verified. No seed was run. On that database,
`npm run db:deploy` should report that the schema is up to date.

## 5. Seed development roles and admin record

After the migration succeeds:

```powershell
npm run prisma:seed
npm run db:verify
```

The idempotent seed creates or updates the `SUPER_ADMIN`, `ADMIN`, `MANAGER`,
and `EMPLOYEE` roles and creates or updates one user assigned to `SUPER_ADMIN`.
It stores a salted scrypt password hash, never plaintext. Authentication
sessions are defined by the additive authentication migration.
The CRM extension migration adds project/task statuses and assignments,
Jurivana requests/comments, document metadata, and audit logs. Table
verification checks these along with roles, users, leads, activities,
customers, projects, tasks, sessions, and auth rate limits.

## Validation commands

```powershell
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm test
```

Optional local database inspection:

```powershell
npx prisma migrate status --schema prisma/schema.prisma
npx prisma studio --schema prisma/schema.prisma
```

Run the inspection commands only after configuring a valid local `DATABASE_URL`.
