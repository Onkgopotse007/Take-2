/** Full games played by random agents with seeded RNGs. */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createGame,
  createSeededRng,
  getLegalMoves,
  getPlayerView,
  randomInt,
  type GameState,
  type Move,
  type Rng,
} from '../src';

const MAX_MOVES = 50_000;

interface Outcome {
  winner: string;
  moves: number;
  rounds: number;
}

function assertCardsConserved(s: GameState): void {
  if (s.phase !== 'playing') return;
  const ids = [...s.drawPile, ...s.discard, ...s.players.filter((p) => p.status === 'active').flatMap((p) => p.hand)].map((c) => c.id);
  expect(ids).toHaveLength(54);
  expect(new Set(ids).size).toBe(54);
}

function chooseMove(s: GameState, agent: Rng): Move | undefined {
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  const all = s.players.flatMap((p) => getLegalMoves(s, p.id));
  // The server's start timer: fires when nobody can start, and sometimes when nobody does.
  if (s.turn.kind === 'race' && (all.length === 0 || agent.next() < 0.1)) return { type: 'forceStart' };
  if (all.length === 0) return undefined;
  const plays = all.filter((m) => m.type === 'play');
  const callOuts = all.filter((m) => m.type === 'callOut');
  if (callOuts.length > 0 && agent.next() < 0.5) return callOuts[randomInt(agent, callOuts.length)];
  const pool = plays.length > 0 && agent.next() < 0.85 ? plays : all.filter((m) => m.type !== 'callOut');
  const move = pool[randomInt(agent, pool.length)]!;
  // Agents usually remember to announce.
  return move.type === 'play' ? { ...move, announce: agent.next() < 0.8 } : move;
}

function simulate(players: number, seed: number): Outcome {
  const rng = createSeededRng(seed);
  const agent = createSeededRng(seed ^ 0x9e3779b9);
  let s = createGame(
    Array.from({ length: players }, (_, i) => `p${i + 1}`),
    rng,
  );
  let moves = 0;
  while (s.phase !== 'gameOver') {
    if (moves++ > MAX_MOVES) throw new Error(`Game did not finish (players=${players}, seed=${seed})`);
    const move = chooseMove(s, agent);
    if (!move) throw new Error(`No legal move (players=${players}, seed=${seed}, phase=${s.phase})`);
    const result = applyMove(s, move, rng);
    if (!result.ok) throw new Error(`Legal move rejected: ${JSON.stringify(move)} -> ${result.code}`);
    s = result.state;
    assertCardsConserved(s);
    // Hidden information: a view never contains another player's cards.
    const viewer = s.players[moves % s.players.length]!;
    const view = getPlayerView(s, viewer.id);
    expect(view.hand).toEqual(viewer.hand);
    expect(JSON.stringify(view)).not.toContain('"drawPile"');
  }
  expect(s.players.filter((p) => p.status === 'active').map((p) => p.id)).toEqual([s.winner]);
  return { winner: s.winner!, moves, rounds: s.round };
}

describe('Simulated games', () => {
  for (let players = 2; players <= 10; players++) {
    it(`finish with a single winner (${players} players, 40 seeds)`, () => {
      for (let seed = 1; seed <= 40; seed++) simulate(players, seed * 7919 + players);
    });
  }

  it('are deterministic for a given seed', () => {
    expect(simulate(5, 42)).toEqual(simulate(5, 42));
    expect(simulate(8, 1234)).toEqual(simulate(8, 1234));
  });
});
