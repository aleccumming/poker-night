import type { Cents } from './money';

export interface Player {
  id: string;
  name: string;
  etransferContact: string | null;
}

export type GameStatus = 'live' | 'cashout' | 'settled';

export interface Game {
  id: string;
  createdAt: string; // ISO date
  status: GameStatus;
  bankerId: string | null;
  /** Total buy-ins, saved when the game is settled. */
  potCents?: Cents | null;
}

/** A player seated in a game. */
export interface Seat {
  gameId: string;
  playerId: string;
  seatOrder: number;
  /** What their chips were counted as. */
  chipCents: Cents | null;
  /** What they actually get, after any adjustment. Saved when the game is settled. */
  cashoutCents?: Cents | null;
}

export interface Buyin {
  id: string;
  gameId: string;
  playerId: string;
  amountCents: Cents;
  createdAt: string;
}

/** One e-Transfer: a loser to the banker, or the banker to a winner. */
export interface Payment {
  id: string;
  gameId: string;
  fromId: string;
  toId: string;
  amountCents: Cents;
  paidAt: string | null;
}

export interface Settings {
  toleranceMinCents: Cents;
  tolerancePct: number;
  presetCents: Cents[];
}

export interface DbState {
  players: Player[];
  games: Game[];
  seats: Seat[];
  buyins: Buyin[];
  payments: Payment[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  toleranceMinCents: 1000,
  tolerancePct: 3,
  presetCents: [5000, 10000],
};

/** Every change the app can make. The local store and (later) the Supabase store both implement this. */
export interface Actions {
  /** Seats `starterName` (creating them if new) and makes them the banker. */
  startGame(opts: { sameAsLast: boolean; starterName: string }): Promise<{ gameId: string; playerId: string }>;
  cancelGame(gameId: string): Promise<void>;
  /** Seats a player by name (creating them if new). Returns their player id. */
  seatPlayer(gameId: string, name: string): Promise<string>;
  unseatPlayer(gameId: string, playerId: string): Promise<void>;
  renamePlayer(playerId: string, name: string): Promise<void>;
  setBanker(gameId: string, playerId: string): Promise<void>;
  addBuyin(gameId: string, playerId: string, amountCents: Cents): Promise<Buyin>;
  updateBuyin(buyinId: string, amountCents: Cents): Promise<void>;
  deleteBuyin(buyinId: string): Promise<void>;
  restoreBuyin(buyin: Buyin): Promise<void>;
  setStatus(gameId: string, status: GameStatus): Promise<void>;
  setChips(gameId: string, playerId: string, chipCents: Cents | null): Promise<void>;
  settleGame(gameId: string, result: SettleSave): Promise<void>;
  /** Back to cash-out to fix counts. Clears the payments. */
  reopenGame(gameId: string): Promise<void>;
  setPaid(paymentId: string, paid: boolean): Promise<void>;
  setContact(playerId: string, contact: string): Promise<void>;
  setSettings(settings: Settings): Promise<void>;
}

export interface SettleSave {
  potCents: Cents;
  seats: { playerId: string; chipCents: Cents; cashoutCents: Cents }[];
  payments: { fromId: string; toId: string; amountCents: Cents }[];
}

export interface SyncStatus {
  /** False until the first load from the server. */
  loaded: boolean;
  /** True when the last attempt to reach the server failed. */
  offline: boolean;
  /** True when the group link's code is wrong. */
  notFound: boolean;
}

export interface Store extends Actions {
  getState(): DbState;
  getSync(): SyncStatus;
  subscribe(listener: () => void): () => void;
}
