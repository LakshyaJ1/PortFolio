# Research: what we borrowed, and from whom

Seven research agents went through the [developer-portfolios](https://github.com/emmabostian/developer-portfolios) list (2,035 entries) and took apart heysai.dev, the site you called "cool, global":

- Four agents split the list A–E, F–J, K–O and P–Z. They triaged by name, tag and domain, visited about 270 sites in a real browser, and took screenshots.
- One agent reverse-engineered heysai.dev down to its exact easing curves and timings.
- One researched the stack: Lenis, GSAP, react-three-fiber, Cal.com and the GitHub APIs.
- One researched the mascot library.

The rule we followed was to borrow ideas, not looks. Every idea was translated into this site's own world, a night survey of a loss landscape, so nothing reads as copied.

## Adopted, and how it was translated

| Idea (source) | Where it lives here |
|---|---|
| One easing curve everywhere, Lenis smooth scroll, near-black ground with one loud accent, mono instrument labels (heysai.dev) | Design system. Survey orange `#ff5b23` replaces their lime; there is one curve, `--ease`; Martian Mono is used only for measurements |
| Pinned word band with a live mini-instrument per word (heysai.dev "What I Do") | **Capabilities**: AGENTS / RETRIEVAL / EDGE ML / ROBOTICS / XR pass through an orange line-of-position band. Each has its own live instrument (HITL agent graph, embedding search, SETU spectrum, LiDAR sweep, XR wireframe) |
| Statement that fills in word by word as you scroll (heysai.dev) | **Field notes**: the statement is inked word by word, like a plotter pen |
| Cmd/Ctrl+K AI agent drawer over the CV (heysai.dev, ilans.net "AI twin", rishabhchaturvedi.dev generative-UI answers) | **Ask Bindu**: the mascot opens a real agent with tools. It can navigate, book, copy your email and start games, and it answers with inline cards. It says plainly that it can be wrong and links to email the real you |
| Multilingual "hello" preloader (dennissnellenberg.com, debpriyo.is-a.dev) | **Greeting**: 12 hellos, each pinned to its city's coordinates. A GNSS-style readout slews between cities and locks a fix on Delhi |
| Talking-video portfolio guide (your DOCX) | **Intro**: the avatar stands on a backlit "light table", with live captions and a voice button, built by `npm run hero:build` |
| Make-your-own-mascot guide (your PDF) | **Bindu** (बिंदु, "point"), an orange survey-marker mascot built with Bible Strong Avatar Lab. She reacts to buttons, booking, errors and idleness, and gives a tip per section |
| Backtick shell, Konami code, console art (dhruvjs.com), terminal with real commands (pujasridhar.github.io, nigam-portfolio-2026) | **Field terminal** (press `` ` ``), Konami → rover game, `window.lakshya` console API |
| Blueprint title block with live readouts (dhruvjs.com, carterogunsola.com HUD) | **Collar**: the map's title block, with scale bar, north arrow, live IST clock, build hash and caches found |
| Handwritten margin notes pointing at interactions (chanhdai.com) | Surveyor's **field notes** in Kalam, an Indian handwriting face |
| "Prefer it simple?" / READ mode (nitishkr.fun, carlton.dev) | **Plain sheet** toggle in the collar: heavy effects off, recruiter-fast reading |
| Disable-custom-cursor toggle (gowthamsridhar.com) | **Fix cursor** toggle. The native cursor is never hidden |
| Skills tied to where they were used, no percentage bars (gauravrathva.me) | **Legend**: every skill is a map symbol; hovering shows where on the sheet it was used |
| Live GitHub heatmap and commit feed (kyson.dev, shan-verse.com, tanayshah.dev) | **Survey log**: your year of commits rendered as contour terrain with labelled spot heights, plus a live commit log |
| Field-notes case studies: Problem / Approach / Result (marcobellingeri.dev) | **Surveyed sites**: each project's back panel |
| Project cards that turn over (cereal-box "back panel", from the design-direction roll) | "Turn the sheet" reveals each project's playable demo |
| 404 with a playable game (chanhdai.com) | **Off the map**: snake on a survey grid |
| Agent-readable portfolio (rubenmarcus.dev "Hire me from your agent") | `/llms.txt`, a clean summary any AI assistant can read |
| 3D physics lanyard badge (Vercel ship badge) | **Field pass**: built procedurally, with survey-tape strap and no Vercel assets |
| Live local clock, "now" status (marcobellingeri.dev, mukulchugh.com) | Collar clock and the About quick facts |

## Deliberately not copied

These were the most common reasons sites looked generic:
- purple/blue gradients on names
- glass bento grids
- typewriter "Hi, I'm…" heroes
- skill percentage bars
- neon wireframe polyhedra on grid floors ("SYSTEM ONLINE")
- 3D "my desk" scenes
- fake OS desktops
- cookie banners over the hero
- stat-tile heroes with invented metrics
- 13-second first paints from heavy 3D runtimes (heysai.dev's Spline robot: ~3.4 MB before the hero)

## Screenshots

All research screenshots are in the session scratchpad (`research/shots/{AE,FJ,KO,PZ,heysai}`). The best references are listed in each research report.
