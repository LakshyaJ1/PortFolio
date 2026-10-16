import type { ComponentType } from "react";
import { EXPERIENCE } from "@/content/profile";
import { AgentGraph } from "./instruments/AgentGraph";
import { Retrieval } from "./instruments/Retrieval";
import { Spectral } from "./instruments/Spectral";
import { Lidar } from "./instruments/Lidar";
import { Assembly } from "./instruments/Assembly";
import type { GlyphName } from "./glyphs";

/** a bold key figure: the value, then what it counts */
export type Figure = { v: string; k: string };

export type Capability = {
  id: "agents" | "retrieval" | "edge" | "robotics" | "xr";
  word: string;
  glyph: GlyphName;
  /** where it was shipped */
  org: string;
  /** start year from the résumé, or "Project" for SETU */
  when: string;
  /** the role is still running (profile end: null) */
  ongoing: boolean;
  /** the one figure that sells the line at a glance */
  hook: Figure;
  Instrument: ComponentType<{ active?: boolean }>;
};

const role = (id: string) => {
  const e = EXPERIENCE.find((x) => x.id === id);
  return { when: e ? e.start.slice(0, 4) : "", ongoing: e ? e.end === null : false };
};

// Years and "ongoing" come straight from EXPERIENCE; SETU is a project and carries none.
// Every hook figure is résumé wording (profile.ts).
export const CAPABILITIES: Capability[] = [
  {
    id: "agents",
    word: "Agents",
    glyph: "agents",
    org: "Hive Pro",
    ...role("hivepro"),
    hook: { v: "Production", k: "human-in-the-loop AI" },
    Instrument: AgentGraph,
  },
  {
    id: "retrieval",
    word: "Retrieval",
    glyph: "retrieval",
    org: "Scrini AI",
    ...role("scrini"),
    hook: { v: "10K+", k: "profiles · < 50 ms" },
    Instrument: Retrieval,
  },
  {
    id: "edge",
    word: "Edge ML",
    glyph: "edge",
    org: "SETU",
    when: "Project",
    ongoing: false,
    hook: { v: "207 KB", k: "on-device model" },
    Instrument: Spectral,
  },
  {
    id: "robotics",
    word: "Robotics",
    glyph: "robotics",
    org: "A.T.O.M Robotics",
    ...role("atom"),
    hook: { v: "Mars rover", k: "prototype" },
    Instrument: Lidar,
  },
  {
    id: "xr",
    word: "XR",
    glyph: "xr",
    org: "IIT Delhi",
    ...role("iitd"),
    hook: { v: "−75%", k: "onboarding time" },
    Instrument: Assembly,
  },
];
