#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/db-common.sh"
db_require_tools node psql
db_load_connection

printf 'Connecting to %s:%s/%s as %s (password is not displayed).\n' \
  "$PGHOST" "$PGPORT" "$PGDATABASE" "$PGUSER"
if [[ -z "$PGPASSWORD" && -z "${PGPASSFILE:-}" ]]; then
  psql -X --password -v ON_ERROR_STOP=1
else
  db_psql
fi
