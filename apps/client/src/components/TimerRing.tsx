const R = 15;
const C = 2 * Math.PI * R;

export function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const fraction = Math.max(0, Math.min(1, seconds / total));
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" role="img" aria-label={`${seconds} seconds left`}>
      <circle cx="18" cy="18" r={R} fill="none" stroke="#4A3220" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={R}
        fill="none"
        stroke="var(--lamp)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${C * fraction} ${C}`}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="23" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--cream)" fontFamily="var(--font)">
        {seconds}
      </text>
    </svg>
  );
}
