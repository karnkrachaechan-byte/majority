export function isDay(): boolean {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18
}

export const BUBBLE_COLORS_DAY = [
  '#FF6B6B', '#FF8E53', '#FFC857', '#A8E063',
  '#56CCF2', '#6C63FF', '#F77FBE', '#43E97B',
  '#FA709A', '#4FACFE', '#43CBFF', '#F093FB',
]

export const BUBBLE_COLORS_NIGHT = [
  '#FF4757', '#FF6348', '#FFA502', '#7BED9F',
  '#1E90FF', '#5352ED', '#FF4D94', '#2ED573',
  '#FF6B81', '#3742FA', '#00D2FF', '#E040FB',
]

export function getBubbleColors(): string[] {
  return isDay() ? BUBBLE_COLORS_DAY : BUBBLE_COLORS_NIGHT
}

export function getRandomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)]
}
