# Daily Money

Controle financeiro familiar multi-moeda (BRL / USD / EUR) com importação de
extratos e recibos. Uso pessoal, sem escala. Construído com harness engineering:
o que é determinístico (parsers, conversão, testes) é separado do que é inferencial
(IA de PDF), e a IA nunca grava direto no banco — sempre passa por revisão humana.

## Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind + shadcn-style UI
- **Postgres** (Docker) + **Prisma**
- **Auth JWT** própria (access + refresh em cookies httpOnly)
- **Câmbio:** Frankfurter (ECB), cacheado em `FxRate`
- **IA (opcional, só para PDF/imagem):** Ollama local (grátis, usado em produção) ou
  OpenRouter, atrás de uma interface plugável (`src/lib/ai/extract.ts`)
- **Bancos conectados:** Pluggy (Open Finance BR) e Enable Banking (Open Banking europeu)

## Setup

```bash
cp .env.example .env          # ajuste JWT_SECRET; IA e bancos conectados são opcionais
npm install
npm run db:up                 # sobe o Postgres (Docker)
npm run db:migrate            # cria as tabelas
npm run dev                   # http://localhost:3000
```

Crie sua conta em `/register`. Ao registrar, categorias e responsáveis padrão são
criados automaticamente. O app é pessoal: depois do primeiro usuário o cadastro fecha
(`ALLOW_REGISTRATION=true` reabre).

Para desenvolver e testar, crie o usuário demo com dados sintéticos (`DEMO_EMAIL` e
`DEMO_PASSWORD` no `.env.local`): `npx tsx --env-file=.env.local scripts/seed-demo.ts`.

> ⚠️ Não rode `npm run build` com o `npm run dev` ativo — ambos usam `.next` e o
> dev server corrompe. Pare um antes de rodar o outro.

## Fluxo de uso
1. **Responsáveis** → quem gastou ou recebeu (aparece nas transações e nos filtros).
   Nada é marcado como transferência interna sozinho: marque "Interna" na revisão ou na
   transação, e ela fica fora dos totais de gasto e de entrada.
2. **Importar** → arraste um CSV/XLSX/OFX/PDF; o banco vem do arquivo (ou digite).
   - CSV/XLSX: parsing determinístico (layout inferido 1x e reusado via `FormatProfile`).
   - OFX e PDF por seções (Nubank): lidos direto, sem IA.
   - Outros PDFs e imagens: a IA dá data e descrição; valor e sinal vêm do texto do
     extrato quando há saldo corrido (requer `EXTRACTION_PROVIDER=ollama` ou
     `OPENROUTER_API_KEY`).
   - **Banco conectado** (Open Finance pela Pluggy, plano gratuito Meu Pluggy): em
     Importar › Bancos conectados, cole o id da conexão (Dashboard da Pluggy ›
     Applications › sua aplicação › Demo › Connect Account › MeuPluggy › Connected Items).
     Cada sincronização vira uma importação por conta (conta corrente, cartão) que passa
     pela revisão; sem novidade, ela se confirma sozinha. Comece depois do último extrato
     importado por arquivo: o Open Finance usa outras descrições e duplicaria. A fatura do
     cartão aparece no cartão (pagamento recebido) e na conta (pagamento de fatura): marque
     as duas como "Interna". Requer `PLUGGY_APP_ID`/`PLUGGY_APP_SECRET`; em produção, a
     rotina diária (contêiner `cron`) usa `CRON_SECRET`.
   - **Banco europeu** (Open Banking pela Enable Banking, modo restrito, grátis para uso
     pessoal): em Importar › Conectar banco › Europa, escolha país e banco e autorize no
     próprio banco; você volta ao app com as contas autorizadas. Só entram transações já
     lançadas; valor e sinal vêm do banco (`src/lib/enablebanking/`). A autorização vale
     até 180 dias: perto de vencer, aparece "Autorizar de novo", que renova a mesma conexão
     sem duplicar (a conta é identificada pelo hash da API, não pelo id da sessão).
     Requer `ENABLE_BANKING_APP_ID` e a chave da aplicação (ver `.env.example`). Para
     testar sem conta real: `npx tsx scripts/fake-enablebanking.ts` e `npm run
     e2e:enablebanking` (instruções no cabeçalho dos dois arquivos).
