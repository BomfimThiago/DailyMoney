// Thin fetch wrapper. Always surfaces a human-readable message on failure so the
// UI can show it (req. 13/14). Auto-refreshes the access token once on 401.

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit & { retryOn401?: boolean }): Promise<T> {
  const retryOn401 = init?.retryOn401 ?? true;
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && retryOn401 && !path.startsWith("/api/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, { ...init, retryOn401: false });
  }

  const body = await parse(res);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.message ?? `Erro ${res.status}`, err?.code, err?.details);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: "DELETE", body: data ? JSON.stringify(data) : undefined }),
  upload: <T>(path: string, form: FormData) => apiFetch<T>(path, { method: "POST", body: form }),
};
