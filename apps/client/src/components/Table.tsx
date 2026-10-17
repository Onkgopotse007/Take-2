import { useEffect, useMemo, useState } from 'react';
import { isRank, type Suit } from '@take2/engine';
import type { TableSnapshot } from '@take2/server/protocol';
import { canIAct, neighboursOf, playableIds, sortHand, SUIT_GLYPH, suitIsRed } from '../lib/cards';
import { secondsLeft, useServerNow } from '../lib/clock';
import { announcement, eventText, makeNamer } from '../lib/feed';
import { opponentsFromMyLeft, seatPositions } from '../lib/layout';
import type { TableSession } from '../net/session';
import { CardBack, CardFace } from './Card';
import { Hand } from './Hand';
import { Menu } from './Menu';
import { ResultsSheet } from './ResultsSheet';
import { Seat } from './Seat';
import { SuitSheet } from './SuitSheet';
import { TossSheet } from './TossSheet';
import { TimerRing } from './TimerRing';

const TOAST_MS = 3500;
const SPEECH_MS = 2500;

export function Table({ session, snapshot, onLeave }: { session: TableSession; snapshot: TableSnapshot; onLeave(): void }) {
  const view = snapshot.game!;
  const me = snapshot.you;
  const now = useServerNow();
  const localNow = Date.now();

  const [announcing, setAnnouncing] = useState(false);
  const [eightId, setEightId] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const names = useMemo(() => new Map(snapshot.seats.map((s) => [s.id, s.name])), [snapshot.seats]);
  const who = makeNamer(names, me);
  const connected = new Map(snapshot.seats.map((s) => [s.id, s.connected]));

  const raceOpen = snapshot.raceOpensAt === null || now >= snapshot.raceOpensAt;
  const hand = useMemo(() => sortHand(view.hand), [view.hand]);
  const playable = playableIds(view, raceOpen);
  const myTurn = canIAct(view) && view.turn.kind !== 'race';
  const meOut = view.players.find((p) => p.id === me)?.status !== 'active';
  const secs = secondsLeft(snapshot.deadline, now);

  // A new turn clears my half-finished intentions.
  const turnKey = JSON.stringify(view.turn) + view.discardCount;
  useEffect(() => {
    setHint('');
    setEightId(null);
  }, [turnKey]);

  useEffect(() => {
    if (myTurn) navigator.vibrate?.(60);
  }, [myTurn, turnKey]);

  const play = (cardId: string, suit?: Suit) => {
    session.move({ type: 'play', cardId, ...(suit ? { suit } : {}), announce: announcing });
    setAnnouncing(false);
    setEightId(null);
    setHint('');
  };

  const turnIds = new Set<string>();
  if (view.turn.kind === 'player') turnIds.add(view.turn.player);
  if (view.turn.kind === 'neighbours') neighboursOf(view, view.turn.starter).forEach((id) => turnIds.add(id));

  const recent = session.feed.filter((f) => localNow - f.at < TOAST_MS);
  const speech = new Map<string, string>();
  for (const f of session.feed) {
    if (f.event.type === 'announced' && localNow - f.at < SPEECH_MS) speech.set(f.event.player, announcement(f.event.cardsLeft));
  }
  const toasts = recent.map((f) => ({ id: f.id, text: eventText(f.event, who), warn: false })).filter((t) => t.text);
  const rej = session.rejection;
  if (rej && localNow - rej.at < 3000) {
    toasts.push({ id: rej.id, text: rej.reason, warn: true });
  }

  const lastPlay = [...session.feed].reverse().find((f) => f.event.type === 'played' || f.event.type === 'roundStarted');
  const lastPlayNote =
    lastPlay?.event.type === 'played' ? `${who(lastPlay.event.player)} played` : view.turn.kind === 'race' ? 'Base card' : '';

  const opponents = opponentsFromMyLeft(view.players, me);
  const positions = seatPositions(opponents.length);
  const top = view.topCard;
  const calledSuit = top && isRank(top, '8') && view.penalty === 0 && view.lead.suits.length === 1 ? view.lead.suits[0]! : null;
  const countdown = view.turn.kind === 'race' && !raceOpen && snapshot.raceOpensAt ? Math.ceil((snapshot.raceOpensAt - now) / 1000) : null;

  let status: string;
  if (view.phase !== 'playing') status = 'Round over';
  else if (view.turn.kind === 'race') status = raceOpen ? 'Play a matching card to start' : 'Get ready';
  else if (myTurn) status = 'Your turn';
  else if (view.turn.kind === 'neighbours') status = `${[...turnIds].map((id) => who(id)).join(' or ')} to play`;
  else if (view.turn.kind === 'player') status = `${who(view.turn.player)}'s turn`;
  else status = '';

  const pileReady = myTurn && !view.pickedCardId;
  const pileLabel = pileReady ? (view.penalty > 0 ? `Tap to take ${view.penalty}` : 'Tap to pick') : `${view.drawPileCount} left`;
  const onAir = !meOut && view.phase === 'playing' && hand.length === 0;

  return (
    <>
      <header className="header">
        <div className="header-code">
          <span>Table</span>
          <span>{snapshot.code}</span>
        </div>
        <span className="muted">Round {view.round}</span>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      <section className="table-area" aria-label="Table">
        <div className="table-rim" aria-hidden="true" />
        <div className="table-wood" aria-hidden="true" />
        <div className="table-centre">
          {countdown !== null ? (
            <span className="countdown" role="timer" aria-live="assertive">
              {countdown}
            </span>
          ) : (
            <div className="piles">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button type="button" className={`pile-btn${pileReady ? ' ready' : ''}`} aria-label={`Draw pile, ${view.drawPileCount} cards. Tap to pick.`} onClick={() => session.move({ type: 'pick' })}>
                  <CardBack width={70} style={{ position: 'absolute', left: 4, top: 4, background: '#5E95BD' }} />
                  <CardBack width={70} style={{ position: 'absolute', left: 0, top: 0 }} />
                </button>
                <span className={`pile-label${pileReady ? ' ready' : ''}`}>{pileLabel}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {top && <CardFace card={top} width={84} style={{ transform: 'rotate(4deg)' }} />}
                <span className="pile-label">{lastPlayNote}</span>
              </div>
            </div>
          )}
          {view.penalty > 0 && (
            <span className="chip-note" role="status">
              Pick {view.penalty}
              <small>or block, or stack</small>
            </span>
          )}
          {calledSuit && (
            <span className="chip-note" style={{ color: suitIsRed(calledSuit) ? 'var(--red)' : 'var(--black)' }}>
              {SUIT_GLYPH[calledSuit]} called
            </span>
          )}
        </div>

        {opponents.map((p, i) => (
          <Seat
            key={p.id}
            seat={{
              id: p.id,
              name: names.get(p.id) ?? 'Player',
              cardCount: p.cardCount,
              connected: connected.get(p.id) ?? false,
              eliminated: p.status === 'eliminated',
              onAir: p.onAir,
            }}
            left={positions[i]!.left}
            top={positions[i]!.top}
            compact={opponents.length > 6}
            isTurn={turnIds.has(p.id)}
            secondsLeft={secs}
            speech={speech.get(p.id) ?? null}
            canCallOut={view.phase === 'playing' && !meOut && p.status === 'active'}
            onCallOut={(target) => session.move({ type: 'callOut', target })}
          />
        ))}
      </section>

      <section className={`hand-area${myTurn ? ' my-turn' : ''}`} aria-label="Your hand">
        <div className="hand-bar">
          <div className={`hand-status${myTurn ? ' mine' : ''}`}>
            {myTurn && secs !== null && <TimerRing seconds={secs} total={10} />}
            <span>{status}</span>
            {speech.get(me) && <span className="chip-note" style={{ fontSize: 13 }}>{speech.get(me)}</span>}
          </div>
          {!meOut && view.phase === 'playing' && (
            <div className="hand-actions">
              {myTurn && view.pickedCardId && (
                <button type="button" className="btn btn-small" onClick={() => session.move({ type: 'pass' })}>
                  Keep it
                </button>
              )}
              <button type="button" className={`btn btn-small${announcing ? ' btn-on' : ''}`} aria-pressed={announcing} onClick={() => setAnnouncing((a) => !a)}>
                {announcing ? 'Announcing' : 'Announce'}
              </button>
            </div>
          )}
        </div>
        {meOut ? (
          <p className="hand-empty">You are out of this game. Watch the rest of it here.</p>
        ) : onAir ? (
          <p className="hand-empty">You are on air. Tap the pile on your turn.</p>
        ) : (
          <Hand
            cards={hand}
            playable={playable}
            onPlay={(id) => play(id)}
            onEight={setEightId}
            onStatus={setHint}
            autoSelect={myTurn ? view.pickedCardId : null}
          />
        )}
        <p className="status-line" role="status">
          {hint}
        </p>
      </section>

      <div className="toasts" aria-live="polite">
        {toasts.slice(-3).map((t) => (
          <div key={t.id} className={`toast${t.warn ? ' warn' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>

      {eightId && <SuitSheet onChoose={(suit) => play(eightId, suit)} onCancel={() => setEightId(null)} />}
      {view.phase === 'toss' && <TossSheet view={view} who={who} secondsLeft={secs} onToss={(picks) => session.move({ type: 'toss', picks })} />}
      {(view.phase === 'roundOver' || view.phase === 'gameOver') && (
        <ResultsSheet
          view={view}
          who={who}
          secondsLeft={secs}
          isHost={snapshot.hostId === me}
          hostName={snapshot.hostId ? who(snapshot.hostId) : 'the host'}
          onPlayAgain={session.start}
          onLeave={onLeave}
        />
      )}
      {menuOpen && <Menu code={snapshot.code} onClose={() => setMenuOpen(false)} onLeave={onLeave} />}
    </>
  );
}
