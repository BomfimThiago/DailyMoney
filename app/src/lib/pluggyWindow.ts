// Pluggy Connect in the phone app needs a web view the app doesn't ship yet; there,
// Brazilian banks are connected on the site. The web version is pluggyWindow.web.ts.
import type { OpenWindow } from './brazilWindow';

export const canOpenPluggy = false;

export const openPluggyWindow: OpenWindow = () =>
  Promise.reject(new Error('Pluggy Connect only opens on the web'));
