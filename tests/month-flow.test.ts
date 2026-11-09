import { describe, it, expect } from "vitest";
import { monthFlow } from "@/lib/transactions/aggregate";
import { Decimal } from "@/lib/money";

const tx = (brl: string, cat: string, over: Partial<{ type: string; isInternalTransfer: boolean }> = {}) => ({
  amountBRL: brl,
  amountEUR: "0",
  amountUSD: "0",
  type: brl.startsWith("-") ? "EXPENSE" : "INCOME",
  isInternalTransfer: false,
  cat,
  ...over,
});
const byCat = (t: { cat: string }) => ({ key: t.cat, label: t.cat });
const total = (ns: { value: string }[]) => ns.reduce((s, n) => s.plus(n.value), new Decimal(0)).toFixed(2);

describe("fluxo do mês", () => {
  it("sobra: entradas à esquerda; gastos e 'Sobrou' à direita; os dois lados fecham no centavo", () => {
    const f = monthFlow(
      [
        tx("3000.10", "Salário"),
        tx("200.20", "Reembolso"),
        tx("-1000.00", "Moradia"),
        tx("-0.10", "Mercado"),
        tx("-0.20", "Mercado"),
        tx("-5000.00", "Aplicação", { isInternalTransfer: true }), // movimentação: fora
        tx("900.00", "Resgate", { isInternalTransfer: true }),
      ],
      "BRL",
      byCat,
    )!;
    expect(f).toMatchObject({ income: "3200.30", expense: "1000.30", total: "3200.30" });
    expect(f.sources.map((n) => [n.label, n.value, n.kind])).toEqual([
      ["Salário", "3000.10", "income"],
      ["Reembolso", "200.20", "income"],
    ]);
    expect(f.targets.map((n) => [n.label, n.value, n.kind])).toEqual([
      ["Moradia", "1000.00", "expense"],
      ["Mercado", "0.30", "expense"],
      ["Sobrou", "2200.00", "saved"],
    ]);
    expect(total(f.sources)).toBe(f.total);
    expect(total(f.targets)).toBe(f.total);
    expect(f.targets[2].share).toBe("0.6874");
  });

  it("gasto maior que a entrada: a diferença entra à esquerda como 'Das reservas', sem 'Sobrou'", () => {
    const f = monthFlow([tx("100.00", "Salário"), tx("-250.00", "Viagem")], "BRL", byCat)!;
    expect(f.total).toBe("250.00");
    expect(f.sources.map((n) => [n.label, n.value, n.kind])).toEqual([
      ["Salário", "100.00", "income"],
      ["Das reservas", "150.00", "deficit"],
    ]);
    expect(f.targets.map((n) => n.kind)).toEqual(["expense"]);
  });

  it("além das maiores, o resto vira uma linha só, com a contagem", () => {
    const f = monthFlow(
      [tx("1000", "Salário"), ...["A", "B", "C", "D"].map((c, i) => tx(`-${40 - i * 10}`, c)), tx("-1", "D")],
      "BRL",
      byCat,
      { maxTargets: 2 },
    )!;
    expect(f.targets.map((n) => [n.label, n.value, n.count])).toEqual([
      ["A", "40.00", 1],
      ["B", "30.00", 1],
      ["Outros gastos", "31.00", 3],
      ["Sobrou", "899.00", 0],
    ]);
  });

  it("resto de uma categoria só: aparece ela mesma, não 'Outros'", () => {
    const f = monthFlow([tx("-3", "A"), tx("-2", "B"), tx("-1", "C")], "BRL", byCat, { maxTargets: 2 })!;
    expect(f.targets.map((n) => n.label)).toEqual(["A", "B", "C"]);
  });

  it("mês sem entradas nem gastos (só movimentações): nada para desenhar", () => {
    expect(monthFlow([tx("-50", "Aplicação", { isInternalTransfer: true })], "BRL", byCat)).toBeNull();
    expect(monthFlow([], "BRL", byCat)).toBeNull();
  });
});
