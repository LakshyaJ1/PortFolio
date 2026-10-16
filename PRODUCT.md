# Product

<!-- impeccable:product-schema 1 -->

> Written autonomously from Lakshya's brief and résumé (he asked for no interview; open questions live in `QUESTIONS.md`). Lines marked *(assumed)* are inferences awaiting confirmation.

## Platform

web

## Stack

delegated: Next.js (App Router) + React + TypeScript, Lenis smooth scroll (requested by Lakshya), GSAP for scroll choreography, react-three-fiber for the 3D moments, Cal.com embed for booking. Chosen because the site needs server routes (live GitHub feed, mascot agent endpoint) alongside heavy client-side motion. Deploy target: Vercel *(assumed)*.

## Users

- Recruiters and hiring managers at AI companies and startups who arrive from a résumé or LinkedIn link and decide in under a minute whether to keep reading *(assumed)*.
- Founders and engineering leads looking for an AI engineer who can ship agentic systems to production, who want to book a call *(assumed)*.
- Fellow engineers and students (Lakshya mentors 250+ students) who come to explore, play, and share *(assumed)*.

## Product Purpose

Lakshya Jain's personal portfolio. It must establish him as a production AI engineer within the first screen, let visitors explore his work in depth, and convert interest into a booked 30-minute call (https://cal.com/lakshyajain/30min). Success: visitors remember it, find the hidden things, and book calls.

## Positioning

An AI engineer whose range runs from cloud agent platforms (Hive Pro: human-in-the-loop agents, RAG, LangGraph, Claude) to the edge (SETU: a 207 KB on-device CNN-GRU model for GPS-denied navigation), defence AI (8B LLM fine-tune, deepfake detection for WARDEC–Indian Army), robotics (ROS2 Mars rover autonomy) and XR (IIT Delhi). The site itself ships a working AI agent (the mascot) as proof rather than claim. "Lakshya" means *target / aim* in Sanskrit.

## Operating Context

Visitors open the link from a résumé, LinkedIn, GitHub, or a shared message, on desktop or phone. Some will have sound off; some will skip intros. Recruiters scan; engineers poke around.

## Capabilities and Constraints

- Intro sequence requested by Lakshya: multi-language "hello" greeting, then a full-screen talking avatar of him introducing himself by voice.
- Required: Lenis smooth scrolling, rich scroll animation, 3D elements, hidden easter eggs and mini-games, Cal.com booking UI, live GitHub commit activity, an animated mascot guide (per the "Make Your Own Mascot" guide) that can explain the site and help visitors act.
- Must work across 360–1920 px, touch, keyboard, and `prefers-reduced-motion`; no edge-case breakage.
- The Rainwire / Indian Army work is under NDA: nothing beyond the résumé's wording.
- The mascot library (Bible Strong Avatar Lab) is AGPL-3.0; licence implications are an open decision.

## Brand Commitments

- Lakshya's references: heysai.dev ("cool, global"), the emmabostian/developer-portfolios collection, darkroomengineering/lenis.
- Must not look vibe-coded or generic.
- Name: Lakshya Jain. Role line: AI Engineer.

## Evidence on Hand

- Résumé: `LakshyaCV (2).pdf` (sole source of truth for facts and numbers).
- Videos: XR training toolkit https://youtu.be/KJb_Zj6nslE, TokenForge https://youtu.be/sgqXnA14aEE.
- Profiles: github.com/LakshyaJ1, linkedin.com/in/lakshya-jain-86b091292/, email 10jainlakshya@gmail.com.
- Booking: https://cal.com/lakshyajain/30min.
- Absent, must not be fabricated: testimonials, client logos, project screenshots, photos of Lakshya (needed for the avatar), extra metrics.

## Product Principles

1. Prove, don't claim: every capability on the page is demonstrated (a working agent, a live feed, interactive project demos), and every number comes from the résumé.
2. Reward curiosity: the site has depth for those who poke at it, but a recruiter in a hurry still gets the story in one scroll.
3. One world, not a collage: borrowed ideas are translated into a single coherent system.
4. Never block: intros are skippable, sound is opt-in, motion respects reduced-motion, and everything has a fallback.

## Accessibility & Inclusion

WCAG 2.2 AA target *(assumed)*: keyboard access to every interactive element including games, visible focus, captions/transcript for the voiced intro, reduced-motion fallbacks, no information conveyed by motion or sound alone.
