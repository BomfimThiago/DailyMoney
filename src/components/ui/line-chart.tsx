"use client";

import * as React from "react";
import { Decimal } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface LinePoint {
  label: string;
  /** Valor em string decimal (dinheiro). Só vira número para a geometria do desenho. */
  value: string;
  /** Texto do tooltip do ponto. */
  hint?: React.ReactNode;
}

/** Ticks redondos (1, 2, 2,5 ou 5 × 10ⁿ) com o de cima acima do máximo. */
export function niceTicks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi <= max) hi += step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const LANE = 64; // coluna dos rótulos do eixo y
const PAD_T = 10;
const PAD_B = 30;
const PAD_R = 12;

/**
 * Uma série, uma pergunta: linha de 2px em tinta, segmentos retos, sem preenchimento e sem
 * marcadores. O ponto em destaque (o mês atual) leva o cobalto; ao passar o mouse, a linha
 * depois do cursor fica cinza-clara, com guia tracejada e um tooltip simples.
 */
export function LineChart({
  data,
  highlight = data.length - 1,
  height = 200,
  formatTick = (v) => String(v),
  "aria-label": ariaLabel,
  className,
}: {
  data: LinePoint[];
  /** Índice do ponto que é o dado principal (padrão: o último). */
  highlight?: number;
  height?: number;
  formatTick?: (v: number) => string;
  "aria-label": string;
  className?: string;
}) {
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

  const values = data.map((d) => new Decimal(d.value || 0).toNumber());
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const ticks = niceTicks(lo, hi, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - LANE - PAD_R);
  const plotH = height - PAD_T - PAD_B;
  const x = (i: number) => LANE + (data.length <= 1 ? plotW / 2 : (i * plotW) / (data.length - 1));
  const y = (v: number) => PAD_T + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const path = (from: number, to: number) =>
    values
      .slice(from, to + 1)
      .map((v, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  // Rótulos do eixo x num passo de 2 que termina no último mês.
  const labelled = (i: number) => data.length <= 7 || (data.length - 1 - i) % 2 === 0;
  const cut = hover ?? data.length - 1;
  const colW = data.length > 1 ? plotW / (data.length - 1) : plotW;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
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
          {data.map((d, i) =>
            labelled(i) || i === highlight ? (
              <text
                key={d.label}
                x={x(i)}
                y={height - 8}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                className={cn(
                  "text-[12px] capitalize",
                  i === highlight ? "fill-foreground font-semibold" : "fill-subtle",
                )}
              >
                {d.label}
              </text>
            ) : null,
          )}
          <path d={path(0, cut)} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinejoin="round" />
          {cut < data.length - 1 ? (
            <path
              d={path(cut, data.length - 1)}
              fill="none"
              stroke="hsl(var(--input))"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ) : null}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="hsl(var(--subtle))"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ) : null}
          <circle
            cx={x(highlight)}
            cy={y(values[highlight] ?? 0)}
            r={5}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--card))"
            strokeWidth={2}
          />
          {hover !== null && hover !== highlight ? (
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="hsl(var(--foreground))" />
          ) : null}
          {data.map((d, i) => (
            <rect
              key={d.label}
              x={x(i) - colW / 2}
              y={PAD_T}
              width={colW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      ) : null}
      {hover !== null && data[hover]?.hint ? (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-[13px] shadow-overlay"
          style={{
            left: Math.min(Math.max(x(hover), LANE + 80), width - 80),
            transform: "translate(-50%, -100%)",
          }}
        >
          {data[hover].hint}
        </div>
      ) : null}
    </div>
  );
}
