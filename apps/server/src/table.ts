import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  createGame,
  getPlayerView,
  neighbours,
  randomInt,
  type GameEvent,
  type GameState,
  type Move,
  type Rng,
} from '@take2/engine';
import type { ClientMove, Rejection, Seat, ServerMessages, ServerRejectionCode, TableSnapshot, TableStatus } from './protocol';

export interface Timings {
  /** Countdown after dealing before starting plays are accepted. */
  countdownMs: number;
  /** Starting plays arriving this soon after the first one are treated as a tie. */
  raceTieWindowMs: number;
  /** After the countdown, how long before a random player is made to start. */
  startTimeoutMs: number;
  turnTimeoutMs: number;
  /** Turn time for a player who has disconnected, so the table is not held up. */
  disconnectedTurnMs: number;
  tossTimeoutMs: number;
  /** Break between rounds (where interstitial ads will go). */
  roundBreakMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  countdownMs: 3_000,
  raceTieWindowMs: 150,
  startTimeoutMs: 15_000,
  turnTimeoutMs: 10_000,
  disconnectedTurnMs: 10_000,
  tossTimeoutMs: 20_000,
  roundBreakMs: 10_000,
};

export interface Timer {
  clear(): void;
}

export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, ms: number): Timer;
}

export interface Outbox {
  send<K extends keyof ServerMessages>(playerId: string, type: K, message: ServerMessages[K]): void;
}

export interface TableOptions {
  code: string;
  rng: Rng;
  scheduler: Scheduler;
  outbox: Outbox;
  timings?: Timings;
  onStatusChange?: (status: TableStatus) => void;
}

const REASONS: Partial<Record<ServerRejectionCode, string>> = {
  BAD_MESSAGE: 'That message was not understood.',
  TOO_EARLY: 'Wait for the countdown to finish.',
  BEATEN_TO_IT: 'Someone else started first.',
  NOT_HOST: 'Only the host can start the game.',
  NOT_ENOUGH_PLAYERS: `At least ${MIN_PLAYERS} players are needed.`,
  GAME_IN_PROGRESS: 'A game is already in progress at this table.',
  TABLE_FULL: `This table is full (${MAX_PLAYERS} players).`,
};

const NAME_MAX = 20;
/** Timed-out turns in a row before a player forfeits. */
export const MISSED_TURNS_LIMIT = 3;
const KEY_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * One game table: lobby, the authoritative engine state, timers and the start race.
 * Transport-agnostic so it can be tested with a fake clock.
 */
export class Table {
  readonly code: string;
  private readonly rng: Rng;
  private readonly scheduler: Scheduler;
  private readonly outbox: Outbox;
  private readonly timings: Timings;
  private readonly onStatusChange: (status: TableStatus) => void;

  private seats: Seat[] = [];
  private hostId: string | null = null;
  private game: GameState | null = null;
  private raceOpensAt: number | null = null;
  private deadline: number | null = null;
  private timer: Timer | null = null;
  private raceCandidates: { player: string; move: Move }[] | null = null;
  private raceTimer: Timer | null = null;
  /** Secret per seat, so a player can get back into their seat even if their session is gone. */
  private keys = new Map<string, string>();
  /** Timed-out turns in a row, per player. */
  private missed = new Map<string, number>();

  constructor(options: TableOptions) {
    this.code = options.code;
    this.rng = options.rng;
    this.scheduler = options.scheduler;
    this.outbox = options.outbox;
    this.timings = options.timings ?? DEFAULT_TIMINGS;
    this.onStatusChange = options.onStatusChange ?? (() => {});
  }

  get status(): TableStatus {
    if (!this.game) return 'lobby';
    return this.game.phase === 'gameOver' ? 'finished' : 'playing';
  }

  get playerCount(): number {
    return this.seats.length;
  }

  /** Returns a rejection if the player may not sit down. */
  join(id: string, rawName: unknown): Rejection | null {
    if (this.status === 'playing') return rejection('GAME_IN_PROGRESS');
    if (this.seats.length >= MAX_PLAYERS) return rejection('TABLE_FULL');
    this.seats.push({ id, name: cleanName(rawName, this.seats.length + 1), connected: true });
    this.keys.set(id, this.newKey());
    this.hostId ??= id;
    this.broadcastSnapshots();
    return null;
  }

