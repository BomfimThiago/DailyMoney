"use client";

import * as React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CategoryIcon, CategoryPill, type CategoryLike } from "./category";

export interface PickerCategory extends CategoryLike {
  id: string;
  /** TRANSFER = movimentação (fora dos totais): aparece para gasto e para entrada. */
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
}

const GROUP = { EXPENSE: "Gastos", INCOME: "Entradas", TRANSFER: "Movimentações (fora dos totais)" } as const;
const ORDER = { EXPENSE: 0, INCOME: 1, TRANSFER: 2 } as const;

/**
 * Escolha de categoria (decisão: combobox com busca, grupos Gastos/Entradas/Movimentações).
 * Com `kind`, mostra as do tipo e as de movimentação: a saída para um investimento é um
 * "gasto" pelo sinal, mas a categoria certa dela é de movimentação.
 * `appearance="field"`: campo de formulário. `appearance="pill"`: a própria
 * pílula vira o gatilho (linhas da revisão e da tabela).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  kind,
  onCreate,
  suggested,
  appearance = "field",
  invalid,
  disabled,
  className,
  ...a11y
}: {
  categories: PickerCategory[];
  value: string | null | undefined;
  onChange: (categoryId: string) => void;
  /** Restringe a um tipo (ex.: transação de gasto só mostra gastos). */
  kind?: "EXPENSE" | "INCOME";
  /** Permite criar categoria a partir do texto buscado. */
  onCreate?: (name: string) => void;
  /** Valor atual é sugestão da IA ainda não aceita (só na aparência "pill"). */
  suggested?: boolean;
  appearance?: "field" | "pill";
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  /** Repassados pelo <Field> (rótulo e erro ligados ao gatilho). */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const options = React.useMemo<ComboboxOption[]>(
    () =>
      categories
        .filter((c) => !kind || c.kind === kind || c.kind === "TRANSFER")
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name, "pt-BR"))
        .map((c) => ({
          value: c.id,
          label: c.name,
          group: kind && c.kind === kind ? undefined : GROUP[c.kind],
          leading: <CategoryIcon category={c} size="sm" />,
        })),
    [categories, kind],
  );
  const selected = categories.find((c) => c.id === value) ?? null;

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onChange}
      {...a11y}
      label="Categoria"
      placeholder="Escolher categoria"
      searchPlaceholder="Buscar categoria…"
      emptyText="Nenhuma categoria encontrada"
      onCreate={onCreate}
      invalid={invalid}
      disabled={disabled}
      className={className}
      renderTrigger={
        appearance === "pill" ? () => <CategoryPill category={selected} suggested={suggested} interactive /> : undefined
      }
    />
  );
}
