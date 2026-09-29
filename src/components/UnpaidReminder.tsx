import { useDb } from '../app/StoreContext';
import { gameDate, unpaidEarlier } from '../lib/select';

/** "Sep 22 still has 2 unpaid e-Transfers": so money from an earlier night is never forgotten. */
export function UnpaidReminder({ excludeGameId, onOpen }: { excludeGameId?: string; onOpen: (gameId: string) => void }) {
  const db = useDb();
  const games = unpaidEarlier(db, excludeGameId);
  if (!games.length) return null;
  return (
    <div className="reminders">
      {games.map(({ game, unpaid }) => (
        <button key={game.id} className="reminder" onClick={() => onOpen(game.id)}>
          <span>
            <strong>{gameDate(game)}</strong> still has {unpaid} unpaid e-Transfer{unpaid === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
