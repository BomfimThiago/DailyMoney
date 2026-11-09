"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/api-client";
import type { InvestmentsResponse } from "./types";

/** Investimentos abertos dos bancos conectados (atualizados a cada sincronização). */
export function useInvestments() {
  return useQuery({
    queryKey: ["investments"],
    queryFn: () => api.get<InvestmentsResponse>("/api/investments"),
  });
}
