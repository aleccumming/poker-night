import { beforeEach, describe, expect, it } from 'vitest';
import { actionsFor, applyAction, emptyState, newId, type Action } from '../src/lib/reducer';
import { settle } from '../src/lib/settle';
import { seatsFor } from '../src/lib/select';
import type { Actions, DbState } from '../src/lib/types';
import type { Db } from './db.js';
import { handleGet, handlePost, loadState, type Env } from './handlers.js';
import { pgliteDb } from './pgliteDb.js';

const env: Env = { groupCode: 'secret-code' };
let db: Db;

beforeEach(() => {
  db = pgliteDb(); // fresh in-memory Postgres for every test
});

async function post(body: object) {
  return handlePost(db, env, { g: env.groupCode, ...body });
}

/** Runs each action on the phone's rules AND on the server, so the two can be compared. */
function twin() {
  let local: DbState = emptyState();
  const actions: Actions = actionsFor(async (a: Action) => {
    local = applyAction(local, a);
    const r = await post({ action: a });
    if (r.status !== 200) throw new Error(`server said ${r.status}: ${JSON.stringify(r.body)}`);
  }, () => local);
  return { actions, local: () => local };
}

/** Same data regardless of timestamps and row order. */
function normalize(s: DbState) {
  const byKey = <T,>(xs: T[], k: (x: T) => string) => [...xs].sort((a, b) => k(a).localeCompare(k(b)));
  return {
    players: byKey(s.players, (p) => p.id),
    games: byKey(s.games.map((g) => ({ ...g, createdAt: 'x', potCents: g.potCents ?? null })), (g) => g.id),
    seats: byKey(
      s.seats.map((x) => ({ ...x, cashoutCents: x.cashoutCents ?? null })),
      (x) => x.gameId + x.playerId,
    ),
    buyins: byKey(s.buyins.map((b) => ({ ...b, createdAt: 'x' })), (b) => b.id),
    payments: byKey(s.payments.map((p) => ({ ...p, paidAt: p.paidAt ? 'paid' : null })), (p) => p.id),
    settings: s.settings,
  };
}

describe('server matches the phone', () => {
  it('plays two whole nights identically', async () => {
    const { actions: a, local } = twin();

    // Night 1
    const { gameId: g1 } = await a.startGame({ sameAsLast: false, starterName: 'Dave' });
    for (const n of ['Alex', 'Sam', 'Kim', 'Typo']) await a.seatPlayer(g1, n);
    const id = (n: string) => local().players.find((p) => p.name === n)!.id;
    await a.unseatPlayer(g1, id('Typo'));
    await a.renamePlayer(id('Sam'), 'Samantha');
    const b1 = await a.addBuyin(g1, id('Dave'), 10000);
    await a.addBuyin(g1, id('Alex'), 10000);
    await a.addBuyin(g1, id('Samantha'), 5000);
    await a.addBuyin(g1, id('Kim'), 10000);
    await a.addBuyin(g1, id('Kim'), 10000);
    await a.updateBuyin(b1.id, 10000);
    const extra = await a.addBuyin(g1, id('Samantha'), 5000);
    await a.deleteBuyin(extra.id);
    await a.restoreBuyin(extra);
    await a.setStatus(g1, 'cashout');
    const chips = { Dave: 10000, Alex: 14000, Samantha: 12000, Kim: 15200 };
    for (const [n, c] of Object.entries(chips)) await a.setChips(g1, id(n), c);

    const result = settle(
      seatsFor(local(), g1).map((s) => ({ id: s.playerId, boughtIn: s.totalIn, chips: s.chipCents ?? 0 })),
      id('Dave'),
    );
    await a.settleGame(g1, {
      potCents: result.pot,
      seats: result.rows.map((r) => ({ playerId: r.id, chipCents: r.chips, cashoutCents: r.cashout })),
      payments: result.payments.map((p) => ({ fromId: p.fromId, toId: p.toId, amountCents: p.amount })),
    });
    await a.setContact(id('Dave'), 'dave@example.com');
    const [firstPay] = local().payments;
    await a.setPaid(firstPay.id, true);

    // Night 2: Kim starts with last game's players, so Kim is banker; then change banker.
    const { gameId: g2 } = await a.startGame({ sameAsLast: true, starterName: 'Kim' });
    expect(local().games.find((g) => g.id === g2)!.bankerId).toBe(id('Kim'));
    await a.setBanker(g2, id('Alex'));
    await a.addBuyin(g2, id('Kim'), 5000);
    await a.setSettings({ toleranceMinCents: 500, tolerancePct: 2.5, presetCents: [10000, 2000, 5000] });

    const server = (await loadState(db)).state;
    expect(normalize(server)).toEqual(normalize(local()));
    expect(server.games.find((g) => g.id === g2)!.bankerId).toBe(id('Alex'));
    expect(server.seats.filter((x) => x.gameId === g2)).toHaveLength(4);
    expect(server.payments.filter((p) => p.paidAt)).toHaveLength(1);
    expect(server.settings).toEqual({ toleranceMinCents: 500, tolerancePct: 2.5, presetCents: [2000, 5000, 10000] });
  });
});

