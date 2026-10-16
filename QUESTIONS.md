# Open questions for Lakshya

Answer inline (write under each question) and tell me "answered". Anything unanswered keeps its current default.
Items in **Action needed** block real features; everything else already has a sensible default.

---

## Action needed (blocks the talking avatar)

### A1. Your photo
The talking-avatar intro needs a 3D cartoon version of you, and that needs a clear photo of you as the identity reference.
- Drop 1–2 photos into `assets-inbox/` (front-facing, good light, ideally full body or at least waist-up, plain background preferred).
- Default if missing: the intro plays with a stylised placeholder figure and your voice-over script as live captions.

**Answer:**

### A2. Let me drive your Edge (for ChatGPT / Gemini / Google Flow)
Your Edge is open, but browsers block automation tools from attaching to a running, logged-in session unless you allow it. Pick one:
- **(a) Let me drive it.** In Edge open `edge://inspect/#remote-debugging`, turn on "Allow remote debugging for this browser instance", and tell me. I'll then run the image prompt in ChatGPT/Gemini and the video prompt in Google Flow myself.
- **(b) You run two prompts.** Everything is ready in `avatar/PROMPTS.md`. Paste prompt 1 with the two images into ChatGPT or Gemini, then prompt 2 with the result into Google Flow. Save the outputs as `assets-inbox/character.png` and `assets-inbox/intro.mp4`. I process them into the site automatically (`npm run hero:build`).

**Answer:**

### A3. Voice
Google Flow (Veo) generates a voice for the character. Alternatives: record your own voice saying the script (a phone voice memo is fine) and I sync it, or use a generated voice (needs an ElevenLabs key).
Proposed script (≈8 s): *"Hi, I'm Lakshya Jain. I'm an AI engineer — I build agentic AI systems, from production LLM platforms to models that run right on your phone. Welcome to my portfolio."*
- Keep the script? Edit it?
- Flow voice, your own voice, or ElevenLabs?

**Answer:**

---

## Content and privacy

### C1. Phone number
Your résumé lists your phone number. **Default: not shown on the site** (spam risk); email + Cal.com booking instead. Show it?

**Answer:**

### C2. Downloadable résumé
**Default: the "Résumé ↓" button serves `public/Lakshya-Jain-Resume.pdf`, a copy of your current PDF (it includes your phone number).** Want a version without the phone number?

**Answer:**

### C2b. CGPA: site vs PDF (2026-10-16)
The site now shows **CGPA 9.0+**, as you asked. The downloadable `public/Lakshya-Jain-Resume.pdf` still says **8.96**. Recruiters often open both, so it's worth making them match. Drop in an updated PDF with your current CGPA (same filename), or tell me to show 8.96 on the site.

**Answer:**

### G1. Gemini key for Bindu (2026-10-16)
Bindu now runs on Google Gemini. Add `GEMINI_API_KEY` to `.env.local` and to Vercel's environment variables; get one at aistudio.google.com/apikey. Until then Bindu answers from her offline field guide. The guided tour works either way.

**Answer:**

### C3. Project links
I only have: SETU site (https://setu-six-jet.vercel.app/), the XR toolkit video, and the TokenForge video. Which projects have public GitHub repos or live demos? (SETU, Amazon ML Challenge, TokenForge, Scrini resume search, deepfake detection, Mars rover, XR toolkit, Hive Pro platforms.)

**Answer:**

### C4. Hive Pro naming
The résumé names the ISMS portal, customer-onboarding and sales-outreach agentic platforms and the integrations (HubSpot, Slack, Gmail, Fathom, NATS). **Default: I use exactly that wording, no screenshots, no client names.** Anything you can't show publicly, or anything extra you can?

**Answer:**

### C5. Other profiles
Besides GitHub and LinkedIn: X/Twitter, Instagram (you're in WHATACLICK), LeetCode, Kaggle, Medium, Hugging Face? Add links you want shown.

**Answer:**

### C5b. Second GitHub account and commit messages
The live "Survey log" pulls your latest commits with GitHub's search API. Two things came up:
- Some recent commits live under a second account, **lakshyaJ12** (`RazorPay_CustomerOnboardingAgent`). They're authored by you, so they show up. Keep them, or show only repos owned by `LakshyaJ1`?
- Raw commit messages appear as written (e.g. "something is cooking"). **Default: show them as-is; it's authentic.** Want a hide list for any repos (team repos like SETU include other people's commits; I filter to your authorship only)?

**Answer:**

### C5c. Availability
Should the site say you're open to roles (e.g. "Open to full-time AI engineering roles from 2027" or "open to internships")? **Default: no availability claim.**

**Answer:**

### C6. "Now" line
A short line the site shows as your current status, e.g. "Currently: building agentic platforms at Hive Pro · Delhi". Want to write your own?

**Answer:**

### C7. Photography easter egg
You're in WHATACLICK. If you send 6–12 of your photos (`assets-inbox/photos/`), a hidden camera easter egg can open them as a darkroom contact sheet. Otherwise that egg ships without your photos.

**Answer:**

---

## Mascot agent

### M1. Mascot library licence
The mascot guide uses Bible Strong Avatar Lab (AGPL-3.0). Using its package on a public website generally means your site's source code should be available under AGPL-compatible terms. **Default: I build the mascot per the guide (avatar JSON + package) and keep the portfolio repo public-ready.** Prefer a custom-drawn mascot with no AGPL dependency?

**Answer:**

### M2. Mascot's AI brain
Bindu now runs on **Google Gemini** (see G1): set `GEMINI_API_KEY`. Without a key she answers from her free offline field guide, and the guided tour works either way. Any daily spend cap you want set in Google AI Studio?

**Answer:**

### M3. Mascot name
Proposed: **Bindu** (बिंदु, "point": a survey point on the map, which is this site's world). Keep or rename?

**Answer:**

---

## Hosting and integrations

### H1. Hosting and domain
**Default: Vercel.** Do you have a domain (e.g. lakshyajain.dev)?

**Answer:**

### H2. GitHub token in production
Live commits work without a token (cached, rate-limited). The contribution heatmap is more accurate with a read-only `GITHUB_TOKEN` env var on Vercel. Add one?
**Heads-up:** the `GITHUB_TOKEN` currently set on this computer is rejected by GitHub (401 "Bad credentials"), so it's expired or revoked. The site falls back to public sources and a committed snapshot, so nothing breaks, but a fresh fine-grained token (public read-only is enough) is worth creating for Vercel.

**Answer:**

### H3. Analytics
Vercel Analytics, Plausible, or none? **Default: none.**

**Answer:**

---

## Design

### D1. Direction
The site is built as a **surveyor's map of your terrain**: hellos with their city coordinates landing on Delhi, a dead-reckoning cursor (straight from SETU), experience as a traverse between survey stations, skills as the map legend, easter eggs as hidden geocaches with a logbook. If you'd rather a different world, say "re-roll" and I'll present alternatives.

**Answer:**

### D2. Greeting languages
Default order: नमस्ते, Hello, Hola, Bonjour, こんにちは, Ciao, Olá, 안녕하세요, Hallo, Merhaba, Привет, مرحبا, ending on नमस्ते (Delhi). Must-haves or removals?

**Answer:**
