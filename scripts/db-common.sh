#!/usr/bin/env bash
set -Eeuo pipefail

DB_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DB_REPOSITORY_ROOT="$(cd -- "$DB_SCRIPT_DIR/.." && pwd)"

db_load_connection() {
  local -a fields=()
  mapfile -d '' -t fields < <(node "$DB_SCRIPT_DIR/db-config.mjs" "$DB_REPOSITORY_ROOT/.env")
  if (( ${#fields[@]} != 7 )); then
    printf '%s\n' "Could not load a valid DATABASE_URL. Set it in the environment or ignored .env file." >&2
    return 1
  fi

  export PGHOST="${fields[0]}"
  export PGPORT="${fields[1]}"
  export PGDATABASE="${fields[2]}"
  export PGUSER="${fields[3]}"
  export PGPASSWORD="${fields[4]}"
  export PGSSLMODE="${fields[5]}"
  export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c search_path=giemens_crm"
  export DATABASE_URL="${fields[6]}"
  unset fields
}

db_require_tools() {
  local tool
  for tool in "$@"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf 'Required command not found: %s\n' "$tool" >&2
      return 1
    fi
  done
}

db_psql() {
  psql -X --no-password -v ON_ERROR_STOP=1 "$@"
}
