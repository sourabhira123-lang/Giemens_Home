#!/usr/bin/env bash
set -Eeuo pipefail

db_require_tools() {
  local tool
  for tool in "$@"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf 'Required command not found: %s\n' "$tool" >&2
      return 1
    fi
  done
}

db_require_tools pg_restore sha256sum
: "${BACKUP_FILE:?Set BACKUP_FILE to a reviewed custom-format dump}"
: "${RESTORE_CONFIRM_DATABASE:?Set this to the isolated restore database name}"
: "${PGHOST:?Set PGHOST to the isolated recovery host}"
: "${PGPORT:?Set PGPORT to the isolated recovery port}"
: "${PGDATABASE:?Set PGDATABASE to the isolated recovery database}"
: "${PGUSER:?Set PGUSER to a least-privilege restore role}"
: "${PGPASSWORD:?Set PGPASSWORD through a protected environment or passfile}"

if [[ "$PGDATABASE" != "giemens_restore_drill" ||
      "$RESTORE_CONFIRM_DATABASE" != "giemens_restore_drill" ]]; then
  printf '%s\n' "Restore refused: target must be giemens_restore_drill." >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" || ! -f "$BACKUP_FILE.sha256" ]]; then
  printf '%s\n' "Backup file and its .sha256 checksum file are required." >&2
  exit 1
fi
if [[ "$BACKUP_FILE" != /* ]]; then
  printf '%s\n' "BACKUP_FILE must be an absolute path." >&2
  exit 1
fi

sha256sum --check "$BACKUP_FILE.sha256"
pg_restore --list "$BACKUP_FILE" >/dev/null
pg_restore --no-password --exit-on-error --clean --if-exists \
  --no-owner --no-acl --dbname="$PGDATABASE" "$BACKUP_FILE"
printf 'PostgreSQL restore completed into isolated database %s on %s:%s.\n' \
  "$PGDATABASE" "$PGHOST" "$PGPORT"
