"use client";

import * as React from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useDeleteCategory, useSetCategoryKind, useUpdateCategory, type Category } from "@/hooks";
import { Segmented } from "@/components/ui/segmented";
import { KIND_NOUN } from "./new-category-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/finance/category";
import { CategoryColorChoice, CategoryIconChoice } from "./choice-grid";

/**
 * Painel da categoria selecionada: renomear, cor, ícone e excluir.
 * Monte com `key={category.id}` para zerar o estado local ao trocar de categoria.
 */
const KIND_CHOICES: { value: Category["kind"]; label: string }[] = [
  { value: "EXPENSE", label: "Gasto" },
  { value: "INCOME", label: "Entrada" },
  { value: "TRANSFER", label: "Movimentação" },
];

export function CategoryDetail({
  category,
  siblings,
  onDeleted,
}: {
  category: Category;
  /** Categorias do mesmo tipo (para validar nome repetido). */
  siblings: Category[];
  onDeleted: () => void;
}) {
  const update = useUpdateCategory();
  const setKind = useSetCategoryKind();
  const remove = useDeleteCategory();

  // Mostra a escolha na hora; volta ao valor do banco se a gravação falhar.
  const [draftColor, setDraftColor] = React.useState<string | null>(null);
  const [draftIcon, setDraftIcon] = React.useState<string | null>(null);
  React.useEffect(() => setDraftColor(null), [category.color]);
  React.useEffect(() => setDraftIcon(null), [category.icon]);
  const color = draftColor ?? category.color;
  const icon = draftIcon ?? category.icon;

  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const trimmed = name.trim();
  const duplicate = siblings.some((c) => c.id !== category.id && c.name.trim().toLowerCase() === trimmed.toLowerCase());
  const nameError = !trimmed
    ? "O nome não pode ficar vazio."
    : duplicate
      ? "Já existe uma categoria com esse nome."
      : undefined;

  const savingColor = update.isPending && update.variables?.color !== undefined;
  const savingIcon = update.isPending && update.variables?.icon !== undefined;
  const savingName = update.isPending && update.variables?.name !== undefined;

  function startEditing() {
    setName(category.name);
    setEditing(true);
  }

  function saveName() {
    if (nameError) return;
    if (trimmed === category.name) {
      setEditing(false);
      return;
    }
    update.mutate({ id: category.id, name: trimmed }, { onSuccess: () => setEditing(false) });
  }

  // A escolha aparece na hora; salvar espera a pessoa parar (setas do teclado passam por
  // várias opções, e cada uma seria um pedido). Nada é desativado no meio: o foco fica.
  // Pendente ao sair da tela: salva na hora em vez de perder a escolha.
  const pending = React.useRef<
    Partial<Record<"color" | "icon", { timer: ReturnType<typeof setTimeout>; run: () => void }>>
  >({});
  React.useEffect(() => {
    const p = pending.current;
    return () => {
      for (const job of Object.values(p)) {
        clearTimeout(job.timer);
        job.run();
      }
    };
  }, []);
  function saveSoon(field: "color" | "icon", value: string, undo: () => void) {
    if (pending.current[field]) clearTimeout(pending.current[field]!.timer);
    const run = () => {
      delete pending.current[field];
      update.mutate({ id: category.id, [field]: value }, { onError: undo });
    };
    pending.current[field] = { timer: setTimeout(run, 400), run };
  }

  function pickColor(next: string) {
    if (next === color.toLowerCase()) return;
    setDraftColor(next);
    saveSoon("color", next, () => setDraftColor(null));
  }

  function pickIcon(next: string) {
    if (next === icon) return;
    setDraftIcon(next);
    saveSoon("icon", next, () => setDraftIcon(null));
  }

  const kindLabel = KIND_NOUN[category.kind];
  const display = { name: category.name, color, icon };

  return (
    <Card>
      <CardContent className="space-y-6">
        {/* Cabeçalho: ícone grande, nome (renomeável), origem e ações */}
        <div className="flex flex-wrap items-start gap-4">
          <CategoryIcon category={display} size="lg" />
          {/* Base de 12rem: no celular, os botões descem para baixo do nome em vez de cortá-lo. */}
          <div className="min-w-0 flex-1 basis-48">
            {editing ? (
              <form
                className="flex flex-col gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
              >
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    aria-label="Nome da categoria"
                    className="max-w-xs"
                    value={name}
                    invalid={!!nameError}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditing(false);
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Salvar nome"
                    loading={savingName}
                    disabled={!!nameError}
                  >
                    {savingName ? null : <Check />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancelar"
                    onClick={() => setEditing(false)}
                  >
                    <X />
                  </Button>
                </div>
                {nameError ? (
                  <p role="alert" className="text-meta font-medium text-destructive">
                    {nameError}
                  </p>
                ) : null}
              </form>
            ) : (
              <h2 className="truncate font-display text-display-md">{category.name}</h2>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-subtle">
              {category.isDefault ? <Badge>Padrão</Badge> : <Badge variant="info">Personalizada</Badge>}
              <span>Categoria de {kindLabel}</span>
            </div>
          </div>
          {!editing ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={startEditing}>
                <Pencil />
                Renomear
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${category.name}`}
                title="Excluir"
                className="hover:bg-destructive-soft hover:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 />
              </Button>
            </div>
          ) : null}
        </div>

        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Label>Tipo</Label>
            {setKind.isPending ? <Spinner className="size-3.5" /> : null}
          </div>
          <Segmented
            aria-label="Tipo da categoria"
            options={KIND_CHOICES}
            value={setKind.isPending && setKind.variables ? setKind.variables.kind : category.kind}
            onValueChange={(kind) => kind !== category.kind && setKind.mutate({ id: category.id, kind })}
          />
          <p className="text-meta text-subtle">
            {category.kind === "TRANSFER"
              ? "Movimentação: dinheiro que só muda de lugar (entre contas suas, aplicação e resgate, pagamento de cartão). As transações desta categoria ficam fora de Gastos e Entradas."
              : "Trocar para movimentação tira desta categoria todas as transações dos totais, inclusive as que já estão aqui."}
          </p>
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Label>Cor</Label>
            {savingColor ? <Spinner className="size-3.5" /> : null}
          </div>
          <CategoryColorChoice name={category.name} icon={icon} value={color} onChange={pickColor} />
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Label>Ícone</Label>
            {savingIcon ? <Spinner className="size-3.5" /> : null}
          </div>
          <CategoryIconChoice name={category.name} color={color} value={icon ?? ""} onChange={pickIcon} />
        </section>

        <section className="space-y-2.5 border-t pt-5">
          <h3 className="font-display text-display-sm">Regras</h3>
          <Alert tone="info">
            Regras aprendidas aparecem aqui em breve. Por enquanto, o app já aprende quando você escolhe a categoria na
            revisão.
          </Alert>
        </section>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir “{category.name}”?</DialogTitle>
            <DialogDescription>
              As transações dessa categoria ficam sem categoria e as regras aprendidas para ela são apagadas.
              {category.isDefault ? " Esta é uma categoria padrão e não volta sozinha." : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(category.id, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    onDeleted();
                  },
                })
              }
            >
              Excluir categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
