// Dados de exemplo só para o Storybook. Nomes genéricos de propósito:
// os responsáveis reais vêm de `Member` no banco.
import type { CategoryLike } from "@/components/finance/category";
import type { MemberLike } from "@/components/finance/member";

export const CAT: Record<string, CategoryLike> = {
  mercado: { name: "Mercado", color: "#16a34a", icon: "shopping-cart" },
  restaurantes: { name: "Restaurantes", color: "#f97316", icon: "utensils" },
  transporte: { name: "Transporte", color: "#0ea5e9", icon: "car" },
  moradia: { name: "Moradia", color: "#8b5cf6", icon: "home" },
  contas: { name: "Contas & Serviços", color: "#eab308", icon: "file-text" },
  saude: { name: "Saúde", color: "#ef4444", icon: "heart-pulse" },
  educacao: { name: "Educação", color: "#6366f1", icon: "graduation-cap" },
  compras: { name: "Compras", color: "#ec4899", icon: "shopping-bag" },
  assinaturas: { name: "Assinaturas", color: "#14b8a6", icon: "repeat" },
  lazer: { name: "Lazer", color: "#f43f5e", icon: "gamepad-2" },
  viagem: { name: "Viagem", color: "#06b6d4", icon: "plane" },
  impostos: { name: "Impostos & Taxas", color: "#64748b", icon: "landmark" },
  outros: { name: "Outros gastos", color: "#94a3b8", icon: "circle-ellipsis" },
  salario: { name: "Salário", color: "#16a34a", icon: "wallet" },
  freelance: { name: "Freelance", color: "#0ea5e9", icon: "briefcase" },
  reembolso: { name: "Reembolso", color: "#8b5cf6", icon: "undo-2" },
  investimentos: { name: "Investimentos", color: "#eab308", icon: "trending-up" },
  presente: { name: "Presente", color: "#ec4899", icon: "gift" },
  outrasEntradas: { name: "Outras entradas", color: "#94a3b8", icon: "circle-plus" },
};

export const EXPENSE_KEYS = [
  "mercado",
  "restaurantes",
  "transporte",
  "moradia",
  "contas",
  "saude",
  "educacao",
  "compras",
  "assinaturas",
  "lazer",
  "viagem",
  "impostos",
  "outros",
];
export const INCOME_KEYS = ["salario", "freelance", "reembolso", "investimentos", "presente", "outrasEntradas"];

export const MEMBERS: Record<string, MemberLike> = {
  alex: { name: "Alex", color: "#2563eb" },
  sam: { name: "Sam", color: "#c2410c" },
  casa: { name: "Casa", color: "#7c3aed" },
};

export interface SampleTx {
  id: string;
  day: string;
  title: string;
  raw: string;
  cat: CategoryLike | null;
  member: MemberLike | null;
  bank: string;
  currency: "EUR" | "USD" | "BRL";
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  eur: string;
  original?: { value: string; currency: "EUR" | "USD" | "BRL" };
  pending?: boolean;
}

export const TXS: SampleTx[] = [
  {
    id: "1",
    day: "Qui, 20 ago",
    title: "Mercadona",
    raw: "MERCADONA VALENCIA",
    cat: CAT.mercado,
    member: MEMBERS.sam,
    bank: "Revolut",
    currency: "EUR",
    kind: "EXPENSE",
    eur: "86.42",
  },
  {
    id: "2",
    day: "Qui, 20 ago",
    title: "Metrovalencia",
    raw: "FGV RECARGA",
    cat: CAT.transporte,
    member: MEMBERS.sam,
    bank: "Revolut",
    currency: "EUR",
    kind: "EXPENSE",
    eur: "25.00",
    pending: true,
  },
  {
    id: "3",
    day: "Qua, 19 ago",
    title: "Salário",
    raw: "NOMINA ACME SL",
    cat: CAT.salario,
    member: MEMBERS.alex,
    bank: "Revolut",
    currency: "EUR",
    kind: "INCOME",
    eur: "4200.00",
  },
  {
    id: "4",
    day: "Qua, 19 ago",
    title: "Netflix",
    raw: "NETFLIX.COM",
    cat: CAT.assinaturas,
    member: MEMBERS.alex,
    bank: "Wise",
    currency: "USD",
    kind: "EXPENSE",
    eur: "13.24",
    original: { value: "15.49", currency: "USD" },
  },
  {
    id: "5",
    day: "Ter, 18 ago",
    title: "Wise → Revolut",
    raw: "TRANSFERENCIA DE WISE",
    cat: null,
    member: MEMBERS.alex,
    bank: "Revolut",
    currency: "EUR",
    kind: "TRANSFER",
    eur: "500.00",
  },
  {
    id: "6",
    day: "Sex, 14 ago",
    title: "Pão de Açúcar",
    raw: "PAO DE ACUCAR 1123",
    cat: CAT.mercado,
    member: MEMBERS.sam,
    bank: "Wise",
    currency: "BRL",
    kind: "EXPENSE",
    eur: "64.32",
    original: { value: "412.90", currency: "BRL" },
  },
  {
    id: "7",
    day: "Qui, 13 ago",
    title: "Aluguel",
    raw: "RECIBO ALQUILER AGOSTO",
    cat: CAT.moradia,
    member: MEMBERS.casa,
    bank: "Revolut",
    currency: "EUR",
    kind: "EXPENSE",
    eur: "1450.00",
  },
];

export const PICKER_CATS = [
  ...EXPENSE_KEYS.map((k) => ({ id: k, kind: "EXPENSE" as const, ...CAT[k] })),
  ...INCOME_KEYS.map((k) => ({ id: k, kind: "INCOME" as const, ...CAT[k] })),
];
