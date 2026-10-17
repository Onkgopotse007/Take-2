import type { PlayerView, RoundOutcome } from '@take2/engine';
import type { Namer } from '../lib/feed';
import { CardFace } from './Card';

const VERDICT: Record<RoundOutcome, string> = {
  checked: 'Checked',
  survived: 'Stays in',
  eliminated: 'Out',
  toss: 'Tossing',
};

/** Everyone's revealed hand and what it means for them this round. */
export function ResultsList({ view, who }: { view: PlayerView; who: Namer }) {
  const result = view.roundResult;
  if (!result) return null;
  const ids = view.players.map((p) => p.id).filter((id) => result.outcomes[id]);
  ids.sort((a, b) => (a === result.checker ? -1 : b === result.checker ? 1 : 0));
  return (
    <ul className="results">
      {ids.map((id) => {
        const outcome = result.outcomes[id]!;
        const tosses = result.tosses[id] ?? [];
        return (
          <li key={id}>
            <div className="top">
              <span className="who">{who(id)}</span>
              <span className={`verdict${outcome === 'eliminated' ? ' out' : ''}`}>
                {VERDICT[outcome]}
                {result.points[id] !== undefined && `, ${result.points[id]} points`}
              </span>
            </div>
            {result.hands[id] && result.hands[id]!.length > 0 && (
              <div className="mini-cards" aria-label={`${who(id)}'s cards`}>
                {result.hands[id]!.map((c) => (
                  <CardFace key={c.id} card={c} width={30} />
                ))}
              </div>
            )}
            {tosses.map((t, i) => (
              <span key={i} style={{ fontSize: 14 }}>
                Toss {i + 1}: {t.total}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
