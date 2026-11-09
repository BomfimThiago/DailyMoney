"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Rodapé da lista paginada: quantas já aparecem e "Carregar mais" (50 por vez). */
export function LoadMore({
  shown,
  total,
  hasMore,
  loading,
  error,
  onLoadMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
  onLoadMore: () => void;
}) {
  if (!hasMore && !error) {
    // Lista completa: só diz isso quando houve mais de uma página.
    return total > shown || shown <= 50 ? null : (
      <p className="text-center text-meta text-subtle">Todas as {total} transações do período.</p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      {error ? (
        <Alert tone="danger" title="Não deu para carregar mais transações." className="w-full">
          {error.message}
        </Alert>
      ) : null}
      <p className="text-meta text-subtle" aria-live="polite">
        Mostrando {shown} de {total} transações. Os totais acima já consideram todas.
      </p>
      <Button variant="secondary" size="sm" loading={loading} onClick={onLoadMore}>
        {error ? "Tentar de novo" : "Carregar mais"}
      </Button>
    </div>
  );
}
