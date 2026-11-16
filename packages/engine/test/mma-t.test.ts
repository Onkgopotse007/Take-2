/** One test (or more) per rule in the "Mma T's house rules" section of CLAUDE.md. */
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getLegalMoves, getPlayerView, type GameState } from '../src';
import { hand, ok, okWithEvents, play, rejects, rng, table, type TableSpec } from './helpers';

const mmaT = (spec: Omit<TableSpec, 'mode'>): GameState => table({ ...spec, mode: 'mmaT' });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("Mma T's house rules", () => {
  describe('No Jokers', () => {
    it('deals from a 52-card deck with no Jokers, every round', () => {
      for (let seed = 0; seed < 100; seed++) {
        let g = createGame(ids(2 + (seed % 9)), rng(seed), { mode: 'mmaT' });
        const all = () => [...g.drawPile, ...g.discard, ...g.players.flatMap((p) => p.hand)];
        expect(all()).toHaveLength(52);
        expect(all().some((c) => c.kind === 'joker')).toBe(false);
        g = { ...g, phase: 'roundOver' };
        g = ok(g, { type: 'nextRound' });
        expect(all().some((c) => c.kind === 'joker')).toBe(false);
      }
    });

    it('leaves classic games with their Jokers', () => {
      const g = createGame(ids(4), rng(), {});
      expect(g.mode).toBe('classic');
      expect([...g.drawPile, ...g.discard, ...g.players.flatMap((p) => p.hand)]).toHaveLength(54);
    });
  });

  describe('Any card can check', () => {
    it.each(['AH', '2H', '7H', 'JH', 'KH'])('a last %s checks', (card) => {
      const { state, events } = okWithEvents(mmaT({ hands: { a: [card], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', card));
      expect(events).toContainEqual({ type: 'checked', player: 'a' });
      expect(state.roundResult!.checker).toBe('a');
      expect(state.penalty).toBe(0);
    });

    it('a last 8 checks on any card without naming a suit', () => {
      const s = mmaT({ hands: { a: ['8C'], b: ['3D'], c: ['4S'] }, discard: ['5H'] });
      expect(getLegalMoves(s, 'a')).toContainEqual({ type: 'play', player: 'a', cardId: '8C' });
      expect(ok(s, play('a', '8C')).roundResult!.checker).toBe('a');
    });

    it('an 8 that is not the last card still names a suit', () => {
      rejects(mmaT({ hands: { a: ['8C', '3C'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '8C'), 'SUIT_REQUIRED');
    });

    it('a last 8 still cannot be played against an unblocked 2', () => {
      rejects(mmaT({ hands: { a: ['8C'], b: ['3D'], c: ['4S'] }, discard: ['2H'], penalty: 2 }), play('a', '8C'), 'CARD_NOT_PLAYABLE');
    });

    it('a last card must still be playable', () => {
      rejects(mmaT({ hands: { a: ['7C'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '7C'), 'CARD_NOT_PLAYABLE');
    });

    it('nobody is ever left on air', () => {
      const s = ok(mmaT({ hands: { a: ['7H'], b: ['3D'], c: ['3S'], d: ['4S'] }, discard: ['5H'] }), play('a', '7H'));
      expect(s.phase).not.toBe('playing');
      expect(getPlayerView(s, 'b').players.some((p) => p.onAir)).toBe(false);
    });
  });

  describe('Scoring', () => {
    const checked = () =>
      ok(
        mmaT({ hands: { a: ['6H'], b: ['10C', '6S'], c: ['10D', '7S'], d: ['10S', '5S'], e: ['3C'] }, discard: ['5H'] }),
        play('a', '6H'),
      );

    it('16 and below survive, 17 and above are out, and exactly 15 is not a toss', () => {
      const s = checked();
      expect(s.roundResult!.points).toEqual({ b: 16, c: 17, d: 15, e: 3 });
      expect(s.roundResult!.outcomes).toMatchObject({ a: 'checked', b: 'survived', c: 'eliminated', d: 'survived', e: 'survived' });
      expect(s.phase).toBe('roundOver');
      expect(s.tossLayouts).toEqual({});
    });
  });

  describe('Winning', () => {
    it('the first player to check becomes the only one who can win', () => {
      const s = ok(mmaT({ hands: { a: ['6H'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '6H'));
      expect(s.contender).toBe('a');
      expect(s.phase).toBe('roundOver');
      expect(getPlayerView(s, 'b').contender).toBe('a');
    });

    it('they win once every other player is out', () => {
      const s = ok(
        mmaT({ hands: { a: ['6H'], b: ['8D'], c: ['10S', '9S'], d: ['3C'] }, discard: ['5H'], contender: 'a', eliminated: ['d'] }),
        play('a', '6H'),
      );
      expect(s.phase).toBe('gameOver');
      expect(s.winner).toBe('a');
      expect(s.voided).toBe(false);
    });

    it('can win in the first round by putting everyone out at once', () => {
      const s = ok(mmaT({ hands: { a: ['6H'], b: ['8D'], c: ['KS', 'QS'] }, discard: ['5H'] }), play('a', '6H'));
      expect(s.winner).toBe('a');
    });

    it('with two players left, their check wins the game', () => {
      const s = ok(mmaT({ hands: { a: ['6H'], b: ['3D'] }, discard: ['5H'], contender: 'a' }), play('a', '6H'));
      expect(s.phase).toBe('gameOver');
      expect(s.winner).toBe('a');
    });

    it('if anyone else checks first, the game is void: no winner and nobody is eliminated', () => {
      const { state, events } = okWithEvents(
        mmaT({ hands: { b: ['6H'], a: ['KS', 'QS'], c: ['3D'] }, discard: ['5H'], contender: 'a' }),
        play('b', '6H'),
      );
      expect(events).toContainEqual({ type: 'gameVoided', contender: 'a', checker: 'b' });
      expect(state.phase).toBe('gameOver');
      expect(state.winner).toBeNull();
      expect(state.voided).toBe(true);
      expect(state.players.every((p) => p.status === 'active')).toBe(true);
      // Everyone's hand is still shown.
      expect(state.roundResult!.points).toEqual({ a: 20, c: 3 });
    });

    it('a check by the other player of the last two also voids the game', () => {
      const s = ok(mmaT({ hands: { b: ['6H'], a: ['3D'] }, discard: ['5H'], contender: 'a' }), play('b', '6H'));
      expect(s.voided).toBe(true);
      expect(s.winner).toBeNull();
    });

    it('the game is void if the contender leaves', () => {
      const s0 = mmaT({ hands: { a: ['6H', '3C'], b: ['3D'], c: ['4S'] }, discard: ['5H'], contender: 'a' });
      const { state, events } = okWithEvents(s0, { type: 'forfeit', player: 'a', reason: 'left' });
      expect(events).toContainEqual({ type: 'gameVoided', contender: 'a', checker: null });
      expect(state.phase).toBe('gameOver');
      expect(state.winner).toBeNull();
    });

    it('anyone else leaving is out as usual, and the last player left still wins', () => {
      const s0 = mmaT({ hands: { a: ['6H', '3C'], b: ['3D'] }, discard: ['5H'], contender: 'a' });
      const s = ok(s0, { type: 'forfeit', player: 'b', reason: 'left' });
      expect(s.winner).toBe('a');
      expect(s.voided).toBe(false);
    });

    it('classic games have no contender and are never void', () => {
      const s = ok(table({ hands: { a: ['6H'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '6H'));
      expect(s.contender).toBeNull();
      const again = applyMove({ ...s, phase: 'roundOver' }, { type: 'nextRound' }, rng());
      expect(again.ok && again.state.contender).toBeNull();
    });
  });

  it('keeps the contender across rounds', () => {
    const s = ok(ok(mmaT({ hands: { a: ['6H'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '6H')), { type: 'nextRound' });
    expect(s.contender).toBe('a');
    expect(s.phase).toBe('playing');
    expect(hand(s, 'b')).toHaveLength(4);
  });
});
