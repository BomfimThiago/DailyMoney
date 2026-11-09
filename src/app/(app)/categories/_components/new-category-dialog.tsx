"use client";

import * as React from "react";
import { useCreateCategory, type Category } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryColorChoice, CategoryIconChoice } from "./choice-grid";
import { firstUnusedColor } from "./palette";

type Kind = Category["kind"];

export const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "EXPENSE", label: "Gastos" },
  { value: "INCOME", label: "Entradas" },
  { value: "TRANSFER", label: "Movimentações" },
];

/** "categoria de gasto", "de entrada", "de movimentação". */
export const KIND_NOUN: Record<Kind, string> = { EXPENSE: "gasto", INCOME: "entrada", TRANSFER: "movimentação" };

const DEFAULT_ICON: Record<Kind, string> = { EXPENSE: "shopping-bag", INCOME: "wallet", TRANSFER: "transfer" };

/** Formulário de nova categoria (nome, tipo, ícone, cor). Fecha e devolve a criada. */
export function NewCategoryDialog({
  open,
  onOpenChange,
  defaultKind,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: Kind;
  existing: Category[];
  onCreated: (category: Category) => void;
}) {
  const create = useCreateCategory();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [icon, setIcon] = React.useState(DEFAULT_ICON[defaultKind]);
  const [color, setColor] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  // Reinicia o formulário a cada abertura.
  React.useEffect(() => {
    if (!open) return;
    setName("");
    setKind(defaultKind);
    setIcon(DEFAULT_ICON[defaultKind]);
    setColor(firstUnusedColor(existing.filter((c) => c.kind === defaultKind).map((c) => c.color)));
    setSubmitted(false);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [open]);

  const trimmed = name.trim();
  const duplicate = existing.some((c) => c.kind === kind && c.name.trim().toLowerCase() === trimmed.toLowerCase());
  const nameError = !submitted
    ? undefined
    : !trimmed
      ? "Dê um nome à categoria."
      : duplicate
        ? `Já existe uma categoria de ${KIND_NOUN[kind]} com esse nome.`
        : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!trimmed || duplicate) return;
    create.mutate(
      { name: trimmed, kind, color, icon },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          onCreated(data.category);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>
              Aparece na revisão e no resumo. A IA passa a sugerir a categoria quando você a usar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <Field label="Nome" htmlFor="new-category-name" error={nameError}>
              <Input
                id="new-category-name"
                autoFocus
                autoComplete="off"
                placeholder="ex.: Pets"
                value={name}
                invalid={!!nameError}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Tipo">
              <Segmented
                aria-label="Tipo da categoria"
                className="self-start"
                options={KIND_OPTIONS}
                value={kind}
                onValueChange={(k) => {
                  setKind(k);
                  if (icon === DEFAULT_ICON[kind]) setIcon(DEFAULT_ICON[k]);
                }}
              />
            </Field>

            <Field label="Ícone">
              <CategoryIconChoice name={trimmed || "Nova categoria"} color={color} value={icon} onChange={setIcon} />
            </Field>

            <Field label="Cor">
              <CategoryColorChoice name={trimmed || "Nova categoria"} icon={icon} value={color} onChange={setColor} />
            </Field>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={create.isPending}>
              Criar categoria
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
