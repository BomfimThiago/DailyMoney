import { Text, View } from 'react-native';

import { Button, SectionTitle, ui } from '@/components/ui';
import { BRAZIL, type Connect } from '@/lib/useConnect';
import type { ConnectionsOverview } from '@/lib/types';

import { ConnectionCard } from './ConnectionCard';
import { styles } from './styles';

// Brazilian banks are authorized on Meu Pluggy's page, where the person picks the bank.
const BRAZIL_BANKS = 'Nubank, Inter e outros';

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
                onReconnect={() => void connect.reconnect(c)}
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
        <BrazilBanks ready={data.brazil_ready} connect={connect} />
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
          <ConnectButton line={bank} connect={connect} />
        )
      }
    />
  );
}

function ConnectButton({ line, connect }: { line: string; connect: Connect }) {
  return (
    <Button
      label="Conectar"
      busy={connect.opening === line}
      disabled={connect.opening !== null}
      onPress={() => void connect.connect(line)}
    />
  );
}

function BrazilBanks({ ready, connect }: { ready: boolean; connect: Connect }) {
  return (
    <BankLine
      title={BRAZIL_BANKS}
      sub={ready ? 'Brasil · pelo Meu Pluggy, um banco por vez' : 'Brasil, via Meu Pluggy'}
      right={
        ready ? (
          <ConnectButton line={BRAZIL} connect={connect} />
        ) : (
          <Text style={styles.soon}>Falta configurar</Text>
        )
      }
    />
  );
}
