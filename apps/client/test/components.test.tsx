import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cardFromId } from '@take2/engine';
import { Hand } from '../src/components/Hand';
import { Seat } from '../src/components/Seat';
import { SuitSheet } from '../src/components/SuitSheet';
import { TossSheet } from '../src/components/TossSheet';
import { ResultsSheet } from '../src/components/ResultsSheet';

afterEach(cleanup);

describe('Hand', () => {
  const setup = () => {
    const onPlay = vi.fn();
    const onEight = vi.fn();
    const onStatus = vi.fn();
    render(
      <Hand cards={['9H', '8D', 'QS'].map(cardFromId)} playable={new Set(['9H', '8D'])} onPlay={onPlay} onEight={onEight} onStatus={onStatus} />,
    );
    return { onPlay, onEight, onStatus };
  };

  it('lifts a card on the first tap and plays it on the second', async () => {
    const { onPlay, onStatus } = setup();
    const nine = screen.getByRole('button', { name: '9 of hearts' });
    await userEvent.click(nine);
    expect(nine).toHaveAttribute('aria-pressed', 'true');
    expect(onPlay).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Tap the 9 of hearts again to play it');
    await userEvent.click(nine);
    expect(onPlay).toHaveBeenCalledWith('9H');
  });

  it('moves the selection when another card is tapped', async () => {
    const { onPlay } = setup();
    await userEvent.click(screen.getByRole('button', { name: '9 of hearts' }));
    await userEvent.click(screen.getByRole('button', { name: 'queen of spades' }));
    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'queen of spades' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '9 of hearts' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for a suit on the second tap of an 8', async () => {
    const { onPlay, onEight } = setup();
    const eight = screen.getByRole('button', { name: '8 of diamonds' });
    await userEvent.click(eight);
    await userEvent.click(eight);
    expect(onEight).toHaveBeenCalledWith('8D');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('gives playable cards a faint lift', () => {
    setup();
    expect(screen.getByRole('button', { name: '9 of hearts' }).className).toContain('playable');
    expect(screen.getByRole('button', { name: 'queen of spades' }).className).not.toContain('playable');
  });
});

describe('SuitSheet', () => {
  it('returns the chosen suit', async () => {
    const onChoose = vi.fn();
    render(<SuitSheet onChoose={onChoose} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Diamonds/ }));
    expect(onChoose).toHaveBeenCalledWith('diamonds');
  });
});

describe('Seat', () => {
  const seat = { id: 'b', name: 'Mpho', cardCount: 1, connected: true, eliminated: false, onAir: false };

  it('calls out only after tapping the player and confirming', async () => {
    const onCallOut = vi.fn();
    render(<Seat seat={seat} left={50} top={10} compact={false} isTurn={false} secondsLeft={null} speech={null} canCallOut onCallOut={onCallOut} />);
    expect(screen.queryByText('Call out Mpho?')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Mpho/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Call out' }));
    expect(onCallOut).toHaveBeenCalledWith('b');
  });

  it('looks the same whether or not the player forgot to announce', () => {
    const { container } = render(
      <Seat seat={seat} left={50} top={10} compact={false} isTurn={false} secondsLeft={null} speech={null} canCallOut onCallOut={() => {}} />,
    );
    // The seat has no idea who is callable; nothing in it can hint.
    expect(container.innerHTML).not.toMatch(/callable|forgot|silent/i);
  });
});

describe('Round end screens', () => {
  const base = {
    me: 'a',
    hand: [],
    players: ['a', 'b', 'c'].map((id) => ({ id, cardCount: 1, status: id === 'c' ? 'eliminated' : 'active', onAir: false })),
    round: 1,
    topCard: cardFromId('6H'),
    drawPileCount: 20,
    discardCount: 10,
    turn: { kind: 'none' },
    direction: 1,
    lead: { suits: [], colours: [], ranks: [] },
    penalty: 0,
    pickedCardId: null,
    myTossCards: 0,
    tossing: [],
    winner: null,
    roundResult: {
      round: 1,
      checker: 'b',
      hands: { a: [cardFromId('10D'), cardFromId('5S')], c: [cardFromId('JKR')] },
      points: { a: 15, c: 50 },
      outcomes: { b: 'checked', a: 'toss', c: 'eliminated' },
      tosses: { a: [] },
    },
  } as const;
  const who = (id: string) => ({ a: 'You', b: 'Neo', c: 'Kago' })[id] ?? id;

  it('lets a tossing player pick two face-down cards', async () => {
    const onToss = vi.fn();
    render(<TossSheet view={{ ...base, phase: 'toss', myTossCards: 4, tossing: ['a'] } as never} who={who} secondsLeft={12} onToss={onToss} />);
    expect(screen.getByText(/You scored exactly 15/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Face-down card 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Face-down card 4' }));
    expect(onToss).toHaveBeenCalledWith([1, 3]);
  });

  it('shows the winner and lets only the host start again', async () => {
    const onPlayAgain = vi.fn();
    const view = { ...base, phase: 'gameOver', winner: 'b', roundResult: { ...base.roundResult, outcomes: { b: 'checked', a: 'eliminated', c: 'eliminated' } } };
    const { rerender } = render(
      <ResultsSheet view={view as never} who={who} secondsLeft={null} isHost hostName="You" onPlayAgain={onPlayAgain} onLeave={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Neo wins!' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onPlayAgain).toHaveBeenCalled();
    rerender(<ResultsSheet view={view as never} who={who} secondsLeft={null} isHost={false} hostName="Neo" onPlayAgain={onPlayAgain} onLeave={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(screen.getByText('Waiting for Neo to start a new game.')).toBeInTheDocument();
  });
});
