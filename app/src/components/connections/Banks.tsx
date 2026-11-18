import { useState } from 'react';
import { Text, View } from 'react-native';

import { DotSelect } from '@/components/DotSelect';
import { Button, SectionTitle, ui } from '@/components/ui';
import { suggestedOwner } from '@/lib/connections';
import { memberIdOf, ownerOptions } from '@/lib/people';
import { BRAZIL, type Connect } from '@/lib/useConnect';
import type { Connection, ConnectionsOverview, Member } from '@/lib/types';

import { ConnectionCard } from './ConnectionCard';
import { styles } from './styles';

// Brazilian banks are authorized on Meu Pluggy's page, where the person picks the bank.
const BRAZIL_BANKS = 'Nubank, Inter e outros';

export function Banks({
  data,
  members,
  connect,
}: {
  data: ConnectionsOverview;
  members: Member[];
  connect: Connect;
}) {
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
            connections={data.connections}
            members={members}
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

// A bank can be connected once per person: each one authorizes their own accounts.
function EuropeanBank({
  bank,
  first,
  connections,
  members,
  connect,
}: {
  bank: string;
  first: boolean;
  connections: Connection[];
  members: Member[];
  connect: Connect;
}) {
  const [choosing, setChoosing] = useState(false);
  const connected = connections.some((c) => c.bank === bank);
  return (
    <View style={[ui.row, first && ui.rowFirst, styles.bankLine]}>
      <View style={styles.bankLineHead}>
        <View style={ui.rowMain}>
          <Text style={ui.rowTitle}>{bank}</Text>
          <Text style={ui.rowSub}>Europa · autorização pelo próprio banco</Text>
        </View>
        {connected ? <Text style={styles.done}>Conectado</Text> : null}
        {choosing ? null : (
          <Button
            label={connected ? 'Outra conta' : 'Conectar'}
            disabled={connect.opening !== null}
            onPress={() => setChoosing(true)}
          />
        )}
      </View>
      {choosing ? (
        <OwnerChoice
          bank={bank}
          initial={suggestedOwner(bank, connections, members)}
          members={members}
          connect={connect}
          onCancel={() => setChoosing(false)}
        />
      ) : null}
    </View>
  );
}

// Before opening the bank: whose accounts are about to be authorized.
function OwnerChoice({
  bank,
  initial,
  members,
  connect,
  onCancel,
}: {
  bank: string;
  initial: string;
  members: Member[];
  connect: Connect;
  onCancel: () => void;
}) {
  const [owner, setOwner] = useState(initial);
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>De quem são as contas?</Text>
      <DotSelect
        value={owner}
        options={ownerOptions(members)}
        onChange={setOwner}
        label="Responsável pelas contas"
        placeholder="Escolha o responsável"
        empty="Nenhuma pessoa cadastrada"
      />
      <Text style={styles.choiceNote}>
        No {bank}, entre com o login dessa pessoa. As contas que ela autorizar ficam no nome dela,
        separadas das que já estão conectadas.
      </Text>
      <View style={styles.choiceActions}>
        <Button
          primary
          label={`Continuar no ${bank}`}
          busy={connect.opening === bank}
          disabled={connect.opening !== null}
          onPress={() => void connect.connect(bank, { member_id: memberIdOf(owner) })}
        />
        <Button label="Cancelar" onPress={onCancel} />
      </View>
    </View>
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
