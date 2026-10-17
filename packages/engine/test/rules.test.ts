/**
 * One test (or more) per rule in the "Rules specification" section of CLAUDE.md.
 * Describe blocks follow the headings of that section.
 */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cardFromId,
  cardPoints,
  createDeck,
  createGame,
  createSeededRng,
  createTossLayout,
  handPoints,
  isActionCard,
  isOrdinaryCard,
  isPlainCard,
  isRank,
  type GameState,
} from '../src';
import { hand, ok, okWithEvents, pass, pick, play, rejects, rng, table, top, turnOf } from './helpers';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('Setup', () => {
  it('allows 2 to 10 players only', () => {
    expect(() => createGame(ids(1), rng())).toThrow(RangeError);
    expect(() => createGame(ids(11), rng())).toThrow(RangeError);
    expect(() => createGame(ids(2), rng())).not.toThrow();
    expect(() => createGame(ids(10), rng())).not.toThrow();
  });

  it('uses one 52-card deck plus a red and a black Joker', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((c) => c.id)).size).toBe(54);
    const jokers = deck.filter((c) => c.kind === 'joker');
    expect(jokers.map((j) => (j.kind === 'joker' ? j.colour : null)).sort()).toEqual(['black', 'red']);
  });

  it('deals 4 cards each and leaves the rest as the draw pile', () => {
    for (let n = 2; n <= 10; n++) {
      const g = createGame(ids(n), rng(n));
      for (const p of g.players) expect(p.hand).toHaveLength(4);
      expect(g.discard).toHaveLength(1);
      expect(g.drawPile).toHaveLength(54 - 4 * n - 1);
    }
  });

  it('always turns an ordinary base card (never A, 2, 7, 8, J, Joker or K)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const n = 2 + (seed % 9);
      const g = createGame(ids(n), rng(seed));
      const base = g.discard[0]!;
      expect(isPlainCard(base)).toBe(true);
    }
  });

  it('buries rejected base cards back in the draw pile', () => {
    for (let seed = 0; seed < 200; seed++) {
      const g = createGame(ids(4), rng(seed));
      const all = [...g.drawPile, ...g.discard, ...g.players.flatMap((p) => p.hand)].map((c) => c.id);
      expect(new Set(all).size).toBe(54);
    }
  });
});

describe('Card types', () => {
  const c = cardFromId;
  it('treats 3, 4, 5, 6, 9, 10 and Q as ordinary at any player count', () => {
    for (const id of ['3H', '4D', '5C', '6S', '9H', '10D', 'QC']) {
      expect(isOrdinaryCard(c(id), 2)).toBe(true);
      expect(isOrdinaryCard(c(id), 5)).toBe(true);
    }
  });

  it('treats A, 2, 7, 8, J and Joker as action cards', () => {
    for (const id of ['AH', '2D', '7C', '8S', 'JH', 'JKR', 'JKB']) {
      expect(isActionCard(c(id), 2)).toBe(true);
      expect(isActionCard(c(id), 6)).toBe(true);
    }
  });

  it('treats K as ordinary with 3+ players and as an action card with exactly 2', () => {
    expect(isActionCard(c('KS'), 2)).toBe(true);
    expect(isOrdinaryCard(c('KS'), 3)).toBe(true);
  });

  it('never allows a K as base or check card', () => {
    expect(isPlainCard(c('KH'))).toBe(false);
  });
});

