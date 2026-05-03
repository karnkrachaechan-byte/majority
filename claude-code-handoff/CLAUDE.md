# Cosmos UI — Integration Guide for Claude Code

This package ports the **Cosmos** redesign from the design exploration into the
existing `karnkrachaechan-byte/majority` Next.js 16 / React 19 / Supabase /
Tailwind 4 app.

It is a **drop-in replacement** for the floating-bubbles UI on `/` and the
voting flow on `/poll/[id]`. All existing API routes, the Supabase schema,
FingerprintJS, Resend, and the dashboard flow remain untouched.

---

## What changes, what doesn't

### Replaced
- `app/page.tsx` — orbit of planets around a low-center anchor + pulsing
  "tap me" hint + day/night sky (clouds vs starfield) + an `+ ask` planet
  that links to `/create`.
- `app/poll/[id]/page.tsx` — reuses the orbit visual on the poll page,
  adds A↔B vote-share rim arcs to each planet, gradient/solid bubble style,
  radial demographic charts, and a graceful results stage transition.
- `lib/theme.ts` — extended with the Cosmos topic palette + a deterministic
  poll → palette assignment helper, while preserving the existing
  `BUBBLE_COLORS_DAY`/`BUBBLE_COLORS_NIGHT` exports so any other consumer
  keeps working.

### Untouched
- All `app/api/*` routes (`vote`, `check-vote`, `create-poll`, `verify`,
  `update-demographic`, `report`, `dashboard-link`, `my-polls`)
- Supabase schema (`polls`, `votes` tables — same column names)
- `lib/supabase.ts`, `lib/supabase-admin.ts`
- FingerprintJS anonymous-voting flow
- Resend magic-link verification
- `app/create/page.tsx`, `app/dashboard/*`
- `app/globals.css` is **augmented**, not replaced — see below

### Augmented (additive only)
- `app/globals.css` — new keyframes (`cosmosOrbit`, `cosmosPulse`,
  `cosmosFadeUp`, `cosmosTwinkle`) and helper classes added at the bottom.
  Existing rules are kept verbatim.

---

## Constraints honored

| Constraint | How |
|---|---|
| Keep floating bubbles as core UI | Every poll is a planet that orbits — no list view, no grid fallback. |
| Day/night auto theme | `useDayNight()` hook reads `lib/theme.ts:isDay()` and re-checks every 60s. |
| Two-option voting mechanic | Each planet shows a thin rim arc split A/B based on current totals; on the poll page the user taps option 1 or option 2. |
| No sign-up | Anonymous voting via existing FingerprintJS path is unchanged. |
| Next.js 16 / React 19 | All components are `'use client'`, no Server Actions added, no new dependencies. |

---

## File-by-file

```
claude-code-handoff/
├── CLAUDE.md                          # this file
├── PR_PLAN.md                         # step-by-step for landing the change
├── app/
│   ├── page.tsx                       # Home — Cosmos orbit
│   ├── globals.css                    # ADDITIVE patch — append to existing file
│   └── poll/
│       └── [id]/
│           └── page.tsx               # Poll page — Cosmos vote+results
├── components/
│   └── cosmos/
│       ├── CosmosScene.tsx            # Shared scene: sky + sun/moon + orbit ring
│       ├── PlanetBubble.tsx           # A poll rendered as a planet
│       ├── AskPlanet.tsx              # The "+ ask the world" empty planet
│       ├── DaySky.tsx                 # Soft clouds + sun
│       ├── NightSky.tsx               # Starfield + moon
│       ├── DemographicRings.tsx       # Radial charts for the results stage
│       ├── useOrbit.ts                # Orbit-position math hook
│       ├── useDayNight.ts             # isDay() + auto-refresh hook
│       └── types.ts                   # Poll / Bubble / Totals types
└── lib/
    └── theme.ts                       # Augmented palette + assignPalette()
```

---

## Hand-off notes for Claude Code

1. **Do not rename existing API routes or Supabase columns.** The Cosmos
   components consume the same data shape your current `app/page.tsx` uses
   (`polls.id, question, option_1, option_2, expires_at, is_active`,
   `votes.choice, voter_age, voter_gender, can_change_until, fingerprint,
   ip_address`).
2. **Treat `lib/theme.ts` as additive.** Existing exports stay. New named
   exports: `COSMOS_TOPICS`, `assignPalette(pollId)`,
   `getDayNightSky(isDay)`. Anything that imported `BUBBLE_COLORS_DAY`,
   `BUBBLE_COLORS_NIGHT`, `getBubbleColors`, `getRandomColor`, or `isDay`
   continues to work.
3. **`app/globals.css` patch is APPEND-only.** See the file header comment
   for the boundary. Never delete the existing `float`, `zoomFill`,
   `fadeIn`, `bubble*`, `vote-bubble*`, or `vote-row` rules — they are
   still used by `/create` and `/dashboard`.
4. **No new npm packages.** Animation is CSS keyframes + a single
   `requestAnimationFrame` loop in `useOrbit.ts`. No framer-motion,
   no popmotion, no react-spring.
5. **Tailwind 4 is configured but the cosmos components use inline styles**
   for the dynamic bits (positions, colors). This matches the existing
   codebase's style conventions in `app/page.tsx` / `app/poll/[id]/page.tsx`.
   Static layout still uses Tailwind utility classes where appropriate.
6. **Performance.** The orbit loop runs at ~60fps but only writes
   `transform` (`translate3d`) — no React re-renders per frame. With ~30
   planets this stays well under 1ms/frame.
7. **Accessibility.**
   - Each planet is a `<button>` with `aria-label="{question}"`.
   - The orbit respects `prefers-reduced-motion`: if true, planets stop
     at their initial positions (still readable, no animation).
   - Focus order follows DOM order; tab cycles planets left-to-right.
   - Color is never the only signal — totals are also given as text.
8. **Mobile.** The scene is `100vw × 100dvh` (uses `dvh` to handle iOS
   browser chrome). Orbit radius scales with viewport diagonal so planets
   stay reachable on small screens.

---

## Environment variables (unchanged)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
NEXT_PUBLIC_APP_URL=...
```

No new env vars introduced.

---

## After landing

Manual smoke test (`npm run dev`):

1. `/` — see planets orbiting, hint near the largest planet, day/night
   matches `new Date().getHours()`.
2. Click a planet → routes to `/poll/[id]`.
3. Vote on option 1 or 2 → demographic form → results stage with
   radial breakdowns.
4. The `+ ask the world` planet routes to `/create`.
5. `/create`, `/dashboard`, `/dashboard/request` look unchanged
   (we did not touch them).

If all five pass, the migration is complete.
