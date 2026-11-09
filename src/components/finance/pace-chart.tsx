"use client";

import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal, formatAmount } from "@/lib/money";
import { niceTicks } from "@/components/ui/line-chart";
import { cn } from "@/lib/utils";
import { dayOfMonth, shortDate } from "@/lib/period";

const LANE = 64; // coluna dos rótulos do eixo y
const PAD_T = 10;
const PAD_B = 30;
const PAD_R = 12;

/**
 * Ritmo do mês: o gasto acumulado dia a dia (linha em tinta até hoje, ponto em cobalto) por
 * cima do mês anterior inteiro (tracejado cinza). Onde a linha passa por cima da tracejada,
 * o mês está gastando mais rápido. Ao passar o mouse, o dia com os dois valores.
 */
export function PaceChart({
  current,
  upTo,
  previous,
  days,
  currency,
  monthShort,
  dates,
  currentName,
  previousName,
  height = 200,
  formatTick = (v) => String(v),
  className,
}: {
  /** Acumulado do mês (string decimal), um por dia. */
  current: string[];
  /** Até que dia a linha do mês vai (hoje, no mês corrente). */
  upTo: number;
  /** Acumulado do mês anterior, um por dia dele. */
  previous: string[];
  /** Dias do mês mostrado. */
  days: number;
  currency: Currency;
  /** "nov" (no tooltip: "7 nov") */
  monthShort: string;
  /**
   * O dia do calendário de cada posição ("AAAA-MM-DD"), quando o mês começa noutro dia que
   * não o 1º (27/out a 26/nov): o eixo e o tooltip mostram a data, não a posição.
   */
  dates?: string[];
  /** "novembro" (legenda) */
  currentName: string;
  /** "outubro" */
  previousName: string;
  height?: number;
  formatTick?: (v: number) => string;
  className?: string;
}) {
  const crosses = dates ? dates[0]?.slice(0, 7) !== dates.at(-1)?.slice(0, 7) : false;
  const tick = (d: number) =>
    !dates?.[d - 1]
      ? String(d)
      : crosses && (d === 1 || d === days)
        ? shortDate(dates[d - 1])
        : String(dayOfMonth(dates[d - 1]));
  const fullDay = (d: number) => (dates?.[d - 1] ? shortDate(dates[d - 1]) : `${d} ${monthShort}`);
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Só a geometria vira número; os valores mostrados saem das strings decimais.
  const num = (s: string | undefined) => new Decimal(s ?? 0).toNumber();
  const cur = current.slice(0, upTo);
  // O mês anterior no eixo deste: dia a dia até o fim dele (mais curto: a linha para antes).
  const prev = previous.slice(0, days);
  const hi = Math.max(0, ...cur.map(num), ...prev.map(num));
  const ticks = niceTicks(0, hi, 4);
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - LANE - PAD_R);
  const plotH = height - PAD_T - PAD_B;
  const x = (day: number) => LANE + (days <= 1 ? plotW / 2 : ((day - 1) * plotW) / (days - 1));
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const path = (vals: string[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(num(v)).toFixed(1)}`).join(" ");
  const labels = (plotW < 320 ? [1, 10, 20] : [1, 5, 10, 15, 20, 25]).filter((d) => days - d >= 3).concat(days);
  const colW = days > 1 ? plotW / (days - 1) : plotW;
  const h = hover;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div ref={ref} className="relative w-full select-none" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Gasto acumulado por dia até o dia ${upTo}: ${formatAmount(cur[cur.length - 1] ?? "0", currency)}; em ${previousName}, no mesmo dia, ${formatAmount(prev[Math.min(upTo, prev.length) - 1] ?? "0", currency)}.`}
            className="block overflow-visible"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={LANE}
                  x2={width - PAD_R}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "hsl(var(--input))" : "hsl(var(--border))"}
                  strokeWidth={t === 0 ? 1.5 : 1}
                />
                <text
                  x={LANE - 10}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-subtle text-[12px] tabular-nums"
                >
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {labels.map((d) => (
              <text
                key={d}
                x={x(d)}
                y={height - 8}
                textAnchor={d === 1 ? "start" : d === days ? "end" : "middle"}
                className={cn("text-[12px] tabular-nums", d === upTo ? "fill-foreground font-semibold" : "fill-subtle")}
              >
                {tick(d)}
              </text>
            ))}
            {prev.length ? (
              <path
                d={path(prev)}
                fill="none"
                stroke="hsl(var(--subtle))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinejoin="round"
              />
            ) : null}
            <path d={path(cur)} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinejoin="round" />
            {h !== null ? (
              <line
                x1={x(h)}
                x2={x(h)}
                y1={PAD_T}
                y2={PAD_T + plotH}
                stroke="hsl(var(--subtle))"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            ) : null}
            {cur.length ? (
              <circle
                cx={x(cur.length)}
                cy={y(num(cur[cur.length - 1]))}
                r={5}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--card))"
                strokeWidth={2}
              />
            ) : null}
            {h !== null && h <= cur.length && h !== cur.length ? (
              <circle cx={x(h)} cy={y(num(cur[h - 1]))} r={4} fill="hsl(var(--foreground))" />
            ) : null}
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <rect
                key={d}
                x={x(d) - colW / 2}
                y={PAD_T}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
        ) : null}
        {h !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-[13px] shadow-overlay"
            style={{ left: Math.min(Math.max(x(h), LANE + 90), width - 90), transform: "translate(-50%, -100%)" }}
          >
            <span className="font-medium tabular-nums">{fullDay(h)}</span>
            {h <= cur.length ? <span className="tabular-nums"> · {formatAmount(cur[h - 1], currency)}</span> : null}
            {h <= prev.length ? (
              <span className="text-subtle tabular-nums">
                {" "}
                · {previousName} {formatAmount(prev[h - 1], currency)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-subtle">
        <span className="flex items-center gap-2">
          <svg width="20" height="8" aria-hidden>
            <line x1="0" x2="20" y1="4" y2="4" stroke="hsl(var(--foreground))" strokeWidth="2" />
          </svg>
          <span className="capitalize">{currentName}</span>
        </span>
        <span className="flex items-center gap-2">
          <svg width="20" height="8" aria-hidden>
            <line x1="0" x2="20" y1="4" y2="4" stroke="hsl(var(--subtle))" strokeWidth="1.5" strokeDasharray="4 4" />
          </svg>
          <span className="capitalize">{previousName}</span>
        </span>
      </div>
    </div>
  );
}