describe('Starting play', () => {
  const race = (hands: Record<string, string[]>, base = '5H') =>
    table({ hands, discard: [base], turn: { kind: 'race' }, direction: null });

  it('lets any player with an ordinary card of the base suit play first', () => {
    const s = ok(race({ a: ['3C', '4C', '6C', '9C'], b: ['9H', '4D', '6D', '3D'], c: ['3S', '4S', '6S', '9S'] }), play('b', '9H'));
    expect(top(s)).toBe('9H');
    expect(s.turn).toEqual({ kind: 'neighbours', starter: 'b' });
  });

  it('accepts a match on number', () => {
    const s = ok(race({ a: ['5C', '4C', '6C', '9C'], b: ['3D', '4D', '6D', '9D'], c: ['3S', '4S', '6S', '9S'] }), play('a', '5C'));
    expect(top(s)).toBe('5C');
  });

  it('does not allow an action card or a non-matching card to start', () => {
    const s = race({ a: ['7H', '8H', 'AH', '3C'], b: ['3D', '4D', '6D', '9D'], c: ['JKR', '2H', 'JH', '9S'] });
    for (const [p, card] of [['a', '7H'], ['a', '8H'], ['a', 'AH'], ['a', '3C'], ['c', 'JKR'], ['c', '2H'], ['c', 'JH']] as const) {
      rejects(s, play(p, card), 'NOT_A_STARTING_CARD');
    }
  });

  it('lets a K start with 3+ players but not with 2', () => {
    const three = race({ a: ['KH', '3C', '4C', '6C'], b: ['3D', '4D', '6D', '9D'], c: ['3S', '4S', '6S', '9S'] });
    expect(top(ok(three, play('a', 'KH')))).toBe('KH');
    const two = race({ a: ['KH', '3C', '4C', '6C'], b: ['3D', '4D', '6D', '9H'] });
    rejects(two, play('a', 'KH'), 'NOT_A_STARTING_CARD');
  });

  it('accepts only the first valid play received', () => {
    const s = ok(
      race({ a: ['3H', '4C', '6C', '9C'], b: ['3D', '4D', '6D', '9D'], c: ['4H', '4S', '6S', '9S'], d: ['6H', '3S', '9S', '10S'] }),
      play('a', '3H'),
    );
    // c is not a neighbour of the starter, so their late starting card is refused.
    rejects(s, play('c', '4H'), 'NOT_YOUR_TURN');
  });

  it('does not allow picking during the starting race', () => {
    rejects(race({ a: ['3H', '4C', '6C', '9C'], b: ['3D', '4D', '6D', '9D'] }), pick('b'), 'NOT_YOUR_TURN');
  });
});

describe('Forced start (nobody plays in time)', () => {
  const race = () =>
    table({
      hands: { a: ['3C', '4C'], b: ['3D', '4D'], c: ['3S', '4S'], d: ['6S', '9S'] },
      discard: ['5H'],
      turn: { kind: 'race' },
      direction: null,
      drawPile: ['QC', 'QD'],
    });

  it('a random player starts by picking one card, then a random neighbour takes the next turn', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const { state, events } = okWithEvents(race(), { type: 'forceStart' }, rng(seed));
      const forced = events.find((e) => e.type === 'forcedStart')!;
      if (forced.type !== 'forcedStart') throw new Error();
      seen.add(forced.starter);
      expect(hand(state, forced.starter)).toEqual([...hand(race(), forced.starter), 'QD']);
      expect(top(state)).toBe('5H');
      expect(turnOf(state)).toBe(forced.next);
      const ring = ['a', 'b', 'c', 'd'];
      const i = ring.indexOf(forced.starter);
      expect(ring[(i + state.direction! + 4) % 4]).toBe(forced.next);
    }
    expect(seen.size).toBe(4);
  });

  it('the starter may play the picked card if it is valid, then the chosen neighbour plays', () => {
    const s0 = table({ ...specOf(race()), turn: { kind: 'race' }, direction: null, drawPile: ['QC', '9H'] });
    for (let seed = 0; seed < 20; seed++) {
      const { state, events } = okWithEvents(s0, { type: 'forceStart' }, rng(seed));
      const forced = events.find((e) => e.type === 'forcedStart')!;
      if (forced.type !== 'forcedStart') throw new Error();
      expect(turnOf(state)).toBe(forced.starter);
      expect(state.pickedCardId).toBe('9H');
      rejects(state, play(forced.starter, hand(state, forced.starter)[0]!), 'ONLY_PICKED_CARD');
      const played = ok(state, play(forced.starter, '9H'));
      expect(top(played)).toBe('9H');
      expect(turnOf(played)).toBe(forced.next);
      expect(turnOf(ok(state, pass(forced.starter)))).toBe(forced.next);
    }
  });

  it('the next player plays on the base as normal', () => {
    let s = ok(race(), { type: 'forceStart' }, rng(3));
    const next = turnOf(s)!;
    s = table({ ...specOfState(s), hands: { ...specOfState(s).hands, [next]: ['9H', '3C'] } });
    s.turn = { kind: 'player', player: next };
    rejects(s, play(next, '3C'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(s, play(next, '9H')))).toBe('9H');
  });

  it('with 2 players the other player takes the next turn', () => {
    const s = ok(
      table({ hands: { a: ['3C'], b: ['3D'] }, discard: ['5H'], turn: { kind: 'race' }, direction: null }),
      { type: 'forceStart' },
    );
    const forced = turnOf(s);
    expect(['a', 'b']).toContain(forced);
  });

  it('is only possible during the starting race', () => {
    rejects(table({ hands: { a: ['3C'], b: ['3D'] }, discard: ['5H'] }), { type: 'forceStart' }, 'WRONG_PHASE');
  });
});

