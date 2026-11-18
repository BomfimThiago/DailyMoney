// Sample API answers for the UI check. Shapes follow src/lib/types.ts; values are made up.
const now = new Date();
const ym = (offset) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
};
export const month = ym(0);
const day = (d) => `${month}-${String(d).padStart(2, '0')}`;

const accounts = {
  nubank: {
    id: 'acc-nu',
    name: 'Nubank',
    bank: 'Nubank',
    currency: 'BRL',
    is_card: false,
    member_id: 'mem-1',
  },
  inter: {
    id: 'acc-inter',
    name: 'Inter',
    bank: 'Inter',
    currency: 'BRL',
    is_card: false,
    member_id: 'mem-2',
  },
  wise: {
    id: 'acc-wise',
    name: 'Wise EUR',
    bank: 'Wise',
    currency: 'EUR',
    is_card: false,
    member_id: null,
  },
};

let n = 0;
const tx = (account, d, description, amount, kind = 'regular', category = null) => ({
  id: `tx-${++n}`,
  date: day(d),
  description,
  amount,
  currency: account.currency,
  kind,
  account_id: account.id,
  account_name: account.name,
  category_id: category ? `cat-${category}` : null,
  category_name: category,
  member_id: account.member_id,
  review: 'approved',
});

const regular = [
  tx(accounts.nubank, 28, 'Pão de Açúcar', '-312.40', 'regular', 'Mercado'),
  tx(accounts.nubank, 27, 'Uber', '-23.90', 'regular', 'Transporte'),
  tx(accounts.inter, 25, 'Salário', '8500.00', 'regular', 'Salário'),
  tx(accounts.nubank, 22, 'Netflix', '-55.90', 'regular', 'Assinaturas'),
  // An euro line shown in reais: the converted amount, with the statement's below.
  {
    ...tx(accounts.wise, 20, 'Mercadona', '-42.30', 'regular', 'Mercado'),
    display_amount: '-262.26',
    display_currency: 'BRL',
  },
  tx(accounts.nubank, 18, 'iFood', '-64.50', 'regular', 'Restaurantes'),
  tx(accounts.nubank, 12, 'Farmácia São Paulo', '-89.10', 'regular', 'Saúde'),
  tx(accounts.inter, 5, 'Aluguel', '-2800.00', 'regular', 'Casa'),
];
const investments = [
  tx(accounts.nubank, 20, 'Aplicação RDB', '-1500.00', 'investment', 'Investimento'),
  tx(
    accounts.inter,
    10,
    'Debito Online Td: "Prot.1 IPCA+ 2032"',
    '-800.00',
    'investment',
    'Investimento',
  ),
  tx(accounts.nubank, 3, 'Resgate RDB', '300.00', 'investment', 'Investimento'),
];
const pending = [tx(accounts.nubank, 26, 'Pix enviado: Thiago Bomfim', '-400.00', 'pending')];

// Início on a computer: spending per day (this month and the one before), shares.
// Lines that came in and wait for approval: a bank read and a sent statement.
const waiting = (account, d, description, amount, category) => ({
  ...tx(account, d, description, amount, 'regular', category),
  review: 'pending',
});
const toReview = [
  {
    import_id: 'imp-sync-wise',
    label: 'Wise · Wise EUR',
    source: 'bank',
    imported_at: `${day(27)}T06:00:00Z`,
    items: [
      waiting(accounts.wise, 27, 'Mercadona', '-23.40', 'Mercado'),
      waiting(accounts.wise, 26, 'Metro de Madrid', '-12.00', 'Transporte'),
      waiting(accounts.wise, 26, 'Cafe Comercial', '-4.80', 'Restaurantes'),
    ],
  },
  {
    import_id: 'imp-nubank-novembro.ofx',
    label: 'nubank-novembro.ofx',
    source: 'statement',
    imported_at: `${day(25)}T21:10:00Z`,
    items: [
      waiting(accounts.nubank, 25, 'iFood *Pizzaria', '-68.90', 'Restaurantes'),
      waiting(accounts.nubank, 24, 'Drogasil', '-41.30', 'Saúde'),
    ],
  },
];

