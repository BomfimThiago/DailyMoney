#!/bin/bash
# After Claude edits a file: format it and lint it. Problems that survive the auto-fix go
# back to Claude (exit 2) so they get fixed now, not at the end.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

case "$file" in
  "$root"/app/*.ts | "$root"/app/*.tsx | "$root"/app/*.js)
    cd "$root/app" || exit 0
    [ -d node_modules ] || exit 0
    npx --no-install prettier --write --log-level warn "$file" >/dev/null 2>&1
    if ! out=$(npx --no-install eslint --fix "$file" 2>&1); then
      echo "ESLint ainda acusa problemas em $file:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
  "$root"/app/*.json | "$root"/app/*.md)
    cd "$root/app" || exit 0
    [ -d node_modules ] && npx --no-install prettier --write --log-level warn "$file" >/dev/null 2>&1
    ;;
  "$root"/backend/*.py)
    cd "$root/backend" || exit 0
    uv run --frozen ruff format --quiet "$file" >/dev/null 2>&1
    if ! out=$(uv run --frozen ruff check --fix --quiet "$file" 2>&1); then
      echo "ruff ainda acusa problemas em $file:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
esac
exit 0
