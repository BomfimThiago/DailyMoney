"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/finance/category";
import { COLOR_PALETTE, colorLabel } from "./palette";

/**
 * Grade de escolha exclusiva (radiogroup) em que cada opção é desenhada por um
 * componente do sistema (CategoryIcon / MemberAvatar), que aplica a cor do dado.
 * Composta aqui porque não há um "swatch picker" em @/components/ui.
 */
export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  render,
  disabled,
  shape = "square",
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T) => React.ReactNode;
  disabled?: boolean;
  shape?: "square" | "round";
  "aria-label": string;
}) {
  // Grupo de rádio: um Tab só (na escolhida), setas mudam a escolha (WCAG / padrão ARIA).
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? options.length - 1
          : step
            ? (i + step + options.length) % options.length
            : null;
    if (to === null) return;
    e.preventDefault();
    onChange(options[to].value);
    refs.current[to]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            title={o.label}
            disabled={disabled}
            tabIndex={i === current ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              // Foco: contorno escuro por fora do anel de "escolhida" (os dois juntos continuam distinguíveis).
              "grid place-items-center p-0.5 ring-offset-2 ring-offset-card transition-shadow hover:ring-2 hover:ring-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60",
              shape === "round" ? "rounded-full" : "rounded-[10px]",
              selected && "ring-2 ring-primary hover:ring-primary",
            )}
          >
            {render(o.value)}
          </button>
        );
      })}
    </div>
  );
}

/** Opções de cor: a paleta + a cor atual, se ela não estiver na paleta. */
export function colorOptions(current?: string): { value: string; label: string }[] {
  const opts = COLOR_PALETTE.map((c) => ({ value: c.value, label: c.label }));
  if (current && !opts.some((o) => o.value === current.toLowerCase())) {
    opts.unshift({ value: current.toLowerCase(), label: colorLabel(current) });
  }
  return opts;
}

const ICON_LABELS: Record<string, string> = {
  "shopping-cart": "Carrinho",
  utensils: "Talheres",
  car: "Carro",
  home: "Casa",
  "file-text": "Documento",
  "heart-pulse": "Saúde",
  "graduation-cap": "Formatura",
  "shopping-bag": "Sacola",
  repeat: "Recorrente",
  "gamepad-2": "Jogos",
  plane: "Avião",
  landmark: "Banco",
  "circle-ellipsis": "Outros",
  wallet: "Carteira",
  briefcase: "Maleta",
  "undo-2": "Devolução",
  "trending-up": "Investimento",
  gift: "Presente",
  "circle-plus": "Mais",
  transfer: "Transferência",
};

export const ICON_OPTIONS = Object.keys(CATEGORY_ICONS).map((key) => ({
  value: key,
  label: ICON_LABELS[key] ?? key,
}));

/** Escolha de cor de categoria: cada amostra é o próprio ícone da categoria naquela cor. */
export function CategoryColorChoice({
  name,
  icon,
  value,
  onChange,
  disabled,
}: {
  name: string;
  icon: string | null;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <ChoiceGrid
      aria-label="Cor"
      options={colorOptions(value)}
      value={value.toLowerCase()}
      onChange={onChange}
      disabled={disabled}
      render={(color) => <CategoryIcon category={{ name, color, icon }} />}
    />
  );
}

/** Escolha de ícone de categoria, já tingido com a cor escolhida. */
export function CategoryIconChoice({
  name,
  color,
  value,
  onChange,
  disabled,
}: {
  name: string;
  color: string;
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}) {
  return (
    <ChoiceGrid
      aria-label="Ícone"
      options={ICON_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      render={(icon) => <CategoryIcon category={{ name, color, icon }} />}
    />
  );
}
