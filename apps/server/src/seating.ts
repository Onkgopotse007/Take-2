import { MAX_PLAYERS, randomInt, type Rng } from '@take2/engine';
import type { Seat } from './protocol';

const NAME_MAX = 20;
const KEY_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Who sits at a table, whatever game it plays: names, the host, who is connected, and a secret
 * key per seat so a player can always get back into their own seat.
 */
export class Seating {
  seats: Seat[] = [];
  hostId: string | null = null;
  private keys = new Map<string, string>();

  constructor(private readonly rng: Rng) {}

  get count(): number {
    return this.seats.length;
  }

  get full(): boolean {
    return this.seats.length >= MAX_PLAYERS;
  }

  seat(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  keyOf(id: string): string | null {
    return this.keys.get(id) ?? null;
  }

  add(id: string, rawName: unknown): void {
    this.seats.push({ id, name: cleanName(rawName, this.seats.length + 1), connected: true });
    this.keys.set(id, this.newKey());
    this.hostId ??= id;
  }

  remove(id: string): void {
    this.seats = this.seats.filter((s) => s.id !== id);
    this.keys.delete(id);
  }

  /**
   * Returns the player whose seat `seatKey` opens, and marks them connected again. This works even
   * after their session has expired, so nobody is locked out of their own game.
   */
  reclaim(seatKey: unknown): string | null {
    if (typeof seatKey !== 'string' || !seatKey) return null;
    for (const [id, key] of this.keys) {
      if (key === seatKey && this.seat(id)) {
        this.seat(id)!.connected = true;
        return id;
      }
    }
    return null;
  }

  /** Before a new game: anyone who left after the last one gives up their seat. */
  pruneDisconnected(): void {
    this.seats = this.seats.filter((s) => s.connected);
    for (const key of [...this.keys.keys()]) if (!this.seat(key)) this.keys.delete(key);
  }

  reassignHostIfNeeded(): void {
    const host = this.hostId ? this.seat(this.hostId) : undefined;
    if (host?.connected) return;
    this.hostId = this.seats.find((s) => s.connected)?.id ?? this.seats[0]?.id ?? null;
  }

  publicSeats(): Seat[] {
    return this.seats.map((s) => ({ ...s }));
  }

  private newKey(): string {
    let key = '';
    for (let i = 0; i < 24; i++) key += KEY_ALPHABET[randomInt(this.rng, KEY_ALPHABET.length)];
    return key;
  }
}

export function cleanName(raw: unknown, seatNumber: number): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return name || `Player ${seatNumber}`;
}
