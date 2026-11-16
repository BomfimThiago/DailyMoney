import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { connectBrazil, windowProps, type BrazilEnds, type WindowEnds } from '@/lib/brazilWindow';
import { registerBrazilItem, startBrazilConnection } from '@/lib/imports';
import { canOpenPluggy, openPluggyWindow } from '@/lib/pluggyWindow';
import { BRAZIL, ONLY_ON_SITE, useConnect } from '@/lib/useConnect';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('@/lib/queries', () => ({ useRefreshMoney: () => jest.fn() }));
jest.mock('@/lib/imports', () => ({
  startConnection: jest.fn(),
  startBrazilConnection: jest.fn(),
  registerBrazilItem: jest.fn(),
}));

const mockStart = jest.mocked(startBrazilConnection);
const mockRegister = jest.mocked(registerBrazilItem);

const windowEnds = (): jest.Mocked<WindowEnds> => ({
  item: jest.fn(),
  done: jest.fn(),
  failed: jest.fn(),
  closed: jest.fn(),
});
const brazilEnds = (): jest.Mocked<BrazilEnds> => ({
  arrived: jest.fn(),
  failed: jest.fn(),
  closed: jest.fn(),
});
// Lets everything already promised run.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockStart.mockReset();
  mockRegister.mockReset();
  mockStart.mockResolvedValue({ connect_token: 'key', connector_id: 200 });
});

describe('windowProps', () => {
  it('goes straight to Meu Pluggy, in Portuguese', () => {
    expect(windowProps('key', 200, windowEnds())).toMatchObject({
      connectToken: 'key',
      connectorIds: [200],
      selectedConnectorId: 200,
      language: 'pt',
    });
  });

  it("puts the window's events in the app's words", () => {
    const ends = windowEnds();
    const props = windowProps('key', 200, ends);
    props.onEvent({ event: 'SUBMITTED_CONSENT', timestamp: 1 });
    expect(ends.item).not.toHaveBeenCalled();
    props.onEvent({ event: 'ITEM_RESPONSE', timestamp: 2, item: { id: 'i1' } });
    expect(ends.item).toHaveBeenCalledWith('i1');
    props.onSuccess({ item: { id: 'i1' } });
    expect(ends.done).toHaveBeenLastCalledWith('i1');
    // The bank still waits for the person: the authorization exists and may finish.
    props.onError({ data: { item: { id: 'i2' } } });
    expect(ends.done).toHaveBeenLastCalledWith('i2');
    expect(ends.failed).not.toHaveBeenCalled();
    props.onError({});
    expect(ends.failed).toHaveBeenCalledTimes(1);
    props.onClose();
    expect(ends.closed).toHaveBeenCalledTimes(1);
  });
});

describe('connectBrazil', () => {
  // Starts a connection and hands back what Pluggy's window was given.
  async function opened() {
    const ends = brazilEnds();
    const close = jest.fn();
    let given: WindowEnds | undefined;
    await connectBrazil(async (token, connector, windowEnds) => {
      expect([token, connector]).toEqual(['key', 200]);
      given = windowEnds;
      return close;
    }, ends);
    return { ends, close, window: given! };
  }

  it('tells the server once, closes the window and moves on', async () => {
    mockRegister.mockResolvedValue(undefined);
    const { ends, close, window } = await opened();
    window.item('i1');
    window.item('i1');
    window.done('i1');
    await settle();
    expect(mockRegister.mock.calls).toEqual([['i1']]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ends.arrived).toHaveBeenCalledTimes(1);
    expect(ends.failed).not.toHaveBeenCalled();
  });

  it('tries once more when the server did not hear it', async () => {
    mockRegister.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { ends, window } = await opened();
    window.item('i1');
    await settle();
    window.done('i1');
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(ends.arrived).toHaveBeenCalledTimes(1);
  });

  it('says it failed when the server never hears it', async () => {
    mockRegister.mockRejectedValue(new Error('offline'));
    const { ends, close, window } = await opened();
    window.done('i1');
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(ends.failed).toHaveBeenCalledTimes(1);
    expect(ends.arrived).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('passes on a failure or a closed window', async () => {
    const { ends, window } = await opened();
    window.failed();
    window.closed();
    expect(ends.failed).toHaveBeenCalledTimes(1);
    expect(ends.closed).toHaveBeenCalledTimes(1);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('opens no window without a key', async () => {
    mockStart.mockRejectedValue(new Error('offline'));
    const open = jest.fn<Parameters<typeof connectBrazil>[0]>();
    await expect(connectBrazil(open, brazilEnds())).rejects.toThrow('offline');
    expect(open).not.toHaveBeenCalled();
  });
});

describe('in the phone app', () => {
  it("can't open Pluggy's window yet, and says where to connect", async () => {
    expect(canOpenPluggy).toBe(false);
    await expect(openPluggyWindow('key', 200, windowEnds())).rejects.toThrow();
    const { result } = await renderHook(() => useConnect());
    await act(() => result.current.connect(BRAZIL));
    expect(result.current.error).toBe(ONLY_ON_SITE);
    expect(result.current.opening).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
