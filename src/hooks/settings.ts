"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/api-client";
import { normalizeStartDay, periodKeyOf, localIso } from "@/lib/period";
import { useApiMutation } from "./mutation";

export interface Settings {
  /** Dia em que o mês financeiro começa (1 = mês do calendário). */
  monthStartDay: number;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/api/settings"),
    staleTime: 5 * 60_000,
  });
}

/**
 * Dia em que o mês começa. `undefined` enquanto carrega (quem busca um mês espera, para não
 * pedir o período errado); se a configuração falhar, vale o mês do calendário.
 */
export function useMonthStartDay(): number | undefined {
  const s = useSettings();
  if (s.isError) return 1;
  return s.data ? normalizeStartDay(s.data.monthStartDay) : undefined;
}

/** O mês (financeiro) de hoje, como o 1º dia do mês que dá nome a ele. */
export function useCurrentMonth(today: Date = new Date()): Date {
  const sd = useMonthStartDay() ?? 1;
  const key = periodKeyOf(localIso(today), sd);
  return React.useMemo(() => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [key]);
}

export function useUpdateSettings() {
  return useApiMutation((v: Settings) => api.patch<Settings>("/api/settings", v), {
    // O "mês" de todas as telas muda: tudo que é por mês volta a buscar.
    invalidate: [["settings"], ["transactions"], ["summary"]],
    errorTitle: "Não deu para salvar o início do mês",
    success: (r) => ({
      title: r.monthStartDay === 1 ? "O mês agora segue o calendário" : `O mês agora começa no dia ${r.monthStartDay}`,
    }),
  });
}
