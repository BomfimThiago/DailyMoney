import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAmountCell, parseBalance, parseDateCell, readOcrLedger } from "@/lib/ingest/ocr-ledger";
import { parseTsv, type OcrPass, type OcrWord } from "@/lib/ingest/ocr/tesseract";
import { Decimal } from "@/lib/money";

describe("campos lidos por OCR", () => {
  it.each([
    ["251,18€", "251.18"],
    ["3.215,68€", "3215.68"],
    ["274, 73€", "274.73"], // partido pelo OCR
    ["42 42€", "42.42"], // vírgula lida como espaço
    ["1011.54", "1011.54"],
    ["25118", null], // sem centavos: não é saldo
    ["3/4,30€", null],
  ])("saldo %s → %s", (raw, want) => expect(parseBalance(raw)?.toFixed(2) ?? null).toBe(want));

  it.each([
    ["-14.5", "-14.50"],
    ["-2,1", "-2.10"],
    ["3049.05", "3049.05"],
    ["-1.2.0", null],
    ["-25ñ", null],
  ])("valor %s → %s", (raw, want) => expect(parseAmountCell(raw)?.toFixed(2) ?? null).toBe(want));

  it.each([
    ["04/11/2026", "2026-11-04"],
    ["0411/2026", "2026-11-04"],
    ["0111112026", "2026-11-01"],
    ["2//110/2026", "2026-10-21"], // lido errado: outras leituras e a ordem decidem
    ["31/02/2026", null],
    ["3870/0076", null],
  ])("data %s → %s", (raw, want) => expect(parseDateCell(raw)?.toISOString().slice(0, 10) ?? null).toBe(want));

  it("TSV do tesseract: palavras com posição relativa à página", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t",
      "5\t1\t1\t1\t1\t1\t100\t200\t50\t20\t96.5\tNOMINA",
      "5\t1\t1\t1\t1\t2\t900\t200\t80\t20\t40\t",
    ].join("\n");
    expect(parseTsv(tsv)).toEqual([
      { text: "NOMINA", conf: 96.5, left: 0.1, top: 0.1, right: 0.15, bottom: 0.11, line: "1.1.1" },
    ]);
  });
});

// Um extrato sintético no layout do CaixaBankNow "digital": Concepto · Fecha · Importe · Saldo,
// colunas de número alinhadas à direita em 0,58 / 0,75 / 0,93 da largura.
const word = (text: string, left: number, right: number, y: number, line: string, conf = 92): OcrWord => ({
  text,
  conf,
  left,
  right,
  top: y - 0.008,
  bottom: y + 0.008,
  line,
});
type Line = [desc: string, date: string, amount: string, balance: string, descConf?: number];
const pass = (lines: Line[], numeric: boolean, resolution: number): OcrPass => ({
  page: 1,
  resolution,
  numeric,
  words: [
    word("Periodo:", 0.07, 0.17, 0.2, "h0"),
    word("01/10/2026-31/10/2026", 0.18, 0.42, 0.2, "h0"),
    word("Saldo", 0.5, 0.57, 0.2, "h0"),
    word("Concepto", 0.07, 0.18, 0.25, "h1"),
    word("Fecha", 0.52, 0.58, 0.25, "h1"),
    word("Importe", 0.67, 0.75, 0.25, "h1"),
    word("Saldo", 0.86, 0.93, 0.25, "h1"),
    ...lines.flatMap(([desc, date, amount, balance, descConf], i) => {
      const y = 0.3 + i * 0.04;
      const l = `r${i}`;
      return [
        ...(numeric || !desc ? [] : [word(desc, 0.07, 0.25, y, l, descConf)]),
        ...(date ? [word(date, 0.47, 0.58, y, l)] : []),
        ...(amount ? [word(amount, 0.69, 0.75, y, l)] : []),
        ...(balance ? [word(balance, 0.84, 0.93, y, l)] : []),
      ];
    }),
    word("1/1", 0.93, 0.95, 0.03, "pg"),
    word("€", 0.92, 0.93, 0.99, "eur"),
  ],
});