const daysIn = (offset) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return d.getUTCDate();
};
// Investments count as spending (aplicação) and income (resgate), like Thiago asked.
const counted = [...regular, ...investments].sort((a, b) => b.date.localeCompare(a.date));
const spent = [
  ...counted.filter((t) => t.amount.startsWith('-')),
  tx(accounts.nubank, 2, 'Padaria', '-60.00', 'regular', 'Outros'),
];
const daily = Array.from({ length: daysIn(0) }, (_, i) =>
  spent
    .filter((t) => t.date === day(i + 1))
    .reduce((sum, t) => sum - Number(t.amount), 0)
    .toFixed(2),
);
const previousDaily = Array.from({ length: daysIn(-1) }, (_, i) =>
  (i === 4 ? 2800 : i % 3 === 0 ? 45 + (i % 7) * 12 : 0).toFixed(2),
);
// Spending by a dimension; "key" is what Transações filters the row by.
const shares = (name, key) =>
  Object.values(
    spent.reduce((acc, t) => {
      const k = key(t);
      const before = acc[k] ?? { key: k, name: name(t), amount: 0 };
      return { ...acc, [k]: { ...before, amount: before.amount - Number(t.amount) } };
    }, {}),
  )
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ ...r, amount: r.amount.toFixed(2) }));
const bankOf = (t) => Object.values(accounts).find((a) => a.id === t.account_id).bank;

const importDone = (filename, format, bank, imported, duplicates, d) => ({
  id: `imp-${filename}`,
  filename,
  format,
  bank,
  status: 'imported',
  period_start: day(1),
  period_end: day(d),
  imported_count: imported,
  duplicate_count: duplicates,
  skipped_count: 0,
  created_at: `${day(d)}T12:00:00Z`,
  finished_at: `${day(d)}T12:00:05Z`,
  to_review: 0,
  lines: imported,
});

const family = {
  id: 'fam-1',
  name: 'Família',
  display_currency: 'BRL',
  month_start_day: 1,
  review_imports: true,
  members: [
    { id: 'mem-1', name: 'Pessoa', color: '#8a8799', kind: 'me', user_id: 'user-1' },
    { id: 'mem-2', name: 'Ana', color: '#c7795a', kind: 'spouse', user_id: null },
  ],
};

// The bank's own portfolio (Pluggy). Synthetic: no real balances.
const year = Number(month.slice(0, 4));
const position = (o) => ({
  issuer: null,
  code: null,
  currency: 'BRL',
  gain: null,
  rate_label: null,
  due_date: null,
  value_date: day(16),
  ...o,
  balance: o.value,
});
const portfolio = {
  currency: 'BRL',
  total: '48230.5500',
  count: 6,
  value_date: day(16),
  closed: 1,
  has_source: true,
  tracked: { invested: '36000.00', value: '39830.5500', gain: '3830.5500', gain_pct: '10.6' },
  classes: [
    {
      key: 'fixed',
      label: 'Renda fixa',
      total: '27110.3000',
      share: '0.5621',
      positions: [
        position({
          id: 'p1',
          bank: 'Inter',
          name: 'CDB Inter Liquidez Diária',
          value: '12480.1200',
          gain: '980.1200',
          rate_label: '100% do CDI',
        }),
        position({
          id: 'p2',
          bank: 'Nubank',
          name: 'RDB Nubank',
          value: '9630.1800',
          gain: '630.1800',
          rate_label: '105% do CDI',
          due_date: `${year + 1}-03-15`,
        }),
        position({
          id: 'p3',
          bank: 'Inter',
          name: 'LCI 2028',
          code: 'LCI24A00123',
          issuer: 'Banco Exemplo Sul',
          value: '5000.0000',
          gain: '320.0000',
          rate_label: '92% do CDI',
          due_date: `${year + 2}-08-01`,
        }),
      ],
    },
    {
      key: 'treasury',
      label: 'Tesouro Direto',
      total: '12720.2500',
      share: '0.2637',
      positions: [
        position({
          id: 'p4',
          bank: 'Inter',
          name: 'Tesouro IPCA+ 2035',
          value: '12720.2500',
          gain: '1900.2500',
          rate_label: 'IPCA + 6,4% a.a.',
          due_date: `${year + 9}-05-15`,
        }),
      ],
    },
    {
      key: 'etf',
      label: 'ETFs',
      total: '8400.0000',
      share: '0.1742',
      positions: [
        position({ id: 'p5', bank: 'Inter', name: 'BOVA11', code: 'BOVA11', value: '5100.0000' }),
        position({ id: 'p6', bank: 'Inter', name: 'IVVB11', code: 'IVVB11', value: '3300.0000' }),
      ],
    },
  ],
  banks: [
    { bank: 'Inter', total: '38600.3700' },
    { bank: 'Nubank', total: '9630.1800' },
  ],
  maturing: { months: 12, count: 1, total: '9630.1800' },
  ladder: {
    steps: [0, 1, 2, 3, 4, 5, 6, 7].map((o) => ({
      label: o === 7 ? `${year + o}+` : String(year + o),
      year: year + o,
      total: { 1: '9630.1800', 2: '5000.0000', 7: '12720.2500' }[o] ?? '0',
      count: o === 1 || o === 2 || o === 7 ? 1 : 0,
    })),
    dated_total: '27350.4300',
    dated_count: 3,
    undated_total: '20880.1200',
    undated_count: 3,
  },
  history: Array.from({ length: 12 }, (_, i) => ({
    date: `${ym(i - 11)}-16`,
    total: i === 11 ? '48230.5500' : String(39000 + i * 790 + (i % 3) * 260),
  })),
};

