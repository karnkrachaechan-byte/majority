// components/cosmos/useOrbit.ts
'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Drives the orbit animation off a single requestAnimationFrame loop.
 *
 * Returns the elapsed time `t` (seconds since mount). Components multiply
 * this by per-bubble speeds to get angular position. The loop pauses when
 * the tab is hidden and respects `prefers-reduced-motion`.
 */
export function useOrbit(): number {
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      // Hold a single frozen frame so positions are deterministic.
      setT(0);
      return;
    }

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      tRef.current = (now - startRef.current) / 1000;
      setT(tRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } else {
        // Re-anchor so we don't jump after a long pause.
        startRef.current = performance.now() - tRef.current * 1000;
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return t;
}

/**
 * Tracks viewport size so orbit math can scale for mobile/desktop.
 */
export function useViewport(): { w: number; h: number } {
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return vp;
}

/**
 * Mouse parallax — returns a value in [-0.5, 0.5] for x and y.
 * Used to nudge sky and planets slightly off-axis.
 */
export function useMouseParallax(): { x: number; y: number } {
  const [m, setM] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setM({
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return m;
}
