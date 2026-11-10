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
    member_id: null,
  },
  inter: {
    id: 'acc-inter',
    name: 'Inter',
    bank: 'Inter',
    currency: 'BRL',
    is_card: false,
    member_id: null,
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
  member_id: null,
});

const regular = [
  tx(accounts.nubank, 28, 'Pão de Açúcar', '-312.40', 'regular', 'Mercado'),
  tx(accounts.nubank, 27, 'Uber', '-23.90', 'regular', 'Transporte'),
  tx(accounts.inter, 25, 'Salário', '8500.00', 'regular', 'Salário'),
  tx(accounts.nubank, 22, 'Netflix', '-55.90', 'regular', 'Assinaturas'),
  tx(accounts.nubank, 18, 'iFood', '-64.50', 'regular', 'Restaurantes'),
  tx(accounts.nubank, 12, 'Farmácia São Paulo', '-89.10', 'regular', 'Saúde'),
  tx(accounts.inter, 5, 'Aluguel', '-2800.00', 'regular', 'Casa'),
];
const investments = [
  tx(accounts.nubank, 20, 'Aplicação RDB', '-1500.00', 'investment'),
  tx(accounts.inter, 10, 'Debito Online Td: "Prot.1 IPCA+ 2032"', '-800.00', 'investment'),
  tx(accounts.nubank, 3, 'Resgate RDB', '300.00', 'investment'),
];
const pending = [tx(accounts.nubank, 26, 'Pix enviado: Thiago Bomfim', '-400.00', 'pending')];

// Início on a computer: spending per day (this month and the one before), shares.
const daysIn = (offset) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return d.getUTCDate();
};
const spent = [
  ...regular.filter((t) => t.amount.startsWith('-')),
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
const shares = (key) =>
  Object.entries(
    spent.reduce((acc, t) => ({ ...acc, [t[key]]: (acc[t[key]] ?? 0) - Number(t.amount) }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount: amount.toFixed(2) }));

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
});

export const fixtures = {
  '/auth/me': {
    id: 'user-1',
    email: 'pessoa@example.com',
    name: 'Pessoa Exemplo',
    picture_url: null,
    family: {
      id: 'fam-1',
      name: 'Família',
      display_currency: 'BRL',
      month_start_day: 1,
      members: [{ id: 'mem-1', name: 'Pessoa', color: '#3D5AC2', user_id: 'user-1' }],
    },
  },
  '/accounts': Object.values(accounts),
  '/categories': [
    ...['Mercado', 'Restaurantes', 'Casa', 'Saúde', 'Transporte', 'Assinaturas', 'Outros'].map(
      (name) => ({ id: `cat-${name}`, name, kind: 'expense', color: '#8A8799' }),
    ),
    { id: 'cat-Salário', name: 'Salário', kind: 'income', color: '#178A55' },
    { id: 'cat-Transferência', name: 'Transferência', kind: 'transfer', color: '#8A8799' },
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
        income: '8500.00',
        spending: '3405.80',
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
  },
  '/transactions/dashboard': {
    month,
    currencies: [
      {
        currency: 'BRL',
        daily,
        previous_daily: previousDaily,
        categories: shares('category_name'),
        accounts: shares('account_name'),
      },
      {
        currency: 'EUR',
        daily: daily.map((_, i) => (i === 3 ? '120.00' : '0.00')),
        previous_daily: previousDaily.map(() => '0.00'),
        categories: [{ name: 'Outros', amount: '120.00' }],
        accounts: [{ name: 'Wise EUR', amount: '120.00' }],
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
  '/transactions/investments': {
    month,
    totals: [{ currency: 'BRL', put_in: '9800.00', taken_out: '1300.00', net: '8500.00' }],
    products: [
      {
        name: 'RDB',
        account_id: 'acc-nu',
        account_name: 'Nubank',
        currency: 'BRL',
        put_in: '6500.00',
        taken_out: '1300.00',
        net: '5200.00',
        month_net: '1200.00',
        last_date: day(20),
      },
      {
        name: 'Prot.1 IPCA+ 2032',
        account_id: 'acc-inter',
        account_name: 'Inter',
        currency: 'BRL',
        put_in: '3300.00',
        taken_out: '0.00',
        net: '3300.00',
        month_net: '800.00',
        last_date: day(10),
      },
    ],
    history: [-5, -4, -3, -2, -1, 0].map((o, i) => ({
      month: ym(o),
      currency: 'BRL',
      put_in: ['1200.00', '900.00', '1500.00', '600.00', '1300.00', '2300.00'][i],
      taken_out: ['0.00', '200.00', '0.00', '500.00', '0.00', '300.00'][i],
      net: ['1200.00', '700.00', '1500.00', '100.00', '1300.00', '2000.00'][i],
    })),
    movements: investments,
  },
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
  regular: { total: regular.length, items: regular },
};
