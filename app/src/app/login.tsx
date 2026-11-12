import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

export default function LoginScreen() {
  const { state } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (state.status === 'signedIn') return <Redirect href="/" />;
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.brand}>Daily Money</Text>
        <Text style={styles.tagline}>
          Para onde vai o dinheiro da família, em real, dólar e euro.
        </Text>
        {sentTo ? (
          <LinkSent to={sentTo} onAgain={() => setSentTo(null)} />
        ) : (
          <EmailForm onSent={setSentTo} />
        )}
      </View>
    </View>
  );
}

function isEmail(text: string): boolean {
  return /^\S+@\S+\.\S+$/.test(text.trim());
}

function LinkSent({ to, onAgain }: { to: string; onAgain: () => void }) {
  return (
    <View style={styles.sent}>
      <Text style={styles.sentTitle}>Confira seu e-mail</Text>
      <Text style={styles.sentBody}>
        Se {to} tiver acesso, o link para entrar chega em instantes. Ele vale por 15 minutos.
      </Text>
      <Pressable onPress={onAgain} accessibilityRole="button">
        <Text style={styles.link}>Usar outro e-mail</Text>
      </Pressable>
    </View>
  );
}

function EmailForm({ onSent }: { onSent: (email: string) => void }) {
  const { requestLink } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = !isEmail(email) || busy;

  const submit = async () => {
    if (off) return;
    setBusy(true);
    setError(null);
    try {
      await requestLink(email.trim());
      onSent(email.trim());
    } catch (e) {
      setError(errorText(e, 'Não foi possível enviar o link'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>E-MAIL</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
        placeholder="voce@exemplo.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        style={styles.input}
        accessibilityLabel="E-mail"
      />
      <Pressable
        onPress={submit}
        disabled={off}
        accessibilityRole="button"
        style={[styles.button, off && styles.buttonDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.page} />
        ) : (
          <Text style={styles.buttonText}>Enviar link para entrar</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: { width: '100%', maxWidth: 360 },
  brand: { fontFamily: fonts.semibold, fontSize: 28, color: colors.ink, letterSpacing: -0.3 },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginTop: 8,
  },
  form: { marginTop: 40 },
  label: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { fontFamily: fonts.medium, fontSize: 15, color: colors.page },
  error: { fontFamily: fonts.regular, color: colors.danger, marginTop: 12 },
  sent: { marginTop: 40 },
  sentTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  sentBody: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginTop: 8,
  },
  link: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, marginTop: 20 },
});
