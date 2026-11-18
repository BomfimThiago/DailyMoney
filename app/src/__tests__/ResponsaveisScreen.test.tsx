import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OwnersScreen from '@/app/(tabs)/responsaveis';
import { useAuth } from '@/lib/auth';
import { addMember, deleteMember, editMember, setAccountOwner } from '@/lib/people';
import { useAccounts, useFamily } from '@/lib/queries';
import { account, member } from '@/testing/people';

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
  useFamily: jest.fn(),
  useAccounts: jest.fn(),
  useRefreshMoney: () => mockRefresh,
}));
jest.mock('@/lib/people', () => ({
  ...jest.requireActual<typeof import('@/lib/people')>('@/lib/people'),
  addMember: jest.fn(),
  editMember: jest.fn(),
  deleteMember: jest.fn(),
  setAccountOwner: jest.fn(),
}));

const thiago = member();
const ana = member({ id: 'm-ana', name: 'Ana', color: '#c7795a', kind: 'spouse', user_id: null });
const nubank = account();
const caixa = account({
  id: 'a-caixa',
  name: 'CaixaBank',
  bank: 'CaixaBank',
  currency: 'EUR',
  member_id: null,
});

function data(members = [thiago, ana], accounts = [nubank, caixa]) {
  jest.mocked(useFamily).mockReturnValue({
    data: { members },
    isError: false,
  } as unknown as ReturnType<typeof useFamily>);
  jest.mocked(useAccounts).mockReturnValue({
    data: accounts,
    isError: false,
  } as unknown as ReturnType<typeof useAccounts>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useAuth)
    .mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);
  data();
});

describe('Responsáveis', () => {
  it('lists the people and who owns each account', async () => {
    await render(<OwnersScreen />);
    expect(screen.getByText('Thiago (você)')).toBeTruthy();
    expect(screen.getByText('Eu · 1 conta')).toBeTruthy();
    expect(screen.getByLabelText('Responsável por Nubank')).toBeTruthy();
    // The account without an owner belongs to the household.
    expect(screen.getAllByText('Casa').length).toBeGreaterThan(0);
  });

  it('gives an account to someone else', async () => {
    jest.mocked(setAccountOwner).mockResolvedValue(account({ member_id: 'm-ana' }));
    await render(<OwnersScreen />);
    await fireEvent.press(screen.getByLabelText('Responsável por Nubank'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Ana' }));
    await waitFor(() => expect(setAccountOwner).toHaveBeenCalledWith('a-nubank', 'm-ana'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('gives an account to the whole household', async () => {
    jest.mocked(setAccountOwner).mockResolvedValue(account({ member_id: null }));
    await render(<OwnersScreen />);
    await fireEvent.press(screen.getByLabelText('Responsável por Nubank'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Casa' }));
    await waitFor(() => expect(setAccountOwner).toHaveBeenCalledWith('a-nubank', null));
  });

  it('adds a person and refuses a repeated name', async () => {
    jest.mocked(addMember).mockResolvedValue(member({ id: 'm-joao', name: 'João' }));
    await render(<OwnersScreen />);
    await fireEvent.press(screen.getByTestId('add-person'));
    await fireEvent.changeText(screen.getByLabelText('Nome da pessoa'), 'ana');
    await fireEvent.press(screen.getByText('Adicionar'));
    expect(screen.getByText('Já existe um responsável com esse nome.')).toBeTruthy();
    expect(addMember).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Nome da pessoa'), 'João');
    await fireEvent.press(screen.getByTestId('who-spouse'));
    await fireEvent.press(screen.getByTestId('color-#c7795a'));
    await fireEvent.press(screen.getByText('Adicionar'));
    await waitFor(() =>
      expect(addMember).toHaveBeenCalledWith({ name: 'João', kind: 'spouse', color: '#c7795a' }),
    );
    expect(screen.getByTestId('add-person')).toBeTruthy();
  });

  it('says who each person is and changes it', async () => {
    jest.mocked(editMember).mockResolvedValue(ana);
    await render(<OwnersScreen />);
    expect(screen.getByText('Eu · 1 conta')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Editar Ana'));
    await fireEvent.press(screen.getByTestId('who-family'));
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(editMember).toHaveBeenCalledWith('m-ana', { kind: 'family' }));
  });

  it('renames a person', async () => {
    jest.mocked(editMember).mockResolvedValue(ana);
    await render(<OwnersScreen />);
    await fireEvent.press(screen.getByLabelText('Editar Ana'));
    await fireEvent.changeText(screen.getByLabelText('Nome do responsável'), 'Ana Paula');
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(editMember).toHaveBeenCalledWith('m-ana', { name: 'Ana Paula' }));
  });

  it('removes a person only after confirming; the one who signs in cannot be removed', async () => {
    jest.mocked(deleteMember).mockResolvedValue(undefined);
    await render(<OwnersScreen />);
    await fireEvent.press(screen.getByLabelText('Editar Thiago'));
    expect(screen.queryByText('Excluir pessoa')).toBeNull();
    await fireEvent.press(screen.getByText('Cancelar'));

    await fireEvent.press(screen.getByLabelText('Editar Ana'));
    await fireEvent.press(screen.getByText('Excluir pessoa'));
    expect(deleteMember).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Excluir'));
    await waitFor(() => expect(deleteMember).toHaveBeenCalledWith('m-ana'));
  });

  it('says when it could not load', async () => {
    jest.mocked(useAccounts).mockReturnValue({
      data: undefined,
      isError: true,
    } as unknown as ReturnType<typeof useAccounts>);
    await render(<OwnersScreen />);
    expect(screen.getByText('Não consegui carregar. Tente de novo.')).toBeTruthy();
  });

  it('asks for a statement when there are no accounts yet', async () => {
    data([thiago], []);
    await render(<OwnersScreen />);
    expect(screen.getByText(/Nenhuma conta ainda/)).toBeTruthy();
  });
});
