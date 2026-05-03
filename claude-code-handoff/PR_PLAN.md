# PR Plan — Land Cosmos UI

A safe, reviewable rollout that ships in **3 small PRs** instead of one
risky giant one. Each PR is independently mergeable and reverts cleanly.

---

## PR 1 — Foundation (zero behavior change)

**Goal:** add new files without changing what the app renders.

### Changes
- Add `components/cosmos/*` (all 9 files).
- Add the new exports to `lib/theme.ts` (keep the old ones).
- Append the new keyframes/classes to `app/globals.css`.

### Verify
- `npm run build` — clean.
- `npm run dev` — `/`, `/poll/[id]`, `/create`, `/dashboard*` all look
  identical to `main`.
- New files are not imported anywhere yet, so they tree-shake out.

### Risk
None. Pure addition.

---

## PR 2 — Cosmos home

**Goal:** replace the wrap-grid Home with the orbit scene.

### Changes
- Replace `app/page.tsx` with the Cosmos version.

### Verify
- `/` shows orbit + hint + day/night sky.
- Clicking a planet pushes to `/poll/[id]` (existing route).
- The `+ ask the world` planet routes to `/create`.
- Empty-state copy still appears when there are no polls.
- Loading state still appears while Supabase fetches.

### Rollback
`git revert` this PR — `/` returns to the wrap grid. The poll page is
still the original; everything else is untouched.

### Risk
Low. The data layer is unchanged — same Supabase queries, same fields.

---

## PR 3 — Cosmos poll page

**Goal:** replace the vote/results screen with the Cosmos two-planet
layout + radial demographic charts.

### Changes
- Replace `app/poll/[id]/page.tsx` with the Cosmos version.

### Verify
- `/poll/[id]` renders two big planets with the question between them.
- Tap a planet → POST `/api/vote` (unchanged).
- Demographic form appears, then radial results.
- "Change vote" still works inside the 10-min window
  (PATCH `/api/vote`).
- Share button copies URL.
- Report button posts to `/api/report`.
- Expired polls show the "closed" message.

### Rollback
`git revert` — poll page returns to the original two-bubble layout.

### Risk
Low-medium. This page has the most state (voting / demographic /
results stages). The state machine is preserved verbatim from the
original — only the visual layer changes.

---

## Manual QA checklist

Run before each PR ships to production.

### Visual
- [ ] Day mode (10am): pale sky, soft clouds, warm sun
- [ ] Night mode (10pm): deep navy, starfield twinkle, cool moon
- [ ] `prefers-reduced-motion: reduce` → planets static, sky still
- [ ] iOS Safari: no scroll jitter (uses `100dvh`)
- [ ] Android Chrome: planets reachable on 360px width

### Functional
- [ ] First-time visitor sees orbit + hint
- [ ] Click planet → poll page
- [ ] Vote → demographic form → results
- [ ] Refresh on results page → results re-load (FingerprintJS recognizes user)
- [ ] Change vote within 10 min → other planet highlights
- [ ] After 10 min → tap is a no-op, helper text gone
- [ ] Share → URL in clipboard
- [ ] `+ ask` planet → `/create`
- [ ] Create poll, click magic link → publishes, appears in orbit on next load
- [ ] `/dashboard/request` and `/dashboard` unaffected

### Performance
- [ ] Lighthouse Performance ≥ 90 on `/`
- [ ] No layout shift on planet entrance
- [ ] Frame time < 4ms during orbit (Chrome DevTools Performance)

---

## Notes on backporting hot-fixes

If a critical bug is found in production after PR 3 ships, two options:

1. **Quick revert.** `git revert` PRs 2+3 → app returns to old UI in
   minutes. PR 1 stays in (it adds nothing user-visible).
2. **Forward fix.** All Cosmos components are isolated under
   `components/cosmos/`, so a follow-up PR touches only those files.

---

## Future work (out of scope for this hand-off)

- Real-time updates (Supabase realtime → planet vote counts re-pulse).
- Per-poll color overrides (creator picks topic color in `/create`).
- Reduced-motion alternative: a static infographic view of the orbit.
- Persisted "+ ask" copy variants (A/B test).
