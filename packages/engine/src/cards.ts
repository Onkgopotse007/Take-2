export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export type Colour = 'red' | 'black';

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

export interface SuitedCard {
  id: string;
  kind: 'suited';
  suit: Suit;
  rank: Rank;
}

export interface JokerCard {
  id: string;
  kind: 'joker';
  colour: Colour;
}

export type Card = SuitedCard | JokerCard;

const SUIT_LETTER: Record<Suit, string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
const LETTER_SUIT: Record<string, Suit> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };

/** Ranks that are ordinary at any player count and may be a base or check card. */
const PLAIN_RANKS: ReadonlySet<Rank> = new Set(['3', '4', '5', '6', '9', '10', 'Q']);
const ACTION_RANKS: ReadonlySet<Rank> = new Set(['A', '2', '7', '8', 'J']);

export function suitColour(suit: Suit): Colour {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function suitsOfColour(colour: Colour): Suit[] {
  return colour === 'red' ? ['hearts', 'diamonds'] : ['clubs', 'spades'];
}

export function cardColour(card: Card): Colour {
  return card.kind === 'joker' ? card.colour : suitColour(card.suit);
}

/** Card ids: rank then suit letter (`10H`, `AS`, `QC`), or `JKR` / `JKB` for the Jokers. */
export function cardId(card: Omit<SuitedCard, 'id'> | Omit<JokerCard, 'id'>): string {
  if (card.kind === 'joker') return card.colour === 'red' ? 'JKR' : 'JKB';
  return `${card.rank}${SUIT_LETTER[card.suit]}`;
}

export function cardFromId(id: string): Card {
  if (id === 'JKR') return { id, kind: 'joker', colour: 'red' };
  if (id === 'JKB') return { id, kind: 'joker', colour: 'black' };
  const rank = id.slice(0, -1) as Rank;
  const suit = LETTER_SUIT[id.slice(-1)];
  if (!suit || !RANKS.includes(rank)) throw new Error(`Unknown card id: ${id}`);
  return { id, kind: 'suited', suit, rank };
}

/** A full 54-card deck: 52 cards plus a red and a black Joker. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: cardId({ kind: 'suited', suit, rank }), kind: 'suited', suit, rank });
    }
  }
  deck.push(cardFromId('JKR'), cardFromId('JKB'));
  return deck;
}

export function isRank(card: Card, rank: Rank): boolean {
  return card.kind === 'suited' && card.rank === rank;
}

/** Action cards: A, 2, 7, 8, J, Joker, and K when exactly 2 players remain. */
export function isActionCard(card: Card, playerCount: number): boolean {
  if (card.kind === 'joker') return true;
  if (ACTION_RANKS.has(card.rank)) return true;
  return card.rank === 'K' && playerCount === 2;
}

export function isOrdinaryCard(card: Card, playerCount: number): boolean {
  return !isActionCard(card, playerCount);
}

/** Cards that may be the base card or a check card. A K never qualifies. */
export function isPlainCard(card: Card): boolean {
  return card.kind === 'suited' && PLAIN_RANKS.has(card.rank);
}

export function cardPoints(card: Card): number {
  if (card.kind === 'joker') return 50;
  switch (card.rank) {
    case 'A':
      return 11;
    case '8':
      return 24;
    case 'J':
    case 'Q':
    case 'K':
      return 10;
    default:
      return Number(card.rank);
  }
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card), 0);
}
