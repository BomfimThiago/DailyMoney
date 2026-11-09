import { handle, json } from "@/lib/http";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await getSessionUser();
  return json({ user });
});
