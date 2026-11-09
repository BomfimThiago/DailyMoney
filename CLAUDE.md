# CLAUDE.md — convenções do projeto (harness feedforward)

Contexto: app pessoal de finanças multi-moeda. Prioridade é **correção de valores
monetários** e **erros sempre visíveis**. Ver `README.md` para setup e arquitetura.

## Regras invioláveis
- **Dinheiro é sempre `Decimal`** (`src/lib/money.ts`), nunca `number`/float.
  Colunas monetárias são `Decimal(18,4)` no Prisma. Valor digitado passa por
  `parseMoneyInput` ("1.500" é mil e quinhentos); a API só aceita decimal canônico
  (`decimalAmount` em `src/lib/validation.ts`).
- **A IA nunca grava direto em `Transaction`.** Toda extração (CSV inferido ou
  PDF) vira `StagedTransaction`, é revisada e só então commitada.
- **A IA não transcreve números de CSV/XLSX.** Ela só infere o *layout*
  (`FormatProfile`) uma vez; a aplicação às linhas é determinística (`apply.ts`).
  Em PDF com saldo corrido, o mesmo vale para os números: valor, sinal e saldo vêm do
  texto do extrato (`src/lib/ingest/pdf-ledger.ts`); a IA só dá data e descrição, e o
  que ela inventa ou pula aparece como aviso na importação. Medir mudanças na leitura
  de PDF com `scripts/compare-pdf-csv.ts` (PDF × CSV do mesmo período).
  PDF por seções com totais (Nubank) nem passa pela IA (`src/lib/ingest/pdf-sections.ts`,
  conferido pelos totais de cada dia e pelo saldo final); PDF que é só imagem (CaixaBankNow "digital")
  também não: OCR local (poppler + tesseract, `src/lib/ingest/ocr/`) dá candidatas e o saldo
  corrido escolhe (`src/lib/ingest/ocr-ledger.ts`); o que não fecha entra marcado para revisão; OFX é lido direto (`ofx.ts`);
  CSV de banco conhecido tem banco e moeda pelo cabeçalho (`tabular/known-layouts.ts`).
  Banco conectado (Pluggy no Brasil, Enable Banking na Europa) também não passa pela IA
  (`src/lib/pluggy/`, `src/lib/enablebanking/`, orquestrado em `src/lib/bank-sync/`): cada sincronização
  vira importação para revisar, e só se confirma sozinha quando não muda nada.
  Investimentos da Pluggy (`src/lib/pluggy/investments.ts`, gravados em `src/lib/investments/save.ts`)
  são saldos, não transações: atualizam `Investment` a cada sincronização, sem revisão, e nunca
  entram em `Transaction` (a aplicação e o resgate já aparecem na conta como movimentação).
- **Todo erro é evidenciado.** APIs usam `handle()` + `HttpError` (`src/lib/http.ts`);
  a UI usa `useToast`, `<ErrorState>` e estados de loading em toda chamada async.
- **Bordas validadas com Zod** (entrada de API e saída da IA).
- **Importar é idempotente.** Reenviar o mesmo arquivo (mesmo `contentHash`) atualiza o que
  já foi gravado em vez de duplicar: cada linha de CSV/XLSX é identificada pelo texto bruto
  (`sourceKey`, `src/lib/ingest/identity.ts`), não pelo que o leitor extraiu; o que um leitor
  antigo inventou é removido ao confirmar. Categoria, responsável, tipo e transferência
  interna escolhidos pelo usuário nunca são sobrescritos por uma reimportação.
- **Fontes não se duplicam nem se sobrescrevem.** A mesma conta por arquivo (CSV/OFX/PDF) e
  por banco conectado: a linha que já está em Transações vinda de outra fonte vira
  `DUPLICATE` e não entra; a de lá não é tocada. Casamento pelo DIA inteiro de cada fonte
  (mesmo banco, total do dia igual, ≥ metade das linhas com valor idêntico), nunca por
  descrição (`src/lib/ingest/cross-source.ts`, medido em `tests/cross-source.test.ts`).
  Dia que não fecha vira "possível repetida" para o usuário decidir; nada some sem evidência.
  A confirmação recusa enquanto houver possível repetida sem resposta (`isUndecidedDuplicate`),
  e leitura com linha ilegível (`partialRead`) não remove nada.

## UI: só componentes e hooks
- **Telas (`src/app/**/*.tsx`) só montam peças**: componentes de `@/components/ui`,
  `@/components/finance` e `@/components/states`; dados só por hooks de `@/hooks`.
  `src/lib` é servidor e funções puras: não importa React, hooks nem componentes (ESLint).
  Nada de Radix/cmdk/cva, `useQuery`/`useMutation` ou `api` direto na página.