  /**
   * Returns the player whose seat `seatKey` opens, and marks them connected again. This works even
   * after their session has expired, so nobody is locked out of their own game.
   */
  reclaim(seatKey: unknown): string | null {
    if (typeof seatKey !== 'string' || !seatKey) return null;
    for (const [id, key] of this.keys) {
      if (key === seatKey && this.seat(id)) {
        this.setConnected(id, true);
        return id;
      }
    }
    return null;
  }

  /**
   * A player's session ended. If they chose to leave mid-game they forfeit; if their connection
   * simply ran out, their seat stays and their turns time out until they come back.
   */
  leave(id: string, chose = false): void {
    const seat = this.seat(id);
    if (!seat) return;
    if (this.status === 'playing') {
      seat.connected = false;
      const stillIn = this.game?.players.some((p) => p.id === id && p.status === 'active');
      if (chose && stillIn) {
        this.reassignHostIfNeeded();
        this.apply({ type: 'forfeit', player: id, reason: 'left' });
        return;
      }
    } else {
      this.seats = this.seats.filter((s) => s.id !== id);
      this.keys.delete(id);
    }
    this.reassignHostIfNeeded();
    this.reschedule();
    this.broadcastSnapshots();
  }

  setConnected(id: string, connected: boolean): void {
    const seat = this.seat(id);
    if (!seat) return;
    seat.connected = connected;
    if (!connected) this.reassignHostIfNeeded();
    this.reschedule();
    this.broadcastSnapshots();
  }

  start(id: string): void {
    if (this.status === 'playing') return this.reject(id, 'GAME_IN_PROGRESS');
    if (id !== this.hostId) return this.reject(id, 'NOT_HOST');
    // Anyone who left after a finished game gives up their seat for the rematch.
    this.seats = this.seats.filter((s) => s.connected);
    for (const key of [...this.keys.keys()]) if (!this.seat(key)) this.keys.delete(key);
    if (this.seats.length < MIN_PLAYERS) return this.reject(id, 'NOT_ENOUGH_PLAYERS');
    this.missed.clear();
    this.game = createGame(
      this.seats.map((s) => s.id),
      this.rng,
    );
    this.raceOpensAt = this.scheduler.now() + this.timings.countdownMs;
    this.onStatusChange('playing');
    this.reschedule();
    this.broadcastSnapshots();
  }

  move(id: string, raw: unknown): void {
    const parsed = parseClientMove(raw);
    if (!parsed) return this.reject(id, 'BAD_MESSAGE');
    if (!this.game || this.status !== 'playing') return this.reject(id, 'WRONG_PHASE');
    const move = { ...parsed, player: id } as Move;

    if (move.type === 'play' && this.game.turn.kind === 'race') {
      this.racePlay(id, move);
      return;
    }
    if (this.apply(move)) this.missed.delete(id);
  }

  /** Sends one player a fresh snapshot, e.g. after they register handlers or reconnect. */
  sync(id: string): void {
    if (this.seat(id)) this.outbox.send(id, 'table', this.snapshotFor(id));
  }

