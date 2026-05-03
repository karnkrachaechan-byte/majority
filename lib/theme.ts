// lib/theme.ts
//
// Augmented from the original. All previous exports are preserved so any
// existing consumer (e.g. `/create`, `/dashboard/*`) keeps working.

export function isDay(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

// ── Legacy palettes (kept for /create + /dashboard) ───────────────────
export const BUBBLE_COLORS_DAY = [
  '#FF6B6B', '#FF8E53', '#FFC857', '#A8E063',
  '#56CCF2', '#6C63FF', '#F77FBE', '#43E97B',
  '#FA709A', '#4FACFE', '#43CBFF', '#F093FB',
];

export const BUBBLE_COLORS_NIGHT = [
  '#FF4757', '#FF6348', '#FFA502', '#7BED9F',
  '#1E90FF', '#5352ED', '#FF4D94', '#2ED573',
  '#FF6B81', '#3742FA', '#00D2FF', '#E040FB',
];

export function getBubbleColors(): string[] {
  return isDay() ? BUBBLE_COLORS_DAY : BUBBLE_COLORS_NIGHT;
}

export function getRandomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

// ── Cosmos topic palettes ─────────────────────────────────────────────
//
// Each topic encodes both option-1 and option-2 colors so the planet
// rim arc can render a meaningful A/B split before the user has voted.

export interface TopicPalette {
  topic: string;
  colorA: string;
  colorB: string;
  glow: string;
}

export const COSMOS_TOPICS: TopicPalette[] = [
  { topic: 'food',     colorA: '#ff6040', colorB: '#40d9b0', glow: '#ff6040' },
  { topic: 'tech',     colorA: '#6040ff', colorB: '#ffd060', glow: '#6040ff' },
  { topic: 'culture',  colorA: '#f040a0', colorB: '#40e0c0', glow: '#f040a0' },
  { topic: 'work',     colorA: '#ff9020', colorB: '#4080ff', glow: '#ff9020' },
  { topic: 'lifestyle',colorA: '#30c878', colorB: '#e050d0', glow: '#30c878' },
  { topic: 'sports',   colorA: '#ff3060', colorB: '#30b0ff', glow: '#ff3060' },
  { topic: 'science',  colorA: '#8040ff', colorB: '#40e080', glow: '#8040ff' },
  { topic: 'politics', colorA: '#3060f0', colorB: '#f06030', glow: '#3060f0' },
];

/**
 * Stable poll-id → topic palette mapping. Same id always gets the same
 * colors, so a planet doesn't change palette across re-renders or
 * page loads.
 */
export function assignPalette(pollId: string): TopicPalette {
  let h = 2166136261;
  for (let i = 0; i < pollId.length; i++) {
    h ^= pollId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return COSMOS_TOPICS[(h >>> 0) % COSMOS_TOPICS.length];
}

export function getDayNightSky(day: boolean) {
  return day
    ? { top: '#d6e9f5', mid: '#f3e5d0', bot: '#ffd9b8', fg: '#1a1a2e' }
    : { top: '#0a0e1f', mid: '#1a1f3a', bot: '#2a2050', fg: '#f0f0f8' };
}
