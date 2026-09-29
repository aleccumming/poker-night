import { useEffect, useState } from 'react';
import { InstallBanner } from '../components/InstallBanner';
import { UnpaidReminder } from '../components/UnpaidReminder';
import { useClearToast } from '../components/Toast';
import { openGame } from '../lib/select';
import { CashOutScreen } from '../screens/CashOutScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShareScreen } from '../screens/ShareScreen';
import { SettleUpScreen } from '../screens/SettleUpScreen';
import { TableScreen } from '../screens/table/TableScreen';
import { useDb, useSync } from './StoreContext';

type View = { kind: 'main' } | { kind: 'history' } | { kind: 'past'; gameId: string } | { kind: 'share' } | { kind: 'settings' };

/** The real group (data on the server) or the portfolio demo (made-up data in this browser). */
export type Mode = { kind: 'group'; groupCode: string } | { kind: 'demo'; storageKey: string };

export function App({ mode }: { mode: Mode }) {
  const db = useDb();
  const sync = useSync();
  const open = openGame(db);
  const [view, setView] = useState<View>({ kind: 'main' });

  // Once a settle-up screen is showing, keep it on screen until "Done", even after the
  // last payment is ticked (which would otherwise move the game straight to history).
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // "Start next game" while last game still has unpaid payments.
  const [wantsNew, setWantsNew] = useState(false);

  const pinned = db.games.find((g) => g.id === pinnedId && g.status === 'settled');
  const game = open && open.status !== 'settled' ? open : wantsNew ? null : (pinned ?? open);
  const past = view.kind === 'past' ? db.games.find((g) => g.id === view.gameId && g.status === 'settled') : undefined;

  useEffect(() => {
    if (game?.status === 'settled' && game.id !== pinnedId) setPinnedId(game.id);
    if (game && game.status !== 'settled' && wantsNew) setWantsNew(false);
  }, [game, pinnedId, wantsNew]);

  // An "Undo" from one screen must never be tappable on the next (e.g. undoing a buy-in after settling).
  const clearToast = useClearToast();
  const screenKey = view.kind === 'main' ? (game ? `${game.id}:${game.status}` : 'home') : JSON.stringify(view);
  useEffect(() => {
    clearToast();
    window.scrollTo(0, 0);
  }, [screenKey, clearToast]);

  const openPast = (gameId: string) => setView({ kind: 'past', gameId });
  const reminder = <UnpaidReminder excludeGameId={game?.id} onOpen={openPast} />;

  let screen;
  if (!sync.loaded) {
    screen = <p className="empty loading">Loading…</p>;
  } else if (sync.notFound) {
    screen = (
      <div className="empty">
        <h1>This link isn't right</h1>
        <p>Ask the host for the group link again.</p>
      </div>
    );
  } else if (view.kind === 'share') {
    const link = mode.kind === 'group' ? `${location.origin}/g/${mode.groupCode}` : location.origin + '/';
    screen = <ShareScreen link={link} isDemo={mode.kind === 'demo'} onBack={() => setView({ kind: 'main' })} />;
  } else if (view.kind === 'settings') {
    screen = <SettingsScreen onBack={() => setView({ kind: 'main' })} />;
  } else if (view.kind === 'history') {
    screen = <HistoryScreen onOpen={openPast} onBack={() => setView({ kind: 'main' })} />;
  } else if (past) {
    screen = <SettleUpScreen game={past} canReopen={false} onBack={() => setView({ kind: 'history' })} />;
  } else if (!game) {
    screen = (
      <>
        {reminder}
        <HomeScreen
          onBackToSettle={wantsNew && open ? () => setWantsNew(false) : undefined}
          onHistory={() => setView({ kind: 'history' })}
        />
      </>
    );
  } else if (game.status === 'live') {
    screen = (
      <>
        {reminder}
        <TableScreen game={game} />
      </>
    );
  } else if (game.status === 'cashout') {
    screen = <CashOutScreen game={game} />;
  } else {
    screen = (
      <>
        {reminder}
        <SettleUpScreen
          game={game}
          onDone={() => setPinnedId(null)}
          onStartNext={() => {
            setPinnedId(null);
            setWantsNew(true);
          }}
          onHistory={() => setView({ kind: 'history' })}
        />
      </>
    );
  }

  const onMain = view.kind === 'main' || view.kind === 'history' || view.kind === 'past';
  const ready = sync.loaded && !sync.notFound;

  return (
    <main className="app">
      {sync.offline && sync.loaded && <p className="offline">Can't reach the server. Retrying…</p>}
      {mode.kind === 'demo' && <DemoBanner storageKey={mode.storageKey} />}
      {ready && onMain && (
        <nav className="topnav" aria-label="Menu">
          <button onClick={() => setView({ kind: 'share' })}>{mode.kind === 'demo' ? 'Share' : 'Invite'}</button>
          <button onClick={() => setView({ kind: 'settings' })}>Settings</button>
        </nav>
      )}
      {ready && mode.kind === 'group' && onMain && <InstallBanner />}
      {screen}
    </main>
  );
}

/** Explains the demo and lets visitors start it over. */
function DemoBanner({ storageKey }: { storageKey: string }) {
  return (
    <p className="demo-banner">
      <strong>Demo</strong> with made-up players. Try anything: changes only stay in this browser.{' '}
      <button
        className="inline-link"
        onClick={() => {
          try {
            localStorage.removeItem(storageKey);
            localStorage.removeItem('poker-bank:me:demo');
          } catch {
            // nothing saved anyway
          }
          location.reload();
        }}
      >
        Start over
      </button>
    </p>
  );
}
