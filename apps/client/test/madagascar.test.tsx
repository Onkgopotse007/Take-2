import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MadagascarResults } from '../src/components/madagascar/Results';
import { Oval } from '../src/components/madagascar/Oval';
import { madagascarEventText } from '../src/lib/feed';
import { gameFor } from '../src/lib/game';

afterEach(cleanup);

const who = (id: string, asObject = false) => ({ a: asObject ? 'you' : 'You', b: 'Neo', c: 'Kago', d: 'Lesedi' })[id] ?? id;

describe('Which game', () => {
  it('shows Madagascar on its own address and Take 2 everywhere else', () => {
    expect(gameFor('madagascar.code-crunchers.com')).toBe('madagascar');
    expect(gameFor('madagascar.localhost')).toBe('madagascar');
    expect(gameFor('take2.code-crunchers.com')).toBe('take2');
    expect(gameFor('localhost')).toBe('take2');
  });
});

describe('The oval', () => {
  it('turns the tapped card on my turn, and only shows cards still face down', async () => {
    const onTurn = vi.fn();
    render(<Oval slots={[true, false, true]} canTurn onTurn={onTurn} onBlocked={() => {}} />);
    const cards = screen.getAllByRole('button', { name: /Face-down card/ });
    expect(cards).toHaveLength(2);
    expect(screen.getByRole('group', { name: '2 face-down cards' })).toBeInTheDocument();
    await userEvent.click(cards[1]!);
    expect(onTurn).toHaveBeenCalledWith(2);
  });

  it('says to wait when it is not my turn', async () => {
    const onTurn = vi.fn();
    const onBlocked = vi.fn();
    render(<Oval slots={[true]} canTurn={false} onTurn={onTurn} onBlocked={onBlocked} />);
    await userEvent.click(screen.getByRole('button', { name: /Face-down card/ }));
    expect(onTurn).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalled();
  });
});

describe('Madagascar results', () => {
  const base = { me: 'a', hand: [], phase: 'gameOver', circle: [], topCard: null, pileCount: 3, turn: { kind: 'none' }, direction: 1, places: [], deadlocked: false };
  const props = { who, isHost: true, hostName: 'You', onPlayAgain: () => {}, onLeave: () => {}, tally: [] };

  it('lists everyone by place, with shared places and leavers marked', () => {
    const view = {
      ...base,
      ranking: [['a', 'b'], ['c'], ['d']],
      players: [
        { id: 'a', cardCount: 0, status: 'finished' },
        { id: 'b', cardCount: 0, status: 'finished' },
        { id: 'c', cardCount: 5, status: 'active' },
        { id: 'd', cardCount: 0, status: 'left' },
      ],
    };
    render(<MadagascarResults view={view as never} {...props} />);
    expect(screen.getByRole('heading', { name: 'You share 1st!' })).toBeInTheDocument();
    const rows = [...screen.getByRole('list', { name: 'Places' }).querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toEqual(['1stYou', '1stNeo', '3rdKago5 cards', '4thLesedileft']);
  });

  it('explains a deadlock and names a single winner', () => {
    const view = {
      ...base,
      deadlocked: true,
      ranking: [['b'], ['a']],
      players: [
        { id: 'a', cardCount: 4, status: 'active' },
        { id: 'b', cardCount: 2, status: 'active' },
      ],
    };
    render(<MadagascarResults view={view as never} {...props} isHost={false} hostName="Neo" />);
    expect(screen.getByRole('heading', { name: 'Neo wins!' })).toBeInTheDocument();
    expect(screen.getByText(/stuck on one card/)).toBeInTheDocument();
    expect(screen.getByText('Waiting for Neo to start a new game.')).toBeInTheDocument();
  });
});

describe('Madagascar toasts', () => {
  it('calls out matches, the change of phase and places', () => {
    expect(madagascarEventText({ type: 'pickedUp', player: 'b', count: 1 }, who)).toBe('Neo matched and took 1 card');
    expect(madagascarEventText({ type: 'handsPhase' }, who)).toBe('The oval is empty. Play from your hands!');
    expect(madagascarEventText({ type: 'finished', player: 'a', place: 2 }, who)).toBe('You finish 2nd');
    expect(madagascarEventText({ type: 'finished', player: 'c', place: 1 }, who)).toBe('Kago finishes 1st');
  });
});
