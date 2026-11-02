# Authentication and role access

Authentication uses PostgreSQL-backed sessions and an HttpOnly cookie. The
website never stores passwords or session tokens in browser storage.

## Apply the authentication migration

The authentication migration is additive. It creates the `sessions` and
`auth_rate_limits` tables in `giemens_crm` and adds the session foreign key; it
does not alter or delete lead, role, or user records. Inspect
`prisma/migrations/20261102230000_add_auth_sessions/migration.sql` before
applying it.

Prisma CLI reads `.env`. To use the URL from `.env.local` without copying or
printing the credential, set it only for the current PowerShell process:

```powershell
$databaseLine = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = ($databaseLine -replace '^DATABASE_URL=', '').Trim().Trim('"')
npx prisma migrate status --schema prisma/schema.prisma
```

Only if the migration status is expected and the target database is verified,
apply the pending migrations:

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
```

Do not use `prisma migrate reset`.

## Configure the initial administrator

Set `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` in the ignored local
`.env` file. Choose a unique password with at least 12 characters. For local
API runtime, set `AUTH_RATE_LIMIT_SECRET` in `.env.local`; production must also
provide it as a server-side environment variable. Generate a secret locally
with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Set that value only in ignored local files or the production server environment.
Do not commit either secret or share it. Then run:

```powershell
npm run prisma:validate
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm run prisma:seed
```

The seed assigns `SUPER_ADMIN` to the configured administrator and stores a
scrypt password hash. Re-running the seed with `ADMIN_PASSWORD` set updates the
password hash for that account.

## Sign in

Start the Vercel development server so its serverless API routes are available:

```powershell
npx vercel dev
```

Open `/login`. `npm run dev` starts only the Vite frontend and does not provide
the authentication API.

## Roles

| Role | `/admin` | `/admin/leads` and lead API |
| --- | --- | --- |
| `SUPER_ADMIN` | Allowed | Allowed |
| `ADMIN` | Allowed | Allowed |
| `MANAGER` | Allowed | Denied |
| `EMPLOYEE` | Allowed | Denied |

Protected frontend routes provide navigation and user feedback. Authorization
is also enforced in the serverless API; hiding or changing frontend routes does
not grant access to lead records.

## Session and sign-in controls

- Session identifiers are generated from cryptographically secure random bytes.
  Only their SHA-256 hashes are stored in PostgreSQL.
- Sessions expire after eight hours and are revoked on sign-out.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path-scoped, and `Secure` in
  production.
- Passwords use Node.js scrypt with per-password random salts.
- Failed sign-ins are rate limited to five per IP per 15-minute window using
  HMAC-hashed IP keys stored in PostgreSQL. `AUTH_RATE_LIMIT_SECRET` is required;
  the endpoint fails closed if it is missing or too short.
- Login, logout, and lead status changes reject missing or cross-origin
  `Origin` headers.
- Lead listing and status changes require an authenticated `SUPER_ADMIN` or
  `ADMIN` session, independently of frontend route guards.

Authentication tables are added by the migration under
`prisma/migrations/20261102230000_add_auth_sessions`. It only creates the
session and login-rate-limit tables; it does not drop or rewrite existing
tables. Validate the target database and review the SQL before applying it.
