import { describe, expect, it } from 'vitest';
import { demoState } from './demo';
import { openGame, pastGames, potFor, seatsFor } from './select';

describe('demo data', () => {
  const s = demoState();

  it('has two past nights and one in progress', () => {
    expect(pastGames(s)).toHaveLength(2);
    expect(openGame(s)?.status).toBe('live');
    expect(potFor(s, openGame(s)!.id)).toBe(33000);
  });

  it('settles every past night exactly (cash-outs add up to the buy-ins)', () => {
    for (const { game } of pastGames(s)) {
      const seats = seatsFor(s, game.id);
      const bought = seats.reduce((t, x) => t + x.totalIn, 0);
      const out = seats.reduce((t, x) => t + (x.cashoutCents ?? 0), 0);
      expect(out).toBe(bought);
    }
  });

  it('leaves last week with two unpaid e-Transfers to show the reminder', () => {
    expect(pastGames(s).map((p) => p.unpaid)).toEqual([2, 0]);
  });
});
