import { actionsFor, applyAction, emptyState, type Action } from './reducer';
import type { DbState, Store, SyncStatus } from './types';

const READY: SyncStatus = { loaded: true, offline: false, notFound: false };

/** A store that keeps everything in this browser's localStorage. Used for the demo and quick local testing. */
export function createLocalStore(storageKey: string, seed?: () => DbState): Store {
  let state: DbState = load();
  const listeners = new Set<() => void>();

  function load(): DbState {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...emptyState(), ...JSON.parse(raw) };
    } catch {
      // Storage blocked or corrupt: start fresh.
    }
    return seed ? seed() : emptyState();
  }

  async function dispatch(a: Action) {
    state = applyAction(state, a);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Private mode etc. The app still works for this session.
    }
    listeners.forEach((l) => l());
  }

  // Keep other tabs in sync.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === storageKey) {
        state = load();
        listeners.forEach((l) => l());
      }
    });
  }

  return {
    getState: () => state,
    getSync: () => READY,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...actionsFor(dispatch, () => state),
  };
}
