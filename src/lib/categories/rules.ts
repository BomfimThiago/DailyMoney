import { prisma } from "@/lib/prisma";

// Normalize a bank description into a stable "merchant key": lowercase, strip
// accents, drop store numbers/punctuation, keep the first few tokens. So
// "GRUPO AHORRAMAS 1", "Grupo Ahorramas 24" → "grupo ahorramas".
export function normalizeMerchant(desc: string): string {
  return (desc ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

// Reinforce (or create) a rule when the user assigns a category to a merchant.
// This is the "learning" step — corrections make future imports auto-categorize.
export async function learnFromCorrection(userId: string, description: string, categoryId: string): Promise<void> {
  const pattern = normalizeMerchant(description);
  if (!pattern) return;

  const existing = await prisma.categoryRule.findFirst({
    where: { userId, matchType: "MERCHANT", pattern },
  });

  if (existing) {
    // Same merchant, same category → strengthen. Different category → retrain.
    if (existing.categoryId === categoryId) {
      await prisma.categoryRule.update({
        where: { id: existing.id },
        data: { weight: { increment: 1 }, hitCount: { increment: 1 } },
      });
    } else {
      await prisma.categoryRule.update({
        where: { id: existing.id },
        data: { categoryId, source: "USER", weight: 1, hitCount: { increment: 1 } },
      });
    }
    return;
  }

  await prisma.categoryRule.create({
    data: { userId, categoryId, matchType: "MERCHANT", pattern, source: "USER", weight: 1, hitCount: 1 },
  });
}

// Suggest a categoryId per description using learned rules. Returns a map keyed
// by the original description. Highest-weight rule wins on ties.
export async function suggestCategories(userId: string, descriptions: string[]): Promise<Map<string, string>> {
  const rules = await prisma.categoryRule.findMany({
    where: { userId, matchType: "MERCHANT" },
    orderBy: { weight: "desc" },
  });
  const byPattern = new Map<string, string>();
  for (const r of rules) {
    if (!byPattern.has(r.pattern)) byPattern.set(r.pattern, r.categoryId);
  }

  const out = new Map<string, string>();
  for (const desc of descriptions) {
    const key = normalizeMerchant(desc);
    const categoryId = byPattern.get(key);
    if (categoryId) out.set(desc, categoryId);
  }
  return out;
}
