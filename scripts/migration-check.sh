#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/db-common.sh"
db_require_tools node psql npm
db_load_connection

cd "$DB_REPOSITORY_ROOT"
npm exec -- prisma migrate status --schema=prisma/schema.prisma

db_psql -P pager=off -c "
SELECT migration_name, started_at, finished_at, rolled_back_at,
       CASE
         WHEN rolled_back_at IS NOT NULL THEN 'rolled back'
         WHEN finished_at IS NULL THEN 'incomplete'
         ELSE 'applied'
       END AS state
FROM giemens_crm._prisma_migrations
ORDER BY started_at;
"
