#!/usr/bin/env bash
# Run from a clone on the Mac. Copies the code to the server (no GitHub access needed
# there) and brings up only the dailymoney project; Raíces is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

host="${DEPLOY_HOST:-raices@91.98.93.31}"
# /opt is root-only on the server; the app lives in the deploy user's home.
dir="${DEPLOY_DIR:-/home/raices/dailymoney}"

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .venv --exclude .expo --exclude dist \
  --exclude 'infra/.env.prod' --exclude '__pycache__' \
  ./ "$host:$dir/"

ssh "$host" "cd $dir && infra/server-up.sh"
