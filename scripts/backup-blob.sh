#!/usr/bin/env bash
set -Eeuo pipefail

for tool in azcopy date; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$tool" >&2
    exit 1
  fi
done

: "${BLOB_SOURCE_URL:?Set BLOB_SOURCE_URL to the private source container URL}"
: "${BLOB_BACKUP_ROOT:?Set BLOB_BACKUP_ROOT to restricted off-site backup storage}"
: "${BLOB_BACKUP_CONFIRM_ROOT:?Confirm the exact backup root URL}"
if [[ "$BLOB_BACKUP_ROOT" != "$BLOB_BACKUP_CONFIRM_ROOT" ||
      "$BLOB_BACKUP_ROOT" == "$BLOB_SOURCE_URL" ]]; then
  printf '%s\n' "Blob backup refused: destination confirmation must match a different backup root." >&2
  exit 1
fi

azcopy login --identity
destination="${BLOB_BACKUP_ROOT%/}/documents-$(date -u +%Y%m%dT%H%M%SZ)"
azcopy copy "$BLOB_SOURCE_URL" "$destination" --recursive=true --overwrite=false
printf 'Blob backup copy completed: %s\n' "$destination"
