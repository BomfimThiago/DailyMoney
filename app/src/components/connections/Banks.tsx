import { Linking, Pressable, Text, View } from 'react-native';

import { Button, SectionTitle, ui } from '@/components/ui';
import type { Connect } from '@/lib/useConnect';
import type { ConnectionsOverview } from '@/lib/types';

import { ConnectionCard } from './ConnectionCard';
import { styles } from './styles';

// Brazilian banks are authorized in Meu Pluggy's own app, not from here.
const BRAZIL_BANKS = 'Nubank, Inter';

export function Banks({ data, connect }: { data: ConnectionsOverview; connect: Connect }) {
  const connected = new Set(data.connections.map((c) => c.bank));
  return (
    <>
      {data.connections.length > 0 ? (
        <>
          <SectionTitle>Bancos conectados</SectionTitle>
          <View style={styles.cards}>
            {data.connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                onReconnect={() => void connect.connect(c.bank)}
              />
            ))}
          </View>
        </>
      ) : null}
      <SectionTitle>Conectar um banco</SectionTitle>
      <View style={ui.rowList}>
        {data.european_banks.map((bank, i) => (
          <EuropeanBank
            key={bank}
            bank={bank}
            first={i === 0}
            connected={connected.has(bank)}
            connect={connect}
          />
        ))}
        {data.european_banks.length === 0 ? (
          <BankLine
            first
            title="Wise, Revolut, CaixaBank"
            sub="Europa, via Enable Banking"
            right={<Text style={styles.soon}>Falta configurar</Text>}
          />
        ) : null}
        <BrazilBanks ready={data.brazil_ready} />
      </View>
      {connect.error ? <Text style={styles.error}>{connect.error}</Text> : null}
    </>
  );
}

function BankLine({
  title,
  sub,
  right,
  first,
}: {
  title: string;
  sub: string;
  right: React.ReactNode;
  first?: boolean;
}) {
  return (
    <View style={[ui.row, first && ui.rowFirst, styles.line]}>
      <View style={ui.rowMain}>
        <Text style={ui.rowTitle}>{title}</Text>
        <Text style={ui.rowSub}>{sub}</Text>
      </View>
      {right}
    </View>
  );
}

function EuropeanBank({
  bank,
  first,
  connected,
  connect,
}: {
  bank: string;
  first: boolean;
  connected: boolean;
  connect: Connect;
}) {
  return (
    <BankLine
      first={first}
      title={bank}
      sub="Europa · autorização pelo próprio banco"
      right={
        connected ? (
          <Text style={styles.done}>Conectado</Text>
        ) : (
          <Button
            label="Conectar"
            busy={connect.opening === bank}
            disabled={connect.opening !== null}
            onPress={() => void connect.connect(bank)}
          />
        )
      }
    />
  );
}

function BrazilBanks({ ready }: { ready: boolean }) {
  if (!ready) {
    return (
      <BankLine
        title={BRAZIL_BANKS}
        sub="Brasil, via Meu Pluggy"
        right={<Text style={styles.soon}>Falta configurar</Text>}
      />
    );
  }
  return (
    <BankLine
      title={BRAZIL_BANKS}
      sub="Brasil · autorize no app Meu Pluggy; eles aparecem aqui sozinhos"
      right={
        <Pressable onPress={() => void Linking.openURL('https://meu.pluggy.ai')}>
          <Text style={styles.link}>Abrir Meu Pluggy</Text>
        </Pressable>
      }
    />
  );
}
