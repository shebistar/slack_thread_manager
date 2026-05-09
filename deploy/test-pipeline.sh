#!/usr/bin/env bash
#
# Smoke-test script for Slack Thread Manager pipeline on OpenShift (or any deployed instance).
# Exercises: health → channels → import → pipeline run → verify results.
#
# Usage:
#   ./deploy/test-pipeline.sh
#   BASE_URL=https://stm-api.apps.cluster.example.com/api ./deploy/test-pipeline.sh
#   TOKEN=$(cat /path/to/jwt.txt) ./deploy/test-pipeline.sh
#
# Requirements: curl, jq

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
TOKEN="${TOKEN:-}"
CHANNEL_ID="${CHANNEL_ID:-}"
VERBOSE="${VERBOSE:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0
skip=0

log_pass() { echo -e "  ${GREEN}✓${NC} $1"; ((pass++)); }
log_fail() { echo -e "  ${RED}✗${NC} $1"; ((fail++)); }
log_skip() { echo -e "  ${YELLOW}⊘${NC} $1 (skipped)"; ((skip++)); }
log_info() { echo -e "  → $1"; }

auth_header() {
  if [[ -n "$TOKEN" ]]; then
    echo "Authorization: Bearer $TOKEN"
  else
    echo "X-No-Auth: true"
  fi
}

api_get() {
  local path="$1"
  local response
  response=$(curl -sf -w "\n%{http_code}" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}${path}" 2>&1) || true
  echo "$response"
}

api_post() {
  local path="$1"
  local body="${2:-{}}"
  local response
  response=$(curl -sf -w "\n%{http_code}" \
    -X POST \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BASE_URL}${path}" 2>&1) || true
  echo "$response"
}

extract_body() {
  echo "$1" | head -n -1
}

extract_status() {
  echo "$1" | tail -n 1
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Slack Thread Manager — Pipeline Smoke Test"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Target: $BASE_URL"
echo "  Auth:   $(if [[ -n "$TOKEN" ]]; then echo 'JWT provided'; else echo 'NO TOKEN (public endpoints only)'; fi)"
echo ""

# ─── Step 1: Public Health Check ────────────────────────────────────────────────

echo "─── Step 1: Public Health Check ───"

response=$(api_get "/health")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /health → 200"
  if echo "$body" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    log_pass "status: ok"
  else
    log_fail "status field missing or not 'ok'"
  fi
else
  log_fail "GET /health → $status (expected 200)"
  echo ""
  echo "  Cannot reach API. Aborting."
  exit 1
fi

echo ""

# ─── Step 2: Admin Health Check ─────────────────────────────────────────────────

echo "─── Step 2: Admin Health Check ───"

if [[ -z "$TOKEN" ]]; then
  log_skip "GET /admin/health (no JWT token provided)"
  log_skip "GET /admin/llm/health (no JWT token provided)"
  echo ""
  echo "  Set TOKEN env var to test authenticated endpoints."
  echo "  Remaining steps require authentication. Exiting."
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}, ${YELLOW}${skip} skipped${NC}"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
fi

response=$(api_get "/admin/health")
status=$(extract_status "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/health → 200"
else
  log_fail "GET /admin/health → $status (expected 200; is token valid?)"
  echo ""
  echo "  Auth failed. Check that TOKEN is a valid admin JWT."
  exit 1
fi

response=$(api_get "/admin/llm/health")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/llm/health → 200"
  llm_status=$(echo "$body" | jq -r '.data.status' 2>/dev/null || echo "unknown")
  log_info "LLM status: $llm_status"
else
  log_fail "GET /admin/llm/health → $status"
fi

echo ""

# ─── Step 3: List Channels ──────────────────────────────────────────────────────

echo "─── Step 3: List Channels ───"

response=$(api_get "/admin/channels")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/channels → 200"
  channel_count=$(echo "$body" | jq '.data | length' 2>/dev/null || echo "0")
  log_info "Channels found: $channel_count"

  if [[ -z "$CHANNEL_ID" && "$channel_count" -gt 0 ]]; then
    CHANNEL_ID=$(echo "$body" | jq -r '.data[0].id' 2>/dev/null)
    log_info "Using first channel: $CHANNEL_ID"
  fi
else
  log_fail "GET /admin/channels → $status"
fi

echo ""

# ─── Step 4: Import Test Data ───────────────────────────────────────────────────

echo "─── Step 4: Import Test Data ───"

if [[ -z "$CHANNEL_ID" ]]; then
  log_skip "POST /admin/channels/:id/import (no channel available)"
else
  import_body='{
    "slackTeamId": "T_SMOKETEST",
    "messages": [
      {"type": "message", "user": "U_TEST1", "text": "Smoke test thread start - pipeline validation", "ts": "9999900001.000000"},
      {"type": "message", "user": "U_TEST2", "text": "Reply to smoke test thread with technical context", "ts": "9999900002.000000", "thread_ts": "9999900001.000000"},
      {"type": "message", "user": "U_TEST1", "text": "Action item: verify pipeline runs end to end", "ts": "9999900003.000000", "thread_ts": "9999900001.000000"}
    ]
  }'

  response=$(api_post "/admin/channels/${CHANNEL_ID}/import" "$import_body")
  status=$(extract_status "$response")
  body=$(extract_body "$response")

  if [[ "$status" == "200" ]]; then
    log_pass "POST /admin/channels/${CHANNEL_ID}/import → 200"
    threads_stored=$(echo "$body" | jq '.data.threadsStored' 2>/dev/null || echo "?")
    log_info "Threads stored: $threads_stored"
  else
    log_fail "POST /admin/channels/${CHANNEL_ID}/import → $status"
    if [[ "$VERBOSE" == "true" ]]; then
      log_info "Response: $(extract_body "$response")"
    fi
  fi
