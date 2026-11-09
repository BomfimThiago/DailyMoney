"use client";

import * as React from "react";
import { FileText, Info, PenLine, Trash2 } from "lucide-react";
import { Decimal } from "@/lib/money";
import {
  useCreateCategory,
  useDeleteTransaction,
  useUpdateTransaction,
  type Category,
  type Currency,
  type Member,
  type Transaction,
  type TransactionPatch,
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
import { Eyebrow } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuTrigger,
  SelectMenuValue,
} from "@/components/ui/select-menu";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { CategoryIcon } from "@/components/finance/category";
import { CategoryPicker } from "@/components/finance/category-picker";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { MemberAvatar } from "@/components/finance/member";
import { Money } from "@/components/finance/money";
import {
  amountIn,
  amountToInput,
  CURRENCIES,
  dayKey,
  fullDayLabel,
  moneyKind,
  parseAmountInput,
  shortDate,
} from "./shared";

const NO_MEMBER = "__none__";

interface RefList<T> {
  data: T[];
  loading: boolean;
  error: unknown;
}

/** Painel lateral com o detalhe (valores nas 3 moedas, câmbio) e o formulário de edição. */
export function TransactionSheet({
  tx,
  onClose,
  categories,
  members,
}: {
  tx: Transaction | null;
  onClose: () => void;
  categories: RefList<Category>;
  members: RefList<Member>;
}) {
  return (
    <Sheet open={tx !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title="Detalhe da transação" aria-describedby={undefined}>
        {tx ? (
          <TransactionDetail key={tx.id} tx={tx} onClose={onClose} categories={categories} members={members} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function initialForm(tx: Transaction) {
  return {
    description: tx.description,
    date: dayKey(tx.date),
    // Tipo legado "TRANSFER" aparece como gasto/entrada pelo sinal (salvar converte).
    type: (tx.type === "TRANSFER"
      ? new Decimal(tx.baseAmount).isNegative()
        ? "EXPENSE"
        : "INCOME"
      : tx.type) as TxType,
    baseCurrency: tx.baseCurrency,
    amount: amountToInput(tx.baseAmount),
    categoryId: tx.categoryId,
    memberId: tx.memberId,
    isInternalTransfer: tx.isInternalTransfer,
  };
}

type Form = ReturnType<typeof initialForm>;

/** Taxa implícita "1 BASE = x MOEDA" (Decimal, 4 casas). Não é dinheiro, é razão. */
function impliedRate(tx: Transaction, to: Currency): string | null {
  const base = new Decimal(tx.baseAmount);
  if (base.isZero()) return null;
  return new Decimal(amountIn(tx, to)).div(base).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4).replace(".", ",");
}

function TransactionDetail({
  tx,
  onClose,
  categories,
  members,
}: {
  tx: Transaction;
  onClose: () => void;
  categories: RefList<Category>;
  members: RefList<Member>;
}) {
  const initial = React.useMemo(() => initialForm(tx), [tx]);
  const [form, setForm] = React.useState<Form>(initial);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const createCategory = useCreateCategory();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const categoryKind = form.type === "TRANSFER" ? undefined : form.type; // TRANSFER: só linhas legadas
  const parsedAmount =
    form.amount === initial.amount ? new Decimal(tx.baseAmount).abs() : parseAmountInput(form.amount);
  const amountError = parsedAmount ? undefined : "Valor inválido (ex.: 412,90)";
  const descriptionError = form.description.trim() ? undefined : "Informe uma descrição";

  function changeType(type: TxType) {
    setForm((f) => {
      const cat = categories.data.find((c) => c.id === f.categoryId);
      const keepCategory = !cat || type === "TRANSFER" || cat.kind === type || cat.kind === "TRANSFER";
      return { ...f, type, categoryId: keepCategory ? f.categoryId : null };
    });
  }

  function buildPatch(): TransactionPatch | null {
    if (!parsedAmount || descriptionError) return null;
    const p: TransactionPatch = {};
    if (form.description.trim() !== tx.description) p.description = form.description.trim();
    if (form.date !== initial.date) p.date = form.date;
    if (form.type !== tx.type) p.type = form.type;
    if (form.baseCurrency !== tx.baseCurrency) p.baseCurrency = form.baseCurrency;
    // Sinal pelo tipo: gasto negativo, entrada positiva.
    const negative = form.type === "EXPENSE";
    const signed = negative ? parsedAmount.negated() : parsedAmount;
    if (!signed.equals(new Decimal(tx.baseAmount))) p.baseAmount = signed.toString();
    if (form.categoryId !== tx.categoryId) p.categoryId = form.categoryId;
    if (form.memberId !== tx.memberId) p.memberId = form.memberId;
    if (form.isInternalTransfer !== tx.isInternalTransfer) p.isInternalTransfer = form.isInternalTransfer;
    return p;
  }

  const patch = buildPatch();
  const dirty = patch !== null && Object.keys(patch).length > 0;
  const invalid = Boolean(amountError || descriptionError);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!patch || !dirty) return;
    update.mutate({ id: tx.id, data: patch }, { onSuccess: onClose });
  }

  const fee = new Decimal(tx.feeAmount || "0");

  return (
    <>
      <form id="tx-edit" onSubmit={save} className="contents">
        <SheetBody>
          <div className="flex items-center gap-3.5">
            {tx.category ? (
              <CategoryIcon category={tx.category} size="lg" />
            ) : (
              <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-secondary text-subtle">
                <PenLine className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-display text-display-sm" title={tx.description}>
                {tx.description}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-meta text-subtle">
                {fullDayLabel(dayKey(tx.date))}
                {tx.bank ? <> · {tx.bank}</> : null}
                <CurrencyTag currency={tx.baseCurrency} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-muted px-5 pb-2 pt-4">
            <Eyebrow>Valor original</Eyebrow>
            <Money
              value={tx.baseAmount}
              currency={tx.baseCurrency}
              kind={moneyKind(tx)}
              size="display"
              align="left"
              className="mt-1"
            />
            <div className="mt-3 divide-y border-t">
              {CURRENCIES.map((c) => {
                const rate = c === tx.baseCurrency ? null : impliedRate(tx, c);
                return (
                  <div key={c} className="flex items-center justify-between gap-3 py-2.5 text-meta text-subtle">
                    <span className="flex items-center gap-2">
                      <CurrencyTag currency={c} />
                      {c === tx.baseCurrency ? "moeda original" : rate ? `1 ${tx.baseCurrency} = ${rate} ${c}` : null}
                    </span>
                    <Money value={amountIn(tx, c)} currency={c} kind={moneyKind(tx)} />
                  </div>
                );
              })}
              {!fee.isZero() ? (
                <div className="flex items-center justify-between gap-3 py-2.5 text-meta text-subtle">
                  <span>Tarifa</span>
                  <Money value={fee} currency={tx.baseCurrency} kind="EXPENSE" size="sm" />
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 py-2.5 text-[11.5px] text-subtle">
                <Info className="size-3.5 shrink-0" />
                {tx.fxRateDate
                  ? `Câmbio de ${shortDate(dayKey(tx.fxRateDate))}${tx.fxSource ? ` via ${tx.fxSource}` : ""}${
                      tx.manualFxOverride ? " · ajustado manualmente" : ""
                    }`
                  : "Sem câmbio registrado para esta transação"}
              </div>
            </div>
          </div>

          <Field label="Descrição" htmlFor="tx-description" error={descriptionError}>
            <Input
              id="tx-description"
              value={form.description}
              invalid={Boolean(descriptionError)}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Data" htmlFor="tx-date">
              <Input
                id="tx-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="Tipo" htmlFor="tx-type">
              <Select id="tx-type" value={form.type} onChange={(e) => changeType(e.target.value as TxType)}>
                <option value="EXPENSE">Gasto</option>
                <option value="INCOME">Entrada</option>
              </Select>
            </Field>
            <Field label="Valor" htmlFor="tx-amount" error={amountError}>
              <Input
                id="tx-amount"
                inputMode="decimal"
                autoComplete="off"
                value={form.amount}
                invalid={Boolean(amountError)}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            <Field label="Moeda" htmlFor="tx-currency">
              <Select
                id="tx-currency"
                value={form.baseCurrency}
                onChange={(e) => set("baseCurrency", e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Categoria" error={categories.error ? "Não deu para carregar as categorias" : undefined}>
              <CategoryPicker
                categories={categories.data}
                value={form.categoryId}
                kind={categoryKind}
                disabled={categories.loading || Boolean(categories.error) || form.type === "TRANSFER"}
                onChange={(id) => set("categoryId", id)}
                onCreate={
                  categoryKind
                    ? (name) =>
                        createCategory.mutate(
                          { name, kind: categoryKind },
                          { onSuccess: (d) => set("categoryId", d.category.id) },
                        )
                    : undefined
                }
              />
            </Field>
            <Field label="Responsável" error={members.error ? "Não deu para carregar os responsáveis" : undefined}>
              <SelectMenu
                value={form.memberId ?? NO_MEMBER}
                onValueChange={(v) => set("memberId", v === NO_MEMBER ? null : v)}
                disabled={members.loading || Boolean(members.error)}
              >
                <SelectMenuTrigger aria-label="Responsável">
                  <SelectMenuValue placeholder="Escolher" />
                </SelectMenuTrigger>
                <SelectMenuContent>
                  {members.data.map((m) => (
                    <SelectMenuItem key={m.id} value={m.id}>
                      <MemberAvatar member={m} size="xs" />
                      {m.name}
                    </SelectMenuItem>
                  ))}
                  {members.data.length > 0 ? <SelectMenuSeparator /> : null}
                  <SelectMenuItem value={NO_MEMBER}>Sem responsável</SelectMenuItem>
                </SelectMenuContent>
              </SelectMenu>
            </Field>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-[13px]">
            <span>
              <span className="font-medium">Transferência interna</span>
              <span className="block text-meta text-subtle">Entre suas contas; fica fora dos totais.</span>
            </span>
            <Switch
              checked={form.isInternalTransfer}
              onCheckedChange={(v) => set("isInternalTransfer", v)}
              aria-label="Transferência interna"
            />
          </label>

          <div className="space-y-2 text-[12.5px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="size-3.5 text-subtle" />
              {tx.uploadId ? "Importada de um extrato" : "Lançada manualmente"}
            </div>
            <p className="text-meta text-subtle">
              Ao mudar valor, moeda ou data, as 3 moedas são recalculadas pelo câmbio da data.
            </p>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Excluir
          </Button>
          <div className="flex items-center gap-2">
            <SheetClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </SheetClose>
            <Button type="submit" loading={update.isPending} disabled={!dirty || invalid}>
              Salvar alterações
            </Button>
          </div>
        </SheetFooter>
      </form>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir transação?</DialogTitle>
            <DialogDescription>
              “{tx.description}” será removida de vez, junto com os valores nas 3 moedas. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={del.isPending}
              onClick={() =>
                del.mutate(tx.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onClose();
                  },
                })
              }
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
