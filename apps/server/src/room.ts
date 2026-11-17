import { randomUUID } from 'node:crypto';
import { CloseCode, Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import { MadagascarTable } from './madagascar-table';
import type { GameKind, JoinOptions } from './protocol';
import { cryptoRng, generateCode } from './random';
import { DEFAULT_TIMINGS, Table, type Scheduler, type Timings } from './table';
import type { Rng } from '@take2/engine';

/** What a room needs from a table, whichever game it plays. */
export interface SeatedTable {
  join(id: string, rawName: unknown): { reason: string } | null;
  reclaim(seatKey: unknown): string | null;
  leave(id: string, chose?: boolean): void;
  setConnected(id: string, connected: boolean): void;
  start(id: string): void;
  move(id: string, raw: unknown): void;
  sync(id: string): void;
  dispose(): void;
  /** Take 2 only: the rules for the next game. */
  setMode?(id: string, raw: unknown): void;
}

export interface TableSetup {
  code: string;
  rng: Rng;
  timings: Timings;
  scheduler: Scheduler;
  /** Each game sends its own message shapes; the room passes them through untouched. */
  outbox: { send(playerId: string, type: string, message: unknown): void };
}

const GAME_NAMES: Record<GameKind, string> = { take2: 'Take 2', madagascar: 'Madagascar' };

/** How long Colyseus holds a dropped session. After that, players rejoin with their seat key. */
export const RECONNECT_SECONDS = 120;

/**
 * A Take 2 table (room type `table`).
 *
 * Colyseus sessions come and go; seats do not. Each seat has a stable player id, and this room
 * tracks whichever session currently holds it.
 */
export class TableRoom extends Room {
  /** The table caps seats at 10; the spare room is for players rejoining while an old session lingers. */
  maxClients = 20;
  /** Overridden in tests to run timers quickly. */
  timings: Timings = DEFAULT_TIMINGS;
  /** The game this room plays. Joins asking for another game are refused. */
  readonly game: GameKind = 'take2';
  table!: SeatedTable;
  private playerOf = new Map<string, string>();
  private sessionOf = new Map<string, string>();

  async onCreate(): Promise<void> {
    this.roomId = await uniqueCode();
    this.table = this.createTable({
      code: this.roomId,
      rng: cryptoRng,
      timings: this.timings,
      scheduler: {
        now: () => Date.now(),
        setTimeout: (callback, ms) => {
          const handle = setTimeout(callback, ms);
          return { clear: () => clearTimeout(handle) };
        },
      },
      outbox: {
        send: (playerId, type, message) => {
          const sessionId = this.sessionOf.get(playerId);
          if (sessionId) this.clients.getById(sessionId)?.send(type, message);
        },
      },
    });
    const table = this.table;
    this.onMessage('start', (client) => this.withPlayer(client, (id) => this.table.start(id)));
    if (table.setMode) this.onMessage('setMode', (client, message) => this.withPlayer(client, (id) => table.setMode!(id, message)));
    this.onMessage('move', (client, message) => this.withPlayer(client, (id) => this.table.move(id, message)));
    this.onMessage('sync', (client) => this.withPlayer(client, (id) => this.table.sync(id)));
  }

  protected createTable(setup: TableSetup): SeatedTable {
    return new Table(setup);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    // A code from the other game's site: say so rather than seat someone at a game they cannot see.
    const wanted = options?.game ?? 'take2';
    if (wanted !== this.game) throw new ServerError(4002, `Table ${this.roomId} is a ${GAME_NAMES[this.game]} table.`);

    // New players are refused mid-game by the table itself, so the room never locks:
    // a player whose session has expired can always get back in with their seat key.
    const reclaimed = this.table.reclaim(options?.seatKey);
    if (reclaimed) {
      const old = this.sessionOf.get(reclaimed);
      this.bind(client.sessionId, reclaimed);
      // A stale session for the same seat (another tab, or a dead connection) is let go.
      if (old && old !== client.sessionId) this.clients.getById(old)?.leave(CloseCode.WITH_ERROR);
      return;
    }
    const id = randomUUID().slice(0, 8);
    const refused = this.table.join(id, options?.name);
    if (refused) throw new ServerError(4001, refused.reason);
    this.bind(client.sessionId, id);
  }

  onDrop(client: Client): void {
    const id = this.currentPlayer(client);
    if (!id) return;
    this.table.setConnected(id, false);
    // If they do not return in time, Colyseus calls onLeave. Their seat key still works after that.
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client): void {
    const id = this.currentPlayer(client);
    if (id) this.table.setConnected(id, true);
  }

  onLeave(client: Client, code?: number): void {
    const id = this.currentPlayer(client);
    this.playerOf.delete(client.sessionId);
    if (!id) return;
    this.sessionOf.delete(id);
    this.table.leave(id, code === CloseCode.CONSENTED);
  }

  onDispose(): void {
    this.table.dispose();
  }

  private bind(sessionId: string, playerId: string): void {
    const old = this.sessionOf.get(playerId);
    if (old) this.playerOf.delete(old);
    this.playerOf.set(sessionId, playerId);
    this.sessionOf.set(playerId, sessionId);
  }

  /** The player this session holds, if it is still the current session for that seat. */
  private currentPlayer(client: Client): string | undefined {
    const id = this.playerOf.get(client.sessionId);
    return id && this.sessionOf.get(id) === client.sessionId ? id : undefined;
  }

  private withPlayer(client: Client, fn: (playerId: string) => void): void {
    const id = this.currentPlayer(client);
    if (id) fn(id);
  }
}

/** A Madagascar table (room type `madagascar`). Join codes are unique across both games. */
export class MadagascarRoom extends TableRoom {
  readonly game: GameKind = 'madagascar';

  protected createTable(setup: TableSetup): SeatedTable {
    return new MadagascarTable(setup);
  }
}

async function uniqueCode(): Promise<string> {
  for (;;) {
    const code = generateCode();
    if (!(await matchMaker.getRoomById(code))) return code;
  }
}
