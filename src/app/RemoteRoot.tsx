import { createRemoteStore } from '../lib/remoteStore';
import type { Store } from '../lib/types';
import { App } from './App';
import { StoreProvider } from './StoreContext';

// One store per group link for the life of the page.
const stores = new Map<string, Store>();
function storeFor(groupCode: string): Store {
  let s = stores.get(groupCode);
  if (!s) {
    s = createRemoteStore(groupCode);
    stores.set(groupCode, s);
  }
  return s;
}

/** The real group: data lives on the server and syncs between everyone's phones. */
export function RemoteRoot({ groupCode }: { groupCode: string }) {
  return (
    <StoreProvider store={storeFor(groupCode)}>
      <App mode={{ kind: 'group', groupCode }} />
    </StoreProvider>
  );
}
