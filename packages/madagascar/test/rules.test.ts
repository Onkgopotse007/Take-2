/** One test (or more) per rule in the "Madagascar" section of CLAUDE.md. */
import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@take2/engine';
import { createGame, getLegalMoves, getPlayerView, placeNumbers, playersToAct } from '../src';
import { hand, leave, ok, okWithEvents, pileIds, play, rejects, table, turnCard, turnOf } from './helpers';

const rng = () => createSeededRng(1);

describe('Setup', () => {
  it('spreads all 52 cards, no Jokers, face down in the oval; nobody holds cards and the middle is empty', () => {
    const s = createGame(['a', 'b', 'c'], rng());
    expect(s.circle).toHaveLength(52);
    expect(new Set(s.circle.map((c) => c!.id)).size).toBe(52);
    expect(s.circle.some((c) => c!.kind === 'joker')).toBe(false);
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(s.pile).toEqual([]);
    expect(s.phase).toBe('circle');
  });

  it('takes 2 to 10 players', () => {
    expect(() => createGame(['a'], rng())).toThrow(RangeError);
    expect(() => createGame(Array.from({ length: 11 }, (_, i) => `p${i}`), rng())).toThrow(RangeError);
    expect(() => createGame(Array.from({ length: 10 }, (_, i) => `p${i}`), rng())).not.toThrow();
  });
});

describe('Phase 1: the oval', () => {
  it('anyone may turn the first card', () => {
    const s = createGame(['a', 'b', 'c', 'd'], rng());
    expect(playersToAct(s)).toEqual(['a', 'b', 'c', 'd']);
    const after = ok(s, turnCard('c', 7));
    expect(after.circle[7]).toBeNull();
    expect(after.pile).toHaveLength(1);
  });

  it("either of the starter's neighbours plays second, and that sets the direction", () => {
    const s = ok(createGame(['a', 'b', 'c', 'd'], rng()), turnCard('c', 7));
    expect(playersToAct(s).sort()).toEqual(['b', 'd']);
    rejects(s, turnCard('a', 8), 'NOT_YOUR_TURN');
    const right = ok(s, turnCard('b', 8));
    expect(right.direction).toBe(-1);
    expect(turnOf(right)).toBe('a');
    const left = ok(s, turnCard('d', 8));
    expect(left.direction).toBe(1);
    expect(turnOf(left)).toBe('a');
  });

  it('one against one, the other player simply goes next', () => {
    const s = ok(createGame(['a', 'b'], rng()), turnCard('b', 0));
    expect(turnOf(s)).toBe('a');
  });

  it('a card can only be turned once', () => {
    const s = table({ phase: 'circle', hands: { a: [], b: [] }, circle: [null, '3H'], pile: ['5C'] });
    rejects(s, turnCard('a', 0), 'NO_CARD_THERE');
    rejects(s, turnCard('a', 9), 'NO_CARD_THERE');
    rejects(s, play('a', '3H'), 'WRONG_PHASE');
  });

  it('a card that does not match the top suit just goes on the pile', () => {
    const s = ok(table({ phase: 'circle', hands: { a: [], b: [] }, circle: ['3H', '4D'], pile: ['5C', '9S'] }), turnCard('a', 0));
    expect(pileIds(s)).toEqual(['5C', '9S', '3H']);
    expect(hand(s, 'a')).toEqual([]);
    expect(turnOf(s)).toBe('b');
  });

  it('a card that matches the top suit takes the whole pile except the card played, and play passes on', () => {
    const { state, events } = okWithEvents(
      table({ phase: 'circle', hands: { a: [], b: [], c: [] }, circle: ['3S', '4D'], pile: ['5C', '9S'] }),
      turnCard('a', 0),
    );
    expect(pileIds(state)).toEqual(['3S']);
    expect(hand(state, 'a').sort()).toEqual(['5C', '9S']);
    expect(events).toContainEqual({ type: 'pickedUp', player: 'a', count: 2 });
    expect(turnOf(state)).toBe('b');
  });

  it('on a one-card pile, a match still takes that card', () => {
    const s = ok(table({ phase: 'circle', hands: { a: [], b: [] }, circle: ['3S', '4D'], pile: ['9S'] }), turnCard('a', 0));
    expect(hand(s, 'a')).toEqual(['9S']);
    expect(pileIds(s)).toEqual(['3S']);
  });

  it('nobody sees which card is in which slot', () => {
    const s = createGame(['a', 'b'], rng());
    const v = getPlayerView(s, 'a');
    expect(v.circle).toHaveLength(52);
    expect(v.circle.every((filled) => filled === true)).toBe(true);
    expect(JSON.stringify(v)).not.toContain('"suit"');
  });
});

