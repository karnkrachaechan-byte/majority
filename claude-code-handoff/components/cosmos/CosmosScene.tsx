// components/cosmos/CosmosScene.tsx
'use client';

import { useMemo } from 'react';
import { DaySky } from './DaySky';
import { NightSky } from './NightSky';
import { PlanetBubble } from './PlanetBubble';
import { AskPlanet } from './AskPlanet';
import { useOrbit, useViewport, useMouseParallax } from './useOrbit';
import { useDayNight } from './useDayNight';
import { assignPalette } from '@/lib/theme';
import type { OrbitBubble, PollWithVotes } from './types';

interface Props {
  polls: PollWithVotes[];
  /** called when the user taps a real poll planet */
  onPollClick: (id: string) => void;
  /** show the "tap me" hint on the largest planet */
  showHint?: boolean;
}

/**
 * The shared orbit scene used by both `app/page.tsx` and the voting page.
 * Lays out every poll on one of three orbital rings, plus an "ask the
 * world" sentinel planet at the end.
 */
export function CosmosScene({ polls, onPollClick, showHint = true }: Props) {
  const isDay = useDayNight();
  const t = useOrbit();
  const mouse = useMouseParallax();
  const { w: vw, h: vh } = useViewport();

  const bubbles = useMemo<OrbitBubble[]>(() => {
    const cx = vw / 2;
    const cy = vh * 0.96;
    const orbitCount = polls.length + 1; // +1 for ask sentinel
    const arcStart = Math.PI * 1.05;
    const arcEnd = Math.PI * 1.95;
    const angleStep = (arcEnd - arcStart) / Math.max(1, orbitCount);

    // Ring radii scale with viewport so mobile stays usable
    const diag = Math.sqrt(vw * vw + vh * vh);
    const baseRing = Math.min(diag * 0.32, 540);
    const ringRadii = [baseRing * 0.6, baseRing * 0.78, baseRing];
    const ringPattern = [0, 2, 1, 0, 2, 1, 0, 2];

    const real: OrbitBubble[] = polls.map((p, slot) => {
      const tot = p.voteCount;
      const r = 50 + Math.sqrt(tot) * 0.75;
      const jitter = (deterministic(p.id, 1) - 0.5) * angleStep * 0.35;
      const phase = arcStart + slot * angleStep + angleStep / 2 + jitter;
      const ring =
        ringRadii[ringPattern[slot % ringPattern.length]] +
        (deterministic(p.id, 2) - 0.5) * 18;
      const speed = 0.035 + deterministic(p.id, 3) * 0.025 * (slot % 2 ? 1 : -1);
      const palette = assignPalette(p.id);
      return {
        kind: 'poll',
        id: p.id,
        ring,
        phase,
        speed,
        baseR: r,
        cx,
        cy,
        bobPhase: deterministic(p.id, 4) * 6,
        bobAmp: 4,
        poll: p,
        palette,
      };
    });

    const askSlot = orbitCount - 1;
    const askPhase = arcStart + askSlot * angleStep + angleStep / 2;
    const ask: OrbitBubble = {
      kind: 'ask',
      id: '__ask__',
      ring: ringRadii[ringPattern[askSlot % ringPattern.length]],
      phase: askPhase,
      speed: 0.03,
      baseR: 55,
      cx,
      cy,
      bobPhase: 1.3,
      bobAmp: 6,
    };

    return [...real, ask];
  }, [polls, vw, vh]);

  // Sort by sin(angle) so back planets render first
  const sorted = bubbles
    .map((b) => ({ b, z: Math.sin(b.phase + t * b.speed) }))
    .sort((a, b) => a.z - b.z)
    .map(({ b }) => b);

  // Largest poll planet gets the hint
  const hintId = useMemo(() => {
    let best: OrbitBubble | null = null;
    for (const b of bubbles) {
      if (b.kind !== 'poll') continue;
      if (!best || b.baseR > best.baseR) best = b;
    }
    return best?.id;
  }, [bubbles]);

  return (
    <>
      {isDay ? <DaySky w={vw} h={vh} /> : <NightSky w={vw} h={vh} />}

      {sorted.map((b) =>
        b.kind === 'poll' ? (
          <PlanetBubble
            key={b.id}
            bubble={b}
            t={t}
            mouse={mouse}
            vw={vw}
            vh={vh}
            isHinted={showHint && b.id === hintId}
            onClick={onPollClick}
          />
        ) : (
          <AskPlanet
            key={b.id}
            bubble={b}
            t={t}
            mouse={mouse}
            isDay={isDay}
          />
        )
      )}
    </>
  );
}

/**
 * Deterministic [0..1) hash from poll id + salt — keeps planet positions
 * stable across re-renders without an explicit RNG seed.
 */
function deterministic(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
