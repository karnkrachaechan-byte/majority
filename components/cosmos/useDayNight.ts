'use client';

import { useEffect, useState } from 'react';
import { isDay } from '@/lib/theme';

export function useDayNight(): boolean {
  const [day, setDay] = useState(true);

  useEffect(() => {
    const update = () => {
      const override = localStorage.getItem('majority_day');
      setDay(override !== null ? override === 'day' : isDay());
    };
    update();
    const id = setInterval(update, 60_000);
    // pick up changes from other pages / the toggle
    window.addEventListener('majority-day-change', update);
    return () => {
      clearInterval(id);
      window.removeEventListener('majority-day-change', update);
    };
  }, []);

  useEffect(() => {
    document.body.className = day ? 'day' : 'night';
  }, [day]);

  return day;
}

/** Call this from the toggle button — persists across all pages. */
export function setDayNightOverride(day: boolean) {
  localStorage.setItem('majority_day', day ? 'day' : 'night');
  window.dispatchEvent(new Event('majority-day-change'));
}