// A verdade (do mais novo ao mais antigo), a partir de saldo 0,00:
//   20/10 MERCADO      -30,00   → 470,00
//   19/10 TARJETA      -50,00   → 500,00
//   18/10 NOMINA       450,00   → 550,00   (o mais antigo é o de baixo)
//   15/10 CAJERO       -10,00   → 100,00
//   12/10 DEPOSITO     110,00   → 110,00
const truth: Line[] = [
  ["MERCADO", "20/10/2026", "-30.0", "470,00€"],
  ["TARJETA", "19/10/2026", "-50.0", "500,00€"],
  ["NOMINA", "18/10/2026", "450.0", "550,00€"],
  ["CAJERO", "15/10/2026", "-10.0", "100,00€"],
  ["DEPOSITO", "12/10/2026", "110.0", "110,00€"],
];
const withErrors = (edit: (l: Line[]) => void) => {
  const ls = truth.map((l) => [...l] as Line);
  edit(ls);
  return ls;
};

describe("extrato em imagem conferido pelo saldo", () => {
  it("leituras limpas: tudo confere, sem nada para revisar", () => {
    const r = readOcrLedger([pass(truth, false, 300), pass(truth, true, 300)])!;
    expect(r.bank).toBeNull();
    expect(r.currency).toBe("EUR");
    expect(r.rows.map((x) => [x.date.toISOString().slice(0, 10), x.baseAmount, x.description])).toEqual([
      ["2026-10-20", "-30.0000", "MERCADO"],
      ["2026-10-19", "-50.0000", "TARJETA"],
      ["2026-10-18", "450.0000", "NOMINA"],
      ["2026-10-15", "-10.0000", "CAJERO"],
      ["2026-10-12", "110.0000", "DEPOSITO"],
    ]);
    expect(r.rows.some((x) => x.needsReview)).toBe(false);
    expect(r.rowErrors).toEqual([]);
  });

  it("saldo errado em todas as leituras (500 lido como 300): os vizinhos dão o certo", () => {
    const bad = withErrors((l) => (l[1][3] = "300,00€"));
    const r = readOcrLedger([pass(bad, false, 300), pass(bad, true, 400)])!;
    expect(r.rows[1]).toMatchObject({ baseAmount: "-50.0000", balance: "500.00", needsReview: false });
  });

  it("dois saldos seguidos mal lidos (o 8 lido como 5): os valores atravessam até o próximo saldo certo", () => {
    const bad = withErrors((l) => {
      l[1][3] = "300,00€";
      l[2][3] = "770,00€";
    });
    const r = readOcrLedger([pass(bad, false, 300), pass(bad, true, 400)])!;
    expect(r.rows.map((x) => [x.baseAmount, x.balance])).toEqual([
      ["-30.0000", "470.00"],
      ["-50.0000", "500.00"],
      ["450.0000", "550.00"],
      ["-10.0000", "100.00"],
      ["110.0000", "110.00"],
    ]);
    expect(r.rowErrors).toEqual([]);
  });

  it("sinal que sumiu na leitura (50.0 no lugar de -50.0): vale o do saldo", () => {
    const bad = withErrors((l) => (l[1][2] = "50.0"));
    const r = readOcrLedger([pass(bad, false, 300), pass(bad, true, 300)])!;
    expect(r.rows[1].baseAmount).toBe("-50.0000");
  });

  it("valor mal lido entre dois saldos confirmados: entra a diferença dos saldos, marcada", () => {
    const bad = withErrors((l) => (l[1][2] = "-80.0"));
    const r = readOcrLedger([pass(bad, false, 300), pass(bad, true, 300)])!;
    expect(r.rows[1]).toMatchObject({ baseAmount: "-50.0000", needsReview: true });
    expect(r.rows[1].reviewReason).toMatch(/mal lido.*−80,00.*−50,00/);
    expect(r.rowErrors).toHaveLength(1);
  });

  it("linha que o OCR não leu (só um rabisco sem saldo): entra como ilegível com a diferença", () => {
    // Some a linha TARJETA (-50); no lugar, um borrão com texto mas sem número.
    const ls = withErrors((l) => (l[1] = ["Psoñ dal", "", "", "", 18]));
    const r = readOcrLedger([pass(ls, false, 300), pass(ls, true, 300)])!;
    const missing = r.rows.find((x) => x.description === "Linha ilegível no PDF");
    expect(missing).toMatchObject({ baseAmount: "-50.0000", needsReview: true });
    // o total continua batendo com o saldo final impresso (470,00 a partir de 0,00)
    const sum = r.rows.reduce((s, x) => s.plus(x.baseAmount), new Decimal(0));
    expect(sum.toFixed(2)).toBe("470.00");
    // e a linha de cima não absorveu o que falta
    expect(r.rows[0]).toMatchObject({ description: "MERCADO", baseAmount: "-30.0000" });
    expect(r.warnings.join(" ")).toMatch(/1 linha não deu para ler/);
  });

  it("descrição com palavra de baixa confiança vira 'Descrição ilegível no PDF'", () => {
    const ls = withErrors((l) => (l[2][4] = 20));
    const r = readOcrLedger([pass(ls, false, 300), pass(ls, true, 300)])!;
    expect(r.rows[2].description).toBe("Descrição ilegível no PDF");
    expect(r.rows[2].baseAmount).toBe("450.0000");
  });

  it("sem cabeçalho com data, valor e saldo: não é extrato que dê para conferir", () => {
    const p = pass(truth, false, 300);
    p.words = p.words.filter((w) => w.line !== "h1");
    expect(readOcrLedger([p])).toBeNull();
  });
});

