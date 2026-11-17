import { cardFromId, createDeck } from '@take2/engine';
import { applyMove, type GameEvent, type MadagascarState, type Move, type RejectionCode, type Turn } from '../src';
import { expect } from 'vitest';

export interface TableSpec {
  /** Hands by player, in seating order. */
  hands: Record<string, string[]>;
  /** Played cards, bottom first. */
  pile?: string[];
  /** Face-down oval. Defaults to every card not in a hand or the pile (in phase 1), or empty (in phase 2). */
  circle?: (string | null)[];
  phase?: 'circle' | 'hands';
  turn?: Turn;
  direction?: 1 | -1 | null;
  finished?: string[][];
  left?: string[];
  stalled?: number;
}

export function table(spec: TableSpec): MadagascarState {
  const phase = spec.phase ?? 'hands';
  const pile = spec.pile ?? [];
  const used = new Set([...Object.values(spec.hands).flat(), ...pile]);
  const circle = spec.circle ?? (phase === 'circle' ? createDeck(false).map((c) => c.id).filter((id) => !used.has(id)) : []);
  const ids = Object.keys(spec.hands);
  const finished = new Set((spec.finished ?? []).flat());
  return {
    players: ids.map((id) => ({
      id,
      hand: spec.hands[id]!.map(cardFromId),
      status: finished.has(id) ? 'finished' : spec.left?.includes(id) ? 'left' : 'active',
    })),
    phase,
    circle: circle.map((id) => (id ? cardFromId(id) : null)),
    pile: pile.map(cardFromId),
    turn: spec.turn ?? { kind: 'player', player: ids.find((id) => !finished.has(id) && !spec.left?.includes(id))! },
    direction: spec.direction === undefined ? 1 : spec.direction,
    places: spec.finished ?? [],
    left: spec.left ?? [],
    outOfPlay: [],
    stalled: spec.stalled ?? 0,
    ranking: null,
    deadlocked: false,
  };
}

export function okWithEvents(state: MadagascarState, move: Move): { state: MadagascarState; events: GameEvent[] } {
  const r = applyMove(state, move);
  if (!r.ok) throw new Error(`Expected ${JSON.stringify(move)} to succeed, got ${r.code}`);
  return { state: r.state, events: r.events };
}
export const ok = (state: MadagascarState, move: Move) => okWithEvents(state, move).state;
export function rejects(state: MadagascarState, move: Move, code: RejectionCode): void {
  const r = applyMove(state, move);
  expect(r.ok ? 'ok' : r.code).toBe(code);
}
export const hand = (s: MadagascarState, id: string) => s.players.find((p) => p.id === id)!.hand.map((c) => c.id);
export const turnOf = (s: MadagascarState) => (s.turn.kind === 'player' ? s.turn.player : undefined);
export const pileIds = (s: MadagascarState) => s.pile.map((c) => c.id);
export const play = (player: string, cardId: string): Move => ({ type: 'play', player, cardId });
export const turnCard = (player: string, slot: number): Move => ({ type: 'turn', player, slot });
export const leave = (player: string): Move => ({ type: 'forfeit', player, reason: 'left' });
