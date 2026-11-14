import { useLayoutEffect, useRef, useState } from 'react';
import { directionArcs } from '../lib/layout';

/** Faint arrows on the table showing which way play goes. They flash when the direction flips. */
export function DirectionArrows({ direction }: { direction: 1 | -1 }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 360, height: 420 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ width, height });
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const label = direction === 1 ? 'Play goes clockwise' : 'Play goes anticlockwise';
  return (
    // Keyed on the direction so the flash replays whenever a J reverses play.
    <svg key={direction} ref={ref} className="direction" role="img" aria-label={label}>
      <defs>
        <marker id="direction-head" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="3" markerHeight="3" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {directionArcs(size.width, size.height, direction).map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" markerEnd="url(#direction-head)" />
      ))}
    </svg>
  );
}
