"use client";

import { useEffect, useState } from "react";
import { heroBustSrc } from "@/components/intro/manifest";
import { replayIntro } from "@/components/intro/replay";
import { Icon } from "@/components/ui/Icon";
import styles from "./MeetLakshya.module.css";

/**
 * "Meet Lakshya": replays the talking-avatar intro, with sound, from the landing view.
 * His portrait (the bust the clip pipeline cuts) sits in a pulsing orange ring with a play badge,
 * so the one thing that talks on this site is visible at a glance, not a small text link.
 */
export function MeetLakshya() {
  const [face, setFace] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void heroBustSrc().then((src) => alive && setFace(src));
    return () => {
      alive = false;
    };
  }, []);

  return (
    // replayIntro must run inside the click: that gesture is what lets his voice play
    <button type="button" className={styles.meet} onClick={() => replayIntro()} data-guide="hero-intro" data-cta="intro">
      <span className={styles.face} aria-hidden="true">
        <span className={styles.ring} />
        {face ? <span className={styles.photo} style={{ backgroundImage: `url(${face})` }} /> : <Icon name="volume" size={20} />}
        <span className={styles.play}>
          <Icon name="play" size={11} />
        </span>
      </span>
      <span className={styles.text}>
        <strong>Meet Lakshya</strong>
        <small>Watch his 20-second intro · sound on</small>
      </span>
    </button>
  );
}
