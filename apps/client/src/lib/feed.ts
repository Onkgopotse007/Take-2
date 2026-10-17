import type { GameEvent } from '@take2/engine';

export type Namer = (id: string, asObject?: boolean) => string;

export function makeNamer(names: Map<string, string>, me: string): Namer {
  return (id, asObject = false) => (id === me ? (asObject ? 'you' : 'You') : (names.get(id) ?? 'Someone'));
}

/** Toast text for events worth calling out. Plays and ordinary picks show on the table instead. */
export function eventText(e: GameEvent, who: Namer): string | null {
  switch (e.type) {
    case 'roundStarted':
      return `Round ${e.round}`;
    case 'picked':
      if (e.reason === 'penalty') return `${who(e.player)} took ${e.count}`;
      if (e.reason === 'callOut') return `${who(e.player)} picked ${e.count} for not announcing`;
      return null;
    case 'calledOut':
      return `${who(e.player)} called out ${who(e.target, true)}`;
    case 'forcedStart':
      return `Nobody started. ${who(e.starter)} picked to start, then ${who(e.next, true)}.`;
    case 'reshuffled':
      return 'The played cards were shuffled into a new pile';
    case 'checked':
      return `${who(e.player)} checked!`;
    case 'tossResolved':
      if (e.outcome === 'toss') return `${who(e.player)} tossed 15. Toss again!`;
      return `${who(e.player)} tossed ${e.total} and ${e.outcome === 'survived' ? 'stays in' : 'is out'}`;
    default:
      return null;
  }
}

/** What a player says out loud when announcing. */
export function announcement(cardsLeft: number): string {
  return cardsLeft === 1 ? '1 card!' : `${cardsLeft} cards!`;
}
