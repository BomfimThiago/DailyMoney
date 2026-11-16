import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewImportsSetting } from '@/components/settings/ReviewImportsSetting';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

jest.mock('@/lib/api', () => ({ api: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
const mockRefresh = jest.fn();
jest.mock('@/lib/queries', () => ({ useRefreshMoney: () => mockRefresh }));
const mockApi = jest.mocked(api);
const signedIn = (review_imports: boolean) =>
  jest.mocked(useAuth).mockReturnValue({
    state: { status: 'signedIn', me: { family: { review_imports } } },
  } as ReturnType<typeof useAuth>);

beforeEach(() => {
  mockApi.mockReset();
  mockRefresh.mockReset();
});

describe('ReviewImportsSetting', () => {
  it('turns the review off and back on', async () => {
    signedIn(true);
    mockApi.mockResolvedValue(undefined);
    await render(<ReviewImportsSetting />);
    expect(screen.getByText('Ligado: aprovo antes de contar')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-imports'));
    expect(mockApi).toHaveBeenCalledWith('/family', {
      method: 'PATCH',
      body: JSON.stringify({ review_imports: false }),
    });
    expect(await screen.findByText('Desligado: entram direto')).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('says when saving fails', async () => {
    signedIn(false);
    mockApi.mockRejectedValue(new Error('down'));
    await render(<ReviewImportsSetting />);
    await fireEvent.press(screen.getByTestId('review-imports'));
    expect(await screen.findByText('Não consegui salvar. Tente de novo.')).toBeTruthy();
    expect(screen.getByText('Desligado: entram direto')).toBeTruthy();
  });
});
