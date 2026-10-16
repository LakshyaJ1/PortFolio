"use client";

import { lossText, signed, useHero, type OptimizerReadout } from "./heroStore";
import styles from "./Hero.module.css";

/** The marble's story in plain words; null is the target, which gets the लक्ष्य line. */
function marbleText(o: OptimizerReadout) {
  switch (o.kind) {
    case "idle":
      return "none yet";
    case "rolling":
      return `rolling downhill · step ${o.step}`;
    case "settled":
      return o.target ? null : `stuck in a local dip · ${lossText(o.loss)}`;
    case "shaping":
      return `${o.sign > 0 ? "raising" : "sinking"} the ground ${signed(o.amp, 2)}`;
  }
}

/** The instrument strip: the loss under the pointer, and what the last marble is doing. */
export function Hud() {
  const fix = useHero((s) => s.fix);
  const opt = useHero((s) => s.optimizer);
  const text = marbleText(opt);
  return (
    <div className={styles.hud} data-hud data-mascot-avoid>
      <span className={styles.hudRule} aria-hidden="true" />
      <dl className={styles.hudGrid}>
        <div className={`${styles.hudCell} ${styles.hudLoss}`}>
          <dt>Loss here</dt>
          <dd>{fix ? lossText(fix.loss) : "—"}</dd>
        </div>
        <div className={`${styles.hudCell} ${styles.hudOpt}`} data-state={opt.kind === "settled" && opt.target ? "target" : opt.kind}>
          <dt>Marble</dt>
          <dd>
            {text ?? (
              <>
                reached{" "}
                <span className={styles.deva} lang="hi">
                  लक्ष्य
                </span>
                , the lowest point
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
