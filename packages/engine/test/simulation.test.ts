/** Full games played by random agents with seeded RNGs. */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createGame,
  createSeededRng,
  getLegalMoves,
  getPlayerView,
  randomInt,
  type GameMode,
  type GameState,
  type Move,
  type Rng,
} from '../src';

const MAX_MOVES = 50_000;

interface Outcome {
  winner: string | null;
  moves: number;
  rounds: number;
}

function assertCardsConserved(s: GameState): void {
  if (s.phase !== 'playing') return;
  const deckSize = s.mode === 'classic' ? 54 : 52;
  const ids = [...s.drawPile, ...s.discard, ...s.players.filter((p) => p.status === 'active').flatMap((p) => p.hand)].map((c) => c.id);
  expect(ids).toHaveLength(deckSize);
  expect(new Set(ids).size).toBe(deckSize);
}

function chooseMove(s: GameState, agent: Rng): Move | undefined {
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  // Now and then someone walks away from the table.
  if (agent.next() < 0.002) {
    const active = s.players.filter((p) => p.status === 'active');
    return { type: 'forfeit', player: active[randomInt(agent, active.length)]!.id, reason: 'left' };
  }
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

function simulate(players: number, seed: number, mode: GameMode = 'classic', noElimination = false): Outcome {
  const rng = createSeededRng(seed);
  const agent = createSeededRng(seed ^ 0x9e3779b9);
  let s = createGame(
    Array.from({ length: players }, (_, i) => `p${i + 1}`),
    rng,
    { mode, noElimination },
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
  if (s.noElimination) {
    // One round, and everyone has a place: checkers in order, then the last player, then leavers.
    expect(s.round).toBe(1);
    expect(s.voided).toBe(false);
    expect([...s.ranking!].sort()).toEqual(s.players.map((p) => p.id).sort());
    expect(s.ranking!.slice(0, s.finished.length)).toEqual(s.finished);
    expect(s.ranking!.slice(s.players.length - s.left.length)).toEqual(s.left.slice().reverse());
    expect(s.winner).toBe(s.ranking![0]);
    expect(s.players.filter((p) => p.status === 'active')).toHaveLength(s.players.length - s.finished.length - s.left.length);
  } else if (s.voided) {
    expect(s.winner).toBeNull();
    expect(s.contender).not.toBeNull();
  } else {
    expect(s.players.filter((p) => p.status === 'active').map((p) => p.id)).toEqual([s.winner]);
    // Mma T's rules: only the first checker can win (unless everyone else left before anyone checked).
    if (s.mode === 'mmaT' && s.contender) expect(s.winner).toBe(s.contender);
  }
  return { winner: s.winner, moves, rounds: s.round };
}

describe('Simulated games', () => {
  for (let players = 2; players <= 10; players++) {
    it(`finish with a single winner (${players} players, 40 seeds)`, () => {
      for (let seed = 1; seed <= 40; seed++) simulate(players, seed * 7919 + players);
    });
  }

  for (let players = 2; players <= 10; players++) {
    it(`finish with a single winner or a void game under Mma T's rules (${players} players, 30 seeds)`, () => {
      const results = Array.from({ length: 30 }, (_, i) => simulate(players, (i + 1) * 104_729 + players, 'mmaT'));
      expect(results.every((r) => r.rounds >= 1)).toBe(true);
    });
  }

  for (const mode of ['classic', 'mmaT'] as const) {
    for (let players = 2; players <= 10; players++) {
      it(`rank every player with no elimination, ${mode} (${players} players, 30 seeds)`, () => {
        for (let i = 1; i <= 30; i++) simulate(players, i * 15_485_863 + players, mode, true);
      });
    }
  }

  it('are deterministic for a given seed', () => {
    expect(simulate(5, 42)).toEqual(simulate(5, 42));
    expect(simulate(8, 1234)).toEqual(simulate(8, 1234));
  });
});
