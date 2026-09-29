import { applyAction, emptyState, newId, type Action } from './reducer';
import { seatsFor } from './select';
import { settle } from './settle';
import type { DbState } from './types';

// Made-up data for the demo (the main address, linked from the portfolio). It's built by playing
// real actions through the same rules the app uses, so it's always consistent.

const DAY = 24 * 60 * 60 * 1000;

function night(
  s: DbState,
  daysAgo: number,
  starter: string,
  others: string[],
  buyins: [string, number][],
  chips: Record<string, number> | null,
  paidCount = Infinity,
): DbState {
  const t0 = Date.now() - daysAgo * DAY;
  let minute = 0;
  const at = () => new Date(t0 + minute++ * 60_000).toISOString();
  const run = (a: Action) => (s = applyAction(s, a));
  const idOf = (name: string) => s.players.find((p) => p.name === name)!.id;

  const gameId = newId();
  run({ type: 'startGame', id: gameId, at: at(), sameAsLast: false, starterName: starter, newPlayerId: newId() });
  for (const n of others) run({ type: 'seatPlayer', gameId, name: n, newPlayerId: newId() });
  for (const [n, dollars] of buyins) {
    run({ type: 'addBuyin', buyin: { id: newId(), gameId, playerId: idOf(n), amountCents: dollars * 100, createdAt: at() } });
  }
  if (!chips) return s;

  run({ type: 'setStatus', gameId, status: 'cashout' });
  const game = s.games.find((g) => g.id === gameId)!;
  const r = settle(
    seatsFor(s, gameId).map((x) => ({ id: x.playerId, boughtIn: x.totalIn, chips: Math.round(chips[x.player.name] * 100) })),
    game.bankerId!,
  );
  run({
    type: 'settleGame',
    gameId,
    potCents: r.pot,
    seats: r.rows.map((x) => ({ playerId: x.id, chipCents: x.chips, cashoutCents: x.cashout })),
    payments: r.payments.map((p) => ({ id: newId(), fromId: p.fromId, toId: p.toId, amountCents: p.amount })),
  });
  s.payments
    .filter((p) => p.gameId === gameId)
    .slice(0, paidCount)
    .forEach((p) => run({ type: 'setPaid', paymentId: p.id, paid: true, at: at() }));
  return s;
}

export function demoState(): DbState {
  let s = emptyState();
  s = night(s, 14, 'Maya', ['Jordan', 'Priya', 'Theo', 'Sam'],
    [['Maya', 50], ['Jordan', 50], ['Priya', 50], ['Theo', 50], ['Sam', 50], ['Theo', 50], ['Sam', 100]],
    { Maya: 112.5, Jordan: 38.75, Priya: 141, Theo: 0, Sam: 108 }); // 25¢ over the $400: winners give a sliver back
  s = night(s, 7, 'Jordan', ['Maya', 'Priya', 'Sam', 'Lee'],
    [['Jordan', 50], ['Maya', 50], ['Priya', 100], ['Sam', 50], ['Lee', 50], ['Sam', 50], ['Lee', 20]],
    { Jordan: 96, Maya: 0, Priya: 160, Sam: 57.5, Lee: 52.5 }, 2); // $4 under the $370: the banker keeps it; two payments unticked
  s = night(s, 0, 'Priya', ['Maya', 'Jordan', 'Theo', 'Sam'],
    [['Priya', 50], ['Maya', 50], ['Jordan', 50], ['Theo', 50], ['Sam', 50], ['Theo', 50], ['Maya', 30]],
    null); // tonight, still playing
  const priya = s.players.find((p) => p.name === 'Priya')!;
  s = applyAction(s, { type: 'setContact', playerId: priya.id, contact: 'priya@example.com' });
  return s;
}
