// components/cosmos/DaySky.tsx
'use client';

import { useMemo } from 'react';

/**
 * Soft daytime backdrop: warm sun + a few drifting clouds.
 * Pure-CSS / SVG, no images, no deps.
 */
export function DaySky({ w, h }: { w: number; h: number }) {
  // Deterministic cloud layout — no flicker on re-render
  const clouds = useMemo(() => {
    const seed = 17;
    const rng = mulberry32(seed);
    return Array.from({ length: 7 }, (_, i) => ({
      x: rng() * w,
      y: 60 + rng() * (h * 0.45),
      scale: 0.7 + rng() * 0.9,
      opacity: 0.55 + rng() * 0.35,
      drift: 40 + rng() * 60,
      delay: -rng() * 30,
      key: i,
    }));
  }, [w, h]);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(180deg, #d6e9f5 0%, #f3e5d0 55%, #ffd9b8 100%)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* Sun */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          right: '10%',
          width: 140,
          height: 140,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, #ffe7b8 0%, #ffb05a 65%, transparent 100%)',
          filter: 'blur(2px)',
          opacity: 0.9,
        }}
      />
      {/* Clouds */}
      {clouds.map((c) => (
        <div
          key={c.key}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            transform: `scale(${c.scale})`,
            opacity: c.opacity,
            animation: `cosmosCloudDrift ${c.drift}s linear ${c.delay}s infinite`,
          }}
        >
          <Cloud />
        </div>
      ))}
    </div>
  );
}

function Cloud() {
  return (
    <svg width="160" height="60" viewBox="0 0 160 60" fill="white">
      <ellipse cx="40" cy="35" rx="32" ry="20" />
      <ellipse cx="80" cy="28" rx="40" ry="24" />
      <ellipse cx="120" cy="36" rx="30" ry="18" />
    </svg>
  );
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
