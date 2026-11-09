import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Card } from "./card";

/** Número principal com rótulo, variação e nota (KPIs do Resumo, contadores da Revisão). */
export function StatCard({
  label,
  value,
  delta,
  footnote,
  highlight,
  className,
}: {
  label: string;
  /** Normalmente <Money size="display" …/> ou um número em serifa. */
  value: React.ReactNode;
  delta?: { label: string; tone: "success" | "danger" | "default" };
  footnote?: React.ReactNode;
  /** Contorno colorido para chamar atenção (ex.: "9 precisam de você"). */
  highlight?: "warning";
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-2 px-5 py-4",
        highlight === "warning" && "border-warning/60 bg-warning-soft",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {delta ? <Badge variant={delta.tone}>{delta.label}</Badge> : null}
      </div>
      <div className="font-display text-display-lg">{value}</div>
      {footnote ? <div className="text-meta text-subtle">{footnote}</div> : null}
    </Card>
  );
}
