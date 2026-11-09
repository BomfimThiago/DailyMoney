import { cn } from "@/lib/utils";

/**
 * Confiança da IA/regra numa linha extraída. `value` 0–1 (StagedTransaction.confidence).
 * ≥ 85% verde · ≥ 65% âmbar · abaixo vermelho.
 */
export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bar = pct >= 85 ? "bg-success" : pct >= 65 ? "bg-warning" : "bg-destructive";
  const text = pct >= 85 ? "text-success" : pct >= 65 ? "text-warning" : "text-destructive";
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="img" aria-label={`Confiança ${pct}%`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span className={cn("block h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn("w-8 text-[12px] font-medium tabular-nums", text)}>{pct}%</span>
    </span>
  );
}
