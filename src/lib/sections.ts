// The sheet index: every navigable section of the page, in scroll order.
// Nav, the mascot's tips, the agent's navigate tool and the terminal all read from here.
// page.tsx renders the sections in this same order (the active-section tracker relies on it).

export type SectionId =
  | "top"
  | "about"
  | "capabilities"
  | "traverse"
  | "sites"
  | "rendezvous"
  | "legend"
  | "log"
  | "benchmarks";

export type SectionMeta = {
  id: SectionId;
  /** the section's thematic name (the map's region name: Field notes, Traverse…) */
  label: string;
  /** what the section is, in plain words: shown in the nav, the menu, the footer and on every heading */
  plain: string;
  /**
   * Map grid reference, assigned by position (A1 at the top … J9 at the bottom; map grids skip I).
   * Kept for the terminal's sheet-reference commands; the chrome no longer shows it.
   */
  grid: string;
  /** what the mascot says when the visitor arrives here */
  tip: string;
  /** keywords the offline agent and terminal match against */
  keywords: string[];
};

const GRID_REFS = ["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8", "J9"] as const;

const ORDERED: Omit<SectionMeta, "grid">[] = [
  {
    id: "top",
    label: "Sheet",
    plain: "Home",
    tip: "Click the terrain to drop a marble. It rolls to the lowest point.",
    keywords: ["home", "top", "start", "hero", "terrain"],
  },
  {
    id: "about",
    label: "Field notes",
    plain: "About",
    tip: "That's his ID pass. Grab it and swing it around.",
    keywords: ["about", "who", "bio", "intro", "pass", "id", "education"],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    plain: "Capabilities",
    tip: "Keep scrolling: each line brings up its live demo.",
    keywords: ["capabilities", "what", "do", "skills", "services", "build"],
  },
  {
    id: "traverse",
    label: "Traverse",
    plain: "Experience",
    tip: "His roles, newest first. The striped one is under NDA… try knocking three times.",
    keywords: ["experience", "work", "jobs", "career", "internship", "traverse", "hive", "rainwire", "scrini", "iit"],
  },
  {
    id: "sites",
    label: "Surveyed sites",
    plain: "Projects",
    tip: "Scroll or use the arrows to move sideways. Turn a card over for its live demo.",
    keywords: ["projects", "sites", "setu", "amazon", "tokenforge", "portfolio", "demo"],
  },
  {
    id: "rendezvous",
    label: "Rendezvous",
    plain: "Book a call",
    tip: "Pick a slot: a 30-minute call, straight into his calendar.",
    keywords: ["contact", "book", "call", "meeting", "email", "hire", "rendezvous", "cal"],
  },
  {
    id: "legend",
    label: "Legend",
    plain: "Tech stack",
    tip: "Hover or tap a tool to see where he used it.",
    keywords: ["legend", "stack", "tools", "languages", "tech", "skills"],
  },
  {
    id: "log",
    label: "Survey log",
    plain: "GitHub activity",
    tip: "Live from GitHub: his latest commits.",
    keywords: ["github", "commits", "log", "activity", "code", "contributions"],
  },
  {
    id: "benchmarks",
    label: "Benchmarks",
    plain: "Achievements",
    tip: "Highlights: competitions, mentoring, even a half marathon.",
    keywords: ["achievements", "awards", "benchmarks", "marathon", "quiz", "amazon"],
  },
];

export const SECTIONS: SectionMeta[] = ORDERED.map((s, i) => ({ ...s, grid: GRID_REFS[i] }));

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);
