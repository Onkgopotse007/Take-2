import { CardBack } from '../Card';

const BACK_W = 22;

/** Where slot `i` of `n` sits on the oval, as percentages of the table area, and its tilt. */
export function ovalPosition(i: number, n: number): { left: number; top: number; deg: number } {
  const a = (2 * Math.PI * i) / n - Math.PI / 2;
  return { left: 50 + 27 * Math.cos(a), top: 52 + 29 * Math.sin(a), deg: (a * 180) / Math.PI + 90 };
}

interface Props {
  /** One entry per slot: true while it still holds a face-down card. */
  slots: boolean[];
  /** Whether I may turn a card now. */
  canTurn: boolean;
  onTurn(slot: number): void;
  onBlocked(): void;
}

/** The face-down cards spread in an oval. Any one may be turned; which one makes no difference. */
export function Oval({ slots, canTurn, onTurn, onBlocked }: Props) {
  const left = slots.filter(Boolean).length;
  return (
    <div className={`oval${canTurn ? ' ready' : ''}`} role="group" aria-label={`${left} face-down ${left === 1 ? 'card' : 'cards'}`}>
      {slots.map((filled, i) => {
        if (!filled) return null;
        const p = ovalPosition(i, slots.length);
        return (
          <button
            key={i}
            type="button"
            className="oval-card"
            style={{ left: `${p.left}%`, top: `${p.top}%`, transform: `translate(-50%, -50%) rotate(${p.deg}deg)` }}
            aria-label="Face-down card. Tap to turn it."
            aria-disabled={!canTurn}
            onClick={() => (canTurn ? onTurn(i) : onBlocked())}
          >
            <CardBack width={BACK_W} />
          </button>
        );
      })}
    </div>
  );
}
