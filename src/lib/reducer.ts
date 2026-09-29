import type { Cents } from './money';
import { previousGame, sameName } from './select';
import { DEFAULT_SETTINGS, type Actions, type Buyin, type DbState, type GameStatus, type Settings } from './types';

/**
 * Every change, fully spelled out (ids and times included) so the phone can apply it
 * instantly and the server can apply exactly the same change for real.
 */
export type Action =
  // Whoever starts the game is seated and becomes the banker.
  | { type: 'startGame'; id: string; at: string; sameAsLast: boolean; starterName: string; newPlayerId: string }
  | { type: 'cancelGame'; gameId: string }
  | { type: 'seatPlayer'; gameId: string; name: string; newPlayerId: string }
  | { type: 'unseatPlayer'; gameId: string; playerId: string }
  | { type: 'renamePlayer'; playerId: string; name: string }
  | { type: 'setBanker'; gameId: string; playerId: string }
  | { type: 'addBuyin'; buyin: Buyin }
  | { type: 'updateBuyin'; buyinId: string; amountCents: Cents }
  | { type: 'deleteBuyin'; buyinId: string }
  | { type: 'restoreBuyin'; buyin: Buyin }
  | { type: 'setStatus'; gameId: string; status: GameStatus }
  | { type: 'setChips'; gameId: string; playerId: string; chipCents: Cents | null }
  | {
      type: 'settleGame';
      gameId: string;
      potCents: Cents;
      seats: { playerId: string; chipCents: Cents; cashoutCents: Cents }[];
      payments: { id: string; fromId: string; toId: string; amountCents: Cents }[];
    }
  | { type: 'reopenGame'; gameId: string }
  | { type: 'setPaid'; paymentId: string; paid: boolean; at: string }
  | { type: 'setContact'; playerId: string; contact: string }
  | { type: 'setSettings'; settings: Settings };

/** Keeps settings sensible: tolerance $0–$1,000 and 0–50%, one to six preset amounts. */
export function cleanSettings(s: Settings): Settings {
  const presets = [...new Set(s.presetCents.map((c) => Math.round(c)).filter((c) => c > 0 && c <= 10_000_000))]
    .sort((a, b) => a - b)
    .slice(0, 6);
  if (!presets.length) throw new Error('Keep at least one rebuy amount.');
  return {
    toleranceMinCents: Math.min(100_000, Math.max(0, Math.round(s.toleranceMinCents))),
    tolerancePct: Math.min(50, Math.max(0, Math.round(s.tolerancePct * 10) / 10)),
    presetCents: presets,
  };
}

export const emptyState = (): DbState => ({
  players: [],
  games: [],
  seats: [],
  buyins: [],
  payments: [],
  settings: DEFAULT_SETTINGS,
});

/** A random id in standard UUID format. Works on plain http too (unlike crypto.randomUUID). */
export function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 40);

/** Seats a player (creating them if the name is new). Returns the new state and the player's id. */
function seatByName(
  state: DbState,
  gameId: string,
  rawName: string,
  newPlayerId: string,
  { okIfSeated = false } = {},
): { state: DbState; playerId: string } {
  const name = cleanName(rawName);
  if (!name) throw new Error('Enter a name.');
  const existing = state.players.find((p) => sameName(p.name, name));
  const player = existing ?? { id: newPlayerId, name, etransferContact: null };
  const seats = state.seats.filter((x) => x.gameId === gameId);
  if (seats.some((x) => x.playerId === player.id)) {
    if (okIfSeated) return { state, playerId: player.id };
    throw new Error(`${player.name} is already at the table.`);
  }
  const seatOrder = seats.reduce((m, x) => Math.max(m, x.seatOrder), 0) + 1;
  return {
    playerId: player.id,
    state: {
      ...state,
      players: existing ? state.players : [...state.players, player],
      seats: [...state.seats, { gameId, playerId: player.id, seatOrder, chipCents: null, cashoutCents: null }],
    },
  };
}

