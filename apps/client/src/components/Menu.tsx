import { useState } from 'react';
import { shareTable } from '../lib/share';
import { HowToSheet } from './HowTo';

export function Menu({ code, onClose, onLeave }: { code: string; onClose(): void; onLeave(): void }) {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [howTo, setHowTo] = useState(false);
  if (howTo) return <HowToSheet onClose={() => setHowTo(false)} />;
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
        <button type="button" className="btn" onClick={() => setHowTo(true)}>
          How to play
        </button>
        {confirming ? (
          <>
            <p>Leave this table? Leaving during a game counts as forfeiting it.</p>
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
