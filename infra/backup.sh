#!/usr/bin/env bash
# Nightly Postgres dump, kept 14 days on the server. Off-site copy (R2) comes later.
set -euo pipefail
dir=/home/raices/dailymoney-backups
mkdir -p "$dir"
docker exec dailymoney-db pg_dump -U dailymoney -Fc dailymoney > "$dir/dailymoney-$(date -u +%F).dump"
find "$dir" -name 'dailymoney-*.dump' -mtime +14 -delete
