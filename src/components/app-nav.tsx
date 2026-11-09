"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Tags,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout, useUploads } from "@/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS = [
  { href: "/dashboard", label: "Resumo", short: "Resumo", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", short: "Transações", icon: ListOrdered },
  { href: "/investments", label: "Investimentos", short: "Carteira", icon: TrendingUp },
  { href: "/upload", label: "Importar", short: "Importar", icon: Upload, badge: true },
  { href: "/categories", label: "Categorias", short: "Categorias", icon: Tags },
  { href: "/members", label: "Responsáveis", short: "Pessoas", icon: Users },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || (href === "/upload" && pathname.startsWith("/review"));
}

/** Nº de importações esperando revisão (badge do menu "Importar"). */
function usePendingReviews() {
  const uploads = useUploads();
  return uploads.data?.filter((u) => u.status === "STAGED").length ?? 0;
}

/** Marca: três moedas sobrepostas (as três moedas do app: €, US$, R$), em cobalto. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" aria-hidden className={cn("h-6 w-8 shrink-0", className)}>
      <circle cx="9" cy="12" r="7.25" fill="hsl(var(--primary-soft))" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="7.25" fill="hsl(var(--primary-soft))" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <circle cx="23" cy="12" r="7.25" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth="1.5" />
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <BrandMark />
      <span className="text-[16px] font-semibold tracking-[-0.01em]">Daily Money</span>
    </Link>
  );
}

/** Conta e "Sair". `compact`: só a inicial, no topo do celular (onde não há barra lateral). */
function UserMenu({ email, name, compact = false }: { email: string; name?: string | null; compact?: boolean }) {
  const router = useRouter();
  const logout = useLogout();
  const label = name || email.split("@")[0];
  async function onLogout() {
    try {
      await logout.mutateAsync();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }
  const initial = (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-[13px] font-semibold text-muted-foreground shadow-control">
      {label.charAt(0).toUpperCase()}
    </span>
  );
  return (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          aria-label={`Conta de ${label}`}
          className="-mr-1 grid size-10 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initial}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-input/50 focus-visible:ring-2 focus-visible:ring-ring">
          {initial}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{label}</span>
            <span className="block truncate text-[12px] text-subtle">{email}</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 text-subtle" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent side={compact ? "bottom" : "top"} align={compact ? "end" : "start"} className="w-56">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        {/* Link de verdade: Cmd/Ctrl-clique abre em outra aba. */}
        <DropdownMenuItem asChild>
          <Link href="/account">
            <KeyRound aria-hidden />
            Conta e senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onLogout} disabled={logout.isPending}>
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppNav({ email, name }: { email: string; name?: string | null }) {
  const isActive = useActive();
  const pending = usePendingReviews();

  return (
    <>
      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {LINKS.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors",
                  active
                    ? "bg-input/60 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-input/30 hover:text-foreground",
                )}
              >
                <Icon aria-hidden className={cn("size-4", active ? "text-foreground" : "text-subtle")} />
                <span className="flex-1">{label}</span>
                {badge && pending > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11px] font-semibold text-card">
                    {pending}
                    <span className="sr-only">
                      {" "}
                      {pending === 1 ? "importação para revisar" : "importações para revisar"}
                    </span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <UserMenu email={email} name={name} />
      </aside>

      {/* Celular: a marca no topo (o produto sempre nomeado) e as abas embaixo */}
      <header className="flex h-12 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
        <Brand />
        <UserMenu email={email} name={name} compact />
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] px-3 pt-2 lg:hidden">
        {LINKS.map(({ href, short, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-1 text-[11px] font-medium",
                active ? "text-foreground" : "text-subtle",
              )}
            >
              <Icon aria-hidden className={cn("size-5", active && "text-foreground")} />
              {short}
              {badge && pending > 0 ? (
                <span className="absolute right-3 top-[-2px] grid size-4 place-items-center rounded-full bg-warning text-[10px] font-semibold text-card">
                  {pending}
                  <span className="sr-only">
                    {" "}
                    {pending === 1 ? "importação para revisar" : "importações para revisar"}
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