describe('group link', () => {
  it('refuses reads and writes without the right code', async () => {
    expect((await handleGet(db, env, new URLSearchParams({ g: 'wrong' }))).status).toBe(404);
    expect((await handleGet(db, env, new URLSearchParams())).status).toBe(404);
    expect((await handlePost(db, env, { g: 'wrong', action: { type: 'cancelGame', gameId: newId() } })).status).toBe(404);
  });

  it('answers "same" when nothing changed', async () => {
    const first = await handleGet(db, env, new URLSearchParams({ g: env.groupCode }));
    const v = (first.body as { version: number }).version;
    const again = await handleGet(db, env, new URLSearchParams({ g: env.groupCode, v: String(v) }));
    expect(again.body).toEqual({ version: v, same: true });
  });
});

describe('friendly errors', () => {
  it('explains a duplicate seat and a duplicate name', async () => {
    const { actions: a, local } = twin();
    const { gameId: g } = await a.startGame({ sameAsLast: false, starterName: 'Dave' });
    await a.seatPlayer(g, 'Alex');
    const dave = local().players.find((p) => p.name === 'Dave')!.id;
    const dup = await post({ action: { type: 'seatPlayer', gameId: g, name: 'dave', newPlayerId: newId() } });
    expect(dup.body).toEqual({ error: 'That player is already at the table.' });
    const rename = await post({ action: { type: 'renamePlayer', playerId: dave, name: 'ALEX' } });
    expect(rename.body).toEqual({ error: "There's already a player with that name." });
  });
});

describe('starting and joining', () => {
  it('seats whoever starts as banker, creating them if new, and lets people join themselves', async () => {
    const { actions: a, local } = twin();
    const { gameId: g, playerId: newbie } = await a.startGame({ sameAsLast: false, starterName: '  Priya ' });
    let s = (await loadState(db)).state;
    expect(s.players.find((p) => p.id === newbie)!.name).toBe('Priya');
    expect(s.games[0].bankerId).toBe(newbie);

    const kim = await a.seatPlayer(g, 'Kim');
    const again = await post({ action: { type: 'seatPlayer', gameId: g, name: 'KIM', newPlayerId: newId() } });
    expect(again.body).toEqual({ error: 'That player is already at the table.' });

    s = (await loadState(db)).state;
    expect(s.seats.map((x) => x.playerId)).toEqual([newbie, kim]);
    expect(normalize(s)).toEqual(normalize(local()));

    // Only one game at a time.
    const second = await post({ action: { type: 'startGame', id: newId(), at: '', sameAsLast: false, starterName: 'Kim', newPlayerId: newId() } });
    expect(second.status).toBe(409);
  });
});
