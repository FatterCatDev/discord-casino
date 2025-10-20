#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: SOURCE_DATABASE_URL=... DATABASE_URL=... ./scripts/transfer-postgres.sh

Required environment:
  SOURCE_DATABASE_URL   Connection string for the source Postgres instance.
                        Example: postgresql://user:pass@127.0.0.1:5432/dbname
  DATABASE_URL          Target connection string (DigitalOcean URL already in .env).

Optional environment:
  SOURCE_PGSSLMODE      Overrides PGSSLMODE when running pg_dump on the source.
  SOURCE_CA_CERT_PATH   Path to CA cert for source; exported as PGSSLROOTCERT.
  TARGET_PGSSLMODE      Overrides PGSSLMODE when restoring.
  TARGET_CA_CERT_PATH   Path to CA cert for target; defaults to DATABASE_CA_CERT_PATH.
  PG_DUMP_BIN           Override the pg_dump executable (default: pg_dump on PATH).
  PG_RESTORE_BIN        Override the pg_restore executable (default: pg_restore on PATH).
  KEEP_DUMP             If set (non-empty), leave the dump file on disk for reuse.
EOF
  exit 0
fi

if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "SOURCE_DATABASE_URL is not set." >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

dump_dir=$(mktemp -d "${TMPDIR:-/tmp}/pg-transfer.XXXXXX")
dump_file="${dump_dir}/backup.dump"

cleanup() {
  if [[ -n "${KEEP_DUMP:-}" ]]; then
    echo "Dump preserved at ${dump_file}"
  else
    rm -rf "${dump_dir}"
  fi
}
trap cleanup EXIT

PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"

echo "Dumping source database..."
PGSSLMODE="${SOURCE_PGSSLMODE:-${PGSSLMODE:-disable}}" \
PGSSLROOTCERT="${SOURCE_CA_CERT_PATH:-${PGSSLROOTCERT:-}}" \
"${PG_DUMP_BIN}" --format=custom --no-owner --no-acl --dbname="${SOURCE_DATABASE_URL}" --file="${dump_file}"

echo "Restoring into target database..."
PGSSLMODE="${TARGET_PGSSLMODE:-${PGSSLMODE:-require}}" \
PGSSLROOTCERT="${TARGET_CA_CERT_PATH:-${DATABASE_CA_CERT_PATH:-${PGSSLROOTCERT:-}}}" \
"${PG_RESTORE_BIN}" --clean --if-exists --no-owner --dbname="${DATABASE_URL}" --single-transaction "${dump_file}"

echo "Transfer complete."
