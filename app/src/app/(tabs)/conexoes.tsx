import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Accounts } from '@/components/connections/Accounts';
import { Banks } from '@/components/connections/Banks';
import { styles } from '@/components/connections/styles';
import { Loadable, SignedIn } from '@/components/states';
import { SectionTitle } from '@/components/ui';
import { automaticAccounts } from '@/lib/connections';
import { WIDE_MIN } from '@/lib/dashboard';
import { useConnections } from '@/lib/queries';
import { useConnect } from '@/lib/useConnect';

// Conexões: the banks read automatically every morning, the banks that can still be
// connected, and every account the app follows with how its data arrives.
export default function ConnectionsScreen() {
  return (
    <SignedIn>
      <Connections />
    </SignedIn>
  );
}

function Connections() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const overview = useConnections(true);
  const connect = useConnect();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={wide ? styles.wideContent : styles.content}
    >
      <View style={styles.column}>
        {wide ? null : (
          <Link href="/" style={styles.back}>
            ‹ Início
          </Link>
        )}
        <Text style={[styles.title, wide && styles.wideTitle]}>Conexões</Text>
        <Text style={styles.lead}>
          Bancos conectados mandam as transações sozinhos, todo dia às 6h. As outras contas são
          atualizadas pelos extratos que você envia.
        </Text>
        <Loadable
          isError={overview.isError}
          loading={!overview.data}
          value={overview.data}
          empty=""
          error="Não consegui carregar as conexões."
          textStyle={[styles.muted, styles.gap]}
        >
          {(data) => <Banks data={data} connect={connect} />}
        </Loadable>
        <SectionTitle>Suas contas</SectionTitle>
        <Accounts automatic={automaticAccounts(overview.data?.connections ?? [])} />
      </View>
    </ScrollView>
  );
}
