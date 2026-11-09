/**
 * Prepara dados antigos para a reimportação idempotente. Rodar uma vez por banco
 * depois da migração `idempotent_imports`; rodar de novo não muda nada.
 *
 * 1. Upload.contentHash: SHA-256 do arquivo guardado em storage/uploads.
 * 2. Transaction.dedupeHash: recalculado no formato atual a partir dos dados da própria
 *    transação (as antigas foram gravadas por versões anteriores da impressão digital e
 *    nunca casariam com uma reimportação). Colisão = outra transação idêntica: mantém.
 * 3. Transaction.sourceKey: chave da linha bruta (CSV/XLSX), a partir das linhas da
 *    revisão que deram origem a cada transação.
 *
 * JavaScript puro (sem tsx) para rodar igual no Mac e no container de produção:
 *
 *   node --env-file=.env.local scripts/backfill-idempotency.cjs
 *   docker exec -i -w /app daily-money-app node - < scripts/backfill-idempotency.cjs
 *
 * As funções de chave REPETEM src/lib/dedupe.ts e src/lib/ingest/identity.ts;
 * tests/backfill-parity.test.ts garante que continuam iguais.
 */
const { createHash } = require("crypto");
const { readFile } = require("fs/promises");

function dedupeHash({ bank, date, baseAmount, description }) {
  const { Decimal } = require("@prisma/client/runtime/library");
  const ts = date.toISOString();
  const desc = description.trim().toLowerCase().replace(/\s+/g, " ");
  const amount = new Decimal(String(baseAmount)).toString();
  return createHash("sha256").update(`${bank}|${ts}|${amount}|${desc}`).digest("hex");
}

function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceKeys(rows) {
  const seen = new Map();
  return rows.map((r) => {
    const raw = (r.sourceRowRaw ?? "").trim();
    if (!raw) return null;
    const n = (seen.get(raw) ?? 0) + 1;
    seen.set(raw, n);
    return createHash("sha256").update(`${raw}\u0000${n}`).digest("hex");
  });
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const n = { hashed: 0, missingFile: 0, rehashed: 0, collisions: 0, keyed: 0 };
  try {
    for (const t of await prisma.transaction.findMany()) {
      const next = dedupeHash({
        bank: t.bank ?? "",
        date: t.date,
        baseAmount: t.baseAmount,
        description: t.description,
      });
      if (next === t.dedupeHash) continue;
      try {
        await prisma.transaction.update({ where: { id: t.id }, data: { dedupeHash: next } });
        n.rehashed++;
      } catch {
        n.collisions++;
      }
    }

    for (const u of await prisma.upload.findMany({ orderBy: { createdAt: "asc" } })) {
      if (!u.contentHash && u.rawStoragePath) {
        const bytes = await readFile(u.rawStoragePath).catch(() => null);
        if (bytes) {
          await prisma.upload.update({ where: { id: u.id }, data: { contentHash: contentHash(bytes) } });
          n.hashed++;
        } else {
          n.missingFile++;
        }
      }
      if (u.detectedFormat !== "tabular") continue;
      const staged = await prisma.stagedTransaction.findMany({ where: { uploadId: u.id }, orderBy: { id: "asc" } });
      const keys = sourceKeys(staged);
      for (let i = 0; i < staged.length; i++) {
        const s = staged[i];
        const hash = dedupeHash({
          bank: u.bank ?? "",
          date: s.date,
          baseAmount: s.baseAmount,
          description: s.description,
        });
        await prisma.stagedTransaction.update({ where: { id: s.id }, data: { sourceKey: keys[i], dedupeHash: hash } });
        if (!keys[i]) continue;
        const res = await prisma.transaction.updateMany({
          where: { userId: u.userId, dedupeHash: hash, sourceKey: null },
          data: { sourceKey: keys[i] },
        });
        n.keyed += res.count;
      }
    }

    const totals = {
      transacoes: await prisma.transaction.count(),
      comChaveDeLinha: await prisma.transaction.count({ where: { sourceKey: { not: null } } }),
      importacoesComHash: await prisma.upload.count({ where: { contentHash: { not: null } } }),
      importacoes: await prisma.upload.count(),
    };
    console.log(
      `backfill: ${n.hashed} arquivos com hash · ${n.missingFile} sem arquivo no disco · ` +
        `${n.rehashed} impressões digitais atualizadas (${n.collisions} colisões mantidas) · ` +
        `${n.keyed} transações com chave de linha`,
    );
    console.log("totais:", JSON.stringify(totals));
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { dedupeHash, contentHash, sourceKeys };
// Executado direto (arquivo ou stdin via `node -`), não quando importado pelo teste.
if (require.main === module || !module.parent)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
