import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import { App } from './app/App';
import { RemoteRoot } from './app/RemoteRoot';
import { StoreProvider } from './app/StoreContext';
import { ToastProvider } from './components/Toast';
import { demoState } from './lib/demo';
import { createLocalStore } from './lib/localStore';
import { setMeScope } from './lib/me';

// /g/<code> is the real group (data on the server). The main address is a demo with made-up
// players that only lives in this browser, for the portfolio.
const groupCode = location.pathname.match(/^\/g\/([A-Za-z0-9_-]{1,64})\/?$/)?.[1];
setMeScope(groupCode ?? 'demo');
const DEMO_KEY = 'poker-bank:demo:v1';

// Only the real group is installable, and its home-screen icon opens the group.
if (groupCode) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = `/api/manifest?g=${encodeURIComponent(groupCode)}`;
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {groupCode ? (
        <RemoteRoot groupCode={groupCode} />
      ) : (
        <StoreProvider store={createLocalStore(DEMO_KEY, demoState)}>
          <App mode={{ kind: 'demo', storageKey: DEMO_KEY }} />
        </StoreProvider>
      )}
    </ToastProvider>
  </StrictMode>,
);
