import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type Room } from '@colyseus/sdk';
import type { GameEvent } from '@take2/engine';
import type { ClientMove, Rejection, TableSnapshot } from '@take2/server/protocol';
import { syncServerClock } from '../lib/clock';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface FeedItem {
  id: number;
  event: GameEvent;
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

const tokenKey = (code: string) => `take2:token:${code}`;
/** One open (or opening) room per table code, so React re-mounts never open a second connection. */
const opening = new Map<string, Promise<Room>>();
let seq = 0;

/** Creates a table and keeps the room open for the table page. Returns the join code. */
export async function createTable(name: string): Promise<string> {
  const room = await getClient().create('table', { name });
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
      return getClient().joinById(code, { name });
    })();
    p.catch(() => opening.delete(code));
    opening.set(code, p);
  }
  return p;
}

function friendlyError(err: unknown, code: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/not found|invalid|does not exist/i.test(message)) return `No table found with code ${code}.`;
  if (/locked/i.test(message)) return 'A game is already in progress at this table.';
  return message || 'Could not connect. Check your connection and try again.';
}

export interface TableSession {
  status: ConnectionStatus;
  error: string | null;
  snapshot: TableSnapshot | null;
  feed: FeedItem[];
  rejection: RejectionItem | null;
  start(): void;
  move(move: ClientMove): void;
  leave(): Promise<void>;
}

export function useTableSession(code: string, name: string | null): TableSession {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [rejection, setRejection] = useState<RejectionItem | null>(null);
  const roomRef = useRef<Room | null>(null);

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
          room.onMessage('table', (s: TableSnapshot) => {
            syncServerClock(s.serverNow);
            setSnapshot(s);
          }),
          room.onMessage('events', (events: GameEvent[]) => {
            const at = Date.now();
            setFeed((f) => [...f.slice(-40), ...events.map((event) => ({ id: ++seq, event, at }))]);
          }),
          room.onMessage('rejected', (r: Rejection) => setRejection({ ...r, id: ++seq, at: Date.now() })),
        );
        const onDrop = () => setStatus('reconnecting');
        const onReconnect = () => {
          setStatus('connected');
          room.send('sync', {});
        };
        const onLeave = () => {
          opening.delete(code);
          setStatus('closed');
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
        // Snapshots sent while joining can arrive before these handlers existed.
        room.send('sync', {});
      },
      (err) => {
        if (!active) return;
        setStatus('error');
        setError(friendlyError(err, code));
      },
    );

    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
    };
  }, [code, name]);

  const start = useCallback(() => roomRef.current?.send('start', {}), []);
  const move = useCallback((m: ClientMove) => roomRef.current?.send('move', m), []);
  const leave = useCallback(async () => {
    sessionStorage.removeItem(tokenKey(code));
    opening.delete(code);
    await roomRef.current?.leave(true);
    roomRef.current = null;
  }, [code]);

  return { status, error, snapshot, feed, rejection, start, move, leave };
}
