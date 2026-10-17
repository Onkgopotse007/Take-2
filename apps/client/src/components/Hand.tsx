import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isRank, type Card } from '@take2/engine';
import { cardName } from '../lib/cards';
import { cardStep } from '../lib/layout';
import { CardFace } from './Card';

const CARD_W = 72;

interface Props {
  cards: Card[];
  playable: Set<string>;
  /** Play a card. For an 8 this is only called once a suit has been chosen. */
  onPlay(cardId: string): void;
  /** Called on the second tap of an 8, so the suit picker can open. */
  onEight(cardId: string): void;
  onStatus(text: string): void;
  /** A card to lift straight away, e.g. the one just picked. */
  autoSelect?: string | null;
}

/** Tap a card to lift it, tap it again to play it. */
export function Hand({ cards, playable, onPlay, onEight, onStatus, autoSelect = null }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 358);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => {
    if (autoSelect) setSelected(autoSelect);
  }, [autoSelect]);

  // Forget the selection once that card has left the hand.
  const ids = cards.map((c) => c.id).join(',');
  useEffect(() => {
    if (selected && !cards.some((c) => c.id === selected)) setSelected(null);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cards.length === 0) return <p className="hand-empty">No cards in hand</p>;

  const step = cardStep(cards.length, width, CARD_W);
  const total = CARD_W + step * (cards.length - 1);

  const tap = (card: Card) => {
    if (selected !== card.id) {
      setSelected(card.id);
      onStatus(`Tap the ${cardName(card)} again to play it`);
      return;
    }
    if (isRank(card, '8')) {
      onEight(card.id);
      return;
    }
    setSelected(null);
    onPlay(card.id);
  };

  return (
    <div className="hand-scroll" ref={boxRef}>
      <div className="hand-cards" style={{ width: total }}>
        {cards.map((card, i) => {
          const isSelected = card.id === selected;
          const cls = `hand-card${isSelected ? ' selected' : playable.has(card.id) ? ' playable' : ''}`;
          return (
            <button
              key={card.id}
              type="button"
              className={cls}
              style={{ left: i * step }}
              aria-label={cardName(card)}
              aria-pressed={isSelected}
              onClick={() => tap(card)}
            >
              {isSelected && (
                <span className="play-tag" aria-hidden="true">
                  Tap to play
                </span>
              )}
              <CardFace card={card} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
