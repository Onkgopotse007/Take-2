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

/**
 * Four short arcs just inside the table edge, between the seats, pointing the way play goes.
 * Matches .table-rim (13% in from the sides and top, 9% from the bottom) and its 10px wood inset.
 * Direction +1 runs from me to my left, over the top, to my right: clockwise on screen.
 */
export function directionArcs(width: number, height: number, direction: 1 | -1): string[] {
  const inset = 10 + 20;
  const cx = width / 2;
  const cy = height * 0.52;
  const rx = width * 0.37 - inset;
  const ry = height * 0.39 - inset;
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + rx * Math.cos(a)).toFixed(1)} ${(cy + ry * Math.sin(a)).toFixed(1)}`;
  };
  return [45, 135, 225, 315].map((centre) => {
    const [from, to] = direction === 1 ? [centre - 18, centre + 18] : [centre + 18, centre - 18];
    const sweep = direction === 1 ? 1 : 0;
    return `M ${point(from)} A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 ${sweep} ${point(to)}`;
  });
}
