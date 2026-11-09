import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

// Placeholder until the Início screen from the mockups is built.
export default function HomeScreen() {
  const { state, signOut } = useAuth();

  if (state.status === 'loading') {
    return (
      <View style={styles.page}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const { me } = state;
  return (
    <View style={styles.page}>
      <Text style={styles.label}>{me.family.name.toUpperCase()}</Text>
      <Text style={styles.title}>Olá, {me.name.split(' ')[0]}</Text>
      <Text style={styles.body}>
        {me.family.members.length === 1
          ? 'Por enquanto a família é só você.'
          : `${me.family.members.length} pessoas na família.`}
      </Text>
      <Pressable onPress={signOut} style={styles.link} accessibilityRole="button">
        <Text style={styles.linkText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  title: { fontFamily: fonts.semibold, fontSize: 26, color: colors.ink, marginTop: 8 },
  body: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, marginTop: 8 },
  link: { marginTop: 32, paddingVertical: 8, paddingHorizontal: 16 },
  linkText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});
