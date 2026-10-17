import { useEffect, useState } from 'react';
import { initials } from '../lib/layout';

export interface SeatInfo {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  eliminated: boolean;
  onAir: boolean;
}

interface Props {
  seat: SeatInfo;
  left: number;
  top: number;
  compact: boolean;
  isTurn: boolean;
  secondsLeft: number | null;
  /** Something they just said, e.g. "1 card!". */
  speech: string | null;
  canCallOut: boolean;
  onCallOut(id: string): void;
}

const MAX_BACKS = 8;

export function Seat({ seat, left, top, compact, isTurn, secondsLeft, speech, canCallOut, onCallOut }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!canCallOut) setOpen(false);
  }, [canCallOut]);

  const shown = Math.min(seat.cardCount, MAX_BACKS);
  const status = seat.eliminated ? 'out' : !seat.connected ? 'away' : seat.onAir ? 'on air' : null;
  const cls = `seat${compact ? ' compact' : ''}${seat.eliminated ? ' out' : ''}${!seat.connected ? ' away' : ''}`;
  // Keep the bubble on screen for seats near the edges.
  const bubbleShift = left < 30 ? 0 : left > 70 ? -106 : -53;

  return (
    <div className={cls} style={{ left: `${left}%`, top: `${top}%` }}>
      {speech && <span className="speech">{speech}</span>}
      <button
        type="button"
        className={`avatar${isTurn ? ' turn' : ''}`}
        aria-label={`${seat.name}, ${seat.cardCount} ${seat.cardCount === 1 ? 'card' : 'cards'}${canCallOut ? '. Tap to call out.' : ''}`}
        aria-expanded={canCallOut ? open : undefined}
        onClick={() => canCallOut && setOpen((o) => !o)}
      >
        {initials(seat.name)}
        {isTurn && secondsLeft !== null && <span className="secs">{secondsLeft}</span>}
      </button>
      <span className="seat-name">{seat.name}</span>
      <span className="backs" aria-hidden="true">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="back-mini" />
        ))}
        {seat.cardCount > MAX_BACKS && <span className="backs-more">+{seat.cardCount - MAX_BACKS}</span>}
      </span>
      {status && <span className="seat-tag">{status}</span>}
      {open && (
        <div className="bubble" style={{ left: bubbleShift }} role="dialog" aria-label={`Call out ${seat.name}`}>
          <span>Call out {seat.name}?</span>
          <div className="row">
            <button
              type="button"
              className="go"
              onClick={() => {
                setOpen(false);
                onCallOut(seat.id);
              }}
            >
              Call out
            </button>
            <button type="button" className="stop" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
