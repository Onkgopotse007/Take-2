import type { PlayerView } from '@take2/engine';
import { ordinal, type Namer } from '../lib/feed';
import { ResultsList } from './Results';
import { RulesPicker, type TableRules } from './Rules';

interface Props {
  view: PlayerView;
  who: Namer;
  secondsLeft: number | null;
  isHost: boolean;
  hostName: string;
  onPlayAgain(): void;
  onLeave(): void;
  /** Rules for the next game. */
  rules: TableRules;
  onSetRules(rules: TableRules): void;
  /** Games won at this table, most first. */
  tally: { id: string; wins: number }[];
}

export function ResultsSheet({ view, who, secondsLeft, isHost, hostName, onPlayAgain, onLeave, rules, onSetRules, tally }: Props) {
  const over = view.phase === 'gameOver';
  const checker = view.roundResult?.checker;
  const title = over
    ? view.voided
      ? 'Nobody wins'
      : view.winner === view.me
        ? 'You win!'
        : `${who(view.winner!)} wins!`
    : checker
      ? `${who(checker)} checked`
      : 'Round over';
  const contender = view.contender;
  let note: string | null = null;
  if (view.voided && contender) {
    note =
      checker && checker !== contender
        ? `${who(checker)} checked before ${who(contender, true)} could put everyone out.`
        : `${who(contender)} left before putting everyone out.`;
  } else if (!over && contender) {
    note =
      contender === view.me
        ? 'You are going for the win: keep checking until everyone is out. If anyone else checks first, nobody wins.'
        : `${who(contender)} is going for the win. Check before they do and nobody wins.`;
  }
  return (
    <>
      <div className="scrim" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="results-title">{title}</h2>
        {note && <p>{note}</p>}
        <ResultsList view={view} who={who} />
        {view.ranking && (
          <ol className="ranking" aria-label="Places">
            {view.ranking.map((id, i) => {
              const leftGame = view.players.find((p) => p.id === id)?.status === 'eliminated';
              return (
                <li key={id}>
                  <span className="place">{ordinal(i + 1)}</span>
                  <span className="who">{who(id)}</span>
                  {leftGame && <span className="muted">left</span>}
                </li>
              );
            })}
          </ol>
        )}
        {over ? (
          <>
            {tally.length > 0 && (
              <div className="tally" aria-label="Wins at this table">
                <strong>Wins at this table</strong>
                <ul>
                  {tally.map((t) => (
                    <li key={t.id}>
                      <span>{who(t.id)}</span>
                      <span>{t.wins}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isHost && <strong>Rules for the next game</strong>}
            <RulesPicker rules={rules} isHost={isHost} onChange={onSetRules} />
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
