import { useState } from 'react';
import { shareTable } from '../lib/share';

export function Menu({ code, onClose, onLeave }: { code: string; onClose(): void; onLeave(): void }) {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="grabber" aria-hidden="true" />
        <h2>Table {code}</h2>
        <button type="button" className="btn" onClick={async () => setNote(await shareTable(code))}>
          Invite people
        </button>
        {note && <p>{note}</p>}
        {confirming ? (
          <>
            <p>Leave this table? You will lose your seat in the game.</p>
            <button type="button" className="btn btn-primary" onClick={onLeave}>
              Yes, leave
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Leave table
          </button>
        )}
        <button type="button" className="btn-link" onClick={onClose}>
          Back to the game
        </button>
      </section>
    </>
  );
}
