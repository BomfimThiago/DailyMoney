import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Segment } from '@/components/nav';
import { Loadable } from '@/components/states';
import { Transfers } from '@/components/Transfers';
import { TxDetail } from '@/components/TxDetail';
import { emptyListText, remaining } from '@/lib/transactions';
import { tapAnywhere } from '@/lib/useCloseOnOutsideTap';
import type { Transaction } from '@/lib/types';
import type { Tab, TransactionsPage } from '@/lib/useTransactionsPage';
import { colors } from '@/theme';

import { styles } from './styles';

// "Para revisar" only shows while imported lines wait for approval (or while open).
export function showsReview(page: TransactionsPage): boolean {
  return (page.review.data?.total ?? 0) > 0 || page.tab === 'revisar';
}

// On a phone three tabs don't fit with the long names, so they get short ones.
export function TabSegment({ page, wide = false }: { page: TransactionsPage; wide?: boolean }) {
  const three = showsReview(page);
  const short = three && !wide;
  const options: { value: Tab; label: string; badge?: number }[] = [
    { value: 'lista', label: short ? 'Lista' : 'Gastos e entradas' },
    {
      value: 'transferencias',
      label: 'Transferências',
      badge: page.transfers.data?.pending.length ?? 0,
    },
  ];
  if (three) {
    options.push({
      value: 'revisar',
      label: short ? 'Revisar' : 'Para revisar',
      badge: page.review.data?.total ?? 0,
    });
  }
  return <Segment options={options} value={page.tab} onChange={page.setTab} />;
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
      empty={emptyListText(page.filtered, page.period)}
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

// Phone: the detail slides up from the bottom; tapping outside closes it. The edit form
// can be taller than the screen with the keyboard open, so the sheet scrolls.
export function Sheet({
  t,
  onClose,
  onChanged,
}: {
  t: Transaction | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={t !== null} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.dim}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dimTap} onPress={onClose} accessibilityLabel="Fechar" />
        <View style={[styles.sheet, { maxHeight: height * 0.9 }]} onTouchStart={tapAnywhere}>
          <View style={styles.grip} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            {t ? <TxDetail key={t.id} t={t} onChanged={onChanged} /> : null}
          </ScrollView>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
            <Text style={styles.moreText}>Fechar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
