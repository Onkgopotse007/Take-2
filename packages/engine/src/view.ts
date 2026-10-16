import { SUITS, type Card, isRank } from './cards';
import { canPlayCard, canStartOn, activePlayers, playersToAct, topCard, TOSS_LAYOUT_SIZE } from './engine';
import type { GameState, Lead, Move, PlayerId, RoundResult, Turn } from './types';

export interface PublicPlayer {
  id: PlayerId;
  cardCount: number;
  status: 'active' | 'eliminated';
  callable: boolean;
  onAir: boolean;
}

/** What one player is allowed to see. Other hands, the draw pile and toss cards stay hidden. */
export interface PlayerView {
  me: PlayerId;
  hand: Card[];
  players: PublicPlayer[];
  phase: GameState['phase'];
  round: number;
  topCard: Card | null;
  drawPileCount: number;
  discardCount: number;
  turn: Turn;
  direction: 1 | -1 | null;
  lead: Lead;
  penalty: number;
  /** Only shown to the player who picked it. */
  pickedCardId: string | null;
  /** Number of face-down toss cards in front of me, or 0 if I am not tossing. */
  myTossCards: number;
  tossing: PlayerId[];
  roundResult: RoundResult | null;
  winner: PlayerId | null;
}

export function getPlayerView(state: GameState, me: PlayerId): PlayerView {
  const self = state.players.find((p) => p.id === me);
  const isMyTurn = state.turn.kind === 'player' && state.turn.player === me;
  return {
    me,
    hand: self ? self.hand.slice() : [],
    players: state.players.map((p) => ({
      id: p.id,
      cardCount: p.hand.length,
      status: p.status,
      callable: p.callable,
      onAir: state.phase === 'playing' && p.status === 'active' && p.hand.length === 0,
    })),
    phase: state.phase,
    round: state.round,
    topCard: topCard(state) ?? null,
    drawPileCount: state.drawPile.length,
    discardCount: state.discard.length,
    turn: state.turn,
    direction: state.direction,
    lead: state.lead,
    penalty: state.penalty,
    pickedCardId: isMyTurn ? state.pickedCardId : null,
    myTossCards: state.tossLayouts[me] ? TOSS_LAYOUT_SIZE : 0,
    tossing: Object.keys(state.tossLayouts),
    roundResult: state.roundResult,
    winner: state.winner,
  };
}

/** Every move `player` could make right now. Plays never include `announce`; the caller adds it. */
export function getLegalMoves(state: GameState, player: PlayerId): Move[] {
  const self = state.players.find((p) => p.id === player);
  if (!self || self.status !== 'active') return [];
  const moves: Move[] = [];

  if (state.phase === 'toss') {
    if (state.tossLayouts[player]) {
      for (let a = 0; a < TOSS_LAYOUT_SIZE; a++) {
        for (let b = a + 1; b < TOSS_LAYOUT_SIZE; b++) moves.push({ type: 'toss', player, picks: [a, b] });
      }
    }
    return moves;
  }
  if (state.phase !== 'playing') return moves;

  const playMoves = (card: Card): Move[] =>
    isRank(card, '8')
      ? SUITS.map((suit) => ({ type: 'play', player, cardId: card.id, suit }) as Move)
      : [{ type: 'play', player, cardId: card.id }];

  if (state.turn.kind === 'race') {
    const base = topCard(state)!;
    const n = activePlayers(state).length;
    for (const card of self.hand) if (canStartOn(card, base, n)) moves.push(...playMoves(card));
  } else if (playersToAct(state).includes(player)) {
    if (state.pickedCardId) {
      const picked = self.hand.find((c) => c.id === state.pickedCardId)!;
      moves.push(...playMoves(picked), { type: 'pass', player });
    } else {
      for (const card of self.hand) if (canPlayCard(state, card)) moves.push(...playMoves(card));
      moves.push({ type: 'pick', player });
    }
  }

  for (const other of state.players) {
    if (other.id !== player && other.status === 'active' && other.callable) {
      moves.push({ type: 'callOut', player, target: other.id });
    }
  }
  return moves;
}
