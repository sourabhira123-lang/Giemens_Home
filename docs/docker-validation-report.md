# Docker deployment validation report

**Validation date:** 2026-11-05

**Scope:** Dockerfile, Compose configuration, runtime startup, health endpoints
**Application code changed:** No

> Historical snapshot from 2026-11-05. The current health/readiness behavior
> and certification evidence are maintained in
> [GO_LIVE_CERTIFICATION.md](./GO_LIVE_CERTIFICATION.md). As of 2026-11-07,
> startup and `/ready` check PostgreSQL, SMTP, Azure Blob, Redis and ClamAV;
> no live external-service readiness is certified.

## Result summary

| Check | Result | Evidence |
|---|---|---|
| Dockerfile review | **STATIC REVIEW PASSED; IMAGE BUILD BLOCKED** | Reviewed multi-stage Node 22 build, Prisma Client generation, production dependency install, non-root runtime user, exposed port, startup command, and Docker healthcheck. The Docker daemon was unavailable, so Docker could not parse/build the image. |
| Docker Compose configuration | **PASSED** | `docker compose config --quiet` exited successfully with required variables supplied as non-secret smoke-test values. This validates Compose interpolation and configuration, not service startup. |
| Docker image build | **BLOCKED** | `docker version`/`docker info` could reach the Docker CLI but not the Docker Desktop Linux engine (`dockerDesktopLinuxEngine` named pipe unavailable). |
| Container startup | **BLOCKED** | No image could be built or started without a running Docker engine. |
| Application startup sequence | **HOST SMOKE TEST PASSED** | The Node HTTP server started with production runtime environment variables and served `/healthz`. This is not a container test. |
| `/healthz` | **PASSED (host smoke test, 2026-11-05)** | HTTP 200, `text/plain`, body `ok`. Retained as a compatibility route. |
| `/health`, `/liveness` | **UNIT TEST PASSED; CONTAINER VALIDATION BLOCKED** | Added as process-level liveness routes and covered by the HTTP test; Docker engine unavailable. |
| `/ready` | **UNIT TEST PASSED; DATABASE/CONTAINER VALIDATION BLOCKED** | Added as a PostgreSQL-backed readiness route and tested for 200/503 behavior with an injected check; current database authentication fails with P1000. |

## Startup sequence checked

The configured container command is `npm start`. The package start script runs
`scripts/validate-runtime-env.mjs`, then starts `server/http.ts`. The production
environment validation passed in the host smoke test. The app binds to
`0.0.0.0:3000` by default; Compose publishes it on loopback at
`127.0.0.1:${APP_PORT:-3000}`.

The Dockerfile healthcheck probes `http://127.0.0.1:3000/liveness`. The
`/liveness` and compatibility `/healthz` routes indicate process-level health;
they do not check database, Redis, SMTP, or Blob dependency health. `/ready`
performs a PostgreSQL `SELECT 1`.

At the time of the 2026-11-05 host smoke test, `/health` and `/ready` fell
through to the SPA. The current source now implements `/health`, `/liveness`,
and database-backed `/ready`; route behavior has unit-test coverage, but actual
database connectivity and container health remain unvalidated. Unknown
non-file paths still fall through to the SPA index page, so probes must use the
explicit health routes.

## Dockerfile and Compose review notes

- Dockerfile uses a Node 22 Debian slim image, separate build/runtime dependency
  stages, Prisma Client generation, `VITE_SITE_URL` and
  `VITE_JURIVANA_URL` build arguments,
  a non-root `node` runtime user, and a `/liveness` Docker healthcheck. The
  existing `/healthz` route remains for compatibility.
- Compose uses `init`, a restart policy, loopback-only port binding,
  `no-new-privileges`, and drops Linux capabilities.
- The Compose model was rendered/validated, but runtime mount/network,
  application startup inside the image, container health status, and shutdown
  behavior remain unverified.

## Commands/results

Compose configuration validation:

```powershell
docker compose config --quiet
```

Result: exit code 0.

Docker engine availability:

```powershell
docker version
docker info --format '{{.ServerVersion}}'
```

Result: Docker Desktop Linux engine pipe was unavailable, so image build and
container execution were blocked.

## Required follow-up on a host with Docker running

1. Start Docker Desktop and confirm `docker info` succeeds.
2. From the repository root, set the deployment `.env` values using a valid,
   URL-encoded PostgreSQL connection string and real service credentials.
3. Build and start:

   ```powershell
   docker compose build
   docker compose up -d
   docker compose ps
   docker compose logs --tail 100 giemens
   ```

4. Verify the configured health endpoint:

   ```powershell
   Invoke-WebRequest http://127.0.0.1:3000/liveness
   docker inspect --format='{{.State.Health.Status}}' (docker compose ps -q giemens)
   ```

5. Confirm `/liveness` returns 200, `/ready` returns 200 only while PostgreSQL
   is reachable, and the container health status is healthy. Then stop the
   validation service:

   ```powershell
   docker compose down
   ```

This report does not authorize or perform a database reset. Database migration
state is separate from this Docker validation.
