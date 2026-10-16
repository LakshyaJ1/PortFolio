// The experience timeline: every role and school as a station, newest first.
// Facts (dates, orgs, places, the full résumé points) come from profile.ts. The short
// highlights below are the same résumé points cut down to a glance; [brackets] mark the
// figure or phrase that gets highlighted. Nothing here adds a claim the résumé doesn't make.

import { EDUCATION, EXPERIENCE } from "@/content/profile";

export type Figure = { v: string; k: string };

export type Station = {
  id: string;
  kind: "work" | "school";
  start: string;
  end: string | null;
  role: string;
  org: string;
  orgNote?: string;
  place: string;
  mode?: "Remote" | "On-site";
  /** short, punchy lines shown at a glance ([marked] text is highlighted) */
  highlights: string[];
  /** bold key figures */
  figures: Figure[];
  /** the full résumé wording, behind "Full details" */
  points: string[];
  stack: string[];
  link?: { label: string; href: string };
  nda?: boolean;
  /** still running (end: null, or a school year still to come) */
  ongoing: boolean;
  /** the headline current role: its station pulses */
  primary?: boolean;
  /** whole months, for finished roles */
  months?: number;
};

type Notes = { highlights: string[]; figures?: Figure[] };

const NOTES: Record<string, Notes> = {
  hivepro: {
    highlights: [
      "Shipped [production AI platforms]: an ISMS portal, customer onboarding and sales-outreach agents",
      "[Human-in-the-loop] by design: approval flows, RBAC, tenant isolation, policy guardrails",
      "Agent pipelines on [Claude], [LangGraph] and RAG, wired to HubSpot, Slack, Gmail, Fathom and NATS",
    ],
  },
  // restricted area: résumé wording only
  rainwire: {
    highlights: [
      "Fine-tuned an [8B-parameter LLM] on in-house datasets for 3-way classification, achieving [88–92% accuracy].",
      "Built a secure mobile application for military personnel (soldiers and brigadiers) under NDA.",
    ],
    figures: [
      { v: "8B", k: "parameter LLM" },
      { v: "88–92%", k: "accuracy" },
    ],
  },
  scrini: {
    highlights: [
      "Semantic resume search over [10K+ profiles] with [sub-50 ms] retrieval (HNSW)",
      "Hybrid retrieval with [cross-encoder reranking] for relevance",
      "Shipped as [3-tier microservices] with Docker Compose",
    ],
    figures: [
      { v: "10K+", k: "profiles searched" },
      { v: "< 50 ms", k: "retrieval" },
    ],
  },
  makers: {
    highlights: [
      "Mentored [250+ students] in robotics hardware and computer vision",
      "Designed a scalable AI/ML curriculum for [3 cohorts]",
      "Arduino and AI workshops for underserved students ([25+] participants)",
    ],
    figures: [
      { v: "250+", k: "students mentored" },
      { v: "3", k: "cohorts" },
    ],
  },
  iitd: {
    highlights: [
      "Unity + C# industrial training toolkit: onboarding time [cut by 75%]",
      "Voice commands synced to [3D CAD models] in real time (Python Flask)",
      "Physics-accurate scripts at [98% mechanical fidelity] to the real hardware",
    ],
    figures: [
      { v: "−75%", k: "onboarding time" },
      { v: "98%", k: "mechanical fidelity" },
    ],
  },
  atom: {
    highlights: [
      "Autonomous GPS navigation for a [Mars Rover prototype] in ROS2 and Python",
      "[LiDAR + IMU] sensor fusion for path planning and obstacle avoidance, tested in Gazebo",
    ],
  },
};

/** "CGPA 9.0+" → 9.0+ / CGPA; "91.4% · 94.4%" against "Class 12th · Class 10th" → one figure each */
function schoolFigures(score: string, detail: string): Figure[] {
  const cgpa = /^CGPA\s+(.+)$/i.exec(score);
  if (cgpa) return [{ v: cgpa[1], k: "CGPA" }];
  const vs = score.split(" · ");
  const ks = detail.split(" · ");
  if (vs.length > 1 && vs.length === ks.length) return vs.map((v, i) => ({ v, k: ks[i] }));
  return [{ v: score, k: "score" }];
}

const ym = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
};

function build() {
  const thisYear = new Date().getFullYear();
  const work: Station[] = EXPERIENCE.map((e) => {
    const n = NOTES[e.id];
    return {
      id: e.id,
      kind: "work",
      start: e.start,
      end: e.end,
      role: e.role,
      org: e.org,
      orgNote: e.orgNote,
      place: e.place,
      mode: e.mode,
      highlights: n?.highlights ?? [],
      figures: n?.figures ?? [],
      points: e.points,
      stack: e.stack,
      link: e.link,
      nda: e.nda,
      ongoing: e.end === null,
      months: e.end ? ym(e.end) - ym(e.start) + 1 : undefined,
    };
  });
  const schools: Station[] = EDUCATION.map((s) => ({
    id: s.id,
    kind: "school",
    start: s.start,
    end: s.end,
    role: s.detail,
    org: s.school,
    place: s.place,
    highlights: [],
    figures: schoolFigures(s.score, s.detail),
    points: [],
    stack: [],
    ongoing: Number(s.end) >= thisYear,
  }));

  // newest first: what he's doing now leads
  const stations = [...work, ...schools].sort((a, b) => ym(b.start) - ym(a.start));
  const primary = stations.find((s) => s.kind === "work" && s.ongoing);
  if (primary) primary.primary = true;

  return { stations, roles: work.length, schools: schools.length };
}

export const TIMELINE = build();

/** split "[marked]" spans out of a highlight */
export function marks(line: string) {
  return line.split(/\[([^\]]+)\]/).map((text, i) => ({ text, mark: i % 2 === 1 }));
}
