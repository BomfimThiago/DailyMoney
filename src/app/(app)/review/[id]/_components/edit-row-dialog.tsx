"use client";

import * as React from "react";
import { Decimal, parseMoneyInput } from "@/lib/money";
import {
  usePatchStaged,
  type Category,
  type Currency,
  type StagedPatch,
  type StagedTransaction,
  type TxType,
} from "@/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";

const TYPES: { value: TxType; label: string }[] = [
  { value: "EXPENSE", label: "Gasto" },
  { value: "INCOME", label: "Entrada" },
];
const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
  { value: "BRL", label: "BRL" },
];

/** "-12.4500" → "-12,45": mesmo formato pt-BR do resto do app (Decimal, sem float). */
const toInput = (v: string) => {
  const d = new Decimal(v);
  return `${d.isNegative() ? "-" : ""}${d.abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).replace(".", ",")}`;
};

/**
 * Correções menos comuns de uma linha (data, descrição, tipo, valor, moeda) —
 * quando a leitura errou. Categoria/responsável/interna ficam na própria linha.
 */
export function EditRowDialog({
  row,
  uploadId,
  categories,
  open,
  onOpenChange,
}: {
  row: StagedTransaction;
  uploadId: string;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* O formulário monta ao abrir: começa sempre dos valores atuais da linha. */}
        <EditRowForm row={row} uploadId={uploadId} categories={categories} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditRowForm({
  row,
  uploadId,
  categories,
  onDone,
}: {
  row: StagedTransaction;
  uploadId: string;
  categories: Category[];
  onDone: () => void;
}) {
  const patch = usePatchStaged(uploadId);
  const [initial] = React.useState(() => ({
    date: row.date.slice(0, 10),
    description: row.description,
    // Tipo legado "TRANSFER" aparece como gasto/entrada pelo sinal (salvar converte).
    type: (row.type === "TRANSFER"
      ? new Decimal(row.baseAmount).isNegative()
        ? "EXPENSE"
        : "INCOME"
      : row.type) as TxType,
    amount: toInput(row.baseAmount),
    currency: row.baseCurrency,
  }));
  const [form, setForm] = React.useState(initial);

  // "1.500" é mil e quinhentos; o servidor recebe sempre o decimal canônico ("1500").
  const amount = form.amount === initial.amount ? new Decimal(row.baseAmount) : parseMoneyInput(form.amount);
  const amountError = amount ? undefined : "Use número com sinal: ex. -45,00 ou 1.234,56";
  const descriptionError = form.description.trim() ? undefined : "Descrição não pode ficar vazia";
  const dateError = form.date ? undefined : "Informe a data";
  const invalid = Boolean(amountError || descriptionError || dateError);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const data: StagedPatch = {};
    if (form.date !== initial.date) data.date = form.date;
    if (form.description.trim() !== initial.description) data.description = form.description.trim();
    if (form.type !== initial.type) {
      data.type = form.type;
      // Categoria de outro tipo (gasto ↔ entrada) deixa de valer.
      const cat = categories.find((c) => c.id === row.categoryId);
      if (cat && cat.kind !== form.type && cat.kind !== "TRANSFER") data.categoryId = null;
    }
    if (amount && !amount.equals(new Decimal(row.baseAmount))) data.baseAmount = amount.toString();
    if (form.currency !== initial.currency) data.baseCurrency = form.currency;
    if (Object.keys(data).length === 0) {
      onDone();
      return;
    }
    patch.mutate({ id: row.id, data }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Corrigir linha</DialogTitle>
        <DialogDescription className="font-mono text-[12.5px]">{row.merchantRaw ?? row.description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3">
          <Field label="Data" htmlFor="edit-date" error={dateError}>
            <Input
              id="edit-date"
              type="date"
              value={form.date}
              invalid={Boolean(dateError)}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label="Descrição" htmlFor="edit-description" error={descriptionError}>
            <Input
              id="edit-description"
              value={form.description}
              invalid={Boolean(descriptionError)}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Tipo">
          <Segmented
            aria-label="Tipo"
            options={TYPES}
            value={form.type}
            onValueChange={(type) => setForm((f) => ({ ...f, type }))}
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <Field label="Valor" htmlFor="edit-amount" error={amountError} hint="Gasto negativo, entrada positiva.">
            <Input
              id="edit-amount"
              inputMode="decimal"
              className="tabular-nums"
              value={form.amount}
              invalid={Boolean(amountError)}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          <Field label="Moeda">
            <Segmented
              aria-label="Moeda"
              options={CURRENCIES}
              value={form.currency}
              onValueChange={(currency) => setForm((f) => ({ ...f, currency }))}
            />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" loading={patch.isPending} disabled={invalid}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}
