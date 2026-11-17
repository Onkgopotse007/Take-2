import { MIN_PLAYERS, randomInt, type Rng } from '@take2/engine';
import {
  applyMove,
  createGame,
  getLegalMoves,
  getPlayerView,
  neighbours,
  type GameEvent,
  type MadagascarState,
  type Move,
} from '@take2/madagascar';
import type { MadagascarClientMove, MadagascarServerMessages, MadagascarSnapshot, Rejection, ServerRejectionCode, TableStatus } from './protocol';
import { Seating } from './seating';
import { DEFAULT_TIMINGS, MISSED_TURNS_LIMIT, rejection, type Outbox, type Scheduler, type Timer, type Timings } from './table';

export interface MadagascarTableOptions {
  code: string;
  rng: Rng;
  scheduler: Scheduler;
  outbox: Outbox<MadagascarServerMessages>;
  timings?: Timings;
  onStatusChange?: (status: TableStatus) => void;
}

/**
 * One Madagascar table: lobby, the authoritative game state, timers and the race to turn the
 * first card. Transport-agnostic so it can be tested with a fake clock.
 */
export class MadagascarTable {
  readonly code: string;
  private readonly rng: Rng;
  private readonly scheduler: Scheduler;
  private readonly outbox: Outbox<MadagascarServerMessages>;
  private readonly timings: Timings;
  private readonly onStatusChange: (status: TableStatus) => void;
  private readonly seating: Seating;

  private game: MadagascarState | null = null;
  private raceOpensAt: number | null = null;
  private deadline: number | null = null;
  private timer: Timer | null = null;
  private raceCandidates: { player: string; move: Move }[] | null = null;
  private raceTimer: Timer | null = null;
  /** Timed-out turns in a row, per player. */
  private missed = new Map<string, number>();
  private wins = new Map<string, number>();

  constructor(options: MadagascarTableOptions) {
    this.code = options.code;
    this.rng = options.rng;
    this.scheduler = options.scheduler;
    this.outbox = options.outbox;
    this.timings = options.timings ?? DEFAULT_TIMINGS;
    this.onStatusChange = options.onStatusChange ?? (() => {});
    this.seating = new Seating(this.rng);
  }

  get status(): TableStatus {
    if (!this.game) return 'lobby';
    return this.game.phase === 'gameOver' ? 'finished' : 'playing';
  }

  get playerCount(): number {
    return this.seating.count;
  }

  join(id: string, rawName: unknown): Rejection | null {
    if (this.status === 'playing') return rejection('GAME_IN_PROGRESS');
    if (this.seating.full) return rejection('TABLE_FULL');
    this.seating.add(id, rawName);
    this.broadcastSnapshots();
    return null;
  }

  reclaim(seatKey: unknown): string | null {
    const id = this.seating.reclaim(seatKey);
    if (id) this.setConnected(id, true);
    return id;
  }

  /** As for Take 2: choosing to leave mid-game forfeits; a lost connection keeps the seat. */
  leave(id: string, chose = false): void {
    const seat = this.seating.seat(id);
    if (!seat) return;
    if (this.status === 'playing') {
      seat.connected = false;
      const stillIn = this.game?.players.some((p) => p.id === id && p.status === 'active');
      if (chose && stillIn) {
        this.seating.reassignHostIfNeeded();
        this.apply({ type: 'forfeit', player: id, reason: 'left' });
        return;
      }
    } else {
      this.seating.remove(id);
    }
    this.seating.reassignHostIfNeeded();
    this.reschedule();
    this.broadcastSnapshots();
  }

  setConnected(id: string, connected: boolean): void {
    const seat = this.seating.seat(id);
    if (!seat) return;
    seat.connected = connected;
    if (!connected) this.seating.reassignHostIfNeeded();
    this.reschedule();
    this.broadcastSnapshots();
  }

  start(id: string): void {
    if (this.status === 'playing') return this.reject(id, 'GAME_IN_PROGRESS');
    if (id !== this.seating.hostId) return this.reject(id, 'NOT_HOST');
    this.seating.pruneDisconnected();
    if (this.seating.count < MIN_PLAYERS) return this.reject(id, 'NOT_ENOUGH_PLAYERS');
    this.missed.clear();
    this.game = createGame(
      this.seating.seats.map((s) => s.id),
      this.rng,
    );
    this.raceOpensAt = this.scheduler.now() + this.timings.countdownMs;
    this.onStatusChange('playing');
    this.reschedule();
    this.broadcastSnapshots();
  }

  move(id: string, raw: unknown): void {
    const parsed = parseMadagascarMove(raw);
    if (!parsed) return this.reject(id, 'BAD_MESSAGE');
    if (!this.game || this.status !== 'playing') return this.reject(id, 'WRONG_PHASE');
    const move = { ...parsed, player: id } as Move;
    if (this.game.turn.kind === 'race') {
      this.racePlay(id, move);
      return;
    }
    if (this.apply(move)) this.missed.delete(id);
  }

  sync(id: string): void {
    if (this.seating.seat(id)) this.outbox.send(id, 'table', this.snapshotFor(id));
  }

  /** Replaces the game state. Used by tests to set up exact positions. */
  loadState(state: MadagascarState, raceOpensAt: number | null = null): void {
    this.game = structuredClone(state);
    this.raceOpensAt = raceOpensAt;
    this.reschedule();
    this.broadcastSnapshots();
  }

  dispose(): void {
    this.timer?.clear();
    this.raceTimer?.clear();
    this.timer = this.raceTimer = null;
  }

