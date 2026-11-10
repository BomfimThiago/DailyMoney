#!/bin/bash
# Cloud sessions start from a fresh clone: install the app's and the backend's
# dependencies so lint, type checks and tests work from the first minute.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Each install runs only when a file that decides it changed since it last succeeded.
app_hashes=app/node_modules/.session-start.sha256
if ! sha256sum --check --status "$app_hashes" 2>/dev/null; then
  rm -f "$app_hashes"
  (cd app && npm install --no-audit --no-fund)
  sha256sum .claude/hooks/session-start.sh app/package.json app/package-lock.json > "$app_hashes"
fi

api_hashes=backend/.venv/.session-start.sha256
if ! sha256sum --check --status "$api_hashes" 2>/dev/null; then
  rm -f "$api_hashes"
  (cd backend && uv sync --frozen)
  sha256sum .claude/hooks/session-start.sh backend/pyproject.toml backend/uv.lock > "$api_hashes"
fi
