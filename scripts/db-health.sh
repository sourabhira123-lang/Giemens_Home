#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/db-common.sh"
db_require_tools node psql
db_load_connection

tls_enabled="$(db_psql -Atc "
  SELECT ssl
  FROM pg_stat_ssl
  WHERE pid = pg_backend_pid()
")"
db_psql -P pager=off -c "
SELECT current_database() AS database,
       current_user AS role,
       current_schema() AS current_schema,
       current_setting('server_version') AS postgres_version,
       ssl.ssl AS connection_uses_tls
FROM pg_stat_ssl AS ssl
WHERE ssl.pid = pg_backend_pid();
"

db_psql -P pager=off -c "
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name = 'giemens_crm';
"

if [[ "$PGHOST" != localhost && "$PGHOST" != 127.0.0.1 && "$PGHOST" != ::1 && "$tls_enabled" != t ]]; then
  printf '%s\n' "Remote PostgreSQL connection is not using TLS." >&2
  exit 1
fi
