// localStorage can throw (private mode, blocked storage); the app then just asks to sign in again.
export async function getItem(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: session lasts only for this tab
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
