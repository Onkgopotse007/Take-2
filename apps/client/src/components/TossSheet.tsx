import { useEffect, useState } from 'react';
import type { PlayerView } from '@take2/engine';
import type { Namer } from '../lib/feed';
import { CardBack, CardFace } from './Card';
import { ResultsList } from './Results';

interface Props {
  view: PlayerView;
  who: Namer;
  secondsLeft: number | null;
  onToss(picks: [number, number]): void;
}

export function TossSheet({ view, who, secondsLeft, onToss }: Props) {
  const mine = view.myTossCards > 0;
  const attempts = view.roundResult?.tosses[view.me] ?? [];
  const last = attempts[attempts.length - 1];
  const [chosen, setChosen] = useState<number[]>([]);

  // A fresh layout after tossing exactly 15.
  useEffect(() => setChosen([]), [attempts.length]);

  const choose = (i: number) => {
    if (chosen.includes(i)) return setChosen(chosen.filter((c) => c !== i));
    const next = [...chosen, i];
    if (next.length === 2) {
      onToss([next[0]!, next[1]!]);
      setChosen([]);
    } else {
      setChosen(next);
    }
  };

  const waitingFor = view.tossing.filter((id) => id !== view.me);

  return (
    <>
      <div className="scrim" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="toss-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="toss-title">{mine ? 'Toss' : 'Round over'}</h2>
        {mine ? (
          <>
            <p>
              {last
                ? `You tossed exactly 15 again. Pick two more.`
                : 'You scored exactly 15. Pick two face-down cards: under 15 you stay in, over 15 you are out.'}
            </p>
            {last && (
              <div className="toss-row" aria-label="Last toss">
                {last.cards.map((c, i) => (
                  <span key={i} style={{ opacity: last.picked.includes(i) ? 1 : 0.4 }}>
                    <CardFace card={c} width={50} />
                  </span>
                ))}
              </div>
            )}
            <div className="toss-row">
              {Array.from({ length: view.myTossCards }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`toss-card${chosen.includes(i) ? ' chosen' : ''}`}
                  aria-label={`Face-down card ${i + 1}`}
                  aria-pressed={chosen.includes(i)}
                  onClick={() => choose(i)}
                >
                  <CardBack />
                </button>
              ))}
            </div>
            {secondsLeft !== null && <p role="timer">{secondsLeft}s left</p>}
          </>
        ) : (
          <p>Waiting for {waitingFor.map((id) => who(id)).join(' and ')} to toss.</p>
        )}
        <ResultsList view={view} who={who} />
      </section>
    </>
  );
}
