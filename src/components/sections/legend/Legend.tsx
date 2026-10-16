import { Sheet } from "@/components/ui/Sheet";
import { BRAND_PATHS } from "./brands";
import { LegendPanel } from "./LegendPanel";
import { STACK, TOOL_COUNT } from "./evidence";

// The tech stack as a cross-section: AI on top of the frameworks, on the languages, on the
// fundamentals. Every tool carries its mark; hover, focus or tap one to see where on the page it
// was used (computed from the résumé). Brand paths are read here, on the server, and handed down.
export function Legend() {
  return (
    <Sheet
      id="legend"
      title={
        <>
          The <em>legend</em>
        </>
      }
      aside={`${TOOL_COUNT} tools · ${STACK.length} layers`}
    >
      <LegendPanel brands={BRAND_PATHS} />
    </Sheet>
  );
}
