import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CategoriesScreen from '@/app/(tabs)/categorias';
import { useAuth } from '@/lib/auth';
import { createCategory, deleteCategory, deleteCategoryRule, editCategory } from '@/lib/imports';
import { useCategories, useCategoryRules } from '@/lib/queries';
import { category } from '@/testing/categories';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
  };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
const mockRefresh = jest.fn(async () => {});
jest.mock('@/lib/queries', () => ({
  useCategories: jest.fn(),
  useCategoryRules: jest.fn(),
  useRefreshMoney: () => mockRefresh,
}));
jest.mock('@/lib/imports', () => ({
  createCategory: jest.fn(),
  editCategory: jest.fn(),
  deleteCategory: jest.fn(),
  deleteCategoryRule: jest.fn(),
}));

const mockCategories = jest.mocked(useCategories);
const mockRules = jest.mocked(useCategoryRules);
const mercado = category({ id: 'c1', name: 'Mercado', transaction_count: 23, rule_count: 1 });
const lazer = category({ id: 'c2', name: 'Lazer', color: '#b86f8f' });
const salario = category({ id: 'c3', name: 'Salário', kind: 'income' });

function width(w: number) {
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: w, height: 900, scale: 1, fontScale: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  width(1440);
  jest
    .mocked(useAuth)
    .mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  mockCategories.mockReturnValue({
    data: [mercado, lazer, salario],
    isError: false,
  } as unknown as ReturnType<typeof useCategories>);
  mockRules.mockReturnValue({
    data: [{ id: 'r1', merchant: 'mercadona' }],
    isError: false,
    isLoading: false,
  } as unknown as ReturnType<typeof useCategoryRules>);
});

describe('Categorias', () => {
  it('lists spending categories and shows the first one with its learned merchants', async () => {
    await render(<CategoriesScreen />);
    expect(screen.getByText('Lazer')).toBeTruthy();
    expect(screen.queryByText('Salário')).toBeNull();
    expect(screen.getByText('Gastos · 23 transações · Padrão')).toBeTruthy();
    expect(screen.getByText('Mercadona')).toBeTruthy();
  });

  it('switches to income categories', async () => {
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByTestId('segment-income'));
    expect(screen.getAllByText('Salário').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lazer')).toBeNull();
  });

  it('renames a category', async () => {
    jest.mocked(editCategory).mockResolvedValue(mercado);
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByTestId('rename-category'));
    await fireEvent.changeText(screen.getByLabelText('Nome da categoria'), ' Supermercado ');
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(editCategory).toHaveBeenCalledWith('c1', { name: 'Supermercado' }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('does not save a repeated name', async () => {
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByTestId('rename-category'));
    await fireEvent.changeText(screen.getByLabelText('Nome da categoria'), 'lazer');
    expect(screen.getByText('Já existe uma categoria com esse nome.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Salvar'));
    expect(editCategory).not.toHaveBeenCalled();
  });

  it('changes the colour', async () => {
    jest.mocked(editCategory).mockResolvedValue(mercado);
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByTestId('color-#c7795a'));
    await waitFor(() => expect(editCategory).toHaveBeenCalledWith('c1', { color: '#c7795a' }));
  });

  it('forgets a learned merchant', async () => {
    jest.mocked(deleteCategoryRule).mockResolvedValue();
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByLabelText('Esquecer mercadona'));
    await waitFor(() => expect(deleteCategoryRule).toHaveBeenCalledWith('r1'));
  });

  it('deletes after confirming', async () => {
    jest.mocked(deleteCategory).mockResolvedValue();
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByTestId('delete-category'));
    expect(screen.getByText('Excluir “Mercado”?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Excluir'));
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('c1'));
  });

  it('creates a category of the kind being shown', async () => {
    const pets = category({ id: 'c9', name: 'Pets', is_default: false });
    jest.mocked(createCategory).mockResolvedValue(pets);
    await render(<CategoriesScreen />);
    await fireEvent.press(screen.getByText('Nova categoria'));
    await fireEvent.press(screen.getByText('Criar categoria'));
    expect(screen.getByText('Dê um nome à categoria.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome da categoria'), 'Pets');
    await fireEvent.press(screen.getByText('Criar categoria'));
    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({
        name: 'Pets',
        kind: 'expense',
        color: '#4f9a9a',
      }),
    );
  });

  it('on a phone opens a category from the list', async () => {
    width(390);
    await render(<CategoriesScreen />);
    expect(screen.queryByText('Renomear')).toBeNull();
    await fireEvent.press(screen.getByTestId('category-Lazer'));
    expect(screen.getByText('Renomear')).toBeTruthy();
  });

  it('says when it could not load', async () => {
    mockCategories.mockReturnValue({ data: undefined, isError: true } as unknown as ReturnType<
      typeof useCategories
    >);
    await render(<CategoriesScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
  });
});
