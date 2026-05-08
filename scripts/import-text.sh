#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FILE="${1:?Usage: $0 <text-file> <channel-uuid> <slack-team-id>}"
CHANNEL_ID="${2:?Usage: $0 <text-file> <channel-uuid> <slack-team-id>}"
TEAM_ID="${3:?Usage: $0 <text-file> <channel-uuid> <slack-team-id>}"
LOCAL_PG_PORT=15432

echo "=== Slack Text Import ==="
echo "File:       ${FILE}"
echo "Channel ID: ${CHANNEL_ID}"
echo "Team ID:    ${TEAM_ID}"
echo ""

echo "--- Starting port-forward to PostgreSQL ---"
oc port-forward svc/stm-postgres "${LOCAL_PG_PORT}:5432" &
PF_PID=$!
sleep 3

echo "--- Running import ---"
MIGRATE_URL="postgresql://stm_dev:stm_dev_password@localhost:${LOCAL_PG_PORT}/slack_thread_manager"
DATABASE_URL="${MIGRATE_URL}" npx tsx "${REPO_ROOT}/packages/db/src/import-text.ts" "${FILE}" "${CHANNEL_ID}" "${TEAM_ID}"

echo ""
echo "--- Verifying data ---"
oc exec deploy/stm-postgres -- psql -U stm_dev -d slack_thread_manager -c \
  "SELECT count(*) AS thread_count FROM slack_threads WHERE channel_id = '${CHANNEL_ID}'; SELECT count(*) AS message_count FROM thread_messages tm JOIN slack_threads st ON tm.thread_id = st.id WHERE st.channel_id = '${CHANNEL_ID}';"

kill "${PF_PID}" 2>/dev/null || true
wait "${PF_PID}" 2>/dev/null || true

echo ""
echo "=== Import complete ==="
