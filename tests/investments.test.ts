import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapInvestment, mapInvestments } from "@/lib/pluggy/investments";
import { PluggyInvestment } from "@/lib/pluggy/schemas";
import { investmentClass, rateLabel, summarizePortfolio, type PositionInput } from "@/lib/investments/summary";

const inv = (over: Partial<PluggyInvestment>): PluggyInvestment => ({
  id: "i1",
  name: "CDB Banco X",
  type: "FIXED_INCOME",
  subtype: "CDB",
  currencyCode: "BRL",
  balance: 1050.37,
  amountOriginal: 1000,
  rate: 110,
  rateType: "CDI",
  fixedAnnualRate: null,
  dueDate: "2028-06-05T03:00:00.000Z",
  date: "2026-11-06T01:30:00.000Z",
  status: "ACTIVE",
  ...over,
});

describe("Pluggy → investimentos", () => {
  it("saldo e aplicado em Decimal, sem resíduo de float; datas no dia de Brasília", () => {
    const p = mapInvestment(inv({ balance: 0.1 + 0.2 }));
    expect(p.balance.toFixed(4)).toBe("0.3000");
    expect(p.amountOriginal?.toFixed(2)).toBe("1000.00");
    expect(p.dueDate?.toISOString()).toBe("2028-06-05T00:00:00.000Z");
    // 01:30 UTC ainda é o dia anterior em Brasília
    expect(p.valueDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(p.rate?.toString()).toBe("110");
  });

  it("ação sem aplicado nem vencimento; status vazio conta como ativo", () => {
    const p = mapInvestment(
      inv({
        type: "EQUITY",
        subtype: "STOCK",
        code: "ABCD3",
        amountOriginal: null,
        dueDate: null,
        rate: null,
        rateType: null,
        status: null,
      }),
    );
    expect(p).toMatchObject({ amountOriginal: null, dueDate: null, code: "ABCD3", status: "ACTIVE" });
  });

  it("sem nome (CDB resgatado do Nubank veio assim): usa o código, o emissor ou diz que faltou", () => {
    expect(mapInvestment(inv({ name: "", code: "CDB123" })).name).toBe("CDB123");
    expect(mapInvestment(inv({ name: " ", code: null, issuer: "Banco X" })).name).toBe("Banco X");
    expect(mapInvestment(inv({ name: "", code: null, issuer: null })).name).toBe("Investimento sem nome no banco");
  });

  it("moeda que o app não tem: erro com o nome, sem derrubar as outras", () => {
    const r = mapInvestments([inv({ id: "a", name: "Fundo no Japão", currencyCode: "JPY" }), inv({ id: "b" })]);
    expect(r.positions.map((p) => p.externalId)).toEqual(["b"]);
    expect(r.errors).toEqual(["Fundo no Japão: moeda não suportada (JPY)"]);
  });
});

describe("taxa contratada em texto", () => {
  const r = (rate: string | null, rateType: string | null, fixedAnnualRate: string | null) =>
    rateLabel({ rate, rateType, fixedAnnualRate });
  it.each([
    [r("100", "CDI", null), "100% do CDI"],
    [r("110.5", "CDI", "0"), "110,5% do CDI"],
    [r("100", "CDI", "0.5"), "100% do CDI + 0,5% a.a."],
    [r("100", "IPCA", "6.25"), "IPCA + 6,25% a.a."],
    [r("100", "SELIC", null), "100% do Selic"],
    [r(null, null, "12.04"), "12,04% a.a."],
    [r(null, null, null), null],
  ])("%s", (got, want) => expect(got).toBe(want));
});

describe("carteira", () => {
  const pos = (
    id: string,
    type: string,
    subtype: string | null,
    brl: string,
    original: string | null,
  ): PositionInput => ({
    id,
    type,
    subtype,
    currency: "BRL",
    balance: brl,
    balanceBRL: brl,
    // 1 BRL = 0,16 EUR, exato
    balanceEUR: (Number(brl) * 0.16).toFixed(4),
    balanceUSD: "0",
    amountOriginal: original,
  });
  const ps = [
    pos("cdb", "FIXED_INCOME", "CDB", "1100.00", "1000.00"),
    pos("lci", "FIXED_INCOME", "LCI", "500.00", "500.00"),
    pos("td", "FIXED_INCOME", "TREASURY", "2200.00", "2000.00"),
    pos("acao", "EQUITY", "STOCK", "1200.00", null),
  ];

  it("agrupa por classe, maior primeiro, com participação; rendimento só onde há o aplicado", () => {
    const s = summarizePortfolio(ps, "BRL");
    expect(s.total).toBe("5000.00");
    expect(s.classes.map((c) => [c.label, c.total, c.share])).toEqual([
      ["Tesouro Direto", "2200.00", "44"],
      ["Renda fixa", "1600.00", "32"],
      ["Ações", "1200.00", "24"],
    ]);
    expect(s.classes[1].positions.map((p) => p.id)).toEqual(["cdb", "lci"]);
    // a ação não entra no rendimento: o banco não informa quanto foi aplicado
    expect(s.tracked).toEqual({ invested: "3500.00", value: "3800.00", gain: "300.00", gainPct: "8.6" });
  });

  it("na lente em euro, o aplicado vai pela mesma taxa do saldo", () => {
    const s = summarizePortfolio(ps, "EUR");
    expect(s.total).toBe("800.00");
    expect(s.tracked).toEqual({ invested: "560.00", value: "608.00", gain: "48.00", gainPct: "8.6" });
  });

  it("sem nenhum aplicado informado: sem rendimento (não inventa zero)", () => {
    expect(summarizePortfolio([ps[3]], "BRL").tracked).toBeNull();
  });

  it("classes", () => {
    expect(investmentClass("EQUITY", "REAL_ESTATE_FUND")).toBe("realEstate");
    expect(investmentClass("MUTUAL_FUND", "ETF_FUND")).toBe("etf");
    expect(investmentClass("SECURITY", "VGBL")).toBe("pension");
    expect(investmentClass("FIXED_INCOME", null)).toBe("fixed");
  });
});

const DIR = resolve(__dirname, "../fixtures/pluggy");
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith("-investments.json")) : [];

describe.skipIf(!files.length)("investimentos (fixture real)", () => {
  it.each(files)("%s: todos lidos, resgatado com saldo zero, aberto com saldo", (file) => {
    const raw = JSON.parse(readFileSync(resolve(DIR, file), "utf8"));
    const invs = PluggyInvestment.array().parse(raw.investments);
    const { positions, errors } = mapInvestments(invs);
    expect(errors).toEqual([]);
    expect(positions).toHaveLength(invs.length);
    expect(new Set(positions.map((p) => p.externalId)).size).toBe(positions.length);
    for (const p of positions) {
      if (p.status === "TOTAL_WITHDRAWAL") expect(p.balance.isZero()).toBe(true);
      if (p.status === "ACTIVE") expect(p.balance.isPositive() && !p.balance.isZero()).toBe(true);
      // renda fixa com taxa vira texto legível; nada de "null% do CDI"
      const label = rateLabel({
        rate: p.rate?.toString() ?? null,
        rateType: p.rateType,
        fixedAnnualRate: p.fixedAnnualRate?.toString() ?? null,
      });
      if (label) expect(label).not.toMatch(/null|undefined|NaN/);
      if (p.type === "FIXED_INCOME" && p.status === "ACTIVE") expect(label).not.toBeNull();
    }
  });
});
