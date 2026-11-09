import { prisma } from "@/lib/prisma";
import { CategoryKind, MemberKind } from "@prisma/client";

// Sensible defaults for a household. The AI learns per-user rules on top of these.
export const DEFAULT_EXPENSE_CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: "Mercado", color: "#16a34a", icon: "shopping-cart" },
  { name: "Restaurantes", color: "#f97316", icon: "utensils" },
  { name: "Transporte", color: "#0ea5e9", icon: "car" },
  { name: "Moradia", color: "#8b5cf6", icon: "home" },
  { name: "Contas & Serviços", color: "#eab308", icon: "file-text" },
  { name: "Saúde", color: "#ef4444", icon: "heart-pulse" },
  { name: "Educação", color: "#6366f1", icon: "graduation-cap" },
  { name: "Compras", color: "#ec4899", icon: "shopping-bag" },
  { name: "Assinaturas", color: "#14b8a6", icon: "repeat" },
  { name: "Lazer", color: "#f43f5e", icon: "gamepad-2" },
  { name: "Viagem", color: "#06b6d4", icon: "plane" },
  { name: "Impostos & Taxas", color: "#64748b", icon: "landmark" },
  { name: "Outros gastos", color: "#94a3b8", icon: "circle-ellipsis" },
];

export const DEFAULT_INCOME_CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: "Salário", color: "#16a34a", icon: "wallet" },
  { name: "Freelance", color: "#0ea5e9", icon: "briefcase" },
  { name: "Reembolso", color: "#8b5cf6", icon: "undo-2" },
  { name: "Investimentos", color: "#eab308", icon: "trending-up" },
  { name: "Presente", color: "#ec4899", icon: "gift" },
  { name: "Outras entradas", color: "#94a3b8", icon: "circle-plus" },
];

// Movimentação: dinheiro que só muda de lugar; fica fora de Gastos e Entradas.
export const DEFAULT_TRANSFER_CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: "Entre minhas contas", color: "#64748b", icon: "transfer" },
  { name: "Aplicações e resgates", color: "#0f766e", icon: "trending-up" },
  { name: "Pagamento de cartão", color: "#475569", icon: "landmark" },
];

export async function seedDefaultsForUser(userId: string, memberName = "Eu"): Promise<void> {
  await prisma.category.createMany({
    data: [
      ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        userId,
        name: c.name,
        kind: CategoryKind.EXPENSE,
        color: c.color,
        icon: c.icon,
        isDefault: true,
      })),
      ...DEFAULT_INCOME_CATEGORIES.map((c) => ({
        userId,
        name: c.name,
        kind: CategoryKind.INCOME,
        color: c.color,
        icon: c.icon,
        isDefault: true,
      })),
      ...DEFAULT_TRANSFER_CATEGORIES.map((c) => ({
        userId,
        name: c.name,
        kind: CategoryKind.TRANSFER,
        color: c.color,
        icon: c.icon,
        isDefault: true,
      })),
    ],
    skipDuplicates: true,
  });

  // Only one default responsável: the logged-in user (by name). Add/remove the rest.
  await prisma.member.createMany({
    data: [{ userId, name: memberName, kind: MemberKind.ME, color: "#2563eb" }],
    skipDuplicates: true,
  });
}
