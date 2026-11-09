#!/bin/sh
# Aplica migrations pendentes (idempotente) e sobe o servidor Next standalone.
# Falha de migration aborta o boot — erro sempre visível, nunca sobe com schema errado.
set -e

echo "[entrypoint] prisma migrate deploy…"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] iniciando Next.js em :${PORT:-3000}"
exec node server.js
