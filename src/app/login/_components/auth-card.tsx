import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Moldura das telas de autenticação (login, cadastro, esqueci, redefinir):
 * fundo `muted` em tela cheia, marca no topo, card central e rodapé com links.
 * Privado de /login; as outras telas importam por caminho relativo.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    // <main>: todo o conteúdo dentro de um landmark (leitores de tela pulam direto para ele).
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Link
        href="/login"
        className="mb-7 flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground">
          D
        </span>
        <span className="text-[16px] font-semibold tracking-tight">Daily Money</span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardContent className="px-7 py-7">
          <div className="mb-6 space-y-1.5">
            <h1 className="font-display text-display-md text-foreground">{title}</h1>
            {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </CardContent>
      </Card>

      {footer ? <div className="mt-5 text-center text-body text-muted-foreground">{footer}</div> : null}
    </main>
  );
}

/** Link de texto padrão entre as telas de autenticação. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