  /** Replaces the game state, e.g. to restore a table. Also used by tests to set up exact positions. */
  loadState(state: GameState, raceOpensAt: number | null = null): void {
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

  snapshotFor(id: string): TableSnapshot {
    return {
      code: this.code,
      you: id,
      hostId: this.hostId,
      seats: this.seats.map((s) => ({ ...s })),
      seatKey: this.keys.get(id) ?? null,
      status: this.status,
      game: this.game ? getPlayerView(this.game, id) : null,
      raceOpensAt: this.raceOpensAt,
      deadline: this.deadline,
      serverNow: this.scheduler.now(),
    };
  }

  // -------------------------------------------------------------------------

  /**
   * Starting plays race on the server clock. The first valid play opens a short window; any other
   * valid starting plays in that window tie, and one is chosen at random.
   */
  private racePlay(id: string, move: Move): void {
    if (this.raceOpensAt !== null && this.scheduler.now() < this.raceOpensAt) return this.reject(id, 'TOO_EARLY');
    const result = applyMove(this.game!, move, this.rng);
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
    const result = applyMove(this.game, move, this.rng);
    if (!result.ok) {
      if ('player' in move) this.outbox.send(move.player, 'rejected', { code: result.code, reason: result.reason });
      return false;
    }
    const wasPlaying = this.status === 'playing';
    this.game = result.state;
    if (result.events.some((e) => e.type === 'roundStarted')) {
      this.raceOpensAt = this.scheduler.now() + this.timings.countdownMs;
    }
    this.broadcastEvents(result.events);
    this.reschedule();
    this.broadcastSnapshots();
    if (wasPlaying && (this.status as TableStatus) === 'finished') this.onStatusChange('finished');
    return true;
  }

  /** Sets the one timer that keeps the game moving when players do not act. */
  private reschedule(): void {
    this.clearTimer();
    const g = this.game;
    if (!g || this.raceCandidates) return;
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
      ids.some((id) => this.seat(id)?.connected) ? this.timings.turnTimeoutMs : this.timings.disconnectedTurnMs;

    switch (g.phase) {
      case 'playing': {
        const t = g.turn;
        if (t.kind === 'race') {
          const wait = Math.max(0, (this.raceOpensAt ?? now) - now) + this.timings.startTimeoutMs;
          after(wait, () => this.apply({ type: 'forceStart' }));
        } else if (t.kind === 'neighbours') {
          const { left, right } = neighbours(g, t.starter);
          after(turnMs(left, right), () => {
            const player = randomInt(this.rng, 2) === 0 ? left : right;
            this.apply({ type: 'pick', player });
          });
        } else if (t.kind === 'player') {
          after(turnMs(t.player), () => this.autoTurn(t.player));
        }
        break;
      }
      case 'toss': {
        const tossing = Object.keys(g.tossLayouts);
        const ms = tossing.some((id) => this.seat(id)?.connected) ? this.timings.tossTimeoutMs : this.timings.disconnectedTurnMs;
        after(ms, () => {
          for (const player of tossing) {
            if (!this.game?.tossLayouts[player]) continue;
            const a = randomInt(this.rng, 4);
            const b = (a + 1 + randomInt(this.rng, 3)) % 4;
            this.apply({ type: 'toss', player, picks: [a, b] });
          }
        });
        break;
      }
      case 'roundOver':
        after(this.timings.roundBreakMs, () => this.apply({ type: 'nextRound' }));
        break;
      case 'gameOver':
        break;
    }
  }

  /**
   * Out of time: keep a picked card, otherwise pick (which takes any pending penalty).
   * The third timed-out turn in a row forfeits the game.
   */
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
    this.apply(g.pickedCardId ? { type: 'pass', player } : { type: 'pick', player });
  }

  private newKey(): string {
    let key = '';
    for (let i = 0; i < 24; i++) key += KEY_ALPHABET[randomInt(this.rng, KEY_ALPHABET.length)];
    return key;
  }

  private clearTimer(): void {
    this.timer?.clear();
    this.timer = null;
    this.deadline = null;
  }

  private broadcastSnapshots(): void {
    for (const seat of this.seats) this.outbox.send(seat.id, 'table', this.snapshotFor(seat.id));
  }

  private broadcastEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    for (const seat of this.seats) this.outbox.send(seat.id, 'events', events);
  }

  private reject(id: string, code: ServerRejectionCode): void {
    this.outbox.send(id, 'rejected', rejection(code));
  }

  private seat(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  private reassignHostIfNeeded(): void {
    const host = this.hostId ? this.seat(this.hostId) : undefined;
    if (host?.connected) return;
    this.hostId = this.seats.find((s) => s.connected)?.id ?? this.seats[0]?.id ?? null;
  }
}

function rejection(code: ServerRejectionCode): Rejection {
  return { code, reason: REASONS[code] ?? 'That move is not allowed.' };
}

export function cleanName(raw: unknown, seatNumber: number): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return name || `Player ${seatNumber}`;
}

/** Validates the shape of an untrusted client move. Rule checks are left to the engine. */
export function parseClientMove(raw: unknown): ClientMove | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'play':
      if (typeof m.cardId !== 'string') return null;
      return {
        type: 'play',
        cardId: m.cardId,
        ...(typeof m.suit === 'string' ? { suit: m.suit as never } : {}),
        announce: m.announce === true,
      };
    case 'pick':
    case 'pass':
      return { type: m.type };
    case 'callOut':
      return typeof m.target === 'string' ? { type: 'callOut', target: m.target } : null;
    case 'toss': {
      const p = m.picks;
      if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number')) return null;
      return { type: 'toss', picks: [p[0] as number, p[1] as number] };
    }
    default:
      return null;
  }
}
