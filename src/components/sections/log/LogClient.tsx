"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CommitsFeed, ContributionsFeed, Source } from "@/server/github";
import { Icon } from "@/components/ui/Icon";
import { useInView } from "@/lib/hooks";
import { Terrain } from "./Terrain";
import { emptyYear, formatIST, fullDay, relative } from "./time";
import styles from "./Log.module.css";

type Feed<T> = { status: "loading" } | { status: "ready"; data: T };

function isCommits(x: unknown): x is CommitsFeed {
  const f = x as CommitsFeed;
  return Boolean(f && typeof f.source === "string" && Array.isArray(f.commits));
}

function isContributions(x: unknown): x is ContributionsFeed {
  const f = x as ContributionsFeed;
  return Boolean(f && typeof f.source === "string" && Array.isArray(f.days) && typeof f.total === "number");
}

/** Fetch one of our routes; if even that fails (offline, blocked), read the committed snapshot. */
async function survey<T>(url: string, ok: (x: unknown) => x is T, fromSnapshot: (s: Snapshot) => T): Promise<T> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(String(res.status));
    const json: unknown = await res.json();
    if (!ok(json)) throw new Error("shape");
    return json;
  } catch {
    const snap = (await import("@/data/github-snapshot.json")).default as Snapshot;
    return fromSnapshot(snap);
  }
}

type Snapshot = {
  surveyedAt: string;
  commits: CommitsFeed["commits"];
  contributions: { total: number; days: ContributionsFeed["days"] };
};

const SOURCE_NAME: Record<Source, string> = {
  github: "GitHub API",
  mirror: "Public GitHub mirror",
  snapshot: "Last surveyed snapshot",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** entries shown before "Show all" */
const FIRST = 6;

// A minute clock for relative times. Read through useSyncExternalStore: 0 on the server and during
// hydration (never Date.now() in a prerender), the real time once subscribed, re-read every minute.
let clockNow = 0;
let clockTimer = 0;
const clockSubs = new Set<() => void>();
function subscribeClock(onChange: () => void) {
  clockSubs.add(onChange);
  if (clockSubs.size === 1) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      clockSubs.forEach((f) => f());
    }, 60000);
  }
  return () => {
    clockSubs.delete(onChange);
    if (!clockSubs.size) window.clearInterval(clockTimer);
  };
}
const readClock = () => clockNow;
const readServerClock = () => 0;

export function LogClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const near = useInView(rootRef, { rootMargin: "900px 0px", once: true });
  const [commits, setCommits] = useState<Feed<CommitsFeed>>({ status: "loading" });
  const [contrib, setContrib] = useState<Feed<ContributionsFeed>>({ status: "loading" });
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);

  /** Ask both routes; each feed flips to ready when its answer (or the snapshot) arrives. */
  const surveyAll = useCallback(() => {
    void survey("/api/github/commits", isCommits, (s) => ({
      source: "snapshot" as const,
      surveyedAt: s.surveyedAt,
      commits: s.commits.slice(0, 12),
    })).then((data) => setCommits({ status: "ready", data }));
    void survey("/api/github/contributions", isContributions, (s) => ({
      source: "snapshot" as const,
      surveyedAt: s.surveyedAt,
      total: s.contributions.total,
      days: s.contributions.days,
    })).then((data) => setContrib({ status: "ready", data }));
  }, []);

  // first survey when the section comes within reach (the feeds start in "loading")
  useEffect(() => {
    if (near) surveyAll();
  }, [near, surveyAll]);

  /** Retake fix: back to the loading state, then survey again. */
  const retake = () => {
    setCommits({ status: "loading" });
    setContrib({ status: "loading" });
    surveyAll();
  };

  // The log grows once GitHub answers; triggers further down the sheet must re-measure.
  useEffect(() => {
    if (commits.status !== "ready" || contrib.status !== "ready") return;
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [commits.status, contrib.status]);

  // an empty survey grid for the loading state (dates are hidden while scanning, so a fixed year will do)
  const placeholder = useMemo(() => emptyYear(new Date(Date.UTC(2026, 0, 3))), []);
  const degraded =
    (commits.status === "ready" && commits.data.source === "snapshot") ||
    (contrib.status === "ready" && contrib.data.source === "snapshot");
  const snapshotAt =
    commits.status === "ready" && commits.data.source === "snapshot"
      ? commits.data.surveyedAt
      : contrib.status === "ready"
        ? contrib.data.surveyedAt
        : "";

  return (
    <div ref={rootRef} className={styles.log} data-guide="log">
      {degraded ? (
        <div className={styles.nofix} role="status">
          <Icon name="crosshair" size={18} />
          <p>
            <strong>No fix from GitHub.</strong> Showing the last surveyed log
            {snapshotAt ? <span className="mono"> · {formatIST(snapshotAt)}</span> : null}.
          </p>
          <button type="button" className={styles.retake} onClick={retake}>
            <Icon name="refresh" size={14} />
            Retake fix
          </button>
        </div>
      ) : null}

      {contrib.status === "ready" ? (
        <Terrain days={contrib.data.days} total={contrib.data.total} />
      ) : (
        <Terrain days={placeholder} total={0} scanning />
      )}

      <div className={styles.lower}>
        <TitleBlock contrib={contrib} commits={commits} />
        <FieldLog feed={commits} now={now} />
      </div>
    </div>
  );
}

