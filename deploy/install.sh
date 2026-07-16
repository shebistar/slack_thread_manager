#!/usr/bin/env bash
#
# install.sh — Greenfield full-stack installer for Slack Thread Manager
#
# Use this script on a fresh (or empty) OpenShift project to provision PVCs,
# PostgreSQL, Keycloak, Ollama, and the application.
#
# For day-2 code updates after a successful install, use deploy/deploy.sh instead.
# deploy.sh is safe to re-run after install.sh (idempotent oc apply + migrations).
#
# Usage: ./deploy/install.sh [tag]
#   tag defaults to "latest"
#
set -euo pipefail

PROJECT="slack-thread-manager"
EXTERNAL_REGISTRY="default-route-openshift-image-registry.apps.ocp4.shebi.eu"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAG="${1:-latest}"

BACKUP_DIR="${SCRIPT_DIR}/backup"

WEB_IMAGE="${EXTERNAL_REGISTRY}/${PROJECT}/stm-web:${TAG}"
API_IMAGE="${EXTERNAL_REGISTRY}/${PROJECT}/stm-api:${TAG}"

LOCAL_PG_PORT=15432
PF_PID=""

cleanup_port_forward() {
  if [[ -n "${PF_PID}" ]] && kill -0 "${PF_PID}" 2>/dev/null; then
    kill "${PF_PID}" 2>/dev/null || true
    wait "${PF_PID}" 2>/dev/null || true
  fi
  PF_PID=""
}

# Kill any stale oc port-forward from a previous failed run targeting our exact
# port/service, rather than blindly killing whatever holds the port. Best-effort
# and non-fatal: if nothing matches, or the kill fails, we proceed regardless —
# a genuinely busy port will surface as a clear connection failure below.
reap_stale_port_forward() {
  if ! command -v pgrep >/dev/null 2>&1; then
    return 0
  fi
  local stale_pid
  stale_pid="$(pgrep -f "oc port-forward svc/stm-postgres ${LOCAL_PG_PORT}:5432" 2>/dev/null | head -1 || true)"
  if [[ -n "${stale_pid}" ]]; then
    warn "found stale port-forward (PID ${stale_pid}) on port ${LOCAL_PG_PORT} — terminating"
    kill "${stale_pid}" 2>/dev/null || true
    for _ in {1..5}; do
      kill -0 "${stale_pid}" 2>/dev/null || break
      sleep 1
    done
  fi
}

trap cleanup_port_forward EXIT
trap 'cleanup_port_forward; exit 130' INT
trap 'cleanup_port_forward; exit 143' TERM

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
echo "============================================="
echo "  Slack Thread Manager — Full Stack Installer"
echo "============================================="
echo ""
info "Tag:       ${TAG}"
info "Project:   ${PROJECT}"
info "Registry:  ${EXTERNAL_REGISTRY}"
echo ""

# ============================================================
# Step 1: Pre-flight checks
# ============================================================
info "Step 1/12: Pre-flight checks"

for cmd in oc podman pnpm jq; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "'$cmd' is not installed or not in PATH"
  fi
done
ok "Required tools available: oc, podman, pnpm, jq"

if ! oc whoami &>/dev/null; then
  fail "Not logged into OpenShift. Run 'oc login' first."
fi
ok "Logged in as: $(oc whoami)"

if [[ "$(oc get configs.imageregistry.operator.openshift.io/cluster -o jsonpath='{.spec.defaultRoute}' 2>/dev/null)" != "true" ]]; then
  info "Enabling image registry default route..."
  oc patch configs.imageregistry.operator.openshift.io/cluster --type merge -p '{"spec":{"defaultRoute":true}}'
  for _ in {1..30}; do
    if oc get route default-route -n openshift-image-registry &>/dev/null; then break; fi
    sleep 2
  done
  ok "Image registry route enabled"
fi

# ============================================================
# Step 2: Create/switch OpenShift project
# ============================================================
info "Step 2/12: Ensuring OpenShift project exists"

if oc get project "${PROJECT}" &>/dev/null; then
  oc project "${PROJECT}" >/dev/null
  ok "Switched to existing project '${PROJECT}'"
else
  oc new-project "${PROJECT}" >/dev/null
  ok "Created new project '${PROJECT}'"
fi

# ============================================================
# Step 3: Apply PVCs (must exist before stateful workloads)
# ============================================================
info "Step 3/12: Applying PersistentVolumeClaims"

oc apply -f "${SCRIPT_DIR}/openshift/pvc.yaml"
ok "PVCs applied (stm-postgres-pvc, ollama-models)"

# ============================================================
# Step 4: Deploy PostgreSQL
# ============================================================
info "Step 4/12: Deploying PostgreSQL"

oc apply -f "${SCRIPT_DIR}/openshift/postgres.yaml"
oc rollout status deployment/stm-postgres --timeout=120s
ok "PostgreSQL is ready"

# ============================================================
# Step 5: Restore database (optional)
# ============================================================
info "Step 5/12: Database restore check"

DUMP_FILE="${BACKUP_DIR}/stm-full-dump.pgdump"
if [[ -f "${DUMP_FILE}" ]]; then
  echo ""
  read -rp "  Backup found at ${DUMP_FILE}. Restore it? [y/N] " RESTORE_CHOICE
  if [[ "${RESTORE_CHOICE}" =~ ^[Yy]$ ]]; then
    info "Restoring database from backup..."
    "${SCRIPT_DIR}/restore-db.sh"
    ok "Database restored from backup"
  else
    info "Skipping restore"
  fi
else
  info "No backup file found — starting with fresh database"
fi

# ============================================================
# Step 6: Run Drizzle migrations
# ============================================================
info "Step 6/12: Running Drizzle migrations"

