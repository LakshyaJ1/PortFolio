import { Sheet } from "@/components/ui/Sheet";
import { TIMELINE } from "./stations";
import { TraverseList } from "./TraverseList";
import styles from "./Traverse.module.css";

/** D4 · The traverse: every role and school as a station on one line, newest first. */
export function Traverse() {
  return (
    <Sheet
      id="traverse"
      className={styles.sheet}
      title={
        <>
          Stations on the <em>traverse</em>
        </>
      }
      aside={`${TIMELINE.roles} roles · ${TIMELINE.schools} schools`}
    >
      <TraverseList />
    </Sheet>
  );
}
