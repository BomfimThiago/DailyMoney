import type React from 'react';
import { useEffect, useRef } from 'react';
import { Platform, type View } from 'react-native';

type Box = React.ComponentRef<typeof View>;

// Open lists (dropdowns, filter menus) close when the person taps anywhere else.
// Web: a pointerdown outside the list's box. Phone: there is no "contains", so the list
// marks touches that start inside it, and the screen (and the detail sheet, which lives
// in its own Modal) calls tapAnywhere() for every touch; touches bubble child → parent,
// so the mark is set before the screen's call.
const listeners = new Set<() => void>();

export function tapAnywhere() {
  for (const l of [...listeners]) l();
}

// setOpen is a useState setter, so it never changes between renders.
export function useCloseOnOutsideTap(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<Box>(null);
  const inside = useRef(false);

  useEffect(() => {
    if (!open) return;
    inside.current = false;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onDown = (e: Event) => {
        const box = ref.current as unknown as Node | null;
        if (box && !box.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', onDown, true);
      return () => document.removeEventListener('pointerdown', onDown, true);
    }
    const onTap = () => {
      if (inside.current) inside.current = false;
      else setOpen(false);
    };
    listeners.add(onTap);
    return () => {
      listeners.delete(onTap);
    };
  }, [open, setOpen]);

  return {
    ref,
    onTouchStart: () => {
      inside.current = true;
    },
  };
}