3. **Revisar** → ajuste tipo/categoria/responsável; confirme. O câmbio da data é
   aplicado e as 3 moedas são gravadas. Reenviar o mesmo arquivo atualiza em vez de
   duplicar; a mesma transação vinda de outra fonte (arquivo × banco) não entra, e a
   "possível repetida" espera você dizer se é a mesma antes de confirmar.
4. **Resumo** e **Transações** → tabela mensal por moeda e filtros.

## Testes / verificação
```bash
npm run check     # tudo antes de commitar: tipos, lint, formatação e testes
npm test          # parsers, câmbio, dedupe, cross-source… contra extratos reais (fixtures/)
npm run storybook # componentes e decisões de UI (fonte da verdade visual)
npm run e2e:import        # pela tela, com o app no ar: reimportar sem duplicar
npm run e2e:statements    # cada extrato real de fixtures/ pela tela
npm run e2e:enablebanking # banco europeu contra o servidor falso
```

`fixtures/` tem extratos reais e não vai para o git: sem ela, os testes que dependem
dela são pulados (`REQUIRE_FIXTURES=1` faz falhar em vez de pular). O hook de commit
(`.githooks/pre-commit`, ligado pelo `npm install`) roda o `npm run check` e recusa
segredos e extratos no commit.

## Arquitetura (resumo)
- `src/lib/tabular/*` — pipeline determinístico: detecção → inferência de layout
  (`infer.ts`) → aplicação (`apply.ts`). O `FormatProfile` é salvo por
  fingerprint do header, então bancos novos funcionam sem código novo.
- `src/lib/ingest/` — importação:
  - `process.ts`: arquivo ou conta sincronizada → linhas em revisão;
  - `commit.ts`: revisão → Transações (câmbio, reimportação, remoções);
  - `lineage.ts`: o que é da mesma fonte;
  - `cross-source.ts`: a mesma transação vinda de outra fonte;
  - `identity.ts` e `dedupe.ts`: chave da linha e impressão digital;
  - `pdf-ledger.ts`, `pdf-sections.ts`, `ofx.ts`: leitores sem IA;
  - `classify.ts`: gasto ou entrada pelo sinal (interna só o usuário marca);
  - `running.ts`: leitura interrompida por reinício vira falha visível.
- `src/lib/bank-sync/` — sincronização genérica de banco conectado. Cada conta
  reimporta como um arquivo (mesma `contentHash`). Depois da primeira confirmação, só lê
  as últimas semanas, e `coversFrom` limita o que pode sumir.
  - `src/lib/pluggy/`: cliente, leitor (`map.ts`) e provedor.
  - `src/lib/enablebanking/`: cliente JWT RS256, autorização no banco (`auth.ts`),
    leitor e provedor.
- `src/lib/fx/*` — câmbio Frankfurter com cache e fallback de dia útil.
- `src/lib/ai/extract.ts` — extração de documentos por IA (schema Zod, retry).
- `src/lib/auth/*` — JWT próprio, refresh rotativo, limite de tentativas e cadastro fechado.
- `src/lib/validation.ts` — esquemas Zod das bordas (valor, data).
- `src/hooks/*` — dados das telas (React Query + toasts de erro) e o cliente da API.
  `src/lib` não importa nada de tela; o ESLint garante isso.
- `src/components/{ui,finance,states}` — peças das telas, cada uma com story em `src/stories`.
- `src/app/api/*` — rotas REST protegidas por JWT (`handle()` + Zod).
- `src/app/(app)/*` — telas autenticadas; `login/register/forgot/reset` são públicas.

## Privacidade
Com `EXTRACTION_PROVIDER=ollama` (o padrão em produção), nada sai do servidor. Com
OpenRouter, PDFs e imagens vão para a nuvem na extração. CSV, XLSX, OFX e PDF por seções
são lidos localmente, sem IA.
