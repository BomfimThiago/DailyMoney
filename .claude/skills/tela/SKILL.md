---
name: tela
description: Use ao criar ou mudar uma tela ou componente do app Daily Money (app/src). Como seguir o visual aprovado, reaproveitar os componentes, cobrir carregando/vazio/erro e conferir o resultado na web e no Android antes de dizer que está pronto.
---

# Fazer e conferir uma tela do Daily Money

Web e celular são os dois produtos de verdade: toda tela tem que funcionar e ficar bonita
nos dois. O Thiago aprovou o visual nos mocks; não invente outro.

## Visual

- **Fundo branco, cor só em detalhes, títulos e números leves.** Nada de cartões
  coloridos, gradientes, sombras fortes ou negrito pesado. Não pode parecer "feito por IA".
- Cores e fontes **só** de `src/theme.ts` (`colors`, `fonts`). Nunca escreva um hex ou o
  nome de uma fonte na tela. Precisa de uma cor nova? Adicione em `theme.ts` com o motivo.
- Fontes: Figtree 400 (texto), 500 (rótulos), 600 (no máximo títulos pequenos).
- Investimento usa `invest`/`investSoft`; transferência aguardando usa `pending*`;
  entrada `positive`; erro `danger`.

## Reaproveite antes de criar

- `src/components/ui.tsx`: `SectionTitle`, `Chip`, `Button`, `Card`.
- `src/components/nav.tsx`: `TabBar`, `MonthNav`, `Segment` (abas internas, com badge).
- `src/components/TxRow.tsx`: linha de transação. Lista de transações sempre usa ela.
- `src/lib/format.ts`: `money`, `shortDate`, `dayMonth`, `monthLabel` etc. **Nunca**
  formate dinheiro ou data na mão. Valores chegam como string decimal da API; não
  converta para float para fazer conta.
- Tipos da API em `src/lib/types.ts`; chamadas em `src/lib/api.ts`.

## Estados que toda tela precisa

1. **Carregando:** só na primeira vez ou ao trocar de mês. Ao voltar para uma aba, mostre
   os dados que já estavam e atualize por trás (`useRefresh`). Trocar de aba nunca pisca.
2. **Vazio:** frase curta em português dizendo o que fazer ("Envie um extrato para ...").
3. **Erro:** mensagem em português, em `colors.danger`, sem jargão técnico.

## Textos

Português do Brasil, frases curtas e diretas. Mensagens de erro também em português.

## Rotas

Telas em `src/app/` (Expo Router). As três abas ficam em `src/app/(tabs)/` e continuam
montadas; navegue com `router.navigate`. Botão que a checagem do celular toca precisa de
`testID`.

## Conferir antes de dizer que está pronto

1. Os hooks já formatam e passam o lint em cada arquivo editado, e checam tipos no fim.
2. `cd app && npm run check:ui`: gera a web com dados de exemplo, tira foto de cada tela
   (390x844) e falha se a troca de aba piscar ou uma chamada da API não tiver exemplo.
   **Abra as fotos** em `/tmp/dailymoney-check-ui` e olhe: alinhamento, espaços, texto
   cortado, cor fora do tema. Tela nova ou endpoint novo: acrescente em
   `scripts/check-ui/run.mjs` e `fixtures.mjs`.
3. Android: o workflow `mobile` do CI monta o APK e percorre as abas com Maestro
   (`app/e2e/maestro/`), guardando as fotos no artefato `mobile-check-android`. Tela nova
   nas abas: acrescente no fluxo. Confira as fotos do celular também.
4. Mostre as fotos ao Thiago quando a mudança for visual.
