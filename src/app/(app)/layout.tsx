import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { name: true } });

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AppNav email={session.email} name={user?.name} />
      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
