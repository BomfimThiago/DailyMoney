# Daily Money

Finanças da família em BRL, USD e EUR: importa extratos, categoriza sozinho e mostra
para onde o dinheiro vai. App Expo (iPhone, Android e web) + API em Python.

O código do app antigo (Next.js) está na branch `legado`, como referência para portar
leitores de extrato, deduplicação, câmbio e bancos conectados.

## Estrutura

```
backend/   API FastAPI (Python 3.12, SQLAlchemy 2, Alembic, uv)
app/       App Expo (iPhone, Android e web; hoje: tela de login e início provisório)
infra/     Deploy no Hetzner, ao lado do Raíces
```

## Rodar a API localmente

```bash
cd backend
cp .env.example .env            # preencha ALLOWED_EMAILS
uv sync
uv run alembic upgrade head     # Postgres 16 em localhost:5432
uv run uvicorn app.main:app --reload
```

## Rodar o app localmente

```bash
cd app
cp .env.example .env            # EXPO_PUBLIC_API_URL=http://localhost:8000
npm install
npx expo start --web
```

O login do Google no celular precisa de um build de desenvolvimento (não roda no
Expo Go); por enquanto o login é pelo navegador.

## Testes

```bash
cd backend
uv run pytest --cov=app         # precisa do banco dailymoney_test em localhost:5432
uv run ruff check app tests && uv run mypy app tests
```

## Login

Por link no e-mail (Resend): o link vale 15 minutos e funciona uma vez. Só entram os
e-mails de `ALLOWED_EMAILS`; para qualquer outro a API responde igual e não envia nada.
Sem `RESEND_API_KEY` em desenvolvimento (`DEBUG=true`) o link aparece no log da API.
O primeiro login cria a família com um único membro; os outros membros são adicionados
nas configurações. O login com Google já existe na API e entra no app depois.

## Deploy

Projeto Docker `dailymoney` em `/home/raices/dailymoney` no servidor do Raíces, com Postgres
próprio. Só a API entra na rede `raices_default` para o Caddy do Raíces alcançá-la.

1. Uma vez: copiar `infra/.env.prod.example` para `infra/.env.prod` e preencher.
2. Uma vez, com o ok do dono: adicionar `infra/Caddyfile.snippet` ao Caddyfile do Raíces.
3. A cada versão, do Mac: `infra/deploy.sh` (copia o código por rsync e sobe só o projeto `dailymoney`).