/** Applies one change. Throws an Error with a friendly message if it isn't allowed. */
export function applyAction(state: DbState, a: Action): DbState {
  const game = (id: string) => {
    const g = state.games.find((x) => x.id === id);
    if (!g) throw new Error("That game doesn't exist any more.");
    return g;
  };
  const mapGame = (id: string, patch: Partial<DbState['games'][number]>) =>
    state.games.map((g) => (g.id === id ? { ...g, ...patch } : g));

  switch (a.type) {
    case 'startGame': {
      if (state.games.some((g) => g.status !== 'settled')) throw new Error('A game is already going.');
      if (!cleanName(a.starterName)) throw new Error('Tap your name first.');
      const last = a.sameAsLast ? previousGame(state) : null;
      const seats = last
        ? state.seats
            .filter((x) => x.gameId === last.id)
            .map((x) => ({ ...x, gameId: a.id, chipCents: null, cashoutCents: null }))
        : [];
      const started: DbState = {
        ...state,
        games: [...state.games, { id: a.id, createdAt: a.at, status: 'live', bankerId: null, potCents: null }],
        seats: [...state.seats, ...seats],
      };
      const r = seatByName(started, a.id, a.starterName, a.newPlayerId, { okIfSeated: true });
      return { ...r.state, games: r.state.games.map((g) => (g.id === a.id ? { ...g, bankerId: r.playerId } : g)) };
    }

    case 'cancelGame':
      return {
        ...state,
        games: state.games.filter((g) => g.id !== a.gameId),
        seats: state.seats.filter((x) => x.gameId !== a.gameId),
        buyins: state.buyins.filter((b) => b.gameId !== a.gameId),
        payments: state.payments.filter((p) => p.gameId !== a.gameId),
      };

    case 'seatPlayer': {
      const g = game(a.gameId);
      const r = seatByName(state, a.gameId, a.name, a.newPlayerId);
      // If nobody is banker yet, the first player seated is.
      return g.bankerId
        ? r.state
        : { ...r.state, games: r.state.games.map((x) => (x.id === g.id ? { ...x, bankerId: r.playerId } : x)) };
    }

    case 'unseatPlayer': {
      const g = game(a.gameId);
      const seats = state.seats.filter((x) => !(x.gameId === a.gameId && x.playerId === a.playerId));
      const nextBanker =
        g.bankerId === a.playerId
          ? (seats.filter((x) => x.gameId === a.gameId).sort((x, y) => x.seatOrder - y.seatOrder)[0]?.playerId ?? null)
          : g.bankerId;
      return {
        ...state,
        seats,
        buyins: state.buyins.filter((b) => !(b.gameId === a.gameId && b.playerId === a.playerId)),
        games: mapGame(a.gameId, { bankerId: nextBanker }),
      };
    }

    case 'renamePlayer': {
      const name = cleanName(a.name);
      if (!name) return state;
      if (state.players.some((p) => p.id !== a.playerId && sameName(p.name, name))) {
        throw new Error(`There's already a player called ${name}.`);
      }
      return { ...state, players: state.players.map((p) => (p.id === a.playerId ? { ...p, name } : p)) };
    }

    case 'setBanker':
      game(a.gameId);
      return { ...state, games: mapGame(a.gameId, { bankerId: a.playerId }) };

    case 'addBuyin':
    case 'restoreBuyin':
      if (state.buyins.some((b) => b.id === a.buyin.id)) return state;
      game(a.buyin.gameId);
      return { ...state, buyins: [...state.buyins, a.buyin] };

    case 'updateBuyin':
      return { ...state, buyins: state.buyins.map((b) => (b.id === a.buyinId ? { ...b, amountCents: a.amountCents } : b)) };

    case 'deleteBuyin':
      return { ...state, buyins: state.buyins.filter((b) => b.id !== a.buyinId) };

    case 'setStatus':
      return { ...state, games: mapGame(a.gameId, { status: a.status }) };

    case 'setChips':
      return {
        ...state,
        seats: state.seats.map((x) => (x.gameId === a.gameId && x.playerId === a.playerId ? { ...x, chipCents: a.chipCents } : x)),
      };

    case 'settleGame': {
      const bySeat = new Map(a.seats.map((x) => [x.playerId, x]));
      return {
        ...state,
        games: mapGame(a.gameId, { status: 'settled', potCents: a.potCents }),
        seats: state.seats.map((x) => {
          const r = x.gameId === a.gameId ? bySeat.get(x.playerId) : undefined;
          return r ? { ...x, chipCents: r.chipCents, cashoutCents: r.cashoutCents } : x;
        }),
        payments: [
          ...state.payments.filter((p) => p.gameId !== a.gameId),
          ...a.payments.map((p) => ({ ...p, gameId: a.gameId, paidAt: null })),
        ],
      };
    }

    case 'reopenGame':
      return {
        ...state,
        games: mapGame(a.gameId, { status: 'cashout', potCents: null }),
        seats: state.seats.map((x) => (x.gameId === a.gameId ? { ...x, cashoutCents: null } : x)),
        payments: state.payments.filter((p) => p.gameId !== a.gameId),
      };

    case 'setPaid':
      return {
        ...state,
        payments: state.payments.map((p) => (p.id === a.paymentId ? { ...p, paidAt: a.paid ? a.at : null } : p)),
      };

    case 'setContact': {
      const etransferContact = a.contact.trim().slice(0, 100) || null;
      return { ...state, players: state.players.map((p) => (p.id === a.playerId ? { ...p, etransferContact } : p)) };
    }

    case 'setSettings':
      return { ...state, settings: cleanSettings(a.settings) };
  }
}

