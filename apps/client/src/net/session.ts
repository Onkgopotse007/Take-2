import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type Room } from '@colyseus/sdk';
import type { GameEvent, GameMode } from '@take2/engine';
import type { ClientMove, Rejection, TableSnapshot } from '@take2/server/protocol';
import { syncServerClock } from '../lib/clock';
import { GAME } from '../lib/game';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface FeedItem<E = GameEvent> {
  id: number;
  event: E;
  at: number;
}

export interface RejectionItem extends Rejection {
  id: number;
  at: number;
}

function endpoint(): string {
  return import.meta.env.VITE_SERVER_URL || `${location.origin}/api`;
}

let client: Client | null = null;
const getClient = () => (client ??= new Client(endpoint()));
/** Colyseus room type for this site's game. */
const ROOM_TYPE = GAME === 'madagascar' ? 'madagascar' : 'table';

const tokenKey = (code: string) => `take2:token:${code}`;
const seatKeyKey = (code: string) => `take2:seat:${code}`;

/** Seat keys outlive the tab (localStorage), so closing the browser does not cost anyone their seat. */
function loadSeatKey(code: string): string | undefined {
  try {
    return localStorage.getItem(seatKeyKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}
function saveSeatKey(code: string, key: string | null): void {
  try {
    if (key) localStorage.setItem(seatKeyKey(code), key);
    else localStorage.removeItem(seatKeyKey(code));
  } catch {
    // Private browsing: rejoining then relies on the session token alone.
  }
}

/** How many times to rejoin by ourselves after the SDK gives up, before showing "Rejoin". */
const AUTO_REJOIN_ATTEMPTS = 3;
/** One open (or opening) room per table code, so React re-mounts never open a second connection. */
const opening = new Map<string, Promise<Room>>();
let seq = 0;

/** Creates a table and keeps the room open for the table page. Returns the join code. */
export async function createTable(name: string): Promise<string> {
  const room = await getClient().create(ROOM_TYPE, { name, game: GAME });
  sessionStorage.setItem(tokenKey(room.roomId), room.reconnectionToken);
  opening.set(room.roomId, Promise.resolve(room));
  return room.roomId;
}

function openRoom(code: string, name: string): Promise<Room> {
  let p = opening.get(code);
  if (!p) {
    p = (async () => {
      const token = sessionStorage.getItem(tokenKey(code));
      if (token) {
        try {
          return await getClient().reconnect(token);
        } catch {
          sessionStorage.removeItem(tokenKey(code));
        }
      }
      // The token can be spent or expired; the seat key still gets us back into our own seat.
      return getClient().joinById(code, { name, game: GAME, seatKey: loadSeatKey(code) });
    })();
    p.catch(() => opening.delete(code));
    opening.set(code, p);
  }
  return p;
}

function friendlyError(err: unknown, code: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ is a .* table\./.test(message)) return message;
  if (/not found|invalid|does not exist/i.test(message)) return `No table found with code ${code}.`;
  if (/locked/i.test(message)) return 'A game is already in progress at this table.';
  return message || 'Could not connect. Check your connection and try again.';
}

/** The parts of a snapshot the session itself uses. Both games' snapshots have them. */
interface BaseSnapshot {
  seatKey: string | null;
  serverNow: number;
}

/** A connection to one table. The type parameters default to Take 2's messages. */
export interface TableSession<S extends BaseSnapshot = TableSnapshot, E = GameEvent, M = ClientMove> {
  status: ConnectionStatus;
  error: string | null;
  snapshot: S | null;
  feed: FeedItem<E>[];
  rejection: RejectionItem | null;
  start(): void;
  /** Take 2 only. */
  setRules(rules: { mode: GameMode; noElimination: boolean }): void;
  move(move: M): void;
  leave(): Promise<void>;
}

export function useTableSession<S extends BaseSnapshot = TableSnapshot, E = GameEvent, M = ClientMove>(
  code: string,
  name: string | null,
): TableSession<S, E, M> {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<S | null>(null);
  const [feed, setFeed] = useState<FeedItem<E>[]>([]);
  const [rejection, setRejection] = useState<RejectionItem | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [attempt, setAttempt] = useState(0);
  const leaving = useRef(false);

  useEffect(() => {
    if (!name) return;
    let active = true;
    const cleanups: (() => void)[] = [];
    setStatus('connecting');
    setError(null);

    openRoom(code, name).then(
      (room) => {
        if (!active) return;
        roomRef.current = room;
        sessionStorage.setItem(tokenKey(code), room.reconnectionToken);

        cleanups.push(
          room.onMessage('table', (s: S) => {
            syncServerClock(s.serverNow);
            if (s.seatKey) saveSeatKey(code, s.seatKey);
            setSnapshot(s);
          }),
          room.onMessage('events', (events: E[]) => {
            const at = Date.now();
            setFeed((f) => [...f.slice(-40), ...events.map((event) => ({ id: ++seq, event, at }))]);
          }),
          room.onMessage('rejected', (r: Rejection) => setRejection({ ...r, id: ++seq, at: Date.now() })),
        );
        const onDrop = () => setStatus('reconnecting');
        const onReconnect = () => {
          // Colyseus issues a new token on every reconnect; the old one no longer works.
          sessionStorage.setItem(tokenKey(code), room.reconnectionToken);
          setStatus('connected');
          room.send('sync', {});
        };
        const onLeave = () => {
          opening.delete(code);
          roomRef.current = null;
          if (leaving.current) return setStatus('closed');
          // The SDK gave up reconnecting. Try again ourselves with the seat key before giving up.
          if (attempt < AUTO_REJOIN_ATTEMPTS) {
            setStatus('reconnecting');
            setTimeout(() => setAttempt((a) => a + 1), 1500 * (attempt + 1));
          } else {
            setStatus('closed');
          }
        };
        room.onDrop(onDrop);
        room.onReconnect(onReconnect);
        room.onLeave(onLeave);
        cleanups.push(
          () => room.onDrop.remove(onDrop),
          () => room.onReconnect.remove(onReconnect),
          () => room.onLeave.remove(onLeave),
        );

        setStatus('connected');
        setAttempt(0);
        // Snapshots sent while joining can arrive before these handlers existed.
        room.send('sync', {});
      },
      (err) => {
        if (!active) return;
        if (attempt > 0 && attempt < AUTO_REJOIN_ATTEMPTS) {
          setTimeout(() => setAttempt((a) => a + 1), 1500 * (attempt + 1));
          return;
        }
        setStatus(attempt > 0 ? 'closed' : 'error');
        setError(friendlyError(err, code));
      },
    );

    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
    };
  }, [code, name, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => roomRef.current?.send('start', {}), []);
  const setRules = useCallback((rules: { mode: GameMode; noElimination: boolean }) => roomRef.current?.send('setMode', rules), []);
  const move = useCallback((m: M) => roomRef.current?.send('move', m), []);
  const leave = useCallback(async () => {
    leaving.current = true;
    sessionStorage.removeItem(tokenKey(code));
    saveSeatKey(code, null);
    opening.delete(code);
    await roomRef.current?.leave(true);
    roomRef.current = null;
  }, [code]);

  return { status, error, snapshot, feed, rejection, start, setRules, move, leave };
}
