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
    bank: 'nubank',
    currency: 'BRL',
    is_card: false,
    member_id: null,
  },
  inter: {
    id: 'acc-inter',
    name: 'Inter',
    bank: 'inter',
    currency: 'BRL',
    is_card: false,
    member_id: null,
  },
  wise: {
    id: 'acc-wise',
    name: 'Wise EUR',
    bank: 'wise',
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
  '/imports': [],
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