describe('Direction', () => {
  const afterStart = () =>
    ok(
      table({
        hands: { a: ['3H', '4C', '6C', '9C'], b: ['4H', '4D', '6D', '9D'], c: ['6H', '4S'], d: ['9H', '3S'], e: ['10H', '9S'] },
        discard: ['5H'],
        turn: { kind: 'race' },
        direction: null,
        drawPile: ['QC', 'QD', 'QS'],
      }),
      play('a', '3H'),
    );

  it('sets clockwise when the left neighbour acts first', () => {
    const s = ok(afterStart(), play('b', '4H'));
    expect(s.direction).toBe(1);
    expect(turnOf(s)).toBe('c');
  });

  it('sets anticlockwise when the right neighbour acts first', () => {
    const s = ok(afterStart(), play('e', '10H'));
    expect(s.direction).toBe(-1);
    expect(turnOf(s)).toBe('d');
  });

  it('lets a neighbour set the direction by picking', () => {
    const s = ok(afterStart(), pick('e'));
    expect(s.direction).toBe(-1);
    expect(turnOf(s)).toBe('d');
  });

  it('refuses a player who is not a neighbour of the starter', () => {
    rejects(afterStart(), play('c', '6H'), 'NOT_YOUR_TURN');
  });

  it('with 2 players passes straight to the other player', () => {
    const s = ok(
      table({ hands: { a: ['3H', '4C', '6C', '9C'], b: ['4H', '4D', '6D', '9D'] }, discard: ['5H'], turn: { kind: 'race' }, direction: null }),
      play('a', '3H'),
    );
    expect(turnOf(s)).toBe('b');
  });
});

describe('A turn', () => {
  const s0 = () =>
    table({
      hands: { a: ['6H', '9C', '3S'], b: ['4H', '4D', '6D'], c: ['QS', '9S', '10S'] },
      discard: ['5H'],
      drawPile: ['3C', 'QH'],
    });

  it('allows exactly one card per turn', () => {
    const s = ok(s0(), play('a', '6H'));
    expect(turnOf(s)).toBe('b');
    rejects(s, play('a', '9C'), 'NOT_YOUR_TURN');
  });

  it('requires a match on suit or number', () => {
    rejects(s0(), play('a', '9C'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(s0(), play('a', '6H')))).toBe('6H');
    const byNumber = table({ hands: { a: ['5C'], b: ['3D'] }, discard: ['5H'] });
    expect(top(ok(byNumber, play('a', '5C', { announce: true })))).toBe('5C');
  });

  it('allows picking even when holding a playable card', () => {
    const s = ok(s0(), pick('a'));
    expect(hand(s, 'a')).toContain('QH');
  });

  it('allows playing the picked card when it is valid', () => {
    const s = ok(ok(s0(), pick('a')), play('a', 'QH'));
    expect(top(s)).toBe('QH');
    expect(turnOf(s)).toBe('b');
  });

  it('allows only the picked card to be played after picking', () => {
    rejects(ok(s0(), pick('a')), play('a', '6H'), 'ONLY_PICKED_CARD');
  });

  it('allows keeping a playable picked card', () => {
    const s = ok(ok(s0(), pick('a')), pass('a'));
    expect(hand(s, 'a')).toContain('QH');
    expect(turnOf(s)).toBe('b');
  });

  it('ends the turn when the picked card cannot be played', () => {
    const s = ok(table({ ...specOf(s0()), drawPile: ['QH', '3C'] }), pick('a'));
    expect(hand(s, 'a')).toContain('3C');
    expect(turnOf(s)).toBe('b');
  });

  it('never allows more than one pick per turn', () => {
    rejects(ok(s0(), pick('a')), pick('a'), 'ALREADY_PICKED');
  });

  it('only allows passing after a pick', () => {
    rejects(s0(), pass('a'), 'NOTHING_TO_PASS');
  });
});

