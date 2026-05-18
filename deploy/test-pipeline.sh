#!/usr/bin/env bash
#
# End-to-end smoke test for Slack Thread Manager on OpenShift.
# Full chain: oc login → Keycloak auth → health → channels → import → pipeline
#             → staging → briefings → search → UI verification.
#
# Coverage: Epics 1-7 (foundation, ingestion, pipeline, anonymization,
#           briefings, search & discovery, silence detection & monitoring).
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

api_put() {
  local path="$1"
  local body="${2:-{}}"
  local response
  response=$(curl -skf -w "\n%{http_code}" \
    -X PUT \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BASE_URL}${path}" 2>&1) || true
  echo "$response"
}

api_delete() {
  local path="$1"
  local response
  response=$(curl -skf -w "\n%{http_code}" \
    -X DELETE \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}${path}" 2>&1) || true
  echo "$response"
}

api_patch() {
  local path="$1"
  local body="${2:-{}}"
  local response
  response=$(curl -skf -w "\n%{http_code}" \
    -X PATCH \
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

# ─── Step 2b: Silence Threshold Admin Endpoints ────────────────────────────────

echo "─── Step 2b: Silence Threshold Endpoints ───"

response=$(api_get "/admin/silence/thresholds")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /admin/silence/thresholds → 200"
  global_days=$(echo "$body" | jq -r '.data.global.thresholdDays // empty' 2>/dev/null)
  if [[ -n "$global_days" ]]; then
    put_body="{\"thresholdDays\": ${global_days}}"
    response=$(api_put "/admin/silence/thresholds/global" "$put_body")
    status=$(extract_status "$response")
    if [[ "$status" == "200" ]]; then
      log_pass "PUT /admin/silence/thresholds/global → 200"
    else
      log_fail "PUT /admin/silence/thresholds/global → $status"
    fi
  else
    log_fail "Threshold payload missing data.global.thresholdDays"
  fi

  existing_override_id=$(echo "$body" | jq -r '.data.overrides[0].workstreamId // empty' 2>/dev/null)
  if [[ -n "$existing_override_id" ]]; then
    existing_override_days=$(echo "$body" | jq -r '.data.overrides[0].thresholdDays // 3' 2>/dev/null)
    put_override_body="{\"workstreamId\":\"${existing_override_id}\",\"thresholdDays\":${existing_override_days}}"
    response=$(api_put "/admin/silence/thresholds/workstream" "$put_override_body")
    status=$(extract_status "$response")
    if [[ "$status" == "200" ]]; then
      log_pass "PUT /admin/silence/thresholds/workstream (existing override) → 200"
    else
      log_fail "PUT /admin/silence/thresholds/workstream (existing override) → $status"
    fi
  else
    log_info "No existing override found; will validate workstream upsert/delete after roster workstream discovery."
  fi
else
  log_fail "GET /admin/silence/thresholds → $status"
fi

# ─── Step 3: Ensure Roster User Exists ────────────────────────────────────────

echo "─── Step 3: Ensure Roster User (${KC_USER}) ───"

response=$(api_get "/admin/roster")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  existing_user=$(echo "$body" | jq -r --arg email "${KC_USER}@shebi.eu" '.data[] | select(.email == $email) | .id' 2>/dev/null)

  if [[ -n "$existing_user" ]]; then
    log_pass "Roster user already exists: $existing_user"
  else
    log_info "Creating workstream and roster user..."

    # Create workstream via DB (no admin API for workstreams)
    WS_ID=$(oc exec deployment/stm-postgres -n slack-thread-manager -- psql -U stm_dev -d slack_thread_manager -tAc "
      INSERT INTO workstreams (id, name, description, created_at)
      VALUES (gen_random_uuid(), 'Engineering', 'Platform engineering workstream', now())
      ON CONFLICT DO NOTHING
      RETURNING id;
    " 2>/dev/null)

    if [[ -z "$WS_ID" ]]; then
      WS_ID=$(oc exec deployment/stm-postgres -n slack-thread-manager -- psql -U stm_dev -d slack_thread_manager -tAc "
        SELECT id FROM workstreams WHERE name = 'Engineering' LIMIT 1;
      " 2>/dev/null)
    fi
    WS_ID=$(echo "$WS_ID" | tr -d '[:space:]')
    log_info "Workstream ID: $WS_ID"

    # Create roster user via admin API
    roster_body=$(cat <<ROSTER_EOF
{
  "email": "${KC_USER}@shebi.eu",
  "displayName": "Shebi (Admin)",
  "slackHandle": "${KC_USER}",
  "slackNicknames": [],
  "role": "ADMIN",
  "workstreamIds": $(if [[ -n "$WS_ID" ]]; then echo "[\"$WS_ID\"]"; else echo "[]"; fi)
}
ROSTER_EOF
)

    response=$(api_post "/admin/roster" "$roster_body")
    status=$(extract_status "$response")

    if [[ "$status" == "201" ]]; then
      log_pass "Roster user created for ${KC_USER}@shebi.eu"
    elif [[ "$status" == "409" ]]; then
      log_pass "Roster user already exists (409 conflict)"
    else
      log_fail "POST /admin/roster → $status"
    fi
  fi
else
  log_fail "GET /admin/roster → $status"
fi

echo ""

# ─── Step 4: List Channels ──────────────────────────────────────────────────────

echo "─── Step 4: List Channels ───"

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

# ─── Step 5: Import Test Data ───────────────────────────────────────────────────

echo "─── Step 5: Import Test Data ───"

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

# ─── Step 6: Run Pipeline ───────────────────────────────────────────────────────

echo "─── Step 6: Run Pipeline (classify → summarize → embed → correlate → anonymize → stage) ───"

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

# ─── Step 7: Verify Roster ──────────────────────────────────────────────────────

echo "─── Step 7: Verify Roster & Workstreams ───"

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

# ─── Step 7b: Silence Override Delete Endpoint ─────────────────────────────────

echo "─── Step 7b: Silence Override Delete Endpoint ───"

thresholds_response=$(api_get "/admin/silence/thresholds")
thresholds_status=$(extract_status "$thresholds_response")
thresholds_body=$(extract_body "$thresholds_response")

if [[ "$thresholds_status" == "200" ]]; then
  global_days=$(echo "$thresholds_body" | jq -r '.data.global.thresholdDays // 3' 2>/dev/null)
  candidate_workstream_id=$(echo "$thresholds_body" | jq -r '.data.overrides[0].workstreamId // empty' 2>/dev/null)

  if [[ -z "$candidate_workstream_id" ]]; then
    ws_response=$(api_get "/admin/roster/workstreams")
    ws_status=$(extract_status "$ws_response")
    ws_body=$(extract_body "$ws_response")
    if [[ "$ws_status" == "200" ]]; then
      candidate_workstream_id=$(echo "$ws_body" | jq -r '.data[0].id // empty' 2>/dev/null)
    fi
  fi

  if [[ -n "$candidate_workstream_id" ]]; then
    temp_days=$((global_days + 1))
    if (( temp_days > 30 )); then
      temp_days=30
    fi

    create_body="{\"workstreamId\":\"${candidate_workstream_id}\",\"thresholdDays\":${temp_days}}"
    create_response=$(api_put "/admin/silence/thresholds/workstream" "$create_body")
    create_status=$(extract_status "$create_response")
    if [[ "$create_status" == "200" ]]; then
      log_pass "PUT /admin/silence/thresholds/workstream (temp override) → 200"

      delete_response=$(api_delete "/admin/silence/thresholds/workstream/${candidate_workstream_id}")
      delete_status=$(extract_status "$delete_response")
      if [[ "$delete_status" == "204" ]]; then
        log_pass "DELETE /admin/silence/thresholds/workstream/:id → 204"
      else
        log_fail "DELETE /admin/silence/thresholds/workstream/:id → $delete_status"
      fi
    else
      log_fail "PUT /admin/silence/thresholds/workstream (temp override) → $create_status"
    fi
  else
    log_skip "DELETE /admin/silence/thresholds/workstream/:id (no workstream id available)"
  fi
else
  log_fail "GET /admin/silence/thresholds → $thresholds_status"
fi

echo ""

# ─── Step 7c: Silence Alert Endpoints ──────────────────────────────────────────

echo "─── Step 7c: Silence Alert Endpoints ───"

response=$(api_get "/silence/alerts")
status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "GET /silence/alerts → 200"

  if echo "$body" | jq -e '.data.alerts' > /dev/null 2>&1; then
    log_pass "Response has data.alerts array"
    alert_count=$(echo "$body" | jq '.data.alerts | length' 2>/dev/null || echo "0")
    log_info "Active silence alerts: $alert_count"

    if [[ "$alert_count" -gt 0 ]]; then
      first_alert_id=$(echo "$body" | jq -r '.data.alerts[0].id' 2>/dev/null)
      first_topic=$(echo "$body" | jq -r '.data.alerts[0].topicName' 2>/dev/null)
      log_info "First alert: [$first_alert_id] $first_topic"

      dismiss_response=$(api_patch "/silence/alerts/${first_alert_id}/dismiss" "{}")
      dismiss_status=$(extract_status "$dismiss_response")
      dismiss_body=$(extract_body "$dismiss_response")

      if [[ "$dismiss_status" == "200" ]]; then
        log_pass "PATCH /silence/alerts/:id/dismiss → 200"

        dismissed_status=$(echo "$dismiss_body" | jq -r '.data.status' 2>/dev/null)
        if [[ "$dismissed_status" == "dismissed" ]]; then
          log_pass "Alert status returned as 'dismissed'"
        else
          log_fail "Expected status 'dismissed', got '$dismissed_status'"
        fi

        verify_response=$(api_get "/silence/alerts")
        verify_body=$(extract_body "$verify_response")
        still_present=$(echo "$verify_body" | jq --arg id "$first_alert_id" '[.data.alerts[] | select(.id == $id)] | length' 2>/dev/null || echo "1")
        if [[ "$still_present" == "0" ]]; then
          log_pass "Dismissed alert no longer in active alerts list"
        else
          log_fail "Dismissed alert still present in active alerts list"
        fi
      else
        log_fail "PATCH /silence/alerts/:id/dismiss → $dismiss_status"
      fi
    else
      log_info "No active alerts to dismiss (silence detection may not have run)"
    fi
  else
    log_fail "Response missing data.alerts array"
  fi
else
  log_fail "GET /silence/alerts → $status"
fi

echo ""

# ─── Step 8: Approve Staged Threads ─────────────────────────────────────────────

echo "─── Step 8: Approve Staged Threads (staging gate) ───"

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

# ─── Step 9: Generate Briefings ──────────────────────────────────────────────────

echo "─── Step 9: Generate Briefings ───"

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

# ─── Step 10: Verify Briefing API ───────────────────────────────────────────────

echo "─── Step 10: Verify Briefing API (authenticated user view) ───"

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

# ─── Step 11: Search API (Epic 6) ────────────────────────────────────────────────

echo "─── Step 11: Search API (Epic 6 — Search & Discovery) ───"

search_body='{"query": "Keycloak authentication"}'

response=$(curl -skf -w "\n%{http_code}" \
  -X POST \
  -H "$(auth_header)" \
  -H "Content-Type: application/json" \
  -d "$search_body" \
  "${BASE_URL}/search" 2>&1) || true

status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "POST /search → 200"

  result_count=$(echo "$body" | jq '.data.results | length' 2>/dev/null || echo "0")
  search_time=$(echo "$body" | jq '.data.meta.searchTimeMs' 2>/dev/null || echo "?")
  returned_query=$(echo "$body" | jq -r '.data.meta.query' 2>/dev/null || echo "")

  log_info "Results: $result_count, Search time: ${search_time}ms"

  if echo "$body" | jq -e '.data.results' > /dev/null 2>&1; then
    log_pass "Response has 'data.results' array"
  else
    log_fail "Response missing 'data.results' — expected { data: { results: [], meta: {} } }"
  fi

  if echo "$body" | jq -e '.data.meta.total != null and .data.meta.query != null and .data.meta.searchTimeMs != null' > /dev/null 2>&1; then
    log_pass "Response meta has total, query, searchTimeMs"
  else
    log_fail "Response meta incomplete — expected total, query, searchTimeMs"
  fi

  if [[ "$result_count" -gt 0 ]]; then
    log_pass "Search returned results for 'Keycloak authentication'"

    first_headline=$(echo "$body" | jq -r '.data.results[0].threadHeadline' 2>/dev/null || echo "")
    first_match=$(echo "$body" | jq -r '.data.results[0].matchType' 2>/dev/null || echo "")
    first_score=$(echo "$body" | jq '.data.results[0].relevanceScore' 2>/dev/null || echo "0")
    log_info "Top result: [$first_match] $first_headline (score: $first_score)"

    if echo "$body" | jq -e '.data.results[0] | has("threadId", "threadHeadline", "relevanceScore", "matchType")' > /dev/null 2>&1; then
      log_pass "Result item has required fields (threadId, threadHeadline, relevanceScore, matchType)"
    else
      log_fail "Result item missing required fields"
    fi
  else
    log_info "No results for keyword search (threads may not be approved yet — not a failure)"
  fi
else
  log_fail "POST /search → $status (expected 200)"
  if [[ "$VERBOSE" == "true" ]]; then
    log_info "Response: $(extract_body "$response")"
  fi
fi

echo ""

search_empty_body='{"query": "xyznonexistentquerythatmatchesnothing99"}'

response=$(curl -skf -w "\n%{http_code}" \
  -X POST \
  -H "$(auth_header)" \
  -H "Content-Type: application/json" \
  -d "$search_empty_body" \
  "${BASE_URL}/search" 2>&1) || true

status=$(extract_status "$response")
body=$(extract_body "$response")

if [[ "$status" == "200" ]]; then
  log_pass "POST /search (no-match query) → 200"
  empty_count=$(echo "$body" | jq '.data.results | length' 2>/dev/null || echo "-1")

  if [[ "$empty_count" == "0" ]]; then
    log_pass "No-match query returns empty results array"

    if echo "$body" | jq -e '.data.suggestions | length > 0' > /dev/null 2>&1; then
      log_pass "No-match response includes suggestions"
    else
      log_info "No suggestions in empty response (optional)"
    fi
  else
    log_info "No-match query returned $empty_count results (unexpected but not fatal)"
  fi
else
  log_fail "POST /search (no-match query) → $status"
fi

echo ""

anon_response=$(curl -sk -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' \
  "${BASE_URL}/search" 2>&1) || true

anon_status=$(extract_status "$anon_response")

if [[ "$anon_status" == "401" ]]; then
  log_pass "POST /search (anonymous) → 401 Unauthorized"
else
  log_fail "POST /search (anonymous) → $anon_status (expected 401)"
fi

echo ""

# ─── Step 12: UI Verification Summary ───────────────────────────────────────────

echo "─── Step 12: UI Verification ───"

response=$(curl -sk -o /dev/null -w "%{http_code}" "$WEB_URL" 2>&1) || true

if [[ "$response" == "200" ]]; then
  log_pass "Web UI reachable at $WEB_URL"
else
  log_fail "Web UI returned $response at $WEB_URL"
fi

echo ""
echo "  ┌────────────────────────────────────────────────────────┐"
echo "  │  Open in browser to verify:                           │"
echo "  │                                                        │"
echo "  │  ${WEB_URL}/briefings                                  │"
echo "  │  ${WEB_URL}/search                                     │"
echo "  │                                                        │"
echo "  │  Login: ${KC_USER} / ${KC_PASS}                        │"
echo "  │                                                        │"
echo "  │  Briefings:                                            │"
echo "  │   • Briefing cards render with headlines & summaries   │"
echo "  │   • Role-based layout matches user role                │"
echo "  │   • Freshness timestamp shows today's date             │"
echo "  │   • Workstream filter works (Feed layout)              │"
echo "  │   • Slack deep links point to correct threads          │"
echo "  │   • Item type badges display (cross_workstream, etc.)  │"
echo "  │                                                        │"
echo "  │  Search:                                               │"
echo "  │   • Search input accepts query and returns results     │"
echo "  │   • Result cards show headline, summary, match type    │"
echo "  │   • Empty query shows helpful empty state              │"
echo "  │   • Search works against imported test data            │"
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
