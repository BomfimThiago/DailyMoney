import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Decimal } from "@/lib/money";
import { pdfLines, readSectionedStatement, SECTION_MISMATCH, type PositionedLine } from "@/lib/ingest/pdf-sections";

// Extrato por seções (Nubank): sem saldo por linha; dias com "Total de entradas/saídas".
// Tudo vem do texto, sem IA. Layout sintético abaixo reproduz as posições (x, y) do PDF.

const line = (y: number, ...items: [number, string][]): PositionedLine => ({
  y,
  items: items.map(([x, s]) => ({ x, s })),
});
const header = (y: number) => [
  line(y, [423, "Fulana de Tal"]),
  line(y - 13, [362, "CPF"], [386, "•••.111.222-••"], [442, "Agência"], [484, "0001"], [509, "Conta"]),
  line(y - 70, [57, "01 DE OUTUBRO DE 2026"], [171, "a"], [178, "31 DE OUTUBRO DE 2026"], [469, "VALORES EM R$"]),
];
const footer = (page: number) => [
  line(111, [57, "Tem alguma dúvida? Mande uma mensagem para nosso time pelo chat do app."]),
  line(75, [57, "disponíveis em nubank.com.br/contatos#ouvidoria ."]),
  line(56, [110, "Extrato gerado dia 05 de novembro de 2026 às 13:01"], [516, `${page} de 2`]),
];
const PAGES: PositionedLine[][] = [
  [
    ...header(775),
    line(670, [338, "Saldo inicial"], [505, "100,00"]),
    line(630, [338, "Total de entradas"], [491, "+500,10"]),
    line(610, [338, "Total de saídas"], [493, "-559,00"]),
    line(590, [338, "Saldo final do período"], [522, "41,10"]),
    line(539, [58, "01 OUT 2026"], [120, "Total de entradas"], [510, "+ 0,10"]),
    line(518, [120, "Crédito em conta"], [517, "0,10"]),
    line(473, [58, "02 OUT 2026"], [120, "Total de entradas"], [497, "+ 500,00"]),
    line(452, [120, "Transferência recebida pelo Pix"], [260, "BELTRANO - •••.333.444-•• -"], [504, "500,00"]),
    line(432, [260, "CAIXA ECONOMICA FEDERAL (0104) Agência: 999"]),
    line(378, [120, "Total de saídas"], [498, "- 559,00"]),
    line(357, [120, "Pagamento de boleto efetuado"], [262, "MIDWAY"], [514, "59,00"]),
    // lançamento que começa no fim da página e continua na seguinte
    line(
      250,
      [120, "Transferência enviada pelo Pix"],
      [262, "RECEITA FEDERAL - 00.000.000/0001-00 - BCO"],
      [504, "500,00"],
    ),
    ...footer(1),
  ],
  [
    ...header(781),
    line(674, [262, "DO BRASIL S.A. (0001) Agência: 1234 Conta:"]),
    line(654, [262, "123456-7"]),
    line(500, [57, "O saldo líquido corresponde ao total de depósitos e rendimentos em conta"]),
    line(480, [57, "Nu Pagamentos S.A. - Instituição de Pagamento"]),
    ...footer(2),
  ],
];

describe("readSectionedStatement", () => {
  it("sinal pela seção, data pelo dia, descrição em várias linhas (até na página seguinte)", () => {
    const st = readSectionedStatement(PAGES)!;
    expect(st.bank).toBe("Nubank");
    expect(st.rows.map((r) => [r.date.toISOString().slice(0, 10), r.baseAmount, r.baseCurrency])).toEqual([
      ["2026-10-01", "0.1000", "BRL"],
      ["2026-10-02", "500.0000", "BRL"],
      ["2026-10-02", "-59.0000", "BRL"],
      ["2026-10-02", "-500.0000", "BRL"],
    ]);
    expect(st.rows[1].description).toBe(
      "Transferência recebida pelo Pix BELTRANO - •••.333.444-•• - CAIXA ECONOMICA FEDERAL (0104) Agência: 999",
    );
    // continua na página 2; o aviso final (mais à esquerda) não entra
    expect(st.rows[3].description).toBe(
      "Transferência enviada pelo Pix RECEITA FEDERAL - 00.000.000/0001-00 - BCO DO BRASIL S.A. (0001) Agência: 1234 Conta: 123456-7",
    );
    expect(st.sections.every((s) => s.ok)).toBe(true);
    expect(st.balanced).toBe(true);
    expect(st.warnings).toEqual([]);
    expect(st.rows.every((r) => r.sourceIsStatementLine && r.sourceRowRaw)).toBe(true);
  });

  it("seção que não fecha com o total vai para revisão, com aviso", () => {
    const pages = structuredClone(PAGES);
    const i = pages[0].findIndex((l) => l.items.some((it) => it.s === "MIDWAY"));
    pages[0][i] = line(357, [120, "Pagamento de boleto efetuado"], [262, "MIDWAY"], [514, "58,00"]); // total diz 559,00
    const st = readSectionedStatement(pages)!;
    const boleto = st.rows.find((r) => r.description.includes("MIDWAY"))!;
    expect(boleto.needsReview).toBe(true);
    expect(boleto.reviewReason).toBe(SECTION_MISMATCH);
    expect(st.warnings.join(" ")).toMatch(/saídas somam 558\.00, o extrato diz 559\.00/);
    expect(st.balanced).toBe(false);
  });

  it("documento sem seções não é desse formato", () => {
    expect(
      readSectionedStatement([
        [line(500, [50, "Fecha Concepto Importe Saldo"]), line(480, [50, "01/07/2026 Mercado -10,00€ 90,00€"])],
      ]),
    ).toBeNull();
  });
});

// Extratos reais (fora do git): o PDF tem que dar exatamente o CSV do mesmo período.
const FIX = resolve(__dirname, "../fixtures");
describe.each(["01OUT2026_31OUT2026", "01NOV2026_04NOV2026"])("Nubank %s (fixture real)", (period) => {
  const base = resolve(FIX, `NU_857376284_${period}`);
  it.skipIf(!existsSync(`${base}.pdf`) || !existsSync(`${base}.csv`))(
    "PDF = CSV (data e valor), seções e saldo fecham",
    async () => {
      const st = readSectionedStatement(await pdfLines(readFileSync(`${base}.pdf`)))!;
      const csv = readFileSync(`${base}.csv`, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => {
          const [d, v] = l.split(",");
          const [dd, mm, yy] = d.split("/");
          return `${yy}-${mm}-${dd} ${new Decimal(v).toFixed(2)}`;
        });
      const pdf = st.rows.map((r) => `${r.date.toISOString().slice(0, 10)} ${new Decimal(r.baseAmount).toFixed(2)}`);
      expect(pdf.sort()).toEqual(csv.sort());
      expect(st.sections.filter((s) => !s.ok)).toEqual([]);
      expect(st.balanced).toBe(true);
      expect(st.bank).toBe("Nubank");
      expect(st.rows.filter((r) => !r.description)).toEqual([]);
    },
  );
});

// Os outros extratos reais (com saldo por linha) não são desse formato: seguem para IA + razão.
describe("outros bancos não caem no leitor por seções", () => {
  const others = existsSync(FIX) ? readdirSync(FIX).filter((f) => f.endsWith(".pdf") && !f.startsWith("NU_")) : [];
  it.skipIf(!others.length).each(others)("%s", async (f) => {
    expect(readSectionedStatement(await pdfLines(readFileSync(resolve(FIX, f))))).toBeNull();
  });
});
