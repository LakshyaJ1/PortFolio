# Build contract — Lakshya Jain portfolio

Shared rules for everyone building on this codebase (human or agent). Read it fully before writing code.

## 1. What we're building

A one-page portfolio for **Lakshya Jain, AI Engineer** (Delhi). Facts live in `src/content/profile.ts`, the **only** source of truth. It mirrors his résumé. Never invent a number, client, testimonial, link or claim. If a demo needs data that doesn't exist (search results, sensor traces), author it at full fidelity and **label it as simulated** in the UI ("Simulated data").

**World: a night survey of a loss landscape.** The page is a topographic survey sheet at night. Contour lines are both terrain and the contour plot of an ML loss surface. His name, लक्ष्य, means *target*: the optimizer, the dead-reckoning cursor and the traverse all head for it. Concrete vocabulary we use:

- **Fix** (a confirmed position): actions, focus, the active state. Always survey-orange.
- **Contours** (the only ornament), **plain section names** (every heading carries a plain-language tag; grid refs A1…J9 are no longer shown to visitors, 2026-10-16), **legend**, **scale bar**, **traverse** (a survey path between stations), **benchmarks** (surveyed heights), **Easter eggs** (internally `caches`; visitors only ever see "Easter eggs"), **rendezvous** (booking).
- **Restricted area** is hatched. It's used for NDA work: show only the résumé wording.

Refuse: the dark-neon robot/particle-brain AI hero, purple gradients, glass-everything, identical card grids, typewriter "Hello I'm", stat-tile heroes and skill-percentage bars.

## 2. Design system (tokens in `src/app/globals.css`)

**Tone.** Every tone comes from the 11-step ramp `--z0…--z10`. Don't use ad-hoc hex or rgba greys.

| Token | Use |
|---|---|
| `--ground` (z1) | Page background |
| `--sheet` (z2), `--sheet-2` (z3) | Raised panels |
| `--line` (z4), `--line-strong` (z5) | Hairlines |
| `--contour` (z5), `--contour-index` (z6) | Contour strokes |
| `--ink` (z10) | Headings |
| `--ink-2` (z9) | Body |
| `--ink-3` (z8) | Secondary text (safe on sheets) |
| `--mute` (z7) | Labels on the ground only (4.5:1); on sheets use `--ink-3` |

- `--fix` / `--fix-hi`: survey orange, **for actions, fixes and active state only**. Text on fix is `--fix-ink`.
- `--hydro`: italic **water names only** (cartographic convention), opted into with `.hydro`. Section headings are region names: wide tracked caps (`Sheet` sets them); an `<em>` inside a heading takes no special styling.
- `--alert` for errors only. `--ok` for success only.
- Transparency is allowed for overlays and for canvas/WebGL drawing. For UI chrome, pick the ramp step instead.

**Type.**
- **Archivo** (variable, `font-stretch` 62–125%): everything. Width carries hierarchy.
  - **Range names**: `font-stretch: 125%`, caps, tracked `var(--track-range)` (the hero name and big map labels).
  - **Headings**: 100–110%.
  - **Dense labels**: 75–88%.
- **Martian Mono** (`--font-mono`, or `.label`/`.mono`): **only** coordinates, measurements, timestamps, code and data. Never as a "techy" costume.
- **Kalam** (`--font-kalam`): handwritten surveyor field notes in margins, pointing at interactive things ("drag me", "this one's live"). Sparingly, at most 1–2 per viewport.
- Noto Sans Devanagari (`--font-deva`) for Hindi.
- Scale: `--t-micro`, `--t-small`, `--t-body`, `--t-lead`, `--t-h3`, `--t-h2`, `--t-display` (max 6rem). Tracking never tighter than −0.04em. Body measure 65–75ch.

**Space.** `--s-1…--s-10`, `--gutter`, `--max` (1440), `--section-pad`. There is more space above a heading than below it.

**Motion.**
- One easing curve: `--ease` (expo-out), or `"expo.out"` in GSAP. Durations `--dur-1…4`.
- Elements are **visible by default**; motion enhances, it never gates content.
- Each section gets its own authored moment, not the same fade-up everywhere.
- GSAP + ScrollTrigger only, registered once. `@gsap/react` `useGSAP` with `scope`. SplitText, DrawSVG, ScrambleText and MotionPath are available free in `gsap/*`.
- Lenis is the scroller. Use `scrollToTarget()` from `@/lib/scroll` for programmatic scrolls. Elements that need their own wheel scrolling get `data-lenis-prevent`.

**Depth.** `--shadow-1`/`--shadow-2` (offset + blur). No zero-offset coloured glows. Radii `--r-1` (2px, the default, crisp survey feel), `--r-2`, `--r-3`, `--r-pill`.

**Layers.** `--layer-*` z-index tokens. Never use raw large z-index numbers.

**Craft-floor bans:**
- No eyebrow or kicker text above a heading. Each heading carries its plain-language tag (`SECTIONS[].plain`, rendered by `Sheet`) on the heading line.
- No gradient text, decorative glass/blur, coloured `border-left` accents thicker than 1px, hard offset shadows, emoji or unicode-as-icon, or hero-metric template.
- Icons come from `@/components/ui/Icon` (add new ones there in the same 1.5px stroke style if needed, and note it in your report).
- Theme every browser surface you touch: inputs, selection, scrollbars, focus, numerals (`font-variant-numeric: tabular-nums` for data).

