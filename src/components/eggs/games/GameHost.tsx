"use client";

import { useCallback, useRef, useState } from "react";
import { useApp, type GameId } from "@/lib/store";
import { useDialog, usePresence } from "../a11y";
import { Coin } from "./Coin";
import { Deepfake } from "./Deepfake";
import { Rover } from "./Rover";
import { Snake } from "./Snake";
import styles from "./Game.module.css";

/** overlay === 'game': one dialog, the game chosen by `useApp(s => s.game)`. */
export function GameHost() {
  const overlay = useApp((s) => s.overlay);
  const game = useApp((s) => s.game);
  const open = overlay === "game" && game !== null;
  const present = usePresence(open, 260);
  // keep showing the last game while the dialog plays its exit
  const [shown, setShown] = useState<GameId | null>(game);
  if (open && game !== shown) setShown(game);
  if (!present || !shown) return null;
  return <GameDialog open={open} game={shown} />;
}

function GameDialog({ open, game }: { open: boolean; game: GameId }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeOverlay = useApp((s) => s.closeOverlay);
  const close = useCallback(() => {
    if (useApp.getState().overlay === "game") closeOverlay();
  }, [closeOverlay]);

  useDialog(ref, open, {
    onEscape: close,
    initialFocus: () => ref.current?.querySelector<HTMLElement>("[data-autofocus]"),
  });

  return (
    <div className={styles.host} data-egg-dialog data-state={open ? "open" : "closing"}>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <div
        ref={ref}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="egg-game-title"
        tabIndex={-1}
        data-lenis-prevent
      >
        {game === "rover" ? (
          <Rover key="rover" onClose={close} />
        ) : game === "snake" ? (
          <Snake key="snake" onClose={close} />
        ) : game === "deepfake" ? (
          <Deepfake key="deepfake" onClose={close} />
        ) : (
          <Coin key="coin" onClose={close} />
        )}
      </div>
    </div>
  );
}
