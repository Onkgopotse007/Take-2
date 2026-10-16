import {
  SUITS,
  type Card,
  type Suit,
  cardColour,
  createDeck,
  handPoints,
  isOrdinaryCard,
  isPlainCard,
  isRank,
  suitColour,
  suitsOfColour,
} from './cards';
import { type Rng, shuffle } from './rng';
import type {
  GameEvent,
  GameState,
  Lead,
  Move,
  MoveResult,
  PlayerId,
  PlayerState,
  RejectionCode,
  RoundResult,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const HAND_SIZE = 4;
export const TOSS_LAYOUT_SIZE = 4;
export const SURVIVAL_LIMIT = 15;

const REASONS: Record<RejectionCode, string> = {
  NOT_IN_GAME: 'You are not playing in this game.',
  WRONG_PHASE: 'That move is not possible right now.',
  NOT_YOUR_TURN: 'It is not your turn.',
  CARD_NOT_IN_HAND: 'That card is not in your hand.',
  NOT_A_STARTING_CARD: 'To start, play an ordinary card matching the base suit or number.',
  CARD_NOT_PLAYABLE: 'That card cannot be played on the current card.',
  SUIT_REQUIRED: 'Choose a suit for your 8.',
  ONLY_PICKED_CARD: 'After picking, you may only play the card you picked.',
  ALREADY_PICKED: 'You have already picked this turn.',
  NOTHING_TO_PASS: 'You can only keep a card after picking it.',
  CANNOT_CALL_OUT: 'That player cannot be called out.',
  INVALID_TOSS: 'Pick two different face-down cards.',
};

type Events = GameEvent[];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Creates a game and deals the first round. Players are seated in the order given. */
export function createGame(playerIds: readonly PlayerId[], rng: Rng): GameState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${playerIds.length}.`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Player ids must be unique.');
  }
  const state: GameState = {
    players: playerIds.map((id) => ({ id, hand: [], status: 'active', callable: false })),
    phase: 'playing',
    round: 0,
    drawPile: [],
    discard: [],
    turn: { kind: 'none' },
    direction: null,
    lead: { suits: [], colours: [], ranks: [] },
    penalty: 0,
    pickedCardId: null,
    tossLayouts: {},
    roundResult: null,
    winner: null,
  };
  dealRound(state, rng, []);
  return state;
}

/** Applies a move. Never mutates `state`: returns a new state, or a typed rejection. */
export function applyMove(state: GameState, move: Move, rng: Rng): MoveResult {
  const s = structuredClone(state);
  const events: Events = [];
  const code = dispatch(s, move, rng, events);
  if (code) return { ok: false, code, reason: REASONS[code] };
  return { ok: true, state: s, events };
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.status === 'active');
}

export function topCard(state: GameState): Card | undefined {
  return state.discard[state.discard.length - 1];
}

/** True if `card` may be played by the player whose turn it is (ignoring the picked-card restriction). */
export function canPlayCard(state: GameState, card: Card): boolean {
  if (state.penalty > 0) return isRank(card, 'A') || isRank(card, '2') || card.kind === 'joker';
  if (isRank(card, '8')) return true;
  return matchesLead(card, state.lead);
}

/** True if `card` may open a round on `base`. */
export function canStartOn(card: Card, base: Card, playerCount: number): boolean {
  if (card.kind !== 'suited' || base.kind !== 'suited') return false;
  if (!isOrdinaryCard(card, playerCount)) return false;
  return card.suit === base.suit || card.rank === base.rank;
}

/** Players allowed to make a play/pick/pass right now. */
export function playersToAct(state: GameState): PlayerId[] {
  if (state.phase !== 'playing') return [];
  const t = state.turn;
  if (t.kind === 'race') return activePlayers(state).map((p) => p.id);
  if (t.kind === 'player') return [t.player];
  if (t.kind === 'neighbours') {
    const { left, right } = neighbours(state, t.starter);
    return [left, right];
  }
  return [];
}

/** Steps around the table from `from` in the current direction (or `dir`). */
export function stepFrom(state: GameState, from: PlayerId, steps: number, dir: 1 | -1 = state.direction ?? 1): PlayerId {
  const ring = activePlayers(state);
  const i = ring.findIndex((p) => p.id === from);
  const n = ring.length;
  return ring[(((i + dir * steps) % n) + n) % n]!.id;
}

export function neighbours(state: GameState, of: PlayerId): { left: PlayerId; right: PlayerId } {
  return { left: stepFrom(state, of, 1, 1), right: stepFrom(state, of, 1, -1) };
}

/** Builds 4 face-down toss cards from a fresh deck, at least one of which is an 8 or Joker. */
export function createTossLayout(rng: Rng): Card[] {
  const deck = shuffle(createDeck(), rng);
  const specialIndex = deck.findIndex((c) => c.kind === 'joker' || isRank(c, '8'));
  const [special] = deck.splice(specialIndex, 1);
  return shuffle([special!, ...deck.slice(0, TOSS_LAYOUT_SIZE - 1)], rng);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function dispatch(s: GameState, move: Move, rng: Rng, ev: Events): RejectionCode | null {
  if (move.type === 'nextRound') {
    if (s.phase !== 'roundOver') return 'WRONG_PHASE';
    dealRound(s, rng, ev);
    return null;
  }
  const p = s.players.find((pl) => pl.id === move.player);
  if (!p || p.status !== 'active') return 'NOT_IN_GAME';
  switch (move.type) {
    case 'play':
      return play(s, p, move.cardId, move.suit, move.announce ?? false, rng, ev);
    case 'pick':
      return pick(s, p, rng, ev);
    case 'pass':
      return pass(s, p, ev);
    case 'callOut':
      return callOut(s, p, move.target, rng, ev);
    case 'toss':
      return toss(s, p, move.picks, rng, ev);
  }
}

function play(
  s: GameState,
  p: PlayerState,
  cardId: string,
  suit: Suit | undefined,
  announce: boolean,
  rng: Rng,
  ev: Events,
): RejectionCode | null {
  if (s.phase !== 'playing') return 'WRONG_PHASE';
  const n = activePlayers(s).length;

  if (s.turn.kind === 'race') {
    const idx = p.hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return 'CARD_NOT_IN_HAND';
    const card = p.hand[idx]!;
    if (!canStartOn(card, topCard(s)!, n)) return 'NOT_A_STARTING_CARD';
    p.hand.splice(idx, 1);
    s.discard.push(card);
    s.lead = leadFromCard(card);
    ev.push({ type: 'played', player: p.id, card });
    if (n === 2) {
      s.direction = 1;
      beginTurn(s, stepFrom(s, p.id, 1));
    } else {
      s.turn = { kind: 'neighbours', starter: p.id };
    }
    return null;
  }

  const turnError = checkTurn(s, p.id);
  if (turnError) return turnError;
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return 'CARD_NOT_IN_HAND';
  const card = p.hand[idx]!;
  if (s.pickedCardId && card.id !== s.pickedCardId) return 'ONLY_PICKED_CARD';
  if (!canPlayCard(s, card)) return 'CARD_NOT_PLAYABLE';
  const isEight = isRank(card, '8');
  if (isEight && (!suit || !SUITS.includes(suit))) return 'SUIT_REQUIRED';

  claimTurn(s, p.id, ev);
  p.hand.splice(idx, 1);
  s.discard.push(card);
  s.pickedCardId = null;
  ev.push(isEight ? { type: 'played', player: p.id, card, suit: suit! } : { type: 'played', player: p.id, card });

  const left = p.hand.length;
  if (left === 1 || left === 2) {
    p.callable = !announce;
    if (announce) ev.push({ type: 'announced', player: p.id, cardsLeft: left });
  }

  if (left === 0 && isPlainCard(card)) {
    endRound(s, p.id, rng, ev);
    return null;
  }
  // Otherwise a last card that is an action card (or K) leaves the player "on air" with zero cards.
  applyEffects(s, p.id, card, suit, n);
  return null;
}

function applyEffects(s: GameState, pid: PlayerId, card: Card, suit: Suit | undefined, n: number): void {
  const facingPenalty = s.penalty > 0;
  // Seats to advance. 0 means the same player plays again.
  let steps = 1;
  if (card.kind === 'joker') {
    s.penalty += 5;
  } else {
    switch (card.rank) {
      case 'A':
        s.lead = facingPenalty ? { suits: [card.suit], colours: [], ranks: [] } : leadFromCard(card);
        s.penalty = 0;
        break;
      case '2':
        s.penalty += 2;
        break;
      case '7':
        s.lead = leadFromCard(card);
        steps = n === 2 ? 0 : 2;
        break;
      case '8':
        s.lead = { suits: [suit!], colours: [suitColour(suit!)], ranks: [] };
        break;
      case 'J':
        s.lead = leadFromCard(card);
        if (n === 2) steps = 0;
        else s.direction = s.direction === 1 ? -1 : 1;
        break;
      case 'K':
        s.lead = leadFromCard(card);
        if (n === 2) steps = 0;
        break;
      default:
        s.lead = leadFromCard(card);
    }
  }
  beginTurn(s, steps === 0 ? pid : stepFrom(s, pid, steps));
}

function pick(s: GameState, p: PlayerState, rng: Rng, ev: Events): RejectionCode | null {
  if (s.phase !== 'playing') return 'WRONG_PHASE';
  const turnError = checkTurn(s, p.id);
  if (turnError) return turnError;
  if (s.pickedCardId) return 'ALREADY_PICKED';
  claimTurn(s, p.id, ev);

  if (s.penalty > 0) {
    const count = drawCards(s, p, s.penalty, rng, ev);
    ev.push({ type: 'picked', player: p.id, count, reason: 'penalty' });
    const top = topCard(s)!;
    s.lead =
      top.kind === 'joker'
        ? { suits: suitsOfColour(top.colour), colours: [], ranks: ['joker'] }
        : { suits: [top.suit], colours: [], ranks: ['2'] };
    s.penalty = 0;
    beginTurn(s, stepFrom(s, p.id, 1));
    return null;
  }

  const onAir = p.hand.length === 0;
  const count = drawCards(s, p, 1, rng, ev);
  ev.push({ type: 'picked', player: p.id, count, reason: onAir ? 'onAir' : 'turn' });
  const picked = count > 0 ? p.hand[p.hand.length - 1]! : undefined;
  if (picked && canPlayCard(s, picked)) {
    s.pickedCardId = picked.id;
    return null;
  }
  beginTurn(s, stepFrom(s, p.id, 1));
  return null;
}

function pass(s: GameState, p: PlayerState, ev: Events): RejectionCode | null {
  if (s.phase !== 'playing') return 'WRONG_PHASE';
  const turnError = checkTurn(s, p.id);
  if (turnError) return turnError;
  if (!s.pickedCardId) return 'NOTHING_TO_PASS';
  ev.push({ type: 'passed', player: p.id });
  beginTurn(s, stepFrom(s, p.id, 1));
  return null;
}

function callOut(s: GameState, caller: PlayerState, targetId: PlayerId, rng: Rng, ev: Events): RejectionCode | null {
  if (s.phase !== 'playing') return 'WRONG_PHASE';
  const target = s.players.find((pl) => pl.id === targetId);
  if (!target || target.id === caller.id || target.status !== 'active' || !target.callable) {
    return 'CANNOT_CALL_OUT';
  }
  target.callable = false;
  ev.push({ type: 'calledOut', player: caller.id, target: target.id });
  const count = drawCards(s, target, 2, rng, ev);
  ev.push({ type: 'picked', player: target.id, count, reason: 'callOut' });
  return null;
}

function toss(s: GameState, p: PlayerState, picks: [number, number], rng: Rng, ev: Events): RejectionCode | null {
  if (s.phase !== 'toss') return 'WRONG_PHASE';
  const layout = s.tossLayouts[p.id];
  if (!layout) return 'WRONG_PHASE';
  const [a, b] = picks;
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < layout.length;
  if (!Array.isArray(picks) || picks.length !== 2 || !valid(a) || !valid(b) || a === b) return 'INVALID_TOSS';

  const result = s.roundResult!;
  const total = handPoints([layout[a]!, layout[b]!]);
  result.tosses[p.id]!.push({ cards: layout, picked: [a, b], total });

  if (total === SURVIVAL_LIMIT) {
    s.tossLayouts[p.id] = createTossLayout(rng);
    ev.push({ type: 'tossResolved', player: p.id, total, outcome: 'toss' });
    return null;
  }
  const outcome = total < SURVIVAL_LIMIT ? 'survived' : 'eliminated';
  result.outcomes[p.id] = outcome;
  delete s.tossLayouts[p.id];
  ev.push({ type: 'tossResolved', player: p.id, total, outcome });
  if (Object.keys(s.tossLayouts).length === 0) finaliseRound(s, ev);
  return null;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function dealRound(s: GameState, rng: Rng, ev: Events): void {
  const players = activePlayers(s);
  const n = players.length;
  for (;;) {
    const pile = shuffle(createDeck(), rng);
    const hands = players.map(() => [] as Card[]);
    for (let r = 0; r < HAND_SIZE; r++) for (const hand of hands) hand.push(pile.pop()!);
    const base = turnBase(pile, hands, n);
    if (!base) continue; // Practically unreachable: no usable base anywhere in the pile. Redeal.

    players.forEach((p, i) => {
      p.hand = hands[i]!;
      p.callable = false;
    });
    s.round += 1;
    s.phase = 'playing';
    s.drawPile = pile;
    s.discard = [base];
    s.turn = { kind: 'race' };
    s.direction = null;
    s.lead = leadFromCard(base);
    s.penalty = 0;
    s.pickedCardId = null;
    s.tossLayouts = {};
    s.roundResult = null;
    ev.push({ type: 'roundStarted', round: s.round, base });
    return;
  }
}

/**
 * Turns the base card. Non-plain cards are buried at the bottom of the pile. A base that nobody can
 * start on is also buried, so a round can always begin.
 */
function turnBase(pile: Card[], hands: Card[][], n: number): Card | undefined {
  for (let tries = pile.length; tries > 0; tries--) {
    const card = pile.pop()!;
    if (isPlainCard(card) && hands.some((h) => h.some((c) => canStartOn(c, card, n)))) return card;
    pile.unshift(card);
  }
  return undefined;
}

function endRound(s: GameState, checker: PlayerId, rng: Rng, ev: Events): void {
  ev.push({ type: 'checked', player: checker });
  s.turn = { kind: 'none' };
  s.pickedCardId = null;
  s.penalty = 0;
  for (const p of s.players) p.callable = false;

  const others = activePlayers(s).filter((p) => p.id !== checker);
  const result: RoundResult = {
    round: s.round,
    checker,
    hands: {},
    points: {},
    outcomes: { [checker]: 'checked' },
    tosses: {},
  };
  s.roundResult = result;

  if (others.length === 1) {
    // With two players left the checker wins outright.
    const other = others[0]!;
    result.hands[other.id] = other.hand.slice();
    result.points[other.id] = handPoints(other.hand);
    result.outcomes[other.id] = 'eliminated';
    finaliseRound(s, ev);
    return;
  }

  for (const p of others) {
    if (p.hand.length === 0) {
      const count = drawCards(s, p, 1, rng, ev);
      ev.push({ type: 'picked', player: p.id, count, reason: 'onAir' });
    }
  }
  for (const p of others) {
    const points = handPoints(p.hand);
    result.hands[p.id] = p.hand.slice();
    result.points[p.id] = points;
    if (points === SURVIVAL_LIMIT) {
      result.outcomes[p.id] = 'toss';
      result.tosses[p.id] = [];
      s.tossLayouts[p.id] = createTossLayout(rng);
    } else {
      result.outcomes[p.id] = points < SURVIVAL_LIMIT ? 'survived' : 'eliminated';
    }
  }

  if (Object.keys(s.tossLayouts).length > 0) s.phase = 'toss';
  else finaliseRound(s, ev);
}

function finaliseRound(s: GameState, ev: Events): void {
  const result = s.roundResult!;
  for (const p of s.players) {
    if (result.outcomes[p.id] === 'eliminated') {
      p.status = 'eliminated';
      ev.push({ type: 'eliminated', player: p.id });
    }
  }
  const remaining = activePlayers(s);
  if (remaining.length === 1) {
    s.phase = 'gameOver';
    s.winner = remaining[0]!.id;
    ev.push({ type: 'gameOver', winner: s.winner });
  } else {
    s.phase = 'roundOver';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkTurn(s: GameState, pid: PlayerId): RejectionCode | null {
  return playersToAct(s).includes(pid) && s.turn.kind !== 'race' ? null : 'NOT_YOUR_TURN';
}

/** The first neighbour to act after the starter sets the direction of play. */
function claimTurn(s: GameState, pid: PlayerId, ev: Events): void {
  if (s.turn.kind !== 'neighbours') return;
  const { left } = neighbours(s, s.turn.starter);
  s.direction = pid === left ? 1 : -1;
  ev.push({ type: 'directionSet', direction: s.direction });
  s.turn = { kind: 'player', player: pid };
}

function beginTurn(s: GameState, pid: PlayerId): void {
  s.turn = { kind: 'player', player: pid };
  s.pickedCardId = null;
  // Play has returned to this player, so they can no longer be called out.
  s.players.find((p) => p.id === pid)!.callable = false;
}

/** Draws up to `count` cards, reshuffling played cards when the pile runs out. Returns how many were drawn. */
function drawCards(s: GameState, p: PlayerState, count: number, rng: Rng, ev: Events): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) refillDrawPile(s, rng, ev);
    const card = s.drawPile.pop();
    if (!card) break;
    p.hand.push(card);
    drawn++;
  }
  return drawn;
}

function refillDrawPile(s: GameState, rng: Rng, ev: Events): void {
  if (s.discard.length <= 1) return;
  const top = s.discard.pop()!;
  s.drawPile = shuffle(s.discard, rng);
  s.discard = [top];
  ev.push({ type: 'reshuffled', drawPileCount: s.drawPile.length });
}

export function leadFromCard(card: Card): Lead {
  if (card.kind === 'joker') return { suits: [], colours: [card.colour], ranks: ['joker'] };
  return { suits: [card.suit], colours: [suitColour(card.suit)], ranks: [card.rank] };
}

export function matchesLead(card: Card, lead: Lead): boolean {
  if (card.kind === 'joker') return lead.ranks.includes('joker') || lead.colours.includes(cardColour(card));
  return lead.suits.includes(card.suit) || lead.ranks.includes(card.rank);
}
