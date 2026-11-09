import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accountLabel, brazilDay, mapAccountTransactions } from "@/lib/pluggy/map";
import { PluggyAccount, PluggyTransaction } from "@/lib/pluggy/schemas";
import { parseTabular } from "@/lib/tabular/pipeline";
import { Decimal } from "@/lib/money";

const FROM_ALL = new Date(Date.UTC(2000, 0, 1));
const checking = { id: "acc-1", type: "BANK", subtype: "CHECKING_ACCOUNT", currencyCode: "BRL" };
const card = { id: "acc-2", type: "CREDIT", subtype: "CREDIT_CARD", currencyCode: "BRL" };
const tx = (over: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: "t1",
  date: "2026-10-08T15:00:00.000Z",
  description: "Pix enviado",
  amount: -29.21,
  currencyCode: "BRL",
  status: "POSTED",
  type: "DEBIT",
  ...over,
});

describe("Pluggy → linhas da importação", () => {
  it("conta corrente: valor e sinal como vieram; id da Pluggy identifica a linha", () => {
    const m = mapAccountTransactions(
      checking,
      [tx({}), tx({ id: "t2", amount: 1500, type: "CREDIT", description: "Salário" })],
      {
        from: FROM_ALL,
      },
    );
    expect(m.errors).toEqual([]);
    expect(m.rows.map((r) => [r.baseAmount, r.baseCurrency, r.type, r.sourceRowRaw])).toEqual([
      ["-29.2100", "BRL", "EXPENSE", "PLUGGY t1"],
      ["1500.0000", "BRL", "INCOME", "PLUGGY t2"],
    ]);
    expect(m.rows.every((r) => !r.isInternalTransfer)).toBe(true);
  });

  it("cartão: compra positiva vira gasto, pagamento da fatura vira entrada", () => {
    const m = mapAccountTransactions(
      card,
      [
        tx({ amount: 89.9, type: "DEBIT" }),
        tx({ id: "t2", amount: -500, type: "CREDIT", description: "Pagamento recebido" }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => [r.baseAmount, r.type])).toEqual([
      ["-89.9000", "EXPENSE"],
      ["500.0000", "INCOME"],
    ]);
  });

  it("cartão: mês da fatura e parcela vêm da Pluggy", () => {
    const m = mapAccountTransactions(
      card,
      [
        tx({
          amount: 120,
          creditCardMetadata: { billForecastDate: "2026-12", installmentNumber: 3, totalInstallments: 10 },
        }),
        tx({ id: "t2", amount: 55.9, creditCardMetadata: { billForecastDate: "2026-12-15", totalInstallments: 1 } }),
        tx({ id: "t3", amount: 10, creditCardMetadata: { billForecastDate: "dezembro" } }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => [r.cardBill, r.installment])).toEqual([
      ["2026-12", "3/10"],
      ["2026-12", null],
      [null, null],
    ]);
  });

  it("pagamento de fatura é interna nos dois lados (senão a fatura conta duas vezes)", () => {
    const onCard = mapAccountTransactions(
      card,
      [
        tx({ amount: -500, type: "CREDIT", description: "Pagamento recebido", operationType: "PAGAMENTO_FATURA" }),
        tx({ id: "t2", amount: 89.9 }),
      ],
      { from: FROM_ALL },
    );
    expect(onCard.rows.map((r) => r.isInternalTransfer)).toEqual([true, false]);

    const onChecking = mapAccountTransactions(
      checking,
      [
        tx({ amount: -500, description: "Pagamento de fatura" }),
        tx({ id: "t2", amount: -80, description: "Pagamento da fatura de luz", category: "Credit card payment" }),
        tx({ id: "t3", amount: -80, description: "Pagamento da fatura de luz" }),
        tx({ id: "t4", amount: 500, description: "Estorno pagamento de fatura" }),
      ],
      { from: FROM_ALL },
    );
    expect(onChecking.rows.map((r) => r.isInternalTransfer)).toEqual([true, true, false, false]);
    // Conta corrente nunca é cartão; quem diz de qual conta veio é a sincronização.
    expect(onChecking.rows.every((r) => !r.cardBill)).toBe(true);
  });

  it("Pix para si mesmo, aplicação e resgate são movimentação; rendimento e Pix a terceiros, não", () => {
    const m = mapAccountTransactions(
      checking,
      [
        tx({ id: "a", amount: -2000, description: "Transferência enviada pelo Pix", category: "Same person transfer" }),
        tx({ id: "b", amount: -4999.6, description: "Aplicação em Tesouro Direto", category: "Fixed income" }),
        tx({ id: "c", amount: 5010, description: "Resgate RDB", operationType: "RESGATE_APLIC_FINANCEIRA" }),
        tx({ id: "d", amount: -284.95, description: "Compra de Renda Variável", category: "Variable income" }),
        tx({
          id: "e",
          amount: 0.07,
          description: "Valor recebido de Investimentos",
          category: "Proceeds interests and dividends",
        }),
        tx({ id: "f", amount: -150, description: "Pix para o encanador", category: "Third party transfers" }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => r.isInternalTransfer)).toEqual([true, true, true, true, false, false]);
  });

  it("Inter: ida e volta da Global Account (conta em dólar) são movimentação; o IOF é gasto", () => {
    const m = mapAccountTransactions(
      checking,
      [
        tx({ id: "a", amount: -3816.42, description: "Depósito - Global Account", category: "Transfer - Cash" }),
        tx({ id: "b", amount: 721, description: "Resgate - Global Account", category: "Investments" }),
        tx({ id: "c", amount: -133.58, description: "IOF - Global Account", category: "Tax on financial operations" }),
        // outro depósito qualquer continua como veio
        tx({ id: "d", amount: -50, description: "Depósito em conta de terceiro", category: "Transfer - Cash" }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => r.isInternalTransfer)).toEqual([true, true, false, false]);
  });

  it("compra em dólar no cartão entra pelo valor cobrado em reais", () => {
    const m = mapAccountTransactions(card, [tx({ amount: 10, currencyCode: "USD", amountInAccountCurrency: 55.37 })], {
      from: FROM_ALL,
    });
    expect(m.rows.map((r) => [r.baseAmount, r.baseCurrency])).toEqual([["-55.3700", "BRL"]]);
  });

  it("número JSON vira Decimal sem resíduo de float", () => {
    const m = mapAccountTransactions(checking, [tx({ amount: 0.1 + 0.2 })], { from: FROM_ALL });
    expect(m.rows[0].baseAmount).toBe("0.3000");
  });

  it("dia é o de Brasília: 01:58 UTC ainda é o dia anterior", () => {
    expect(brazilDay("2026-10-09T01:58:00.000Z").toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(brazilDay("2026-10-09T03:00:00.000Z").toISOString().slice(0, 10)).toBe("2026-10-09");
  });

  it("só entra a partir de `from`, mas `earliest` mostra a janela que a Pluggy cobre", () => {
    const m = mapAccountTransactions(
      checking,
      [tx({ id: "old", date: "2026-09-01T15:00:00Z" }), tx({ id: "new", date: "2026-10-10T15:00:00Z" })],
      { from: new Date(Date.UTC(2026, 9, 1)) },
    );
    expect(m.rows.map((r) => r.sourceRowRaw)).toEqual(["PLUGGY new"]);
    expect(m.earliest?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("pendente fica pendente; moeda desconhecida sem valor convertido é erro visível", () => {
    const m = mapAccountTransactions(
      card,
      [
        tx({ status: "PENDING", amount: 12 }),
        tx({ id: "x", currencyCode: "GBP", amount: 5, amountInAccountCurrency: null }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => r.state)).toEqual(["PENDING"]);
    expect(m.errors[0].message).toMatch(/Moeda não suportada/);
  });

  it("conta em moeda que o app não tem: falha a conta inteira, sem adivinhar", () => {
    expect(() => mapAccountTransactions({ ...checking, currencyCode: "GBP" }, [], { from: FROM_ALL })).toThrow(
      /Moeda da conta/,
    );
  });

  it("nomeia a conta", () => {
    expect(accountLabel(card)).toBe("Cartão de crédito");
    expect(accountLabel(checking)).toBe("Conta corrente");
  });
});

// Respostas reais (fora do git), gravadas por `scripts/pluggy-probe.ts --save`.
const FIX = resolve(__dirname, "../fixtures");
const PLUGGY_DIR = resolve(FIX, "pluggy");
const realFiles = existsSync(PLUGGY_DIR)
  ? readdirSync(PLUGGY_DIR).filter((f) => f.endsWith(".json") && !f.endsWith("-investments.json"))
  : [];
const load = (file: string) => {
  const raw = JSON.parse(readFileSync(resolve(PLUGGY_DIR, file), "utf8"));
  return { account: PluggyAccount.parse(raw.account), transactions: PluggyTransaction.array().parse(raw.transactions) };
};

describe.skipIf(!realFiles.length)("Pluggy (fixture real)", () => {
  it.each(realFiles)("%s: toda transação vira linha, ids únicos, sinal de gasto/entrada coerente", (file) => {
    const { account, transactions } = load(file);
    const m = mapAccountTransactions(account, transactions, { from: FROM_ALL });
    expect(m.errors).toEqual([]);
    expect(m.rows).toHaveLength(transactions.length);
    expect(new Set(m.rows.map((r) => r.sourceRowRaw)).size).toBe(m.rows.length);
    // DEBIT é sempre saída de dinheiro para o usuário, na conta ou no cartão
    transactions.forEach((t, i) => {
      if (t.type === "DEBIT") expect(m.rows[i].type).toBe("EXPENSE");
      if (t.type === "CREDIT") expect(m.rows[i].type).toBe("INCOME");
    });
  });

  it("Inter: compra de ações na B3 que a Pluggy põe junto dos proventos é movimentação; provento é entrada", () => {
    const P = "Proceeds interests and dividends";
    const m = mapAccountTransactions(
      checking,
      [
        tx({ id: "a", amount: -456.4, description: "Débito B3 - * Prov * Regularização Compra  Itub", category: P }),
        tx({ id: "b", amount: 120, description: "Crédito B3 - * Prov * Liquidação Venda Bbas", category: P }),
        tx({
          id: "c",
          amount: 0.89,
          description: "Credito B3 Btb - * Prov * Reembolso Dividendo - Aluguel",
          category: P,
        }),
        tx({ id: "d", amount: 5.85, description: "Crédito Evento B3 - * Prov * Rendimento 5", category: P }),
        tx({ id: "e", amount: 0.15, description: "Credito B3 Btb - * Prov * Reembolso Jcp - Aluguel", category: P }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => [r.isInternalTransfer, r.type])).toEqual([
      [true, "EXPENSE"],
      [true, "INCOME"],
      [false, "INCOME"],
      [false, "INCOME"],
      [false, "INCOME"],
    ]);
  });

  it("proventos no extrato real do Inter: só a liquidação de compra/venda vira movimentação", () => {
    const seen = { trade: 0, proceeds: 0 };
    for (const file of realFiles) {
      const { account, transactions } = load(file);
      const m = mapAccountTransactions(account, transactions, { from: FROM_ALL });
      transactions.forEach((t, i) => {
        if (t.category !== "Proceeds interests and dividends") return;
        const trade = /\b(compra|venda)\b/i.test(t.description);
        if (trade) seen.trade++;
        else seen.proceeds++;
        expect(m.rows[i].isInternalTransfer).toBe(trade);
      });
    }
    // conta só se o extrato do Inter estiver entre as fixtures
    if (seen.trade) expect(seen.proceeds).toBeGreaterThan(0);
  });

  it("Global Account no extrato real do Inter: todo depósito e resgate é movimentação, nenhum IOF", () => {
    const seen = { move: 0, iof: 0 };
    for (const file of realFiles) {
      const { account, transactions } = load(file);
      const m = mapAccountTransactions(account, transactions, { from: FROM_ALL });
      transactions.forEach((t, i) => {
        if (/^(Depósito|Resgate) - Global Account$/.test(t.description)) {
          seen.move++;
          expect(m.rows[i].isInternalTransfer).toBe(true);
        }
        if (t.description === "IOF - Global Account") {
          seen.iof++;
          expect(m.rows[i].isInternalTransfer).toBe(false);
        }
      });
    }
    // conta só se o extrato do Inter estiver entre as fixtures
    if (seen.move) expect(seen.iof).toBeGreaterThan(0);
  });

  // O mesmo mês pelo CSV do Nubank (lido sem IA) e pela Pluggy: mesmos dias e valores.
  const csvPath = resolve(FIX, "NU_857376284_01OUT2026_31OUT2026.csv");
  const nubankChecking = realFiles.find((f) => {
    const { account } = load(f);
    return account.type === "BANK" && /nu pagamentos/i.test(account.marketingName ?? "");
  });
  it.skipIf(!existsSync(csvPath) || !nubankChecking)("Nubank conta, outubro: Pluggy = CSV (dia a dia)", () => {
    const csv = parseTabular(readFileSync(csvPath, "utf8")).applied.rows;
    const { account, transactions } = load(nubankChecking!);
    const oct = mapAccountTransactions(account, transactions, { from: new Date(Date.UTC(2026, 9, 1)) }).rows.filter(
      (r) => r.date < new Date(Date.UTC(2026, 10, 1)),
    );
    const byDay = (rows: { date: Date; baseAmount: string }[]) => {
      const m = new Map<string, Decimal>();
      for (const r of rows) {
        const k = r.date.toISOString().slice(0, 10);
        m.set(k, (m.get(k) ?? new Decimal(0)).plus(r.baseAmount));
      }
      return Object.fromEntries([...m].sort().map(([k, v]) => [k, v.toFixed(2)]));
    };
    // Não o número de linhas: o Open Finance detalha mais (um "Crédito em conta" do CSV
    // chega como dois "Valor recebido de…"), com outras descrições — por isso a
    // sincronização começa depois do último extrato importado por arquivo.
    expect(byDay(oct)).toEqual(byDay(csv));
    expect(oct.length).toBeGreaterThanOrEqual(csv.length);
  });
});
