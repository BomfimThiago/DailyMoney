"use client";

import { useMutation } from "@tanstack/react-query";
import { api, type ApiError } from "@/hooks/api-client";
import { useApiMutation } from "./mutation";

// Login/cadastro mostram o erro no próprio formulário (Alert), não em toast,
// por isso usam useMutation direto e expõem `error`.

export function useLogin() {
  return useMutation<unknown, ApiError, { email: string; password: string }>({
    mutationFn: (v) => api.post("/api/auth/login", v),
  });
}

export function useRegister() {
  return useMutation<unknown, ApiError, { email: string; password: string; name?: string }>({
    mutationFn: (v) => api.post("/api/auth/register", v),
  });
}

export function useForgotPassword() {
  return useMutation<unknown, ApiError, { email: string }>({
    mutationFn: (v) => api.post("/api/auth/forgot", v),
  });
}

export function useResetPassword() {
  return useMutation<unknown, ApiError, { token: string; password: string }>({
    mutationFn: (v) => api.post("/api/auth/reset", v),
  });
}

export function useChangePassword() {
  return useApiMutation(
    (v: { currentPassword: string; newPassword: string }) => api.post("/api/auth/change-password", v),
    { errorTitle: "Erro ao trocar a senha", success: () => ({ title: "Senha alterada" }) },
  );
}

export function useLogout() {
  return useMutation({ mutationFn: () => api.post("/api/auth/logout") });
}
