"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "@/hooks/api-client";
import { useToast } from "@/components/ui/toast";
import { isUndecidedDuplicate } from "@/lib/ingest/cross-source";
import { useApiMutation } from "./mutation";
import type { CommitResult, ReimportPlan, StagedPatch, StagedTransaction, Upload } from "./types";

/** Importações do usuário. Atualiza sozinho enquanto alguma estiver sendo lida. */
export function useUploads() {
  return useQuery({
    queryKey: ["uploads"],
    queryFn: () => api.get<{ uploads: Upload[] }>("/api/uploads").then((d) => d.uploads),
    refetchInterval: (q) =>
      q.state.data?.some((u) => u.status === "PENDING" || u.status === "PARSING") ? 2500 : false,
  });
}

export function useUploadFile() {
  return useApiMutation(
    (v: { file: File; bank?: string }) => {
      const form = new FormData();
      form.append("file", v.file);
      if (v.bank) form.append("bank", v.bank);
      return api.upload<{ upload: Upload }>("/api/uploads", form);
    },
    {
      invalidate: [["uploads"], ["banks"]],
      errorTitle: "Erro ao importar arquivo",
      success: (d, v) =>
        d.upload.status === "FAILED"
          ? null // o erro aparece na própria linha da importação
          : { title: `${v.file.name} lido`, description: "Revise antes de confirmar." },
    },
  );
}

export function useReprocessUpload() {
  return useApiMutation((id: string) => api.post(`/api/uploads/${id}/reprocess`), {
    invalidate: [["uploads"]],
    errorTitle: "Erro ao reprocessar",
    success: () => ({ title: "Reprocessando arquivo" }),
  });
}

/**
 * Exclui uma importação. `withTransactions`: apaga também as transações que ela
 * gravou; sem isso, elas ficam em Transações (só perdem o vínculo com o arquivo).
 */
export function useDeleteUpload() {
  return useApiMutation(
    (v: { id: string; withTransactions: boolean }) =>
      api.del<{ ok: true; removedTransactions: number; warning?: string }>(
        `/api/uploads/${v.id}${v.withTransactions ? "?transactions=delete" : ""}`,
      ),
    {
      // Banco conectado mostra "N para revisar" a partir das importações abertas.
      invalidate: [["uploads"], ["transactions"], ["summary"], ["connections"], ["staged"]],
      errorTitle: "Erro ao excluir importação",
      success: (d) => ({
        title: d?.removedTransactions
          ? `Importação e ${d.removedTransactions} ${d.removedTransactions === 1 ? "transação excluídas" : "transações excluídas"}`
          : "Importação excluída",
        description: d?.warning,
      }),
    },
  );
}

// --- Revisão -----------------------------------------------------------------

export function useStaged(uploadId: string) {
  return useQuery({
    queryKey: ["staged", uploadId],
    queryFn: () =>
      api.get<{ upload: Upload; staged: StagedTransaction[]; plan: ReimportPlan | null }>(
        `/api/uploads/${uploadId}/staged`,
      ),
    // Enquanto o arquivo ainda está sendo lido, atualiza sozinho.
    refetchInterval: (q) => {
      const st = q.state.data?.upload.status;
      return st === "PENDING" || st === "PARSING" ? 2500 : false;
    },
  });
}

type StagedData = { upload: Upload; staged: StagedTransaction[]; plan: ReimportPlan | null };

/** Edita uma linha da revisão com atualização otimista (volta atrás se falhar). */
export function usePatchStaged(uploadId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["staged", uploadId];
  return useMutation<unknown, ApiError, { id: string; data: StagedPatch }, { prev?: StagedData }>({
    mutationFn: (v) => api.patch(`/api/staged/${v.id}`, v.data),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StagedData>(key);
      if (prev) {
        qc.setQueryData<StagedData>(key, {
          ...prev,
          // Mesma regra do servidor: a pergunta "é a mesma?" só se responde com `match`.
          staged: prev.staged.map((s) =>
            s.id === v.id ? { ...s, ...v.data, needsReview: v.data.match === undefined && isUndecidedDuplicate(s) } : s,
          ),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ variant: "error", title: "Erro ao editar linha", description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Exclui linhas da revisão (não vão para Transações). Some da tela na hora; se alguma
 * falhar, volta e o erro aparece. O plano de reimportação é recalculado depois.
 */
export function useDeleteStaged(uploadId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["staged", uploadId];
  return useMutation<number, ApiError, string[], { prev?: StagedData }>({
    mutationKey: ["staged-delete", uploadId],
    mutationFn: async (ids) => {
      const results = await Promise.allSettled(ids.map((id) => api.del(`/api/staged/${id}`)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed.length) throw failed[0].reason as ApiError;
      return ids.length;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StagedData>(key);
      if (prev) qc.setQueryData<StagedData>(key, { ...prev, staged: prev.staged.filter((s) => !ids.includes(s.id)) });
      return { prev };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ variant: "error", title: "Erro ao excluir linha", description: e.message });
    },
    onSuccess: (n) =>
      toast({ title: n === 1 ? "Linha excluída da importação" : `${n} linhas excluídas da importação` }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
}

/** Alguma exclusão de linha desta importação ainda em andamento (confirmar espera por ela). */
export function useDeletingStaged(uploadId: string): boolean {
  return useIsMutating({ mutationKey: ["staged-delete", uploadId] }) > 0;
}

export function useCommitUpload(uploadId: string) {
  return useApiMutation(
    (_: void) => api.post<{ result: CommitResult }>(`/api/uploads/${uploadId}/commit`).then((d) => d.result),
    {
      invalidate: [["uploads"], ["transactions"], ["summary"], ["staged", uploadId], ["banks"], ["connections"]],
      errorTitle: "Erro ao confirmar importação",
      success: (r) => {
        const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
        const reimport = r.updated + r.unchanged + r.removed > 0;
        return {
          title: reimport
            ? "Importação atualizada"
            : `${n(r.committed, "transação confirmada", "transações confirmadas")}`,
          description:
            [
              r.committed && reimport ? n(r.committed, "nova", "novas") : null,
              r.updated ? n(r.updated, "corrigida", "corrigidas") : null,
              r.unchanged ? n(r.unchanged, "igual", "iguais") : null,
              r.removed
                ? `${n(r.removed, "removida", "removidas")} (não ${r.removed === 1 ? "está" : "estão"} mais no arquivo)`
                : null,
              r.skippedDuplicates ? `${n(r.skippedDuplicates, "já estava", "já estavam")} em Transações` : null,
              r.failed.length ? n(r.failed.length, "falhou", "falharam") : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
        };
      },
    },
  );
}
