import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Loadable } from '@/components/states';
import { TxRow } from '@/components/TxRow';
import { errorText } from '@/lib/api';
import { decideReview } from '@/lib/imports';
import { approveAllLabel, groupSub, groupTitle } from '@/lib/review';
import type { ReviewGroup, Transaction } from '@/lib/types';
import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors, fonts } from '@/theme';

import { styles as page } from './styles';

type Decision = 'approve' | 'reject';

// Transações > Para revisar: what came in from statements and connected banks, waiting
// for the person to approve it before it counts (like the old app's review screen).
export function ReviewBody({ page: p, wide }: { page: TransactionsPage; wide: boolean }) {
  const { review } = p;
  return (
    <Loadable
      isError={review.isError}
      loading={!review.data}
      value={review.data?.groups.length ? review.data.groups : null}
      empty="Nada para revisar. O que chegar de extratos e bancos conectados aparece aqui."
      textStyle={[page.empty, page.top]}
    >
      {(groups) => (
        <View>
          <Text style={[page.empty, page.top]}>
            Chegaram de extratos e bancos conectados. Só entram nas contas e análises depois que
            você aprovar. Toque numa linha para corrigir antes.
          </Text>
          {groups.map((g) => (
            <Group
              key={g.import_id ?? g.label}
              g={g}
              wide={wide}
              selectedId={p.selectedId}
              onSelect={(t) => p.setSelectedId(t.id)}
              onDone={p.refreshMoney}
            />
          ))}
        </View>
      )}
    </Loadable>
  );
}

// Sends a decision and reports back; the lists refresh through onDone.
function useDecide(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (key: string, ids: string[], decision: Decision) => {
    setBusy(key);
    setError(null);
    try {
      await decideReview(ids, decision);
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, decide };
}

function Group({
  g,
  wide,
  selectedId,
  onSelect,
  onDone,
}: {
  g: ReviewGroup;
  wide: boolean;
  selectedId: string | null;
  onSelect: (t: Transaction) => void;
  onDone: () => void;
}) {
  const { busy, error, decide } = useDecide(onDone);
  const all = g.items.map((t) => t.id);
  return (
    <View style={styles.group}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {groupTitle(g)}
          </Text>
          <Text style={styles.sub}>{groupSub(g)}</Text>
        </View>
        <Small
          label={approveAllLabel(g)}
          primary
          busy={busy === 'all'}
          disabled={busy !== null}
          onPress={() => decide('all', all, 'approve')}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {g.items.map((t, i) => (
        <View
          key={t.id}
          style={[
            styles.line,
            wide && styles.lineWide,
            i === 0 && styles.lineFirst,
            t.id === selectedId && styles.lineOn,
          ]}
        >
          <View style={wide ? styles.flex : null}>
            <TxRow t={t} first onPress={() => onSelect(t)} />
          </View>
          <View style={[styles.actions, wide && styles.actionsWide]}>
            <Small
              label="Rejeitar"
              busy={busy === `reject-${t.id}`}
              disabled={busy !== null}
              onPress={() => decide(`reject-${t.id}`, [t.id], 'reject')}
            />
            <Small
              label="Aprovar"
              busy={busy === `approve-${t.id}`}
              disabled={busy !== null}
              onPress={() => decide(`approve-${t.id}`, [t.id], 'approve')}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Small({
  label,
  onPress,
  primary,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.small, primary && styles.smallPrimary, disabled && !busy && styles.off]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={primary ? colors.page : colors.ink} />
      ) : (
        <Text style={[styles.smallText, primary && styles.smallTextPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 24 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headText: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  line: { borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 10 },
  lineWide: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 0 },
  lineFirst: { borderTopWidth: 0 },
  lineOn: { backgroundColor: colors.pendingSoft },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  actionsWide: { paddingRight: 4 },
  small: {
    minHeight: 34,
    minWidth: 84,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  smallText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  smallTextPrimary: { color: colors.page },
  off: { opacity: 0.4 },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger, marginTop: 8 },
});
