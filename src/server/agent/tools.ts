// Function declarations sent to Gemini. Every tool runs in the visitor's browser (the drawer
// executes it and posts a functionResponse back), so nothing here touches the server.

import type { FunctionDeclaration } from "@google/genai";
import { CARD_IDS, CARD_KINDS, GAME_IDS, LINK_NAMES, SECTION_IDS } from "@/components/mascot/agent/spec";

const allCardIds = Array.from(new Set(Object.values(CARD_IDS).flat()));

// Order is fixed so the request prefix stays identical (Gemini's implicit caching keys on it).
// No-argument tools leave `parametersJsonSchema` unset, as the API expects.
export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: "show_card",
    description:
      "Show the visitor an inline résumé card for one specific project, role, education entry or achievement, with a button that jumps to its section. Use it whenever your answer is about one of these. Use the ids listed in the facts: project ids with kind 'project', role ids with kind 'role', education ids with kind 'education', achievement ids with kind 'achievement'.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...CARD_KINDS], description: "Which list the id comes from." },
        id: { type: "string", enum: allCardIds, description: "The id in brackets from the facts." },
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "navigate",
    description: "Scroll the page to one section so the visitor can see it.",
    parametersJsonSchema: {
      type: "object",
      properties: { section: { type: "string", enum: [...SECTION_IDS], description: "Section id." } },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "open_booking",
    description: "Take the visitor to the contact section and open the booking for a 30-minute call with Lakshya.",
  },
  {
    name: "copy_email",
    description: "Copy Lakshya's email address to the visitor's clipboard.",
  },
  {
    name: "open_link",
    description: "Open one of Lakshya's links in a new tab: github, linkedin, resume (PDF), setu (the SETU site / APK) or calendar (booking page).",
    parametersJsonSchema: {
      type: "object",
      properties: { name: { type: "string", enum: [...LINK_NAMES] } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "start_game",
    description: "Start one of the site's mini-games. Only when the visitor explicitly asks to play.",
    parametersJsonSchema: {
      type: "object",
      properties: { id: { type: "string", enum: [...GAME_IDS] } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "reveal_hint",
    description: "Get a direct hint for the next Easter egg this visitor hasn't found yet. Returns the hint text.",
  },
];
