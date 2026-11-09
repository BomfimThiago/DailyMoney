"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { api } from "@/hooks/api-client";
import { useApiMutation } from "./mutation";
import type { BankAuthorizationResult, BankConnection, BankProviderName, EuropeanBank, SyncResult } from "./types";

const INVALIDATE = [["connections"], ["uploads"], ["transactions"], ["summary"], ["banks"], ["investments"]];

/** Bancos conectados. `providers`: quais serviços o servidor tem configurados. */
export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    queryFn: () =>
      api.get<{ providers: Record<BankProviderName, boolean>; connections: BankConnection[] }>("/api/connections"),
  });
}

/** Bancos europeus de um país (Enable Banking). Só busca com o país escolhido. */
export function useEuropeanBanks(country: string | null) {
  return useQuery({
    queryKey: ["european-banks", country],
    enabled: Boolean(country),
    staleTime: 60 * 60_000,
    queryFn: () =>
      api
        .get<{ banks: EuropeanBank[] }>(
          `/api/connections/enablebanking/banks?country=${encodeURIComponent(country ?? "")}`,
        )
        .then((d) => d.banks),
  });
}

/**
 * Leva o usuário à página do banco para autorizar (nova conexão ou "Autorizar de novo").
 * Sucesso = o navegador sai do app; ele volta em /connections/callback.
 */
export function useStartBankAuthorization() {
  return useApiMutation(
    (v: { country: string; bank: string; syncFrom?: string } | { connectionId: string }) =>
      api.post<{ url: string }>("/api/connections/enablebanking/start", v).then((d) => {
        window.location.assign(d.url);
        // Continua "carregando" enquanto o navegador troca de página (some ao voltar).
        return new Promise<typeof d>((resolve) => setTimeout(() => resolve(d), 10_000));
      }),
    { errorTitle: "Não deu para abrir a autorização do banco", success: () => null },
  );
}

/**
 * Volta do banco: grava a conexão com as contas autorizadas. O código do banco vale UMA
 * vez, então é uma leitura com chave (o código), não uma ação: a página pode montar duas
 * vezes (modo de desenvolvimento, voltar do histórico) sem pedir de novo nem perder o
 * resultado. `v` null = nada a concluir (o banco devolveu erro ou faltou o código).
 */
export function useFinishBankAuthorization(v: { code: string; state: string } | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ["bank-authorization", v?.code],
    enabled: Boolean(v),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { result } = await api.post<{ result: BankAuthorizationResult }>(
        "/api/connections/enablebanking/finish",
        v,
      );
      await qc.invalidateQueries({ queryKey: ["connections"] });
      return result;
    },
  });
  const announced = React.useRef(false);
  React.useEffect(() => {
    const r = q.data;
    if (!r || announced.current) return;
    announced.current = true;
    toast({
      variant: "success",
      title: r.renewed ? `${r.bank}: autorização renovada` : `${r.bank} conectado`,
      description: `${r.accounts} ${r.accounts === 1 ? "conta autorizada" : "contas autorizadas"}. Sincronize para trazer as transações.`,
    });
  }, [q.data, toast]);
  return q;
}

export function useCreateConnection() {
  return useApiMutation(
    (v: { itemId: string; bank: string; syncFrom?: string }) =>
      api.post<{ connection: BankConnection }>("/api/connections", v).then((d) => d.connection),
    {
      invalidate: [["connections"]],
      errorTitle: "Não deu para conectar o banco",
      success: (c) => ({ title: `${c.bank} conectado`, description: "Sincronize para trazer as transações." }),
    },
  );
}

export function useUpdateConnection() {
  return useApiMutation(
    (v: { id: string; bank?: string; syncFrom?: string }) =>
      api.patch<{ connection: BankConnection }>(`/api/connections/${v.id}`, { bank: v.bank, syncFrom: v.syncFrom }),
    {
      invalidate: [["connections"]],
      errorTitle: "Erro ao salvar a conexão",
      success: () => ({ title: "Conexão salva" }),
    },
  );
}

export function useDeleteConnection() {
  return useApiMutation((id: string) => api.del<{ ok: true; warning?: string }>(`/api/connections/${id}`), {
    invalidate: [["connections"], ["uploads"]],
    errorTitle: "Erro ao desconectar",
    success: (d) => ({
      title: "Banco desconectado",
      description: d?.warning ?? "As transações já confirmadas continuam no app.",
    }),
  });
}

/** Resumo de uma sincronização para o toast: o que entrou na revisão, o que já estava em dia. */
export function describeSync(r: SyncResult): { title: string; description?: string } {
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  const parts = r.accounts.map((a) => {
    switch (a.status) {
      case "review":
        return `${a.account}: ${
          [
            a.create ? n(a.create, "nova", "novas") : null,
            a.update ? n(a.update, "alterada", "alteradas") : null,
            a.remove ? n(a.remove, "removida no banco", "removidas no banco") : null,
            a.duplicate ? `${n(a.duplicate, "já estava", "já estavam")} em Transações` : null,
          ]
            .filter(Boolean)
            .join(", ") || "para revisar"
        }`;
      case "up-to-date":
        return a.duplicate
          ? `${a.account}: em dia (${n(a.duplicate, "já estava", "já estavam")} em Transações por extrato)`
          : `${a.account}: em dia`;
      case "pending-review":
        return `${a.account}: revisão anterior ainda aberta`;
      case "empty":
        return `${a.account}: nada no período`;
      case "failed":
        return `${a.account}: falhou (${a.message})`;
    }
  });
  const inv = r.investments;
  if (inv?.status === "failed") parts.push(`Investimentos: falhou (${inv.message})`);
  else if (inv && (inv.open || inv.errors.length)) {
    parts.push(
      `Investimentos: ${n(inv.open, "aberto", "abertos")}${inv.errors.length ? ` (${n(inv.errors.length, "ilegível", "ilegíveis")}: ${inv.errors.join("; ")})` : ""}`,
    );
  }
  const toReview = r.accounts.some((a) => a.status === "review" || a.status === "pending-review");
  return {
    title: toReview ? `${r.bank} sincronizado: revise as novidades` : `${r.bank} sincronizado`,
    description: parts.join(" · "),
  };
}

export function useSyncConnection() {
  return useApiMutation(
    (id: string) => api.post<{ result: SyncResult }>(`/api/connections/${id}/sync`).then((d) => d.result),
    {
      invalidate: INVALIDATE,
      invalidateOnError: true,
      errorTitle: "Erro ao sincronizar",
      success: (r) => describeSync(r),
    },
  );
}
