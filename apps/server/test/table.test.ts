import { describe, expect, it } from 'vitest';
import { cardFromId, createSeededRng, leadFromCard, type GameState, type Turn } from '@take2/engine';
import type { ServerMessages } from '../src/protocol';
import { DEFAULT_TIMINGS, Table, type Outbox, type Scheduler } from '../src/table';

const T = DEFAULT_TIMINGS;

class FakeClock implements Scheduler {
  private t = 1_000_000;
  private timers: { at: number; cb: () => void; cleared: boolean }[] = [];
  now() {
    return this.t;
  }
  setTimeout(cb: () => void, ms: number) {
    const timer = { at: this.t + ms, cb, cleared: false };
    this.timers.push(timer);
    return { clear: () => void (timer.cleared = true) };
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => !x.cleared && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.cleared = true;
      this.t = due.at;
      due.cb();
    }
    this.t = end;
  }
}

type Sent = { to: string; type: keyof ServerMessages; message: unknown };

function setup(seed = 1) {
  const clock = new FakeClock();
  const sent: Sent[] = [];
  const statuses: string[] = [];
  const outbox: Outbox = { send: (to, type, message) => void sent.push({ to, type, message }) };
  const table = new Table({ code: 'ABCDE', rng: createSeededRng(seed), scheduler: clock, outbox, onStatusChange: (s) => statuses.push(s) });
  const last = <K extends keyof ServerMessages>(to: string, type: K) =>
    sent.filter((m) => m.to === to && m.type === type).at(-1)?.message as ServerMessages[K] | undefined;
  const all = <K extends keyof ServerMessages>(to: string, type: K) =>
    sent.filter((m) => m.to === to && m.type === type).map((m) => m.message as ServerMessages[K]);
  const rejected = (to: string) => last(to, 'rejected')?.code;
  return { clock, sent, statuses, table, last, all, rejected };
}

/** A seated table with an exact game position loaded. */
function withGame(hands: Record<string, string[]>, discard: string[], extra: Partial<GameState> = {}, seed = 1) {
  const t = setup(seed);
  for (const id of Object.keys(hands)) t.table.join(id, id);
  const top = cardFromId(discard.at(-1)!);
  const state: GameState = {
    players: Object.entries(hands).map(([id, h]) => ({ id, hand: h.map(cardFromId), status: 'active', callable: false })),
    phase: 'playing',
    round: 1,
    drawPile: ['QC', 'QD', 'QS', '3H', '4H', '6D'].map(cardFromId),
    discard: discard.map(cardFromId),
    turn: { kind: 'player', player: Object.keys(hands)[0]! } as Turn,
    direction: 1,
    lead: leadFromCard(top),
    penalty: 0,
    pickedCardId: null,
    tossLayouts: {},
    roundResult: null,
    winner: null,
    ...extra,
  };
  t.table.loadState(state, extra.turn?.kind === 'race' ? t.clock.now() + T.countdownMs : null);
  return t;
}

describe('Lobby', () => {
  it('seats players, makes the first one host and sends everyone a snapshot', () => {
    const { table, last } = setup();
    table.join('a', '  Thabo  ');
    table.join('b', '');
    const snap = last('a', 'table')!;
    expect(snap.code).toBe('ABCDE');
    expect(snap.hostId).toBe('a');
    expect(snap.seats.map((s) => s.name)).toEqual(['Thabo', 'Player 2']);
    expect(snap.status).toBe('lobby');
    expect(last('b', 'table')!.you).toBe('b');
  });

  it('only lets the host start, and only with 2 or more players', () => {
    const { table, rejected } = setup();
    table.join('a', 'A');
    table.start('a');
    expect(rejected('a')).toBe('NOT_ENOUGH_PLAYERS');
    table.join('b', 'B');
    table.start('b');
    expect(rejected('b')).toBe('NOT_HOST');
  });

  it('refuses an 11th player', () => {
    const { table } = setup();
    for (let i = 0; i < 10; i++) expect(table.join(`p${i}`, 'x')).toBeNull();
    expect(table.join('p10', 'x')?.code).toBe('TABLE_FULL');
  });

  it('gives the host role to the next player when the host leaves the lobby', () => {
    const { table, last } = setup();
    table.join('a', 'A');
    table.join('b', 'B');
    table.leave('a');
    expect(last('b', 'table')!.hostId).toBe('b');
    expect(last('b', 'table')!.seats.map((s) => s.id)).toEqual(['b']);
  });
});

