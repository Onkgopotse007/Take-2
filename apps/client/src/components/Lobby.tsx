import { useState } from 'react';
import type { TableSnapshot } from '@take2/server/protocol';
import { initials } from '../lib/layout';
import { shareTable } from '../lib/share';
import { HowToList } from './HowTo';
import { MmaTNote, MmaTRulesList, NoEliminationRulesList, RulesPicker, type TableRules } from './Rules';

interface Props {
  snapshot: TableSnapshot;
  onStart(): void;
  onSetRules(rules: TableRules): void;
  onLeave(): void;
}

export function Lobby({ snapshot, onStart, onSetRules, onLeave }: Props) {
  const [note, setNote] = useState('');
  const isHost = snapshot.hostId === snapshot.you;
  const host = snapshot.seats.find((s) => s.id === snapshot.hostId);
  const enough = snapshot.seats.length >= 2;
  const rules: TableRules = { mode: snapshot.mode, noElimination: snapshot.noElimination };

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

      <section className="field" aria-labelledby="lobby-rules">
        <h2 id="lobby-rules" style={{ margin: 0, fontSize: 18 }}>
          Rules
        </h2>
        <RulesPicker rules={rules} isHost={isHost} onChange={onSetRules} />
      </section>

      {snapshot.mode === 'mmaT' && (
        <section className="tips-card" aria-labelledby="lobby-mma-t">
          <h2 id="lobby-mma-t">Mma T's house rules</h2>
          <MmaTNote />
          <MmaTRulesList noElimination={rules.noElimination} />
        </section>
      )}

      {rules.noElimination && (
        <section className="tips-card" aria-labelledby="lobby-no-elimination">
          <h2 id="lobby-no-elimination">No elimination</h2>
          <NoEliminationRulesList />
        </section>
      )}

      <section className="tips-card" aria-labelledby="lobby-howto">
        <h2 id="lobby-howto">How to play here</h2>
        <HowToList />
      </section>

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
