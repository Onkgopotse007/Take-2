import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cardFromId } from '@take2/engine';
import { CardFace } from '../src/components/Card';
import { DirectionArrows } from '../src/components/DirectionArrows';
import { Hand } from '../src/components/Hand';
import { Seat } from '../src/components/Seat';
import { SuitSheet } from '../src/components/SuitSheet';
import { TossSheet } from '../src/components/TossSheet';
import { ResultsSheet } from '../src/components/ResultsSheet';
import { RulesPicker } from '../src/components/Rules';

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

  it('labels the lifted card so the second tap is obvious', async () => {
    setup();
    expect(screen.queryByText('Tap to play')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '9 of hearts' }));
    const tag = screen.getByText('Tap to play');
    // The tag must not be part of a card, or it could catch taps meant for the card next to it.
    expect(tag.closest('button')).toBeNull();
    expect(screen.getByRole('button', { name: '9 of hearts' }).className).toBe('hand-card selected');
  });

  it('lifts a just-picked card straight away, so one tap plays it', async () => {
    const onPlay = vi.fn();
    render(<Hand cards={['9H', '6H'].map(cardFromId)} playable={new Set(['6H'])} onPlay={onPlay} onEight={() => {}} onStatus={() => {}} autoSelect="6H" />);
    expect(screen.getByRole('button', { name: '6 of hearts' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '6 of hearts' }));
    expect(onPlay).toHaveBeenCalledWith('6H');
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
  const who = (id: string, asObject = false) => ({ a: asObject ? 'you' : 'You', b: 'Neo', c: 'Kago' })[id] ?? id;
  const rules = { rules: { mode: 'classic' as const, noElimination: false }, onSetRules: () => {}, tally: [] };

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
      <ResultsSheet view={view as never} who={who} secondsLeft={null} isHost hostName="You" onPlayAgain={onPlayAgain} onLeave={() => {}} {...rules} />,
    );
    expect(screen.getByRole('heading', { name: 'Neo wins!' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onPlayAgain).toHaveBeenCalled();
    rerender(<ResultsSheet view={view as never} who={who} secondsLeft={null} isHost={false} hostName="Neo" onPlayAgain={onPlayAgain} onLeave={() => {}} {...rules} />);
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(screen.getByText('Waiting for Neo to start a new game.')).toBeInTheDocument();
  });

  it("says nobody wins a void game under Mma T's rules, and keeps the tally", () => {
    const view = {
      ...base,
      mode: 'mmaT',
      phase: 'gameOver',
      winner: null,
      voided: true,
      contender: 'a',
      roundResult: { ...base.roundResult, outcomes: { b: 'checked', a: 'eliminated', c: 'survived' } },
    };
    render(
      <ResultsSheet view={view as never} who={who} secondsLeft={null} isHost hostName="You" onPlayAgain={() => {}} onLeave={() => {}} {...rules} tally={[{ id: 'b', wins: 2 }]} />,
    );
    expect(screen.getByRole('heading', { name: 'Nobody wins' })).toBeInTheDocument();
    expect(screen.getByText('Neo checked before you could put everyone out.')).toBeInTheDocument();
    // Nobody is out in a void game: points only.
    expect(screen.queryByText(/^Out/)).toBeNull();
    expect(screen.getByLabelText('Wins at this table')).toHaveTextContent('Neo2');
  });

  it('tells everyone who is going for the win between rounds', () => {
    const view = { ...base, mode: 'mmaT', phase: 'roundOver', contender: 'b', voided: false };
    render(<ResultsSheet view={view as never} who={who} secondsLeft={5} isHost hostName="You" onPlayAgain={() => {}} onLeave={() => {}} {...rules} />);
    expect(screen.getByText(/Neo is going for the win/)).toBeInTheDocument();
  });

  it('ranks everyone at the end of a no-elimination game, with leavers marked', () => {
    const view = {
      ...base,
      noElimination: true,
      phase: 'gameOver',
      winner: 'b',
      roundResult: null,
      finished: ['b', 'a'],
      ranking: ['b', 'a', 'c'],
      players: [
        { id: 'a', cardCount: 0, status: 'finished', onAir: false },
        { id: 'b', cardCount: 0, status: 'finished', onAir: false },
        { id: 'c', cardCount: 0, status: 'eliminated', onAir: false },
      ],
    };
    render(<ResultsSheet view={view as never} who={who} secondsLeft={null} isHost hostName="You" onPlayAgain={() => {}} onLeave={() => {}} {...rules} />);
    expect(screen.getByRole('heading', { name: 'Neo wins!' })).toBeInTheDocument();
    const places = screen.getByRole('list', { name: 'Places' });
    expect([...places.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['1stNeo', '2ndYou', '3rdKagoleft']);
  });
});

