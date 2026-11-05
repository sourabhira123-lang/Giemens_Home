# Docker deployment validation report

**Validation date:** 2026-11-05

**Scope:** Dockerfile, Compose configuration, runtime startup, health endpoints
**Application code changed:** No

## Result summary

| Check | Result | Evidence |
|---|---|---|
| Dockerfile review | **STATIC REVIEW PASSED; IMAGE BUILD BLOCKED** | Reviewed multi-stage Node 22 build, Prisma Client generation, production dependency install, non-root runtime user, exposed port, startup command, and Docker healthcheck. The Docker daemon was unavailable, so Docker could not parse/build the image. |
| Docker Compose configuration | **PASSED** | `docker compose config --quiet` exited successfully with required variables supplied as non-secret smoke-test values. This validates Compose interpolation and configuration, not service startup. |
| Docker image build | **BLOCKED** | `docker version`/`docker info` could reach the Docker CLI but not the Docker Desktop Linux engine (`dockerDesktopLinuxEngine` named pipe unavailable). |
| Container startup | **BLOCKED** | No image could be built or started without a running Docker engine. |
| Application startup sequence | **HOST SMOKE TEST PASSED** | The Node HTTP server started with production runtime environment variables and served `/healthz`. This is not a container test. |
| `/healthz` | **PASSED (host smoke test)** | HTTP 200, `text/plain`, body `ok`. This is the health route configured in the Dockerfile and Azure probes. |
| `/health` | **NOT IMPLEMENTED** | HTTP 200 returned the SPA `index.html`; this is not a health response. |
| `/ready` | **NOT IMPLEMENTED** | HTTP 200 returned the SPA `index.html`; this is not a readiness response. |

## Startup sequence checked

The configured container command is `npm start`. The package start script runs
`scripts/validate-runtime-env.mjs`, then starts `server/http.ts`. The production
environment validation passed in the host smoke test. The app binds to
`0.0.0.0:3000` by default; Compose publishes it on loopback at
`127.0.0.1:${APP_PORT:-3000}`.

The Dockerfile healthcheck probes `http://127.0.0.1:3000/healthz`. The server
implements `/healthz` as a process-level health endpoint. It does not check
database, Redis, SMTP, or Blob dependency health.

Unknown non-file paths fall through to the SPA index page. As a result,
`/health` and `/ready` currently appear successful to a basic HTTP status check
but return HTML. Do not configure orchestrator probes to use those paths.

## Dockerfile and Compose review notes

- Dockerfile uses a Node 22 Debian slim image, separate build/runtime dependency
  stages, Prisma Client generation, a required `VITE_SITE_URL` build argument,
  a non-root `node` runtime user, and a `/healthz` Docker healthcheck.
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
   Invoke-WebRequest http://127.0.0.1:3000/healthz
   docker inspect --format='{{.State.Health.Status}}' (docker compose ps -q giemens)
   ```

5. Confirm the application startup log and health status, then stop the
   validation service:

   ```powershell
   docker compose down
   ```

This report does not authorize or perform a database reset. Database migration
state is separate from this Docker validation.
