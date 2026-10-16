import { Sheet } from "@/components/ui/Sheet";
import { LogClient } from "./LogClient";

// Live GitHub activity: the year as contoured terrain plus a field log of the latest commits.
// Data comes from /api/github/* (cached server-side, with a committed snapshot as the last resort).
export function SurveyLog() {
  return (
    <Sheet
      id="log"
      title={
        <>
          Survey <em>log</em>
        </>
      }
    >
      <LogClient />
    </Sheet>
  );
}
