import { createHash, timingSafeEqual } from 'node:crypto';
import type { Action } from '../src/lib/reducer';
import type { DbState } from '../src/lib/types';
import { BadRequest, statementsFor } from './actions.js';
import { one, type Db, type Row } from './db.js';
import { ensureSchema } from './schema.js';

export interface Env {
  /** The secret part of the group link: /g/<groupCode>. Anyone with the link can view and make changes. */
  groupCode: string;
}

export interface Reply {
  status: number;
  body: unknown;
}

export function envFromProcess(): Env {
  const groupCode = process.env.GROUP_CODE ?? '';
  if (!groupCode) throw new Error('GROUP_CODE must be set.');
  return { groupCode };
}

/** Compares secrets without leaking how many characters matched. */
function sameSecret(given: unknown, real: string): boolean {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(real).digest();
  return timingSafeEqual(a, b);
}

const fail = (status: number, error: string): Reply => ({ status, body: { error } });

// ---------- Reading ----------

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
const num = (v: unknown) => (v == null ? null : Number(v));

async function version(db: Db): Promise<number> {
  const [row] = await one<{ version: string }>(db, 'select version from meta');
  return Number(row.version);
}

export async function loadState(db: Db): Promise<{ version: number; state: DbState }> {
  const [meta, players, games, seats, buyins, payments, settings] = await db.tx(
    [
      ['select version from meta'],
      ['select id, name, etransfer_contact from players order by created_at'],
      ['select id, created_at, status, banker_id, pot_cents from games order by created_at'],
      ['select game_id, player_id, seat_order, chip_cents, cashout_cents from seats'],
      ['select id, game_id, player_id, amount_cents, created_at from buyins order by created_at'],
      ['select id, game_id, from_id, to_id, amount_cents, paid_at from payments'],
      ['select tolerance_min_cents, tolerance_pct, preset_cents from settings'],
    ],
    { readOnly: true },
  );
  const s: Row = settings[0];
  return {
    version: Number(meta[0].version),
    state: {
      players: players.map((r) => ({ id: r.id as string, name: r.name as string, etransferContact: (r.etransfer_contact as string) ?? null })),
      games: games.map((r) => ({
        id: r.id as string,
        createdAt: iso(r.created_at)!,
        status: r.status as DbState['games'][number]['status'],
        bankerId: (r.banker_id as string) ?? null,
        potCents: num(r.pot_cents),
      })),
      seats: seats.map((r) => ({
        gameId: r.game_id as string,
        playerId: r.player_id as string,
        seatOrder: Number(r.seat_order),
        chipCents: num(r.chip_cents),
        cashoutCents: num(r.cashout_cents),
      })),
      buyins: buyins.map((r) => ({
        id: r.id as string,
        gameId: r.game_id as string,
        playerId: r.player_id as string,
        amountCents: Number(r.amount_cents),
        createdAt: iso(r.created_at)!,
      })),
      payments: payments.map((r) => ({
        id: r.id as string,
        gameId: r.game_id as string,
        fromId: r.from_id as string,
        toId: r.to_id as string,
        amountCents: Number(r.amount_cents),
        paidAt: iso(r.paid_at),
      })),
      settings: {
        toleranceMinCents: Number(s.tolerance_min_cents),
        tolerancePct: Number(s.tolerance_pct),
        presetCents: (s.preset_cents as unknown[]).map(Number),
      },
    },
  };
}

/** GET /api/state?g=<code>&v=<version the phone already has> */
export async function handleGet(db: Db, env: Env, query: URLSearchParams): Promise<Reply> {
  if (!sameSecret(query.get('g'), env.groupCode)) return fail(404, "This link isn't right.");
  await ensureSchema(db);
  const known = Number(query.get('v') ?? -1);
  if ((await version(db)) === known) return { status: 200, body: { version: known, same: true } };
  return { status: 200, body: await loadState(db) };
}

// ---------- Writing ----------

/** Friendly messages for the database refusing a change. */
function explain(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err.code === '23505') {
    if (err.constraint === 'seats_pkey' || err.message?.includes('seats_pkey')) return 'That player is already at the table.';
    if (err.constraint === 'players_name_key' || err.message?.includes('players_name_key')) return "There's already a player with that name.";
    return 'That was already saved.';
  }
  if (err.code === '23503' || err.code === '23502') return 'That was changed on another phone. Try again.';
  return null;
}

/**
 * POST /api/action
 * Body: { g: groupCode, action: Action }
 */
export async function handlePost(db: Db, env: Env, body: unknown): Promise<Reply> {
  const b = (body ?? {}) as { g?: unknown; action?: Action };
  if (!sameSecret(b.g, env.groupCode)) return fail(404, "This link isn't right.");
  await ensureSchema(db);

  const a = b.action;
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return fail(400, 'Nothing to do.');

  if (a.type === 'startGame') {
    const [busy] = await one(db, `select 1 from games where status <> 'settled' limit 1`);
    if (busy) return fail(409, 'A game is already going.');
  }

  try {
    await db.tx([...statementsFor(a), ['update meta set version = version + 1']]);
  } catch (e) {
    if (e instanceof BadRequest) return fail(400, e.message);
    const msg = explain(e);
    if (msg) return fail(409, msg);
    throw e;
  }
  return { status: 200, body: await loadState(db) };
}
