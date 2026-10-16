import { Sheet } from "@/components/ui/Sheet";
import { ACHIEVEMENTS } from "@/content/profile";
import { BenchProfile } from "./BenchProfile";

// Achievements as surveyed heights: one strip of big figures, each post standing on a thin elevation
// profile (wide sheets) or in a tight grid (phones). Figures count up once on view to the résumé value.
export function Benchmarks() {
  return (
    <Sheet
      id="benchmarks"
      title={
        <>
          Bench<em>marks</em>
        </>
      }
      aside={`${ACHIEVEMENTS.length} highlights`}
    >
      <BenchProfile />
    </Sheet>
  );
}
