"use client";

import * as React from "react";
import type { Currency } from "@prisma/client";
import { Decimal, formatAmount } from "@/lib/money";
import { tint } from "@/lib/color";
import type { FlowNode, MonthFlow } from "@/lib/transactions/aggregate";
import { cn } from "@/lib/utils";

const NODE_W = 8;
const GAP = 8; // entre os blocos de um mesmo lado
const HUB = 220; // altura da barra do meio (o total do mês)
const LABEL_MIN = 36; // distância mínima entre dois rótulos
const PAD_T = 46; // rótulo do meio, acima da barra
const PAD_B = 6;
const WIDE = 620; // abaixo disso, sem a coluna das entradas

const pct = (share: string) => {
  const p = new Decimal(share).times(100);
  return p.gt(0) && p.lt(1) ? "<1%" : `${p.toFixed(0)}%`;
};

/** A cor de cada bloco: categoria pelo matiz do banco; entradas e sobra em verde; reservas em âmbar. */
function paint(n: FlowNode): { band: string; node: string; opacity: number } {
  if (n.kind === "income") return { band: "hsl(var(--success))", node: "hsl(var(--success))", opacity: 0.2 };
  if (n.kind === "saved") return { band: "hsl(var(--success))", node: "hsl(var(--success))", opacity: 0.32 };
  if (n.kind === "deficit") return { band: "hsl(var(--warning))", node: "hsl(var(--warning))", opacity: 0.3 };
  const mark = tint(n.color).mark;
  return { band: mark, node: mark, opacity: 0.22 };
}

