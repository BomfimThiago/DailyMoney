"use client";

import * as React from "react";
import { Check } from "lucide-react";
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
 * Barra escura fixa no rodapé da revisão. Confirma todas as linhas; se ainda
 * houver dúvidas, pede confirmação antes (elas entram como estão). "Possíveis
 * repetidas" sem resposta não entram nem saem sozinhas: o usuário decide antes.
 */
export function ConfirmBar({
  total,
  skipped = 0,
  pending,
  undecided = 0,
  loading,
  deciding = false,
  onConfirm,
  onDecideAll,
  onReviewUndecided,
}: {
  total: number;
  /** Já estão em Transações por outra fonte: não entram. */
  skipped?: number;
  pending: number;
  /** Possíveis repetidas ainda sem resposta (contam também em `pending`). */
  undecided?: number;
  loading: boolean;
  /** Respondendo às possíveis repetidas de uma vez. */
  deciding?: boolean;
  onConfirm: () => void;
  /** "São as mesmas" (DUPLICATE: não entram) ou "São novas" (NEW: entram). */
  onDecideAll?: (match: "NEW" | "DUPLICATE") => Promise<void> | void;
  onReviewUndecided?: () => void;
}) {
  const [asking, setAsking] = React.useState(false);
  const [askingDuplicates, setAskingDuplicates] = React.useState(false);
  const ready = total - pending;
  // Só repetidas: confirmar ainda fecha a importação (senão a sincronização fica esperando).
  const label = total ? `Confirmar ${total} ${total === 1 ? "transação" : "transações"}` : "Concluir sem novas";

  return (
    <div className="sticky bottom-20 z-30 mt-6 lg:bottom-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-foreground px-5 py-3.5 text-background shadow-overlay">
        <div className="min-w-0">
          <p className="text-[13.5px]">
            <span className="font-semibold">
              {ready} {ready === 1 ? "pronta" : "prontas"}
            </span>
            {pending ? <span className="text-background/70"> · {pending} ainda com dúvida</span> : null}
            {undecided ? (
              <span className="text-background/70">
                {" "}
                ({undecided} {undecided === 1 ? "pode ser repetida" : "podem ser repetidas"})
              </span>
            ) : null}
            {skipped ? <span className="text-background/70"> · {skipped} já em Transações, não entram</span> : null}
          </p>
          <p className="text-meta text-background/60">
            Ao confirmar, cada linha é convertida para EUR, USD e BRL pela taxa do dia da compra.
          </p>
        </div>
        <Button
          variant="inverse"
          loading={loading}
          disabled={total + skipped === 0}
          onClick={() => (undecided > 0 ? setAskingDuplicates(true) : pending > 0 ? setAsking(true) : onConfirm())}
        >
          {loading ? null : <Check />}
          {label}
        </Button>
      </div>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ainda há {pending} {pending === 1 ? "linha" : "linhas"} com dúvida
            </DialogTitle>
            <DialogDescription>
              Se confirmar agora, elas entram em Transações como estão (categoria e responsável sugeridos). Dá para
              corrigir depois em Transações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Revisar antes</Button>
            </DialogClose>
            <Button
              loading={loading}
              onClick={() => {
                setAsking(false);
                onConfirm();
              }}
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={askingDuplicates} onOpenChange={setAskingDuplicates}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {undecided} {undecided === 1 ? "linha pode já estar" : "linhas podem já estar"} em Transações
            </DialogTitle>
            <DialogDescription>
              O valor bate com {undecided === 1 ? "uma transação" : "transações"} de outra fonte no mesmo dia, mas o dia
              não fecha inteiro. Se forem as mesmas, não entram; se forem novas, entram. Dá para responder linha a linha
              na aba Precisam de revisão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={deciding}
              onClick={() => {
                setAskingDuplicates(false);
                onReviewUndecided?.();
              }}
            >
              Ver uma a uma
            </Button>
            {onDecideAll ? (
              <>
                <Button
                  variant="secondary"
                  loading={deciding}
                  onClick={async () => {
                    await onDecideAll("NEW");
                    setAskingDuplicates(false);
                  }}
                >
                  Todas são novas
                </Button>
                <Button
                  loading={deciding}
                  onClick={async () => {
                    await onDecideAll("DUPLICATE");
                    setAskingDuplicates(false);
                  }}
                >
                  Todas são as mesmas
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
