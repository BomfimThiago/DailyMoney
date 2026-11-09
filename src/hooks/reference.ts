"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/api-client";
import { useApiMutation } from "./mutation";
import type { Category, Member } from "./types";

// --- Leitura -----------------------------------------------------------------

export function useBanks() {
  return useQuery({
    queryKey: ["banks"],
    queryFn: () => api.get<{ banks: string[] }>("/api/banks").then((d) => d.banks),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<{ members: Member[] }>("/api/members").then((d) => d.members),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ categories: Category[] }>("/api/categories").then((d) => d.categories),
  });
}

// --- Responsáveis ------------------------------------------------------------

export function useCreateMember() {
  return useApiMutation((v: { name: string; kind: Member["kind"]; color?: string }) => api.post("/api/members", v), {
    invalidate: [["members"]],
    errorTitle: "Erro ao adicionar responsável",
    success: (_d, v) => ({ title: `${v.name} adicionado` }),
  });
}

export function useUpdateMember() {
  return useApiMutation(
    (v: { id: string; name?: string; kind?: Member["kind"]; color?: string }) => {
      const { id, ...data } = v;
      return api.patch(`/api/members/${id}`, data);
    },
    { invalidate: [["members"], ["transactions"]], errorTitle: "Erro ao salvar responsável" },
  );
}

export function useDeleteMember() {
  return useApiMutation((id: string) => api.del(`/api/members/${id}`), {
    invalidate: [["members"], ["transactions"]],
    errorTitle: "Erro ao remover responsável",
    success: () => ({ title: "Responsável removido" }),
  });
}

// --- Categorias --------------------------------------------------------------

export function useCreateCategory() {
  return useApiMutation(
    (v: { name: string; kind: Category["kind"]; color?: string; icon?: string }) =>
      api.post<{ category: Category }>("/api/categories", v),
    {
      invalidate: [["categories"]],
      errorTitle: "Erro ao criar categoria",
      success: (_d, v) => ({ title: `Categoria “${v.name}” criada` }),
    },
  );
}

export function useUpdateCategory() {
  return useApiMutation(
    (v: { id: string; name?: string; color?: string; icon?: string | null }) => {
      const { id, ...data } = v;
      return api.patch(`/api/categories/${id}`, data);
    },
    { invalidate: [["categories"], ["transactions"]], errorTitle: "Erro ao salvar categoria" },
  );
}

/**
 * Troca o tipo da categoria (gasto, entrada, movimentação). Vale também para as transações
 * que já estão nela: movimentação sai dos totais, gasto/entrada volta.
 */
export function useSetCategoryKind() {
  return useApiMutation(
    (v: { id: string; kind: Category["kind"] }) =>
      api.patch<{ category: Category; moved: number }>(`/api/categories/${v.id}`, { kind: v.kind }),
    {
      invalidate: [["categories"], ["transactions"], ["summary"], ["staged"]],
      errorTitle: "Erro ao trocar o tipo da categoria",
      success: (d, v) => ({
        title: v.kind === "TRANSFER" ? "Agora é movimentação" : `Agora é ${v.kind === "EXPENSE" ? "gasto" : "entrada"}`,
        description: d?.moved
          ? `${d.moved} ${d.moved === 1 ? "transação" : "transações"} ${v.kind === "TRANSFER" ? "saíram dos totais" : "voltaram para os totais"}.`
          : undefined,
      }),
    },
  );
}

export function useDeleteCategory() {
  return useApiMutation((id: string) => api.del(`/api/categories/${id}`), {
    invalidate: [["categories"], ["transactions"]],
    errorTitle: "Erro ao remover categoria",
    success: () => ({ title: "Categoria removida" }),
  });
}
