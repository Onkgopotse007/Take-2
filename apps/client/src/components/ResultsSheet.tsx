import type { PlayerView } from '@take2/engine';
import type { Namer } from '../lib/feed';
import { ResultsList } from './Results';

interface Props {
  view: PlayerView;
  who: Namer;
  secondsLeft: number | null;
  isHost: boolean;
  hostName: string;
  onPlayAgain(): void;
  onLeave(): void;
}

export function ResultsSheet({ view, who, secondsLeft, isHost, hostName, onPlayAgain, onLeave }: Props) {
  const over = view.phase === 'gameOver';
  const checker = view.roundResult?.checker;
  const title = over
    ? view.winner === view.me
      ? 'You win!'
      : `${who(view.winner!)} wins!`
    : checker
      ? `${who(checker)} checked`
      : 'Round over';
  return (
    <>
      <div className="scrim" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="results-title">{title}</h2>
        <ResultsList view={view} who={who} />
        {over ? (
          <>
            {isHost ? (
              <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
                Play again
              </button>
            ) : (
              <p>Waiting for {hostName} to start a new game.</p>
            )}
            <button type="button" className="btn-link" onClick={onLeave}>
              Leave table
            </button>
          </>
        ) : (
          <p role="timer">{secondsLeft !== null ? `Next round in ${secondsLeft}s` : 'Next round soon'}</p>
        )}
      </section>
    </>
  );
}
