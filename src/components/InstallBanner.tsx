import { useEffect, useState } from 'react';

// Android/Chrome fires `beforeinstallprompt` when the app can be installed; we hold on to it and
// show our own button. iPhones can't be prompted, so they get a one-time tip instead.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const TIP_KEY = 'poker-bank:ios-install-tip-dismissed';

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function tipDismissed(): boolean {
  try {
    return localStorage.getItem(TIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const [, rerender] = useState(0);
  const [hideTip, setHideTip] = useState(tipDismissed);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (isInstalled()) return null;

  if (deferred) {
    return (
      <div className="install">
        <span>Add this app to your home screen for quick access on game night.</span>
        <button
          className="mini"
          onClick={async () => {
            const e = deferred;
            if (!e) return;
            await e.prompt();
            await e.userChoice;
            deferred = null;
            rerender((n) => n + 1);
          }}
        >
          Install app
        </button>
      </div>
    );
  }

  if (isIos() && !hideTip) {
    return (
      <div className="install">
        <span>
          <strong>Tip:</strong> tap <ShareIcon /> <strong>Share</strong>, then <strong>Add to Home Screen</strong> to keep this app one tap
          away.
        </span>
        <button
          className="mini ghost"
          aria-label="Dismiss tip"
          onClick={() => {
            try {
              localStorage.setItem(TIP_KEY, '1');
            } catch {
              // fine: hidden for this visit
            }
            setHideTip(true);
          }}
        >
          Got it
        </button>
      </div>
    );
  }

  return null;
}

/** The iOS share icon (a box with an arrow), so people recognise the button. */
function ShareIcon() {
  return (
    <svg className="ios-share" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
