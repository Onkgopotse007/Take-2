import { randomUUID } from 'node:crypto';
import { CloseCode, Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import type { JoinOptions } from './protocol';
import { cryptoRng, generateCode } from './random';
import { DEFAULT_TIMINGS, Table, type Timings } from './table';

/** How long Colyseus holds a dropped session. After that, players rejoin with their seat key. */
export const RECONNECT_SECONDS = 120;

/**
 * Colyseus sessions come and go; seats do not. Each seat has a stable player id, and this room
 * tracks whichever session currently holds it.
 */
export class TableRoom extends Room {
  /** The table caps seats at 10; the spare room is for players rejoining while an old session lingers. */
  maxClients = 20;
  /** Overridden in tests to run timers quickly. */
  timings: Timings = DEFAULT_TIMINGS;
  table!: Table;
  private playerOf = new Map<string, string>();
  private sessionOf = new Map<string, string>();

  async onCreate(): Promise<void> {
    this.roomId = await uniqueCode();
    this.table = new Table({
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
    this.onMessage('start', (client) => this.withPlayer(client, (id) => this.table.start(id)));
    this.onMessage('move', (client, message) => this.withPlayer(client, (id) => this.table.move(id, message)));
    this.onMessage('sync', (client) => this.withPlayer(client, (id) => this.table.sync(id)));
  }

  onJoin(client: Client, options?: JoinOptions): void {
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

async function uniqueCode(): Promise<string> {
  for (;;) {
    const code = generateCode();
    if (!(await matchMaker.getRoomById(code))) return code;
  }
}
