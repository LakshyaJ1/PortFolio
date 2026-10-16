"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CACHES } from "@/lib/caches";
import { on } from "@/lib/events";
import { useApp } from "@/lib/store";
import { installConsole } from "./consoleApi";
import { Logbook } from "./logbook/Logbook";
import { foundCount } from "./shared";
import { SurveyComplete } from "./SurveyComplete";
import { TargetLock } from "./TargetLock";
import { Terminal } from "./terminal/Terminal";
import { useEggKeys, useMarathon } from "./useEggTriggers";

// Games are the heaviest eggs; their code loads the first time one is opened.
const GameHost = dynamic(() => import("./games/GameHost").then((m) => m.GameHost), { ssr: false });

/**
 * Every hidden thing on the sheet: global key listeners, the console API, the field terminal,
 * the logbook, the games, and the target-lock and survey-complete moments.
 * (The agent overlay belongs to the mascot.)
 */
export function Overlays() {
  useEggKeys();
  useMarathon();

  const overlay = useApp((s) => s.overlay);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [lock, setLock] = useState(0);
  const [complete, setComplete] = useState(false);

  if (overlay === "game" && !gamesLoaded) setGamesLoaded(true);

  useEffect(() => installConsole(), []);

  useEffect(() => on("target:lock", () => setLock((n) => n + 1)), []);

  useEffect(
    () =>
      on("cache:found", () => {
        if (foundCount(useApp.getState().caches) === CACHES.length) setComplete(true);
      }),
    [],
  );

  const endLock = useCallback(() => setLock(0), []);
  const endComplete = useCallback(() => setComplete(false), []);

  return (
    <>
      <Terminal />
      <Logbook />
      {gamesLoaded ? <GameHost /> : null}
      {lock > 0 ? <TargetLock key={lock} onDone={endLock} /> : null}
      {complete ? <SurveyComplete onDone={endComplete} /> : null}
    </>
  );
}