describe('Starting a game', () => {
  it('deals, locks the table and sends each player only their own cards', () => {
    const { table, last, statuses } = setup();
    for (const id of ['a', 'b', 'c']) table.join(id, id);
    table.start('a');
    expect(statuses).toEqual(['playing']);
    expect(table.join('d', 'D')?.code).toBe('GAME_IN_PROGRESS');
    const snaps = ['a', 'b', 'c'].map((id) => last(id, 'table')!);
    for (const snap of snaps) {
      expect(snap.status).toBe('playing');
      expect(snap.game!.hand).toHaveLength(4);
      const othersCards = snaps.filter((s) => s !== snap).flatMap((s) => s.game!.hand.map((c) => c.id));
      const json = JSON.stringify(snap);
      for (const id of othersCards) expect(json).not.toContain(`"${id}"`);
    }
  });

  it('refuses starting plays before the countdown ends', () => {
    const { table, clock, last, rejected } = setup();
    for (const id of ['a', 'b', 'c']) table.join(id, id);
    table.start('a');
    const snap = last('a', 'table')!;
    expect(snap.raceOpensAt).toBe(clock.now() + T.countdownMs);
    table.move('a', { type: 'play', cardId: snap.game!.hand[0]!.id });
    expect(rejected('a')).toBe('TOO_EARLY');
  });
});

describe('Start race', () => {
  const race = () =>
    withGame({ a: ['6H', '3C'], b: ['9H', '3D'], c: ['4S', '3S'], d: ['10H', '4C'] }, ['5H'], { turn: { kind: 'race' }, direction: null });

  it('applies the first valid play after the tie window', () => {
    const t = race();
    t.clock.advance(T.countdownMs);
    t.table.move('b', { type: 'play', cardId: '9H' });
    expect(t.last('a', 'table')!.game!.topCard!.id).toBe('5H');
    t.clock.advance(T.raceTieWindowMs);
    expect(t.last('a', 'table')!.game!.topCard!.id).toBe('9H');
    expect(t.last('a', 'events')).toContainEqual({ type: 'played', player: 'b', card: cardFromId('9H') });
  });

  it('breaks near-simultaneous starts at random and tells the others', () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const t = withGame({ a: ['6H', '3C'], b: ['9H', '3D'], c: ['4S', '3S'], d: ['10H', '4C'] }, ['5H'], { turn: { kind: 'race' }, direction: null }, seed);
      t.clock.advance(T.countdownMs);
      t.table.move('b', { type: 'play', cardId: '9H' });
      t.clock.advance(T.raceTieWindowMs - 10);
      t.table.move('d', { type: 'play', cardId: '10H' });
      t.clock.advance(10);
      const top = t.last('a', 'table')!.game!.topCard!.id;
      const winner = top === '9H' ? 'b' : 'd';
      winners.add(winner);
      expect(t.rejected(winner === 'b' ? 'd' : 'b')).toBe('BEATEN_TO_IT');
    }
    expect(winners).toEqual(new Set(['b', 'd']));
  });

  it('rejects an invalid starting play straight away', () => {
    const t = race();
    t.clock.advance(T.countdownMs);
    t.table.move('a', { type: 'play', cardId: '3C' });
    expect(t.rejected('a')).toBe('NOT_A_STARTING_CARD');
  });

  it('forces a random start when nobody plays in time', () => {
    const t = race();
    t.clock.advance(T.countdownMs + T.startTimeoutMs - 1);
    expect(t.last('a', 'events')).toBeUndefined();
    t.clock.advance(1);
    expect(t.last('a', 'events')!.some((e) => e.type === 'forcedStart')).toBe(true);
  });
});

