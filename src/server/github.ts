// GitHub data for the survey log. Server-only: reads GITHUB_TOKEN from process.env.
//
// Fallback chain (nothing ever throws to the client):
//   commits:        REST search (token, retried anonymously on 401) → committed snapshot
//   contributions:  GraphQL calendar (token) → public mirror (jogruber) → committed snapshot
//
// Each network call lives in its own `'use cache'` scope. A failed call returns `{ ok: false }`
// with a one-minute lifetime, so a bad minute is retried soon and never pinned into a prerender.

import { cacheLife } from "next/cache";
import { PROFILE } from "@/content/profile";
import snapshot from "@/data/github-snapshot.json";

export type Commit = {
  sha: string;
  /** owner/name */
  repo: string;
  /** html url of the commit */
  url: string;
  /** first line of the commit message */
  message: string;
  /** ISO 8601, UTC */
  date: string;
};

export type ContributionDay = { date: string; count: number };

/** github = live from api.github.com · mirror = public contributions mirror · snapshot = committed file */
export type Source = "github" | "mirror" | "snapshot";

export type CommitsFeed = { source: Source; surveyedAt: string; commits: Commit[] };
export type ContributionsFeed = { source: Source; surveyedAt: string; total: number; days: ContributionDay[] };

type Result<T> = { ok: true; data: T; at: string } | { ok: false; reason: string };

const USER = PROFILE.githubUser;
const COMMIT_COUNT = 12;
const TIMEOUT_MS = 6000;
/** Failed calls are remembered briefly; `expire` under five minutes keeps them out of prerenders. */
const FAILED_LIFE = { stale: 30, revalidate: 60, expire: 120 } as const;

function token() {
  // The local value has been seen with stray whitespace; a header with a CR in it is a 401.
  const t = process.env.GITHUB_TOKEN?.trim();
  return t ? t : undefined;
}

function ghHeaders(withToken: boolean): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${USER}-portfolio`,
  };
  const t = withToken ? token() : undefined;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** GET against the REST API; a rejected token falls back to an anonymous request. */
async function ghGet(url: string) {
  const authed = Boolean(token());
  let res = await fetch(url, { headers: ghHeaders(authed), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (authed && res.status === 401) {
    res = await fetch(url, { headers: ghHeaders(false), signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
  return res;
}

const firstLine = (message: string) => message.split(/\r?\n/, 1)[0].trim();

function cleanDays(days: ContributionDay[]) {
  return days
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(d.count))
    .map((d) => ({ date: d.date, count: Math.max(0, Math.round(d.count)) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-371);
}

// ─── commits ────────────────────────────────────────────────────────────────

type SearchItem = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null; committer: { date: string } | null };
  repository: { full_name: string; private?: boolean };
};

async function commitsFromSearch(): Promise<Result<Commit[]>> {
  "use cache";
  try {
    const url = `https://api.github.com/search/commits?q=author:${USER}&sort=author-date&order=desc&per_page=30`;
    const res = await ghGet(url);
    if (!res.ok) throw new Error(`search ${res.status}`);
    const json = (await res.json()) as { items?: SearchItem[] };
    const seen = new Set<string>();
    const commits: Commit[] = [];
    for (const it of json.items ?? []) {
      // Never surface private work, even if a token could see it.
      if (it.repository?.private !== false || seen.has(it.sha)) continue;
      const when = it.commit.author?.date ?? it.commit.committer?.date;
      if (!when) continue;
      seen.add(it.sha);
      commits.push({
        sha: it.sha,
        repo: it.repository.full_name,
        url: it.html_url,
        message: firstLine(it.commit.message),
        date: new Date(when).toISOString(),
      });
      if (commits.length === COMMIT_COUNT) break;
    }
    if (!commits.length) throw new Error("search returned no public commits");
    cacheLife({ stale: 300, revalidate: 600, expire: 3600 }); // ~10 minutes
    return { ok: true, data: commits, at: new Date().toISOString() };
  } catch (err) {
    cacheLife(FAILED_LIFE);
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

export async function getCommits(): Promise<CommitsFeed> {
  try {
    const live = await commitsFromSearch();
    if (live.ok) return { source: "github", surveyedAt: live.at, commits: live.data };
  } catch {
    /* fall through to the snapshot */
  }
  return { source: "snapshot", surveyedAt: snapshot.surveyedAt, commits: snapshot.commits.slice(0, COMMIT_COUNT) };
}

// ─── contributions ──────────────────────────────────────────────────────────

const CALENDAR_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

type Calendar = { total: number; days: ContributionDay[] };

async function contributionsFromGraphQL(): Promise<Result<Calendar>> {
  "use cache";
  const t = token();
  if (!t) {
    cacheLife("hours");
    return { ok: false, reason: "no token" };
  }
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...ghHeaders(true), "Content-Type": "application/json" },
      body: JSON.stringify({ query: CALENDAR_QUERY, variables: { login: USER } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`graphql ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              totalContributions: number;
              weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
            };
          };
        };
      };
    };
    const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) throw new Error("graphql returned no calendar");
    const days = cleanDays(cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount }))));
    cacheLife("hours");
    return { ok: true, data: { total: cal.totalContributions, days }, at: new Date().toISOString() };
  } catch (err) {
    cacheLife(FAILED_LIFE);
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

async function contributionsFromMirror(): Promise<Result<Calendar>> {
  "use cache";
  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`mirror ${res.status}`);
    const json = (await res.json()) as { total?: { lastYear?: number }; contributions?: { date: string; count: number }[] };
    if (!json.contributions?.length) throw new Error("mirror returned no days");
    const days = cleanDays(json.contributions);
    const total = json.total?.lastYear ?? days.reduce((s, d) => s + d.count, 0);
    cacheLife("hours");
    return { ok: true, data: { total, days }, at: new Date().toISOString() };
  } catch (err) {
    cacheLife(FAILED_LIFE);
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

export async function getContributions(): Promise<ContributionsFeed> {
  try {
    const gql = await contributionsFromGraphQL();
    if (gql.ok) return { source: "github", surveyedAt: gql.at, ...gql.data };
    const mirror = await contributionsFromMirror();
    if (mirror.ok) return { source: "mirror", surveyedAt: mirror.at, ...mirror.data };
  } catch {
    /* fall through to the snapshot */
  }
  return {
    source: "snapshot",
    surveyedAt: snapshot.surveyedAt,
    total: snapshot.contributions.total,
    days: snapshot.contributions.days,
  };
}
