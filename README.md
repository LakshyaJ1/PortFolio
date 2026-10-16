# Lakshya Jain — portfolio

A one-page portfolio built as **a night survey of a loss landscape**. The page is a topographic sheet: contour lines are both terrain and the loss surface of a model, and लक्ष्य (*target*) is the global minimum everything heads toward.

Built with Next.js 16 (App Router, Cache Components), React 19, TypeScript, CSS Modules, GSAP, Lenis, three.js / react-three-fiber / rapier, Cal.com, and the Gemini API.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

Useful URLs while developing:

| URL | Does |
|---|---|
| `/?skipintro` | skip the greeting and the talking-avatar intro |
| `/?intro` | force the greeting and intro, even on a repeat visit |
| `/?binduNap=3` | Bindu falls asleep after 3 s (instead of 30 s) |

## Environment variables

Copy these into `.env.local` locally and into Vercel → Project → Settings → Environment Variables. Everything works without them; each one upgrades a feature.

| Variable | Used by | Without it |
|---|---|---|
| `GEMINI_API_KEY` | "Ask Bindu" live agent (`/api/agent`, Google Gemini). Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Bindu answers from an offline field guide built from `profile.ts`; her guided tour works either way |
| `GEMINI_MODEL` | optional model override for the agent (`BINDU_MODEL` still works as an alias) | `gemini-3.5-flash-lite` |
| `GITHUB_TOKEN` | contribution terrain via GraphQL, higher API limits | falls back to a public mirror, then the committed snapshot `src/data/github-snapshot.json` |
| `NEXT_PUBLIC_SITE_URL` | canonical URLs, OG image, sitemap | `http://localhost:3000` |

`NEXT_PUBLIC_BUILD_SHA` is filled from `VERCEL_GIT_COMMIT_SHA` automatically and shows in the footer's title block.

## Editing content

Every fact on the site comes from **`src/content/profile.ts`**. Edit that file: the sections, the terminal, the AI agent's knowledge, `llms.txt`-style answers and the field pass all read from it. Never add a claim that isn't on the résumé.

Section order, grid references and Bindu's per-section tips live in `src/lib/sections.ts`. The 12 hidden geocaches are listed in `src/lib/caches.ts`.

## The talking-avatar intro

After the hellos, the visitor taps once (that tap is what lets the browser play sound). Lakshya's avatar then appears in the left third of the screen, standing on the terrain, and introduces himself. His captions run beside him, and on the right sit a big **Download résumé** button and a few options (Enter the site, Field terminal, Play snake, Voice). Until the real clips exist it runs in **placeholder mode**: a contour-line stand-in figure with the browser's voice.

To switch on the real avatar:

1. **Clips.** Follow `avatar/PROMPTS.md`: a green-screen character image, then four Google Flow clips. Save them in `assets-inbox/` (git-ignored) as:
   - `clip-A-intro.mp4`
   - `clip-B-offer.mp4`
   - `clip-C-idle.mp4`
   - `clip-D-wave.mp4`
2. **Build.** Run `npm run hero:build` (Python 3 with numpy + Pillow, and ffmpeg on PATH). It:
   - keys out the green;
   - packs each clip as a "stacked-alpha" MP4 (colour on top, matte below), which a small WebGL shader composites in every browser, Safari included;
   - keeps the voice Flow generated with each speaking clip;
   - shortens the wave (skips its static opening and plays it 1.5× faster, still ending in the intro's pose);
   - times the captions to each clip's real mouth pauses;
   - writes `poster.png`, `portrait-bust.webp` (used on the 3D field pass) and `manifest.json` (version 2) into `public/hero/`.

The site switches from placeholder mode to the real avatar automatically.

## Bindu, the mascot

Bindu is built with [Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab) by Stéphane Montlouis-Calixte. **Licence note:** its packages are **AGPL-3.0**. Shipping them on a public site generally means this site's source should be available under AGPL-compatible terms (a public repo with this README is the simplest way). The library is isolated in `src/components/mascot/BinduAvatar.tsx`; swapping in another renderer only touches that file. See `QUESTIONS.md` (M1).

## Hidden things (spoilers)

<details>
<summary>The 12 Easter eggs</summary>

The in-site Easter egg logbook (footer, or type `logbook` in the terminal) lists all of these openly.

| Easter egg | How to find it |
|---|---|
| Secret terminal | press `` ` `` (the key left of 1), or use the terminal on the landing screen |
| Rover keys | Konami code: ↑ ↑ ↓ ↓ ← → ← → B A → GPS-denied rover game |
| Target lock | type `lakshya` anywhere on the page |
| Magnetic north | tap the footer's north arrow 5 times quickly |
| Lakshyacoin | the stray coin at the end of TokenForge's supply bar → proof-of-work miner |
| Restricted area | knock 3 times on the hatched NDA entry in Experience → "spot the manipulated signal" game |
| Developer console | open DevTools and call `lakshya.help()` |
| Night watch | leave Bindu alone for about 40 s |
| Poke | click Bindu 7 times fast |
| Half marathon | scroll from top to bottom in under 25 s |
| Off the map | visit any page that doesn't exist (snake on a survey grid) |
| Global minimum | drop a marble on the hero terrain and let it settle at the lowest point |

Also: Cmd/Ctrl+K opens "Ask Bindu"; press-and-hold the hero terrain to raise a hill (Shift to sink); the footer's "Plain sheet" switch gives a fast, effects-free read.

Internally these are still called "caches" (`src/lib/caches.ts`, the `caches` store field) so returning visitors keep their saved progress.
</details>

## Project map

```
src/content/profile.ts      the résumé as typed data (single source of truth)
src/lib/                    store, events, sections, caches, scroll, geo, hooks
src/components/intro/       greeting (12 hellos) + talking-avatar stage
src/components/sections/    hero, about, capabilities, traverse, sites, legend, log, benchmarks, rendezvous
src/components/terrain/     contour terrain toolkit (WebGL shader + marching squares)
src/components/chrome/      nav, sheet index, traverse rail, collar (footer), fix cursor
src/components/mascot/      Bindu + the "Ask Bindu" agent drawer
src/components/eggs/        terminal, logbook, games, console API, 404
src/app/api/                agent (Gemini) and GitHub route handlers
scripts/build-hero-assets.py  intro video pipeline
docs/BUILD.md               team build contract (design system, rules)
docs/RESEARCH.md            what was borrowed from which portfolios
```

## Credits and licences

- Fonts: Archivo, Martian Mono, Noto Sans Devanagari, Kalam: SIL Open Font License (self-hosted via `next/font`).
- GSAP: free under the GSAP Standard License. Lenis: MIT. three.js, react-three-fiber, drei, rapier: MIT. Cal.com embed: MIT.
- Bible Strong Avatar Lab packages: AGPL-3.0 (see above).
