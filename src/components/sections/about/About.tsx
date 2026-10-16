import { Sheet } from "@/components/ui/Sheet";
import { FieldPass } from "./FieldPass";
import { QuickFacts } from "./QuickFacts";
import { Statement } from "./Statement";
import styles from "./About.module.css";

/** B2 · Field notes: the statement that inks in, the field pass on its lanyard, and the quick facts. */
export function About() {
  return (
    <Sheet
      id="about"
      title={
        <>
          Field <em>notes</em>
        </>
      }
    >
      <div className={styles.layout}>
        <div className={styles.statementCell}>
          <Statement />
        </div>
        <div className={styles.passCell}>
          <FieldPass />
        </div>
        <div className={styles.factsCell}>
          <QuickFacts />
        </div>
      </div>
    </Sheet>
  );
}
