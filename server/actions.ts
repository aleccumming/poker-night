import type { Action } from '../src/lib/reducer';
import type { Stmt } from './db.js';

// Mirrors src/lib/reducer.ts in SQL. The parity test (server/server.test.ts) checks they agree.

export class BadRequest extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CENTS = 10_000_000; // $100,000

function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new BadRequest('Bad id.');
  return v;
}
function cents(v: unknown, { allowZero = false } = {}): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v > MAX_CENTS || v < (allowZero ? 0 : 1)) throw new BadRequest('Bad amount.');
  return v;
}
function text(v: unknown, max: number): string {
  if (typeof v !== 'string') throw new BadRequest('Bad text.');
  return v.trim().replace(/\s+/g, ' ').slice(0, max);
}
function time(v: unknown): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new BadRequest('Bad time.');
  return v;
}

/** Newest game (other than `$1`) that has anyone seated: what "Same players as last time" copies. */
const PREVIOUS_GAME = `(select g.id from games g where g.id <> $1 and exists (select 1 from seats s where s.game_id = g.id)
   order by g.created_at desc limit 1)`;

/** Turns one validated action into SQL statements, run together in one transaction. */
export function statementsFor(a: Action): Stmt[] {
  switch (a.type) {
    case 'startGame': {
      const id = uuid(a.id);
      const name = text(a.starterName, 40);
      if (!name) throw new BadRequest('Tap your name first.');
      const find = `(select id from players where lower(name) = lower($2))`;
      return [
        [`insert into games (id, status) values ($1, 'live')`, [id]],
        [
          `insert into seats (game_id, player_id, seat_order)
           select $1, player_id, seat_order from seats where $2 and game_id = ${PREVIOUS_GAME}`,
          [id, a.sameAsLast === true],
        ],
        // Whoever starts the game is seated (if they weren't already) and is the banker.
        [`insert into players (id, name) values ($1, $2) on conflict ((lower(name))) do nothing`, [uuid(a.newPlayerId), name]],
        [
          `insert into seats (game_id, player_id, seat_order)
           values ($1, ${find}, coalesce((select max(seat_order) from seats where game_id = $1), 0) + 1)
           on conflict (game_id, player_id) do nothing`,
          [id, name],
        ],
        [`update games set banker_id = ${find} where id = $1`, [id, name]],
      ];
    }

    case 'cancelGame':
      return [[`delete from games where id = $1 and status = 'live' and not exists (select 1 from buyins where game_id = $1)`, [uuid(a.gameId)]]];

    case 'seatPlayer': {
      const gameId = uuid(a.gameId);
      const name = text(a.name, 40);
      if (!name) throw new BadRequest('Enter a name.');
      const find = `(select id from players where lower(name) = lower($1))`;
      return [
        [`insert into players (id, name) values ($2, $1) on conflict ((lower(name))) do nothing`, [name, uuid(a.newPlayerId)]],
        [
          `insert into seats (game_id, player_id, seat_order)
           values ($2, ${find}, coalesce((select max(seat_order) from seats where game_id = $2), 0) + 1)`,
          [name, gameId],
        ],
        [`update games set banker_id = ${find} where id = $2 and banker_id is null`, [name, gameId]],
      ];
    }

    case 'unseatPlayer': {
      const params = [uuid(a.gameId), uuid(a.playerId)];
      return [
        [`delete from buyins where game_id = $1 and player_id = $2`, params],
        [`delete from seats where game_id = $1 and player_id = $2`, params],
        [
          `update games set banker_id = (select player_id from seats where game_id = $1 order by seat_order limit 1)
           where id = $1 and banker_id = $2`,
          params,
        ],
      ];
    }

    case 'renamePlayer': {
      const name = text(a.name, 40);
      if (!name) throw new BadRequest('Enter a name.');
      return [[`update players set name = $2 where id = $1`, [uuid(a.playerId), name]]];
    }

    case 'setBanker':
      return [
        [
          `update games set banker_id = $2 where id = $1 and exists (select 1 from seats where game_id = $1 and player_id = $2)`,
          [uuid(a.gameId), uuid(a.playerId)],
        ],
      ];

    case 'addBuyin':
      return [
        [
          `insert into buyins (id, game_id, player_id, amount_cents)
           select $1, $2, $3, $4 where exists (select 1 from games where id = $2 and status = 'live')
           on conflict (id) do nothing`,
          [uuid(a.buyin.id), uuid(a.buyin.gameId), uuid(a.buyin.playerId), cents(a.buyin.amountCents)],
        ],
      ];

    case 'restoreBuyin':
      return [
        [
          `insert into buyins (id, game_id, player_id, amount_cents, created_at) values ($1, $2, $3, $4, $5)
           on conflict (id) do nothing`,
          [uuid(a.buyin.id), uuid(a.buyin.gameId), uuid(a.buyin.playerId), cents(a.buyin.amountCents), time(a.buyin.createdAt)],
        ],
      ];

    case 'updateBuyin':
      return [[`update buyins set amount_cents = $2 where id = $1`, [uuid(a.buyinId), cents(a.amountCents)]]];

    case 'deleteBuyin':
      return [[`delete from buyins where id = $1`, [uuid(a.buyinId)]]];

    case 'setStatus':
      if (a.status !== 'live' && a.status !== 'cashout') throw new BadRequest('Bad status.');
      return [[`update games set status = $2 where id = $1 and status <> 'settled'`, [uuid(a.gameId), a.status]]];

    case 'setChips':
      return [
        [
          `update seats set chip_cents = $3 where game_id = $1 and player_id = $2`,
          [uuid(a.gameId), uuid(a.playerId), a.chipCents === null ? null : cents(a.chipCents, { allowZero: true })],
        ],
      ];

    case 'settleGame': {
      const gameId = uuid(a.gameId);
      if (!Array.isArray(a.seats) || !Array.isArray(a.payments)) throw new BadRequest('Bad settle-up.');
      return [
        [`update games set status = 'settled', pot_cents = $2 where id = $1`, [gameId, cents(a.potCents, { allowZero: true })]],
        ...a.seats.map(
          (s): Stmt => [
            `update seats set chip_cents = $3, cashout_cents = $4 where game_id = $1 and player_id = $2`,
            [gameId, uuid(s.playerId), cents(s.chipCents, { allowZero: true }), cents(s.cashoutCents, { allowZero: true })],
          ],
        ),
        [`delete from payments where game_id = $1`, [gameId]],
        ...a.payments.map(
          (p): Stmt => [
            `insert into payments (id, game_id, from_id, to_id, amount_cents) values ($1, $2, $3, $4, $5)`,
            [uuid(p.id), gameId, uuid(p.fromId), uuid(p.toId), cents(p.amountCents)],
          ],
        ),
      ];
    }

    case 'reopenGame': {
      const gameId = uuid(a.gameId);
      return [
        [`update games set status = 'cashout', pot_cents = null where id = $1`, [gameId]],
        [`update seats set cashout_cents = null where game_id = $1`, [gameId]],
        [`delete from payments where game_id = $1`, [gameId]],
      ];
    }

    case 'setPaid':
      return [
        [
          `update payments set paid_at = case when $2 then coalesce(paid_at, now()) end where id = $1`,
          [uuid(a.paymentId), a.paid === true],
        ],
      ];

    case 'setSettings': {
      const s = a.settings;
      if (!s || !Array.isArray(s.presetCents) || typeof s.tolerancePct !== 'number') throw new BadRequest('Bad settings.');
      const presets = [...new Set(s.presetCents.map((c) => cents(c)))].sort((x, y) => x - y);
      if (presets.length < 1 || presets.length > 6) throw new BadRequest('Keep one to six rebuy amounts.');
      const pct = s.tolerancePct;
      if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new BadRequest('Bad percentage.');
      const min = cents(s.toleranceMinCents, { allowZero: true });
      if (min > 100_000) throw new BadRequest('Bad tolerance.');
      return [
        [
          `update settings set tolerance_min_cents = $1, tolerance_pct = $2, preset_cents = $3::integer[] where id = 1`,
          [min, Math.round(pct * 10) / 10, presets],
        ],
      ];
    }

    case 'setContact':
      return [[`update players set etransfer_contact = nullif($2, '') where id = $1`, [uuid(a.playerId), text(a.contact, 100)]]];

    default:
      throw new BadRequest('Unknown change.');
  }
}
