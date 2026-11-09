import { handle, json } from "@/lib/http";
import { changePasswordSchema } from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/service";

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = changePasswordSchema.parse(await req.json());
  await changePassword(user.id, body.currentPassword, body.newPassword);
  return json({ ok: true });
});