describe('Action cards', () => {
  const three = (aHand: string[], discard: string[], extra: Partial<Parameters<typeof table>[0]> = {}) =>
    table({ hands: { a: aHand, b: ['4D', '6D', '9H', 'AS'], c: ['QS', '9S', '10S', '6C'] }, discard, ...extra });

  it('A blocks a 2 in any suit', () => {
    const s = ok(three(['AS', '3C'], ['2H'], { penalty: 2 }), play('a', 'AS'));
    expect(s.penalty).toBe(0);
    expect(turnOf(s)).toBe('b');
  });

  it('A blocks a Joker in any colour', () => {
    const s = ok(three(['AH', '3C'], ['JKB'], { penalty: 5 }), play('a', 'AH'));
    expect(s.penalty).toBe(0);
  });

  it('A must match suit or number when not blocking', () => {
    rejects(three(['AS', '3C'], ['5H']), play('a', 'AS'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(three(['AH', '3C'], ['5H']), play('a', 'AH')))).toBe('AH');
    expect(top(ok(three(['AS', '3C'], ['AD']), play('a', 'AS')))).toBe('AS');
  });

  it('2 makes the next player pick 2 and miss their turn', () => {
    let s = ok(three(['2H', '3C', '4C'], ['5H']), play('a', '2H'));
    expect(s.penalty).toBe(2);
    expect(turnOf(s)).toBe('b');
    s = ok(s, pick('b'));
    expect(hand(s, 'b')).toHaveLength(6);
    expect(turnOf(s)).toBe('c');
  });

  it('7 skips the next player', () => {
    const s = ok(three(['7H', '3C', '4C'], ['5H']), play('a', '7H'));
    expect(turnOf(s)).toBe('c');
  });

  it('7 with 2 players lets the player play again', () => {
    const s = ok(table({ hands: { a: ['7H', '3C', '4C'], b: ['4D'] }, discard: ['5H'] }), play('a', '7H'));
    expect(turnOf(s)).toBe('a');
  });

  it('8 is playable on any card and names the next suit', () => {
    const s = ok(three(['8S', '3C', '4C'], ['5H']), play('a', '8S', { suit: 'diamonds' }));
    expect(turnOf(s)).toBe('b');
    rejects(s, play('b', '9H'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(s, play('b', '4D')))).toBe('4D');
  });

  it('8 requires a suit to be named', () => {
    rejects(three(['8S', '3C', '4C'], ['5H']), play('a', '8S'), 'SUIT_REQUIRED');
  });

  it('8 cannot be played against an unblocked 2 or Joker', () => {
    rejects(three(['8S', '3C'], ['2H'], { penalty: 2 }), play('a', '8S', { suit: 'clubs' }), 'CARD_NOT_PLAYABLE');
    rejects(three(['8S', '3C'], ['JKR'], { penalty: 5 }), play('a', '8S', { suit: 'clubs' }), 'CARD_NOT_PLAYABLE');
  });

  it('J reverses direction', () => {
    const s = ok(
      table({ hands: { a: ['JH', '3C', '4C'], b: ['4D'], c: ['4S'], d: ['6S'] }, discard: ['5H'] }),
      play('a', 'JH'),
    );
    expect(s.direction).toBe(-1);
    expect(turnOf(s)).toBe('d');
  });

  it('J with 2 players lets the player play again', () => {
    const s = ok(table({ hands: { a: ['JH', '3C', '4C'], b: ['4D'] }, discard: ['5H'] }), play('a', 'JH'));
    expect(turnOf(s)).toBe('a');
  });

  it('K with 2 players lets the player play again', () => {
    const s = ok(table({ hands: { a: ['KH', '3C', '4C'], b: ['4D'] }, discard: ['5H'] }), play('a', 'KH'));
    expect(turnOf(s)).toBe('a');
  });

  it('K with 3+ players is an ordinary card', () => {
    const s = ok(three(['KH', '3C', '4C'], ['5H']), play('a', 'KH'));
    expect(turnOf(s)).toBe('b');
    expect(s.penalty).toBe(0);
  });

  it('Joker makes the next player pick 5 and miss their turn', () => {
    let s = ok(three(['JKR', '3C', '4C'], ['5H']), play('a', 'JKR'));
    expect(s.penalty).toBe(5);
    s = ok(s, pick('b'));
    expect(hand(s, 'b')).toHaveLength(9);
    expect(turnOf(s)).toBe('c');
  });

  it('Joker is played on a card of its own colour', () => {
    expect(top(ok(three(['JKR', '3C', '4C'], ['5D']), play('a', 'JKR')))).toBe('JKR');
    rejects(three(['JKB', '3C', '4C'], ['5D']), play('a', 'JKB'), 'CARD_NOT_PLAYABLE');
  });
});

