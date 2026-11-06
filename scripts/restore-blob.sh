#!/usr/bin/env bash
set -Eeuo pipefail

for tool in azcopy; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$tool" >&2
    exit 1
  fi
done

: "${BLOB_BACKUP_URL:?Set BLOB_BACKUP_URL to the reviewed backup copy}"
: "${BLOB_RESTORE_DESTINATION:?Set BLOB_RESTORE_DESTINATION to an isolated recovery container}"
: "${BLOB_RESTORE_CONFIRM_DESTINATION:?Confirm the exact isolated destination URL}"
if [[ "$BLOB_RESTORE_DESTINATION" != "$BLOB_RESTORE_CONFIRM_DESTINATION" ||
      "$BLOB_RESTORE_DESTINATION" == "$BLOB_BACKUP_URL" ]]; then
  printf '%s\n' "Blob restore refused: destination confirmation must match a different recovery target." >&2
  exit 1
fi

azcopy login --identity
azcopy copy "$BLOB_BACKUP_URL" "$BLOB_RESTORE_DESTINATION" \
  --recursive=true --overwrite=false
printf 'Blob restore copy completed into isolated destination: %s\n' \
  "$BLOB_RESTORE_DESTINATION"
