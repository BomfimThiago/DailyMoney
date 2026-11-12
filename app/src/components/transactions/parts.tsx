import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { Segment } from '@/components/nav';
import { Loadable } from '@/components/states';
import { Transfers } from '@/components/Transfers';
import { TxDetail } from '@/components/TxDetail';
import { emptyListText, remaining } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';
import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors } from '@/theme';

import { styles } from './styles';

export function TabSegment({ page }: { page: TransactionsPage }) {
  return (
    <Segment
      options={[
        { value: 'lista', label: 'Gastos e entradas' },
        {
          value: 'transferencias',
          label: 'Transferências',
          badge: page.transfers.data?.pending.length ?? 0,
        },
      ]}
      value={page.tab}
      onChange={page.setTab}
    />
  );
}

// The month's lines once loaded; a short text when there are none or they failed.
export function ListBody({
  page,
  children,
}: {
  page: TransactionsPage;
  children: (items: Transaction[]) => ReactNode;
}) {
  const { regular, items } = page;
  return (
    <Loadable
      isError={regular.isError}
      loading={!items}
      value={items?.length ? items : null}
      empty={emptyListText(page.filtered)}
      textStyle={[styles.empty, styles.top]}
    >
      {children}
    </Loadable>
  );
}

export function MoreButton({ page }: { page: TransactionsPage }) {
  const { regular } = page;
  if (!regular.hasNextPage) return null;
  return (
    <Pressable
      onPress={() => regular.fetchNextPage()}
      disabled={regular.isFetchingNextPage}
      accessibilityRole="button"
      style={styles.more}
    >
      {regular.isFetchingNextPage ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Text style={styles.moreText}>Mostrar mais ({remaining(regular.data?.pages)})</Text>
      )}
    </Pressable>
  );
}

export function TransfersBody({ page }: { page: TransactionsPage }) {
  const { transfers } = page;
  return (
    <Loadable
      isError={transfers.isError}
      loading={!transfers.data}
      value={transfers.data}
      empty=""
      textStyle={[styles.empty, styles.top]}
    >
      {(data) => <Transfers data={data} month={page.month} onChanged={page.refreshMoney} />}
    </Loadable>
  );
}

// Phone: the detail slides up from the bottom; tapping outside closes it.
export function Sheet({
  t,
  onClose,
  onChanged,
}: {
  t: Transaction | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal visible={t !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={styles.sheet}>
        <View style={styles.grip} />
        {t ? <TxDetail key={t.id} t={t} onChanged={onChanged} /> : null}
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
          <Text style={styles.moreText}>Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
