import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { CODE_PATTERN, loadName, normaliseCode, saveName } from './lib/prefs';
import { useTableSession } from './net/session';

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
  const session = useTableSession(code, name);
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
      {snap.status === 'lobby' || !snap.game ? (
        <Lobby snapshot={snap} onStart={session.start} onLeave={leave} />
      ) : (
        <Table session={session} snapshot={snap} onLeave={leave} />
      )}
    </>
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
        <h1>Take 2</h1>
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
