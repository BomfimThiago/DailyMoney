import * as React from "react";

/** Bloco rotulado para organizar variações dentro de uma story. */
export function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <div className="text-eyebrow uppercase text-subtle">{title}</div>
        {note ? <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`}>{children}</div>;
}

/** Comparação lado a lado para decisões ("Opção A" × "Opção B"). */
export function Option({
  label,
  title,
  pros,
  cons,
  children,
  chosen,
}: {
  chosen?: boolean;
  label: string;
  title: string;
  pros?: string[];
  cons?: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-4 rounded-2xl p-4 ${chosen ? "bg-primary-soft/50 shadow-[0_0_0_1px_hsl(var(--primary)/.35)]" : "opacity-60"}`}
    >
      <div>
        <div className="text-eyebrow uppercase text-primary">{chosen ? `${label} · escolhida ✓` : label}</div>
        <div className="font-display text-display-sm">{title}</div>
      </div>
      <div>{children}</div>
      {pros || cons ? (
        <ul className="space-y-1 text-[12.5px]">
          {pros?.map((p) => (
            <li key={p} className="text-success">
              + {p}
            </li>
          ))}
          {cons?.map((c) => (
            <li key={c} className="text-destructive">
              − {c}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
