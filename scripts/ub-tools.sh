#!/usr/bin/env bash
# Runs Uncle Bob's quality tools (used by the ub-mode skill) on the backend or the app.
#
#   scripts/ub-tools.sh <crapper|dryer|mutator> <backend|app> [args passed to the tool]
#
# The tools are fetched once, at fixed commits, into .tools/ub (ignored by git).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tools="$root/.tools/ub"

# Pinned so a change upstream never changes what runs here without a commit.
declare -A pins=(
  [crapper]=c757ec79a6c15dc815238bbd9c2f4601eb54d3cc
  [dryer]=66ff6d21a42c04afcad89c78a80066176d1294b0
  [mutator]=830ec7e9c39664d753f8699015bc796df67727b9
)

usage() {
  echo "uso: scripts/ub-tools.sh <crapper|dryer|mutator> <backend|app> [argumentos]" >&2
  exit 64
}

[ $# -ge 2 ] || usage
tool=$1
project=$2
shift 2
[ -n "${pins[$tool]:-}" ] || usage
[ "$project" = backend ] || [ "$project" = app ] || usage

fetch() {
  local name=$1 dir="$tools/$1"
  if [ ! -d "$dir/.git" ]; then
    mkdir -p "$tools"
    git clone -q "https://github.com/unclebob/$name" "$dir"
  fi
  if [ "$(git -C "$dir" rev-parse HEAD)" != "${pins[$name]}" ]; then
    git -C "$dir" fetch -q origin
    git -C "$dir" checkout -q "${pins[$name]}"
  fi
}

fetch "$tool"
# mutator takes function names from crapper, which must sit next to it.
[ "$tool" = mutator ] && fetch crapper

cd "$root/$project"
exec "$tools/$tool/$tool" "$@"
