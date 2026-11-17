import { useState, type FormEvent } from 'react';
import { createTable } from '../net/session';
import { CODE_PATTERN, loadName, normaliseCode, saveName } from '../lib/prefs';
import { GAME, GAME_NAME } from '../lib/game';

const TAGLINE = {
  take2: 'Crusades, the way we play it at home.',
  madagascar: 'Turn a card and hope it is not the suit on top.',
};

export function Home({ navigate }: { navigate(path: string): void }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name first.');
    saveName(name);
    setBusy(true);
    setError('');
    try {
      navigate(`/${await createTable(name.trim())}`);
    } catch {
      setError('Could not start a table. Check your connection and try again.');
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = normaliseCode(code);
    if (!name.trim()) return setError('Enter your name first.');
    if (!CODE_PATTERN.test(c)) return setError('Table codes have 5 letters and numbers.');
    saveName(name);
    navigate(`/${c}`);
  };

  return (
    <main className="screen">
      <div className="brand">
        <h1>{GAME_NAME[GAME]}</h1>
        <p>{TAGLINE[GAME]}</p>
      </div>
      <form className="field" onSubmit={create}>
        <label htmlFor="name">Your name</label>
        <input id="name" className="input" value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 10 }}>
          {busy ? 'Starting...' : 'Start a table'}
        </button>
      </form>
      <div className="divider">or join friends</div>
      <form className="field" onSubmit={join}>
        <label htmlFor="code">Table code</label>
        <div className="row">
          <input
            id="code"
            className="input input-code"
            value={code}
            maxLength={7}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn">
            Join
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
