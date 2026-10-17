/**
 * Where opponents sit around the table, as percentages of the table area.
 * I sit at the bottom. Seat order runs from my left, over the top, to my right, which is the
 * engine's +1 direction.
 */
export function seatAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [270];
  const span = Math.min(220, 55 * (count - 1));
  const start = 270 - span / 2;
  return Array.from({ length: count }, (_, i) => start + (i * span) / (count - 1));
}

export function seatPositions(count: number): { left: number; top: number }[] {
  return seatAngles(count).map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { left: 50 + 40 * Math.cos(a), top: 54 + 42 * Math.sin(a) };
  });
}

/** Opponents in seat order starting from my left-hand neighbour. */
export function opponentsFromMyLeft<T extends { id: string }>(players: readonly T[], me: string): T[] {
  const i = players.findIndex((p) => p.id === me);
  if (i < 0) return players.slice();
  return [...players.slice(i + 1), ...players.slice(0, i)];
}

/**
 * Horizontal step between overlapping cards so the hand fits `width`.
 * Never less than `minStep`; past that the hand scrolls sideways.
 */
export function cardStep(count: number, width: number, cardWidth: number, minStep = 26): number {
  if (count <= 1) return cardWidth;
  const natural = cardWidth + 6;
  const fit = (width - cardWidth) / (count - 1);
  return Math.max(minStep, Math.min(natural, fit));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
