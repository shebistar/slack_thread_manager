#!/usr/bin/env bash
set -euo pipefail

PROJECT="slack-thread-manager"
EXTERNAL_REGISTRY="default-route-openshift-image-registry.apps.ocp4.shebi.eu"
INTERNAL_REGISTRY="image-registry.openshift-image-registry.svc:5000"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAG="${1:-latest}"

WEB_IMAGE="${EXTERNAL_REGISTRY}/${PROJECT}/stm-web:${TAG}"
API_IMAGE="${EXTERNAL_REGISTRY}/${PROJECT}/stm-api:${TAG}"

echo "=== Slack Thread Manager — OpenShift Deploy ==="
echo "Tag:       ${TAG}"
echo "Web image: ${WEB_IMAGE}"
echo "API image: ${API_IMAGE}"
echo ""

# ---------- Pre-deploy quality gate ----------
echo "--- Pre-deploy quality gate ---"

if [[ -x "${SCRIPT_DIR}/pre-deploy-check.sh" ]]; then
  "${SCRIPT_DIR}/pre-deploy-check.sh"
else
  echo "WARN: deploy/pre-deploy-check.sh not found or not executable — running inline checks"
  echo ""
  echo "--- Checking lockfile integrity ---"
  (cd "${REPO_ROOT}" && pnpm install --frozen-lockfile) || {
    echo "ERROR: Lockfile out of sync. Run 'pnpm install' and commit pnpm-lock.yaml."
    exit 1
  }

  echo ""
  echo "--- Running full test suite ---"
  (cd "${REPO_ROOT}" && pnpm test) || {
    echo "ERROR: Tests failed. Fix failing tests before deploying."
    exit 1
  }

  echo ""
  echo "--- Building all packages ---"
  (cd "${REPO_ROOT}" && pnpm build) || {
    echo "ERROR: Build failed. Fix TypeScript compilation errors before deploying."
    exit 1
  }
fi

echo ""
echo "--- Pre-deploy checks passed ---"
echo ""

# ---------- Registry login ----------
echo "--- Logging into OpenShift internal registry ---"
podman login -u unused -p "$(oc whoami -t)" --tls-verify=false "${EXTERNAL_REGISTRY}"

# ---------- Build ----------
echo "--- Building web image ---"
podman build \
  -t "${WEB_IMAGE}" \
  -f "${SCRIPT_DIR}/Dockerfile.web" \
  "${REPO_ROOT}"

echo "--- Building api image ---"
podman build \
  -t "${API_IMAGE}" \
  -f "${SCRIPT_DIR}/Dockerfile.api" \
  "${REPO_ROOT}"

# ---------- Push ----------
echo "--- Pushing web image ---"
podman push --tls-verify=false "${WEB_IMAGE}"

echo "--- Pushing api image ---"
podman push --tls-verify=false "${API_IMAGE}"

# ---------- Clean up local images ----------
echo "--- Removing local images to free disk space ---"
podman rmi "${WEB_IMAGE}" "${API_IMAGE}" 2>/dev/null || true
podman image prune -f 2>/dev/null || true

# ---------- Deploy to OpenShift ----------
echo "--- Switching to project ${PROJECT} ---"
oc project "${PROJECT}" 2>/dev/null || oc new-project "${PROJECT}"

echo "--- Applying PostgreSQL ---"
oc apply -f "${SCRIPT_DIR}/openshift/postgres.yaml"

echo "--- Waiting for PostgreSQL readiness ---"
oc rollout status deployment/stm-postgres --timeout=120s || true

# ---------- Database migrations ----------
echo "--- Running database migrations ---"
LOCAL_PG_PORT=15432
oc port-forward svc/stm-postgres "${LOCAL_PG_PORT}:5432" &
PF_PID=$!

# Wait for the local forwarded port to accept connections.
for _ in {1..20}; do
  if (echo >"/dev/tcp/127.0.0.1/${LOCAL_PG_PORT}") >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

MIGRATE_URL="postgresql://stm_dev:stm_dev_password@localhost:${LOCAL_PG_PORT}/slack_thread_manager"
if DATABASE_URL="${MIGRATE_URL}" pnpm --filter @slack-thread-manager/db exec drizzle-kit migrate; then
  echo "--- Migrations applied successfully ---"
else
  echo "WARN: drizzle-kit migrate failed — attempting raw migration fallback..."
  if DATABASE_URL="${MIGRATE_URL}" node "${REPO_ROOT}/packages/db/scripts/migrate-raw.js"; then
    echo "--- Raw migration fallback applied successfully ---"
  else
    echo "ERROR: migration fallback also failed — check database connectivity and retry manually"
    echo ""
    echo "  IMPORTANT: Do NOT use 'drizzle-kit push' as a fallback."
    echo "  It compares the entire database and can DROP tables not in the Drizzle"
    echo "  schema (e.g. Keycloak tables sharing the same database)."
    echo ""
    echo "  To debug:"
    echo "    oc port-forward svc/stm-postgres 15432:5432"
    echo "    DATABASE_URL=postgresql://stm_dev:stm_dev_password@localhost:15432/slack_thread_manager \\"
    echo "      pnpm --filter @slack-thread-manager/db exec drizzle-kit migrate"
    echo "    DATABASE_URL=postgresql://stm_dev:stm_dev_password@localhost:15432/slack_thread_manager \\"
    echo "      node packages/db/scripts/migrate-raw.js"
    kill "${PF_PID}" 2>/dev/null || true
    wait "${PF_PID}" 2>/dev/null || true
    exit 1
  fi
fi

kill "${PF_PID}" 2>/dev/null || true
wait "${PF_PID}" 2>/dev/null || true

echo "--- Applying API ---"
oc apply -f "${SCRIPT_DIR}/openshift/api.yaml"

echo "--- Applying Web ---"
oc apply -f "${SCRIPT_DIR}/openshift/web.yaml"

# Force redeployment to pull latest images
echo "--- Rolling out latest images ---"
oc rollout restart deployment/stm-api
oc rollout restart deployment/stm-web

echo "--- Waiting for rollouts ---"
oc rollout status deployment/stm-api --timeout=120s || true
oc rollout status deployment/stm-web --timeout=120s || true

# ---------- Summary ----------
WEB_URL=$(oc get route stm-web -o jsonpath='{.spec.host}' 2>/dev/null || echo "pending")
echo ""
echo "=== Deploy complete ==="
echo "Web URL:  https://${WEB_URL}"
echo "Project:  ${PROJECT}"
echo ""
echo "Useful commands:"
echo "  oc get pods                    # check pod status"
echo "  oc logs -f deploy/stm-api      # stream API logs"
echo "  oc logs -f deploy/stm-web      # stream web logs"
echo "  oc port-forward svc/stm-postgres 5432:5432  # local DB access"
