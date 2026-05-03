// components/cosmos/AskPlanet.tsx
'use client';

import { useRouter } from 'next/navigation';
import type { OrbitBubble } from './types';

/**
 * The empty "+ ask the world" planet. Lives in the orbit alongside real
 * polls and routes to /create on click.
 */
export function AskPlanet({
  bubble,
  t,
  mouse,
  isDay,
}: {
  bubble: OrbitBubble;
  t: number;
  mouse: { x: number; y: number };
  isDay: boolean;
}) {
  const router = useRouter();
  const { ring, phase, speed, baseR, cx, cy, bobPhase, bobAmp } = bubble;
  const angle = phase + t * speed;
  const bob = Math.sin(t * 0.6 + bobPhase) * bobAmp;
  const x = cx + Math.cos(angle) * ring;
  const y = cy - Math.abs(Math.sin(angle)) * ring * 0.42 + bob;
  const z = Math.sin(angle);
  const depthScale = 0.78 + ((z + 1) / 2) * 0.42;
  const r = baseR * depthScale;
  const parallaxK = 6 + (z + 1) * 3;

  const stroke = isDay ? 'rgba(20,20,30,0.5)' : 'rgba(255,255,255,0.65)';
  const fill = isDay ? 'rgba(20,20,30,0.7)' : 'rgba(255,255,255,0.85)';

  return (
    <button
      type="button"
      onClick={() => router.push('/create')}
      aria-label="Ask the world a question"
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: `2px dashed ${stroke}`,
        background: 'transparent',
        cursor: 'pointer',
        transform: `translate3d(${mouse.x * parallaxK}px, ${
          mouse.y * parallaxK * 0.6
        }px, 0)`,
        transition: 'transform 0.3s, background 0.3s',
        opacity: 0.55 + ((z + 1) / 2) * 0.3,
        zIndex: 2 + Math.round((z + 1) * 5),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDay
          ? 'rgba(20,20,30,0.05)'
          : 'rgba(255,255,255,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          color: fill,
          fontSize: r > 70 ? 28 : 20,
          fontWeight: 300,
          lineHeight: 1,
        }}
      >
        +
      </span>
      <span
        style={{
          color: fill,
          fontSize: r > 70 ? 11 : 10,
          fontWeight: 500,
          marginTop: 4,
          textAlign: 'center',
          maxWidth: r * 1.5,
          opacity: 0.85,
        }}
      >
        ask the world
      </span>
    </button>
  );
}