function TitleBlock({ contrib, commits }: { contrib: Feed<ContributionsFeed>; commits: Feed<CommitsFeed> }) {
  const data = contrib.status === "ready" ? contrib.data : null;
  const stats = useMemo(() => {
    if (!data) return null;
    const active = data.days.filter((d) => d.count > 0);
    const top = active.reduce<(typeof active)[number] | null>((m, d) => (!m || d.count > m.count ? d : m), null);
    return {
      active: active.length,
      days: data.days.length,
      top,
      from: data.days[0]?.date,
      to: data.days[data.days.length - 1]?.date,
    };
  }, [data]);
  const dash = <span className={styles.pending}>—</span>;

  return (
    <dl className={styles.title} aria-busy={!data}>
      <div className={styles.titleLead}>
        <dt>Contributions, last 12 months</dt>
        <dd>
          <span className={styles.total}>{data ? data.total : dash}</span>
        </dd>
      </div>
      <div>
        <dt>Active days</dt>
        <dd className={styles.count}>{stats ? `${stats.active} of ${stats.days}` : dash}</dd>
      </div>
      <div>
        <dt>Busiest day</dt>
        <dd className="mono">{stats ? (stats.top ? `${stats.top.count} · ${fullDay(stats.top.date)}` : "None") : dash}</dd>
      </div>
      <div>
        <dt>Period</dt>
        <dd className="mono">{stats?.from && stats.to ? `${fullDay(stats.from)} – ${fullDay(stats.to)}` : dash}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>
          {data ? SOURCE_NAME[data.source] : dash}
          {commits.status === "ready" && data && commits.data.source !== data.source ? (
            <span className={styles.subtle}> · commits: {SOURCE_NAME[commits.data.source]}</span>
          ) : null}
        </dd>
      </div>
      <div>
        <dt>Surveyed</dt>
        <dd className="mono">{data ? formatIST(data.surveyedAt) : dash}</dd>
      </div>
    </dl>
  );
}

function FieldLog({ feed, now }: { feed: Feed<CommitsFeed>; now: number }) {
  const [all, setAll] = useState(false);
  const live = feed.status === "ready" && feed.data.source === "github";
  const commits = feed.status === "ready" ? feed.data.commits : [];
  const shown = all ? commits : commits.slice(0, FIRST);

  return (
    <div className={styles.field}>
      <h3 className={styles.fieldHead}>
        Latest commits
        <span className={styles.fieldCount}>
          {feed.status === "ready" ? plural(commits.length, "entry", "entries") : "reading…"}
        </span>
      </h3>

      {feed.status === "loading" ? (
        <ol className={styles.entries} aria-busy="true" aria-label="Loading commits">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className={`${styles.entry} ${styles.ghost}`}>
              <span className={styles.ghostLine} style={{ width: `${72 - i * 9}%` }} />
            </li>
          ))}
          <li className={styles.reading}>Reading the field book…</li>
        </ol>
      ) : commits.length === 0 ? (
        <p className={styles.emptyLog}>No public commits logged yet. The survey continues.</p>
      ) : (
        <>
          <ol className={styles.entries} id="log-entries">
            {shown.map((c, i) => {
              const short = c.sha.slice(0, 7);
              return (
                <li key={c.sha} className={styles.entry}>
                  <div className={styles.when}>
                    {i === 0 ? (
                      <span className={styles.fixDot} data-live={live || undefined} aria-hidden="true" />
                    ) : null}
                    {i === 0 && live ? <span className={styles.liveTag}>Live</span> : null}
                    <span className={styles.rel}>{now ? relative(c.date, now) : " "}</span>
                    <time className={styles.ist} dateTime={c.date}>
                      {formatIST(c.date)}
                    </time>
                  </div>
                  <div className={styles.what}>
                    <p className={styles.msg}>{c.message}</p>
                    <p className={styles.repo}>{c.repo}</p>
                  </div>
                  <a
                    className={styles.sha}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Commit ${short} in ${c.repo} on GitHub (opens in a new tab)`}
                  >
                    <span>{short}</span>
                    <Icon name="arrow-ne" size={14} />
                  </a>
                </li>
              );
            })}
          </ol>
          {commits.length > FIRST ? (
            <button
              type="button"
              className={styles.more}
              aria-expanded={all}
              aria-controls="log-entries"
              onClick={() => {
                setAll((v) => !v);
                // the log changes height: triggers further down the page re-measure once it has
                requestAnimationFrame(() => ScrollTrigger.refresh());
              }}
            >
              <Icon name={all ? "minus" : "plus"} size={14} />
              {all ? "Show fewer" : `Show all ${commits.length}`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
