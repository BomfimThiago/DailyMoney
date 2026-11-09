"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/hooks/api-client";
import { useToast } from "@/components/ui/toast";

/**
 * Mutation padrão do app: invalida as queries afetadas e SEMPRE mostra toast de
 * erro (regra: nenhuma falha silenciosa). Sucesso opcional via `success`.
 */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: {
    invalidate?: QueryKey[];
    /** Invalida também quando falha (o servidor gravou o erro, ex.: sincronização). */
    invalidateOnError?: boolean;
    errorTitle: string;
    success?: (data: TData, vars: TVars) => { title: string; description?: string } | null;
    onSuccess?: (data: TData, vars: TVars) => void;
  },
) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<TData, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      const msg = opts.success?.(data, vars);
      if (msg) toast({ ...msg, variant: "success" });
      opts.onSuccess?.(data, vars);
    },
    onError: (e) => {
      if (opts.invalidateOnError) for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      toast({ variant: "error", title: opts.errorTitle, description: e.message });
    },
  });
}
