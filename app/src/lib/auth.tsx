import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, clearTokens, getRefreshToken, saveTokens } from './api';
import type { Me, TokenPair } from './types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; me: Me };

interface AuthContextValue {
  state: AuthState;
  requestLink: (email: string) => Promise<void>;
  signInWithLink: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    api<Me>('/auth/me')
      .then((me) => setState({ status: 'signedIn', me }))
      .catch(() => setState({ status: 'signedOut' }));
  }, []);

  const requestLink = useCallback(async (email: string) => {
    await api('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
  }, []);

  const signInWithLink = useCallback(async (token: string) => {
    const tokens = await api<TokenPair>('/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    await saveTokens(tokens);
    setState({ status: 'signedIn', me: await api<Me>('/auth/me') });
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => undefined);
    }
    await clearTokens();
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ state, requestLink, signInWithLink, signOut }),
    [state, requestLink, signInWithLink, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
