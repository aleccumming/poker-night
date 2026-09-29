import { useState } from 'react';
import { useAct, useDb } from '../app/StoreContext';
import { WhoAreYou } from '../components/WhoAreYou';
import { setMe, useMe } from '../lib/me';
import { playerById, previousGame, quickAddPlayers, seatsFor } from '../lib/select';

interface Props {
  onBackToSettle?: () => void;
  onHistory: () => void;
}

export function HomeScreen({ onBackToSettle, onHistory }: Props) {
  const db = useDb();
  const act = useAct();
  const me = playerById(db, useMe());
  // Someone new who typed their name: they'll be created when they start the game.
  const [newName, setNewName] = useState<string | null>(null);
  const myName = me?.name ?? newName;

  const last = previousGame(db);
  const lastNames = last ? seatsFor(db, last.id).map((s) => s.player.name) : [];
  const shownNames = lastNames.length > 5 ? `${lastNames.slice(0, 5).join(', ')} +${lastNames.length - 5}` : lastNames.join(', ');

  const start = async (sameAsLast: boolean) => {
    if (!myName) return;
    const r = await act((a) => a.startGame({ sameAsLast, starterName: myName }));
    if (r) setMe(r.playerId);
  };

  return (
    <>
      <header className="page-head">
        <h1>Poker night</h1>
        <p className="muted">Track buy-ins, count chips, settle up.</p>
      </header>

      <div className="card start">
        <h2>Start tonight's game</h2>
        {!myName ? (
          <WhoAreYou
            prompt="First, which one are you?"
            players={quickAddPlayers(db, '')}
            onChoose={(p) => setMe(p.id)}
            onNew={setNewName}
          />
        ) : (
          <>
            <p className="muted">
              You're <strong className="ink">{myName}</strong>.{' '}
              <button
                className="inline-link"
                onClick={() => {
                  setMe(null);
                  setNewName(null);
                }}
              >
                Not {myName}?
              </button>
            </p>
            <button className="primary big" onClick={() => start(false)}>
              Start game
            </button>
            {lastNames.length > 1 && (
              <>
                <button className="secondary" onClick={() => start(true)}>
                  Start with last game's players
                </button>
                <p className="muted small start-who">{shownNames}</p>
              </>
            )}
            <p className="muted small">
              Whoever starts the game is the banker (you can change it later). Everyone else joins from their own phone.
            </p>
          </>
        )}
      </div>

      {onBackToSettle && (
        <button className="textlink" onClick={onBackToSettle}>
          Back to last game's payments
        </button>
      )}
      <button className="textlink" onClick={onHistory}>
        Past games
      </button>
    </>
  );
}
