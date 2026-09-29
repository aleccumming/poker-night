import { useSyncExternalStore } from 'react';

// Which player is holding this phone. Asked once, remembered on this device (separately for the
// real group and the demo). There are no accounts, so this is on trust.
let key = 'poker-bank:me';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let current = read();

/** Call once at startup: `scope` is the group code, or "demo". */
export function setMeScope(scope: string) {
  key = `poker-bank:me:${scope}`;
  current = read();
}

export const getMe = () => current;

export function setMe(playerId: string | null) {
  current = playerId;
  try {
    if (playerId) localStorage.setItem(key, playerId);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: remembered for this visit only.
  }
  listeners.forEach((l) => l());
}

export function useMe(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
