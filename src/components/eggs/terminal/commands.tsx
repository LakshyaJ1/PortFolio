"use client";

import type { ReactNode } from "react";
import {
  ACHIEVEMENTS,
  EDUCATION,
  EXPERIENCE,
  PROFILE,
  PROJECTS,
  SKILLS,
} from "@/content/profile";
import { CACHES } from "@/lib/caches";
import { emit } from "@/lib/events";
import { formatDecimal, formatDMS, formatMonth } from "@/lib/geo";
import { scrollToTarget } from "@/lib/scroll";
import { SECTIONS, sectionById, type SectionId } from "@/lib/sections";
import { useApp, type GameId } from "@/lib/store";
import { CONTOUR_ART } from "../ascii";
import { GAME_IDS, GAME_TITLES, foundCount, formatStamp, nextUnfound } from "../shared";
import { lockTarget } from "../useEggTriggers";
import { useTerm, type LineKind } from "./termStore";
import styles from "./Terminal.module.css";

export type Ctx = {
  print: (node: ReactNode, kind?: LineKind) => void;
  clear: () => void;
  close: () => void;
};

type Command = {
  name: string;
  usage?: string;
  summary: string;
  group: "navigate" | "read" | "play" | "sheet";
  args?: () => string[];
  hidden?: boolean;
  run: (args: string[], ctx: Ctx) => void;
};

/** Output nodes outlive the render that made them; they reach the live terminal through this. */
export const termActions = {
  run: (cmd: string) => void cmd,
  fill: (text: string) => void text,
};

// ─── output primitives ───────────────────────────────────────────

