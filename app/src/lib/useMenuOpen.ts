import type React from 'react';
import { useState } from 'react';
import { Dimensions, type View } from 'react-native';

import { type MenuSide, menuSide } from './menuSide';
import { useCloseOnOutsideTap } from './useCloseOnOutsideTap';

type Box = React.ComponentRef<typeof View>;

// A filter menu's open state: it closes on a tap elsewhere, and on opening it looks where
// its button is on screen to pick the side its list opens to (see menuSide).
export function useMenuOpen(preferred: MenuSide) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<MenuSide>(preferred);
  const outside = useCloseOnOutsideTap(open, setOpen);
  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    const box = outside.ref.current as (Box & { measureInWindow?: Box['measureInWindow'] }) | null;
    box?.measureInWindow?.((x, _y, width) =>
      setSide(menuSide(x, width, Dimensions.get('window').width, preferred)),
    );
  };
  return { open, setOpen, toggle, side, outside };
}
