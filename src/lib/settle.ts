import type { Cents } from './money';

export interface SettleInputPlayer {
  id: string;
  boughtIn: Cents;
  chips: Cents;
}

export interface Tolerance {
  minCents: Cents; // e.g. 1000 = $10
  pct: number; // e.g. 3 = 3% of the pot
}

export interface SettleRow {
  id: string;
  boughtIn: Cents;
  chips: Cents;
  /** Money back to change `chips` into `cashout`: negative for winners giving some back, positive for the banker keeping extra. */
  adjustment: Cents;
  cashout: Cents;
  net: Cents;
}

export interface Payment {
  fromId: string;
  toId: string;
  amount: Cents;
}

export interface SettleResult {
  pot: Cents;
  chipsTotal: Cents;
  /** chipsTotal − pot. Positive: chips counted more than the pot. Negative: money left over. */
  diff: Cents;
  tolerance: Cents;
  withinTolerance: boolean;
  rows: SettleRow[];
  payments: Payment[];
}

export const DEFAULT_TOLERANCE: Tolerance = { minCents: 1000, pct: 3 };

export function toleranceFor(pot: Cents, t: Tolerance): Cents {
  return Math.max(t.minCents, Math.round((pot * t.pct) / 100));
}

/**
 * Splits `total` cents across `weights` in proportion, in whole cents.
 * Each share is rounded down; the leftover cents go one each to the shares
 * that lost the most to rounding (ties: the bigger weight first).
 */
export function splitProportionally(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((s, x) => s + x, 0);
  const order = weights
    .map((w, i) => ({ i, frac: exact[i] - shares[i], w }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k].i]++;
  return shares;
}

/**
 * Works out everyone's final cash-out and the e-Transfers.
 *
 * - Chips count MORE than the pot: the gap comes out of the winners, each giving
 *   back the same percentage of what they won.
 * - Chips count LESS than the pot: the banker keeps the leftover.
 * - Losers send the banker what they lost; the banker sends winners what they won.
 */
export function settle(players: SettleInputPlayer[], bankerId: string, tol: Tolerance = DEFAULT_TOLERANCE): SettleResult {
  const pot = players.reduce((s, p) => s + p.boughtIn, 0);
  const chipsTotal = players.reduce((s, p) => s + p.chips, 0);
  const diff = chipsTotal - pot;
  const tolerance = toleranceFor(pot, tol);

  const adjustments = new Map<string, Cents>();
  if (diff > 0) {
    // Chips add up to more than the pot, so winners give some back. Because the
    // nets sum to `diff`, the winners' total winnings are always at least `diff`.
    const winners = players.filter((p) => p.chips > p.boughtIn);
    const shares = splitProportionally(diff, winners.map((p) => p.chips - p.boughtIn));
    winners.forEach((p, i) => adjustments.set(p.id, -shares[i]));
  } else if (diff < 0) {
    adjustments.set(bankerId, -diff);
  }

  const rows: SettleRow[] = players.map((p) => {
    const adjustment = adjustments.get(p.id) ?? 0;
    const cashout = p.chips + adjustment;
    return { id: p.id, boughtIn: p.boughtIn, chips: p.chips, adjustment, cashout, net: cashout - p.boughtIn };
  });

  const others = rows.filter((r) => r.id !== bankerId);
  const payments: Payment[] = [
    ...others
      .filter((r) => r.net < 0)
      .sort((a, b) => a.net - b.net)
      .map((r) => ({ fromId: r.id, toId: bankerId, amount: -r.net })),
    ...others
      .filter((r) => r.net > 0)
      .sort((a, b) => b.net - a.net)
      .map((r) => ({ fromId: bankerId, toId: r.id, amount: r.net })),
  ];

  return { pot, chipsTotal, diff, tolerance, withinTolerance: Math.abs(diff) <= tolerance, rows, payments };
}
