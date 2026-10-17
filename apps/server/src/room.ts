import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import type { JoinOptions } from './protocol';
import { cryptoRng, generateCode } from './random';
import { DEFAULT_TIMINGS, Table, type Timings } from './table';

/** How long a dropped player's seat is held for them to reconnect. */
export const RECONNECT_SECONDS = 120;

export class TableRoom extends Room {
  maxClients = 10;
  /** Overridden in tests to run timers quickly. */
  timings: Timings = DEFAULT_TIMINGS;
  table!: Table;

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
        send: (playerId, type, message) => this.clients.getById(playerId)?.send(type, message),
      },
      // New players cannot join mid-game. Reconnections still work while locked.
      onStatusChange: (status) => void (status === 'playing' ? this.lock() : this.unlock()),
    });
    this.onMessage('start', (client) => this.table.start(client.sessionId));
    this.onMessage('move', (client, message) => this.table.move(client.sessionId, message));
    this.onMessage('sync', (client) => this.table.sync(client.sessionId));
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const refused = this.table.join(client.sessionId, options?.name);
    if (refused) throw new ServerError(4001, refused.reason);
  }

  onDrop(client: Client): void {
    this.table.setConnected(client.sessionId, false);
    // If they do not return in time, Colyseus calls onLeave.
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client): void {
    this.table.setConnected(client.sessionId, true);
  }

  onLeave(client: Client): void {
    this.table.leave(client.sessionId);
  }

  onDispose(): void {
    this.table.dispose();
  }
}

async function uniqueCode(): Promise<string> {
  for (;;) {
    const code = generateCode();
    if (!(await matchMaker.getRoomById(code))) return code;
  }
}
