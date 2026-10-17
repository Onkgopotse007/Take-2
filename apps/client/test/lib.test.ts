import { describe, expect, it } from 'vitest';
import { cardFromId, leadFromCard, type PlayerView } from '@take2/engine';
import { playableIds, sortHand } from '../src/lib/cards';
import { cardStep, opponentsFromMyLeft, seatAngles, seatPositions } from '../src/lib/layout';
import { CODE_PATTERN, normaliseCode } from '../src/lib/prefs';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

function view(partial: Omit<Partial<PlayerView>, 'hand'> & { hand: string[]; top: string }): PlayerView {
  const { hand, top, ...rest } = partial;
  return {
    me: 'a',
    hand: hand.map(cardFromId),
    players: ['a', 'b', 'c'].map((id) => ({ id, cardCount: 4, status: 'active', onAir: false })),
    phase: 'playing',
    round: 1,
    topCard: cardFromId(top),
    drawPileCount: 30,
    discardCount: 3,
    turn: { kind: 'player', player: 'a' },
    direction: 1,
    lead: leadFromCard(cardFromId(top)),
    penalty: 0,
    pickedCardId: null,
    myTossCards: 0,
    tossing: [],
    roundResult: null,
    winner: null,
    ...rest,
  } as PlayerView;
}

describe('sortHand', () => {
  it('groups by suit (hearts, clubs, diamonds, spades), A to K, Jokers last', () => {
    const hand = ['QS', 'JKB', '3C', 'KH', 'AH', '10D', 'JKR', 'AC', '2D'].map(cardFromId);
    expect(ids(sortHand(hand))).toEqual(['AH', 'KH', 'AC', '3C', '2D', '10D', 'QS', 'JKR', 'JKB']);
  });
});

describe('playableIds (the faint lift)', () => {
  it('lifts cards matching suit or number, and 8s', () => {
    const v = view({ hand: ['9H', '5C', 'QS', '8D', 'JKR'], top: '5H' });
    expect([...playableIds(v, true)].sort()).toEqual(['5C', '8D', '9H', 'JKR'].sort());
  });

  it('lifts only blockers and stackers when facing a penalty', () => {
    const v = view({ hand: ['AS', '2C', 'JKB', '9H', '8D'], top: '2H', penalty: 2 });
    expect([...playableIds(v, true)].sort()).toEqual(['2C', 'AS', 'JKB']);
  });

  it('lifts nothing when it is not my turn', () => {
    const v = view({ hand: ['9H'], top: '5H', turn: { kind: 'player', player: 'b' } });
    expect(playableIds(v, true).size).toBe(0);
  });

  it('lifts only the picked card after a pick', () => {
    const v = view({ hand: ['9H', '6H'], top: '5H', pickedCardId: '6H' });
    expect([...playableIds(v, true)]).toEqual(['6H']);
  });

  it('lifts starting cards only once the race is open', () => {
    const v = view({ hand: ['9H', '7H', '3C'], top: '5H', turn: { kind: 'race' } });
    expect(playableIds(v, false).size).toBe(0);
    expect([...playableIds(v, true)]).toEqual(['9H']);
  });
});

describe('seats', () => {
  it('puts a single opponent opposite me', () => {
    expect(seatAngles(1)).toEqual([270]);
  });

  it('spreads up to 9 opponents from my left, over the top, to my right', () => {
    const a = seatAngles(9);
    expect(a[0]).toBe(160);
    expect(a[8]).toBe(380);
    for (const p of seatPositions(9)) {
      expect(p.left).toBeGreaterThan(5);
      expect(p.left).toBeLessThan(95);
    }
  });

  it('orders opponents starting from my left-hand neighbour', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(ids(opponentsFromMyLeft(players, 'c'))).toEqual(['d', 'a', 'b']);
  });

  it('overlaps cards to fit, but never below the minimum step', () => {
    expect(cardStep(4, 360, 72)).toBe(78);
    expect(cardStep(8, 360, 72)).toBeCloseTo(288 / 7);
    expect(cardStep(30, 360, 72)).toBe(26);
  });
});

describe('codes', () => {
  it('accepts codes typed loosely', () => {
    expect(CODE_PATTERN.test(normaliseCode(' k7m px '))).toBe(true);
    expect(CODE_PATTERN.test('K7MP0')).toBe(false);
  });
});
