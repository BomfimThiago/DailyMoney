import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integração com o Ollama local — LENTO e dependente de servidor/modelo, então
// NÃO roda por padrão (mantém `npm test` rápido e offline). Para rodar:
//   ollama serve && ollama pull qwen2.5:7b-instruct
//   RUN_OLLAMA_TESTS=1 npm test
// Exercita o caminho real EXTRACTION_PROVIDER=ollama: PDF (camada de texto) →
// modelo de texto → JSON validado → NormalizedRow.
const BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

async function ollamaUp(): Promise<boolean> {
  if (process.env.RUN_OLLAMA_TESTS !== "1") return false;
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

const up = await ollamaUp();

describe.skipIf(!up)("extração via Ollama (integração)", () => {
  it("extrai transações de um extrato Wise EUR real", async () => {
    // env.ts valida config no import — forneça o mínimo antes de importar.
    process.env.DATABASE_URL ||= "postgresql://x:x@localhost:5432/x";
    process.env.JWT_SECRET ||= "0123456789abcdef0123";
    process.env.EXTRACTION_PROVIDER = "ollama";
    const { extractDocument } = await import("@/lib/ai/extract");

    const file = resolve(__dirname, "../fixtures/statement_143459558_EUR_2025-12-16_2026-08-19.pdf");
    const r = await extractDocument({
      filename: "wise-eur.pdf",
      mime: "application/pdf",
      bytes: readFileSync(file),
    });

    expect(r.rows.length).toBeGreaterThan(0);
    // Moeda sempre normalizada para o enum; valores viram Decimal com 4 casas.
    expect(r.rows.every((x) => ["BRL", "USD", "EUR"].includes(x.baseCurrency))).toBe(true);
    expect(r.rows.every((x) => /^-?\d+\.\d{4}$/.test(x.baseAmount))).toBe(true);
  }, 180_000);
});
