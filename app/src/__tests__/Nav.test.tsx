import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';

import TabsLayout from '@/app/(tabs)/_layout';
import { SideBar, TabBar } from '@/components/nav';
import { useAuth } from '@/lib/auth';
import { useSummary } from '@/lib/queries';

jest.mock('expo-router', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Tabs = ({ tabBar }: { tabBar: () => React.ReactNode }) => <View>{tabBar()}</View>;
  Tabs.Screen = function Screen() {
    return null;
  };
  return { router: { navigate: jest.fn() }, usePathname: jest.fn(), Tabs };
});
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/queries', () => ({ useSummary: jest.fn() }));
jest.mock('@/components/Logo', () => ({ Logo: () => null }));

const signOut = jest.fn();
const signedIn = () =>
  jest.mocked(useAuth).mockReturnValue({
    state: { status: 'signedIn', me: { name: 'Thiago Bomfim', family: { name: 'Família' } } },
    signOut,
  } as unknown as ReturnType<typeof useAuth>);
const summary = (pending?: number) =>
  jest.mocked(useSummary).mockReturnValue({
    data: pending === undefined ? undefined : { pending_transfers: pending },
  } as ReturnType<typeof useSummary>);
const wide = (width: number) =>
  jest
    .spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.mocked(usePathname).mockReturnValue('/transacoes');
  signedIn();
  summary(2);
});

describe('TabBar', () => {
  it('marks the open page and goes to another', async () => {
    await render(<TabBar />);
    expect(screen.getByRole('tab', { name: 'Transações' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Início' }).props.accessibilityState).toEqual({
      selected: false,
    });
    await fireEvent.press(screen.getByText('Análises'));
    expect(router.navigate).toHaveBeenCalledWith('/analises');
  });

  it('marks Início only on the home page', async () => {
    jest.mocked(usePathname).mockReturnValue('/');
    await render(<TabBar />);
    expect(screen.getByRole('tab', { name: 'Início' }).props.accessibilityState).toEqual({
      selected: true,
    });
  });
});

describe('SideBar', () => {
  it('lists the pages, the pending count and the person', async () => {
    await render(<SideBar />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('DADOS')).toBeTruthy();
    expect(screen.getByText('T')).toBeTruthy();
    expect(screen.getByText('Thiago Bomfim')).toBeTruthy();
    expect(screen.getByText('Família')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conexões'));
    expect(router.navigate).toHaveBeenCalledWith('/conexoes');
    await fireEvent.press(screen.getByLabelText('Daily Money, início'));
    expect(router.navigate).toHaveBeenCalledWith('/');
    await fireEvent.press(screen.getByText('Sair'));
    expect(signOut).toHaveBeenCalled();
  });

  it('shows no badge without pending transfers', async () => {
    summary();
    await render(<SideBar />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('Transações')).toBeTruthy();
  });

  it('shows nothing when signed out', async () => {
    jest
      .mocked(useAuth)
      .mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(<SideBar />);
    expect(screen.queryByText('Sair')).toBeNull();
  });
});

describe('TabsLayout', () => {
  it('puts the tabs at the bottom of a phone', async () => {
    wide(390);
    await render(<TabsLayout />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByText('Sair')).toBeNull();
  });

  it('puts a sidebar beside the pages on a computer', async () => {
    wide(1440);
    await render(<TabsLayout />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('Sair')).toBeTruthy();
  });
});
