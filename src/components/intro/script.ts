// Mirrors avatar/script.txt: the two lines the talking avatar speaks, in sequence order
// (clip "intro", then clip "offer"). Keep the two files in sync: the stand-in reads these aloud
// and captions them, and hero:build times the real captions from them.
export const INTRO_LINES = [
  "Hey, I'm Lakshya Jain — an AI engineer and software engineer. I build AI agents and ship them to production.",
  "I've shipped LLM platforms and on-device models. Open to internships, full-time roles and client work — my résumé's right here.",
] as const;

export const INTRO_SCRIPT = INTRO_LINES.join(" ");
