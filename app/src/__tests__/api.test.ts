import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { api, ApiError } from '@/lib/api';
import { listTransactions, uploadStatement } from '@/lib/imports';
import { getItem, removeItem, setItem } from '@/lib/storage';

jest.mock('@/lib/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const store = new Map<string, string>();
const fetchMock = jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const reply = (status: number, body?: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  }) as Response;

const sent = (call: number) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
};

beforeEach(() => {
  store.clear();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
  jest.mocked(getItem).mockImplementation((key) => Promise.resolve(store.get(key) ?? null));
  jest.mocked(setItem).mockImplementation((key, value) => {
    store.set(key, value);
    return Promise.resolve();
  });
  jest.mocked(removeItem).mockImplementation((key) => {
    store.delete(key);
    return Promise.resolve();
  });
});

describe('api', () => {
  it('sends JSON with the saved access token and returns the body', async () => {
    store.set('dm.access', 'tok-1');
    fetchMock.mockResolvedValueOnce(reply(200, { ok: 1 }));

    await expect(api('/accounts')).resolves.toEqual({ ok: 1 });

    const { url, headers } = sent(0);
    expect(url).toMatch(/\/api\/v1\/accounts$/);
    expect(headers.get('Authorization')).toBe('Bearer tok-1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('sends no token when signed out', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await api('/health');
    expect(sent(0).headers.has('Authorization')).toBe(false);
  });

  it('returns nothing for 204', async () => {
    fetchMock.mockResolvedValueOnce(reply(204));
    await expect(api('/accounts/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('turns a server error into ApiError with its message', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, { detail: 'Conta não encontrada' }));
    await expect(api('/accounts/x')).rejects.toEqual(new ApiError(404, 'Conta não encontrada'));
  });

  it('uses a generic message when the error has no body', async () => {
    fetchMock.mockResolvedValueOnce(reply(500));
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, message: 'Algo deu errado. Tente de novo.' });
  });

  it('reports a missing connection as status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api('/x')).rejects.toMatchObject({
      status: 0,
      message: 'Sem conexão com o servidor',
    });
  });

  it('refreshes an expired session once and retries with the new token', async () => {
    store.set('dm.access', 'old');
    store.set('dm.refresh', 'r-1');
    fetchMock
      .mockResolvedValueOnce(reply(401, { detail: 'expirado' }))
      .mockResolvedValueOnce(reply(200, { access_token: 'new', refresh_token: 'r-2' }))
      .mockResolvedValueOnce(reply(200, { ok: 2 }));

    await expect(api('/accounts')).resolves.toEqual({ ok: 2 });

    expect(sent(1).url).toMatch(/\/auth\/refresh$/);
    expect(JSON.parse(sent(1).init.body as string)).toEqual({ refresh_token: 'r-1' });
    expect(sent(1).headers.has('Authorization')).toBe(false);
    expect(sent(2).headers.get('Authorization')).toBe('Bearer new');
    expect(store.get('dm.access')).toBe('new');
    expect(store.get('dm.refresh')).toBe('r-2');
  });

  it('signs out when the refresh is refused', async () => {
    store.set('dm.access', 'old');
    store.set('dm.refresh', 'r-1');
    fetchMock
      .mockResolvedValueOnce(reply(401, { detail: 'Sessão expirada' }))
      .mockResolvedValueOnce(reply(401, {}));

    await expect(api('/accounts')).rejects.toMatchObject({
      status: 401,
      message: 'Sessão expirada',
    });
    expect(store.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not try to refresh without a refresh token', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { detail: 'Faça login' }));
    await expect(api('/accounts')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('listTransactions', () => {
  it('asks for 20 by default', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { items: [] }));
    await listTransactions();
    expect(sent(0).url).toMatch(/\/transactions\?limit=20$/);
  });

  it('sends only the filters that are set, with the search trimmed', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { items: [] }));
    await listTransactions({
      limit: 50,
      offset: 100,
      month: '2026-11',
      q: '  padaria ',
      categoryId: 'c1',
      accountId: 'a1',
      kinds: ['regular', 'pending'],
    });
    const query = new URL(sent(0).url, 'http://x').searchParams;
    expect(query.get('limit')).toBe('50');
    expect(query.get('offset')).toBe('100');
    expect(query.get('month')).toBe('2026-11');
    expect(query.get('q')).toBe('padaria');
    expect(query.get('category_id')).toBe('c1');
    expect(query.get('account_id')).toBe('a1');
    expect(query.getAll('kind')).toEqual(['regular', 'pending']);
  });

  it('leaves out an offset of 0 and a blank search', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { items: [] }));
    await listTransactions({ offset: 0, q: '   ' });
    const query = new URL(sent(0).url, 'http://x').searchParams;
    expect(query.has('offset')).toBe(false);
    expect(query.has('q')).toBe(false);
  });
});

describe('uploadStatement', () => {
  it('sends a browser file as multipart, without a JSON content type', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: 'imp' }));
    const file = new Blob(['a;b'], { type: 'text/csv' });
    await uploadStatement({ name: 'extrato.csv', uri: 'blob:1', file } as never, 'EUR');

    const { url, init, headers } = sent(0);
    expect(url).toMatch(/\/imports$/);
    expect(init.method).toBe('POST');
    expect(headers.has('Content-Type')).toBe(false);
    const form = init.body as FormData;
    expect(form.get('default_currency')).toBe('EUR');
    expect(form.get('file')).toBeTruthy();
  });

  it('sends a phone file as uri, name and type, with no currency when none is chosen', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: 'imp' }));
    const append = jest.spyOn(FormData.prototype, 'append');
    await uploadStatement({ name: 'extrato.ofx', uri: 'file:///x.ofx' } as never);

    expect(append).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({
        uri: 'file:///x.ofx',
        name: 'extrato.ofx',
        type: 'application/octet-stream',
      }),
    );
    expect(append).toHaveBeenCalledTimes(1);
    append.mockRestore();
  });
});
