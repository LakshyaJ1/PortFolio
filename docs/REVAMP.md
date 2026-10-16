# Revamp round 2026-10-16: shared brief for the parallel build agents

Lakshya reviewed the live site and asked for one big pass. This file is the contract every agent works to. Read it fully, then `docs/BUILD.md` (design tokens and rules), then your own files.

## What Lakshya wants, in his words, condensed

The site must be **visually appealing, catchy and graspable at a glance**. A visitor should not have to read paragraphs or decode jargon to get it.
- **Less vertical space everywhere and less scrolling.** Use horizontal scrolling where it helps (Projects).
- **Key text bigger.** Important points should be visually eye-catching: badges, highlights, numbers.
- **Plain language wherever the map metaphor confuses.** Lakshya could not tell what "A1 sheet / index" in the nav, "Surveyed sites", "Legend" or the footer "sheet" meant. Keep the identity (night survey of a loss landscape: dark topographic sheet, contour lines, orange `--fix` for actions), but **clarity wins over metaphor**. Every section must say plainly what it is (Projects, Experience, Tech stack…).
- **Bindu becomes a floating, interactive guide** who walks every visitor through the site.
- **Booking must be reachable within the first 10 seconds.**

## Rules (all agents)

1. **Own only your files** (ownership map below). Need a change in a file you don't own? Don't make it. Put it under "Requests for other owners" in your final report. Exception: adding a `data-guide="…"` attribute to an element you render (see `docs/GUIDE.md`).
2. **Facts come only from `src/content/profile.ts`.** Never invent a claim, number, company or link. Lakshya asked for these, and they are already in profile.ts:
   - CGPA shows as **9.0+**;
   - his roles are `PROFILE.roles` (AI Engineer, Software Development Engineer, Full-stack developer, 3D web developer);
   - `PROFILE.offer` is the client-facing line.
3. **This machine is very low on RAM** (~2–3 GB free, 15.7 GB total). Strictly:
   - **Never** run `next build`, `next dev`, `npm run dev/build/start`, `tsc` directly, `playwright-cli`, or any browser of your own.
   - A shared dev server is already running at **http://localhost:3007** with hot reload. Your saves show up there.
   - **Type-check and lint** only through the serialized tool, which runs whole-project `tsc` plus ESLint on the files you name, one agent at a time:
     `node .qa/tools/check.mjs <your changed files…>`
     Run it when you think you're done, and fix everything in your files. Errors in files you don't own belong to another agent; ignore them unless your change caused them.
   - **Screenshots** only through the serialized tool, one browser at a time: `node .qa/tools/shot.mjs --name <you>-<n> --section <id> [--width 390 --height 844] [--scroll px] [--intro --click x,y --after ms] [--full]`. Images land in `.qa/shots/` (read them with the Read tool). Use it to judge your work at **1440×900 and 390×844**, but keep it to about 10 shots. If a shot shows a Next error overlay from a file you don't own, another agent is mid-edit; retry a minute later.
   - Don't `npm install` anything unless your brief explicitly allows it.
4. **Keep quality bars:** no horizontal page overflow at 390 px; keyboard and focus work; `prefers-reduced-motion` is honoured; "plain sheet" mode (`useApp((s) => s.plain)`) still gives a fast, effects-free read; no console errors; no layout shift on load. Prefer CSS and the libraries already installed (GSAP + ScrollTrigger, Lenis, three / R3F / drei, zustand).
5. **Write code like the surrounding code:** CSS Modules, design tokens from `globals.css`, same comment density and naming.
6. **Finish with a report:**
   - what you changed and why (short);
   - files touched;
   - `data-guide` anchors you added;
   - check.mjs result;
   - which shots you looked at;
   - requests for other owners;
   - anything you couldn't do.

## Shared contracts already in place

- `src/lib/events.ts` adds `"intro:stage"` (the opening stage's progress) and `"guide:nudge"` (ask Bindu to point at an anchor). Emit with `emit(...)` and listen with `on(...)`.
- `docs/GUIDE.md`: the `data-guide` anchor names Bindu flies to. **Add the ones listed for your area.**
- `src/content/profile.ts`: `PROFILE.roles`, `PROFILE.offer`, CGPA 9.0+.
- The terminal opens with `useApp.getState().openOverlay("terminal")`; games with `useApp.getState().startGame("snake")`.

## Ownership map

| Agent | Owns |
|---|---|
| intro | `src/components/intro/**` |
| hero | `src/components/sections/hero/**` |
| chrome | `src/components/chrome/**`, `src/components/ui/**`, `src/app/globals.css`, `src/lib/sections.ts`, `src/app/page.tsx` |
| about | `src/components/sections/about/**` |
| work | `src/components/sections/capabilities/**`, `src/components/sections/traverse/**` |
| projects | `src/components/sections/sites/**` |
| lower | `src/components/sections/legend/**`, `log/**`, `benchmarks/**`, `rendezvous/**` |
| eggs | `src/components/eggs/**`, `src/lib/caches.ts`, `src/lib/discover.ts`, README "Hidden things" section |
| bindu | `src/components/mascot/**`, `src/server/agent/**`, `src/app/api/agent/**`, `src/lib/store.ts`, `src/components/shell/**`, `package.json` (Gemini SDK only), README "Environment variables" section, `.env.example` |

`src/lib/events.ts` and `src/content/profile.ts` are frozen for this round (the lead already edited them). Ask in your report if you need more.
