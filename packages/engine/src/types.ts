import type { Card, Colour, Rank, Suit } from './cards';

export type PlayerId = string;

export interface PlayerState {
  id: PlayerId;
  hand: Card[];
  status: 'active' | 'eliminated';
  /** Played down to 2 or 1 cards without announcing. Others may call them out until their next turn. */
  callable: boolean;
}

/**
 * Whose move it is.
 * - `race`: start of a round, any player with a matching ordinary card may play first.
 * - `neighbours`: after the first play, either neighbour of the starter may act; whoever does sets the direction.
 * - `player`: a normal turn.
 * - `none`: no one is playing (toss, between rounds, game over).
 */
export type Turn =
  | { kind: 'race' }
  | { kind: 'neighbours'; starter: PlayerId }
  | { kind: 'player'; player: PlayerId }
  | { kind: 'none' };

export type LeadRank = Rank | 'joker';

/**
 * What the next normal play must match. A suited card matches on suit or rank; a Joker matches
 * on colour or on `'joker'` in `ranks`. 8s are always playable unless a penalty is pending.
 */
export interface Lead {
  suits: Suit[];
  colours: Colour[];
  ranks: LeadRank[];
}

export type RoundOutcome = 'checked' | 'survived' | 'eliminated' | 'toss';

export interface TossAttempt {
  cards: Card[];
  picked: [number, number];
  total: number;
}

export interface RoundResult {
  round: number;
  checker: PlayerId;
  /** Final hands of everyone except the checker, revealed for scoring. */
  hands: Record<PlayerId, Card[]>;
  points: Record<PlayerId, number>;
  outcomes: Record<PlayerId, RoundOutcome>;
  tosses: Record<PlayerId, TossAttempt[]>;
}

export interface GameState {
  /** Seating order. Eliminated players stay in the list. */
  players: PlayerState[];
  phase: 'playing' | 'toss' | 'roundOver' | 'gameOver';
  round: number;
  /** Top of the pile is the last element. */
  drawPile: Card[];
  /** Played cards. The top (base) card is the last element. */
  discard: Card[];
  turn: Turn;
  /** +1 moves to the next seat, -1 to the previous. Null until the first neighbour acts. */
  direction: 1 | -1 | null;
  lead: Lead;
  /** Cards the player facing a 2 or Joker must pick if they do not block or stack. 0 when none. */
  penalty: number;
  /** Set after a pick when the picked card is playable: only that card may be played, or the player passes. */
  pickedCardId: string | null;
  /** Face-down toss layouts for players who scored exactly 15. */
  tossLayouts: Record<PlayerId, Card[]>;
  roundResult: RoundResult | null;
  winner: PlayerId | null;
}

export type Move =
  | { type: 'play'; player: PlayerId; cardId: string; suit?: Suit; announce?: boolean }
  | { type: 'pick'; player: PlayerId }
  | { type: 'pass'; player: PlayerId }
  | { type: 'callOut'; player: PlayerId; target: PlayerId }
  | { type: 'toss'; player: PlayerId; picks: [number, number] }
  | { type: 'nextRound' };

export type PickReason = 'turn' | 'penalty' | 'callOut' | 'onAir';

export type GameEvent =
  | { type: 'roundStarted'; round: number; base: Card }
  | { type: 'played'; player: PlayerId; card: Card; suit?: Suit }
  | { type: 'announced'; player: PlayerId; cardsLeft: number }
  | { type: 'directionSet'; direction: 1 | -1 }
  | { type: 'picked'; player: PlayerId; count: number; reason: PickReason }
  | { type: 'passed'; player: PlayerId }
  | { type: 'calledOut'; player: PlayerId; target: PlayerId }
  | { type: 'reshuffled'; drawPileCount: number }
  | { type: 'checked'; player: PlayerId }
  | { type: 'tossResolved'; player: PlayerId; total: number; outcome: 'survived' | 'eliminated' | 'toss' }
  | { type: 'eliminated'; player: PlayerId }
  | { type: 'gameOver'; winner: PlayerId };

export type RejectionCode =
  | 'NOT_IN_GAME'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'NOT_A_STARTING_CARD'
  | 'CARD_NOT_PLAYABLE'
  | 'SUIT_REQUIRED'
  | 'ONLY_PICKED_CARD'
  | 'ALREADY_PICKED'
  | 'NOTHING_TO_PASS'
  | 'CANNOT_CALL_OUT'
  | 'INVALID_TOSS';

export type MoveResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: RejectionCode; reason: string };
