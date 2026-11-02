# Local PostgreSQL and Prisma setup

This project uses the PostgreSQL database `giemens` and the Prisma schema
`giemens_crm`. The checked-in initial migration creates that schema and the
project tables; Prisma does not reset or drop the database when applying it.

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
both files should use this shape:

```text
postgresql://postgres:<your-local-password>@127.0.0.1:5432/giemens?schema=giemens_crm
```

The seed reads `ADMIN_EMAIL` and `ADMIN_NAME` from `.env`. If omitted, it
creates the local admin record `admin@giemens.local` /
`GIEMENS Local Admin`.

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

## 4. Apply the initial migration

After confirming `DATABASE_URL` points to the intended local database and the
schema has been reviewed, apply the checked-in migration:

```powershell
npm run prisma:migrate
```

This runs `prisma migrate dev`; it changes the local database schema. It does
not reset the database. Review the proposed migration before confirming any
additional migration Prisma proposes.

## 5. Seed development roles and admin record

After the migration succeeds:

```powershell
npm run prisma:seed
```

The idempotent seed creates or updates the `SUPER_ADMIN`, `ADMIN`, `MANAGER`,
and `EMPLOYEE` roles and creates or updates one user assigned to `SUPER_ADMIN`.
The default user has `passwordHash = null`. Authentication is not implemented,
so this database record cannot be used to log in. The seed does not create a
password, expose an API, or contact an external service.

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
