import type { Cents } from './money';
import type { Buyin, DbState, Game, Payment, Player, Seat } from './types';

export const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

/** The game in progress (live or cashing out), if any. */
export function currentGame(s: DbState): Game | null {
  return [...s.games].sort(byNewest).find((g) => g.status !== 'settled') ?? null;
}

export function paymentsFor(s: DbState, gameId: string): Payment[] {
  return s.payments.filter((p) => p.gameId === gameId);
}

/**
 * The game the app should open on: the newest game, if it's still being played,
 * or settled with payments not yet ticked off. Otherwise null (show the start screen).
 */
export function openGame(s: DbState): Game | null {
  const newest = [...s.games].sort(byNewest)[0];
  if (!newest) return null;
  if (newest.status !== 'settled') return newest;
  return paymentsFor(s, newest.id).some((p) => !p.paidAt) ? newest : null;
}

/** The most recent game before `beforeGameId` (or overall), used for "Same players as last time". */
export function previousGame(s: DbState, beforeGameId?: string): Game | null {
  return [...s.games].sort(byNewest).find((g) => g.id !== beforeGameId && s.seats.some((x) => x.gameId === g.id)) ?? null;
}

export function playerById(s: DbState, id: string | null | undefined): Player | undefined {
  return id ? s.players.find((p) => p.id === id) : undefined;
}

export interface SeatView extends Seat {
  player: Player;
  buyins: Buyin[];
  totalIn: Cents;
}

export function seatsFor(s: DbState, gameId: string): SeatView[] {
  return s.seats
    .filter((x) => x.gameId === gameId)
    .sort((a, b) => a.seatOrder - b.seatOrder)
    .map((seat) => {
      const buyins = s.buyins
        .filter((b) => b.gameId === gameId && b.playerId === seat.playerId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        ...seat,
        player: playerById(s, seat.playerId) ?? { id: seat.playerId, name: 'Unknown', etransferContact: null },
        buyins,
        totalIn: buyins.reduce((t, b) => t + b.amountCents, 0),
      };
    });
}

export function potFor(s: DbState, gameId: string): Cents {
  return s.buyins.filter((b) => b.gameId === gameId).reduce((t, b) => t + b.amountCents, 0);
}

/**
 * The amount to pre-select in the rebuy picker: this player's last buy-in,
 * otherwise the most common buy-in tonight, otherwise the first preset.
 */
export function suggestedAmount(s: DbState, gameId: string, playerId: string): Cents {
  const tonight = s.buyins.filter((b) => b.gameId === gameId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const mine = tonight.filter((b) => b.playerId === playerId);
  if (mine.length) return mine[mine.length - 1].amountCents;
  const counts = new Map<Cents, number>();
  for (const b of tonight) counts.set(b.amountCents, (counts.get(b.amountCents) ?? 0) + 1);
  let best: Cents | null = null;
  for (const [amt, n] of counts) if (best == null || n > counts.get(best)!) best = amt;
  return best ?? s.settings.presetCents[0] ?? 5000;
}

/** Past players not already seated, most recently played first, for the quick-add buttons. */
export function quickAddPlayers(s: DbState, gameId: string): Player[] {
  const seated = new Set(s.seats.filter((x) => x.gameId === gameId).map((x) => x.playerId));
  const lastPlayed = new Map<string, string>();
  for (const seat of s.seats) {
    const g = s.games.find((x) => x.id === seat.gameId);
    if (g && (lastPlayed.get(seat.playerId) ?? '') < g.createdAt) lastPlayed.set(seat.playerId, g.createdAt);
  }
  return s.players
    .filter((p) => !seated.has(p.id))
    .sort((a, b) => (lastPlayed.get(b.id) ?? '').localeCompare(lastPlayed.get(a.id) ?? '') || a.name.localeCompare(b.name));
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface PastGame {
  game: Game;
  total: Cents;
  unpaid: number;
}

/** Settled games, newest first, with how many e-Transfers are still to be ticked off. */
export function pastGames(s: DbState): PastGame[] {
  return s.games
    .filter((g) => g.status === 'settled')
    .sort(byNewest)
    .map((game) => ({
      game,
      total: game.potCents ?? potFor(s, game.id),
      unpaid: paymentsFor(s, game.id).filter((p) => !p.paidAt).length,
    }));
}

/** Earlier games with money still owed, excluding the one on screen. */
export function unpaidEarlier(s: DbState, excludeGameId?: string): PastGame[] {
  return pastGames(s).filter((p) => p.unpaid > 0 && p.game.id !== excludeGameId);
}

export const gameDate = (g: Game) =>
  new Date(g.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
