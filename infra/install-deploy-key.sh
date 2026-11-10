#!/usr/bin/env bash
# One-time setup, run from a clone on the Mac. Lets the GitHub Actions "deploy" workflow
# deploy Daily Money with a key of its own that can only run receive-deploy.sh.
#   1. creates ~/.ssh/dailymoney_deploy (no passphrase) if it does not exist yet;
#   2. copies receive-deploy.sh to ~/bin on the server and authorizes the key there,
#      locked to that command (no shell, no forwarding);
#   3. stores the private key and the server's host key as GitHub secrets via `gh`.
set -euo pipefail
cd "$(dirname "$0")/.."

host="${DEPLOY_HOST:-raices@91.98.93.31}"
server="${host#*@}"
key="$HOME/.ssh/dailymoney_deploy"

[ -f "$key" ] || ssh-keygen -q -t ed25519 -N '' -C 'dailymoney-github-deploy' -f "$key"
pub=$(cat "$key.pub")
entry="restrict,command=\"/home/raices/bin/dailymoney-receive\" $pub"

scp -q infra/receive-deploy.sh "$host:/tmp/dailymoney-receive"
ssh "$host" "mkdir -p ~/bin && install -m 755 /tmp/dailymoney-receive ~/bin/dailymoney-receive \
  && rm /tmp/dailymoney-receive \
  && (grep -qF '$pub' ~/.ssh/authorized_keys || echo '$entry' >> ~/.ssh/authorized_keys)"
echo "Key authorized on the server (deploy only)."

if command -v gh >/dev/null; then
  gh secret set DEPLOY_SSH_KEY --repo BomfimThiago/DailyMoney < "$key"
  ssh-keyscan -t ed25519 "$server" 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --repo BomfimThiago/DailyMoney
  echo "GitHub secrets DEPLOY_SSH_KEY and DEPLOY_KNOWN_HOSTS set."
else
  echo "gh not found: install it (brew install gh && gh auth login) and run this script again."
fi
