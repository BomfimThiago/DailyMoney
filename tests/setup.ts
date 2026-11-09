import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Os extratos reais (fixtures/) não vão para o git; sem eles, os testes que dependem deles
// são pulados. Com REQUIRE_FIXTURES=1 (npm run check, hook de commit) pular vira falha:
// um "verde" sem os extratos não prova nada.
if (process.env.REQUIRE_FIXTURES === "1") {
  const dir = resolve(__dirname, "../fixtures");
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    throw new Error("REQUIRE_FIXTURES=1, mas fixtures/ está vazia: copie os extratos reais para lá.");
  }
}
