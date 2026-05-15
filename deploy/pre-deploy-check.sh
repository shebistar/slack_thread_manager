#!/usr/bin/env bash
#
# Pre-deploy quality gate for Slack Thread Manager.
# Validates lockfile integrity, test suite, and build before deployment.
#
# Usage:
#   ./deploy/pre-deploy-check.sh
#
# This script is called automatically by deploy.sh. It can also be run
# standalone to verify readiness without triggering a deploy.
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed (do NOT deploy)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass=0
fail=0

check_pass() { echo -e "  ${GREEN}✓${NC} $1"; ((pass++)); }
check_fail() { echo -e "  ${RED}✗${NC} $1"; ((fail++)); }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Slack Thread Manager — Pre-Deploy Quality Gate"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ---------- 1. Lockfile integrity ----------
echo "─── Check 1: Lockfile Integrity ───"

if (cd "${REPO_ROOT}" && pnpm install --frozen-lockfile > /dev/null 2>&1); then
  check_pass "pnpm install --frozen-lockfile"
else
  check_fail "Lockfile out of sync — run 'pnpm install' and commit pnpm-lock.yaml"
fi

echo ""

# ---------- 2. Full test suite ----------
echo "─── Check 2: Test Suite ───"

if (cd "${REPO_ROOT}" && pnpm test 2>&1); then
  check_pass "pnpm test (all workspaces)"
else
  check_fail "Test suite has failures — fix before deploying"
fi

echo ""

# ---------- 3. TypeScript build ----------
echo "─── Check 3: TypeScript Build ───"

if (cd "${REPO_ROOT}" && pnpm build 2>&1); then
  check_pass "pnpm build (API + Web)"
else
  check_fail "Build failed — fix TypeScript compilation errors"
fi

echo ""

# ---------- 4. Migration file consistency ----------
echo "─── Check 4: Migration Consistency ───"

MIGRATION_DIR="${REPO_ROOT}/packages/db/src/migrations"
JOURNAL_FILE="${MIGRATION_DIR}/meta/_journal.json"

if [[ -f "$JOURNAL_FILE" ]]; then
  journal_count=$(jq '.entries | length' "$JOURNAL_FILE" 2>/dev/null || echo "0")
  sql_count=$(find "$MIGRATION_DIR" -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$journal_count" == "$sql_count" ]]; then
    check_pass "Migration journal entries ($journal_count) match SQL files ($sql_count)"
  else
    check_fail "Migration mismatch — journal has $journal_count entries but $sql_count SQL files found"
  fi
else
  check_fail "Migration journal not found at $JOURNAL_FILE"
fi

echo ""

# ---------- Summary ----------
echo "═══════════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [[ "$fail" -gt 0 ]]; then
  echo "  Pre-deploy checks FAILED. Do NOT deploy."
  echo ""
  exit 1
else
  echo "  All pre-deploy checks passed. Safe to deploy."
  echo ""
  exit 0
fi
