# Linux deployment guide

## Certification status

The application is packaged as a Node.js 22 container and CI targets Ubuntu.
This is not a certification of Ubuntu, Debian, RHEL 10, Rocky Linux, or AlmaLinux:
the current workspace is Windows, Docker Engine is unavailable, and no Linux
container was started for this audit. Linux-specific production deployment
remains blocked until the smoke-test matrix below passes on each claimed host.

The PowerShell helpers under `scripts/*.ps1` are local PostgreSQL convenience
scripts only. They are not runtime dependencies. The Node application resolves
paths relative to its module and does not require a Windows host path.

## Container-first deployment

1. Install a supported container engine and Compose plugin from the host
   distribution's approved repository. Do not install Node.js or Prisma on the
   host.
2. Build the image from the repository root with `VITE_SITE_URL` set to the
   canonical HTTPS origin:

   ```sh
   docker build \
     --build-arg VITE_SITE_URL=https://www.giemens.com \
     --tag giemens-home:<immutable-release-tag> .
   ```

3. Provide runtime settings through a root-owned secret store or a protected
   environment file outside the repository. Never place production secrets in
   image build arguments, source control, shell history, or container labels.
4. Publish TCP 3000 only through the approved reverse proxy/load balancer.
   Keep PostgreSQL, Redis, SMTP, and storage control endpoints off public
   ingress. Set `TRUST_PROXY_HOPS` only after documenting the exact trusted
   proxy chain.
5. Run as the image's non-root `node` user, keep `no-new-privileges`, drop
   capabilities, and use a read-only root filesystem where the runtime
   permits it. The current app does not require a writable persistent local
   volume.
6. Configure startup/liveness to `/liveness`, readiness to `/ready`, and retain
   `/healthz` for backward compatibility. Do not send customer traffic until
   readiness succeeds.
7. Deploy database migrations as a separate, one-shot release operation with
   a least-privilege migration identity. Do not run migrations independently
   from every replica startup.

## Host controls

- Use a supported kernel and receive security updates through the distribution
  lifecycle.
- Restrict inbound traffic to the reverse proxy and administrative access.
- Use host firewall rules and outbound allowlists for PostgreSQL, Redis, SMTP,
  Blob Storage, and approved telemetry endpoints.
- Configure time synchronization, disk-space/inode monitoring, container log
  rotation, and restart-on-failure.
- Keep runtime secrets outside the deployment directory; use restrictive
  ownership and permissions (`root:root`, mode `0600`) for a temporary env
  file.
- Do not mount the Docker socket or host root into the app container.

## Portability smoke-test matrix

For each supported OS and exact release, record the OS image digest, kernel,
container engine/version, Compose version, image digest, test date, and result.

| Test | Pass criteria |
|---|---|
| Image pull/build | Image builds and starts on the target architecture without host Node dependencies |
| Runtime user | Process runs as non-root; no writable source or host mounts |
| Health | `/liveness` returns 200; `/ready` returns 200 only with database access |
| TLS/proxy | HTTPS termination and client IP derivation match the documented proxy chain |
| Database | PostgreSQL TLS and migration release procedure pass without resetting data |
| Storage | Upload, integrity validation, authorization, and download pass with private Blob access |
| Shutdown | SIGTERM drains HTTP requests and exits within the orchestrator grace period |
| Recovery | Restart, image rollback, DB restore, and Blob restore are exercised in a non-production environment |

Do not advertise a distribution as certified until all tests pass on a clean
host and the evidence is attached to the release.

## Rollback

Retain the previous immutable image tag and deployment configuration. Roll back
the application revision only after confirming the old code is compatible with
the current additive database schema. Never roll back by deleting or resetting
the database; use a forward fix or a separately approved restore procedure.
