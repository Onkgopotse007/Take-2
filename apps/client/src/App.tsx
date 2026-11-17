import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MadagascarSnapshot, TableSnapshot } from '@take2/server/protocol';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { MadagascarTable, type MadagascarSession } from './components/madagascar/MadagascarTable';
import { MadagascarHowToList, MadagascarNote, MadagascarRulesList } from './components/madagascar/Rules';
import { Table } from './components/Table';
import { Take2Lobby } from './components/Take2Lobby';
import { GAME, GAME_NAME } from './lib/game';
import { CODE_PATTERN, loadName, normaliseCode, saveName } from './lib/prefs';
import { useTableSession, type TableSession } from './net/session';

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    if (to !== location.pathname) history.pushState(null, '', to);
    setPath(to);
  }, []);
  return [path, navigate];
}

export function App() {
  const [path, navigate] = usePath();
  const code = normaliseCode(path.slice(1));
  return <div className="app">{CODE_PATTERN.test(code) ? <TablePage key={code} code={code} navigate={navigate} /> : <Home navigate={navigate} />}</div>;
}

function TablePage({ code, navigate }: { code: string; navigate(path: string): void }) {
  const [name, setName] = useState<string | null>(() => loadName() || null);
  // One connection type for both games; each game's screens narrow it below.
  const session = useTableSession<TableSnapshot | MadagascarSnapshot, never, never>(code, name);
  const leave = async () => {
    await session.leave();
    navigate('/');
  };

  if (!name) return <NameForm code={code} onDone={setName} />;

  if (session.status === 'error') {
    return (
      <main className="screen centre">
        <p className="error" role="alert">
          {session.error}
        </p>
        <button type="button" className="btn" onClick={() => navigate('/')}>
          Back home
        </button>
      </main>
    );
  }
  if (session.status === 'closed') {
    return (
      <main className="screen centre">
        <p>You are no longer at table {code}.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Rejoin
        </button>
        <button type="button" className="btn-link" onClick={() => navigate('/')}>
          Back home
        </button>
      </main>
    );
  }
  const snap = session.snapshot;
  if (!snap) {
    return (
      <main className="screen centre">
        <p className="muted">Joining table {code}...</p>
      </main>
    );
  }
  return (
    <>
      {session.status === 'reconnecting' && (
        <div className="banner" role="status">
          Connection lost. Reconnecting...
        </div>
      )}
      {GAME === 'madagascar' ? (
        <MadagascarScreens session={session as unknown as MadagascarSession} snapshot={snap as MadagascarSnapshot} onLeave={leave} />
      ) : snap.status === 'lobby' || !snap.game ? (
        <Take2Lobby snapshot={snap as TableSnapshot} onStart={session.start} onSetRules={session.setRules} onLeave={leave} />
      ) : (
        <Table session={session as unknown as TableSession} snapshot={snap as TableSnapshot} onLeave={leave} />
      )}
    </>
  );
}

function MadagascarScreens({ session, snapshot, onLeave }: { session: MadagascarSession; snapshot: MadagascarSnapshot; onLeave(): void }) {
  if (snapshot.status !== 'lobby' && snapshot.game) return <MadagascarTable session={session} snapshot={snapshot} onLeave={onLeave} />;
  return (
    <Lobby snapshot={snapshot} onStart={session.start} onLeave={onLeave}>
      <section className="tips-card" aria-labelledby="lobby-madagascar">
        <h2 id="lobby-madagascar">How Madagascar works</h2>
        <MadagascarNote />
        <MadagascarRulesList />
      </section>
      <section className="tips-card" aria-labelledby="lobby-howto">
        <h2 id="lobby-howto">How to play here</h2>
        <MadagascarHowToList />
      </section>
    </Lobby>
  );
}

function NameForm({ code, onDone }: { code: string; onDone(name: string): void }) {
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveName(name);
    onDone(name.trim());
  };
  return (
    <main className="screen">
      <div className="brand">
        <h1>{GAME_NAME[GAME]}</h1>
        <p>You have been invited to table {code}.</p>
      </div>
      <form className="field" onSubmit={submit}>
        <label htmlFor="join-name">Your name</label>
        <input id="join-name" className="input" value={name} maxLength={20} autoFocus autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }}>
          Join the table
        </button>
      </form>
    </main>
  );
}
