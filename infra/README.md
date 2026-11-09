# Deploy — Daily Money (Hetzner, box compartilhada com o raices)

Roda na mesma VPS Hetzner CX43 do raices (`91.98.93.31`), como um projeto
docker-compose separado (`daily-money`). O Caddy do raices termina o TLS e faz
reverse-proxy via a network `raices_default`.

- **URL:** https://money.91.98.93.31.sslip.io (TLS Let's Encrypt via sslip.io)
- **Sem domínio próprio** — sslip.io resolve o hostname direto para o IP.

## Pré-requisitos (uma vez)

1. `cp infra/.env.prod.example infra/.env.prod` e preencher
   (`POSTGRES_PASSWORD`, `JWT_SECRET`, `DATABASE_URL`, `OPENROUTER_API_KEY`).
2. Garantir a mesma senha em `POSTGRES_PASSWORD` e dentro de `DATABASE_URL`.

## 1. Enviar o código para a VPS

Daily Money não está no GitHub — sincroniza via rsync do working tree local:

```bash
rsync -az --delete --dry-run --itemize-changes \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude '.env*.local' --exclude .mcp.json \
  --exclude 'infra/.env.prod*' --exclude .secrets --exclude '*.pem' \
  --exclude storage --exclude receipts --exclude fixtures \
  --exclude .e2e-output --exclude storybook-static --exclude .claude \
  --exclude '*.pdf' --exclude '*.csv' --exclude '*.xlsx' --exclude '*.ofx' \
  -e "ssh -i ~/.ssh/raices_prod" \
  ~/Documents/daily-money/ raices@91.98.93.31:/opt/daily-money/
```

Confira a lista do `--dry-run` (o que seria apagado aparece como `*deleting`) e rode de novo sem ele.

O `infra/.env.prod` **não** vai pelo rsync: o do servidor tem chaves que a cópia local não
tem (Enable Banking). Edite-o na VPS e guarde um backup antes (`cp infra/.env.prod infra/.env.prod.bak-$(date +%F)`).

## 2. Buildar e subir (na VPS)

```bash
ssh -i ~/.ssh/raices_prod raices@91.98.93.31
cd /opt/daily-money
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build
docker compose -f infra/docker-compose.prod.yml logs -f app   # acompanha migrate + boot
```

O entrypoint roda `prisma migrate deploy` antes de subir o servidor. Sobe também
os containers `daily-money-db` e `daily-money-ollama`.

### 2b. Baixar o modelo do Ollama (uma vez; fica no volume `ollama`)

```bash
docker exec daily-money-ollama ollama pull qwen2.5:3b
docker exec daily-money-ollama ollama list   # confere
```

Extração por IA = **Ollama local, grátis** (`EXTRACTION_PROVIDER=ollama`). PDFs: a
camada de texto é extraída no app e enviada ao modelo; imagens exigem
`OLLAMA_VISION_MODEL`. CPU-only é lento — o container é limitado a 4 vCPUs/6GB
para não sufocar o raices. Para +precisão (e +lentidão): `OLLAMA_MODEL=qwen2.5:7b-instruct`.

## 3. Expor pelo Caddy do raices

Adicionar o bloco de `infra/Caddyfile.snippet` ao Caddyfile do raices e recarregar:

```bash
# no seu Mac: colar o snippet em ~/Documents/raices/infra/caddy/Caddyfile,
# commitar/deployar no raices, OU editar direto na VPS:
#   /opt/raices/infra/caddy/Caddyfile
cd /opt/raices
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## 4. Verificar

```bash
curl -I https://money.91.98.93.31.sslip.io      # 200/3xx + cadeia TLS válida
```

## Atualizações futuras

Repetir passo 1 (rsync) + `up -d --build`. Migrations aplicam sozinhas no boot.

Antes de um deploy com migração, faça backup do banco:

```bash
docker exec daily-money-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip > ~/backups/daily-money/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Uma vez, depois da migração `idempotent_imports` (nov/2026)

Prepara os dados antigos para a reimportação idempotente (hash dos arquivos, impressões
digitais no formato atual e chave de linha das planilhas). Rodar de novo não muda nada:

```bash
docker exec -i -w /app daily-money-app node - < scripts/backfill-idempotency.cjs
```
