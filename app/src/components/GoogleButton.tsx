import { Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

// Native Google sign-in needs a development build (not Expo Go); it arrives with the phone app.
export function GoogleButton(_: { onIdToken: (idToken: string) => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, textAlign: 'center' }}>
        Por enquanto, entre pelo navegador.
      </Text>
    </View>
  );
}
