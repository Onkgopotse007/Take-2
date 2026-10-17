/** End-to-end: a real Colyseus server and SDK clients over WebSockets. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as ClientRoom } from '@colyseus/sdk';
import { createApp } from '../src/app';
import type { TableSnapshot } from '../src/protocol';
import { CODE_LENGTH } from '../src/random';
import { TableRoom } from '../src/room';
import { DEFAULT_TIMINGS } from '../src/table';

class FastTableRoom extends TableRoom {
  timings = { ...DEFAULT_TIMINGS, countdownMs: 50 };
}

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createApp(FastTableRoom));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

/** Resolves with the next `table` snapshot matching `predicate`. */
function nextSnapshot(room: ClientRoom, predicate: (s: TableSnapshot) => boolean = () => true): Promise<TableSnapshot> {
  return new Promise((resolve) => {
    const off = room.onMessage('table', (snap: TableSnapshot) => {
      if (predicate(snap)) {
        off();
        resolve(snap);
      }
    });
  });
}

describe('TableRoom', () => {
  it('creates a table with a short join code that others can join by', async () => {
    const host = await colyseus.sdk.create('table', { name: 'Thabo' });
    expect(host.roomId).toMatch(new RegExp(`^[A-Z2-9]{${CODE_LENGTH}}$`));
    const seen = nextSnapshot(host, (s) => s.seats.length === 2);
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'Neo' });
    const snap = await seen;
    expect(snap.code).toBe(host.roomId);
    expect(snap.seats.map((s) => s.name)).toEqual(['Thabo', 'Neo']);
    expect(snap.hostId).toBe(host.sessionId);
    await guest.leave();
    await host.leave();
  });

  it('starts a game, sends each player only their own hand and locks the table', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    const hostGame = nextSnapshot(host, (s) => s.status === 'playing');
    const guestGame = nextSnapshot(guest, (s) => s.status === 'playing');
    host.send('start', {});
    const [a, b] = await Promise.all([hostGame, guestGame]);
    expect(a.game!.hand).toHaveLength(4);
    expect(b.game!.hand).toHaveLength(4);
    const guestJson = JSON.stringify(b);
    for (const card of a.game!.hand) expect(guestJson).not.toContain(`"${card.id}"`);

    await expect(colyseus.sdk.joinById(host.roomId, { name: 'Late' })).rejects.toThrow();
    await guest.leave();
    await host.leave();
  });

  it('holds the seat of a dropped player and lets them reconnect with their token', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    const started = nextSnapshot(guest, (s) => s.status === 'playing');
    host.send('start', {});
    const before = await started;

    const dropped = nextSnapshot(host, (s) => s.seats.some((seat) => seat.id === guest.sessionId && !seat.connected));
    const token = guest.reconnectionToken;
    guest.connection.close(3000, 'network blip');
    await dropped;

    const restored = nextSnapshot(host, (s) => s.seats.every((seat) => seat.connected));
    const again = await colyseus.sdk.reconnect(token);
    expect(again.sessionId).toBe(guest.sessionId);
    await restored;
    const mine = nextSnapshot(again);
    again.send('sync', {});
    expect((await mine).game!.hand).toEqual(before.game!.hand);
    await again.leave();
    await host.leave();
  });

  it('answers sync with a fresh snapshot', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const snap = nextSnapshot(host);
    host.send('sync', {});
    expect((await snap).you).toBe(host.sessionId);
    await host.leave();
  });

  it('serves a health check', async () => {
    const res = await colyseus.http.get('/healthz');
    expect(res.data).toEqual({ ok: true });
  });
});
