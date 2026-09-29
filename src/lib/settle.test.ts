import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';
import { settle, splitProportionally, toleranceFor } from './settle';

const $ = (d: number) => Math.round(d * 100);

describe('money', () => {
  it('parses what people type', () => {
    expect(parseMoney('47.75')).toBe(4775);
    expect(parseMoney('$50')).toBe(5000);
    expect(parseMoney(' 1,200 ')).toBe(120000);
    expect(parseMoney('.5')).toBe(50);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
  });
  it('formats cleanly', () => {
    expect(formatMoney(5000)).toBe('$50');
    expect(formatMoney(4775)).toBe('$47.75');
    expect(formatMoney(4750)).toBe('$47.50');
    expect(formatMoney(-1200)).toBe('−$12');
    expect(formatMoney(1200, { signed: true })).toBe('+$12');
    expect(formatMoney(123456)).toBe('$1,234.56');
  });
});

describe('splitProportionally', () => {
  it('always adds up to the total', () => {
    const shares = splitProportionally(1000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b)).toBe(1000);
    expect([...shares].sort()).toEqual([333, 333, 334]);
  });
});

describe('tolerance', () => {
  it('is the larger of $10 or 3% of the pot', () => {
    expect(toleranceFor($(200), { minCents: 1000, pct: 3 })).toBe($(10));
    expect(toleranceFor($(800), { minCents: 1000, pct: 3 })).toBe($(24));
  });
});

describe('settle', () => {
  // Pot is $500. Dave is the banker.
  const base = [
    { id: 'alex', boughtIn: $(100), chips: $(140) }, // +40
    { id: 'sam', boughtIn: $(100), chips: $(120) }, // +20
    { id: 'dave', boughtIn: $(100), chips: $(100) }, // even
    { id: 'kim', boughtIn: $(200), chips: $(140) }, // −60
  ];

  it('balances exactly when chips match the pot', () => {
    const r = settle(base, 'dave');
    expect(r.diff).toBe(0);
    expect(r.rows.every((x) => x.adjustment === 0)).toBe(true);
    expect(r.payments).toEqual([
      { fromId: 'kim', toId: 'dave', amount: $(60) },
      { fromId: 'dave', toId: 'alex', amount: $(40) },
      { fromId: 'dave', toId: 'sam', amount: $(20) },
    ]);
  });

  it('takes an overcount out of the winners by the same percentage', () => {
    // Chips count $512: Alex and Sam counted $12 too much between them.
    const players = base.map((p) => (p.id === 'kim' ? { ...p, chips: $(152) } : p));
    const r = settle(players, 'dave');
    expect(r.diff).toBe($(12));
    const row = (id: string) => r.rows.find((x) => x.id === id)!;
    // Kim is now −48, winners +40 and +20 still, so $12 comes out of $60 won = 20%.
    expect(row('alex').adjustment).toBe(-$(8));
    expect(row('sam').adjustment).toBe(-$(4));
    expect(row('kim').adjustment).toBe(0);
    expect(r.rows.reduce((s, x) => s + x.cashout, 0)).toBe(r.pot);
  });

  it('gives leftover money to the banker', () => {
    const players = base.map((p) => (p.id === 'kim' ? { ...p, chips: $(134) } : p)); // $494 counted
    const r = settle(players, 'dave');
    expect(r.diff).toBe(-$(6));
    expect(r.rows.find((x) => x.id === 'dave')!.cashout).toBe($(106));
    expect(r.rows.reduce((s, x) => s + x.cashout, 0)).toBe(r.pot);
    // Dave collects $66 from Kim and pays out $60, keeping the $6.
    expect(r.payments).toEqual([
      { fromId: 'kim', toId: 'dave', amount: $(66) },
      { fromId: 'dave', toId: 'alex', amount: $(40) },
      { fromId: 'dave', toId: 'sam', amount: $(20) },
    ]);
  });

  it('never turns a winner into a loser, and handles odd cents', () => {
    const players = [
      { id: 'a', boughtIn: $(50), chips: $(53.33) }, // +3.33
      { id: 'b', boughtIn: $(50), chips: $(97.01) }, // +47.01
      { id: 'c', boughtIn: $(100), chips: $(54.67) }, // −45.33
      { id: 'bank', boughtIn: $(50), chips: $(50) },
    ];
    const r = settle(players, 'bank');
    expect(r.diff).toBe($(5.01));
    expect(r.rows.reduce((s, x) => s + x.cashout, 0)).toBe(r.pot);
    expect(r.rows.every((x) => x.boughtIn <= x.chips ? x.net >= 0 : true)).toBe(true);
    const paidIn = r.payments.filter((p) => p.toId === 'bank').reduce((s, p) => s + p.amount, 0);
    const paidOut = r.payments.filter((p) => p.fromId === 'bank').reduce((s, p) => s + p.amount, 0);
    // The banker's own result is what's left after collecting and paying out.
    expect(paidIn - paidOut).toBe(r.rows.find((x) => x.id === 'bank')!.net);
  });

  it('flags a big gap for a recount', () => {
    const players = base.map((p) => (p.id === 'kim' ? { ...p, chips: $(190) } : p)); // $50 over on $500
    expect(settle(players, 'dave').withinTolerance).toBe(false);
  });
});
