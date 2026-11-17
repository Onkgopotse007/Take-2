import { useState, type ReactNode } from 'react';
import type { Seat } from '@take2/server/protocol';
import { initials } from '../lib/layout';
import { shareTable } from '../lib/share';

/** What the lobby shows, from either game's snapshot. */
export interface LobbySnapshot {
  code: string;
  you: string;
  hostId: string | null;
  seats: Seat[];
}

interface Props {
  snapshot: LobbySnapshot;
  onStart(): void;
  onLeave(): void;
  /** The game's own sections: its rules and how to play. */
  children: ReactNode;
}

export function Lobby({ snapshot, onStart, onLeave, children }: Props) {
  const [note, setNote] = useState('');
  const isHost = snapshot.hostId === snapshot.you;
  const host = snapshot.seats.find((s) => s.id === snapshot.hostId);
  const enough = snapshot.seats.length >= 2;

  return (
    <main className="screen">
      <div className="field centre">
        <span className="muted">Table code</span>
        <p className="code-big">{snapshot.code}</p>
        <button type="button" className="btn" onClick={async () => setNote(await shareTable(snapshot.code))}>
          Invite people
        </button>
        {note && <p className="muted">{note}</p>}
      </div>

      <section className="field">
        <h2 style={{ margin: 0, fontSize: 18 }}>At the table ({snapshot.seats.length} of 10)</h2>
        <ul className="seat-list">
          {snapshot.seats.map((s) => (
            <li key={s.id}>
              <span className="avatar" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}>
                {initials(s.name)}
              </span>
              <span style={{ flex: 1 }}>
                {s.name}
                {s.id === snapshot.you && <span className="muted"> (you)</span>}
              </span>
              {s.id === snapshot.hostId && <span className="muted">host</span>}
              {!s.connected && <span className="muted">away</span>}
            </li>
          ))}
        </ul>
      </section>

      {children}

      <div className="field" style={{ marginTop: 'auto' }}>
        {isHost ? (
          <>
            <button type="button" className="btn btn-primary" disabled={!enough} onClick={onStart}>
              Start the game
            </button>
            {!enough && <p className="muted centre">Waiting for at least one more player.</p>}
          </>
        ) : (
          <p className="muted centre">Waiting for {host?.name ?? 'the host'} to start.</p>
        )}
        <button type="button" className="btn-link" onClick={onLeave}>
          Leave table
        </button>
      </div>
    </main>
  );
}