describe('Between the phases', () => {
  it('everyone left with no cards shares first place; phase 2 carries on from whoever was next', () => {
    const s0 = table({ phase: 'circle', hands: { a: [], b: ['2H'], c: [], d: ['3C', '4C'] }, circle: ['3H'], pile: ['9S'], turn: { kind: 'player', player: 'c' } });
    const { state, events } = okWithEvents(s0, turnCard('c', 0));
    expect(state.phase).toBe('hands');
    expect(state.places).toEqual([['a', 'c']]);
    expect(events).toContainEqual({ type: 'finished', player: 'a', place: 1 });
    expect(events).toContainEqual({ type: 'finished', player: 'c', place: 1 });
    expect(events).toContainEqual({ type: 'handsPhase' });
    // d was next after c.
    expect(turnOf(state)).toBe('d');
    expect(pileIds(state)).toEqual(['9S', '3H']);
  });

  it('skips anyone already finished when choosing who goes first in phase 2', () => {
    const s0 = table({ phase: 'circle', hands: { a: ['2H'], b: [], c: ['3C'] }, circle: ['3H'], pile: ['9S'], turn: { kind: 'player', player: 'a' } });
    expect(turnOf(ok(s0, turnCard('a', 0)))).toBe('c');
  });

  it('if only one player still holds cards, the game ends without phase 2', () => {
    const s = ok(table({ phase: 'circle', hands: { a: [], b: ['2H'] }, circle: ['3H'], pile: ['9S'] }), turnCard('a', 0));
    expect(s.phase).toBe('gameOver');
    expect(s.ranking).toEqual([['a'], ['b']]);
  });
});

describe('Phase 2: hands', () => {
  it('players choose any card from their hand', () => {
    const s = table({ hands: { a: ['3H', '4D', '9S'], b: ['5C'] }, pile: ['9C'] });
    expect(getLegalMoves(s, 'a')).toHaveLength(3);
    const after = ok(s, play('a', '4D'));
    expect(pileIds(after)).toEqual(['9C', '4D']);
    expect(hand(after, 'a')).toEqual(['3H', '9S']);
    rejects(after, play('b', '9C'), 'CARD_NOT_IN_HAND');
    rejects(after, turnCard('b', 0), 'WRONG_PHASE');
  });

  it('the suit rule still applies', () => {
    const s = ok(table({ hands: { a: ['3C', '4D'], b: ['5H'] }, pile: ['9H', '6S', '9C'] }), play('a', '3C'));
    expect(hand(s, 'a').sort()).toEqual(['4D', '6S', '9C', '9H']);
    expect(pileIds(s)).toEqual(['3C']);
  });

  it('emptying your hand takes the next place; the rest play on', () => {
    const { state, events } = okWithEvents(
      table({ hands: { a: ['3H'], b: ['5C', '6C'], c: ['7D', '8D'] }, pile: ['9S'], finished: [] }),
      play('a', '3H'),
    );
    expect(events).toContainEqual({ type: 'finished', player: 'a', place: 1 });
    expect(state.phase).toBe('hands');
    expect(turnOf(state)).toBe('b');
  });

  it('a last card that matches picks up the pile, so you are not out', () => {
    const s = ok(table({ hands: { a: ['3S'], b: ['5C'] }, pile: ['9S'] }), play('a', '3S'));
    expect(hand(s, 'a')).toEqual(['9S']);
    expect(s.phase).toBe('hands');
  });

  it('the game ends when only one player holds cards; they come last', () => {
    const s0 = table({ hands: { e: [], a: ['3H'], b: ['5C', '6C'], c: [] }, pile: ['9S'], finished: [['e', 'c']], turn: { kind: 'player', player: 'a' } });
    const { state, events } = okWithEvents(s0, play('a', '3H'));
    expect(state.phase).toBe('gameOver');
    expect(state.ranking).toEqual([['e', 'c'], ['a'], ['b']]);
    expect(placeNumbers(state.ranking!)).toEqual([1, 3, 4]);
    expect(events).toContainEqual({ type: 'gameOver', winners: ['e', 'c'] });
  });
});

