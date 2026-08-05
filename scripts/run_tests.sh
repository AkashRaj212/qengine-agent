#!/usr/bin/env bash
# Run Playwright web tests and emit QEngine-friendly reports.
# Detects TS (@playwright/test) vs Python (pytest-playwright) automatically.
# Exits non-zero if tests fail (expected) but always writes reports it can.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${ROOT}/reports"
mkdir -p "${REPORT_DIR}"

log()  { printf '\033[36m[run]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[run:error]\033[0m %s\n' "$*" >&2; }

ensure_browsers_node() {
  if ! npx playwright install chromium >/dev/null 2>&1; then
    err "Failed to install Playwright browsers. Try: npx playwright install --with-deps"
  fi
}

run_node() {
  log "Detected @playwright/test (Node)."
  ensure_browsers_node
  # Reporters are also set here so it works even without a config file.
  npx playwright test \
    --reporter="list,json,junit" \
    || true
  # If the project config didn't route outputs, fall back to env-based outputs.
  PLAYWRIGHT_JSON_OUTPUT_NAME="${REPORT_DIR}/results.json" \
  PLAYWRIGHT_JUNIT_OUTPUT_NAME="${REPORT_DIR}/results.junit.xml" \
    npx playwright test --reporter="json,junit" >/dev/null 2>&1 || true
}

run_python() {
  log "Detected pytest-playwright (Python)."
  python -m playwright install chromium >/dev/null 2>&1 || \
    err "Could not install browsers; try: python -m playwright install --with-deps"
  pytest \
    --junit-xml="${REPORT_DIR}/results.junit.xml" \
    --tracing=retain-on-failure \
    --screenshot=only-on-failure
}

STATUS=0
if [[ -f "${ROOT}/package.json" ]] && grep -q '@playwright/test' "${ROOT}/package.json" 2>/dev/null; then
  run_node; STATUS=$?
elif { [[ -f "${ROOT}/pyproject.toml" ]] || [[ -f "${ROOT}/pytest.ini" ]]; } && \
     python -c "import pytest_playwright" >/dev/null 2>&1; then
  run_python; STATUS=$?
else
  err "No Playwright setup found."
  err "Node:   npm i -D @playwright/test && npx playwright install --with-deps chromium"
  err "Python: pip install pytest-playwright && python -m playwright install --with-deps chromium"
  exit 2
fi

if [[ -f "${REPORT_DIR}/results.json" ]] || [[ -f "${REPORT_DIR}/results.junit.xml" ]]; then
  log "Reports written to ${REPORT_DIR}/"
else
  err "No report files were produced. Check the runner output above."
fi

exit "${STATUS}"
