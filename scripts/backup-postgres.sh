#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/db-common.sh"
db_load_connection
db_require_tools pg_dump sha256sum install

: "${BACKUP_DIRECTORY:?Set BACKUP_DIRECTORY to encrypted, restricted backup storage}"
if [[ "$BACKUP_DIRECTORY" != /* ]]; then
  printf '%s\n' "BACKUP_DIRECTORY must be an absolute path." >&2
  exit 1
fi

umask 077
install -d -m 0700 "$BACKUP_DIRECTORY"
backup_file="$BACKUP_DIRECTORY/giemens_crm-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --no-password --format=custom --no-owner --no-acl \
  --schema=giemens_crm --file="$backup_file"
chmod 0600 "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
chmod 0600 "$backup_file.sha256"
printf 'PostgreSQL backup completed: %s\n' "$backup_file"
