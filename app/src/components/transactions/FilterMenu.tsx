import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NO_PICK, type Option, type Pick, pickLabel, toggled } from '@/lib/transactions';
import { useCloseOnOutsideTap } from '@/lib/useCloseOnOutsideTap';

import { styles } from './styles';

// A filter button that opens its list underneath: "Categoria" or "Categoria: Mercado".
export function FilterMenu({
  label,
  value,
  options,
  onChange,
  align = 'right',
  short = false,
  allLabel = 'Todas',
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (id: string | null) => void;
  // Which edge of the button the list lines up with, so it stays inside a phone screen.
  align?: 'left' | 'right';
  // A phone shows only the choice ("Mercado"), so the three menus stay on one line.
  short?: boolean;
  // The first item, which clears the filter; null for menus that always hold a choice.
  allLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  // Dark only while it filters; a menu that always holds a choice (Período, Ordem) stays light.
  const on = Boolean(current) && allLabel !== null;
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };
  const outside = useCloseOnOutsideTap(open, setOpen);
  return (
    <View style={[styles.menuBox, open && styles.menuBoxOpen]} {...outside}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={short && current ? `${label}: ${current.name}` : undefined}
        accessibilityState={{ expanded: open }}
        style={[styles.menuButton, short && styles.menuButtonShort, on && styles.menuButtonOn]}
      >
        <Text style={[styles.menuText, on && styles.menuTextOn]} numberOfLines={1}>
          {current ? (short ? current.name : `${label}: ${current.name}`) : label} ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.menu, align === 'left' && styles.menuLeft]} accessibilityRole="menu">
          {allLabel !== null ? (
            <MenuItem label={allLabel} on={value === null} onPress={() => pick(null)} />
          ) : null}
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

// A filter that takes several values: tap to tick each one; "Mostrar" shows only the ticked
// ones, "Esconder" shows everything but them (how Início's "Demais" opens). The list stays
// open while ticking; tapping outside closes it.
export function PickMenu({
  label,
  pick,
  options,
  onChange,
  align = 'right',
  short = false,
  allLabel = 'Todas',
}: {
  label: string;
  pick: Pick;
  options: Option[];
  onChange: (pick: Pick) => void;
  align?: 'left' | 'right';
  short?: boolean;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const on = pick.ids.length > 0;
  const text = pickLabel(label, pick, options, short);
  const outside = useCloseOnOutsideTap(open, setOpen);
  return (
    <View style={[styles.menuBox, open && styles.menuBoxOpen]} {...outside}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={short && on ? `${label}: ${text}` : undefined}
        accessibilityState={{ expanded: open }}
        style={[styles.menuButton, short && styles.menuButtonShort, on && styles.menuButtonOn]}
      >
        <Text style={[styles.menuText, on && styles.menuTextOn]} numberOfLines={1}>
          {text} ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.menu, align === 'left' && styles.menuLeft]} accessibilityRole="menu">
          <View style={styles.modeRow} accessibilityRole="radiogroup">
            <ModeChip
              label="Mostrar"
              on={!pick.exclude}
              onPress={() => onChange({ ...pick, exclude: false })}
            />
            <ModeChip
              label="Esconder"
              on={pick.exclude}
              onPress={() => onChange({ ...pick, exclude: true })}
            />
          </View>
          <MenuItem label={allLabel} on={!on} onPress={() => onChange(NO_PICK)} />
          {options.map((o) => (
            <CheckItem
              key={o.id}
              label={o.name}
              checked={pick.ids.includes(o.id)}
              hiding={pick.exclude}
              onPress={() => onChange(toggled(pick, o.id))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ModeChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[styles.mode, on && styles.modeOn]}
    >
      <Text style={[styles.modeText, on && styles.modeTextOn]}>{label}</Text>
    </Pressable>
  );
}

// A ticked value: ✓ when it is shown, a struck-through name when it is hidden.
function CheckItem({
  label,
  checked,
  hiding,
  onPress,
}: {
  label: string;
  checked: boolean;
  hiding: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.checkItem}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.boxMark}>{hiding ? '–' : '✓'}</Text> : null}
      </View>
      <Text style={[styles.menuItemText, checked && hiding && styles.hiddenText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
