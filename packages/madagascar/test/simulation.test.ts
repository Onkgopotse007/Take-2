/** Full games played by random agents with seeded RNGs. */
import { describe, expect, it } from 'vitest';
import { createSeededRng, randomInt, type Rng } from '@take2/engine';
import { applyMove, createGame, getLegalMoves, getPlayerView, matchesTop, type MadagascarState, type Move } from '../src';

const MAX_MOVES = 200_000;

function chooseMove(s: MadagascarState, agent: Rng): Move {
  const active = s.players.filter((p) => p.status === 'active');
  // Now and then someone walks away from the table.
  if (agent.next() < 0.001) return { type: 'forfeit', player: active[randomInt(agent, active.length)]!.id, reason: 'left' };
  const all = s.players.flatMap((p) => getLegalMoves(s, p.id));
  if (s.phase === 'hands' && agent.next() < 0.85) {
    // Players mostly try not to match the top suit.
    const safe = all.filter((m) => m.type === 'play' && !matchesTop(s, s.players.find((p) => p.id === m.player)!.hand.find((c) => c.id === m.cardId)!));
    if (safe.length > 0) return safe[randomInt(agent, safe.length)]!;
  }
  return all[randomInt(agent, all.length)]!;
}

function simulate(players: number, seed: number) {
  const agent = createSeededRng(seed);
  let s = createGame(Array.from({ length: players }, (_, i) => `p${i + 1}`), createSeededRng(seed ^ 0x9e3779b9));
  let moves = 0;
  while (s.phase !== 'gameOver') {
    if (moves++ > MAX_MOVES) throw new Error(`Game did not finish (players=${players}, seed=${seed})`);
    const move = chooseMove(s, agent);
    const r = applyMove(s, move);
    if (!r.ok) throw new Error(`Legal move rejected: ${JSON.stringify(move)} -> ${r.code}`);
    s = r.state;
    // Every card is somewhere, exactly once.
    const ids = [...s.circle.flatMap((c) => (c ? [c] : [])), ...s.pile, ...s.outOfPlay, ...s.players.flatMap((p) => p.hand)].map((c) => c.id);
    expect(new Set(ids).size).toBe(52);
    expect(ids).toHaveLength(52);
    // Nobody with a place holds cards.
    expect(s.players.filter((p) => p.status !== 'active').every((p) => p.hand.length === 0)).toBe(true);
    const viewer = s.players[moves % players]!;
    expect(getPlayerView(s, viewer.id).hand).toEqual(viewer.hand);
  }
  // Everyone has exactly one place.
  expect(s.ranking!.flat().sort()).toEqual(s.players.map((p) => p.id).sort());
  expect(s.ranking!.slice(0, s.places.length)).toEqual(s.places);
  if (s.left.length > 0) expect(s.ranking!.slice(-s.left.length).flat()).toEqual(s.left.slice().reverse());
  return { moves, ranking: s.ranking, deadlocked: s.deadlocked };
}

describe('Simulated games', () => {
  for (let players = 2; players <= 10; players++) {
    it(`give everyone a place (${players} players, 60 seeds)`, () => {
      for (let seed = 1; seed <= 60; seed++) simulate(players, seed * 7919 + players);
    });
  }

  it('are deterministic for a given seed', () => {
    expect(simulate(5, 42)).toEqual(simulate(5, 42));
  });
});
