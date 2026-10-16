import { expect } from 'vitest';
import {
  applyMove,
  cardFromId,
  createDeck,
  createSeededRng,
  leadFromCard,
  type GameEvent,
  type GameState,
  type Lead,
  type Move,
  type RejectionCode,
  type Rng,
  type Turn,
} from '../src';

export interface TableSpec {
  /** Hands by player, in seating order. */
  hands: Record<string, string[]>;
  /** Played cards, bottom first. The last is the top card. */
  discard: string[];
  /** Draw pile, bottom first. Defaults to every card not in a hand or the discard. */
  drawPile?: string[];
  /** Defaults to the first player's turn. */
  turn?: Turn;
  direction?: 1 | -1 | null;
  lead?: Lead;
  penalty?: number;
  eliminated?: string[];
  callable?: string[];
}

export function table(spec: TableSpec): GameState {
  const used = new Set([...Object.values(spec.hands).flat(), ...spec.discard]);
  const drawPile = spec.drawPile ?? createDeck().map((c) => c.id).filter((id) => !used.has(id));
  const ids = Object.keys(spec.hands);
  const top = cardFromId(spec.discard[spec.discard.length - 1]!);
  return {
    players: ids.map((id) => ({
      id,
      hand: spec.hands[id]!.map(cardFromId),
      status: spec.eliminated?.includes(id) ? 'eliminated' : 'active',
      callable: spec.callable?.includes(id) ?? false,
    })),
    phase: 'playing',
    round: 1,
    drawPile: drawPile.map(cardFromId),
    discard: spec.discard.map(cardFromId),
    turn: spec.turn ?? { kind: 'player', player: ids[0]! },
    direction: spec.direction === undefined ? 1 : spec.direction,
    lead: spec.lead ?? leadFromCard(top),
    penalty: spec.penalty ?? 0,
    pickedCardId: null,
    tossLayouts: {},
    roundResult: null,
    winner: null,
  };
}

export const rng = (seed = 1): Rng => createSeededRng(seed);

/** Applies a move that must succeed. */
export function ok(state: GameState, move: Move, r: Rng = rng()): GameState {
  return okWithEvents(state, move, r).state;
}

export function okWithEvents(state: GameState, move: Move, r: Rng = rng()): { state: GameState; events: GameEvent[] } {
  const result = applyMove(state, move, r);
  if (!result.ok) throw new Error(`Expected ${JSON.stringify(move)} to succeed, got ${result.code}`);
  return { state: result.state, events: result.events };
}

/** Applies a move that must be rejected with `code`. */
export function rejects(state: GameState, move: Move, code: RejectionCode): void {
  const result = applyMove(state, move, rng());
  expect(result.ok ? 'ok' : result.code).toBe(code);
}

export const hand = (state: GameState, id: string): string[] =>
  state.players.find((p) => p.id === id)!.hand.map((c) => c.id);

export const turnOf = (state: GameState): string | undefined =>
  state.turn.kind === 'player' ? state.turn.player : undefined;

export const top = (state: GameState): string => state.discard[state.discard.length - 1]!.id;

export const play = (player: string, cardId: string, extra: Partial<Extract<Move, { type: 'play' }>> = {}): Move => ({
  type: 'play',
  player,
  cardId,
  ...extra,
});
export const pick = (player: string): Move => ({ type: 'pick', player });
export const pass = (player: string): Move => ({ type: 'pass', player });
