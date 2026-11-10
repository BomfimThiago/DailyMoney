#!/bin/bash
# Before Claude finishes a reply: if the app or the backend has uncommitted changes, their
# type check must pass. A failure goes back to Claude (exit 2) instead of a "done".
set -uo pipefail

input=$(cat)
# Already continuing because of this hook: let it stop, so a failure can't loop forever.
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
changed=$(git status --porcelain 2>/dev/null)

fail=0
if grep -qE ' app/' <<<"$changed" && [ -d app/node_modules ]; then
  if ! out=$(cd app && npx --no-install tsc --noEmit 2>&1); then
    echo "tsc falhou no app:" >&2
    echo "$out" | head -40 >&2
    fail=1
  fi
fi
if grep -qE ' backend/' <<<"$changed" && [ -d backend/.venv ]; then
  if ! out=$(cd backend && uv run --frozen mypy app tests 2>&1); then
    echo "mypy falhou no backend:" >&2
    echo "$out" | tail -40 >&2
    fail=1
  fi
fi
[ "$fail" = 0 ] || exit 2
exit 0