// A Nubank card: this month's bill (purchases made last month, one split in 10), paid,
// and next month's bill filling up.
const card = {
  id: 'acc-nu-card',
  name: 'Nubank cartão',
  bank: 'Nubank',
  currency: 'BRL',
  is_card: true,
  member_id: 'mem-1',
};
const prev = ym(-1);
const next = ym(1);
const cardTx = (date, description, amount, category, bill, installment = null) => ({
  ...tx(card, 1, description, amount, 'regular', category),
  date,
  card_bill: bill,
  installment,
});
export const cardPurchases = {
  [month]: [
    cardTx(`${prev}-27`, 'Zara', '-389.90', 'Roupas', month),
    cardTx(`${prev}-24`, 'Tok&Stok', '-249.00', 'Casa', month, '3/10'),
    cardTx(`${prev}-19`, 'Posto Shell', '-210.00', 'Transporte', month),
    cardTx(`${prev}-15`, 'Spotify', '-21.90', 'Assinaturas', month),
    cardTx(`${prev}-11`, 'Decolar', '-612.00', 'Viagem', month, '2/6'),
  ],
  [next]: [
    cardTx(day(9), 'Amazon', '-159.90', 'Compras', next),
    cardTx(day(6), 'Tok&Stok', '-249.00', 'Casa', next, '4/10'),
    cardTx(day(3), 'Decolar', '-612.00', 'Viagem', next, '3/6'),
  ],
};

