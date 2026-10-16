# Handoff: where the portfolio build stands

_Last updated: 2026-10-16. Read this first when resuming (human or Claude)._

## Latest: revamp round (2026-10-17)

Lakshya's review was turned into one big pass by 9 parallel agents. The brief and contracts are in `docs/REVAMP.md` and `docs/GUIDE.md` (Bindu's `data-guide` anchors).

| Area | What changed |
|---|---|
| Voice | Cloned voice dropped at Lakshya's request. The clips use Flow's own voice, and the voice-clone env, scripts and models are deleted. The wave skips its static first second and plays 1.5× (6.0 s → 3.3 s). |
| Greeting | Hellos at `TEMPO = 1.4` (~3.8 s). A click or key during the hellos goes straight in **with voice** (it's the gesture browsers need). |
| Intro stage | 3D contour ground that pulses with his voice, beacons, parallax. "Enter the site" is a bright slab with a 6 s auto-enter countdown (pauses on hover, focus, overlays or a hidden tab). |
| Hero | Rotating roles (`PROFILE.roles`), offer line, availability chip, **Book a 30-min call** popup in the first screen, an inline mini terminal, and a clearer marble CTA. |
| Chrome | Plain nav (current section + Menu + Résumé + Book a call); grid refs gone from the UI. Each heading carries a plain tag. Booking moved right after Projects. Section gaps about halved. The footer is rebuilt in plain words. |
| About | Lanyard flicker fixed at the root (meshline's aspect bug, replaced by a CPU strap). The ID card face is unlit and crisp. Large facts with **CGPA 9.0+**. |
| Work | Capabilities fits in one screen with big lines and figures. The experience timeline draws on scroll, with date chips and a CURRENT badge. |
| Projects | A single horizontal row (pinned on desktop, swipe on phones), an animated contour backdrop, clear cards, and a big "Turn the sheet". |
| Lower | Tech stack as rock layers with brand marks and "where he used it" cards. Compact GitHub log, achievements strip and booking section. |
| Eggs | "Easter eggs" everywhere, hints shown openly as direct instructions, a terminal welcome with starter commands. |
| Bindu | **Gemini** brain (`GEMINI_API_KEY`, default `gemini-3.5-flash-lite`). A floating guide with tours of the intro and hero, one line per section, egg nudges, "Quiet, Bindu", and placement that never covers the target, controls or the nav. |

Verified on production (`.qa/tools/visitor.mjs`, a whole first-visit journey at 1440×900 and 390×844): 0 console errors, 0 failed requests, 0 horizontal overflow at every step, and all guide anchors present. Page height 18.2k → 12.5k px on desktop.

QA tools for later rounds, all serialized for this low-RAM machine:
- `node .qa/tools/check.mjs <files>`: tsc + eslint.
- `node .qa/tools/shot.mjs --base http://localhost:3005 --section <id>`: screenshots.
- `node .qa/tools/visitor.mjs --base …`: the full visitor journey.

**Live on Vercel (2026-10-17): https://lakshya-jain-six.vercel.app**
- Vercel account: `lakshyaj1`. Project: `lakshya-jain`. The folder is linked via `.vercel/` (git-ignored).
- `GEMINI_API_KEY` is set in Vercel as a sensitive variable for production and preview. Bindu reports online with `gemini-3.5-flash-lite`.
- `vercel.json` pins the framework to Next.js. The canonical URL comes from `VERCEL_PROJECT_PRODUCTION_URL` (see `src/lib/site.ts`) unless `NEXT_PUBLIC_SITE_URL` is set.
- To redeploy after changes, run `npx vercel@62.2.0 deploy --prod` from the project folder. It's not a git repo yet, so deploys are manual; connecting a GitHub repo gives automatic deploys.
- `lakshya-jain.vercel.app` belongs to someone else. A custom domain can be added in Vercel → Project → Domains.
- The live visitor walk passed: 0 errors, 0 failed requests, 0 overflow, all anchors present.

Open items:
- the CGPA vs PDF mismatch (QUESTIONS C2b);
- the AGPL decision for the mascot library (M1);
- an optional `GITHUB_TOKEN` (the log uses the public mirror without it).

`.vercelignore` keeps raw inputs, personal PDFs and env files out of the upload.

## Earlier: avatar v2 (2026-10-16)

_Superseded in part: the voice clone (Chatterbox, `clone-voice.py`, `voice:clone`, `D:\tools\voice-env`) was removed on 2026-10-17. The voice notes below are history only._

After the hellos, the visitor taps once; that tap is the browser's sound-unlock. Lakshya's real 3D avatar then appears in the **left third**, standing on the terrain at a survey station, and speaks two lines in **his cloned voice**. Captions run in the middle. On the right: a big **Download résumé**, Enter the site, Field terminal, Play snake and Voice. The clips are wave → intro → offer, then an idle loop; clicking him waves. Code: `src/components/intro/*`.

| Piece | State |
|---|---|
| Flow clips (A intro, B offer, C idle, D wave), green screen, 9:16 | ✅ in `assets-inbox/` |
| Keying pipeline v2: green key + despill, "✦" watermark garbage-matte, alpha levels, stacked-alpha MP4s, captions | ✅ `scripts/build-hero-assets.py` (`npm run hero:build`) |
| Voice clone: Chatterbox-Turbo, local GPU (venv `D:\tools\voice-env`, weights `~/.cache/hf-voice`) | ✅ `scripts/clone-voice.py` (`npm run voice:clone`) |
| Voice fitted to the clips' mouth timing, phrase by phrase | ✅ the aligner tries every combination of the take's pauses against the clip's mouth pauses and keeps the gentlest stretch. Chunks are padded up to 80 ms into silence, so soft onsets and decays survive, with 8 ms fades. Intro: 2 phrases; offer: 3 phrases |
| Captions | ✅ each caption change snaps to the moment his mouth resumes after a pause (no mid-word flips) |
| Installed in `public/hero/` | ✅ intro = take A3; offer = **round-2 take 3** (the only take whisper-small transcribes word-perfect; "client work" is right). The old takes are in `assets-inbox/voice-takes/round1/` |
| Weak spot | The closing "my résumé's right here" is soft (TTS slurs the `resumay's` respelling). Spelling variants are in `assets-inbox/voice-takes/round3/` (see the latest session notes) |
| Preview to listen to | `assets-inbox/preview-avatar-your-voice.mp4` (older mix; play the site for the current one) |

How takes were judged: `whisper-small.en` on the GPU (tiny and base mishear synthetic speech too often to rank takes), in full-line context (isolated 1–2 s phrases transcribe as nonsense even when clean), and on the **final** clip audio after stretching, not only the raw take.

Verified on real production (:3005, 1440×900, headless Chrome):
- `stage-walk.js`: greeting → tap → avatar speaking with captions → site, with 0 errors and 0 overflow.
- `walk.js`: all 8 sections, `#about` 3D field pass included (renders with the real portrait), with 0 errors, 0 failed requests and 0 overflow.

The earlier `#about` crash didn't reproduce, so it was memory pressure. Still give it one look on a phone before shipping.

**Not done (machine limits):** a third round of offer takes to firm up "my résumé's right here" segfaulted on model load with both drives under 1 GB free. To retry after freeing space:
1. Tweak `PRONOUNCE["résumé's"]` in `scripts/clone-voice.py` (e.g. leave `résumé's` as is, or `rez-oo-may's`).
2. Run `npm run voice:clone -- --lines B --takes 4`.
3. Judge the takes with whisper-small.

**Careful:** the clone run copies its take 1 over `assets-inbox/voice-B.wav`. The current pick is archived as `assets-inbox/voice-takes/round2/voice-B-take3.wav`, the voice in today's `public/hero/offer.mp4`. Copy it back if no new take beats it.

**Ports.** 3000 is taken by another local app (HiveMind). A stray `next dev` from this project also sits on **3001** (Next auto-picked it when 3000 was busy). It binds IPv6 too, so `localhost:3001` silently lands on dev, not prod. Production now runs on **3005**. `.qa/final/stage-walk.js` targets 3005.

## How to see it

```bash
cd D:\Projects\Portfolio_website
npm run build
npm start -- -p 3005     # production: http://localhost:3005   (phone on same Wi-Fi: http://192.168.1.3:3005)
# or, for development with hot reload:
npm run dev              # http://localhost:3000
```

- `/?skipintro` skips the greeting and intro. `/?intro` forces them.
- The intro plays once per browser session. Open a fresh private window to see the full greeting and intro again.

## Status

| Stage | State |
|---|---|
| Research: 7 agents over ~270 portfolios + heysai.dev teardown | ✅ done → `docs/RESEARCH.md` |
| Product record + open questions | ✅ `PRODUCT.md`, `QUESTIONS.md` (waiting on Lakshya's answers) |
| Design direction (night survey of a loss landscape) | ✅ `.impeccable/surfaces/src-app-page-tsx.md` (direction contract, seed 6732c8d4, code-led) |
| Foundation: tokens, store, Lenis/GSAP, section shell, error boundaries | ✅ `src/app/globals.css`, `src/lib/*`, `src/components/ui/*`, `src/components/shell/*` |
| Build: 8 parallel builders (intro, hero, chrome, about+traverse, capabilities+sites, legend+log+benchmarks+rendezvous, eggs+games, mascot+agent) | ✅ all built and integrated |
| Quality gates | ✅ `next build` clean · `tsc` clean · `eslint` 0 problems · prod walk at 1440 + iPhone 15: 0 console errors, 0 failed requests, 0 horizontal overflow |
| Lighthouse (desktop, before fix round) | Perf 77 · A11y 93 · Best practices 100 · SEO 100 (a11y issues since fixed; rapier now lazy-loaded) |
| Independent finish review (impeccable) | Disposition **fix**: 8 material fixes, **all applied and re-verified** (see below) |
| Re-check after fixes | ✅ `next build` clean · `tsc` clean · `eslint` 0 · prod walk at 1440 + iPhone 15: 0 errors, 0 failed requests, 0 overflow |
| **Next: verdict pass** | ⏳ recapture + send to a fresh finish reviewer to score the 8 fixes |
| **Then: DESIGN.md** | ⏳ run the impeccable documenter on the finished build |

### The 8 review fixes (applied in round 1)

1. Section headings are now map **region names** (wide tracked caps). Hydro-blue italic is kept for water names only.
2. The labelled "eyebrow" rows above headings are removed. The sheet edge is now a plain ticked rule, and counts sit on the heading line.
3. Bindu's notes and body no longer cover text, the booking embed or "Book a call". Notes clear on section change.
4. The mobile hero fits the first viewport ("Book a call" visible on 393×659, 360×640, 390×844).
5. Benchmarks always finish revealing; count-ups land on résumé values.
6. Handwritten Kalam notes are cut to the instructional ones: hero gesture, field pass, SETU back panel, intro voice prompt.
7. Martian Mono is used only for coordinates, measurements, timestamps and hashes. Tags, labels and relative times are Archivo condensed.
8. The Field-notes statement inks from a readable tone (z7, 4.5:1). Screen readers get the plain sentence.

Ceiling note, also done: the intro "light table" is now 88svh tall (a full-page avatar), with the figure head to toe and the range caps hard-cropped at the viewport edges.

## What's waiting on Lakshya (`QUESTIONS.md`)

- **A1 photo** → needed for the 3D character / talking avatar.
- **A2** → allow Edge remote debugging (`edge://inspect/#remote-debugging`) so Claude can drive ChatGPT/Gemini/Flow, **or** run `avatar/PROMPTS.md` yourself and drop `assets-inbox/intro.mp4`, then `npm run hero:build`.
- **M1** AGPL decision for the mascot library.
- **M2** `ANTHROPIC_API_KEY` (live agent; offline mode works without it).
- **H2** a fresh `GITHUB_TOKEN` (the current local one returns 401).
- Phone visibility, availability line, domain, analytics, and so on.

## Next steps, in order

1. **Verdict pass.** Run `npm run build`, start prod on :3005, then recapture (earlier "prod" walks on :3001 may have hit the stray dev server; re-run them all on 3005):
   - `.qa/final/walk.js` and `.qa/final/stitch.js` via `playwright-cli run-code`.
   - Stitch frames into `.impeccable/review/desktop.png` and `mobile.png` (see the Python one-liner used before).
   - Spawn `impeccable-finish-reviewer` fresh with the original packet plus "verdict pass: score the 8 fixes resolved/partial/unresolved".
2. **Documenter.** Spawn `impeccable-documenter` with the project root, artifact, direction contract and PRODUCT.md → writes `DESIGN.md`.
3. **Performance.** TBT was 410 ms on desktop. Candidates:
   - defer the mascot's avatar+ajv chunk (180 KB) until idle;
   - check the three.js hero chunk;
   - re-run Lighthouse (`npx lighthouse@12 … --preset=desktop`, with `CHROME_PATH` pointing to Edge).
4. **Talking avatar**, once the photo arrives (see A1/A2).
5. **Deploy.** Vercel needs Lakshya's login (the Vercel connector isn't authorised in Claude). Set the env vars from README.
6. **Git.** The project isn't a git repo yet; initialise and commit when Lakshya says so.

## Where things live

- **Content (single source of truth):** `src/content/profile.ts`.
- **Team build contract:** `docs/BUILD.md` (design tokens, rules, shared APIs, verification).
- **QA artefacts:** `.qa/` (git-ignored). Lead walk scripts are in `.qa/final/`.
- **Impeccable state:** `.impeccable/` (surface brief, review captures, `config.local.json` = code-led).
- **Avatar pipeline:** `scripts/build-hero-assets.py`, `avatar/PROMPTS.md`, `avatar/script.txt`.

## Machine notes

- **Both drives are nearly full** (2026-10-16: C: ~4.5 GB free, D: ~4.8 GB free). The pagefile lives on D:, so a full D: plus low RAM is what segfaulted the voice clone once. npm's cache is redirected to `D:\npm-cache` via `.npmrc`. Voice and ASR models (~4 GB) are in `~/.cache/hf-voice` on C:. Deleting `D:\pip-cache` (2.7 GB) and `D:\tmp` is safe and frees the most.
- RAM (~15.7 GB) is usually under 1.5 GB free with Edge, VS Code and Chrome open. Run GPU jobs (voice clone, whisper) and browser QA one at a time.
- Dev server: `npm run dev` (it lands on 3001 while HiveMind holds 3000). Prod: `npm start -- -p 3005`. Next 16 lets dev and build run side by side.
