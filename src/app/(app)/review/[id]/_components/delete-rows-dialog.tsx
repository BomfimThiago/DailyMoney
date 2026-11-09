"use client";

import { useDeleteStaged, type StagedTransaction } from "@/hooks";
import { Money } from "@/components/finance/money";
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

/**
 * Confirma a exclusão de linhas da revisão (uma ou várias selecionadas). A linha não vai
 * para Transações; se ela já estava lá (reimportação), sai de lá ao confirmar.
 */
export function DeleteRowsDialog({
  rows,
  uploadId,
  open,
  onOpenChange,
  onDeleted,
}: {
  rows: StagedTransaction[];
  uploadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteStaged(uploadId);
  const one = rows.length === 1 ? rows[0] : null;
  const existing = rows.filter((r) => r.match === "SAME" || r.match === "UPDATE").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{one ? "Excluir esta linha?" : `Excluir ${rows.length} linhas?`}</DialogTitle>
          <DialogDescription>
            {one ? (
              <>
                “{one.merchantRaw ?? one.description}” (
                <Money
                  value={one.baseAmount}
                  currency={one.baseCurrency}
                  kind={one.isInternalTransfer ? "TRANSFER" : one.type}
                />
                ) não vai para Transações.
              </>
            ) : (
              "Elas não vão para Transações."
            )}{" "}
            {existing
              ? one
                ? "Ela já está em Transações e sai de lá quando você confirmar a importação."
                : `${existing} já ${existing === 1 ? "está" : "estão"} em Transações e ${existing === 1 ? "sai" : "saem"} de lá quando você confirmar a importação.`
              : "Para trazer de volta, envie o arquivo de novo."}
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
              del.mutate(
                rows.map((r) => r.id),
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    onDeleted?.();
                  },
                },
              )
            }
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
