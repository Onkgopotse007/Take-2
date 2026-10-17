import type { CSSProperties } from 'react';
import type { Card } from '@take2/engine';
import { SUIT_GLYPH, isRed } from '../lib/cards';

const Star = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" />
  </svg>
);

export function CardFace({ card, width, style }: { card: Card; width?: number; style?: CSSProperties }) {
  const vars = { ...(width ? { '--w': `${width}px` } : {}), ...style } as CSSProperties;
  const red = isRed(card) ? ' red' : '';
  if (card.kind === 'joker') {
    return (
      <span className={`card joker${red}`} style={vars} aria-hidden="true">
        <Star size={Math.round((width ?? 72) * 0.42)} />
        <span className="word">JOKER</span>
      </span>
    );
  }
  const glyph = SUIT_GLYPH[card.suit];
  return (
    <span className={`card${red}`} style={vars} aria-hidden="true">
      <span className="rank">{card.rank}</span>
      <span className="pip">{glyph}</span>
      <span className="corner">{glyph}</span>
    </span>
  );
}

export function CardBack({ width, style }: { width?: number; style?: CSSProperties }) {
  const vars = { ...(width ? { '--w': `${width}px` } : {}), ...style } as CSSProperties;
  return <span className="card-back" style={vars} aria-hidden="true" />;
}