describe('Stacking and blocking', () => {
  const facing = (penalty: number, discard: string[], aHand: string[]) =>
    table({
      hands: { a: aHand, b: ['3D', '4D', '6D', '9D'], c: ['3S', '4S', '6S', '9S', '5H', '3H', '6C'] },
      discard,
      penalty,
    });

  it('allows stacking a Joker on a 2, and a 2 of any suit on a Joker', () => {
    expect(ok(facing(2, ['2H'], ['JKB', '3C']), play('a', 'JKB')).penalty).toBe(7);
    expect(ok(facing(5, ['JKR'], ['2S', '3C']), play('a', '2S')).penalty).toBe(7);
    expect(ok(facing(2, ['2H'], ['2C', '3C']), play('a', '2C')).penalty).toBe(4);
  });

  it('accumulates penalties: 2 then Joker means pick 7', () => {
    let s = ok(facing(2, ['2H'], ['JKB', '3C']), play('a', 'JKB'));
    s = ok(s, pick('b'));
    expect(hand(s, 'b')).toHaveLength(11);
    expect(turnOf(s)).toBe('c');
  });

  it('refuses any other card while facing a penalty', () => {
    rejects(facing(2, ['2H'], ['3H', '3C']), play('a', '3H'), 'CARD_NOT_PLAYABLE');
  });

  it('after an Ace block, requires the suit of the Ace', () => {
    const s = ok(facing(2, ['2H'], ['AS', '3C']), play('a', 'AS'));
    expect(turnOf(s)).toBe('b');
    const next = table({
      hands: { a: ['3C'], b: ['3S', '5H', 'JKB'], c: ['4D'] },
      discard: ['2H', 'AS'],
      lead: s.lead,
      turn: { kind: 'player', player: 'b' },
    });
    rejects(next, play('b', '5H'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(next, play('b', '3S')))).toBe('3S');
  });

  it('after a taken stack topped by a 2, requires that suit or another 2', () => {
    let s = ok(facing(2, ['2H'], ['3C']), pick('a'));
    expect(turnOf(s)).toBe('b');
    s = table({ hands: { a: ['3C'], b: ['5D', '5H', '2S', '6C'], c: ['4D'] }, discard: ['2H'], lead: s.lead, turn: { kind: 'player', player: 'b' } });
    rejects(s, play('b', '5D'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(s, play('b', '5H')))).toBe('5H');
    expect(top(ok(s, play('b', '2S')))).toBe('2S');
  });

  it('after a taken stack topped by a Joker, requires that colour or another Joker', () => {
    let s = ok(facing(5, ['JKR'], ['3C']), pick('a'));
    s = table({
      hands: { a: ['3C'], b: ['5D', '5C', 'JKB', '6C'], c: ['4D'] },
      discard: ['JKR'],
      lead: s.lead,
      turn: { kind: 'player', player: 'b' },
    });
    rejects(s, play('b', '5C'), 'CARD_NOT_PLAYABLE');
    expect(top(ok(s, play('b', '5D')))).toBe('5D');
    expect(top(ok(s, play('b', 'JKB')))).toBe('JKB');
  });
});

