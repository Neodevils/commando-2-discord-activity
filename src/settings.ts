// Small per-device preferences kept in localStorage. Storage can be blocked
// (private windows, cleared site data, some embedded contexts), so every access
// is guarded and the game falls back to its defaults.

const PREFIX = 'commando2.';

export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // The preference simply will not persist.
  }
}