reap_stale_port_forward

oc port-forward svc/stm-postgres "${LOCAL_PG_PORT}:5432" &
PF_PID=$!

for _ in {1..20}; do
  if (echo >"/dev/tcp/127.0.0.1/${LOCAL_PG_PORT}") >/dev/null 2>&1; then break; fi
  sleep 1
done

MIGRATE_URL="postgresql://stm_dev:stm_dev_password@localhost:${LOCAL_PG_PORT}/slack_thread_manager"
if DATABASE_URL="${MIGRATE_URL}" pnpm --filter @slack-thread-manager/db exec drizzle-kit migrate; then
  ok "Drizzle migrations applied"
else
  warn "drizzle-kit migrate failed — trying raw migration fallback"
  if DATABASE_URL="${MIGRATE_URL}" node "${REPO_ROOT}/packages/db/scripts/migrate-raw.js"; then
    ok "Raw migration fallback succeeded"
  else
    echo ""
    echo "  IMPORTANT: Do NOT use 'drizzle-kit push' as a fallback."
    echo "  It compares the entire database and can DROP tables not in the Drizzle"
    echo "  schema (e.g. Keycloak tables sharing the same database)."
    echo ""
    fail "Database migrations failed — check connectivity and retry manually."
  fi
fi

cleanup_port_forward

# ============================================================
# Step 7: Deploy Keycloak
# ============================================================
info "Step 7/12: Deploying Keycloak"

oc apply -f "${SCRIPT_DIR}/openshift/keycloak.yaml"
oc rollout status deployment/stm-keycloak --timeout=300s
ok "Keycloak is ready"

# ============================================================
# Step 8: Import Keycloak realm (optional)
# ============================================================
info "Step 8/12: Keycloak realm import check"

REALM_FILE="${BACKUP_DIR}/keycloak-realm-export.json"
if [[ -f "${REALM_FILE}" ]]; then
  KC_URL="https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu"
  info "Waiting for Keycloak route to become reachable..."
  for _ in {1..30}; do
    if curl -sk "${KC_URL}/health/ready" | jq -e '.status == "UP"' &>/dev/null; then break; fi
    sleep 5
  done

  ADMIN_TOKEN=$(curl -sk "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" | jq -r .access_token)

  if [[ "${ADMIN_TOKEN}" != "null" && -n "${ADMIN_TOKEN}" ]]; then
    REALM_EXISTS=$(curl -sk -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "${KC_URL}/admin/realms/slack-thread-manager")

    if [[ "${REALM_EXISTS}" == "404" ]]; then
      curl -sk -X POST \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d @"${REALM_FILE}" \
        "${KC_URL}/admin/realms"
      ok "Keycloak realm imported from backup"
    else
      info "Realm 'slack-thread-manager' already exists — skipping import"
    fi
  else
    warn "Could not obtain Keycloak admin token — import manually later"
  fi
else
  info "No realm export found — configure Keycloak manually"
fi

# ============================================================
# Step 9: Deploy Ollama
# ============================================================
info "Step 9/12: Deploying Ollama (this may take a while for model pulls)"

oc apply -f "${SCRIPT_DIR}/openshift/ollama.yaml"
oc rollout status deployment/stm-ollama --timeout=1800s
ok "Ollama is ready with models"

# ============================================================
# Step 10: Build & push application images
# ============================================================
info "Step 10/12: Building and pushing application images"

podman login -u unused -p "$(oc whoami -t)" --tls-verify=false "${EXTERNAL_REGISTRY}"

info "Building web image..."
podman build -t "${WEB_IMAGE}" -f "${SCRIPT_DIR}/Dockerfile.web" "${REPO_ROOT}"

info "Building API image..."
podman build -t "${API_IMAGE}" -f "${SCRIPT_DIR}/Dockerfile.api" "${REPO_ROOT}"

info "Pushing images..."
podman push --tls-verify=false "${WEB_IMAGE}"
podman push --tls-verify=false "${API_IMAGE}"

podman rmi "${WEB_IMAGE}" "${API_IMAGE}" 2>/dev/null || true
podman image prune -f 2>/dev/null || true
ok "Images built and pushed"

# ============================================================
# Step 11: Deploy API + Web
# ============================================================
info "Step 11/12: Deploying API and Web"

oc apply -f "${SCRIPT_DIR}/openshift/api.yaml"
oc apply -f "${SCRIPT_DIR}/openshift/web.yaml"

oc rollout restart deployment/stm-api
oc rollout restart deployment/stm-web

oc rollout status deployment/stm-api --timeout=120s
oc rollout status deployment/stm-web --timeout=120s
ok "API and Web deployed"

# ============================================================
# Step 12: Verify
# ============================================================
info "Step 12/12: Verification"

WEB_URL=$(oc get route stm-web -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
API_URL=$(oc get route stm-api -o jsonpath='{.spec.host}' 2>/dev/null || echo "")

if [[ -n "${API_URL}" ]]; then
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${API_URL}/api/health" || echo "000")
  if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "API health check passed"
  else
    warn "API health check returned HTTP ${HTTP_CODE} (may still be starting)"
  fi
fi

echo ""
echo "============================================="
echo "  Installation Complete!"
echo "============================================="
echo ""
echo "  Web:      https://${WEB_URL:-pending}"
echo "  API:      https://${API_URL:-pending}"
echo "  Keycloak: https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu"
echo "  Ollama:   http://stm-ollama:11434 (cluster-internal)"
echo ""
echo "  Useful commands:"
echo "    oc get pods                          # check pod status"
echo "    oc logs -f deploy/stm-api            # stream API logs"
echo "    oc port-forward svc/stm-postgres 5432:5432  # local DB access"
echo ""
