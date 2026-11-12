import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import UploadScreen from '@/app/(tabs)/upload';
import { droppedFile } from '@/components/upload/DropZone';
import { rowLabel } from '@/components/upload/PreviewRows';
import { pickAndRead } from '@/components/upload/UploadFlow';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cancelImport, confirmImport, refreshPreview, uploadStatement } from '@/lib/imports';
import { useAccounts, useImports } from '@/lib/queries';
import type { Account, ImportPreview, PreviewRow } from '@/lib/types';
import { useUploadFlow } from '@/lib/useUploadFlow';
import { group, preview, summary } from '@/testing/upload';

const mockFocus: { leave: (() => void) | null } = { leave: null };

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect ${href}`}</Text>,
    router: { navigate: jest.fn() },
    // Runs the effect on every render and keeps its cleanup, like leaving the page.
    useFocusEffect: (effect: () => (() => void) | undefined) => {
      mockFocus.leave = effect() ?? null;
    },
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
const mockRefreshMoney = jest.fn();
jest.mock('@/lib/queries', () => ({
  useAccounts: jest.fn(),
  useImports: jest.fn(),
  useRefreshMoney: () => mockRefreshMoney,
}));
jest.mock('@/lib/imports', () => ({
  uploadStatement: jest.fn(),
  refreshPreview: jest.fn(),
  confirmImport: jest.fn(),
  cancelImport: jest.fn(),
}));
jest.mock('@/components/SupportedBanks', () => ({ SupportedBanks: () => null }));

const mockAuth = jest.mocked(useAuth);
const mockAccounts = jest.mocked(useAccounts);
const mockImports = jest.mocked(useImports);
const mockPick = jest.mocked(DocumentPicker.getDocumentAsync);
const mockUpload = jest.mocked(uploadStatement);
const mockRefresh = jest.mocked(refreshPreview);
const mockConfirm = jest.mocked(confirmImport);
const mockCancel = jest.mocked(cancelImport);

const nubank: Account = {
  id: 'a1',
  name: 'Nubank',
  bank: 'Nubank',
  currency: 'BRL',
  is_card: false,
  member_id: null,
} as Account;

const row = (o: Partial<PreviewRow> = {}): PreviewRow => ({
  index: 0,
  date: '2026-11-03',
  description: 'Padaria',
  amount: '-12.5000',
  currency: 'BRL',
  category: 'Mercado',
  status: 'new',
  kind: 'regular',
  ...o,
});

const signedIn = () =>
  mockAuth.mockReturnValue({ state: { status: 'signedIn', me: {} } } as ReturnType<typeof useAuth>);

const picked = (name = 'extrato.csv') =>
  mockPick.mockResolvedValueOnce({
    canceled: false,
    assets: [{ name, uri: `file:///${name}`, mimeType: 'text/csv' }],
  } as DocumentPicker.DocumentPickerResult);

async function openFile(result: ImportPreview) {
  picked();
  mockUpload.mockResolvedValueOnce(result);
  await render(<UploadScreen />);
  await fireEvent.press(screen.getByLabelText('Escolher arquivo do extrato'));
  await screen.findByText(result.filename);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.leave = null;
  signedIn();
  mockAccounts.mockReturnValue({ data: [nubank] } as ReturnType<typeof useAccounts>);
  mockImports.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useImports>);
  mockCancel.mockResolvedValue(undefined as never);
});