/** Rótulos centrados em cada bloco, empurrados para não se sobreporem, dentro de [top, bottom]. */
function spread(centers: number[], top: number, bottom: number) {
  const ys = [...centers];
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + LABEL_MIN : top);
  for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - LABEL_MIN : bottom);
  return ys;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…` : s);

/**
 * Fluxo do mês (Sankey): as entradas por categoria entram numa barra no meio e saem para os
 * gastos por categoria e para o que sobrou. Quando o gasto passa da entrada, a diferença
 * entra à esquerda como "Das reservas". A espessura de cada faixa é o valor; os dois lados
 * somam o mesmo. No celular, a coluna das entradas some e a barra do meio vira o começo.
 */
export function FlowChart({ flow, currency, className }: { flow: MonthFlow; currency: Currency; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<string | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const wide = width >= WIDE;
  const sources = wide ? flow.sources : [];
  const { targets } = flow;
  // Colunas: rótulos das entradas | entradas | meio | gastos | rótulos dos gastos.
  const labelR = wide ? 200 : Math.min(176, Math.round(width * 0.5));
  const labelL = wide ? 160 : 0;
  const tgtX = width - labelR - NODE_W;
  const srcX = labelL;
  const hubX = wide ? Math.round(srcX + (tgtX - srcX) * 0.46) : 0;

  // Uma escala só (px por unidade) para os dois lados e o meio: as faixas encaixam. O vão
  // entre dois blocos cresce o quanto for preciso para cada rótulo ficar ao lado do seu
  // bloco; a altura do desenho acompanha.
  const total = new Decimal(flow.total).toNumber();
  const k = HUB / total;
  const layout = (nodes: FlowNode[]) => {
    const hs = nodes.map((n) => new Decimal(n.value).toNumber() * k);
    const gaps = hs.slice(1).map((h, i) => Math.max(GAP, LABEL_MIN - (hs[i] + h) / 2));
    return { hs, gaps, used: hs.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) };
  };
  const R = layout(targets);
  const L = layout(sources);
  const plotH = Math.max(HUB, R.used, L.used);
  const height = PAD_T + plotH + PAD_B;
  const hubH = HUB;
  const hubY = PAD_T + (plotH - hubH) / 2;

  const stack = (nodes: FlowNode[], { hs, gaps, used }: ReturnType<typeof layout>) => {
    let y = PAD_T + (plotH - used) / 2;
    let hub = hubY;
    return nodes.map((n, i) => {
      const out = { n, y, h: hs[i], hubY: hub };
      y += hs[i] + (gaps[i] ?? 0);
      hub += hs[i];
      return out;
    });
  };
  const right = stack(targets, R);
  const left = stack(sources, L);

  const band = (x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) => {
    const m = (x0 + x1) / 2;
    return `M${x0},${a0} C${m},${a0} ${m},${b0} ${x1},${b0} L${x1},${b1} C${m},${b1} ${m},${a1} ${x0},${a1} Z`;
  };

  const ys = (side: typeof right) =>
    spread(
      side.map((s) => s.y + s.h / 2),
      PAD_T + 14,
      PAD_T + plotH - 14,
    );
  const rightY = ys(right);
  const leftY = ys(left);
  const maxChars = (px: number) => Math.max(6, Math.floor(px / 7.4));

  const saved = targets.find((t) => t.kind === "saved");
  const deficit = flow.sources.find((s) => s.kind === "deficit");
  const hubLabel = deficit ? "Gastos do mês" : "Entradas do mês";
  const hubValue = deficit ? flow.expense : flow.income;
  const dim = (key: string) => (hover !== null && hover !== key ? 0.35 : 1);

  const summary = [
    `Entradas ${formatAmount(flow.income, currency)}`,
    ...flow.sources.map((s) => `${s.label} ${formatAmount(s.value, currency)}`),
    `Gastos ${formatAmount(flow.expense, currency)}`,
    ...targets.filter((t) => t.kind !== "saved").map((t) => `${t.label} ${formatAmount(t.value, currency)}`),
    saved ? `Sobrou ${formatAmount(saved.value, currency)}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <div ref={ref} className={cn("w-full select-none", className)} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={summary} className="block overflow-visible">
          {/* O meio: tudo o que passou pelo mês. */}
          <text
            x={wide ? hubX + NODE_W / 2 : 0}
            y={PAD_T - 26}
            textAnchor={wide ? "middle" : "start"}
            className="fill-subtle text-[12px]"
          >
            {hubLabel}
          </text>
          <text
            x={wide ? hubX + NODE_W / 2 : 0}
            y={PAD_T - 9}
            textAnchor={wide ? "middle" : "start"}
            className="fill-foreground text-[14px] font-semibold tabular-nums"
          >
            {formatAmount(hubValue, currency)}
          </text>

          {left.map(({ n, y, h, hubY: hy }) => {
            const c = paint(n);
            return (
              <path
                key={`b-${n.key}`}
                d={band(srcX + NODE_W, y, y + h, hubX, hy, hy + h)}
                fill={c.band}
                fillOpacity={hover === n.key ? c.opacity + 0.2 : c.opacity * dim(n.key)}
                onMouseEnter={() => setHover(n.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {right.map(({ n, y, h, hubY: hy }) => {
            const c = paint(n);
            return (
              <path
                key={`b-${n.key}`}
                d={band(hubX + NODE_W, hy, hy + h, tgtX, y, y + h)}
                fill={c.band}
                fillOpacity={hover === n.key ? c.opacity + 0.2 : c.opacity * dim(n.key)}
                onMouseEnter={() => setHover(n.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          <rect x={hubX} y={hubY} width={NODE_W} height={hubH} rx={2} fill="hsl(var(--foreground))" />
          {[...left.map((s) => ({ ...s, x: srcX })), ...right.map((s) => ({ ...s, x: tgtX }))].map(({ n, y, h, x }) => (
            <rect
              key={`n-${n.key}`}
              x={x}
              y={y}
              width={NODE_W}
              height={Math.max(2, h)}
              rx={2}
              fill={paint(n).node}
              opacity={dim(n.key)}
            />
          ))}

          {right.map(({ n }, i) => (
            <g
              key={`l-${n.key}`}
              opacity={dim(n.key)}
              onMouseEnter={() => setHover(n.key)}
              onMouseLeave={() => setHover(null)}
            >
              <text
                x={tgtX + NODE_W + 10}
                y={rightY[i] - 3}
                className={cn(
                  "text-[13px]",
                  n.kind === "saved" ? "fill-success font-semibold" : "fill-foreground font-medium",
                )}
              >
                <title>{n.label}</title>
                {clip(n.label, maxChars(labelR - 14))}
              </text>
              <text x={tgtX + NODE_W + 10} y={rightY[i] + 13} className="fill-subtle text-[12px] tabular-nums">
                {formatAmount(n.value, currency)} · {pct(n.share)}
                {n.kind === "rest" ? ` · ${n.count} ${n.count === 1 ? "compra" : "compras"}` : ""}
              </text>
            </g>
          ))}
          {left.map(({ n }, i) => (
            <g
              key={`l-${n.key}`}
              opacity={dim(n.key)}
              onMouseEnter={() => setHover(n.key)}
              onMouseLeave={() => setHover(null)}
            >
              <text
                x={srcX - 10}
                y={leftY[i] - 3}
                textAnchor="end"
                className={cn("text-[13px] font-medium", n.kind === "deficit" ? "fill-warning" : "fill-foreground")}
              >
                <title>{n.label}</title>
                {clip(n.label, maxChars(labelL - 14))}
              </text>
              <text x={srcX - 10} y={leftY[i] + 13} textAnchor="end" className="fill-subtle text-[12px] tabular-nums">
                {formatAmount(n.value, currency)}
              </text>
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
