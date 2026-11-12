# CLAUDE.md — Daily Money

Leia o README. Regras que valem sempre:

- **Dinheiro é `Decimal` / `NUMERIC(18,4)`**, nunca float. A IA nunca escreve valores:
  valores e sinais vêm do extrato; a IA só escolhe categoria de uma lista.
- **Tudo pertence a uma família** (`family_id`); toda consulta filtra pela família do
  usuário logado. Id de outra família responde 404, igual a "não existe".
- **Routers só fazem HTTP**; regra de negócio em `services/`. Testes antes do código,
  cobertura mínima 80% (CI barra).
- **Migrações só via Alembic**, testadas com upgrade e downgrade.
- **Servidor Hetzner é produção compartilhada com o Raíces:** o deploy mexe só no
  projeto `dailymoney`; nunca reiniciar nada do Raíces. O Caddy do Raíces só muda com
  ok explícito do Thiago.
- Commits em Conventional Commits; textos da interface e mensagens de erro em português.
- **Tipos do app vêm da API:** mudou um schema do backend, rode `cd app && npm run api:types`
  e faça commit de `openapi.json` e `src/lib/api.gen.ts` (o CI barra se ficarem desatualizados).
- **Qualidade (skill `/ub-mode`, do Uncle Bob):** ao mudar código, siga
  `.claude/skills/ub-mode/SKILL.md`; `scripts/ub-tools.sh` roda crapper (CRAP < 10),
  dryer (duplicação < 0.8) e mutator (teste de mutação) no `backend` ou no `app`.
