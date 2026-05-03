// components/cosmos/types.ts
//
// Shared types for the Cosmos UI. Mirrors the Supabase row shape used by
// the existing app/page.tsx and app/poll/[id]/page.tsx.

export interface Poll {
  id: string;
  question: string;
  option_1: string;
  option_2: string;
  expires_at?: string | null;
}

export interface PollWithVotes extends Poll {
  voteCount: number;
  totals?: VoteTotals;
}

export interface VoteTotals {
  /** votes for option_1 */
  a: number;
  /** votes for option_2 */
  b: number;
  total: number;
}

export interface CosmosPalette {
  /** option_1 colour */
  colorA: string;
  /** option_2 colour */
  colorB: string;
  /** glow / atmosphere tint */
  glow: string;
  /** human-readable topic label (for accessibility) */
  topic: string;
}

export interface OrbitBubble {
  kind: 'poll' | 'ask';
  id: string;
  /** computed orbit ring radius in px */
  ring: number;
  /** angular phase in radians */
  phase: number;
  /** angular velocity in rad/s */
  speed: number;
  /** base bubble radius in px */
  baseR: number;
  /** orbit centre x */
  cx: number;
  /** orbit centre y */
  cy: number;
  /** small bobbing offsets */
  bobPhase: number;
  bobAmp: number;
  /** poll-only fields */
  poll?: PollWithVotes;
  palette?: CosmosPalette;
}
