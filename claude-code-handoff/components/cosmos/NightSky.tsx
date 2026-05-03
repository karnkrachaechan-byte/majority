// components/cosmos/NightSky.tsx
'use client';

import { useMemo } from 'react';

export function NightSky({ w, h }: { w: number; h: number }) {
  const stars = useMemo(() => {
    const rng = mulberry32(91);
    return Array.from({ length: 80 }, (_, i) => ({
      x: rng() * w,
      y: rng() * h * 0.85,
      size: 1 + rng() * 2.2,
      delay: rng() * 6,
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
          'linear-gradient(180deg, #0a0e1f 0%, #1a1f3a 55%, #2a2050 100%)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* Moon */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          right: '10%',
          width: 130,
          height: 130,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, #f8eecf 0%, #e0c688 55%, transparent 100%)',
          filter: 'blur(2px)',
          opacity: 0.85,
        }}
      />
      {/* Stars */}
      {stars.map((s) => (
        <div
          key={s.key}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            opacity: 0.6,
            animation: `cosmosTwinkle 3.6s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
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
