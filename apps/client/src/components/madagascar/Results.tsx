import { placeNumbers, type MadagascarView } from '@take2/madagascar';
import { ordinal, type Namer } from '../../lib/feed';

interface Props {
  view: MadagascarView;
  who: Namer;
  isHost: boolean;
  hostName: string;
  onPlayAgain(): void;
  onLeave(): void;
  /** Games won at this table, most first. */
  tally: { id: string; wins: number }[];
}

/** Everyone's place at the end of a game. Players sharing a place are listed together. */
export function MadagascarResults({ view, who, isHost, hostName, onPlayAgain, onLeave, tally }: Props) {
  const ranking = view.ranking ?? [];
  const places = placeNumbers(ranking);
  const first = ranking[0] ?? [];
  const title =
    first.length === 0
      ? 'Game over'
      : first.includes(view.me)
        ? first.length === 1
          ? 'You win!'
          : 'You share 1st!'
        : first.length === 1
          ? `${who(first[0]!)} wins!`
          : `${first.map((id) => who(id)).join(' and ')} share 1st!`;
  const status = (id: string) => view.players.find((p) => p.id === id);

  return (
    <>
      <div className="scrim" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="results-title">{title}</h2>
        {view.deadlocked && <p>The pile was stuck on one card, so the players left were ranked by fewest cards.</p>}
        <ol className="ranking" aria-label="Places">
          {ranking.flatMap((group, g) =>
            group.map((id) => {
              const p = status(id);
              return (
                <li key={id} className={g === 0 ? 'first' : undefined}>
                  <span className="place">{ordinal(places[g]!)}</span>
                  <span className="who">{who(id)}</span>
                  {p?.status === 'left' ? (
                    <span className="muted">left</span>
                  ) : p && p.cardCount > 0 ? (
                    <span className="muted">
                      {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'}
                    </span>
                  ) : null}
                </li>
              );
            }),
          )}
        </ol>
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
      </section>
    </>
  );
}
