import { canStartOn, isRank, matchesLead, type Card, type PlayerView, type Rank, type Suit } from '@take2/engine';

/** Alternating colours so neighbouring suits never blur together. */
export const SUIT_ORDER: Suit[] = ['hearts', 'clubs', 'diamonds', 'spades'];
const RANK_ORDER: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** U+FE0E keeps iOS from drawing the suits as emoji. */
export const SUIT_GLYPH: Record<Suit, string> = {
  hearts: '♥︎',
  diamonds: '♦︎',
  clubs: '♣︎',
  spades: '♠︎',
};

export const SUIT_NAME: Record<Suit, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' };

const RANK_WORD: Partial<Record<Rank, string>> = { A: 'ace', J: 'jack', Q: 'queen', K: 'king' };

export function isRed(card: Card): boolean {
  return card.kind === 'joker' ? card.colour === 'red' : card.suit === 'hearts' || card.suit === 'diamonds';
}

export function suitIsRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function cardName(card: Card): string {
  if (card.kind === 'joker') return `${card.colour} Joker`;
  return `${RANK_WORD[card.rank] ?? card.rank} of ${card.suit}`;
}

/** Short label such as "9♥" or "Joker". */
export function cardShort(card: Card): string {
  return card.kind === 'joker' ? 'Joker' : `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

/** Hand order: by suit (hearts, clubs, diamonds, spades), A to K within a suit, Jokers last. */
export function sortHand(hand: readonly Card[]): Card[] {
  const key = (c: Card) =>
    c.kind === 'joker' ? 100 + (c.colour === 'red' ? 0 : 1) : SUIT_ORDER.indexOf(c.suit) * 20 + RANK_ORDER.indexOf(c.rank);
  return hand.slice().sort((a, b) => key(a) - key(b));
}

/** Whether I am one of the players who may act right now (my turn, a neighbour after the start, or the race). */
export function canIAct(view: PlayerView): boolean {
  if (view.phase !== 'playing') return false;
  const t = view.turn;
  if (t.kind === 'player') return t.player === view.me;
  if (t.kind === 'race') return true;
  if (t.kind === 'neighbours') return neighboursOf(view, t.starter).includes(view.me);
  return false;
}

/**
 * Cards in my hand that could be played now, for the faint lift. Mirrors the engine's rules;
 * the server still has the final say.
 */
export function playableIds(view: PlayerView, raceOpen: boolean): Set<string> {
  const out = new Set<string>();
  const top = view.topCard;
  if (view.phase !== 'playing' || !top) return out;
  const t = view.turn;
  if (t.kind === 'race') {
    if (!raceOpen) return out;
    const active = view.players.filter((p) => p.status === 'active').length;
    for (const c of view.hand) if (canStartOn(c, top, active)) out.add(c.id);
    return out;
  }
  if (!canIAct(view)) return out;
  for (const c of view.hand) {
    if (view.pickedCardId && c.id !== view.pickedCardId) continue;
    const ok =
      view.penalty > 0
        ? isRank(c, 'A') || isRank(c, '2') || c.kind === 'joker'
        : isRank(c, '8') || matchesLead(c, view.lead);
    if (ok) out.add(c.id);
  }
  return out;
}

/** Active players in seat order. */
export function activeRing(view: PlayerView): string[] {
  return view.players.filter((p) => p.status === 'active').map((p) => p.id);
}

export function neighboursOf(view: PlayerView, id: string): string[] {
  const ring = activeRing(view);
  const i = ring.indexOf(id);
  if (i < 0 || ring.length < 2) return [];
  return [ring[(i + 1) % ring.length]!, ring[(i - 1 + ring.length) % ring.length]!];
}
