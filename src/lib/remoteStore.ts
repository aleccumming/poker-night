import { actionsFor, applyAction, emptyState, type Action } from './reducer';
import type { DbState, Store, SyncStatus } from './types';

const POLL_MS = 3000;


/**
 * Keeps this phone in sync with the server.
 *
 * - Changes show on screen immediately, then are sent to the server one at a time.
 * - Every 3 seconds (while the app is on screen) it asks the server "anything new?".
 * - What you see = the server's latest data + your changes still on their way.
 */
export function createRemoteStore(groupCode: string): Store {
  let server: DbState = emptyState();
  let version = -1;
  let view: DbState = server;
  let sync: SyncStatus = { loaded: false, offline: false, notFound: false };
  const pending: Action[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const setSync = (next: Partial<SyncStatus>) => {
    const merged = { ...sync, ...next };
    if (merged.loaded !== sync.loaded || merged.offline !== sync.offline || merged.notFound !== sync.notFound) sync = merged;
  };

  function recompute() {
    view = pending.reduce((s, a) => {
      try {
        return applyAction(s, a);
      } catch {
        return s; // no longer applies (e.g. someone else deleted it); the server will say so
      }
    }, server);
    emit();
  }

  function accept(body: { version: number; state?: DbState }) {
    if (body.state && body.version >= version) {
      server = body.state;
      version = body.version;
    }
  }

  async function poll() {
    if (pending.length || sync.notFound) return;
    try {
      const res = await fetch(`/api/state?g=${encodeURIComponent(groupCode)}&v=${version}`, { cache: 'no-store' });
      if (res.status === 404) {
        setSync({ loaded: true, offline: false, notFound: true });
        emit();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (pending.length) return; // a change started while we were asking; its reply is newer
      accept(body);
      setSync({ loaded: true, offline: false });
      recompute();
    } catch {
      setSync({ offline: true });
      emit();
    }
  }

  async function send(a: Action) {
    let res: Response;
    try {
      res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ g: groupCode, action: a }),
      });
    } catch {
      pending.shift();
      setSync({ offline: true });
      recompute();
      throw new Error("Couldn't reach the server, so that didn't save. Check your connection and try again.");
    }
    const body = await res.json().catch(() => ({}));
    pending.shift();
    setSync({ offline: false });
    if (res.ok) {
      accept(body);
      recompute();
      return;
    }
    recompute();
    void poll();
    throw new Error(body.error || "That didn't save. Try again.");
  }

  async function dispatch(a: Action) {
    applyAction(view, a); // throws a friendly error right away if it isn't allowed
    pending.push(a);
    recompute();
    const job = queue.then(() => send(a));
    queue = job.catch(() => undefined);
    return job;
  }

  // Start syncing.
  if (typeof window !== 'undefined') {
    void poll();
    window.setInterval(() => document.visibilityState === 'visible' && void poll(), POLL_MS);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void poll());
    window.addEventListener('online', () => void poll());
    window.addEventListener('focus', () => void poll());
  }

  return {
    getState: () => view,
    getSync: () => sync,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...actionsFor(dispatch, () => view),
  };
}