/**
 * Turns the friendly `Actions` calls the screens use into fully spelled-out `Action`s.
 * Both the local store and the server-backed store use this.
 */
export function actionsFor(dispatch: (a: Action) => Promise<void>, getState: () => DbState): Actions {
  const now = () => new Date().toISOString();
  const idFor = (name: string, fallback: string) =>
    getState().players.find((p) => sameName(p.name, cleanName(name)))?.id ?? fallback;
  return {
    async startGame({ sameAsLast, starterName }) {
      const gameId = newId();
      const playerId = idFor(starterName, newId());
      await dispatch({ type: 'startGame', id: gameId, at: now(), sameAsLast, starterName, newPlayerId: playerId });
      return { gameId, playerId };
    },
    cancelGame: (gameId) => dispatch({ type: 'cancelGame', gameId }),
    async seatPlayer(gameId, name) {
      const newPlayerId = idFor(name, newId());
      await dispatch({ type: 'seatPlayer', gameId, name, newPlayerId });
      return idFor(name, newPlayerId);
    },
    unseatPlayer: (gameId, playerId) => dispatch({ type: 'unseatPlayer', gameId, playerId }),
    renamePlayer: (playerId, name) => dispatch({ type: 'renamePlayer', playerId, name }),
    setBanker: (gameId, playerId) => dispatch({ type: 'setBanker', gameId, playerId }),
    async addBuyin(gameId, playerId, amountCents) {
      const buyin: Buyin = { id: newId(), gameId, playerId, amountCents, createdAt: now() };
      await dispatch({ type: 'addBuyin', buyin });
      return buyin;
    },
    updateBuyin: (buyinId, amountCents) => dispatch({ type: 'updateBuyin', buyinId, amountCents }),
    deleteBuyin: (buyinId) => dispatch({ type: 'deleteBuyin', buyinId }),
    restoreBuyin: (buyin) => dispatch({ type: 'restoreBuyin', buyin }),
    setStatus: (gameId, status) => dispatch({ type: 'setStatus', gameId, status }),
    setChips: (gameId, playerId, chipCents) => dispatch({ type: 'setChips', gameId, playerId, chipCents }),
    settleGame: (gameId, r) =>
      dispatch({
        type: 'settleGame',
        gameId,
        potCents: r.potCents,
        seats: r.seats,
        payments: r.payments.map((p) => ({ ...p, id: newId() })),
      }),
    reopenGame: (gameId) => dispatch({ type: 'reopenGame', gameId }),
    setPaid: (paymentId, paid) => dispatch({ type: 'setPaid', paymentId, paid, at: now() }),
    setContact: (playerId, contact) => dispatch({ type: 'setContact', playerId, contact }),
    setSettings: (settings) => dispatch({ type: 'setSettings', settings }),
  };
}