describe('Timers', () => {
  it('picks for a player who runs out of time', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H']);
    expect(t.last('a', 'table')!.deadline).toBe(t.clock.now() + T.turnTimeoutMs);
    t.clock.advance(T.turnTimeoutMs);
    expect(t.last('a', 'events')).toContainEqual({ type: 'picked', player: 'a', count: 1, reason: 'turn' });
  });

  it('keeps a playable picked card when time runs out', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H'], {
      drawPile: [cardFromId('6H')],
    });
    t.table.move('a', { type: 'pick' });
    expect(t.last('a', 'table')!.game!.pickedCardId).toBe('6H');
    t.clock.advance(T.turnTimeoutMs);
    expect(t.last('a', 'events')).toContainEqual({ type: 'passed', player: 'a' });
    expect(t.last('a', 'table')!.game!.hand.map((c) => c.id)).toEqual(['3C', '6H']);
  });

  it('gives disconnected players a much shorter turn', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H']);
    t.table.setConnected('a', false);
    t.clock.advance(T.disconnectedTurnMs);
    expect(t.last('b', 'events')).toContainEqual({ type: 'picked', player: 'a', count: 1, reason: 'turn' });
  });

  it('starts the next round after the break, with a fresh countdown', () => {
    const t = withGame({ a: ['6H'], b: ['3D'], c: ['3S'] }, ['5H']);
    t.table.move('a', { type: 'play', cardId: '6H' });
    expect(t.last('a', 'table')!.game!.phase).toBe('roundOver');
    t.clock.advance(T.roundBreakMs);
    const snap = t.last('a', 'table')!;
    expect(snap.game!.round).toBe(2);
    expect(snap.raceOpensAt).toBe(t.clock.now() + T.countdownMs);
  });

  it('tosses at random for a player who runs out of time', () => {
    const t = withGame({ a: ['6H'], b: ['10D', '5S'], c: ['3S'] }, ['5H']);
    t.table.move('a', { type: 'play', cardId: '6H' });
    expect(t.last('b', 'table')!.game!.phase).toBe('toss');
    expect(t.last('b', 'table')!.game!.myTossCards).toBe(4);
    t.clock.advance(T.tossTimeoutMs);
    expect(t.last('b', 'events')!.some((e) => e.type === 'tossResolved' && e.player === 'b')).toBe(true);
  });
});

describe('Messages', () => {
  it('rejects malformed and server-only moves', () => {
    const t = withGame({ a: ['3C'], b: ['3D'] }, ['5H']);
    for (const bad of [null, 'pick', { type: 'nextRound' }, { type: 'forceStart' }, { type: 'play' }, { type: 'toss', picks: [1] }]) {
      t.table.move('a', bad);
      expect(t.rejected('a')).toBe('BAD_MESSAGE');
    }
  });

  it('passes engine rejections back with a reason', () => {
    const t = withGame({ a: ['3C'], b: ['3D'] }, ['5H']);
    t.table.move('b', { type: 'pick' });
    expect(t.last('b', 'rejected')).toEqual({ code: 'NOT_YOUR_TURN', reason: 'It is not your turn.' });
  });

  it('never tells players who can be called out', () => {
    const t = withGame({ a: ['6H', '9H', '3C'], b: ['3D', '4D'], c: ['3S', '4S'] }, ['5H']);
    t.table.move('a', { type: 'play', cardId: '6H' }); // down to 2 without announcing
    const json = JSON.stringify(t.last('b', 'table'));
    expect(json).not.toContain('callable');
    t.table.move('b', { type: 'callOut', target: 'a' });
    expect(t.last('b', 'events')).toContainEqual({ type: 'calledOut', player: 'b', target: 'a' });
  });

  it('sets the player from the connection, not the message', () => {
    const t = withGame({ a: ['3C'], b: ['3D'] }, ['5H']);
    t.table.move('b', { type: 'pick', player: 'a' });
    expect(t.rejected('b')).toBe('NOT_YOUR_TURN');
  });
});