describe('Card faces', () => {
  it('shows the suit under the number in the corner, the part still visible in a crowded hand', () => {
    const { container } = render(<CardFace card={cardFromId('7S')} />);
    const index = container.querySelector('.index')!;
    expect(index.querySelector('.rank')!.textContent).toBe('7');
    expect(index.querySelector('.suit')!.textContent).toContain('♠');
  });

  it('marks a Joker in the corner too', () => {
    const { container } = render(<CardFace card={cardFromId('JKR')} />);
    expect(container.querySelector('.index svg')).not.toBeNull();
  });
});

describe('DirectionArrows', () => {
  it('says which way play goes, and draws four arrows', () => {
    const { container, rerender } = render(<DirectionArrows direction={1} />);
    expect(screen.getByRole('img', { name: 'Play goes clockwise' })).toBeInTheDocument();
    expect(container.querySelectorAll('path[marker-end]')).toHaveLength(4);
    rerender(<DirectionArrows direction={-1} />);
    expect(screen.getByRole('img', { name: 'Play goes anticlockwise' })).toBeInTheDocument();
  });
});

describe('Seat places', () => {
  it('shows the place of a player who has finished', () => {
    render(
      <Seat
        seat={{ id: 'b', name: 'Neo', cardCount: 0, connected: true, eliminated: false, onAir: false, place: 2 }}
        left={50}
        top={20}
        compact={false}
        isTurn={false}
        secondsLeft={null}
        speech={null}
        canCallOut={false}
        onCallOut={() => {}}
      />,
    );
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finished 2nd/ })).toBeInTheDocument();
  });
});

describe('Rules', () => {
  it('lets the host choose the rules', async () => {
    const onChange = vi.fn();
    render(<RulesPicker rules={{ mode: 'classic', noElimination: false }} isHost onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Classic/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /Mma T's house rules/ }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'mmaT', noElimination: false });
  });

  it('lets the host switch no elimination on with either set of rules', async () => {
    const onChange = vi.fn();
    render(<RulesPicker rules={{ mode: 'mmaT', noElimination: false }} isHost onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: /No elimination/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ mode: 'mmaT', noElimination: true });
  });

  it('only shows the rules to everyone else', () => {
    const { rerender } = render(<RulesPicker rules={{ mode: 'mmaT', noElimination: false }} isHost={false} onChange={() => {}} />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText("Mma T's house rules")).toBeInTheDocument();
    rerender(<RulesPicker rules={{ mode: 'mmaT', noElimination: true }} isHost={false} onChange={() => {}} />);
    expect(screen.getByText("Mma T's house rules, no elimination")).toBeInTheDocument();
  });

  it('plays a last 8 straight away when it ends the round', async () => {
    const onPlay = vi.fn();
    const onEight = vi.fn();
    render(<Hand cards={[cardFromId('8C')]} playable={new Set(['8C'])} onPlay={onPlay} onEight={onEight} onStatus={() => {}} eightNeedsSuit={false} />);
    const eight = screen.getByRole('button', { name: '8 of clubs' });
    await userEvent.click(eight);
    await userEvent.click(eight);
    expect(onPlay).toHaveBeenCalledWith('8C');
    expect(onEight).not.toHaveBeenCalled();
  });
});
