#!/usr/bin/env bash
#
# End-to-end smoke test for Slack Thread Manager on OpenShift.
# Full chain: oc login → Keycloak auth → health → channels → import → pipeline
#             → staging → briefings → UI verification.
#
# Usage:
#   ./deploy/test-pipeline.sh
#
# Requirements: curl, jq, oc (OpenShift CLI)

set -euo pipefail

# ─── OpenShift Configuration ─────────────────────────────────────────────────
OC_API="https://api.ocp4.shebi.eu:6443"
OC_USER="kubeadmin"
OC_PASS="AMxxZ-CJAvL-dwWmp-R4ncL"

BASE_URL="https://stm-web-slack-thread-manager.apps.ocp4.shebi.eu/api"
WEB_URL="https://stm-web-slack-thread-manager.apps.ocp4.shebi.eu"
KC_URL="https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu"
KC_REALM="slack-thread-manager"
KC_CLIENT="slack-thread-manager-web"
KC_USER="shebi"
KC_PASS="shebi"

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
  echo "Authorization: Bearer $TOKEN"
}

api_get() {
  local path="$1"
  local response
  response=$(curl -skf -w "\n%{http_code}" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}${path}" 2>&1) || true
  echo "$response"
}

api_post() {
  local path="$1"
  local body="${2:-{}}"
  local response
  response=$(curl -skf -w "\n%{http_code}" \
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
echo "  Slack Thread Manager — E2E Pipeline Smoke Test"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  API:    $BASE_URL"
echo "  Web:    $WEB_URL"
echo "  KC:     $KC_URL/realms/$KC_REALM"
echo ""

# ─── Step 0a: OpenShift Login ────────────────────────────────────────────────────

echo "─── Step 0a: OpenShift Login ───"

if oc login -u "$OC_USER" -p "$OC_PASS" "$OC_API" --insecure-skip-tls-verify=true > /dev/null 2>&1; then
  log_pass "oc login → authenticated as $OC_USER"
else
  log_fail "oc login failed — check credentials or cluster reachability"
  exit 1
fi

echo ""

# ─── Step 0b: Obtain JWT from Keycloak ───────────────────────────────────────────

echo "─── Step 0b: Keycloak Authentication ───"

KC_RESPONSE=$(curl -sk -X POST "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token" \
  -d "client_id=${KC_CLIENT}" \
  -d "username=${KC_USER}" \
  -d "password=${KC_PASS}" \
  -d "grant_type=password" 2>&1)

TOKEN=$(echo "$KC_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)

if [[ -n "$TOKEN" && "$TOKEN" != "null" ]]; then
  log_pass "Keycloak login → JWT obtained for user $KC_USER"
  KC_ROLE=$(echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.role // "unknown"' 2>/dev/null)
  log_info "Token role: $KC_ROLE"
else
  KC_ERROR=$(echo "$KC_RESPONSE" | jq -r '.error_description // .error // "unknown error"' 2>/dev/null)
  log_fail "Keycloak login failed: $KC_ERROR"
  echo ""
  echo "  Check Keycloak realm/client/user configuration."
  echo "  Realm: $KC_REALM | Client: $KC_CLIENT | User: $KC_USER"
  exit 1
fi

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
      {"type": "message", "user": "U_TEST1", "text": "We need to refactor the authentication module to support OIDC. The current JWT validation is too tightly coupled to our custom provider and will not work with Keycloak.", "ts": "9999900001.000000"},
      {"type": "message", "user": "U_TEST2", "text": "Agreed. I looked into the Keycloak adapter and we can use passport-openidconnect. The main risk is session handling — we should keep stateless JWT but add token refresh support.", "ts": "9999900002.000000", "thread_ts": "9999900001.000000"},
      {"type": "message", "user": "U_TEST3", "text": "Action item: create a spike branch to test Keycloak integration with our NestJS guards by end of sprint.", "ts": "9999900003.000000", "thread_ts": "9999900001.000000"},
      {"type": "message", "user": "U_TEST2", "text": "Sprint velocity is tracking well — we completed 34 points last sprint. For Q3 planning, we should allocate capacity for the observability epic and the OpenShift migration.", "ts": "9999900010.000000"},
      {"type": "message", "user": "U_TEST1", "text": "The OpenShift migration is critical. We need to move from Docker Compose to proper deployments by end of July. Can we get the infra team involved early?", "ts": "9999900011.000000", "thread_ts": "9999900010.000000"},
      {"type": "message", "user": "U_TEST4", "text": "I will coordinate with the platform team. They have capacity starting next week.", "ts": "9999900012.000000", "thread_ts": "9999900010.000000"},
      {"type": "message", "user": "U_TEST3", "text": "Customer demo went well. They are interested in the briefing feature — specifically the role-based views. Sales team should follow up with a tailored demo for their architects.", "ts": "9999900020.000000"},
      {"type": "message", "user": "U_TEST1", "text": "Great feedback. The intelligence report layout resonated most. Let us make sure the deep links to Slack threads work correctly for the demo environment.", "ts": "9999900021.000000", "thread_ts": "9999900020.000000"}
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

echo "─── Step 5: Run Pipeline (classify → summarize → embed → correlate → anonymize → stage) ───"

response=$(api_post "/admin/pipeline/run" "")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" || "$status" == "201" ]]; then
  log_pass "POST /admin/pipeline/run → $status"

  classification=$(echo "$body" | jq '.data.classification' 2>/dev/null)
  summarization=$(echo "$body" | jq '.data.summarization' 2>/dev/null)
  embedding=$(echo "$body" | jq '.data.embedding' 2>/dev/null)
  correlation=$(echo "$body" | jq '.data.correlation' 2>/dev/null)
  staging=$(echo "$body" | jq '.data.staging' 2>/dev/null)

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

  if [[ "$staging" != "null" ]]; then
    stg_staged=$(echo "$staging" | jq '.threadsStaged' 2>/dev/null || echo "0")
    stg_batch=$(echo "$staging" | jq -r '.batchId' 2>/dev/null || echo "null")
    log_info "Staging: threadsStaged=$stg_staged, batchId=$stg_batch"
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

# ─── Step 7: Approve Staged Threads ─────────────────────────────────────────────

echo "─── Step 7: Approve Staged Threads (staging gate) ───"

response=$(api_get "/admin/staging")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/staging → 200"
  pending_count=$(echo "$body" | jq '.data.counts.pending' 2>/dev/null || echo "0")
  flagged_count=$(echo "$body" | jq '.data.counts.flagged' 2>/dev/null || echo "0")
  log_info "Pending: $pending_count, Flagged: $flagged_count"

  if [[ "$pending_count" -gt 0 ]]; then
    response=$(api_post "/admin/staging/approve-all-clean" "{}")
    status=$(extract_status "$response")
    body=$(extract_body "$response")

    if [[ "$status" == "200" ]]; then
      approved_count=$(echo "$body" | jq '.data.approvedCount' 2>/dev/null || echo "0")
      remaining=$(echo "$body" | jq '.data.remainingPending' 2>/dev/null || echo "0")
      log_pass "POST /admin/staging/approve-all-clean → 200"
      log_info "Approved: $approved_count, Remaining pending: $remaining"

      if [[ "$remaining" -gt 0 ]]; then
        log_info "Flagged items remain — approving individually..."
        pending_response=$(api_get "/admin/staging")
        pending_body=$(extract_body "$pending_response")
        pending_ids=$(echo "$pending_body" | jq -r '.data.items[].id' 2>/dev/null)

        for item_id in $pending_ids; do
          review_resp=$(api_post "/admin/staging/${item_id}/review" '{"action":"approve"}')
          review_status=$(extract_status "$review_resp")
          if [[ "$review_status" == "200" ]]; then
            log_pass "Approved staging item ${item_id:0:8}..."
          else
            log_fail "Failed to approve staging item ${item_id:0:8}... → $review_status"
          fi
        done
      fi
    else
      log_fail "POST /admin/staging/approve-all-clean → $status"
    fi
  else
    log_info "No pending items in staging queue"
  fi
else
  log_fail "GET /admin/staging → $status"
fi

echo ""

# ─── Step 8: Generate Briefings ──────────────────────────────────────────────────

echo "─── Step 8: Generate Briefings ───"

response=$(api_post "/admin/briefings/generate" "")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" || "$status" == "201" ]]; then
  log_pass "POST /admin/briefings/generate → $status"
  users_processed=$(echo "$body" | jq '.data.usersProcessed' 2>/dev/null || echo "0")
  briefings_generated=$(echo "$body" | jq '.data.briefingsGenerated' 2>/dev/null || echo "0")
  items_generated=$(echo "$body" | jq '.data.itemsGenerated' 2>/dev/null || echo "0")
  log_info "Users processed: $users_processed"
  log_info "Briefings generated: $briefings_generated"
  log_info "Items generated: $items_generated"

  if [[ "$briefings_generated" -gt 0 ]]; then
    log_pass "Briefing generation produced content"
  else
    log_fail "Briefing generation produced 0 briefings (need approved threads + roster users)"
  fi
else
  log_fail "POST /admin/briefings/generate → $status"
  if [[ "$VERBOSE" == "true" ]]; then
    log_info "Response: $(extract_body "$response")"
  fi
fi

echo ""

# ─── Step 9: Verify Briefing API ────────────────────────────────────────────────

echo "─── Step 9: Verify Briefing API (authenticated user view) ───"

response=$(api_get "/briefings/today")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /briefings/today → 200"
  briefing_data=$(echo "$body" | jq '.data' 2>/dev/null)

  if [[ "$briefing_data" != "null" && "$briefing_data" != "" ]]; then
    shape=$(echo "$briefing_data" | jq -r '.briefing.briefingShape' 2>/dev/null || echo "unknown")
    thread_count=$(echo "$briefing_data" | jq '.briefing.threadCount' 2>/dev/null || echo "0")
    ws_count=$(echo "$briefing_data" | jq '.briefing.workstreamCount' 2>/dev/null || echo "0")
    item_count=$(echo "$briefing_data" | jq '.items | length' 2>/dev/null || echo "0")
    next_batch=$(echo "$briefing_data" | jq -r '.nextBatchScheduledAt' 2>/dev/null || echo "null")

    log_pass "Briefing data present for authenticated user"
    log_info "Shape: $shape"
    log_info "Threads: $thread_count, Workstreams: $ws_count"
    log_info "Briefing items: $item_count"
    log_info "Next batch: $next_batch"

    if [[ "$item_count" -gt 0 ]]; then
      log_pass "Briefing contains displayable items"
      first_headline=$(echo "$briefing_data" | jq -r '.items[0].headline' 2>/dev/null || echo "")
      first_type=$(echo "$briefing_data" | jq -r '.items[0].itemType' 2>/dev/null || echo "")
      log_info "First item: [$first_type] $first_headline"
    else
      log_fail "Briefing has 0 items (expected at least 1)"
    fi
  else
    log_info "No briefing data for current user (user may not be in roster)"
    log_info "Hint: ensure the JWT user email matches a roster entry"
  fi
else
  log_fail "GET /briefings/today → $status"
fi

echo ""

# ─── Step 10: UI Verification Summary ───────────────────────────────────────────

echo "─── Step 10: UI Verification ───"

response=$(curl -sk -o /dev/null -w "%{http_code}" "$WEB_URL" 2>&1) || true

if [[ "$response" == "200" ]]; then
  log_pass "Web UI reachable at $WEB_URL"
else
  log_fail "Web UI returned $response at $WEB_URL"
fi

echo ""
echo "  ┌────────────────────────────────────────────────────────┐"
echo "  │  Open in browser to verify briefing display:          │"
echo "  │                                                        │"
echo "  │  ${WEB_URL}/briefings                                  │"
echo "  │                                                        │"
echo "  │  Login: ${KC_USER} / ${KC_PASS}                        │"
echo "  │                                                        │"
echo "  │  Verify:                                               │"
echo "  │   • Briefing cards render with headlines & summaries   │"
echo "  │   • Role-based layout matches user role                │"
echo "  │   • Freshness timestamp shows today's date             │"
echo "  │   • Workstream filter works (Feed layout)              │"
echo "  │   • Slack deep links point to correct threads          │"
echo "  │   • Item type badges display (cross_workstream, etc.)  │"
echo "  └────────────────────────────────────────────────────────┘"

echo ""

# ─── Summary ────────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}, ${YELLOW}${skip} skipped${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [[ "$fail" -gt 0 ]]; then
  echo "  Some checks failed. Review output above."
  exit 1
else
  echo "  E2E pipeline smoke test passed."
  exit 0
fi
