import type { Card } from '@take2/engine';

export type PlayerId = string;

export interface MadagascarPlayer {
  id: PlayerId;
  hand: Card[];
  /**
   * - `active`: still playing.
   * - `finished`: has a place (no cards at the end of phase 1, or emptied their hand in phase 2).
   * - `left`: left the table or missed too many turns. Comes last.
   */
  status: 'active' | 'finished' | 'left';
}

/**
 * Whose move it is.
 * - `race`: the first card of the game. Any player may turn one.
 * - `neighbours`: either neighbour of the starter may turn next; whoever does sets the direction.
 * - `player`: a normal turn.
 * - `none`: game over.
 */
export type Turn =
  | { kind: 'race' }
  | { kind: 'neighbours'; starter: PlayerId }
  | { kind: 'player'; player: PlayerId }
  | { kind: 'none' };

/**
 * - `circle`: phase 1, players turn face-down cards from the oval.
 * - `hands`: phase 2, players play cards from their hands.
 */
export type Phase = 'circle' | 'hands' | 'gameOver';

export interface MadagascarState {
  /** Seating order. Players who are out stay in the list. */
  players: MadagascarPlayer[];
  phase: Phase;
  /** The oval of face-down cards. A slot is null once its card has been turned. */
  circle: (Card | null)[];
  /** Played cards. The top is the last element. */
  pile: Card[];
  turn: Turn;
  /** +1 moves to the next seat, -1 to the previous. Null until the second card is played. */
  direction: 1 | -1 | null;
  /** Places taken so far, best first. Players in one group share that place. */
  places: PlayerId[][];
  /** Players who left, in the order they left. */
  left: PlayerId[];
  /** Cards that left the game with a player who left. */
  outOfPlay: Card[];
  /** Phase 2: matching plays in a row on a one-card pile. See DEADLOCK_TRIPS. */
  stalled: number;
  /** Once the game is over: every player, best first. Players in one group share that place. */
  ranking: PlayerId[][] | null;
  /** The game ended in a deadlock and the players left were ranked by how many cards they held. */
  deadlocked: boolean;
}

export type ForfeitReason = 'left' | 'missedTurns';

export type Move =
  /** Phase 1: turn the face-down card in `slot` and play it. */
  | { type: 'turn'; player: PlayerId; slot: number }
  /** Phase 2: play a card from your hand. */
  | { type: 'play'; player: PlayerId; cardId: string }
  /** Server move: the player leaves the game for good. */
  | { type: 'forfeit'; player: PlayerId; reason: ForfeitReason };

export type GameEvent =
  | { type: 'played'; player: PlayerId; card: Card; slot?: number }
  /** The card matched the suit on top: the player took the rest of the pile. */
  | { type: 'pickedUp'; player: PlayerId; count: number }
  | { type: 'directionSet'; direction: 1 | -1 }
  /** The oval is empty. Players play from their hands from now on. */
  | { type: 'handsPhase' }
  /** `place` is 1 for first. Players finishing together share a place. */
  | { type: 'finished'; player: PlayerId; place: number }
  | { type: 'forfeited'; player: PlayerId; reason: ForfeitReason }
  | { type: 'deadlock' }
  | { type: 'gameOver'; winners: PlayerId[] };

export type RejectionCode = 'NOT_IN_GAME' | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'NO_CARD_THERE' | 'CARD_NOT_IN_HAND';

export type MoveResult =
  | { ok: true; state: MadagascarState; events: GameEvent[] }
  | { ok: false; code: RejectionCode; reason: string };
