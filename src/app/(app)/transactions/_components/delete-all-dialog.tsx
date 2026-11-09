"use client";

import * as React from "react";
import { useDeleteAllTransactions, usePurgeOverview } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WORD = "APAGAR";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Confirma "Apagar todas as transações". Mostra o que vai junto e o que fica, e só libera
 * o botão depois que a pessoa digita APAGAR. O servidor confere o número mostrado aqui:
 * se mudou nesse meio-tempo, nada é apagado.
 */
export function DeleteAllDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const overview = usePurgeOverview(open);
  const del = useDeleteAllTransactions();
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const o = overview.data;
  const ready = typed.trim().toUpperCase() === WORD;

  return (
    <Dialog open={open} onOpenChange={(v) => !del.isPending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apagar todas as transações?</DialogTitle>
          <DialogDescription>
            De todos os períodos, não só as que estão na tela. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>

        {overview.isLoading ? (
          <div className="space-y-2" aria-busy aria-label="Contando transações">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : overview.isError ? (
          <Alert tone="danger" title="Não deu para contar o que seria apagado.">
            {overview.error.message}{" "}
            <Button variant="link" size="sm" onClick={() => overview.refetch()}>
              Tentar de novo
            </Button>
          </Alert>
        ) : o && o.transactions === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">Não há transações para apagar.</p>
        ) : o ? (
          <form
            id="delete-all-form"
            className="space-y-4 text-[13.5px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready || del.isPending) return;
              del.mutate(o.transactions, {
                onSuccess: () => onOpenChange(false),
                // Número mudou (409) ou outra falha: o toast explica; recontamos para a próxima.
                onError: () => overview.refetch(),
              });
            }}
          >
            <div className="space-y-2">
              <p>
                Vão embora <strong>{plural(o.transactions, "transação", "transações")}</strong>
                {o.imports
                  ? ` e ${plural(o.imports, "importação confirmada", "importações confirmadas")}, com os arquivos enviados`
                  : ""}
                .
              </p>
              <p className="text-muted-foreground">
                Ficam categorias, responsáveis e bancos conectados
                {o.openReviews
                  ? `, e ${plural(o.openReviews, "revisão aberta", "revisões abertas")} (as linhas dela${o.openReviews === 1 ? "" : "s"} passam a contar como novas)`
                  : ""}
                . Para trazer as transações de volta, importe os extratos de novo; banco conectado traz as dele na
                próxima sincronização, para revisar.
              </p>
            </div>
            <Field label={`Para confirmar, digite ${WORD}`}>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={WORD}
                disabled={del.isPending}
              />
            </Field>
          </form>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={del.isPending}>
              {o && o.transactions === 0 ? "Fechar" : "Cancelar"}
            </Button>
          </DialogClose>
          {o && o.transactions > 0 ? (
            <Button
              type="submit"
              form="delete-all-form"
              variant="destructive"
              disabled={!ready}
              loading={del.isPending}
            >
              Apagar {plural(o.transactions, "transação", "transações")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
