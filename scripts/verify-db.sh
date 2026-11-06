#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/db-common.sh"
db_require_tools node psql npm
db_load_connection
cd "$DB_REPOSITORY_ROOT"

npm run prisma:validate
npm run prisma:generate
"$DB_SCRIPT_DIR/db-health.sh"
"$DB_SCRIPT_DIR/migration-check.sh"

expected_tables=(
  roles users leads activities customers projects tasks sessions auth_rate_limits
  jurivana_requests request_comments documents request_documents audit_logs
)
actual_tables="$(db_psql -Atc "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'giemens_crm' AND table_type = 'BASE TABLE'
")"
for table in "${expected_tables[@]}"; do
  if ! grep -Fxq "$table" <<<"$actual_tables"; then
    printf 'Missing expected table in giemens_crm: %s\n' "$table" >&2
    exit 1
  fi
done
printf 'Verified %s application tables.\n' "${#expected_tables[@]}"

indexes="$(db_psql -Atc "
  SELECT count(*)
  FROM pg_indexes
  WHERE schemaname = 'giemens_crm'
    AND indexname = ANY(ARRAY[
      'roles_name_key', 'users_email_key', 'users_role_id_idx',
      'leads_status_created_at_idx', 'leads_division_status_created_at_idx',
      'leads_email_idx', 'activities_lead_id_created_at_idx',
      'customers_lead_id_key', 'customers_email_idx', 'projects_customer_id_idx',
      'tasks_project_id_status_idx', 'tasks_assigned_to_id_status_idx',
      'tasks_status_due_at_idx', 'sessions_token_hash_key',
      'sessions_user_id_expires_at_idx', 'sessions_expires_at_idx',
      'auth_rate_limits_window_started_at_idx',
      'jurivana_requests_customer_id_created_at_idx',
      'jurivana_requests_type_status_created_at_idx',
      'jurivana_requests_assigned_to_id_status_idx',
      'request_comments_request_id_created_at_idx',
      'documents_storage_key_key', 'documents_owner_user_id_created_at_idx',
      'documents_category_created_at_idx', 'documents_status_created_at_idx',
      'request_documents_document_id_idx',
      'audit_logs_actor_user_id_created_at_idx',
      'audit_logs_entity_type_entity_id_created_at_idx'
    ])
")"
if [[ "$indexes" != 28 ]]; then
  printf 'Expected 28 Prisma-defined indexes; found %s.\n' "$indexes" >&2
  exit 1
fi

invalid_foreign_keys="$(db_psql -Atc "
  SELECT count(*)
  FROM pg_constraint AS c
  JOIN pg_namespace AS n ON n.oid = c.connamespace
  WHERE n.nspname = 'giemens_crm'
    AND c.contype = 'f'
    AND NOT c.convalidated
")"
if [[ "$invalid_foreign_keys" != 0 ]]; then
  printf 'Found %s unvalidated foreign-key constraints.\n' "$invalid_foreign_keys" >&2
  exit 1
fi
foreign_key_count="$(db_psql -Atc "
  SELECT count(*)
  FROM pg_constraint AS c
  JOIN pg_namespace AS n ON n.oid = c.connamespace
  WHERE n.nspname = 'giemens_crm' AND c.contype = 'f'
")"
if [[ "$foreign_key_count" != 16 ]]; then
  printf 'Expected 16 Prisma-defined foreign keys; found %s.\n' "$foreign_key_count" >&2
  exit 1
fi

role_count="$(db_psql -Atc "
  SELECT count(*)
  FROM giemens_crm.roles
  WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')
")"
super_admin_count="$(db_psql -Atc "
  SELECT count(*)
  FROM giemens_crm.users AS u
  JOIN giemens_crm.roles AS r ON r.id = u.role_id
  WHERE r.name = 'SUPER_ADMIN' AND u.password_hash IS NOT NULL
")"
if [[ "$role_count" != 4 || "$super_admin_count" -lt 1 ]]; then
  printf 'Seed verification failed: expected 4 RBAC roles and at least 1 password-backed SUPER_ADMIN (found %s roles, %s admins).\n' \
    "$role_count" "$super_admin_count" >&2
  exit 1
fi

printf 'Verified 28 required indexes, 16 validated foreign keys, four roles, and at least one configured SUPER_ADMIN.\n'