describe('Announcements', () => {
  const s0 = (aHand = ['3H', '4H', '6H']) =>
    table({ hands: { a: aHand, b: ['3D', '4D', '6D', '9H'], c: ['3S', '4S', '6S', '9S'] }, discard: ['5H'], drawPile: ['QC', 'QD', 'QS', 'KC'] });

  it('an announced play to 2 cards cannot be called out', () => {
    const { state, events } = okWithEvents(s0(), play('a', '3H', { announce: true }));
    expect(events).toContainEqual({ type: 'announced', player: 'a', cardsLeft: 2 });
    rejects(state, { type: 'callOut', player: 'b', target: 'a' }, 'CANNOT_CALL_OUT');
  });

  it('an unannounced play to 2 cards can be called out for a pick of 2', () => {
    const s = ok(ok(s0(), play('a', '3H')), { type: 'callOut', player: 'c', target: 'a' });
    expect(hand(s, 'a')).toHaveLength(4);
  });

  it('also applies to "1 card"', () => {
    const s = ok(ok(s0(['3H', '4H']), play('a', '3H')), { type: 'callOut', player: 'b', target: 'a' });
    expect(hand(s, 'a')).toHaveLength(3);
  });

  it('call-outs are allowed until play returns to the player', () => {
    let s = ok(s0(), play('a', '3H'));
    s = ok(s, play('b', '9H'));
    expect(s.players.find((p) => p.id === 'a')!.callable).toBe(true);
    s = ok(s, pick('c'));
    if (s.pickedCardId) s = ok(s, pass('c'));
    expect(turnOf(s)).toBe('a');
    rejects(s, { type: 'callOut', player: 'b', target: 'a' }, 'CANNOT_CALL_OUT');
  });

  it('a player cannot call themselves out', () => {
    rejects(ok(s0(), play('a', '3H')), { type: 'callOut', player: 'a', target: 'a' }, 'CANNOT_CALL_OUT');
  });

  it('a player who did not need to announce cannot be called out', () => {
    rejects(ok(s0(['3H', '4H', '6H', '9C']), play('a', '3H')), { type: 'callOut', player: 'b', target: 'a' }, 'CANNOT_CALL_OUT');
  });
});

describe('Ending a round', () => {
  it('a player checks by playing their last card when it is ordinary', () => {
    const { state, events } = okWithEvents(
      table({ hands: { a: ['6H'], b: ['3D', '4D'], c: ['3S', '4S'] }, discard: ['5H'] }),
      play('a', '6H'),
    );
    expect(events).toContainEqual({ type: 'checked', player: 'a' });
    expect(state.roundResult!.checker).toBe('a');
    expect(state.phase).toBe('roundOver');
  });

  it('a last action card leaves the player on air instead of checking', () => {
    const s = ok(table({ hands: { a: ['7H'], b: ['3D'], c: ['3S'], d: ['4S'] }, discard: ['5H'] }), play('a', '7H'));
    expect(s.phase).toBe('playing');
    expect(hand(s, 'a')).toEqual([]);
    expect(s.roundResult).toBeNull();
  });

  it('a last K never checks, even when it is an ordinary card', () => {
    const s = ok(table({ hands: { a: ['KH'], b: ['3D'], c: ['3S'] }, discard: ['5H'] }), play('a', 'KH'));
    expect(s.phase).toBe('playing');
    expect(hand(s, 'a')).toEqual([]);
  });

  it('a player on air must pick, then may check with a valid card', () => {
    const s = table({ hands: { a: [], b: ['3D'], c: ['3S'] }, discard: ['5H'], drawPile: ['6H'] });
    rejects(s, play('a', '6H'), 'CARD_NOT_IN_HAND');
    const picked = ok(s, pick('a'));
    expect(picked.pickedCardId).toBe('6H');
    expect(ok(picked, play('a', '6H')).roundResult!.checker).toBe('a');
  });

  it('a player on air may play a picked action card and stay on air', () => {
    const s = ok(ok(table({ hands: { a: [], b: ['3D'], c: ['3S'] }, discard: ['5H'], drawPile: ['7H'] }), pick('a')), play('a', '7H'));
    expect(hand(s, 'a')).toEqual([]);
    expect(s.phase).toBe('playing');
  });

  it('a player on air may keep the picked card', () => {
    const s = ok(ok(table({ hands: { a: [], b: ['3D'], c: ['3S'] }, discard: ['5H'], drawPile: ['6H'] }), pick('a')), pass('a'));
    expect(hand(s, 'a')).toEqual(['6H']);
  });

  it('when another player checks, a player on air draws one card that counts towards their points', () => {
    const s = ok(
      table({ hands: { a: ['6H'], b: [], c: ['3S'] }, discard: ['5H'], drawPile: ['10C'] }),
      play('a', '6H'),
    );
    expect(hand(s, 'b')).toEqual(['10C']);
    expect(s.roundResult!.points.b).toBe(10);
  });
});

