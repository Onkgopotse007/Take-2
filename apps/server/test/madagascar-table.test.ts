import { describe, expect, it } from 'vitest';
import { cardFromId, createSeededRng } from '@take2/engine';
import type { MadagascarState } from '@take2/madagascar';
import { MadagascarTable, parseMadagascarMove } from '../src/madagascar-table';
import type { MadagascarServerMessages } from '../src/protocol';
import { DEFAULT_TIMINGS, MISSED_TURNS_LIMIT, type Outbox } from '../src/table';
import { FakeClock } from './clock';

const T = DEFAULT_TIMINGS;
type M = MadagascarServerMessages;

function setup(seed = 1) {
  const clock = new FakeClock();
  const sent: { to: string; type: keyof M; message: unknown }[] = [];
  const outbox: Outbox<M> = { send: (to, type, message) => void sent.push({ to, type, message }) };
  const table = new MadagascarTable({ code: 'ABCDE', rng: createSeededRng(seed), scheduler: clock, outbox });
  const last = <K extends keyof M>(to: string, type: K) => sent.filter((m) => m.to === to && m.type === type).at(-1)?.message as M[K] | undefined;
  const rejected = (to: string) => last(to, 'rejected')?.code;
  return { clock, sent, table, last, rejected };
}

function started(players = ['a', 'b', 'c'], seed = 1) {
  const t = setup(seed);
  for (const id of players) t.table.join(id, id.toUpperCase());
  t.table.start('a');
  return t;
}

/** A phase 2 position: `a` to play. */
function handsPhase(hands: Record<string, string[]>, pile: string[]) {
  const t = setup();
  for (const id of Object.keys(hands)) t.table.join(id, id);
  const state: MadagascarState = {
    players: Object.entries(hands).map(([id, h]) => ({ id, hand: h.map(cardFromId), status: 'active' })),
    phase: 'hands',
    circle: [],
    pile: pile.map(cardFromId),
    turn: { kind: 'player', player: Object.keys(hands)[0]! },
    direction: 1,
    places: [],
    left: [],
    outOfPlay: [],
    stalled: 0,
    ranking: null,
    deadlocked: false,
  };
  t.table.loadState(state);
  return t;
}

describe('Madagascar table', () => {
  it('starts with the oval face down and nobody holding cards', () => {
    const t = started();
    const snap = t.last('b', 'table')!;
    expect(snap.status).toBe('playing');
    expect(snap.game!.phase).toBe('circle');
    expect(snap.game!.circle).toHaveLength(52);
    expect(snap.game!.hand).toEqual([]);
    expect(JSON.stringify(snap)).not.toContain('"suit"');
    expect(snap.raceOpensAt).toBe(t.clock.now() + T.countdownMs);
  });

  it('refuses the first card before the countdown ends, then lets the fastest turn it', () => {
    const t = started();
    t.table.move('b', { type: 'turn', slot: 3 });
    expect(t.rejected('b')).toBe('TOO_EARLY');
    t.clock.advance(T.countdownMs);
    t.table.move('b', { type: 'turn', slot: 3 });
    t.table.move('c', { type: 'turn', slot: 9 });
    t.clock.advance(T.raceTieWindowMs);
    const game = t.last('a', 'table')!.game!;
    expect(game.pileCount).toBe(1);
    expect(game.turn.kind).toBe('neighbours');
    // One of the two was beaten to it.
    expect([t.rejected('b'), t.rejected('c')]).toContain('BEATEN_TO_IT');
  });

  it('turns a random card for a random player if nobody starts in time', () => {
    const t = started();
    t.clock.advance(T.countdownMs + T.startTimeoutMs);
    expect(t.last('a', 'table')!.game!.pileCount).toBe(1);
  });

  it('plays a random card for a player who runs out of time, and the third time in a row they are out', () => {
    const t = handsPhase({ a: ['3H', '4H', '5H', '6H'], b: ['3C', '4C', '5C', '6C'], c: ['3D', '4D', '5D', '6D'] }, ['9S']);
    t.clock.advance(T.turnTimeoutMs);
    expect(t.last('a', 'table')!.game!.hand).toHaveLength(3);
    for (let i = 1; i < MISSED_TURNS_LIMIT; i++) {
      // b and c play straight away; a times out again.
      for (const id of ['b', 'c']) t.table.move(id, { type: 'play', cardId: t.last(id, 'table')!.game!.hand[0]!.id });
      t.clock.advance(T.turnTimeoutMs);
    }
    const snap = t.last('b', 'table')!;
    expect(snap.game!.players.find((p) => p.id === 'a')!.status).toBe('left');
  });

  it('gives everyone sharing first place a win, and lets the host start again', () => {
    const t = handsPhase({ a: ['3H'], b: ['4C', '5C'] }, ['9S']);
    t.table.move('a', { type: 'play', cardId: '3H' });
    const snap = t.last('b', 'table')!;
    expect(snap.status).toBe('finished');
    expect(snap.game!.ranking).toEqual([['a'], ['b']]);
    expect(snap.wins).toEqual({ a: 1 });
    t.table.start('a');
    expect(t.last('b', 'table')!.status).toBe('playing');
  });

  it('counts choosing to leave mid-game as a forfeit', () => {
    const t = started(['a', 'b']);
    t.table.leave('b', true);
    const snap = t.last('a', 'table')!;
    expect(snap.status).toBe('finished');
    expect(snap.game!.ranking).toEqual([['a'], ['b']]);
  });

  it('only accepts well-formed moves', () => {
    expect(parseMadagascarMove({ type: 'turn', slot: 4 })).toEqual({ type: 'turn', slot: 4 });
    expect(parseMadagascarMove({ type: 'turn', slot: '4' })).toBeNull();
    expect(parseMadagascarMove({ type: 'play', cardId: '3H' })).toEqual({ type: 'play', cardId: '3H' });
    expect(parseMadagascarMove({ type: 'forfeit' })).toBeNull();
    const t = started();
    t.table.move('a', { type: 'forfeit' });
    expect(t.rejected('a')).toBe('BAD_MESSAGE');
  });
});