- **Sem cor solta**: nada de hex, `style={{}}` ou paleta padrão do Tailwind (`bg-red-500`).
  Só tokens (`primary`, `success`, `warning`, `destructive`, `transfer`, `muted`, `subtle`).
  Cor de categoria/responsável vem do banco e é aplicada pelos componentes.
- **Dinheiro na tela só com `<Money>`** (gasto “−” em tinta, entrada “+” verde,
  transferência interna cinza; original embaixo quando a moeda difere).
- **Faltou componente?** Crie em `src/components/ui` (ou `finance`) **com story** em
  `src/stories/` e confira no Storybook (`npm run storybook`) antes de usar na tela.
- O ESLint barra tudo isso em `src/app` (`.eslintrc.json`), inclusive dados fora dos hooks.
- Visual (v3.1, tasteskill "pastel-consumer" em **folha branca**; direção em
  `.taste-skill/direction.json`): **fundo branco** (o chão cinza foi rejeitado), barra
  lateral numa segunda camada neutra quase imperceptível (`sidebar`) com linha fina,
  **cartões brancos com borda de 1px (`card-border`) e sem sombra** (sombra só no que
  flutua), controles sempre brancos (`field`), raio 20px, **Manrope em tudo** (nada de serifa — pareceu "desenhado à mão").
  Cobalto (`primary`) só na ação principal e no dado em foco; categorias e responsáveis
  em etiquetas de tinta pálida da própria cor. Sem rótulo pequeno em maiúsculas acima do
  título, sem ícone em quadradinho colorido, sem bordas tracejadas. O subtítulo da tela
  diz a conclusão ("Gastos 45% abaixo de outubro…"). Fonte da verdade: Storybook.
- Conferir tela: `taste-skill` `inspect.mjs --app` com o usuário demo (ver
  `.claude/skills/README.md`); 0 FAIL, e os WARN restantes precisam ter justificativa.
- Decisões tomadas (ver Storybook › Decisões):
  - Tabelas **confortáveis** (56px; `<Table density>` padrão).
  - Transações **agrupadas por dia** (`<TGroupRow>`); clicar numa coluna (`<TH onSort>`)
    ordena e vira lista plana; desligar a ordenação volta aos dias.
  - Escolher categoria = **`<CategoryPicker>`** (combobox com busca, grupos, criar na hora;
    `appearance="pill"` dentro de linhas). Não usar select nativo para categoria.
  - **Accordion** em: filtros no celular, detalhes de cada importação, categorias do
    Resumo abrindo as transações da categoria.

## Padrões
- Rotas de API: `export const GET/POST = handle(async (req, ctx) => { ... })`.
  Rotas GET que leem cookies/dados: `export const dynamic = "force-dynamic"`.
  Categoria/responsável vindos do cliente: `assertOwnRefs` (`src/lib/transactions/refs.ts`).
- Auth: `requireUser()` em handlers protegidos; middleware cobre o resto.
- Frontend: React Query para fetch/mutations; nunca deixe falha silenciosa.
- Novos parsers/regras: adicione uma **fixture real** e um teste em `tests/`.

## Testes
- `npm run check` (tipos, lint, formatação, testes com `REQUIRE_FIXTURES=1`) deve passar
  antes de qualquer commit; o hook `.githooks/pre-commit` roda ele.
- Ao corrigir um bug de parsing, primeiro adicione a fixture que o reproduz.
- Mexeu em importação, revisão ou exclusão? Rode o e2e pela interface com o app no ar:
  `npm run e2e:import` (acha a porta sozinho; conta demo do `scripts/seed-demo.ts`; screenshots em
  `.e2e-output/`). Ele reimporta o mesmo arquivo com bugs simulados e confere que
  corrige sem duplicar.
- Mexeu na leitura de extratos (CSV ou PDF)? Rode também `npm run e2e:statements`: importa
  pela tela cada extrato real de `fixtures/`, confere linhas e soma por moeda contra
  `fixtures/e2e-expected.json`, reenvia com outro nome (0 novas, 0 removidas) e exclui.
  Com PDFs leva ~30 min; suba o app com `EXTRACTION_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:3b`
  para medir como em produção.
- Mexeu em banco conectado europeu? `npm run e2e:enablebanking` contra o servidor falso
  (`scripts/fake-enablebanking.ts`): conectar, sincronizar, renovar, recusar, desconectar.

## Não fazer
- Não introduzir float em cálculo de dinheiro.
- Não rodar `next build` com `next dev` ativo (corrompe `.next`).
- Não hardcodar nomes da família no código — eles vêm de `Member`.