describe('Scoring', () => {
  it('scores cards as specified', () => {
    const expected: Record<string, number> = {
      '2H': 2, '3H': 3, '4H': 4, '5H': 5, '6H': 6, '7H': 7, '9H': 9, '10H': 10,
      JH: 10, QH: 10, KH: 10, AH: 11, '8H': 24, JKR: 50, JKB: 50,
    };
    for (const [id, pts] of Object.entries(expected)) expect(cardPoints(cardFromId(id))).toBe(pts);
  });

  const checked = () =>
    ok(
      table({
        hands: { a: ['6H'], b: ['10C', '6S'], c: ['5C', '9S'], d: ['10D', '5S'], e: ['3C'] },
        discard: ['5H'],
      }),
      play('a', '6H'),
    );

  it('eliminates over 15, keeps under 15 and sends exactly 15 to a toss', () => {
    const s = checked();
    expect(s.roundResult!.points).toEqual({ b: 16, c: 14, d: 15, e: 3 });
    expect(s.roundResult!.outcomes).toMatchObject({ a: 'checked', b: 'eliminated', c: 'survived', d: 'toss', e: 'survived' });
    expect(s.phase).toBe('toss');
    expect(Object.keys(s.tossLayouts)).toEqual(['d']);
  });

  it('lays out 4 toss cards, at least one an 8 or Joker', () => {
    for (let seed = 0; seed < 300; seed++) {
      const layout = createTossLayout(createSeededRng(seed));
      expect(layout).toHaveLength(4);
      expect(new Set(layout.map((c) => c.id)).size).toBe(4);
      expect(layout.some((c) => c.kind === 'joker' || isRank(c, '8'))).toBe(true);
    }
  });

  const tossWith = (layout: string[]): GameState => {
    const s = checked();
    s.tossLayouts.d = layout.map(cardFromId);
    return s;
  };
  const toss = (picks: [number, number]) => ({ type: 'toss' as const, player: 'd', picks });

  it('toss: under 15 survives', () => {
    const s = ok(tossWith(['8H', '4C', '9D', 'JKR']), toss([1, 2]));
    expect(s.roundResult!.outcomes.d).toBe('survived');
    expect(s.players.find((p) => p.id === 'd')!.status).toBe('active');
    expect(s.phase).toBe('roundOver');
  });

  it('toss: over 15 is out', () => {
    const s = ok(tossWith(['8H', '4C', '9D', 'JKR']), toss([0, 1]));
    expect(s.roundResult!.outcomes.d).toBe('eliminated');
    expect(s.players.find((p) => p.id === 'd')!.status).toBe('eliminated');
  });

  it('toss: exactly 15 tosses again', () => {
    const s = ok(tossWith(['8H', '5C', '10D', 'JKR']), toss([1, 2]));
    expect(s.phase).toBe('toss');
    expect(s.tossLayouts.d).toHaveLength(4);
    expect(s.roundResult!.tosses.d).toHaveLength(1);
  });

  it('toss: refuses invalid picks and non-tossing players', () => {
    rejects(tossWith(['8H', '5C', '10D', 'JKR']), toss([1, 1]), 'INVALID_TOSS');
    rejects(tossWith(['8H', '5C', '10D', 'JKR']), toss([0, 4]), 'INVALID_TOSS');
    rejects(tossWith(['8H', '5C', '10D', 'JKR']), { type: 'toss', player: 'c', picks: [0, 1] }, 'WRONG_PHASE');
  });

  it('points do not carry between rounds', () => {
    const s = ok(ok(tossWith(['8H', '4C', '9D', 'JKR']), toss([1, 2])), { type: 'nextRound' });
    expect(s.round).toBe(2);
    expect(s.roundResult).toBeNull();
    for (const p of s.players.filter((pl) => pl.status === 'active')) {
      expect(p.hand).toHaveLength(4);
    }
  });
});