export const fixtures = {
  '/transactions/card-bills': {
    month,
    bills_known: true,
    cards: [
      {
        account_id: card.id,
        account_name: card.name,
        bank: card.bank,
        currency: 'BRL',
        bill: { month, total: '1482.80', count: 5 },
        next: { month: next, total: '1020.90', count: 3 },
        payments: [{ date: day(10), amount: '1482.80' }],
        paid: '1482.80',
        status: 'paid',
        months: [next, month, prev],
      },
    ],
  },
  '/portfolio': portfolio,
  '/auth/me': {
    id: 'user-1',
    email: 'pessoa@example.com',
    name: 'Pessoa Exemplo',
    picture_url: null,
    family,
  },
  '/family': family,
  '/accounts': Object.values(accounts),
  // Wise read through Enable Banking; Nubank through Meu Pluggy, its card unreadable.
  '/connections': {
    connections: [
      {
        id: 'conn-wise',
        provider: 'enablebanking',
        bank: 'Wise',
        accounts: [{ account_id: 'acc-wise', name: 'Wise EUR', currency: 'EUR', is_card: false }],
        consent_expires_at: `${ym(6)}-01T00:00:00Z`,
        last_sync_at: new Date(new Date().setHours(6, 2, 0, 0)).toISOString(),
        last_error: null,
      },
      {
        id: 'conn-nu',
        provider: 'pluggy',
        bank: 'Nubank',
        accounts: [
          { account_id: 'acc-nu', name: 'Nubank', currency: 'BRL', is_card: false },
          { account_id: null, name: 'Cartão de crédito BRL', currency: 'BRL', is_card: true },
        ],
        consent_expires_at: null,
        last_sync_at: new Date(new Date().setHours(6, 3, 0, 0)).toISOString(),
        last_error: 'Cartão de crédito: A Pluggy respondeu 500: erro temporário',
      },
    ],
    european_banks: ['Wise', 'Revolut', 'CaixaBank'],
    brazil_ready: true,
  },
  '/categories': [
    ...[
      ['Mercado', '#5f8f7b', 23, 2],
      ['Restaurantes', '#c7795a', 14, 1],
      ['Casa', '#8a7fb8', 3, 0],
      ['Saúde', '#c75a5a', 4, 0],
      ['Transporte', '#6f8fb8', 19, 1],
      ['Assinaturas', '#4f9a9a', 6, 3],
      ['Outros', '#9a98a6', 8, 0],
      ['Investimento', '#3d5ac2', 3, 0],
    ].map(([name, color, transaction_count, rule_count]) => ({
      id: `cat-${name}`,
      name,
      kind: 'expense',
      color,
      is_default: true,
      transaction_count,
      rule_count,
    })),
    {
      id: 'cat-Pets',
      name: 'Pets',
      kind: 'expense',
      color: '#b8a25a',
      is_default: false,
      transaction_count: 2,
      rule_count: 0,
    },
    {
      id: 'cat-Salário',
      name: 'Salário',
      kind: 'income',
      color: '#5f9f6b',
      is_default: true,
      transaction_count: 2,
      rule_count: 0,
    },
    {
      id: 'cat-Transferência',
      name: 'Transferência',
      kind: 'transfer',
      color: '#8a8799',
      is_default: true,
      transaction_count: 5,
      rule_count: 0,
    },
  ],
  '/categories/cat-Mercado/rules': [
    { id: 'rule-1', merchant: 'pao de acucar' },
    { id: 'rule-2', merchant: 'mercadona' },
  ],
  '/imports': [
    importDone('nubank-outubro.ofx', 'ofx', 'Nubank', 42, 3, 4),
    importDone('extrato-inter.pdf', 'pdf', 'Inter', 18, 0, 9),
  ],
  '/transactions/summary': {
    month,
    currencies: [
      {
        currency: 'BRL',
        income: '8800.00',
        spending: '5705.80',
        invested: '2000.00',
        invested_in: '2300.00',
        invested_out: '300.00',
        left: '3094.20',
      },
      {
        currency: 'EUR',
        income: '0.00',
        spending: '120.00',
        invested: '0.00',
        invested_in: '0.00',
        invested_out: '0.00',
        left: '-120.00',
      },
    ],
    pending_transfers: pending.length,
    to_review: toReview.reduce((n, g) => n + g.items.length, 0),
  },
  '/transactions/review': {
    total: toReview.reduce((n, g) => n + g.items.length, 0),
    groups: toReview,
  },
  '/transactions/dashboard': {
    month,
    start: day(1),
    end: day(daysIn(0)),
    currencies: [
      {
        currency: 'BRL',
        daily,
        previous_daily: previousDaily,
        categories: shares(
          (t) => t.category_name ?? 'Sem categoria',
          (t) => t.category_id ?? 'none',
        ),
        accounts: shares(
          (t) => t.account_name,
          (t) => t.account_id,
        ),
        people: shares(
          (t) => ({ 'mem-1': 'Pessoa', 'mem-2': 'Ana' })[t.member_id] ?? 'Casa',
          (t) => t.member_id ?? 'casa',
        ),
        banks: shares(bankOf, bankOf),
        income_categories: [
          { key: 'cat-Renda', name: 'Renda', amount: '8000.00' },
          { key: 'cat-Outros', name: 'Outros', amount: '500.00' },
          { key: 'cat-Investimento', name: 'Investimento', amount: '300.00' },
        ],
        previous_income: '8200.00',
        previous_spending: '6100.00',
      },
      {
        currency: 'EUR',
        daily: daily.map((_, i) => (i === 3 ? '120.00' : '0.00')),
        previous_daily: previousDaily.map(() => '0.00'),
        categories: [{ name: 'Outros', amount: '120.00' }],
        accounts: [{ name: 'Wise EUR', amount: '120.00' }],
        people: [{ name: 'Casa', amount: '120.00' }],
        banks: [{ name: 'Wise', amount: '120.00' }],
        income_categories: [],
        previous_income: '0.00',
        previous_spending: '0.00',
      },
    ],
  },
  '/transactions/analysis': {
    month,
    months: 6,
    currencies: [
      {
        currency: 'BRL',
        months: [
          ['-5', '2810.40'],
          ['-4', '3120.75'],
          ['-3', '2950.10'],
          ['-2', '3305.60'],
          ['-1', '2890.30'],
          ['0', '3655.20'],
        ].map(([o, amount]) => ({ month: ym(Number(o)), amount })),
        average: '3015.43',
        changes: [
          { name: 'Restaurantes', amount: '820.00', average: '510.00' },
          { name: 'Viagem', amount: '0.00', average: '240.00' },
          { name: 'Mercado', amount: '1180.50', average: '1010.00' },
          { name: 'Transporte', amount: '310.00', average: '380.00' },
          { name: 'Lazer', amount: '260.00', average: '210.00' },
        ],
        habits: [
          {
            name: 'Uber Trip',
            category: 'Transporte',
            count: 11,
            previous_count: 8,
            total: '286.00',
          },
          { name: 'iFood', category: 'Restaurantes', count: 7, previous_count: 4, total: '412.30' },
          {
            name: 'Padaria Real',
            category: 'Mercado',
            count: 6,
            previous_count: 6,
            total: '93.60',
          },
          {
            name: 'Pão de Açúcar',
            category: 'Mercado',
            count: 4,
            previous_count: 5,
            total: '688.20',
          },
        ],
        weekdays: ['78.20', '64.10', '70.40', '81.90', '118.30', '164.80', '96.50'],
        peaks: [
          { date: day(17), amount: '486.40', merchants: ['Pão de Açúcar', 'Outback'] },
          { date: day(3), amount: '312.90', merchants: ['Renner'] },
          { date: day(24), amount: '228.00', merchants: ['iFood', 'Uber Trip'] },
        ],
        recurring: [
          { name: 'Smart Fit', category: 'Lazer', amount: '119.90', last_date: day(5), months: 4 },
          {
            name: 'Netflix.com',
            category: 'Assinaturas',
            amount: '55.90',
            last_date: day(12),
            months: 4,
          },
          {
            name: 'Spotify',
            category: 'Assinaturas',
            amount: '21.90',
            last_date: day(9),
            months: 4,
          },
        ],
        recurring_total: '197.70',
      },
      {
        currency: 'EUR',
        months: [-5, -4, -3, -2, -1, 0].map((o) => ({
          month: ym(o),
          amount: o === 0 ? '120.00' : '0.00',
        })),
        average: null,
        changes: [],
        habits: [],
        weekdays: ['0', '0', '0', '120.00', '0', '0', '0'],
        peaks: [{ date: day(4), amount: '120.00', merchants: ['Mercadona'] }],
        recurring: [],
        recurring_total: '0',
      },
    ],
  },
  // Transferências > Conferência: the card bill closed, R$ 400 went to an account not in
  // the app.
  '/transactions/movements': {
    month,
    groups: [
      {
        currency: 'BRL',
        rows: [
          {
            name: 'Transferência',
            color: '#8a8799',
            went_out: '2600.00',
            came_in: '2200.00',
            net: '-400.00',
            count: 5,
          },
          {
            name: 'Pagamento de cartão',
            color: '#6f8fb8',
            went_out: '1850.00',
            came_in: '1850.00',
            net: '0.00',
            count: 2,
          },
        ],
        went_out: '4450.00',
        came_in: '4050.00',
        net: '-400.00',
        result: 'out',
      },
    ],
  },
  '/transactions/purge': { transactions: 312, to_review: 12, imports: 5, banks: 2 },
  '/transactions/transfers': {
    month,
    pending,
    confirmed: [
      {
        id: 'tr-1',
        date: day(15),
        description: 'Transferência',
        from_account: 'Inter',
        to_account: 'Nubank',
        amount: '1000.00',
        currency: 'BRL',
        to_amount: null,
        to_currency: null,
        kind: 'pair',
      },
      {
        id: 'tr-2',
        date: day(8),
        description: 'Câmbio',
        from_account: 'Wise BRL',
        to_account: 'Wise EUR',
        amount: '600.00',
        currency: 'BRL',
        to_amount: '98.50',
        to_currency: 'EUR',
        kind: 'exchange',
      },
    ],
  },
  '/transactions': {
    total: regular.length + investments.length + pending.length,
    items: [...regular, ...investments, ...pending].sort((a, b) => b.date.localeCompare(a.date)),
  },
  regular: { total: counted.length, items: counted },
};
