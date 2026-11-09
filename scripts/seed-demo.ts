/**
 * Usuário demo com dados SINTÉTICOS, para screenshots e testes de UI sem tocar
 * em dados reais. Idempotente: apaga e recria o usuário demo.
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 *
 * (as variáveis ficam no .env.local, que não vai para o git)
 */
import { PrismaClient, TxType, TxState, MemberKind, Currency } from "@prisma/client";
import bcrypt from "bcryptjs";
import Decimal from "decimal.js";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
} from "../src/lib/categories/defaults";

const prisma = new PrismaClient();
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error("Defina DEMO_EMAIL e DEMO_PASSWORD no .env.local");

// Câmbio fixo e fictício (só para os dados demo): 1 EUR = 1.10 USD = 6.20 BRL.
const PER_EUR: Record<Currency, Decimal> = { EUR: new Decimal(1), USD: new Decimal("1.10"), BRL: new Decimal("6.20") };
function convert(amount: string, from: Currency) {
  const eur = new Decimal(amount).div(PER_EUR[from]);
  const to = (c: Currency) => eur.times(PER_EUR[c]).toDecimalPlaces(4).toFixed(4);
  return { amountEUR: to("EUR"), amountUSD: to("USD"), amountBRL: to("BRL") };
}

// PRNG determinístico, para o demo sair sempre igual.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => new Decimal(a + rnd() * (b - a)).toDecimalPlaces(2);

