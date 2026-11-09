#!/usr/bin/env bash
# Run on the server as `raices`, from /opt/dailymoney. Touches only the dailymoney project.
set -euo pipefail
cd "$(dirname "$0")/.."

test -f infra/.env.prod || { echo "infra/.env.prod is missing (see infra/.env.prod.example)"; exit 1; }
docker network inspect raices_default >/dev/null || { echo "network raices_default not found"; exit 1; }

git fetch --quiet origin
git reset --hard "origin/${DEPLOY_BRANCH:-main}"

compose=(docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml)
"${compose[@]}" build api
"${compose[@]}" up -d --remove-orphans

for _ in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' dailymoney-api 2>/dev/null || echo starting)
  [ "$status" = healthy ] && { echo "dailymoney-api healthy"; exit 0; }
  sleep 2
done
echo "dailymoney-api did not become healthy"; docker logs --tail 50 dailymoney-api; exit 1