  snapshotFor(id: string): MadagascarSnapshot {
    return {
      code: this.code,
      you: id,
      seatKey: this.seating.keyOf(id),
      hostId: this.seating.hostId,
      seats: this.seating.publicSeats(),
      status: this.status,
      wins: Object.fromEntries(this.wins),
      game: this.game ? getPlayerView(this.game, id) : null,
      raceOpensAt: this.raceOpensAt,
      deadline: this.deadline,
      serverNow: this.scheduler.now(),
    };
  }

  // -------------------------------------------------------------------------

  /** The first card races on the server clock, as in Take 2: ties within a short window are settled at random. */
  private racePlay(id: string, move: Move): void {
    if (this.raceOpensAt !== null && this.scheduler.now() < this.raceOpensAt) return this.reject(id, 'TOO_EARLY');
    const result = applyMove(this.game!, move);
    if (!result.ok) return this.outbox.send(id, 'rejected', { code: result.code, reason: result.reason });
    if (!this.raceCandidates) {
      this.raceCandidates = [];
      this.clearTimer();
      this.raceTimer = this.scheduler.setTimeout(() => this.resolveRace(), this.timings.raceTieWindowMs);
    }
    this.raceCandidates = this.raceCandidates.filter((c) => c.player !== id);
    this.raceCandidates.push({ player: id, move });
    this.missed.delete(id);
  }

  private resolveRace(): void {
    const candidates = this.raceCandidates ?? [];
    this.raceCandidates = null;
    this.raceTimer = null;
    if (candidates.length === 0 || !this.game) return;
    const winner = candidates[randomInt(this.rng, candidates.length)]!;
    for (const c of candidates) if (c !== winner) this.reject(c.player, 'BEATEN_TO_IT');
    this.apply(winner.move);
  }

  private apply(move: Move): boolean {
    if (!this.game) return false;
    const result = applyMove(this.game, move);
    if (!result.ok) {
      this.outbox.send(move.player, 'rejected', { code: result.code, reason: result.reason });
      return false;
    }
    const wasPlaying = this.status === 'playing';
    this.game = result.state;
    const finished = wasPlaying && (this.status as TableStatus) === 'finished';
    if (finished) for (const id of this.game.ranking?.[0] ?? []) this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
    this.broadcastEvents(result.events);
    this.reschedule();
    this.broadcastSnapshots();
    if (finished) this.onStatusChange('finished');
    return true;
  }

  /** Sets the one timer that keeps the game moving when players do not act. */
  private reschedule(): void {
    this.clearTimer();
    const g = this.game;
    if (!g || this.raceCandidates || g.phase === 'gameOver') return;
    const now = this.scheduler.now();
    const after = (ms: number, fire: () => void) => {
      this.deadline = now + ms;
      this.timer = this.scheduler.setTimeout(() => {
        this.timer = null;
        this.deadline = null;
        fire();
      }, ms);
    };
    const turnMs = (...ids: string[]) =>
      ids.some((id) => this.seating.seat(id)?.connected) ? this.timings.turnTimeoutMs : this.timings.disconnectedTurnMs;

    const t = g.turn;
    if (t.kind === 'race') {
      // Nobody turned the first card: a random player turns a random one.
      const wait = Math.max(0, (this.raceOpensAt ?? now) - now) + this.timings.startTimeoutMs;
      after(wait, () => {
        const ids = g.players.filter((p) => p.status === 'active').map((p) => p.id);
        this.applyRandomMove(ids[randomInt(this.rng, ids.length)]!);
      });
    } else if (t.kind === 'neighbours') {
      const { left, right } = neighbours(g, t.starter);
      after(turnMs(left, right), () => this.applyRandomMove(randomInt(this.rng, 2) === 0 ? left : right));
    } else if (t.kind === 'player') {
      after(turnMs(t.player), () => this.autoTurn(t.player));
    }
  }

  /** Out of time: a random card is turned or played for them. The third time in a row forfeits. */
  private autoTurn(player: string): void {
    const g = this.game;
    if (!g || g.turn.kind !== 'player' || g.turn.player !== player) return;
    const missed = (this.missed.get(player) ?? 0) + 1;
    if (missed >= MISSED_TURNS_LIMIT) {
      this.missed.delete(player);
      this.apply({ type: 'forfeit', player, reason: 'missedTurns' });
      return;
    }
    this.missed.set(player, missed);
    this.applyRandomMove(player);
  }

  private applyRandomMove(player: string): void {
    const moves = this.game ? getLegalMoves(this.game, player) : [];
    if (moves.length > 0) this.apply(moves[randomInt(this.rng, moves.length)]!);
  }

  private clearTimer(): void {
    this.timer?.clear();
    this.timer = null;
    this.deadline = null;
  }

  private broadcastSnapshots(): void {
    for (const seat of this.seating.seats) this.outbox.send(seat.id, 'table', this.snapshotFor(seat.id));
  }

  private broadcastEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    for (const seat of this.seating.seats) this.outbox.send(seat.id, 'events', events);
  }

  private reject(id: string, code: ServerRejectionCode): void {
    this.outbox.send(id, 'rejected', rejection(code));
  }
}

/** Validates the shape of an untrusted client move. Rule checks are left to the engine. */
export function parseMadagascarMove(raw: unknown): MadagascarClientMove | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'turn') return Number.isInteger(m.slot) ? { type: 'turn', slot: m.slot as number } : null;
  if (m.type === 'play') return typeof m.cardId === 'string' ? { type: 'play', cardId: m.cardId } : null;
  return null;
}
