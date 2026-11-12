import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Option } from '@/lib/transactions';

import { styles } from './styles';

// A filter button that opens its list underneath: "Categoria" or "Categoria: Mercado".
export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <View style={styles.menuBox}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.menuButton, current && styles.menuButtonOn]}
      >
        <Text style={[styles.menuText, current && styles.menuTextOn]} numberOfLines={1}>
          {current ? `${label}: ${current.name}` : label} ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.menu} accessibilityRole="menu">
          <MenuItem label="Todas" on={value === null} onPress={() => pick(null)} />
          {options.map((o) => (
            <MenuItem key={o.id} label={o.name} on={o.id === value} onPress={() => pick(o.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MenuItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: on }}
      style={[styles.menuItem, on && styles.menuItemOn]}
    >
      <Text style={[styles.menuItemText, on && styles.menuTextOn]}>{label}</Text>
    </Pressable>
  );
}