## 3. Shared APIs (read-only for builders unless noted)

| Module | What it gives you |
|---|---|
| `@/content/profile` | `PROFILE`, `EXPERIENCE`, `EDUCATION`, `PROJECTS`, `SKILLS`, `ACHIEVEMENTS`, `GREETINGS` |
| `@/lib/sections` | `SECTIONS` (id, label, **plain** name, grid ref (internal only), mascot tip, keywords), `SectionId` |
| `@/lib/store` | `useApp`: `phase` (greeting→intro→site), `sound`, `plain` (recruiter "plain sheet" mode: heavy effects off), `overlay` + `openOverlay/closeOverlay`, `startGame(id)`, `activeSection`, `mascotMood`/`setMascotMood`, `say(line)`, `caches`/`findCache`, `toast()` |
| `@/lib/events` | `emit/on` typed bus: `cta:hover`, `cta:leave`, `section:enter`, `cache:found`, `booking:open`, `booking:done`, `form:error`, `agent:thinking`, `copy:email`, `intro:replay`, `target:lock`, `intro:stage` (opening stage progress), `guide:nudge` (point Bindu at a `data-guide` anchor, see docs/GUIDE.md) |
| `@/lib/discover` | `discover(cacheId)` logs an Easter egg (toast and event). Cache ids are in `@/lib/caches` |
| `@/lib/scroll` | `scrollToTarget(idOrEl)`, `getLenis()` |
| `@/lib/hooks` | `useReducedMotion`, `useFinePointer`, `useIsNarrow`, `useInView`, `usePageVisible`, `useCanRender3D`, `useLatest` |
| `@/lib/geo` | `formatDMS`, `formatDecimal`, `distanceKm`, `bearing`, `formatMonth` |
| `@/components/ui` | `Sheet` (section shell: id, title with one `<em>`, optional `aside`), `Button` (variant fix/line/quiet, `cta` id → mascot excitement, `href` for links), `Icon` |

Shared files (`globals.css`, `layout.tsx`, `page.tsx`, `AppShell.tsx`, everything in `src/lib/*`, `src/content/*`, `src/components/ui/*`) are **owned by the lead**. Don't edit them. If you need a change (a new event, store field, icon or token), put it under **"Integration requests"** in your final report with the exact diff. Meanwhile, keep local state in your own folder (a local zustand store or React state is fine).

## 4. Performance and resilience

- All WebGL/canvas is client-only: `next/dynamic(..., { ssr: false })` from a client wrapper, or mount after an effect.
  - Pause render loops when off-screen (`useInView`), when the tab is hidden (`usePageVisible`), and in `plain` mode.
  - Cap DPR at 1.75. Provide a designed static fallback for `useCanRender3D() === false`, reduced motion and `plain`.
- No runtime CDNs except the Cal.com embed and GitHub (via our own route handlers). No Google Fonts at runtime (next/font self-hosts).
- Next 16.4 with `cacheComponents: true`. Route handlers that fetch must put the fetch in a helper with `'use cache'` and `cacheLife(...)`. Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Secrets come from `process.env` server-side only.
- Every async thing has loading, empty and error states, designed in-world (e.g. "No fix — GitHub didn't answer. Showing the last surveyed log.").
- No horizontal overflow at 360–1920px. Touch works everywhere (no hover-only information). Keyboard reaches everything.
- `prefers-reduced-motion` gets a calm, complete version, not a broken one.

## 5. Verifying your work

- The lead keeps a dev server running at **http://localhost:3000**. Do **not** start another server or run `next build` (it shares `.next`).
- Open **http://localhost:3000/?skipintro** to skip the greeting and intro.
- Use `playwright-cli` with **your own session name** (`-s=<yourname>`).
- Save screenshots under `D:/Projects/Portfolio_website/.qa/<yourname>/`, JPEG where possible. **The C: drive is nearly full, so write nothing large there.**
- Check 1440×900 and 390×844, and read `playwright-cli -s=<you> console` for errors.
- Type-check with `npx tsc --noEmit -p .` and only act on errors in your own files. Others are mid-edit.
- If someone else's half-finished file breaks the page, don't touch it. Test in isolation instead: you may create a dev-only route at `src/app/lab/<yourname>/page.tsx` that renders just your components (the lead deletes `/lab` before shipping). Every section and global layer is wrapped in an error boundary, so a runtime error in one usually leaves the rest standing; watch the console for `[sheet] "<name>" failed to render`.
- Write whole files in one go rather than leaving a file syntactically broken between edits. Everyone shares one HMR server.
- Do not install npm packages (package.json is shared) unless your brief explicitly allows it. Ask in your report instead.
- At most two inspection rounds: build fully, inspect once (desktop + mobile together), fix in one batch, confirm once.

## 6. Final report (your last message)

1. Files created/changed.
2. What each piece does and how to trigger it (especially any hidden interactions).
3. Integration requests (exact diffs to shared files).
4. Known gaps or follow-ups.
5. Screenshot paths.