describe('UploadScreen', () => {
  it('waits for the session, and sends signed-out people to login', async () => {
    mockAuth.mockReturnValue({ state: { status: 'loading' } } as ReturnType<typeof useAuth>);
    await render(<UploadScreen />);
    expect(screen.queryByText('Enviar extrato')).toBeNull();

    mockAuth.mockReturnValue({ state: { status: 'signedOut' } } as ReturnType<typeof useAuth>);
    await render(<UploadScreen />);
    expect(screen.getByText('redirect /login')).toBeTruthy();
    expect(mockAccounts).toHaveBeenLastCalledWith(false);
  });

  it('shows earlier uploads and does nothing when the picker is closed', async () => {
    mockImports.mockReturnValue({
      data: [summary({ filename: 'antigo.ofx', imported_count: 4 })],
    } as unknown as ReturnType<typeof useImports>);
    mockPick.mockResolvedValueOnce({ canceled: true, assets: null });
    await render(<UploadScreen />);
    expect(screen.getByText('antigo.ofx')).toBeTruthy();
    expect(screen.getByText('10 nov · 4 importadas')).toBeTruthy();
    expect(screen.getByText('‹ Início')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Escolher arquivo do extrato'));
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('reads a file, lets the person pick the account and start date, then imports', async () => {
    const first = preview({
      groups: [group({ account: { id: 'a1', name: 'Nubank' } })],
      rows: [row(), row({ index: 1, status: 'duplicate', description: 'Café' })],
    });
    await openFile(first);
    expect(mockUpload).toHaveBeenCalledWith(
      { name: 'extrato.csv', uri: 'file:///extrato.csv', mimeType: 'text/csv', file: undefined },
      undefined,
    );
    expect(screen.getByText('Nubank · BRL · 1 ago a 10 nov')).toBeTruthy();
    expect(screen.getByText('Padaria')).toBeTruthy();
    expect(screen.getByText('já existe')).toBeTruthy();
    expect(screen.queryByLabelText('Escolher arquivo do extrato')).toBeNull();

    mockRefresh.mockResolvedValueOnce(preview({ ...first, filename: 'extrato.csv' }));
    await fireEvent.press(screen.getByText('Últimos 3 meses'));
    await waitFor(() =>
      expect(mockRefresh).toHaveBeenLastCalledWith('imp-1', { BRL: 'a1' }, '2026-08-12'),
    );
    expect(screen.getByText(/só entra o que é de 12\/08\/2026 em diante/)).toBeTruthy();

    mockConfirm.mockResolvedValueOnce(summary({ imported_count: 3, duplicate_count: 1 }));
    await fireEvent.press(screen.getByText('Importar 3 transações'));
    await screen.findByText('3 transações importadas');
    expect(mockConfirm).toHaveBeenCalledWith(
      'imp-1',
      [{ currency: 'BRL', account_id: 'a1' }],
      '2026-08-12',
    );
    expect(screen.getByText('extrato.csv · 1 já existiam')).toBeTruthy();
    expect(mockRefreshMoney).toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Ver no início'));
    expect(router.navigate).toHaveBeenCalledWith('/');
    await fireEvent.press(screen.getByText('Enviar outro'));
    expect(screen.getByLabelText('Escolher arquivo do extrato')).toBeTruthy();
  });

  it('starts fresh on the next visit once a statement is in', async () => {
    await openFile(preview());
    mockFocus.leave?.();
    expect(screen.getByText('extrato.csv')).toBeTruthy();

    mockConfirm.mockResolvedValueOnce(summary());
    await fireEvent.press(screen.getByText('Importar 3 transações'));
    await screen.findByText('1 transação importada');
    await act(() => mockFocus.leave?.());
    expect(screen.queryByText('1 transação importada')).toBeNull();
  });

  it('names a new account, and refuses to import without a name', async () => {
    await openFile(preview());
    const input = screen.getByLabelText('Nome da nova conta em BRL');
    await fireEvent.changeText(input, '  ');
    expect(screen.getByText('Importar 3 transações')).toBeTruthy();
    await fireEvent.press(screen.getByText('Importar 3 transações'));
    expect(mockConfirm).not.toHaveBeenCalled();

    await fireEvent.changeText(input, 'Conta da casa');
    mockConfirm.mockResolvedValueOnce(summary());
    await fireEvent.press(screen.getByText('Importar 3 transações'));
    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        'imp-1',
        [{ currency: 'BRL', new_account: { name: 'Conta da casa' } }],
        null,
      ),
    );
  });

  it('switches between an existing account and a new one', async () => {
    mockRefresh.mockImplementation(() => Promise.resolve(preview()));
    await openFile(preview());
    await fireEvent.press(screen.getByText('Nubank'));
    await waitFor(() => expect(mockRefresh).toHaveBeenLastCalledWith('imp-1', { BRL: 'a1' }, null));
    expect(screen.queryByLabelText('Nome da nova conta em BRL')).toBeNull();

    await fireEvent.press(screen.getByText('Nova conta'));
    await waitFor(() => expect(mockRefresh).toHaveBeenLastCalledWith('imp-1', { BRL: null }, null));
    expect(screen.getByLabelText('Nome da nova conta em BRL').props.value).toBe('Nubank');
    // Pressing it again keeps the name being typed.
    await fireEvent.changeText(screen.getByLabelText('Nome da nova conta em BRL'), 'Outra');
    await fireEvent.press(screen.getByText('Nova conta'));
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it('asks which account for each currency, offering only accounts in it', async () => {
    mockAccounts.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useAccounts>);
    await openFile(
      preview({
        groups: [group({ currency: 'BRL' }), group({ currency: 'USD', first_import: false })],
      }),
    );
    expect(screen.getByText('Conta das transações em BRL')).toBeTruthy();
    expect(screen.getByText('Conta das transações em USD')).toBeTruthy();
    expect(screen.getAllByText('Criar conta')).toHaveLength(2);
    expect(screen.getByText('Importar 6 transações')).toBeTruthy();
  });

  it('keeps only the answer to the latest change', async () => {
    let answerFirst: (p: ImportPreview) => void = () => undefined;
    mockRefresh
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce(preview({ filename: 'segundo.csv' }));
    await openFile(preview({ groups: [group({ account: { id: 'a1', name: 'Nubank' } })] }));
    await fireEvent.press(screen.getByText('Último mês'));
    await fireEvent.press(screen.getByText('Últimos 3 meses'));
    await screen.findByText('segundo.csv');
    await act(async () => answerFirst(preview({ filename: 'primeiro.csv' })));
    expect(screen.queryByText('primeiro.csv')).toBeNull();
  });

  it('shows why a change or an import failed', async () => {
    mockRefresh.mockRejectedValueOnce(new ApiError(422, 'Conta em outra moeda'));
    await openFile(preview({ groups: [group({ account: { id: 'a1', name: 'Nubank' } })] }));
    await fireEvent.press(screen.getByText('Último mês'));
    await screen.findByText('Conta em outra moeda');

    mockConfirm.mockRejectedValueOnce(new Error('rede'));
    await fireEvent.press(screen.getByText('Importar 3 transações'));
    await screen.findByText('Algo deu errado. Tente de novo.');
  });

  it('shows why a file could not be read', async () => {
    picked();
    mockUpload.mockRejectedValueOnce(new ApiError(422, 'Não reconheci as colunas do arquivo.'));
    await render(<UploadScreen />);
    await fireEvent.press(screen.getByLabelText('Escolher arquivo do extrato'));
    await screen.findByText('Não reconheci as colunas do arquivo.');
  });

  it('asks for the currency when the file does not say it', async () => {
    picked('wise.csv');
    mockUpload
      .mockResolvedValueOnce(preview({ id: 'imp-0', filename: 'wise.csv', needs_currency: true }))
      .mockResolvedValueOnce(preview({ filename: 'wise.csv' }));
    await render(<UploadScreen />);
    await fireEvent.press(screen.getByLabelText('Escolher arquivo do extrato'));
    await screen.findByText('Em que moeda está este extrato?');
    await fireEvent.press(screen.getByText('EUR'));
    await screen.findByText('Importar 3 transações');
    expect(mockCancel).toHaveBeenCalledWith('imp-0');
    expect(mockUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'wise.csv' }),
      'EUR',
    );
  });

  it('cancels a statement being reviewed', async () => {
    await openFile(preview());
    await fireEvent.press(screen.getByText('Cancelar'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('imp-1'));
    expect(mockRefreshMoney).toHaveBeenCalled();
    expect(screen.getByLabelText('Escolher arquivo do extrato')).toBeTruthy();
  });

  it('says what is skipped, what is a transfer and which lines were not read', async () => {
    const rows = Array.from({ length: 27 }, (_, i) =>
      row({ index: i, description: `Compra ${i}` }),
    );
    rows[1] = row({ index: 1, kind: 'pending', description: 'Pix Ana' });
    rows[2] = row({ index: 2, kind: 'investment', amount: '100.0000', description: 'Resgate' });
    rows[3] = row({ index: 3, amount: '50.0000', category: null, description: 'Salário' });
    await openFile(
      preview({
        rows,
        groups: [group({ counts: { new: 0, duplicate: 2, skipped: 0 } })],
        errors: [
          { row: 4, message: 'Data ilegível' },
          { row: 9, message: 'Valor ilegível' },
        ],
      }),
    );
    expect(screen.getByText('Nada novo para importar')).toBeTruthy();
    expect(screen.getByText('Transferência a confirmar')).toBeTruthy();
    expect(screen.getByText('Investimento')).toBeTruthy();
    expect(screen.getByText('Outros')).toBeTruthy();
    expect(screen.getByText(/1 parece ir para uma conta sua/)).toBeTruthy();
    expect(screen.queryByText('Compra 26')).toBeNull();

    await fireEvent.press(screen.getByText('+ 2 transações'));
    expect(screen.getByText('Compra 26')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mostrar menos'));
    expect(screen.queryByText('Compra 26')).toBeNull();

    await fireEvent.press(screen.getByText('2 linhas não foram lidas · ver quais'));
    expect(screen.getByText('Linha 4: Data ilegível')).toBeTruthy();
    await fireEvent.press(screen.getByText('2 linhas não foram lidas · esconder'));
    expect(screen.queryByText('Linha 4: Data ilegível')).toBeNull();
  });

  it('shows the side panel on a computer', async () => {
    const dims = jest.spyOn(
      jest.requireActual<typeof import('react-native')>('react-native'),
      'useWindowDimensions',
    );
    dims.mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
    await render(<UploadScreen />);
    expect(screen.getByText('Enviar extrato')).toBeTruthy();
    expect(screen.queryByText('‹ Início')).toBeNull();
    dims.mockRestore();
  });

  it('accepts a file dropped on the page in the browser', () => {
    const file = { name: 'x.csv', type: 'text/csv' } as File;
    expect(droppedFile({ dataTransfer: { files: [file] } as unknown as DataTransfer })).toEqual({
      name: 'x.csv',
      uri: '',
      mimeType: 'text/csv',
      file,
    });
    expect(droppedFile({ dataTransfer: null })).toBeNull();
    expect(droppedFile({ dataTransfer: { files: [] } as unknown as DataTransfer })).toBeNull();
    expect(Platform.OS).not.toBe('web');
  });

  it('labels a preview line by what will happen to it', () => {
    expect(rowLabel(row({ status: 'skipped' }))).toBe('fora do período');
    expect(rowLabel(row({ kind: 'transfer' }))).toBe('Entre suas contas');
    expect(rowLabel(row())).toBe('Mercado');
  });
  it('shows nothing extra while the lists are still loading', async () => {
    mockAccounts.mockReturnValue({ data: undefined } as ReturnType<typeof useAccounts>);
    mockImports.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useImports>);
    await render(<UploadScreen />);
    expect(screen.queryByText('Envios anteriores')).toBeNull();
  });

  it('shows a file without a bank by its name, with one new line and no notes', async () => {
    await openFile(
      preview({
        bank: null,
        filename: 'mov.csv',
        period_start: '2026-11-01',
        period_end: '2026-11-10',
        groups: [group({ counts: { new: 1, duplicate: 0, skipped: 0 } })],
      }),
    );
    expect(screen.getByText('Mo')).toBeTruthy();
    expect(screen.getByText('nova')).toBeTruthy();
    expect(screen.queryByText('Importar a partir de')).toBeNull();
    expect(screen.getByText('Importar 1 transação')).toBeTruthy();
  });

  it('ignores a pick while a file is being read or imported', async () => {
    const read = jest.fn<(f: unknown) => Promise<void>>();
    await pickAndRead({ busy: true, read });
    expect(mockPick).not.toHaveBeenCalled();
    picked();
    await pickAndRead({ busy: false, read });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ name: 'extrato.csv' }));
  });
});

describe('useUploadFlow', () => {
  it('does nothing when asked to act before a file was read', async () => {
    const { result } = await renderHook(() => useUploadFlow());
    await act(() => result.current.chooseCurrency('EUR'));
    await act(() => result.current.submit());
    await act(() => result.current.selectSince('2026-10-01'));
    await act(() => result.current.cancel());
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockRefreshMoney).toHaveBeenCalledTimes(1);
  });

  it('drops a late error from a change that was already replaced', async () => {
    let failFirst: (e: Error) => void = () => undefined;
    mockUpload.mockResolvedValueOnce(preview());
    mockRefresh
      .mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
      .mockResolvedValueOnce(preview({ filename: 'novo.csv' }));
    const { result } = await renderHook(() => useUploadFlow());
    await act(() => result.current.read({ name: 'a.csv', uri: 'file:///a.csv' }));
    await act(async () => result.current.selectSince('2026-10-01'));
    await act(async () => result.current.selectSince(null));
    await waitFor(() => expect(result.current.preview?.filename).toBe('novo.csv'));
    await act(async () => failFirst(new ApiError(500, 'tarde demais')));
    expect(result.current.error).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });
});
