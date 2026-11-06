# RHEL 10 deployment profile

## Status

RHEL 10 compatibility is **not certified**. This repository was audited on
Windows and no Docker engine or RHEL 10 host is available. The following is a
deployment profile and acceptance checklist, not evidence of a successful
RHEL 10 run.

## Deployment requirements

1. Use a currently supported RHEL 10 minor release and a container runtime and
   Compose implementation approved for that release by the organization.
   Verify vendor support and patch policy rather than assuming Docker Engine
   installation instructions for RHEL 9 apply unchanged.
2. Run the prebuilt, signed/verified Node 22 Linux image; do not install
   application dependencies on the host.
3. Keep SELinux enforcing. The current Compose configuration has no bind
   mounts; do not add `:z`/`:Z` volume labels unless a reviewed persistent mount
   is actually introduced.
4. Expose port 3000 only to the reverse proxy. Use `firewalld` to restrict
   ingress; do not expose PostgreSQL or the container management socket.
5. Supply secrets from an approved secret manager or a root-owned `0600` env
   file outside the Git checkout. Keep secrets out of systemd unit arguments
   and logs.
6. Configure the orchestrator to use `/liveness` for startup/liveness and
   `/ready` for readiness. Permit the app's required private egress to
   PostgreSQL, SMTP, Blob, Redis and ClamAV.
7. Set `TRUST_PROXY_HOPS` to the verified proxy topology, not a guessed value.

## Acceptance commands

Run these as a deployment operator from the repository release directory (or
the corresponding signed image pipeline):

```sh
getenforce
uname -r
docker version
docker compose version
docker compose config --quiet
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/liveness
curl --fail http://127.0.0.1:3000/ready
```

If the approved RHEL runtime is not Docker, substitute its documented
equivalents and record the exact commands. Test SELinux denials, firewalld
rules, reboot persistence, log rotation, SIGTERM shutdown, database TLS, and
restore drills before approval.

## Rollback and certification

Pin the prior image digest and deployment settings. Re-deploy the prior image
only after testing schema compatibility. Preserve SELinux enforcement; do not
disable host controls as a workaround. A passing build alone is not RHEL
certification.