async function main() {
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: { email: email!, name: "Conta Demo", passwordHash: await bcrypt.hash(password!, 12) },
  });

  await prisma.category.createMany({
    data: [
      ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ userId: user.id, ...c, kind: "EXPENSE" as const, isDefault: true })),
      ...DEFAULT_INCOME_CATEGORIES.map((c) => ({ userId: user.id, ...c, kind: "INCOME" as const, isDefault: true })),
      ...DEFAULT_TRANSFER_CATEGORIES.map((c) => ({
        userId: user.id,
        ...c,
        kind: "TRANSFER" as const,
        isDefault: true,
      })),
    ],
  });
  const cats = Object.fromEntries(
    (await prisma.category.findMany({ where: { userId: user.id } })).map((c) => [c.name, c.id]),
  );

  const [alex, sam, casa] = await Promise.all([
    prisma.member.create({ data: { userId: user.id, name: "Alex", kind: MemberKind.ME, color: "#2563eb" } }),
    prisma.member.create({ data: { userId: user.id, name: "Sam", kind: MemberKind.SPOUSE, color: "#db2777" } }),
    prisma.member.create({ data: { userId: user.id, name: "Casa", kind: MemberKind.OTHER, color: "#64748b" } }),
  ]);

  type Row = {
    day: Date;
    desc: string;
    cat?: string;
    member: string;
    type: TxType;
    cur: Currency;
    amount: string;
    bank: string;
    internal?: boolean;
    pending?: boolean;
    /** Conta do banco conectado; "Cartão de crédito" agrupa as compras na lista. */
    account?: string;
    cardBill?: string;
    installment?: string;
  };
  const rows: Row[] = [];
  const now = new Date(Date.UTC(2026, 10, 4));

  for (let back = 5; back >= 0; back--) {
    const y = now.getUTCFullYear(),
      m = now.getUTCMonth() - back;
    const last = back === 0 ? now.getUTCDate() : new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = (day: number) => new Date(Date.UTC(y, m, Math.min(day, last)));
    const exp = (
      day: number,
      desc: string,
      cat: string,
      member: string,
      cur: Currency,
      amt: Decimal,
      bank: string,
      pending = false,
    ) =>
      day <= last &&
      rows.push({
        day: d(day),
        desc,
        cat,
        member,
        type: TxType.EXPENSE,
        cur,
        amount: amt.neg().toFixed(2),
        bank,
        pending,
      });

    if (last >= 1) {
      rows.push({
        day: d(1),
        desc: "Salário Lumen Labs",
        cat: "Salário",
        member: alex.id,
        type: TxType.INCOME,
        cur: "EUR",
        amount: "4200.00",
        bank: "Revolut",
      });
      rows.push({
        day: d(1),
        desc: "Salário Studio Norte",
        cat: "Salário",
        member: sam.id,
        type: TxType.INCOME,
        cur: "EUR",
        amount: "2850.00",
        bank: "Wise",
      });
    }
    exp(2, "Aluguel apartamento", "Moradia", casa.id, "EUR", new Decimal(1150), "Revolut");
    exp(5, "Iberdrola luz", "Contas & Serviços", casa.id, "EUR", between(58, 96), "Revolut");
    exp(6, "Digi fibra + móvel", "Contas & Serviços", casa.id, "EUR", new Decimal("40.00"), "Revolut");
    exp(8, "Netflix", "Assinaturas", alex.id, "USD", new Decimal("15.49"), "Wise");
    exp(8, "Spotify Duo", "Assinaturas", sam.id, "EUR", new Decimal("14.99"), "Revolut");
    exp(11, "iCloud+", "Assinaturas", alex.id, "USD", new Decimal("2.99"), "Wise");
    exp(14, "Academia Altafit", "Saúde", sam.id, "EUR", new Decimal("34.90"), "Revolut");
    for (const day of [3, 7, 10, 13, 17, 20, 24, 27, 30])
      exp(
        day,
        pick(["Mercadona", "Lidl", "Carrefour Express", "Bonpreu"]),
        "Mercado",
        pick([alex.id, sam.id]),
        "EUR",
        between(18, 112),
        pick(["Revolut", "Wise"]),
      );
    for (const day of [4, 9, 15, 19, 23, 28])
      exp(
        day,
        pick(["Bar Celta", "La Pepita", "Honest Greens", "Café Federal", "Ramen-ya Hiro"]),
        "Restaurantes",
        pick([alex.id, sam.id]),
        "EUR",
        between(14, 78),
        "Revolut",
      );
    for (const day of [6, 12, 18, 25])
      exp(
        day,
        pick(["TMB metrô T-Casual", "Cabify", "Bicing"]),
        "Transporte",
        pick([alex.id, sam.id]),
        "EUR",
        between(6, 24),
        "Revolut",
      );
    exp(16, pick(["Zara", "Decathlon", "IKEA"]), "Compras", pick([alex.id, sam.id]), "EUR", between(29, 140), "Wise");
    exp(
      21,
      pick(["Cinema Verdi", "Palau de la Música", "Steam"]),
      "Lazer",
      pick([alex.id, sam.id]),
      "EUR",
      between(12, 60),
      "Revolut",
    );
    exp(22, "Farmácia Drogasil", "Saúde", alex.id, "BRL", between(40, 160), "Nubank");
    exp(26, "Presente aniversário mãe", "Compras", alex.id, "BRL", between(120, 380), "Nubank");
    if (back === 2) exp(12, "Voo Iberia BCN–LIS", "Viagem", casa.id, "EUR", new Decimal("286.40"), "Wise");
    if (back === 2) exp(18, "Airbnb Lisboa", "Viagem", casa.id, "EUR", new Decimal("412.00"), "Wise");
    if (back === 4)
      rows.push({
        day: d(20),
        desc: "Projeto freelance landing page",
        cat: "Freelance",
        member: alex.id,
        type: TxType.INCOME,
        cur: "USD",
        amount: "1200.00",
        bank: "Wise",
      });
    if (last >= 10)
      rows.push({
        day: d(10),
        desc: "Wise → Revolut",
        cat: "Entre minhas contas",
        member: alex.id,
        type: TxType.TRANSFER,
        cur: "EUR",
        amount: "-500.00",
        bank: "Wise",
        internal: true,
      });
    if (back === 0) exp(3, "Mercadona", "Mercado", sam.id, "EUR", new Decimal("63.18"), "Revolut", true);

    // Cartão de crédito Nubank: compras com a fatura do mês seguinte, uma parcelada, e o
    // pagamento da fatura anterior (interno nos dois lados, como a sincronização marca).
    const bill = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 7);
    const card = (day: number, desc: string, cat: string, member: string, amt: Decimal, installment?: string) =>
      day <= last &&
      rows.push({
        day: d(day),
        desc,
        cat,
        member,
        type: TxType.EXPENSE,
        cur: "BRL",
        amount: amt.neg().toFixed(2),
        bank: "Nubank",
        account: "Cartão de crédito",
        cardBill: bill,
        installment,
      });
    card(2, "iFood", "Restaurantes", pick([alex.id, sam.id]), between(45, 120));
    card(9, "Uber", "Transporte", pick([alex.id, sam.id]), between(18, 60));
    card(13, "Amazon BR · Air fryer", "Compras", casa.id, new Decimal("119.90"), `${6 - back}/10`);
    card(19, "Netflix", "Assinaturas", alex.id, new Decimal("55.90"));
    card(24, "Pão de Açúcar", "Mercado", sam.id, between(80, 260));
    if (last >= 15) {
      const paid = "640.00";
      rows.push({
        day: d(15),
        desc: "Pagamento de fatura",
        cat: "Pagamento de cartão",
        member: alex.id,
        type: TxType.EXPENSE,
        cur: "BRL",
        amount: `-${paid}`,
        bank: "Nubank",
        account: "Conta corrente",
        internal: true,
      });
      rows.push({
        day: d(15),
        desc: "Pagamento recebido",
        cat: "Pagamento de cartão",
        member: alex.id,
        type: TxType.INCOME,
        cur: "BRL",
        amount: paid,
        bank: "Nubank",
        account: "Cartão de crédito",
        internal: true,
        cardBill: bill,
      });
    }
    // Movimentação: aplicação em investimento, fora de Gastos e Entradas.
    if (last >= 20)
      rows.push({
        day: d(20),
        desc: "Aplicação RDB",
        cat: "Aplicações e resgates",
        member: alex.id,
        type: TxType.EXPENSE,
        cur: "BRL",
        amount: "-500.00",
        bank: "Nubank",
        account: "Conta corrente",
        internal: true,
      });
  }

  await prisma.transaction.createMany({
    data: rows.map((r, i) => ({
      userId: user.id,
      bank: r.bank,
      memberId: r.member,
      categoryId: r.cat ? cats[r.cat] : null,
      date: r.day,
      description: r.desc,
      merchantRaw: r.desc.toUpperCase(),
      type: r.type,
      state: r.pending ? TxState.PENDING : TxState.COMPLETED,
      isInternalTransfer: !!r.internal,
      baseCurrency: r.cur,
      baseAmount: r.amount,
      ...convert(r.amount, r.cur),
      fxRateDate: r.day,
      fxSource: "demo",
      dedupeHash: `demo-${i}`,
      account: r.account ?? null,
      isCard: r.account === "Cartão de crédito",
      cardBill: r.cardBill ?? null,
      installment: r.installment ?? null,
    })),
  });

  // Uma importação aguardando revisão (tela /review/[id]): sem arquivo bruto, linhas sintéticas
  // com confiança variada, sugestão de categoria, sem categoria e uma transferência interna.
  const upload = await prisma.upload.create({
    data: {
      userId: user.id,
      filename: "extrato-demo-novembro.csv",
      mime: "text/csv",
      sizeBytes: 2048,
      status: "STAGED",
      detectedFormat: "tabular",
      bank: "Revolut",
    },
  });
  type Staged = {
    day: number;
    desc: string;
    cat?: string;
    amount: string;
    conf: number;
    review?: string;
    type?: TxType;
    internal?: boolean;
    member?: string;
  };
  const staged: Staged[] = [
    { day: 3, desc: "Mercadona", cat: "Mercado", amount: "-48.12", conf: 0.97 },
    { day: 3, desc: "Bar Celta", cat: "Restaurantes", amount: "-32.50", conf: 0.92 },
    { day: 4, desc: "TMB metrô T-Casual", cat: "Transporte", amount: "-12.15", conf: 0.95 },
    {
      day: 4,
      desc: "Amazon EU SARL",
      cat: "Compras",
      amount: "-27.99",
      conf: 0.71,
      review: "Loja com vários tipos de compra",
    },
    {
      day: 5,
      desc: "Farmacia Lda. Pl. Catalunya",
      cat: "Saúde",
      amount: "-14.80",
      conf: 0.66,
      review: "Primeira vez neste estabelecimento",
    },
    { day: 5, desc: "BIZUM ENVIADO M. GARCIA", amount: "-25.00", conf: 0.41, review: "Não deu para saber a categoria" },
    { day: 6, desc: "Wise → Revolut", amount: "300.00", conf: 0.9, type: TxType.TRANSFER, internal: true },
    { day: 6, desc: "Glovo", cat: "Restaurantes", amount: "-21.40", conf: 0.88 },
    { day: 7, desc: "Decathlon", cat: "Compras", amount: "-54.99", conf: 0.83 },
    {
      day: 7,
      desc: "Reembolso Iberdrola",
      cat: "Reembolso",
      amount: "18.30",
      conf: 0.58,
      review: "Entrada com descrição de gasto",
      type: TxType.INCOME,
    },
    { day: 8, desc: "Cabify", cat: "Transporte", amount: "-16.70", conf: 0.94 },
    { day: 8, desc: "PAYPAL *STEAMGAMES", cat: "Lazer", amount: "-9.99", conf: 0.62, review: "Pagamento via PayPal" },
  ];
  await prisma.stagedTransaction.createMany({
    data: staged.map((r, i) => ({
      uploadId: upload.id,
      bank: "Revolut",
      memberId: alex.id,
      categoryId: r.cat ? cats[r.cat] : null,
      date: new Date(Date.UTC(2026, 10, r.day)),
      description: r.desc,
      merchantRaw: r.desc.toUpperCase(),
      type: r.type ?? (r.amount.startsWith("-") ? TxType.EXPENSE : TxType.INCOME),
      baseCurrency: "EUR",
      baseAmount: r.amount,
      isInternalTransfer: !!r.internal,
      confidence: r.conf,
      needsReview: !!r.review,
      reviewReason: r.review ?? null,
      dedupeHash: `demo-staged-${i}`,
    })),
  });

  console.log(
    `demo pronto: ${rows.length} transações + 1 importação com ${staged.length} linhas para revisar (${email})`,
  );
}

main().finally(() => prisma.$disconnect());
