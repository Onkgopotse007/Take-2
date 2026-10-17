import { useEffect, useRef } from 'react';
import type { Suit } from '@take2/engine';
import { SUIT_GLYPH, SUIT_NAME, SUIT_ORDER, suitIsRed } from '../lib/cards';

export function SuitSheet({ onChoose, onCancel }: { onChoose(suit: Suit): void; onCancel(): void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="suit-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="suit-title">Name the next suit</h2>
        <div className="suit-grid">
          {SUIT_ORDER.map((suit, i) => (
            <button
              key={suit}
              ref={i === 0 ? first : undefined}
              type="button"
              className={`suit-btn${suitIsRed(suit) ? ' red' : ''}`}
              onClick={() => onChoose(suit)}
            >
              <span className="glyph" aria-hidden="true">{SUIT_GLYPH[suit]}</span>
              <span className="name">{SUIT_NAME[suit]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-link" onClick={onCancel}>
          Cancel
        </button>
      </section>
    </>
  );
}
