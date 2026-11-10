import { getItem, removeItem, setItem } from './storage';
import type { TokenPair } from './types';

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const ACCESS = 'dm.access';
const REFRESH = 'dm.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await setItem(ACCESS, tokens.access_token);
  await setItem(REFRESH, tokens.refresh_token);
}

export async function clearTokens(): Promise<void> {
  await removeItem(ACCESS);
  await removeItem(REFRESH);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH);
}

async function raw(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart boundary.
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    return await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor');
  }
}

async function refreshSession(): Promise<string | null> {
  const refreshToken = await getItem(REFRESH);
  if (!refreshToken) return null;
  const response = await raw(
    '/auth/refresh',
    { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
    null,
  );
  if (!response.ok) {
    await clearTokens();
    return null;
  }
  const tokens = (await response.json()) as TokenPair;
  await saveTokens(tokens);
  return tokens.access_token;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await raw(path, init, await getItem(ACCESS));
  // Access tokens last 15 minutes; one silent refresh keeps the session going.
  if (response.status === 401) {
    const fresh = await refreshSession();
    if (fresh) response = await raw(path, init, fresh);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(response.status, body?.detail ?? 'Algo deu errado. Tente de novo.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