describe('Winning', () => {
  it('survivors play another round', () => {
    const s0 = ok(
      table({ hands: { a: ['6H'], b: ['3D'], c: ['3S'], d: ['10C', '10S'] }, discard: ['5H'] }),
      play('a', '6H'),
    );
    expect(s0.phase).toBe('roundOver');
    const s = ok(s0, { type: 'nextRound' });
    expect(s.phase).toBe('playing');
    expect(s.players.filter((p) => p.status === 'active').map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(hand(s, 'd')).toHaveLength(2); // eliminated players are not dealt in
  });

  it('the checker wins if everyone else is eliminated in one round', () => {
    const s = ok(table({ hands: { a: ['6H'], b: ['JKR'], c: ['8S'] }, discard: ['5H'] }), play('a', '6H'));
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe('a');
  });

  it('with 2 players left the checker wins as soon as they check', () => {
    const s = ok(table({ hands: { a: ['6H'], b: ['3D'] }, discard: ['5H'] }), play('a', '6H'));
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe('a');
  });

  it('ignores eliminated players at the table', () => {
    const s = ok(
      table({ hands: { a: ['7H', '3C'], b: ['4D'], c: ['3S'] }, discard: ['5H'], eliminated: ['b'] }),
      play('a', '7H'),
    );
    // Only a and c remain, so 7 means play again.
    expect(turnOf(s)).toBe('a');
    rejects(s, pick('b'), 'NOT_IN_GAME');
  });
});

describe('Running out of cards', () => {
  it('reshuffles the played cards, except the top card, into a new draw pile', () => {
    const { state, events } = okWithEvents(
      table({ hands: { a: ['3C', '4C'], b: ['3D'], c: ['3S'] }, discard: ['9H', '10H', 'QH', '5H'], drawPile: [] }),
      pick('a'),
    );
    expect(events.some((e) => e.type === 'reshuffled')).toBe(true);
    expect(state.discard.map((c) => c.id)).toEqual(['5H']);
    expect(hand(state, 'a')).toHaveLength(3);
    expect(state.drawPile).toHaveLength(2);
  });

  it('picks whatever is available when there are not enough cards, and play continues', () => {
    const s = ok(
      table({ hands: { a: ['3C'], b: ['3D'], c: ['3S'] }, discard: ['9H', 'JKR'], drawPile: ['4D'], penalty: 5 }),
      pick('a'),
    );
    expect(hand(s, 'a')).toHaveLength(3);
    expect(turnOf(s)).toBe('b');
  });

  it('passes the turn when there is nothing at all to pick', () => {
    const s = ok(table({ hands: { a: ['3C'], b: ['3D'], c: ['3S'] }, discard: ['5H'], drawPile: [] }), pick('a'));
    expect(hand(s, 'a')).toEqual(['3C']);
    expect(turnOf(s)).toBe('b');
  });
});

describe('Engine contract', () => {
  it('never mutates the input state', () => {
    const s = table({ hands: { a: ['6H', '3C'], b: ['3D'] }, discard: ['5H'] });
    const before = structuredClone(s);
    applyMove(s, play('a', '6H'), rng());
    applyMove(s, pick('a'), rng());
    expect(s).toEqual(before);
  });

  it('rejects moves outside the right phase', () => {
    const s = ok(table({ hands: { a: ['6H'], b: ['3D'], c: ['3S'] }, discard: ['5H'] }), play('a', '6H'));
    rejects(s, pick('b'), 'WRONG_PHASE');
    rejects(table({ hands: { a: ['6H'], b: ['3D'] }, discard: ['5H'] }), { type: 'nextRound' }, 'WRONG_PHASE');
  });

  it('scores hands with handPoints', () => {
    expect(handPoints(['8H', 'JKB', '3C'].map(cardFromId))).toBe(77);
  });
});

const specOfState = (s: GameState) => specOf(s);

function specOf(s: GameState) {
  return {
    hands: Object.fromEntries(s.players.map((p) => [p.id, p.hand.map((c) => c.id)])),
    discard: s.discard.map((c) => c.id),
  };
}