export function Run({ cmd, children, fill = false }: { cmd: string; children?: ReactNode; fill?: boolean }) {
  return (
    <button
      type="button"
      className={styles.run}
      onClick={() => (fill ? termActions.fill(cmd) : termActions.run(cmd))}
      title={fill ? `Type “${cmd}”` : `Run “${cmd}”`}
    >
      {children ?? cmd}
    </button>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:/.test(href) || href.endsWith(".pdf");
  return (
    <a className={styles.ext} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

function Kv({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className={styles.kv}>
      {rows.map(([k, v], i) => (
        <div key={i} className={styles.kvRow}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Head({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <p className={styles.head}>
      <span>{children}</span>
      {aside ? <span className={styles.headAside}>{aside}</span> : null}
    </p>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className={styles.bullets}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Stack({ items }: { items: readonly string[] }) {
  return <p className={styles.stack}>{items.join(" · ")}</p>;
}

function Block({ children }: { children: ReactNode }) {
  return <div className={styles.block}>{children}</div>;
}

const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const range = (start: string, end: string | null) => `${formatMonth(start)} – ${formatMonth(end)}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ─── data ────────────────────────────────────────────────────────

const TOPICS = ["experience", "projects", "education", "skills", "achievements", "resume"] as const;
type Topic = (typeof TOPICS)[number];

const setu = PROJECTS.find((p) => p.id === "setu");
const OPEN: Record<string, { label: string; href: string }> = {
  github: { label: bare(PROFILE.github), href: PROFILE.github },
  linkedin: { label: bare(PROFILE.linkedin), href: PROFILE.linkedin },
  resume: { label: PROFILE.resumePath.slice(1), href: PROFILE.resumePath },
  cal: { label: bare(PROFILE.calUrl), href: PROFILE.calUrl },
  ...(setu?.links[0] ? { setu: { label: bare(setu.links[0].href), href: setu.links[0].href } } : {}),
};

function resolveSection(arg: string): SectionId | null {
  const a = arg.toLowerCase().replace(/^#/, "");
  if (["~", "/", "..", "home", "top"].includes(a)) return "top";
  const hit =
    SECTIONS.find((s) => s.id === a || s.grid.toLowerCase() === a) ??
    SECTIONS.find((s) => s.plain.toLowerCase() === a || s.label.toLowerCase() === a) ??
    SECTIONS.find((s) => s.keywords.includes(a));
  return hit?.id ?? null;
}

/** Jump the sheet to a section once the terminal (and Lenis's lock) is out of the way. */
function travel(id: SectionId, ctx: Ctx) {
  const el = document.getElementById(id);
  if (!el && id !== "top") {
    ctx.print(<>{sectionById(id)?.plain ?? "That section"} isn&rsquo;t on this page yet.</>, "err");
    return false;
  }
  ctx.close();
  requestAnimationFrame(() => requestAnimationFrame(() => scrollToTarget(el ?? 0)));
  return true;
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)] as number[]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function closest(word: string, pool: readonly string[]) {
  const w = word.toLowerCase();
  let best: string | null = null;
  let score = Infinity;
  for (const p of pool) {
    const s = p.startsWith(w) && w.length >= 2 ? 0.5 : levenshtein(w, p);
    if (s < score) {
      score = s;
      best = p;
    }
  }
  return score <= Math.max(2, Math.floor(w.length / 3)) ? best : null;
}

function dym(arg: string, pool: readonly string[], cmd: string, ctx: Ctx, what: string) {
  const guess = closest(arg, pool);
  ctx.print(
    <>
      {arg ? <>No {what} called “{arg}”. </> : null}
      {guess ? (
        <>
          Did you mean <Run cmd={`${cmd} ${guess}`} />?
        </>
      ) : (
        <>
          Try one of:{" "}
          {pool.map((p, i) => (
            <span key={p}>
              {i ? " " : ""}
              <Run cmd={`${cmd} ${p}`}>{p}</Run>
            </span>
          ))}
        </>
      )}
    </>,
    arg ? "err" : "out",
  );
}

// ─── cat ─────────────────────────────────────────────────────────

function catTopic(topic: Topic): ReactNode {
  switch (topic) {
    case "experience":
      return (
        <>
          {EXPERIENCE.map((e) => (
            <Block key={e.id}>
              <Head aside={e.nda ? "Restricted · NDA" : undefined}>
                {e.org}
                {e.orgNote ? ` (${e.orgNote})` : ""} — {e.role}
              </Head>
              <p className={styles.meta}>
                {range(e.start, e.end)} · {e.place} · {e.mode}
              </p>
              {e.nda ? <p className={styles.meta}>Under NDA: shown exactly as the résumé words it, nothing more.</p> : null}
              <Bullets items={e.points} />
              <Stack items={e.stack} />
              {e.link ? (
                <p>
                  <Ext href={e.link.href}>{e.link.label}</Ext>
                </p>
              ) : null}
            </Block>
          ))}
        </>
      );
    case "projects":
      return (
        <>
          {PROJECTS.map((p) => (
            <Block key={p.id}>
              <Head aside={p.category}>
                {p.title} — {p.subtitle}
              </Head>
              <p className={styles.figures}>
                {p.figures.map((f, i) => (
                  <span key={i}>
                    <strong>{f.value}</strong> {f.label}
                  </span>
                ))}
              </p>
              <Bullets items={p.points} />
              <Stack items={p.stack} />
              {p.links.map((l) => (
                <p key={l.href}>
                  <Ext href={l.href}>{l.label}</Ext>
                </p>
              ))}
            </Block>
          ))}
        </>
      );
    case "education":
      return (
        <>
          {EDUCATION.map((e) => (
            <Block key={e.id}>
              <Head aside={`${e.start} – ${e.end}`}>{e.school}</Head>
              <p className={styles.meta}>
                {e.detail} · {e.score} · {e.place}
              </p>
            </Block>
          ))}
        </>
      );
    case "skills":
      return <Kv rows={SKILLS.map((g) => [g.label, g.items.join(" · ")])} />;
    case "achievements":
      return <Kv rows={ACHIEVEMENTS.map((a) => [a.title, a.detail])} />;
    case "resume":
      return (
        <>
          <Block>
            <Head aside={PROFILE.location}>
              {PROFILE.name} — {PROFILE.role}
            </Head>
            <p>{PROFILE.summary}</p>
            <p className={styles.meta}>{PROFILE.status}</p>
          </Block>
          <Kv
            rows={[
              ["Email", <Ext key="m" href={`mailto:${PROFILE.email}`}>{PROFILE.email}</Ext>],
              ["GitHub", <Ext key="g" href={PROFILE.github}>{bare(PROFILE.github)}</Ext>],
              ["LinkedIn", <Ext key="l" href={PROFILE.linkedin}>{bare(PROFILE.linkedin)}</Ext>],
              ...EXPERIENCE.map(
                (e) => [formatMonth(e.start), `${e.role}, ${e.org}${e.end ? "" : " (current)"}`] as [ReactNode, ReactNode],
              ),
              ...EDUCATION.map((e) => [e.end, `${e.detail}, ${e.school} · ${e.score}`] as [ReactNode, ReactNode]),
            ]}
          />
          <p>
            The full PDF: <Run cmd="open resume" /> or <Ext href={PROFILE.resumePath}>download it</Ext>.
          </p>
        </>
      );
  }
}

// ─── survey (neofetch) ───────────────────────────────────────────

const RAMP = ["--z0", "--z1", "--z2", "--z3", "--z4", "--z5", "--z6", "--z7", "--z8", "--z9", "--z10", "--fix", "--hydro"];

function uptime() {
  const s = Math.floor(performance.now() / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s on this sheet` : `${s}s on this sheet`;
}

function Survey() {
  const app = useApp.getState();
  const active = sectionById(app.activeSection);
  const rows: [string, ReactNode][] = [
    ["Surveyor", `${PROFILE.name}`],
    ["Role", PROFILE.role],
    ["Base", `${PROFILE.location} · ${formatDMS(PROFILE.home)}`],
    ["Now", PROFILE.status],
    ["Stations", `${plural(EXPERIENCE.length, "role")} on the traverse`],
    ["Sites", `${plural(PROJECTS.length, "site")} surveyed`],
    ["Stack", "Claude · LangGraph · RAG · PyTorch · ROS2 · Unity"],
    ["Reading", active?.plain ?? "Home"],
    ["Easter eggs", `${foundCount(app.caches)} / ${CACHES.length} found`],
    ["Uptime", uptime()],
    ["Mode", `${app.plain ? "plain sheet" : "full survey"} · sound ${app.sound ? "on" : "off"}`],
  ];
  return (
    <div className={styles.survey}>
      <pre className={styles.art} aria-hidden="true">
        {CONTOUR_ART.map((line, i) => {
          const at = line.indexOf("+");
          return (
            <span key={i}>
              {at === -1 ? (
                line
              ) : (
                <>
                  {line.slice(0, at)}
                  <span className={styles.summit}>+</span>
                  {line.slice(at + 1)}
                </>
              )}
              {i < CONTOUR_ART.length - 1 ? "\n" : ""}
            </span>
          );
        })}
      </pre>
      <div className={styles.surveyInfo}>
        <p className={styles.surveyTitle}>
          <strong>surveyor</strong>@<strong>lakshya</strong>
        </p>
        <Kv rows={rows} />
        <p className={styles.swatches} aria-label="Sheet palette: eleven zone tones, survey orange and hydro blue">
          {RAMP.map((v) => (
            <span key={v} style={{ background: `var(${v})` }} />
          ))}
        </p>
      </div>
    </div>
  );
}

// ─── commands ────────────────────────────────────────────────────

export const COMMANDS: Command[] = [
  {
    name: "help",
    summary: "this list",
    group: "sheet",
    run: (_, ctx) => {
      const groups: [Command["group"], string][] = [
        ["navigate", "Navigate"],
        ["read", "Read"],
        ["play", "Play"],
        ["sheet", "Sheet"],
      ];
      ctx.print(
        <>
          {groups.map(([g, label]) => (
            <Block key={g}>
              <Head>{label}</Head>
              <dl className={styles.help}>
                {COMMANDS.filter((c) => c.group === g && !c.hidden).map((c) => (
                  <div key={c.name} className={styles.kvRow}>
                    <dt>
                      <Run cmd={c.usage ? `${c.name} ` : c.name} fill={Boolean(c.usage)}>
                        {c.name}
                      </Run>
                      {c.usage ? <span className={styles.usage}> {c.usage}</span> : null}
                    </dt>
                    <dd>{c.summary}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          ))}
          <p className={styles.meta}>
            <kbd>Tab</kbd> completes · <kbd>Up</kbd> <kbd>Down</kbd> walk history · <kbd>Esc</kbd> or <kbd>`</kbd> closes
          </p>
        </>,
      );
    },
  },
  {
    name: "whoami",
    summary: "who drew this sheet",
    group: "read",
    run: (_, ctx) =>
      ctx.print(
        <>
          <p className={styles.meta}>You&rsquo;re the surveyor. The sheet belongs to:</p>
          <Kv
            rows={[
              ["Name", PROFILE.name],
              ["Role", PROFILE.role],
              ["Meaning", PROFILE.nameMeaning],
              ["Base", `${PROFILE.location} · ${formatDMS(PROFILE.home)}`],
              ["Now", PROFILE.status],
              ["Summary", PROFILE.summary],
            ]}
          />
        </>,
      ),
  },
  {
    name: "ls",
    summary: "list the sections of the page",
    group: "navigate",
    run: (_, ctx) =>
      ctx.print(
        <>
          <dl className={styles.ls}>
            {SECTIONS.map((s) => (
              <div key={s.id} className={styles.kvRow}>
                <dt>{s.plain}</dt>
                <dd>
                  <Run cmd={`cd ${s.id}`}>{s.id}</Run>
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.meta}>
            Readable with cat:{" "}
            {TOPICS.map((t, i) => (
              <span key={t}>
                {i ? " " : ""}
                <Run cmd={`cat ${t}`}>{t}</Run>
              </span>
            ))}
          </p>
        </>,
      ),
  },
  {
    name: "cd",
    usage: "<section>",
    summary: "go to a section (cd sites, cd experience)",
    group: "navigate",
    args: () => SECTIONS.map((s) => s.id),
    run: ([arg], ctx) => {
      if (!arg) return dym("", SECTIONS.map((s) => s.id), "cd", ctx, "section");
      const id = resolveSection(arg);
      if (!id) return dym(arg, SECTIONS.map((s) => s.id), "cd", ctx, "section");
      const meta = sectionById(id)!;
      if (travel(id, ctx)) ctx.print(<>Going to {meta.plain}</>, "ok");
    },
  },
  {
    name: "cat",
    usage: "<topic>",
    summary: "experience · projects · education · skills · achievements · resume",
    group: "read",
    args: () => [...TOPICS],
    run: ([arg], ctx) => {
      const t = (arg ?? "").toLowerCase() as Topic;
      if (!TOPICS.includes(t)) return dym(arg ?? "", TOPICS, "cat", ctx, "file");
      ctx.print(catTopic(t));
    },
  },
  {
    name: "open",
    usage: "<link>",
    summary: "github · linkedin · resume · cal · setu",
    group: "navigate",
    args: () => Object.keys(OPEN),
    run: ([arg], ctx) => {
      const key = (arg ?? "").toLowerCase();
      const target = OPEN[key];
      if (!target) return dym(arg ?? "", Object.keys(OPEN), "open", ctx, "link");
      window.open(target.href, "_blank", "noopener,noreferrer");
      ctx.print(
        <>
          Opening <Ext href={target.href}>{target.label}</Ext> in a new tab.
        </>,
        "ok",
      );
    },
  },
  {
    name: "contact",
    summary: "every way to reach him",
    group: "navigate",
    run: (_, ctx) =>
      ctx.print(
        <>
          <Kv
            rows={[
              ["Email", <Ext key="m" href={`mailto:${PROFILE.email}`}>{PROFILE.email}</Ext>],
              ["Call", <Ext key="c" href={PROFILE.calUrl}>{bare(PROFILE.calUrl)}</Ext>],
              ["LinkedIn", <Ext key="l" href={PROFILE.linkedin}>{bare(PROFILE.linkedin)}</Ext>],
              ["GitHub", <Ext key="g" href={PROFILE.github}>{bare(PROFILE.github)}</Ext>],
            ]}
          />
          <p className={styles.meta}>
            Fastest: <Run cmd="book" /> a 30-minute rendezvous.
          </p>
        </>,
      ),
  },
  {
    name: "book",
    summary: "go to the rendezvous and book 30 minutes",
    group: "navigate",
    run: (_, ctx) => {
      if (travel("rendezvous", ctx)) ctx.print(<>Rendezvous at J9. Pick a slot.</>, "ok");
    },
  },
  {
    name: "hint",
    summary: "how to find the next Easter egg",
    group: "play",
    run: (_, ctx) => {
      const next = nextUnfound();
      if (!next) return ctx.print(<>All {CACHES.length} Easter eggs found. Nothing left to find.</>, "ok");
      ctx.print(
        <Kv
          rows={[
            ["Easter egg", next.name],
            ["How", next.hint],
          ]}
        />,
      );
    },
  },
  {
    name: "eggs",
    summary: "your Easter egg finds so far",
    group: "play",
    run: (_, ctx) => {
      const caches = useApp.getState().caches;
      ctx.print(
        <>
          <Head aside={`${foundCount(caches)} / ${CACHES.length} found`}>Easter eggs</Head>
          <dl className={styles.ls}>
            {CACHES.map((c, i) => (
              <div key={c.id} className={styles.kvRow} data-found={caches[c.id] ? "" : undefined}>
                <dt>{String(i + 1).padStart(2, "0")}</dt>
                <dd>{caches[c.id] ? `${c.name} · ${formatStamp(caches[c.id]!)}` : "???"}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.meta}>
            The full page: <Run cmd="logbook" />
          </p>
        </>,
      );
    },
  },
  {
    name: "logbook",
    summary: "open the Easter egg logbook",
    group: "play",
    run: () => useApp.getState().openOverlay("logbook"),
  },
  {
    name: "play",
    usage: "<game>",
    summary: "rover · snake · deepfake · coin",
    group: "play",
    args: () => [...GAME_IDS],
    run: ([arg], ctx) => {
      const id = (arg ?? "").toLowerCase();
      if (!GAME_IDS.includes(id as GameId)) {
        if (arg) return dym(arg, GAME_IDS, "play", ctx, "game");
        return ctx.print(
          <dl className={styles.ls}>
            {GAME_IDS.map((g) => (
              <div key={g} className={styles.kvRow}>
                <dt>
                  <Run cmd={`play ${g}`}>{g}</Run>
                </dt>
                <dd>{GAME_TITLES[g]}</dd>
              </div>
            ))}
          </dl>,
        );
      }
      useApp.getState().startGame(id as GameId);
    },
  },
  {
    name: "plain",
    usage: "on|off",
    summary: "plain sheet: heavy effects off",
    group: "sheet",
    args: () => ["on", "off"],
    run: ([arg], ctx) => {
      const app = useApp.getState();
      if (arg === "on" || arg === "off") app.setPlain(arg === "on");
      else if (arg) return dym(arg, ["on", "off"], "plain", ctx, "setting");
      ctx.print(<>Plain sheet is {useApp.getState().plain ? "on" : "off"}.</>, "ok");
    },
  },
  {
    name: "sound",
    usage: "on|off",
    summary: "game blips and voice",
    group: "sheet",
    args: () => ["on", "off"],
    run: ([arg], ctx) => {
      const app = useApp.getState();
      if (arg === "on" || arg === "off") app.setSound(arg === "on");
      else if (arg) return dym(arg, ["on", "off"], "sound", ctx, "setting");
      ctx.print(<>Sound is {useApp.getState().sound ? "on" : "off"}.</>, "ok");
    },
  },
  {
    name: "date",
    summary: "survey time, local and Delhi",
    group: "read",
    run: (_, ctx) => {
      const now = new Date();
      const fmt = (tz?: string) =>
        now.toLocaleString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          ...(tz ? { timeZone: tz } : {}),
        });
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      ctx.print(
        <Kv
          rows={[
            ["Local", `${fmt()} · ${zone}`],
            ["Delhi", `${fmt("Asia/Kolkata")} · IST`],
            ["UTC", now.toISOString()],
          ]}
        />,
      );
    },
  },
  {
    name: "coords",
    summary: "the base fix and where you are on the sheet",
    group: "read",
    run: (_, ctx) => {
      const active = sectionById(useApp.getState().activeSection);
      ctx.print(
        <Kv
          rows={[
            ["Base fix", `${formatDMS(PROFILE.home)} · ${formatDecimal(PROFILE.home)}`],
            ["You're reading", active?.plain ?? "Home"],
            [
              "Your fix",
              <>
                None. GPS-denied out here. Dead-reckon with <Run cmd="play rover" />.
              </>,
            ],
          ]}
        />,
      );
    },
  },
  {
    name: "survey",
    summary: "a summary card of the sheet",
    group: "read",
    run: (_, ctx) => ctx.print(<Survey />),
  },
  {
    name: "hello",
    summary: "replay the greeting and intro",
    group: "play",
    run: (_, ctx) => {
      ctx.close();
      const app = useApp.getState();
      app.setPhase("intro");
      emit("intro:replay", {});
    },
  },
  {
    name: "sudo",
    usage: "<command>",
    summary: "you know the one",
    group: "sheet",
    hidden: true,
    args: () => ["hire-lakshya"],
    run: ([arg], ctx) => {
      if (arg !== "hire-lakshya") {
        ctx.print(<>surveyor is not in the sudoers file. This incident will be reported to Bindu.</>, "err");
        return;
      }
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = calm ? 120 : 520;
      const lines: [ReactNode, LineKind][] = [
        ["[sudo] password for recruiter: ••••••••", "sys"],
        ["Verifying… credentials accepted. Good taste detected.", "out"],
        [`Granting role: ${PROFILE.role} → your team`, "out"],
        ["Opening rendezvous at J9. Thirty minutes, your pick of slot.", "ok"],
      ];
      lines.forEach(([node, kind], i) => window.setTimeout(() => ctx.print(node, kind), i * step));
      window.setTimeout(() => {
        const app = useApp.getState();
        if (app.overlay === "terminal") ctx.close();
        else if (app.overlay !== null) return;
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToTarget("#rendezvous")));
      }, lines.length * step + 300);
    },
  },
  {
    name: "history",
    summary: "commands you've run",
    group: "sheet",
    hidden: true,
    run: (_, ctx) => {
      const items = useTerm.getState().history;
      ctx.print(items.length ? <History items={items} /> : "No history yet.");
    },
  },
  {
    name: "echo",
    summary: "print text",
    group: "sheet",
    hidden: true,
    run: (args, ctx) => ctx.print(args.join(" ") || " "),
  },
  {
    name: "pwd",
    summary: "where you are",
    group: "sheet",
    hidden: true,
    run: (_, ctx) => {
      const s = sectionById(useApp.getState().activeSection);
      ctx.print(`/lakshya/${s?.id ?? "top"}`);
    },
  },
  {
    name: "lakshya",
    summary: "lock on",
    group: "play",
    hidden: true,
    run: (_, ctx) => {
      lockTarget();
      ctx.print(<>लक्ष्य — target locked.</>, "ok");
    },
  },
  {
    name: "rm",
    summary: "nope",
    group: "sheet",
    hidden: true,
    run: (_, ctx) => ctx.print(<>Permission denied. The sheet is laminated.</>, "err"),
  },
  {
    name: "clear",
    summary: "clear the scrollback",
    group: "sheet",
    run: (_, ctx) => ctx.clear(),
  },
  {
    name: "exit",
    summary: "close the terminal",
    group: "sheet",
    run: (_, ctx) => ctx.close(),
  },
];

export const COMMAND_NAMES = COMMANDS.map((c) => c.name);
const VISIBLE_NAMES = COMMANDS.filter((c) => !c.hidden).map((c) => c.name);

export function findCommand(name: string) {
  const n = name.toLowerCase();
  if (n === "quit" || n === "q") return COMMANDS.find((c) => c.name === "exit");
  if (n === "man" || n === "?") return COMMANDS.find((c) => c.name === "help");
  if (n === "cls") return COMMANDS.find((c) => c.name === "clear");
  if (n === "caches" || n === "egg") return COMMANDS.find((c) => c.name === "eggs");
  return COMMANDS.find((c) => c.name === n);
}

export function unknownCommand(name: string, ctx: Ctx) {
  const guess = closest(name, VISIBLE_NAMES);
  ctx.print(
    <>
      command not found: {name}.{" "}
      {guess ? (
        <>
          Did you mean <Run cmd={guess} />?
        </>
      ) : (
        <>
          Type <Run cmd="help" /> for the list.
        </>
      )}
    </>,
    "err",
  );
}

/** Tab-completion candidates for the current input. */
export function completions(value: string): { candidates: string[]; replaceFrom: number; isCommand: boolean } {
  const lead = value.match(/^\s*/)?.[0].length ?? 0;
  const body = value.slice(lead);
  const space = body.search(/\s/);
  if (space === -1) {
    const w = body.toLowerCase();
    return {
      candidates: VISIBLE_NAMES.filter((n) => n.startsWith(w)),
      replaceFrom: lead,
      isCommand: true,
    };
  }
  const cmd = findCommand(body.slice(0, space));
  const rest = body.slice(space).replace(/^\s+/, "");
  const lastStart = value.length - rest.length;
  if (!cmd?.args || /\s/.test(rest)) return { candidates: [], replaceFrom: lastStart, isCommand: false };
  const w = rest.toLowerCase();
  return {
    candidates: Array.from(new Set(cmd.args().filter((a) => a.startsWith(w)))),
    replaceFrom: lastStart,
    isCommand: false,
  };
}

export function commandTakesArgs(name: string) {
  return Boolean(findCommand(name)?.usage);
}

export function Banner() {
  return (
    <div className={styles.banner}>
      <p>
        <strong>Welcome to Lakshya&rsquo;s terminal.</strong> Type a command and press Enter, or just click one:
      </p>
      <ul className={styles.starters}>
        <li>
          <Run cmd="help" /> <span className={styles.usage}>every command</span>
        </li>
        <li>
          <Run cmd="cat projects" /> <span className={styles.usage}>what he has built</span>
        </li>
        <li>
          <Run cmd="cat experience" /> <span className={styles.usage}>where he has worked</span>
        </li>
        <li>
          <Run cmd="book" /> <span className={styles.usage}>book a 30-minute call</span>
        </li>
        <li>
          <Run cmd="play snake" /> <span className={styles.usage}>a quick game</span>
        </li>
        <li>
          <Run cmd="hint" /> <span className={styles.usage}>find the hidden Easter eggs</span>
        </li>
      </ul>
      <p className={styles.meta}>
        <kbd>Tab</kbd> completes a command. <kbd>Esc</kbd> closes the terminal.
      </p>
    </div>
  );
}

export function History({ items }: { items: string[] }) {
  return (
    <ol className={styles.history}>
      {items.map((h, i) => (
        <li key={i}>
          <span className={styles.usage}>{String(i + 1).padStart(3, " ")}</span> <Run cmd={h} />
        </li>
      ))}
    </ol>
  );
}
