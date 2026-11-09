import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { commitUpload } from "@/lib/ingest/commit";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const result = await commitUpload(user.id, ctx.params.id);
  return json({ result });
});
