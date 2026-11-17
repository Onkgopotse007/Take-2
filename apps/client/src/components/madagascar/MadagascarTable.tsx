import { useEffect, useMemo, useState } from 'react';
import { placeNumbers, type GameEvent, type MadagascarView } from '@take2/madagascar';
import type { MadagascarClientMove, MadagascarSnapshot } from '@take2/server/protocol';
import { sortHand } from '../../lib/cards';
import { secondsLeft, useServerNow } from '../../lib/clock';
import { madagascarEventText, makeNamer, ordinal } from '../../lib/feed';
import { opponentsFromMyLeft, seatPositions } from '../../lib/layout';
import type { TableSession } from '../../net/session';
import { CardFace } from '../Card';
import { DirectionArrows } from '../DirectionArrows';
import { Hand } from '../Hand';
import { Menu } from '../Menu';
import { Seat } from '../Seat';
import { TimerRing } from '../TimerRing';
import { MadagascarHowToSheet } from './Rules';
import { MadagascarResults } from './Results';
import { Oval } from './Oval';

export type MadagascarSession = TableSession<MadagascarSnapshot, GameEvent, MadagascarClientMove>;

const TOAST_MS = 3500;
/** Matches the server's turn limit. */
const TURN_SECONDS = 10;

/** Players who may move now: everyone in the race, either neighbour after the start, or one player. */
function actingIds(view: MadagascarView): string[] {
  const t = view.turn;
  const ring = view.players.filter((p) => p.status === 'active').map((p) => p.id);
  if (t.kind === 'race') return ring;
  if (t.kind === 'player') return [t.player];
  if (t.kind === 'neighbours') {
    const i = ring.indexOf(t.starter);
    const n = ring.length;
    return [...new Set([ring[(i + 1) % n]!, ring[(i - 1 + n) % n]!])];
  }
  return [];
}

/** Place number per player who has finished so far. */
function placesById(view: MadagascarView): Map<string, number> {
  const numbers = placeNumbers(view.places);
  return new Map(view.places.flatMap((group, g) => group.map((id) => [id, numbers[g]!] as const)));
}

