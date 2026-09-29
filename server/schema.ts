import type { Db } from './db.js';

// The tables. Every statement is safe to run again, so the server simply runs these
// when it starts: there's nothing to paste into Neon by hand.
const STATEMENTS = [
  `create table if not exists players (
    id uuid primary key,
    name text not null,
    etransfer_contact text,
    created_at timestamptz not null default now()
  )`,
  `create unique index if not exists players_name_key on players (lower(name))`,

  `create table if not exists games (
    id uuid primary key,
    created_at timestamptz not null default now(),
    status text not null check (status in ('live', 'cashout', 'settled')),
    banker_id uuid references players (id),
    pot_cents integer
  )`,

  `create table if not exists seats (
    game_id uuid not null references games (id) on delete cascade,
    player_id uuid not null references players (id),
    seat_order integer not null,
    chip_cents integer,
    cashout_cents integer,
    primary key (game_id, player_id)
  )`,

  `create table if not exists buyins (
    id uuid primary key,
    game_id uuid not null references games (id) on delete cascade,
    player_id uuid not null references players (id),
    amount_cents integer not null check (amount_cents > 0),
    created_at timestamptz not null default now()
  )`,
  `create index if not exists buyins_game_idx on buyins (game_id)`,

  `create table if not exists payments (
    id uuid primary key,
    game_id uuid not null references games (id) on delete cascade,
    from_id uuid not null references players (id),
    to_id uuid not null references players (id),
    amount_cents integer not null check (amount_cents > 0),
    paid_at timestamptz
  )`,

  `create table if not exists settings (
    id integer primary key default 1 check (id = 1),
    tolerance_min_cents integer not null default 1000,
    tolerance_pct numeric not null default 3,
    preset_cents integer[] not null default '{5000,10000}'
  )`,
  `insert into settings (id) values (1) on conflict do nothing`,

  // Goes up by one on every change, so phones can cheaply ask "anything new?"
  `create table if not exists meta (
    id integer primary key default 1 check (id = 1),
    version bigint not null default 0
  )`,
  `insert into meta (id) values (1) on conflict do nothing`,

  // Left over from the host PIN (since removed).
  `drop table if exists pin_failures`,
];

const ready = new WeakMap<Db, Promise<void>>();

export function ensureSchema(db: Db): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = db.tx(STATEMENTS.map((s) => [s])).then(() => undefined);
    p.catch(() => ready.delete(db)); // try again next request
    ready.set(db, p);
  }
  return p;
}
