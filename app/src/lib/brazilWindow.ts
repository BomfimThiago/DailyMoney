// Connecting a Brazilian bank: Pluggy only lets its own window (Pluggy Connect) create
// the authorization, so the app opens it and tells the server what it produced.
import { registerBrazilItem, startBrazilConnection } from './imports';

// What Pluggy's window reports, in the app's words.
export type WindowEnds = {
  // An authorization (an "item") exists at Pluggy. It may be reported many times.
  item: (itemId: string) => void;
  // The person is through: authorized, or left to finish in the bank's own app.
  done: (itemId: string) => void;
  failed: () => void;
  closed: () => void;
};

type WithItem = { item: { id: string } };
const hasItem = (o: object): o is WithItem => 'item' in o;

// The settings Pluggy's window takes: straight to Meu Pluggy, in Portuguese.
export function windowProps(connectToken: string, connectorId: number, ends: WindowEnds) {
  return {
    connectToken,
    connectorIds: [connectorId],
    selectedConnectorId: connectorId,
    language: 'pt',
    onEvent: (payload: object) => {
      if (hasItem(payload)) ends.item(payload.item.id);
    },
    onSuccess: ({ item }: WithItem) => ends.done(item.id),
    // Some banks answer "waiting for the person" as an error and finish afterwards.
    onError: ({ data }: { data?: WithItem }) => (data ? ends.done(data.item.id) : ends.failed()),
    onClose: ends.closed,
  };
}

// Opens the window; the promise answers a function that takes it off the page.
export type OpenWindow = (
  connectToken: string,
  connectorId: number,
  ends: WindowEnds,
) => Promise<() => void>;

export type BrazilEnds = {
  // The server knows the authorization: the return page can ask whether it's connected.
  arrived: () => void;
  failed: () => void;
  closed: () => void;
};

export async function connectBrazil(open: OpenWindow, ends: BrazilEnds): Promise<void> {
  const { connect_token, connector_id } = await startBrazilConnection();
  // The server hears about each authorization once, however often the window says it.
  const told = new Map<string, Promise<void>>();
  const tell = (itemId: string) => {
    const before = told.get(itemId);
    if (before) return before;
    const telling = registerBrazilItem(itemId);
    told.set(itemId, telling);
    telling.catch(() => told.delete(itemId));
    return telling;
  };
  let close = () => {};
  close = await open(connect_token, connector_id, {
    item: (itemId) => void tell(itemId).catch(() => undefined),
    done: (itemId) =>
      void tell(itemId)
        // Without this the server never learns of the bank: one more try is worth it.
        .catch(() => tell(itemId))
        .then(() => {
          close();
          ends.arrived();
        }, ends.failed),
    failed: ends.failed,
    closed: ends.closed,
  });
}
