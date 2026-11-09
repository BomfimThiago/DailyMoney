import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Informe um nome"),
  kind: z.enum(["ME", "SPOUSE", "FAMILY", "OTHER"]).default("OTHER"),
  color: z.string().default("#64748b"),
});

export const GET = handle(async () => {
  const user = await requireUser();
  const members = await prisma.member.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });
  return json({ members });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());
  const member = await prisma.member.create({ data: { userId: user.id, ...body } });
  return json({ member }, { status: 201 });
});
