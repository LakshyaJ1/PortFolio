import { Sheet } from "@/components/ui/Sheet";
import { PROFILE } from "@/content/profile";
import { Booking } from "./Booking";
import { ClosingLine } from "./ClosingLine";
import { Contact } from "./Contact";
import styles from "./Rendezvous.module.css";

// Book a call, straight after the projects: the invitation (a line whose letters rise under the
// pointer, what he builds, three steps) beside the Cal.com booker (mounted early, well before it is
// reached), with the direct lines under the invitation. On phones the booker comes second, not last.
export function Rendezvous() {
  return (
    <Sheet
      id="rendezvous"
      title="Rendezvous"
      aside="30 min · Cal.com"
    >
      <div className={styles.grid}>
        <div className={styles.invite}>
          <ClosingLine />
          <p className={styles.offer}>{PROFILE.offer}</p>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNo}>1</span>Pick a day
            </li>
            <li>
              <span className={styles.stepNo}>2</span>Pick a time
            </li>
            <li>
              <span className={styles.stepNo}>3</span>The invite lands in your inbox
            </li>
          </ol>
        </div>
        <Booking />
        <Contact />
      </div>
    </Sheet>
  );
}