export function MadagascarTable({ session, snapshot, onLeave }: { session: MadagascarSession; snapshot: MadagascarSnapshot; onLeave(): void }) {
  const view = snapshot.game!;
  const me = snapshot.you;
  const now = useServerNow();
  const localNow = Date.now();
  const [hint, setHint] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const names = useMemo(() => new Map(snapshot.seats.map((s) => [s.id, s.name])), [snapshot.seats]);
  const who = makeNamer(names, me);
  const connected = new Map(snapshot.seats.map((s) => [s.id, s.connected]));
  const places = placesById(view);
  const myPlace = places.get(me);
  const myStatus = view.players.find((p) => p.id === me)?.status;

  const raceOpen = snapshot.raceOpensAt === null || now >= snapshot.raceOpensAt;
  const acting = actingIds(view);
  const canAct = view.phase !== 'gameOver' && acting.includes(me) && (view.turn.kind !== 'race' || raceOpen);
  const myTurn = canAct && view.turn.kind !== 'race';
  const secs = secondsLeft(snapshot.deadline, now);
  const hand = useMemo(() => sortHand(view.hand), [view.hand]);

  const turnKey = JSON.stringify(view.turn) + view.pileCount + view.phase;
  useEffect(() => setHint(''), [turnKey]);
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(60);
  }, [myTurn, turnKey]);

  const recent = session.feed.filter((f) => localNow - f.at < TOAST_MS);
  const toasts = recent.map((f) => ({ id: f.id, text: madagascarEventText(f.event, who), warn: false })).filter((t) => t.text);
  const rej = session.rejection;
  if (rej && localNow - rej.at < 3000) toasts.push({ id: rej.id, text: rej.reason, warn: true });

  const lastPlay = [...session.feed].reverse().find((f) => f.event.type === 'played');
  const lastPlayNote = lastPlay?.event.type === 'played' ? `${who(lastPlay.event.player)} played` : '';
  const countdown = view.turn.kind === 'race' && !raceOpen && snapshot.raceOpensAt ? Math.ceil((snapshot.raceOpensAt - now) / 1000) : null;

  let status: string;
  if (view.phase === 'gameOver') status = 'Game over';
  else if (view.turn.kind === 'race') status = raceOpen ? 'Tap any card to start' : 'Get ready';
  else if (myTurn) status = 'Your turn';
  else status = `${acting.map((id) => who(id)).join(' or ')} to play`;

  const opponents = opponentsFromMyLeft(view.players, me);
  const positions = seatPositions(opponents.length);
  const showDirection = view.phase !== 'gameOver' && view.direction !== null && view.players.filter((p) => p.status === 'active').length > 2;

  return (
    <>
      <header className="header">
        <div className="header-code">
          <span>Table</span>
          <span>{snapshot.code}</span>
        </div>
        <span className="muted">{view.phase === 'circle' ? 'The oval' : view.phase === 'hands' ? 'Hands' : ''}</span>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      <section className="table-area" aria-label="Table">
        <div className="table-rim" aria-hidden="true" />
        <div className="table-wood" aria-hidden="true" />
        {showDirection && view.direction !== null && <DirectionArrows direction={view.direction} />}
        {view.phase === 'circle' && (
          <Oval
            slots={view.circle}
            canTurn={canAct}
            onTurn={(slot) => session.move({ type: 'turn', slot })}
            onBlocked={() => setHint(view.turn.kind === 'race' && !raceOpen ? 'Wait for the countdown' : 'Wait for your turn')}
          />
        )}
        {/* Lets taps through to the oval underneath. */}
        <div className="table-centre mg-centre">
          {countdown !== null ? (
            <span className="countdown" role="timer" aria-live="assertive">
              {countdown}
            </span>
          ) : view.topCard ? (
            <div className="mg-pile">
              <CardFace card={view.topCard} width={64} style={{ transform: 'rotate(4deg)' }} />
              <span className="pile-label">
                {view.pileCount} in the pile{lastPlayNote && <br />}
                {lastPlayNote}
              </span>
            </div>
          ) : null}
        </div>

        {opponents.map((p, i) => (
          <Seat
            key={p.id}
            seat={{
              id: p.id,
              name: names.get(p.id) ?? 'Player',
              cardCount: p.cardCount,
              connected: connected.get(p.id) ?? false,
              eliminated: p.status === 'left',
              onAir: false,
              place: places.get(p.id),
            }}
            left={positions[i]!.left}
            top={positions[i]!.top}
            compact={opponents.length > 6}
            isTurn={view.turn.kind !== 'race' && acting.includes(p.id)}
            secondsLeft={secs === null ? null : Math.min(secs, TURN_SECONDS)}
            speech={null}
            canCallOut={false}
            onCallOut={() => {}}
          />
        ))}
      </section>

      <section className={`hand-area${myTurn ? ' my-turn' : ''}`} aria-label="Your hand">
        <div className="hand-bar">
          <div className={`hand-status${myTurn ? ' mine' : ''}`}>
            {myTurn && secs !== null && <TimerRing seconds={secs} total={TURN_SECONDS} />}
            <span>{status}</span>
            {myPlace !== undefined && <span className="seat-tag win">{ordinal(myPlace)}</span>}
          </div>
        </div>
        {myPlace !== undefined ? (
          <p className="hand-empty">
            You finished {ordinal(myPlace)}
            {myPlace === 1 ? '!' : '.'} Watch the rest play on here.
          </p>
        ) : myStatus === 'left' ? (
          <p className="hand-empty">You are out of this game. Watch the rest of it here.</p>
        ) : view.phase === 'circle' && hand.length === 0 ? (
          <p className="hand-empty">No cards yet. Keep it that way!</p>
        ) : (
          <Hand
            cards={hand}
            playable={new Set(myTurn && view.phase === 'hands' ? hand.map((c) => c.id) : [])}
            onPlay={(cardId) => session.move({ type: 'play', cardId })}
            onEight={() => {}}
            onStatus={setHint}
            eightNeedsSuit={false}
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

      {view.phase === 'gameOver' && (
        <MadagascarResults
          view={view}
          who={who}
          isHost={snapshot.hostId === me}
          hostName={snapshot.hostId ? who(snapshot.hostId) : 'the host'}
          onPlayAgain={session.start}
          onLeave={onLeave}
          tally={Object.entries(snapshot.wins)
            .map(([id, wins]) => ({ id, wins }))
            .filter((t) => names.has(t.id))
            .sort((a, b) => b.wins - a.wins)}
        />
      )}
      {menuOpen && <Menu code={snapshot.code} howTo={(close) => <MadagascarHowToSheet onClose={close} />} onClose={() => setMenuOpen(false)} onLeave={onLeave} />}
    </>
  );
}
