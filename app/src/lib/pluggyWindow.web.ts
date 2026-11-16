// Pluggy Connect on the web: a window over the page, served by Pluggy.
import { windowProps, type OpenWindow } from './brazilWindow';

export const canOpenPluggy = true;

export const openPluggyWindow: OpenWindow = async (connectToken, connectorId, ends) => {
  // Loaded only when someone connects a bank: it is big and only this needs it.
  const { PluggyConnect } = await import('pluggy-connect-sdk');
  const widget = new PluggyConnect(windowProps(connectToken, connectorId, ends));
  await widget.init();
  return () => void widget.destroy();
};
