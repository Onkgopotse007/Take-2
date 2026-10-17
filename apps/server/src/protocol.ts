/** Messages between the game server and clients. Import types from here in the client. */
import type { GameEvent, Move, PlayerView, RejectionCode } from '@take2/engine';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A move as a client sends it. The server fills in `player` from the connection. */
export type ClientMove = DistributiveOmit<Exclude<Move, { type: 'nextRound' } | { type: 'forceStart' }>, 'player'>;

/** Client -> server message types. */
export interface ClientMessages {
  /** Host only: start the game (or a rematch once it has finished). */
  start: Record<string, never>;
  move: ClientMove;
  /** Ask for a fresh `table` snapshot. Send once after registering message handlers. */
  sync: Record<string, never>;
}

/** Options for `client.create('table', ...)` and `client.joinById(code, ...)`. */
export interface JoinOptions {
  name?: string;
}

export interface Seat {
  id: string;
  name: string;
  connected: boolean;
}

export type TableStatus = 'lobby' | 'playing' | 'finished';

/** Sent as `table` to each player after every change. Contains only what that player may see. */
export interface TableSnapshot {
  code: string;
  you: string;
  hostId: string | null;
  seats: Seat[];
  status: TableStatus;
  game: PlayerView | null;
  /** Server time (ms since epoch) at which starting plays open. Plays before this are refused. */
  raceOpensAt: number | null;
  /** Server time at which the current timer fires: auto-pick, forced start, toss or next round. */
  deadline: number | null;
  /** Server time when this snapshot was sent, to correct for clock differences. */
  serverNow: number;
}

export type ServerRejectionCode =
  | RejectionCode
  | 'BAD_MESSAGE'
  | 'TOO_EARLY'
  | 'BEATEN_TO_IT'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'GAME_IN_PROGRESS'
  | 'TABLE_FULL';

/** Sent as `rejected` to the player whose message was refused. */
export interface Rejection {
  code: ServerRejectionCode;
  reason: string;
}

/** Server -> client message types. `events` are public and never contain hidden cards. */
export interface ServerMessages {
  table: TableSnapshot;
  events: GameEvent[];
  rejected: Rejection;
}
