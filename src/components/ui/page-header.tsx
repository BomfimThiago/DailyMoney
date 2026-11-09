import * as React from "react";
import { cn } from "@/lib/utils";

/** Rótulo pequeno em caixa alta acima de títulos e números ("AGOSTO · 2026"). */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-meta font-medium text-subtle", className)} {...props} />;
}

/** Cabeçalho de toda página: título + uma linha sobre os dados (o achado, o período) + ações. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-5 pb-2", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-3 text-[12.5px] text-subtle">{breadcrumb}</div> : null}
        {eyebrow ? <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow> : null}
        <h1 className="font-display text-display-xl text-foreground">{title}</h1>
        {description ? <p className="mt-1.5 text-[16px] leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
