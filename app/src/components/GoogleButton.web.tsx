import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('google script failed')));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function GoogleButton({ onIdToken }: { onIdToken: (idToken: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setError('Login do Google ainda não configurado');
      return;
    }
    let cancelled = false;
    loadScript()
      .then(() => {
        const google = window.google;
        const element = container.current;
        if (cancelled || !google || !element) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onIdToken(response.credential),
        });
        google.accounts.id.renderButton(element, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          locale: 'pt-BR',
          width: 280,
        });
      })
      .catch(() => setError('Não foi possível carregar o login do Google'));
    return () => {
      cancelled = true;
    };
  }, [clientId, onIdToken]);

  return (
    <View style={{ alignItems: 'center', minHeight: 44 }}>
      <div ref={container} />
      {error ? (
        <Text style={{ color: colors.danger, fontFamily: fonts.regular, marginTop: 8 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
