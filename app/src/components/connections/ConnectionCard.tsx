import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, ui } from '@/components/ui';
import {
  canReconnect,
  connectedAccounts,
  errorMessage,
  expiryWarning,
  providerName,
  statusLine,
  summary,
} from '@/lib/connections';
import { disconnectBank, syncConnection } from '@/lib/imports';
import type { Connection, SyncResult } from '@/lib/types';

import { styles } from './styles';

// A bank read every morning: when it was last read, how long the authorization lasts,
// and buttons to read it now, authorize it again or stop reading it.
export function ConnectionCard({
  connection: c,
  onReconnect,
}: {
  connection: Connection;
  onReconnect: () => void;
}) {
  const client = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['money'] });
  const sync = useMutation({
    mutationFn: () => syncConnection(c.id),
    onSuccess: (r) => {
      setResult(r);
      return refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => disconnectBank(c.id), onSuccess: refresh });
  const warning = expiryWarning(c);
  const failed = sync.error ? errorMessage(sync.error, 'Não deu para sincronizar.') : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={ui.rowMain}>
          <Text style={styles.bank}>{c.bank}</Text>
          <Text style={ui.rowSub}>{connectedAccounts(c)}</Text>
        </View>
        <Text style={styles.via}>{providerName(c)}</Text>
      </View>
      <Text style={styles.status}>{statusLine(c)}</Text>
      <Note text={warning} style={styles.warn} />
      <Note text={c.last_error} style={styles.error} />
      <Note text={failed} style={styles.error} />
      <Note text={result && summary(result)} style={styles.result} />
      <Actions
        bank={c.bank}
        syncing={sync.isPending}
        onSync={() => sync.mutate()}
        removing={remove.isPending}
        onRemove={() => remove.mutate()}
        onReconnect={canReconnect(c) ? onReconnect : null}
      />
    </View>
  );
}

function Note({ text, style }: { text: string | null; style: object }) {
  return text ? <Text style={style}>{text}</Text> : null;
}

function Actions({
  bank,
  syncing,
  onSync,
  removing,
  onRemove,
  onReconnect,
}: {
  bank: string;
  syncing: boolean;
  onSync: () => void;
  removing: boolean;
  onRemove: () => void;
  onReconnect: (() => void) | null;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <View style={styles.actions}>
        <Text style={styles.ask}>Parar de ler o {bank}? As transações ficam.</Text>
        <Button label="Cancelar" onPress={() => setConfirming(false)} />
        <Button label="Desconectar" busy={removing} onPress={onRemove} />
      </View>
    );
  }
  return (
    <View style={styles.actions}>
      <Button primary label="Sincronizar agora" busy={syncing} onPress={onSync} />
      {onReconnect ? <Button label="Conectar de novo" onPress={onReconnect} /> : null}
      <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
        <Text style={styles.quiet}>Desconectar</Text>
      </Pressable>
    </View>
  );
}
