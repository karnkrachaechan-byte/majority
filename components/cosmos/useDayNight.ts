// components/cosmos/useDayNight.ts
'use client';

import { useEffect, useState } from 'react';
import { isDay } from '@/lib/theme';

/**
 * Tracks day/night based on the user's clock. Re-checks every 60s so the
 * sky transitions automatically if the page is left open across the
 * threshold. Falls back to `true` (day) during SSR to avoid hydration
 * mismatch — the first effect tick corrects it.
 */
export function useDayNight(): boolean {
  const [day, setDay] = useState(true);

  useEffect(() => {
    const update = () => setDay(isDay());
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Sync the existing body class so any legacy CSS (`/create`, `/dashboard`)
  // keeps working unchanged.
  useEffect(() => {
    document.body.className = day ? 'day' : 'night';
  }, [day]);

  return day;
}
