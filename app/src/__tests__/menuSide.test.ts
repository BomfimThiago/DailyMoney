import { describe, expect, it } from '@jest/globals';

import { menuSide } from '@/lib/menuSide';

describe('menuSide', () => {
  it('keeps the preferred side when the list fits there', () => {
    expect(menuSide(16, 80, 390, 'left')).toBe('left');
    expect(menuSide(300, 80, 390, 'right')).toBe('right');
  });

  it('opens to the right of a button at the left edge of a phone', () => {
    // "Conta" wrapped to the start of the second line: lining up with its right edge
    // would put most of the list off screen.
    expect(menuSide(16, 80, 390, 'right')).toBe('left');
  });

  it('opens to the left of a button at the right edge of a phone', () => {
    expect(menuSide(300, 80, 390, 'left')).toBe('right');
  });

  it('keeps the preferred side when the list fits nowhere', () => {
    expect(menuSide(100, 50, 220, 'right')).toBe('right');
    expect(menuSide(100, 50, 220, 'left')).toBe('left');
  });
});
