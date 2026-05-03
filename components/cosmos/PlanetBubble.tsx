// components/cosmos/PlanetBubble.tsx
'use client';

import type { OrbitBubble } from './types';

interface Props {
  bubble: OrbitBubble;
  /** elapsed seconds from useOrbit */
  t: number;
  /** mouse parallax {x, y} in [-0.5, 0.5] */
  mouse: { x: number; y: number };
  /** current orbit-scene viewport (for sizing) */
  vw: number;
  vh: number;
  /** does this bubble currently get the "tap me" hint? */
  isHinted?: boolean;
  onClick?: (id: string) => void;
}

/**
 * A single poll rendered as an orbiting planet. Position is computed
 * per-frame from `t` × bubble.speed; React re-renders at the parent
 * (Cosmos­Scene) at 60fps but only the `transform` style changes, so
 * paint cost is negligible.
 */
export function PlanetBubble({ bubble, t, mouse, isHinted, onClick }: Props) {
  if (bubble.kind !== 'poll' || !bubble.poll || !bubble.palette) return null;

  const { ring, phase, speed, baseR, cx, cy, bobPhase, bobAmp } = bubble;
  const angle = phase + t * speed;
  const bob = Math.sin(t * 0.6 + bobPhase) * bobAmp;
  const x = cx + Math.cos(angle) * ring;
  const y = cy - Math.abs(Math.sin(angle)) * ring * 0.42 + bob;
  const z = Math.sin(angle); // -1..1, used for depth scaling

  const depthScale = 0.78 + ((z + 1) / 2) * 0.42;
  const r = baseR * depthScale;

  const totals = bubble.poll.totals ?? { a: 0, b: 0, total: 0 };
  const aPct = totals.total > 0 ? totals.a / totals.total : 0.5;

  const { colorA, colorB, glow } = bubble.palette;
  const parallaxK = 6 + (z + 1) * 3;

  const circumference = 2 * Math.PI * (r + 2);

  return (
    <button
      type="button"
      onClick={() => onClick?.(bubble.id)}
      aria-label={bubble.poll.question}
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        background: 'transparent',
        transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        transform: `translate3d(${mouse.x * parallaxK}px, ${
          mouse.y * parallaxK * 0.6
        }px, 0)`,
        opacity: 0.7 + ((z + 1) / 2) * 0.3,
        zIndex: 2 + Math.round((z + 1) * 5),
      }}
    >
      {/* Outer glow */}
      <div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow}55 0%, transparent 70%)`,
          filter: 'blur(10px)',
          pointerEvents: 'none',
        }}
      />

      {/* Onboarding pulse ring */}
      {isHinted && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: '50%',
              border: `2px solid ${colorA}`,
              opacity: 0.5,
              animation: 'cosmosPulse 2.4s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: '50%',
              border: `2px solid ${colorA}`,
              opacity: 0.4,
              animation: 'cosmosPulse 2.4s ease-out infinite 1.2s',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* Vote-share rim arcs */}
      <svg
        width={r * 2 + 12}
        height={r * 2 + 12}
        viewBox={`-6 -6 ${r * 2 + 12} ${r * 2 + 12}`}
        style={{ position: 'absolute', left: -6, top: -6, overflow: 'visible' }}
      >
        <circle
          cx={r}
          cy={r}
          r={r + 2}
          fill="none"
          stroke={colorA}
          strokeWidth="2.5"
          strokeDasharray={`${circumference * aPct} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${r} ${r})`}
          opacity="0.85"
        />
        <circle
          cx={r}
          cy={r}
          r={r + 2}
          fill="none"
          stroke={colorB}
          strokeWidth="2.5"
          strokeDasharray={`${circumference * (1 - aPct)} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${-90 + 360 * aPct} ${r} ${r})`}
          opacity="0.85"
        />
      </svg>

      {/* Planet body */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${colorA} 0%, ${colorB} 100%)`,
          boxShadow: 'inset 0 -10px 30px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: r > 80 ? 14 : 12,
            lineHeight: 1.3,
            textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {bubble.poll.question}
        </span>
        {totals.total > 0 && (
          <span
            style={{
              color: 'rgba(255,255,255,0.78)',
              fontSize: 10,
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            {totals.total} {totals.total === 1 ? 'vote' : 'votes'}
          </span>
        )}
      </div>
    </button>
  );
}
