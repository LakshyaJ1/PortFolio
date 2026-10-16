# Bindu's guide anchors (`data-guide`)

Bindu, the mascot, floats around the window as a guide. She finds what to point at through `data-guide` attributes, so no component has to import her.
- Put the attribute on the **visible, interactive element itself** (a button, the canvas wrapper), not on a far-away container.
- Keep the attribute on the element in every state, plain mode included, if the element still renders.
- To make Bindu point at something on demand, any component can call `emit("guide:nudge", { anchor, text, ttl })`. The anchor is one of the names below; `src/lib/events.ts` has the event.

| Anchor | Element | Owner | What Bindu says (draft; she owns the final copy) |
|---|---|---|---|
| `intro-avatar` | the avatar figure / canvas | intro | "That's Lakshya. Tap him to wave." |
| `intro-resume` | Download résumé button | intro | "His résumé, one click: PDF, 2 pages." |
| `intro-enter` | Enter the site button | intro | "Stepping in, in 5 s… or tap now." |
| `intro-terminal` | Field terminal option | intro | "Prefer typing? There's a terminal." |
| `intro-snake` | Play snake option | intro | |
| `hero-name` | the name heading | hero | "Lakshya Jain: AI engineer, software engineer, builds sites like this one." |
| `hero-roles` | the rotating roles line | hero | |
| `hero-intro` | the "Meet Lakshya" intro replay button | hero | "Missed his intro? Tap here: 20 seconds, with sound." |
| `hero-terrain` | the interactive terrain | hero | "This terrain is a loss landscape. Drop a marble and watch it find the lowest point." |
| `hero-terminal` | the landing-page field terminal | hero | "Type `help` here. It's a real terminal." |
| `hero-book` | the in-hero booking card / button | hero | "Want to talk? 30 min, pick a slot." |
| `nav-book` | the nav's Book a call | chrome | |
| `nav-menu` | the nav's sections menu | chrome | |
| `footer-north` | the footer north arrow (easter egg: tap 5×) | chrome | |
| `footer-eggs` | the footer's easter-egg counter / logbook link | chrome | |
| `about-pass` | the 3D ID pass | about | "Grab his pass and swing it." |
| `about-facts` | the quick facts block | about | |
| `work-list` | the capabilities list | work | |
| `work-timeline` | the experience timeline | work | |
| `work-restricted` | the hatched NDA station (easter egg: knock 3×) | work | "That hatched one is under NDA… knock three times?" |
| `projects-track` | the horizontal projects track | projects | "Scroll sideways, or use the arrows." |
| `projects-next` | next-project arrow | projects | |
| `projects-flip` | "Turn the sheet" button on the current project | projects | |
| `projects-coin` | the stray coin in TokenForge (easter egg) | projects | |
| `stack` | the tech-stack (legend) display | lower | |
| `log` | the GitHub activity block | lower | |
| `benchmarks` | the achievements block | lower | |
| `book` | the booking embed / button in the contact section | lower | |
| `logbook` | the easter-egg logbook button/panel | eggs | |
