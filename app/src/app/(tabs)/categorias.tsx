import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CategoryDetail } from '@/components/categories/CategoryDetail';
import { CategoryList } from '@/components/categories/CategoryList';
import { NewCategory } from '@/components/categories/NewCategory';
import { Sheet } from '@/components/categories/Sheet';
import { styles as page } from '@/components/connections/styles';
import { Segment } from '@/components/nav';
import { Loadable, signedInPage } from '@/components/states';
import { Button } from '@/components/ui';
import { emptyText, KINDS, kindNote, ofKind, type CategoryKind } from '@/lib/categories';
import { WIDE_MIN } from '@/lib/dashboard';
import { useCategories, useRefreshMoney } from '@/lib/queries';
import type { Category } from '@/lib/types';
import { styles as parts } from '@/components/categories/styles';
import { colors } from '@/theme';

// Categorias (from the old app): the family's categories by kind; rename, recolour,
// create, delete, and forget merchants the app learned. On a computer the chosen one
// sits next to the list; on a phone it slides up from the bottom.
export default signedInPage(Categories);

type Panel = { type: 'category'; id: string } | { type: 'new' } | null;

function Categories() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const query = useCategories(true);
  const refresh = useRefreshMoney();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [panel, setPanel] = useState<Panel>(null);
  const all = query.data ?? [];
  const items = ofKind(all, kind);
  // On a computer something is always shown: the chosen category or the first one.
  const chosenId = panel?.type === 'category' ? panel.id : null;
  const chosen =
    all.find((c) => c.id === chosenId) ?? (wide && panel === null ? items[0] : undefined);

  const showKind = (k: CategoryKind) => {
    setKind(k);
    if (panel?.type === 'category') setPanel(null);
  };
  const created = async (c: Category) => {
    await refresh();
    setKind(c.kind);
    setPanel({ type: 'category', id: c.id });
  };
  const close = () => setPanel(null);

  const side =
    panel?.type === 'new' ? (
      <NewCategory key={kind} all={all} kind={kind} onCreated={created} onCancel={close} />
    ) : chosen ? (
      <CategoryDetail
        key={chosen.id}
        category={chosen}
        all={all}
        onChanged={refresh}
        onDeleted={close}
      />
    ) : null;

  const list = (
    <Loadable
      isError={query.isError}
      loading={!query.data}
      value={items.length ? items : null}
      empty={emptyText(kind)}
    >
      {(rows) => (
        <CategoryList
          items={rows}
          selectedId={wide ? chosen?.id : null}
          onSelect={(c) => setPanel({ type: 'category', id: c.id })}
          chevron={!wide}
        />
      )}
    </Loadable>
  );
  const newButton = (
    <Button label="Nova categoria" onPress={() => setPanel({ type: 'new' })} style={styles.new} />
  );

  if (wide) {
    return (
      <ScrollView style={page.page} contentContainerStyle={page.wideContent}>
        <View style={styles.head}>
          <Text style={[page.title, page.wideTitle]}>Categorias</Text>
          {newButton}
        </View>
        <View style={styles.columns}>
          <View style={styles.listColumn}>
            <Segment options={KINDS} value={kind} onChange={showKind} />
            <Text style={parts.note}>{kindNote(kind)}</Text>
            {list}
          </View>
          <View style={styles.panel}>{side}</View>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView style={page.page} contentContainerStyle={page.content}>
      <View style={page.column}>
        <Link href="/" style={page.back}>
          ‹ Início
        </Link>
        <View style={styles.head}>
          <Text style={page.title}>Categorias</Text>
          {newButton}
        </View>
        <View style={styles.phoneBody}>
          <Segment options={KINDS} value={kind} onChange={showKind} />
          <Text style={parts.note}>{kindNote(kind)}</Text>
          {list}
        </View>
      </View>
      <Sheet open={panel !== null} onClose={close}>
        {side}
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  new: { paddingVertical: 8, paddingHorizontal: 14 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32, marginTop: 24 },
  listColumn: { width: 380, gap: 14 },
  panel: {
    flex: 1,
    minWidth: 0,
    maxWidth: 520,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingLeft: 28,
    minHeight: 320,
  },
  phoneBody: { marginTop: 20, gap: 14 },
});