describe('Deadlock', () => {
  const stuck = (stalled: number) => table({ hands: { a: ['3S', '4S'], b: ['5S'], c: ['6S', '7S', '8S'] }, pile: ['9S'], stalled });

  it('two trips round the table of matches on a one-card pile end the game, ranked by fewest cards', () => {
    // 3 players: the 6th stalled play ends it.
    const { state, events } = okWithEvents(stuck(5), play('a', '3S'));
    expect(events).toContainEqual({ type: 'deadlock' });
    expect(state.phase).toBe('gameOver');
    expect(state.deadlocked).toBe(true);
    expect(state.ranking).toEqual([['b'], ['a'], ['c']]);
  });

  it('players holding the same number of cards share a place', () => {
    const s = ok(table({ hands: { a: ['3S', '4S'], b: ['5S', '2S'] }, pile: ['9S'], stalled: 3 }), play('a', '3S'));
    expect(s.ranking).toEqual([['a', 'b']]);
  });

  it('counts only matches on a one-card pile', () => {
    expect(ok(stuck(4), play('a', '3S')).stalled).toBe(5);
    // Matching a bigger pile is not a stall.
    expect(ok(table({ hands: { a: ['3S', '4S'], b: ['5S'] }, pile: ['9H', '9S'], stalled: 3 }), play('a', '3S')).stalled).toBe(0);
  });

  it('any play that does not match resets the count', () => {
    const s = ok(table({ hands: { a: ['3S', '4H'], b: ['5S'], c: ['6S'] }, pile: ['9S'], stalled: 5 }), play('a', '4H'));
    expect(s.stalled).toBe(0);
    expect(s.phase).toBe('hands');
  });
});

describe('Leaving', () => {
  it('a player who leaves comes last, the first to leave last of all, and their cards leave the game', () => {
    let s = table({ hands: { a: ['3H'], b: ['5C', '6C'], c: ['7D'], d: ['8D', '2D'] }, pile: ['9S'] });
    s = ok(s, leave('d'));
    expect(s.outOfPlay.map((c) => c.id).sort()).toEqual(['2D', '8D']);
    s = ok(s, leave('c'));
    s = ok(s, play('a', '3H'));
    expect(s.ranking).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('play passes on if it was their turn', () => {
    const s = ok(table({ hands: { a: ['3H'], b: ['5C'], c: ['7D'] }, pile: ['9S'] }), leave('a'));
    expect(turnOf(s)).toBe('b');
  });

  it('if the starter leaves before anyone plays second, play goes to their left', () => {
    const s0 = ok(createGame(['a', 'b', 'c', 'd'], rng()), turnCard('b', 0));
    const s = ok(s0, leave('b'));
    expect(turnOf(s)).toBe('c');
    expect(s.direction).toBe(1);
  });

  it('if a neighbour leaves before anyone plays second, the next seat along becomes the neighbour', () => {
    const s0 = ok(createGame(['a', 'b', 'c', 'd'], rng()), turnCard('b', 0));
    expect(playersToAct(ok(s0, leave('c'))).sort()).toEqual(['a', 'd']);
  });

  it('the last player left takes the next place', () => {
    const s = ok(createGame(['a', 'b'], rng()), leave('a'));
    expect(s.phase).toBe('gameOver');
    expect(s.ranking).toEqual([['b'], ['a']]);
  });

  it('nobody can move once the game is over', () => {
    const s = ok(createGame(['a', 'b'], rng()), leave('a'));
    rejects(s, turnCard('b', 0), 'WRONG_PHASE');
  });
});
