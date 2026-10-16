"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { hydrateChrome } from "./chromeStore";
import { FixCursor } from "./FixCursor";
import { Nav } from "./Nav";
import { Rail } from "./Rail";

/**
 * The page's fixed chrome: the nav (mark, where you are, Menu, Résumé, Book a call), the
 * scroll-progress rail and the custom cursor. Nothing shows until the greeting and intro
 * hand over to the site.
 */
export function Chrome() {
  const phase = useApp((s) => s.phase);
  useEffect(hydrateChrome, []);
  if (phase !== "site") return null;
  return (
    <>
      <Nav />
      <Rail />
      <FixCursor />
    </>
  );
}