const PDF = "CaixaBank_digital_CaixaBankNow_2026117.pdf";
const OCR_DIR = resolve(__dirname, "../fixtures/ocr");
// Uma leitura por versão do tesseract: a do Mac (5.5.3) e a da imagem do servidor (Alpine, 5.5.1),
// que erra outros dígitos ("265,658€", "665,65€") — o resultado tem de ser o mesmo.
const caches = existsSync(OCR_DIR) ? readdirSync(OCR_DIR).filter((f) => f.startsWith(PDF)) : [];

// As leituras do OCR do PDF real ficam em cache (fixtures/ocr, fora do git); refazer com
// `npx tsx scripts/ocr-cache.mts <arquivo>`. O e2e pela tela roda o OCR de verdade.
describe.skipIf(!caches.length)("CaixaBankNow digital (fixture real, leituras do OCR em cache)", () => {
  it.each(caches)("%s: 39 linhas pelo saldo corrido; só a linha cortada no pé da página fica para revisar", (file) => {
    const r = readOcrLedger(JSON.parse(readFileSync(resolve(OCR_DIR, file), "utf8")))!;
    expect(r.bank).toBe("CaixaBank");
    expect(r.currency).toBe("EUR");
    expect(r.rows).toHaveLength(39);
    // a corrente fecha de ponta a ponta: cada saldo = saldo de baixo + valor
    for (let i = 0; i < r.rows.length - 1; i++) {
      expect(new Decimal(r.rows[i + 1].balance!).plus(r.rows[i].baseAmount).toFixed(2)).toBe(r.rows[i].balance);
    }
    // soma = saldo final impresso − saldo antes da primeira linha
    const sum = r.rows.reduce((s, x) => s.plus(x.baseAmount), new Decimal(0));
    const last = r.rows[r.rows.length - 1];
    expect(sum.toFixed(2)).toBe(new Decimal(r.rows[0].balance!).minus(last.balance!).plus(last.baseAmount).toFixed(2));
    expect(r.rows.filter((x) => x.needsReview)).toHaveLength(1);
    expect(r.rowErrors).toHaveLength(1);
    // datas nunca sobem, de cima para baixo, e ficam no período impresso
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].date <= r.rows[i - 1].date).toBe(true);
  });
});
