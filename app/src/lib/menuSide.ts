// Which edge of its button a filter's list lines up with, so the whole list stays on
// screen: the menus wrap onto several lines on a phone, so a button can end up at either
// edge of the screen whatever its place in the row.
export type MenuSide = 'left' | 'right';

// The list is at least this wide (styles.menu minWidth).
export const MENU_WIDTH = 200;

export function menuSide(
  x: number,
  buttonWidth: number,
  screenWidth: number,
  preferred: MenuSide,
  menuWidth = MENU_WIDTH,
): MenuSide {
  const fitsLeft = x + menuWidth <= screenWidth;
  const fitsRight = x + buttonWidth - menuWidth >= 0;
  if (preferred === 'left') return fitsLeft || !fitsRight ? 'left' : 'right';
  return fitsRight || !fitsLeft ? 'right' : 'left';
}
