import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, { box: string; icon: string; Icon: React.ElementType }> = {
  info: { box: "bg-transfer-soft", icon: "text-transfer", Icon: Info },
  success: { box: "bg-success-soft", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft", icon: "text-warning", Icon: Sparkles },
  danger: { box: "bg-destructive-soft", icon: "text-destructive", Icon: AlertTriangle },
  brand: { box: "bg-primary-soft text-primary-ink", icon: "text-primary", Icon: ShieldCheck },
};

/**
 * Faixa de aviso dentro da página (não some sozinha, ao contrário do toast).
 * warning = pede ação · danger = erro · brand = garantia/confiança · info = neutro.
 * `items`: vários problemas, um por linha (ex.: avisos da leitura de um extrato).
 */
export function Alert({
  tone = "info",
  title,
  children,
  items,
  action,
  icon,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  items?: React.ReactNode[];
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const list = items?.length ? items : null;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl px-4 py-3", list ? "items-start" : "items-center", t.box, className)}
    >
      <span className={cn("shrink-0 [&_svg]:size-4", list && "mt-0.5", t.icon)}>{icon ?? <t.Icon />}</span>
      <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
        {title ? <span className="font-semibold text-foreground">{title} </span> : null}
        {children ? <span className="text-muted-foreground">{children}</span> : null}
        {list ? (
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {list.map((item, i) => (
              <li key={i} className="flex gap-2 break-words">
                <span aria-hidden className={cn("mt-[0.55em] size-1 shrink-0 rounded-full bg-current", t.icon)} />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
