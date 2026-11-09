# Skills de UI (terceiros)

Skills da comunidade para o Claude Code, copiadas para o projeto e versionadas aqui. Todas têm licença MIT; quando o repositório publica um arquivo de licença, ele está ao lado da skill.

| Pasta | Origem | Commit | Uso aqui |
| --- | --- | --- | --- |
| `taste-skill/` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` | 12af471 | Direção visual e inspetor de telas (`scripts/inspect.mjs --app`) |
| `ui-ux-pro-max/` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) `.claude/skills/ui-ux-pro-max` | ccce51c | Busca de paletas, fontes e regras de UX (`scripts/search.py`) |
| `emil-design-eng/`, `review-animations/`, `find-animation-opportunities/` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | c8a7962 | Revisão de animação e microinterações |
| `web-design-guidelines/` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/web-design-guidelines` | 1a2c79d | Auditoria de acessibilidade e UX no código |

## Alteração local

`taste-skill/scripts/lib/cdp.mjs` aceita a variável `TASTE_COOKIES`, um JSON `[{"name","value","url"}]`, para o inspetor conseguir abrir telas logadas. Ao atualizar a skill, reaplique esse trecho.

## Inspecionar uma tela logada

O inspetor precisa do Node 22 ou mais novo e usa o usuário demo, criado com dados sintéticos pelo `scripts/seed-demo.ts`. Faça login com `curl` em `/api/auth/login` usando `DEMO_EMAIL` e `DEMO_PASSWORD` do `.env.local`, monte o JSON de cookies (`dm_access` e `dm_refresh`) e rode:

```bash
TASTE_COOKIES='[...]' node .claude/skills/taste-skill/scripts/inspect.mjs http://localhost:3000/dashboard --app --out .taste-skill/inspect
```

## Notas do teste (nov/2026)

- **Mais úteis:**
  - `web-design-guidelines` encontrou bugs reais: uma data com um dia a menos, foco de teclado invisível e erros de formulário que o leitor de tela não lia;
  - `review-animations` encontrou o clique perdido na Revisão.
- **Boas ideias de layout, regras rígidas:** `taste-skill` propôs a frase-conclusão do mês e a comparação com o mês anterior, mas impõe a própria paleta e os próprios tamanhos ao app inteiro.
- **Genérica:** `ui-ux-pro-max` exige filtrar bem o que ela devolve. Na primeira busca, sugeriu fontes manuscritas.
- **Falso positivo do inspetor (`font-not-dealt`):** o `next/font` renomeia a Manrope para `__Manrope_<hash>`, e o inspetor só aceita o nome exato. A página usa Manrope de fato, por isso a regra está em `allow` no `.taste-skill/direction.json`.
- **Avisos aceitos (nov/2026):**
  - `icon-chips` em Categorias: o editor escolhe a cor e o ícone da própria categoria, então cada opção aparece na cor dela.
  - `panel-void` em Importar: o cartão "Como funciona" acompanha a altura da área de envio.
  - `ragged-row` em Categorias: a lista e o editor têm alturas diferentes por causa do conteúdo.

