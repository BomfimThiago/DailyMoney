#!/usr/bin/env bash
# Runs on the server as the forced command of the GitHub Actions deploy key, so that key
# can do nothing else: it reads the code as a tar.gz on stdin, syncs it into the app
# folder and brings up only the dailymoney project. Raíces is never touched.
# install-deploy-key.sh copies this file to ~/bin, outside the folder a deploy replaces.
set -euo pipefail

dir=/home/raices/dailymoney
incoming=$(mktemp -d)
trap 'rm -rf "$incoming"' EXIT

tar -xzf - -C "$incoming"
test -f "$incoming/infra/server-up.sh" || { echo "archive has no infra/server-up.sh"; exit 1; }

rsync -a --delete \
  --exclude .git --exclude node_modules --exclude .venv --exclude .expo --exclude dist \
  --exclude 'infra/.env.prod' --exclude '__pycache__' \
  "$incoming/" "$dir/"

cd "$dir" && infra/server-up.sh
