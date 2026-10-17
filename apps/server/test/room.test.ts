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

/** Joins and waits for the first snapshot (sent in reply to `sync`). */
async function seated(room: ClientRoom): Promise<TableSnapshot> {
  const snap = nextSnapshot(room);
  room.send('sync', {});
  return snap;
}

describe('TableRoom', () => {
  it('creates a table with a short join code that others can join by', async () => {
    const host = await colyseus.sdk.create('table', { name: 'Thabo' });
    expect(host.roomId).toMatch(new RegExp(`^[A-Z2-9]{${CODE_LENGTH}}$`));
    const me = await seated(host);
    const seen = nextSnapshot(host, (s) => s.seats.length === 2);
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'Neo' });
    const snap = await seen;
    expect(snap.code).toBe(host.roomId);
    expect(snap.seats.map((s) => s.name)).toEqual(['Thabo', 'Neo']);
    expect(snap.hostId).toBe(me.you);
    await guest.leave();
    await host.leave();
  });

  it('starts a game, sends each player only their own hand and refuses newcomers', async () => {
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
    expect(guestJson).not.toContain(a.seatKey!);

    await expect(colyseus.sdk.joinById(host.roomId, { name: 'Late' })).rejects.toThrow(/already in progress/);
    await guest.leave();
    await host.leave();
  });

  it('lets a dropped player reconnect, and their token changes each time', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    const started = nextSnapshot(guest, (s) => s.status === 'playing');
    host.send('start', {});
    const before = await started;

    const dropped = nextSnapshot(host, (s) => s.seats.some((seat) => seat.id === before.you && !seat.connected));
    const token = guest.reconnectionToken;
    guest.connection.close(3000, 'network blip');
    await dropped;

    const restored = nextSnapshot(host, (s) => s.seats.every((seat) => seat.connected));
    const again = await colyseus.sdk.reconnect(token);
    await restored;
    const mine = await seated(again);
    expect(mine.you).toBe(before.you);
    expect(mine.game!.hand).toEqual(before.game!.hand);
    // The old token is spent: a client must keep the new one.
    expect(again.reconnectionToken).not.toBe(token);
    await again.leave();
    await host.leave();
  });

  it('lets a player back into their seat with the seat key once the session is gone', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    const started = nextSnapshot(guest, (s) => s.status === 'playing');
    host.send('start', {});
    const before = await started;

    // The connection dies and the old token is lost (or expired).
    const dropped = nextSnapshot(host, (s) => s.seats.some((seat) => seat.id === before.you && !seat.connected));
    guest.connection.close(3000, 'phone locked');
    await dropped;

    const back = await colyseus.sdk.joinById(host.roomId, { name: 'B', seatKey: before.seatKey! });
    const mine = await seated(back);
    expect(mine.you).toBe(before.you);
    expect(mine.game!.hand).toEqual(before.game!.hand);
    expect(mine.seats.find((s) => s.id === before.you)!.connected).toBe(true);
    expect(mine.seats).toHaveLength(2);
    await back.leave();
    await host.leave();
  });

  it('ignores a wrong seat key', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    host.send('start', {});
    await nextSnapshot(host, (s) => s.status === 'playing');
    await expect(colyseus.sdk.joinById(host.roomId, { name: 'C', seatKey: 'not-a-real-key' })).rejects.toThrow(/already in progress/);
    await guest.leave();
    await host.leave();
  });

  it('counts leaving mid-game as a forfeit', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const guest = await colyseus.sdk.joinById(host.roomId, { name: 'B' });
    const me = await seated(host);
    host.send('start', {});
    await nextSnapshot(host, (s) => s.status === 'playing');
    const over = nextSnapshot(host, (s) => s.status === 'finished');
    await guest.leave(true);
    const end = await over;
    expect(end.game!.winner).toBe(me.you);
    await host.leave();
  });

  it('answers sync with a fresh snapshot', async () => {
    const host = await colyseus.sdk.create('table', { name: 'A' });
    const snap = await seated(host);
    expect(snap.seats.map((s) => s.id)).toEqual([snap.you]);
    expect(snap.seatKey).toMatch(/^[A-Za-z0-9]{24}$/);
    await host.leave();
  });

  it('serves a health check', async () => {
    const res = await colyseus.http.get('/healthz');
    expect(res.data).toEqual({ ok: true });
  });
});
