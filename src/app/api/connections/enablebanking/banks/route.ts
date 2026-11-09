import { z } from "zod";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { listAspsps } from "@/lib/enablebanking/client";

export const dynamic = "force-dynamic";

const query = z.object({ country: z.string().regex(/^[A-Z]{2}$/, "País no formato ES, PT…") });

/** Bancos de um país na Enable Banking, para escolher qual conectar. */
export const GET = handle(async (req) => {
  await requireUser();
  const { country } = query.parse({ country: new URL(req.url).searchParams.get("country")?.toUpperCase() });
  const banks = await listAspsps(country);
  return json({
    banks: banks
      .map((b) => ({ name: b.name, country: b.country, logo: b.logo ?? null, beta: Boolean(b.beta) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  });
});