fi

echo ""

# ─── Step 5: Run Pipeline ───────────────────────────────────────────────────────

echo "─── Step 5: Run Pipeline ───"

response=$(api_post "/admin/pipeline/run" "")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" || "$status" == "201" ]]; then
  log_pass "POST /admin/pipeline/run → $status"

  classification=$(echo "$body" | jq '.data.classification' 2>/dev/null)
  summarization=$(echo "$body" | jq '.data.summarization' 2>/dev/null)
  embedding=$(echo "$body" | jq '.data.embedding' 2>/dev/null)
  correlation=$(echo "$body" | jq '.data.correlation' 2>/dev/null)

  if [[ "$classification" != "null" ]]; then
    c_processed=$(echo "$classification" | jq '.processed' 2>/dev/null || echo "0")
    c_failed=$(echo "$classification" | jq '.failed' 2>/dev/null || echo "0")
    log_info "Classification: processed=$c_processed, failed=$c_failed"
  fi

  if [[ "$summarization" != "null" ]]; then
    s_processed=$(echo "$summarization" | jq '.processed' 2>/dev/null || echo "0")
    s_failed=$(echo "$summarization" | jq '.failed' 2>/dev/null || echo "0")
    log_info "Summarization: processed=$s_processed, failed=$s_failed"
  fi

  if [[ "$embedding" != "null" ]]; then
    e_processed=$(echo "$embedding" | jq '.processed' 2>/dev/null || echo "0")
    e_failed=$(echo "$embedding" | jq '.failed' 2>/dev/null || echo "0")
    log_info "Embedding: processed=$e_processed, failed=$e_failed"
  fi

  if [[ "$correlation" != "null" ]]; then
    cor_created=$(echo "$correlation" | jq '.created' 2>/dev/null || echo "0")
    cor_pairs=$(echo "$correlation" | jq '.pairsEvaluated' 2>/dev/null || echo "0")
    log_info "Correlation: created=$cor_created, pairsEvaluated=$cor_pairs"
  fi
else
  log_fail "POST /admin/pipeline/run → $status"
  if [[ "$VERBOSE" == "true" ]]; then
    log_info "Response: $(extract_body "$response")"
  fi
fi

echo ""

# ─── Step 6: Verify Roster ──────────────────────────────────────────────────────

echo "─── Step 6: Verify Roster & Workstreams ───"

response=$(api_get "/admin/roster")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/roster → 200"
  member_count=$(echo "$body" | jq '.data | length' 2>/dev/null || echo "0")
  log_info "Roster members: $member_count"
else
  log_fail "GET /admin/roster → $status"
fi

response=$(api_get "/admin/roster/workstreams")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/roster/workstreams → 200"
  ws_count=$(echo "$body" | jq '.data | length' 2>/dev/null || echo "0")
  log_info "Workstreams: $ws_count"
else
  log_fail "GET /admin/roster/workstreams → $status"
fi

echo ""

# ─── Summary ────────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}, ${YELLOW}${skip} skipped${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [[ "$fail" -gt 0 ]]; then
  echo "  ⚠️  Some checks failed. Review output above."
  exit 1
else
  echo "  Pipeline smoke test passed."
  exit 0
fi
