import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useToast } from '../components/Toast';
import type { Actions, DbState, Store, SyncStatus } from '../lib/types';

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider missing');
  return store;
}

/** The latest data. Screens re-render whenever it changes (on this phone or any other). */
export function useDb(): DbState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Whether the first load has finished, and whether the server is reachable. */
export function useSync(): SyncStatus {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSync);
}

/**
 * Runs a change and shows a friendly message if it fails.
 * Usage: `act(a => a.addBuyin(gameId, playerId, 5000))`
 */
export function useAct() {
  const store = useStore();
  const toast = useToast();
  return useCallback(
    async <T,>(fn: (a: Actions) => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn(store);
      } catch (e) {
        console.error(e);
        toast(e instanceof Error && e.message ? e.message : "That didn't save. Check your connection and try again.");
        return undefined;
      }
    },
    [store, toast],
  );
}
