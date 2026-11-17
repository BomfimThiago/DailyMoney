import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CategorySelect } from '@/components/transactions/CategorySelect';
import { tapAnywhere } from '@/lib/useCloseOnOutsideTap';
import { category } from '@/testing/categories';

const options = [
  category({ id: 'c-mercado', name: 'Mercado' }),
  category({ id: 'c-rest', name: 'Restaurantes' }),
];

describe('dropdown closes on a tap elsewhere', () => {
  it('closes when the screen is touched outside it', async () => {
    await render(<CategorySelect value="c-mercado" options={options} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Categoria'));
    expect(screen.getByText('Restaurantes')).toBeTruthy();
    await act(() => tapAnywhere());
    expect(screen.queryByText('Restaurantes')).toBeNull();
  });

  it('stays open when the touch starts inside it', async () => {
    await render(<CategorySelect value="c-mercado" options={options} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Categoria'));
    await fireEvent(screen.getByText('Restaurantes'), 'touchStart');
    await act(() => tapAnywhere());
    expect(screen.getByText('Restaurantes')).toBeTruthy();
    // The next touch outside does close it.
    await act(() => tapAnywhere());
    expect(screen.queryByText('Restaurantes')).toBeNull();
  });
});
