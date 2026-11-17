import type { Card } from '@take2/engine';
import { filledSlots, playersToAct, topCard } from './engine';
import type { MadagascarState, Move, Phase, PlayerId, Turn } from './types';

export interface PublicPlayer {
  id: PlayerId;
  cardCount: number;
  status: 'active' | 'finished' | 'left';
}

/**
 * What one player is allowed to see: their own hand, everyone's card counts, which oval slots
 * still hold a card (never which card), and the top of the pile with its size.
 */
export interface MadagascarView {
  me: PlayerId;
  hand: Card[];
  players: PublicPlayer[];
  phase: Phase;
  /** One entry per oval slot: true while it still holds a face-down card. */
  circle: boolean[];
  topCard: Card | null;
  pileCount: number;
  turn: Turn;
  direction: 1 | -1 | null;
  places: PlayerId[][];
  ranking: PlayerId[][] | null;
  deadlocked: boolean;
}

export function getPlayerView(state: MadagascarState, me: PlayerId): MadagascarView {
  const self = state.players.find((p) => p.id === me);
  return {
    me,
    hand: self ? self.hand.slice() : [],
    players: state.players.map((p) => ({ id: p.id, cardCount: p.hand.length, status: p.status })),
    phase: state.phase,
    circle: state.circle.map((c) => c !== null),
    topCard: topCard(state) ?? null,
    pileCount: state.pile.length,
    turn: state.turn,
    direction: state.direction,
    places: state.places.map((g) => g.slice()),
    ranking: state.ranking ? state.ranking.map((g) => g.slice()) : null,
    deadlocked: state.deadlocked,
  };
}

/** Every move `player` could make right now (never a forfeit). */
export function getLegalMoves(state: MadagascarState, player: PlayerId): Move[] {
  if (!playersToAct(state).includes(player)) return [];
  if (state.phase === 'circle') return filledSlots(state).map((slot) => ({ type: 'turn', player, slot }));
  const self = state.players.find((p) => p.id === player)!;
  return self.hand.map((c) => ({ type: 'play', player, cardId: c.id }));
}
