import { useDb } from '../app/StoreContext';
import { formatMoney } from '../lib/money';
import { gameDate, pastGames } from '../lib/select';

export function HistoryScreen({ onOpen, onBack }: { onOpen: (gameId: string) => void; onBack: () => void }) {
  const db = useDb();
  const games = pastGames(db);

  return (
    <>
      <button className="textlink back" onClick={onBack}>
        ← Back
      </button>
      <header className="page-head">
        <h1>Past games</h1>
      </header>
      {games.length === 0 ? (
        <p className="empty">Games show up here once they're settled.</p>
      ) : (
        <ul className="history">
          {games.map(({ game, total, unpaid }) => (
            <li key={game.id}>
              <button onClick={() => onOpen(game.id)}>
                <span>
                  <span className="h-date">{gameDate(game)}</span>
                  <span className="muted small">{formatMoney(total)} on the table</span>
                </span>
                <span className={'h-status' + (unpaid ? ' is-unpaid' : '')}>
                  {unpaid ? `${unpaid} unpaid` : '✓ All paid'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
