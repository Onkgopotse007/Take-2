import { type Card, type Rng, createDeck, shuffle } from '@take2/engine';
import type {
  ForfeitReason,
  GameEvent,
  MadagascarPlayer,
  MadagascarState,
  Move,
  MoveResult,
  PlayerId,
  RejectionCode,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/**
 * Deadlock: the pile is a single card and every play matches it, so the pile never grows. After
 * this many trips round the table of that, the game ends and the players left are ranked by how
 * many cards they hold. Any play that does not match resets the count.
 */
export const DEADLOCK_TRIPS = 2;

const REASONS: Record<RejectionCode, string> = {
  NOT_IN_GAME: 'You are not playing in this game.',
  WRONG_PHASE: 'That move is not possible right now.',
  NOT_YOUR_TURN: 'It is not your turn.',
  NO_CARD_THERE: 'That card has already been turned.',
  CARD_NOT_IN_HAND: 'That card is not in your hand.',
};

type Events = GameEvent[];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Shuffles a 52-card deck into the oval. Players are seated in the order given. */
export function createGame(playerIds: readonly PlayerId[], rng: Rng): MadagascarState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${playerIds.length}.`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Player ids must be unique.');
  return {
    players: playerIds.map((id) => ({ id, hand: [], status: 'active' })),
    phase: 'circle',
    circle: shuffle(createDeck(false), rng),
    pile: [],
    turn: { kind: 'race' },
    direction: null,
    places: [],
    left: [],
    outOfPlay: [],
    stalled: 0,
    ranking: null,
    deadlocked: false,
  };
}

/** Applies a move. Never mutates `state`: returns a new state, or a typed rejection. */
export function applyMove(state: MadagascarState, move: Move): MoveResult {
  const s = structuredClone(state);
  const events: Events = [];
  const code = dispatch(s, move, events);
  if (code) return { ok: false, code, reason: REASONS[code] };
  return { ok: true, state: s, events };
}

export function activePlayers(state: MadagascarState): MadagascarPlayer[] {
  return state.players.filter((p) => p.status === 'active');
}

export function topCard(state: MadagascarState): Card | undefined {
  return state.pile[state.pile.length - 1];
}

/** True if playing `card` now would match the top card's suit and pick up the pile. */
export function matchesTop(state: MadagascarState, card: Card): boolean {
  const top = topCard(state);
  return top !== undefined && suitOf(top) === suitOf(card);
}

/** The next active player from `from` (who may be out) in `dir`. */
export function nextActive(state: MadagascarState, from: PlayerId, dir: 1 | -1 = state.direction ?? 1): PlayerId {
  const n = state.players.length;
  const i = state.players.findIndex((p) => p.id === from);
  for (let step = 1; step <= n; step++) {
    const p = state.players[(((i + dir * step) % n) + n) % n]!;
    if (p.status === 'active') return p.id;
  }
  return from;
}

export function neighbours(state: MadagascarState, of: PlayerId): { left: PlayerId; right: PlayerId } {
  return { left: nextActive(state, of, 1), right: nextActive(state, of, -1) };
}

/** Players allowed to move right now. */
export function playersToAct(state: MadagascarState): PlayerId[] {
  const t = state.turn;
  if (state.phase === 'gameOver') return [];
  if (t.kind === 'race') return activePlayers(state).map((p) => p.id);
  if (t.kind === 'player') return [t.player];
  if (t.kind === 'neighbours') {
    const { left, right } = neighbours(state, t.starter);
    return left === right ? [left] : [left, right];
  }
  return [];
}

/** The slots in the oval that still hold a card. */
export function filledSlots(state: MadagascarState): number[] {
  return state.circle.flatMap((c, i) => (c ? [i] : []));
}

/** Competition ranking: the place of each group, 1 for first. Two players sharing 1st are followed by 3rd. */
export function placeNumbers(groups: readonly PlayerId[][]): number[] {
  let place = 1;
  return groups.map((g) => {
    const p = place;
    place += g.length;
    return p;
  });
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function dispatch(s: MadagascarState, move: Move, ev: Events): RejectionCode | null {
  if (s.phase === 'gameOver') return 'WRONG_PHASE';
  const p = s.players.find((pl) => pl.id === move.player);
  if (!p || p.status !== 'active') return 'NOT_IN_GAME';
  switch (move.type) {
    case 'turn':
      return turnCard(s, p, move.slot, ev);
    case 'play':
      return playCard(s, p, move.cardId, ev);
    case 'forfeit':
      return forfeit(s, p, move.reason, ev);
  }
}

/** Phase 1: turn a face-down card from the oval and play it. */
function turnCard(s: MadagascarState, p: MadagascarPlayer, slot: number, ev: Events): RejectionCode | null {
  if (s.phase !== 'circle') return 'WRONG_PHASE';
  if (!playersToAct(s).includes(p.id)) return 'NOT_YOUR_TURN';
  const card = Number.isInteger(slot) ? s.circle[slot] : undefined;
  if (!card) return 'NO_CARD_THERE';

  const t = s.turn;
  s.circle[slot] = null;
  ev.push({ type: 'played', player: p.id, card, slot });
  lay(s, p, card, ev);

  if (t.kind === 'race') {
    if (activePlayers(s).length === 2) {
      s.direction = 1;
      ev.push({ type: 'directionSet', direction: 1 });
    } else {
      s.turn = { kind: 'neighbours', starter: p.id };
      return null;
    }
  } else if (t.kind === 'neighbours') {
    // The first neighbour to play after the starter sets the direction.
    s.direction = p.id === neighbours(s, t.starter).left ? 1 : -1;
    ev.push({ type: 'directionSet', direction: s.direction });
  }

  if (filledSlots(s).length === 0) endCircle(s, p.id, ev);
  else s.turn = { kind: 'player', player: nextActive(s, p.id) };
  return null;
}

/** Phase 2: play a card of the player's choice from their hand. */
function playCard(s: MadagascarState, p: MadagascarPlayer, cardId: string, ev: Events): RejectionCode | null {
  if (s.phase !== 'hands') return 'WRONG_PHASE';
  if (!playersToAct(s).includes(p.id)) return 'NOT_YOUR_TURN';
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return 'CARD_NOT_IN_HAND';

  const [card] = p.hand.splice(idx, 1);
  ev.push({ type: 'played', player: p.id, card: card! });
  const pileBefore = s.pile.length;
  const matched = lay(s, p, card!, ev);

  if (matched) {
    // A match on a one-card pile leaves the pile at one card: no progress.
    s.stalled = pileBefore === 1 ? s.stalled + 1 : 0;
  } else {
    s.stalled = 0;
    if (p.hand.length === 0) finish(s, [p], ev);
  }

  const still = activePlayers(s);
  if (still.length <= 1) return endGame(s, ev), null;
  if (s.stalled >= DEADLOCK_TRIPS * still.length) return endGame(s, ev, true), null;
  s.turn = { kind: 'player', player: nextActive(s, p.id) };
  return null;
}

/**
 * The player leaves the game for good and comes last. Their cards leave the game. If they were
 * due to play, play passes on.
 */
function forfeit(s: MadagascarState, p: MadagascarPlayer, reason: ForfeitReason, ev: Events): RejectionCode | null {
  ev.push({ type: 'forfeited', player: p.id, reason });
  p.status = 'left';
  s.left.push(p.id);
  s.outOfPlay.push(...p.hand);
  p.hand = [];

  if (activePlayers(s).length <= 1) {
    endGame(s, ev);
    return null;
  }
  const t = s.turn;
  if (t.kind === 'player' && t.player === p.id) {
    s.turn = { kind: 'player', player: nextActive(s, p.id) };
  } else if (t.kind === 'neighbours' && t.starter === p.id) {
    s.direction = 1;
    ev.push({ type: 'directionSet', direction: 1 });
    s.turn = { kind: 'player', player: nextActive(s, p.id) };
  }
  // If they were one of the starter's neighbours, the next seat along becomes the neighbour.
  return null;
}

// ---------------------------------------------------------------------------
// Phases and the end of the game
// ---------------------------------------------------------------------------

/** Puts `card` on the pile. On a suit match the player takes everything that was under it. */
function lay(s: MadagascarState, p: MadagascarPlayer, card: Card, ev: Events): boolean {
  if (matchesTop(s, card)) {
    const taken = s.pile;
    s.pile = [card];
    p.hand.push(...taken);
    ev.push({ type: 'pickedUp', player: p.id, count: taken.length });
    return true;
  }
  s.pile.push(card);
  return false;
}

/** The oval is empty. Anyone without cards shares the next place; phase 2 starts if two or more still hold cards. */
function endCircle(s: MadagascarState, last: PlayerId, ev: Events): void {
  const empty = activePlayers(s).filter((p) => p.hand.length === 0);
  if (empty.length > 0) finish(s, empty, ev);
  if (activePlayers(s).length <= 1) {
    endGame(s, ev);
    return;
  }
  s.phase = 'hands';
  s.stalled = 0;
  ev.push({ type: 'handsPhase' });
  s.turn = { kind: 'player', player: nextActive(s, last) };
}

/** The players finish together, sharing the next place. */
function finish(s: MadagascarState, group: MadagascarPlayer[], ev: Events): void {
  const place = 1 + s.places.reduce((n, g) => n + g.length, 0);
  for (const p of group) {
    p.status = 'finished';
    ev.push({ type: 'finished', player: p.id, place });
  }
  s.places.push(group.map((p) => p.id));
}

/** Places so far, then whoever is still playing (by fewest cards after a deadlock), then leavers, first to leave last. */
function endGame(s: MadagascarState, ev: Events, deadlock = false): void {
  const still = activePlayers(s);
  const byCards = new Map<number, PlayerId[]>();
  for (const p of still) byCards.set(p.hand.length, [...(byCards.get(p.hand.length) ?? []), p.id]);
  const remaining = deadlock
    ? [...byCards.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids)
    : still.map((p) => [p.id]);

  s.ranking = [...s.places, ...remaining, ...s.left.slice().reverse().map((id) => [id])];
  s.phase = 'gameOver';
  s.turn = { kind: 'none' };
  s.deadlocked = deadlock;
  if (deadlock) ev.push({ type: 'deadlock' });
  ev.push({ type: 'gameOver', winners: s.ranking[0] ?? [] });
}

function suitOf(card: Card): string {
  return card.kind === 'suited' ? card.suit : card.colour;
}
