import type { GameKind } from '@take2/server/protocol';

/** Which game this site shows, from the address: madagascar.code-crunchers.com (or madagascar.localhost in development). */
export function gameFor(hostname: string): GameKind {
  return hostname.startsWith('madagascar.') ? 'madagascar' : 'take2';
}

export const GAME: GameKind = gameFor(location.hostname);

export const GAME_NAME: Record<GameKind, string> = { take2: 'Take 2', madagascar: 'Madagascar' };
