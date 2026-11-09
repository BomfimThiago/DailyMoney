# syntax=docker/dockerfile:1
# Daily Money — produção self-hosted (Hetzner VPS, Docker).
# Multi-stage: deps → build (next standalone + prisma generate) → runner enxuto.

FROM node:20-alpine AS base
# libc6-compat + openssl: exigidos pelos engines do Prisma em Alpine (musl).
RUN apk add --no-cache libc6-compat openssl

# ── deps: instala TODAS as deps (inclui prisma CLI, usado no runtime p/ migrate)
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder: gera o client do Prisma e builda o Next em modo standalone
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# env.ts valida o ambiente no import e faz throw se faltar (fail-fast, req. 13).
# O build não acessa o banco — só precisa que a validação passe. Placeholders
# vivem só neste estágio; o runtime usa o .env.prod real.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    JWT_SECRET="build-time-placeholder-value-unused-at-runtime"
RUN npx prisma generate
RUN npm run build

# ── runner: imagem final mínima
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# OCR de PDF que é só imagem (ex.: CaixaBankNow "digital"), sem IA: o poppler desenha cada
# página e o tesseract lê as palavras; os números são conferidos pelo saldo corrido
# (src/lib/ingest/ocr-ledger.ts). Espanhol cobre os extratos europeus (OCR_LANG muda).
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-spa

# Saída standalone do Next (server.js + node_modules traçados)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma: schema + migrations + CLI + engines p/ rodar `migrate deploy` no boot.
# (o standalone do Next não inclui a CLI do Prisma, que é devDependency)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# unpdf (extração da camada de texto de PDFs no provider Ollama) é importado
# dinamicamente e o tracing do Next não o inclui no standalone — copie explícito.
# É autossuficiente (sem deps de runtime; pdfjs vendorizado).
COPY --from=builder /app/node_modules/unpdf ./node_modules/unpdf

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh \
 && mkdir -p storage/uploads \
 && chown -R nextjs:nodejs storage

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
