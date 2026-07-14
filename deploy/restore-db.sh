#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backup"
DUMP_FILE="${BACKUP_DIR}/stm-full-dump.pgdump"
LOCAL_PG_PORT="${1:-15432}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

echo ""
echo "=== Slack Thread Manager — Database Restore ==="
echo ""

if [[ ! -f "${DUMP_FILE}" ]]; then
  fail "Backup file not found: ${DUMP_FILE}"
fi

info "Dump file: ${DUMP_FILE} ($(du -h "${DUMP_FILE}" | cut -f1))"
info "Port: localhost:${LOCAL_PG_PORT}"
echo ""

# Check if pg_restore is available locally; if not, copy dump into pod and restore there
if command -v pg_restore &>/dev/null; then
  RESTORE_MODE="local"
else
  RESTORE_MODE="pod"
fi

POSTGRES_POD=$(oc get pods -l app.kubernetes.io/name=stm-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [[ -z "${POSTGRES_POD}" ]]; then
  fail "No PostgreSQL pod found. Ensure stm-postgres deployment is running."
fi

if [[ "${RESTORE_MODE}" == "local" ]]; then
  info "Using local pg_restore via port-forward"

  oc port-forward svc/stm-postgres "${LOCAL_PG_PORT}:5432" &
  PF_PID=$!
  trap 'kill ${PF_PID} 2>/dev/null || true; wait ${PF_PID} 2>/dev/null || true' EXIT

  for _ in {1..20}; do
    if (echo >"/dev/tcp/127.0.0.1/${LOCAL_PG_PORT}") >/dev/null 2>&1; then break; fi
    sleep 1
  done

  DB_URL="postgresql://stm_dev:stm_dev_password@localhost:${LOCAL_PG_PORT}/slack_thread_manager"

  info "Running pg_restore (--clean --if-exists)..."
  pg_restore --clean --if-exists --no-owner --no-acl \
    -d "${DB_URL}" "${DUMP_FILE}" 2>&1 || warn "pg_restore returned warnings (often safe to ignore)"

  ok "Database restored via local pg_restore"

else
  info "pg_restore not found locally — restoring inside the pod"

  info "Copying dump file to pod..."
  oc cp "${DUMP_FILE}" "${POSTGRES_POD}:/tmp/stm-full-dump.pgdump"

  info "Running pg_restore inside pod..."
  oc exec "${POSTGRES_POD}" -- pg_restore \
    --clean --if-exists --no-owner --no-acl \
    -U stm_dev -d slack_thread_manager \
    /tmp/stm-full-dump.pgdump 2>&1 || warn "pg_restore returned warnings (often safe to ignore)"

  oc exec "${POSTGRES_POD}" -- rm -f /tmp/stm-full-dump.pgdump
  ok "Database restored via in-pod pg_restore"
fi

# Run Drizzle migrations to apply any newer schema changes
info "Running Drizzle migrations (idempotent)..."

if [[ "${RESTORE_MODE}" != "local" ]]; then
  oc port-forward svc/stm-postgres "${LOCAL_PG_PORT}:5432" &
  PF_PID=$!
  trap 'kill ${PF_PID} 2>/dev/null || true; wait ${PF_PID} 2>/dev/null || true' EXIT

  for _ in {1..20}; do
    if (echo >"/dev/tcp/127.0.0.1/${LOCAL_PG_PORT}") >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

MIGRATE_URL="postgresql://stm_dev:stm_dev_password@localhost:${LOCAL_PG_PORT}/slack_thread_manager"
if DATABASE_URL="${MIGRATE_URL}" pnpm --filter @slack-thread-manager/db exec drizzle-kit migrate; then
  ok "Drizzle migrations applied"
else
  if DATABASE_URL="${MIGRATE_URL}" node "${REPO_ROOT}/packages/db/scripts/migrate-raw.js"; then
    ok "Raw migration fallback succeeded"
  else
    warn "Migrations failed — database data is restored but schema may need manual migration"
  fi
fi

echo ""
ok "Restore complete!"
echo ""
