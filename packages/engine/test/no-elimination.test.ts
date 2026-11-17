/** One test (or more) per rule in the "No elimination" section of CLAUDE.md. */
import { describe, expect, it } from 'vitest';
import { createGame, getLegalMoves, getPlayerView, type GameState } from '../src';
import { hand, ok, okWithEvents, pick, play, rejects, rng, table, turnOf, type TableSpec } from './helpers';

const noElim = (spec: Omit<TableSpec, 'noElimination'>): GameState => table({ ...spec, noElimination: true });
const status = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.status;

describe('No elimination', () => {
  it('is off unless chosen, and works with either set of rules', () => {
    expect(createGame(['a', 'b'], rng()).noElimination).toBe(false);
    expect(createGame(['a', 'b'], rng(), { noElimination: true }).noElimination).toBe(true);
    const g = createGame(['a', 'b'], rng(), { mode: 'mmaT', noElimination: true });
    expect(g.mode).toBe('mmaT');
    expect(g.noElimination).toBe(true);
  });

  describe('Checking', () => {
    it('the checker finishes first and the rest play on in the same round', () => {
      const s0 = noElim({ hands: { a: ['6H'], b: ['KS', 'QS', '8D'], c: ['3D', '4C'], d: ['9S'] }, discard: ['5H'] });
      const { state, events } = okWithEvents(s0, play('a', '6H'));
      expect(events).toContainEqual({ type: 'checked', player: 'a' });
      expect(state.phase).toBe('playing');
      expect(state.round).toBe(1);
      expect(state.finished).toEqual(['a']);
      expect(status(state, 'a')).toBe('finished');
      expect(state.roundResult).toBeNull();
      // Nobody is knocked out, whatever they hold, and hands are kept.
      expect(state.players.filter((p) => p.status === 'eliminated')).toEqual([]);
      expect(hand(state, 'b')).toEqual(['KS', 'QS', '8D']);
      expect(turnOf(state)).toBe('b');
      expect(state.lead.suits).toEqual(['hearts']);
    });

    it('play goes round without the finished players', () => {
      const s0 = noElim({ hands: { a: [], b: ['6H', '4C'], c: ['9H', '9C'] }, discard: ['5H'], drawPile: ['3S'], finished: ['a'], turn: { kind: 'player', player: 'c' } });
      expect(turnOf(ok(s0, play('c', '9H', { announce: true })))).toBe('b');
      expect(turnOf(ok(s0, pick('c')))).toBe('b');
    });

    it('a finished player cannot act or be called out', () => {
      const s = ok(noElim({ hands: { a: ['6H'], b: ['3D', '4C'], c: ['3S', '4S'] }, discard: ['5H'] }), play('a', '6H'));
      rejects(s, pick('a'), 'NOT_IN_GAME');
      rejects(s, { type: 'callOut', player: 'b', target: 'a' }, 'CANNOT_CALL_OUT');
      expect(getLegalMoves(s, 'a')).toEqual([]);
    });

    it('an action card as a last card still leaves you on air, as in classic', () => {
      const s = ok(noElim({ hands: { a: ['7H'], b: ['3D'], c: ['4S'] }, discard: ['5H'] }), play('a', '7H'));
      expect(s.finished).toEqual([]);
      expect(getPlayerView(s, 'b').players.find((p) => p.id === 'a')!.onAir).toBe(true);
    });

    it('an on-air player stays on air when someone else checks', () => {
      const s = ok(noElim({ hands: { b: ['6H'], a: [], c: ['4S', '3S'] }, discard: ['5H'] }), play('b', '6H'));
      expect(hand(s, 'a')).toEqual([]);
      expect(s.phase).toBe('playing');
    });

    it('with Mma T\'s rules, a checking action card still has its effect', () => {
      const two = ok(
        noElim({ mode: 'mmaT', hands: { a: ['2H'], b: ['3D', '4D'], c: ['4S', '3S'] }, discard: ['5H'] }),
        play('a', '2H'),
      );
      expect(two.finished).toEqual(['a']);
      expect(two.penalty).toBe(2);
      expect(turnOf(two)).toBe('b');

      const seven = ok(
        noElim({ mode: 'mmaT', hands: { a: ['7H'], b: ['3D'], c: ['4S'], d: ['9S'] }, discard: ['5H'] }),
        play('a', '7H'),
      );
      expect(turnOf(seven)).toBe('c');

      const jack = ok(
        noElim({ mode: 'mmaT', hands: { a: ['JH'], b: ['3D'], c: ['4S'], d: ['9S'] }, discard: ['5H'] }),
        play('a', 'JH'),
      );
      expect(turnOf(jack)).toBe('d');
      expect(jack.direction).toBe(-1);
    });

    it("with Mma T's rules, a last 8 checks and still names the next suit", () => {
      const s0 = noElim({ mode: 'mmaT', hands: { a: ['8C'], b: ['3D'], c: ['4S'] }, discard: ['5H'] });
      rejects(s0, play('a', '8C'), 'SUIT_REQUIRED');
      expect(getLegalMoves(s0, 'a')).toContainEqual({ type: 'play', player: 'a', cardId: '8C', suit: 'spades' });
      const s = ok(s0, play('a', '8C', { suit: 'spades' }));
      expect(s.finished).toEqual(['a']);
      expect(s.lead.suits).toEqual(['spades']);
    });

    it("with Mma T's rules, there is no contender and no void game", () => {
      let s = ok(noElim({ mode: 'mmaT', hands: { a: ['6H'], b: ['9H'], c: ['4S', '3S'] }, discard: ['5H'] }), play('a', '6H'));
      s = ok(s, play('b', '9H'));
      expect(s.contender).toBeNull();
      expect(s.voided).toBe(false);
      expect(s.ranking).toEqual(['a', 'b', 'c']);
      expect(s.winner).toBe('a');
    });
  });

  describe('Ending and ranking', () => {
    it('ends when one of the last two checks: places follow the order of checking', () => {
      const s0 = noElim({ hands: { a: [], b: [], c: ['6H'], d: ['KS', 'QS'] }, discard: ['5H'], finished: ['b', 'a'], turn: { kind: 'player', player: 'c' } });
      const { state, events } = okWithEvents(s0, play('c', '6H'));
      expect(state.phase).toBe('gameOver');
      expect(state.ranking).toEqual(['b', 'a', 'c', 'd']);
      expect(state.winner).toBe('b');
      expect(events).toContainEqual({ type: 'gameOver', winner: 'b' });
    });

    it('a two-player game ends at the first check', () => {
      const s = ok(noElim({ hands: { a: ['6H'], b: ['3D'] }, discard: ['5H'] }), play('a', '6H'));
      expect(s.phase).toBe('gameOver');
      expect(s.ranking).toEqual(['a', 'b']);
    });

    it('a player who leaves comes last, and the first to leave comes below the next', () => {
      let s = noElim({ hands: { a: ['6H'], b: ['3D', '4C'], c: ['3S', '4S'], d: ['9S', '9C'] }, discard: ['5H'] });
      s = ok(s, { type: 'forfeit', player: 'c', reason: 'left' });
      s = ok(s, play('a', '6H'));
      s = ok(s, { type: 'forfeit', player: 'd', reason: 'missedTurns' });
      expect(s.phase).toBe('gameOver');
      expect(s.ranking).toEqual(['a', 'b', 'd', 'c']);
      expect(s.winner).toBe('a');
    });

    it('if everyone else leaves before anyone checks, the last player wins', () => {
      const s = ok(noElim({ hands: { a: ['6H', '3C'], b: ['3D'] }, discard: ['5H'] }), { type: 'forfeit', player: 'b', reason: 'left' });
      expect(s.ranking).toEqual(['a', 'b']);
      expect(s.winner).toBe('a');
    });

    it('shows the places so far to every player', () => {
      const s = ok(noElim({ hands: { a: ['6H'], b: ['3D', '4C'], c: ['3S', '4S'] }, discard: ['5H'] }), play('a', '6H'));
      const v = getPlayerView(s, 'b');
      expect(v.noElimination).toBe(true);
      expect(v.finished).toEqual(['a']);
      expect(v.players.find((p) => p.id === 'a')!.status).toBe('finished');
      expect(v.ranking).toBeNull();
    });
  });
});