describe('Missed turns', () => {
  it('forfeits a player after 3 timed-out turns in a row', () => {
    const t = withGame({ a: ['3C', '4C'], b: ['3D', '4D'], c: ['3S', '4S'] }, ['5H'], {
      drawPile: Array.from({ length: 20 }, () => cardFromId('QC')),
    });
    // a times out; b and c pick each time, which counts as acting.
    for (let round = 0; round < 2; round++) {
      t.clock.advance(T.turnTimeoutMs);
      t.table.move('b', { type: 'pick' });
      t.table.move('c', { type: 'pick' });
    }
    expect(t.last('b', 'table')!.game!.players.find((p) => p.id === 'a')!.status).toBe('active');
    t.clock.advance(T.turnTimeoutMs);
    expect(t.last('b', 'events')).toContainEqual({ type: 'forfeited', player: 'a', reason: 'missedTurns' });
    expect(t.last('b', 'table')!.game!.players.find((p) => p.id === 'a')!.status).toBe('eliminated');
  });

  it('resets the count whenever the player acts', () => {
    const t = withGame({ a: ['3C', '4C'], b: ['3D', '4D'], c: ['3S', '4S'] }, ['5H'], {
      drawPile: Array.from({ length: 20 }, () => cardFromId('QC')),
    });
    for (let round = 0; round < 4; round++) {
      if (round === 2) t.table.move('a', { type: 'pick' });
      else t.clock.advance(T.turnTimeoutMs);
      t.table.move('b', { type: 'pick' });
      t.table.move('c', { type: 'pick' });
    }
    expect(t.last('b', 'table')!.game!.players.find((p) => p.id === 'a')!.status).toBe('active');
  });
});

describe('Seat keys', () => {
  it('gives each player a private key that reclaims their seat mid-game', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H']);
    const key = t.last('b', 'table')!.seatKey!;
    expect(key).toHaveLength(24);
    expect(JSON.stringify(t.last('a', 'table'))).not.toContain(key);
    t.table.setConnected('b', false);
    expect(t.table.reclaim('wrong')).toBeNull();
    expect(t.table.reclaim(key)).toBe('b');
    expect(t.last('a', 'table')!.seats.find((s) => s.id === 'b')!.connected).toBe(true);
  });
});

describe('Leaving and rematches', () => {
  it('forfeits a player who chooses to leave mid-game', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H']);
    t.table.leave('b', true);
    expect(t.last('a', 'events')).toContainEqual({ type: 'forfeited', player: 'b', reason: 'left' });
  });

  it('keeps a leaving player seated during a game', () => {
    const t = withGame({ a: ['3C'], b: ['3D'], c: ['3S'] }, ['5H']);
    t.table.leave('a');
    const seats = t.last('b', 'table')!.seats;
    expect(seats.find((s) => s.id === 'a')).toMatchObject({ connected: false });
    expect(t.last('b', 'table')!.hostId).toBe('b');
  });

  it('lets the host start a rematch once the game has finished, without players who left', () => {
    // a checks; b and c are both over 15, so a wins outright.
    const t = withGame({ a: ['6H'], b: ['JKR'], c: ['8S', '8C'] }, ['5H']);
    t.table.leave('c');
    t.table.move('a', { type: 'play', cardId: '6H' });
    expect(t.table.status).toBe('finished');
    expect(t.last('b', 'table')!.game!.winner).toBe('a');
    expect(t.statuses).toEqual(['finished']);
    t.table.start('a');
    const snap = t.last('b', 'table')!;
    expect(snap.status).toBe('playing');
    expect(snap.seats.map((s) => s.id)).toEqual(['a', 'b']);
    expect(snap.game!.round).toBe(1);
    expect(snap.game!.players.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
