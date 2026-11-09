import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Informe um nome"),
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  color: z.string().default("#64748b"),
  icon: z.string().optional(),
});

export const GET = handle(async () => {
  const user = await requireUser();
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return json({ categories });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());
  const category = await prisma.category.create({
    data: { userId: user.id, ...body, isDefault: false },
  });
  return json({ category }, { status: 201 });
});
