import { Arrow, Block, Note } from "./kit";
import d from "./drawings.module.css";

// Site plan: a HubSpot Closed-Won deal lands on the NATS bus. Above it, the agent plane
// (no database) drafts the e-mail and kickoff proposal under spend caps; below it, the
// product plane (PostgreSQL) assembles the SOW and deck, passes one policy gate and
// queues everything for a person. No path leads out to the customer (profile.ts).

const PLANE_X = 176;
const PLANE_W = 524;
const BUS_Y = 200;

/** a drafted document: a sheet with a folded corner and text bars */
function Doc({ x, y, label }: { x: number; y: number; label: string }) {
  const w = 86;
  const h = 70;
  return (
    <g>
      <g className={d.doc}>
        <path d={`M${x} ${y} h${w - 14} l14 14 v${h - 14} h${-w} z`} className="draw" />
        <path d={`M${x + w - 14} ${y} v14 h14`} />
      </g>
      <text x={x + 9} y={y + 24} className={d.blockLabel}>
        {label}
      </text>
      {[58, 44, 52, 36].map((bw, i) => (
        <rect key={i} x={x + 9} y={y + 34 + i * 8} width={bw} height={3} className={d.codeBar} />
      ))}
    </g>
  );
}

export function OnboardPlan() {
  return (
    <svg
      viewBox="0 0 800 430"
      className={d.svg}
      role="img"
      aria-label="Site plan of the CS Onboarding Agent: a HubSpot Closed-Won deal arrives on a NATS event bus. In the agent plane, which has no database, a LangGraph agent drafts the e-mail and the kickoff proposal under per-run and per-day spend caps. In the PostgreSQL product plane the SOW and deck are assembled, pass one policy gate and wait for human approval. No path sends customer e-mail."
    >
      <g className={d.contour}>
        <path className="draw" d="M-10 22 C 120 6, 250 30, 390 14 S 640 4, 810 20" />
      </g>

      {/* the trigger: a deal marked Closed-Won */}
      <Block x={16} y={168} w={132} h={64} label="HUBSPOT DEAL" sub="Closed-Won" />
      <g className={d.stamp} transform="translate(146 170)">
        <circle r={10} />
        <path d="M-4.5 0.5 l3 3 l6 -7" />
      </g>
      <Arrow a={[148, BUS_Y]} b={[PLANE_X + 6, BUS_Y]} />

      {/* ── agent plane: no database ── */}
      <rect x={PLANE_X} y={40} width={PLANE_W} height={132} rx={3} className={d.plane} />
      <text x={190} y={62} className={d.lab}>
        AGENT PLANE
      </text>
      <text x={294} y={62} className={d.blockSub}>
        no database
      </text>
      <Block x={192} y={80} w={156} h={60} label="LANGGRAPH AGENT" sub="injection-fenced" />
      <Arrow a={[348, 110]} b={[384, 110]} />
      <Doc x={388} y={76} label="E-MAIL" />
      <Doc x={486} y={76} label="PROPOSAL" />

      {/* spend caps */}
      <text x={600} y={92} className={d.blockLabel}>
        SPEND CAPS
      </text>
      <rect x={600} y={102} width={86} height={9} className={d.meterTrack} />
      <rect x={600} y={102} width={30} height={9} className={d.meterFill} />
      <line x1={686} y1={96} x2={686} y2={117} className={d.meterCap} />
      <text x={600} y={132} className={d.blockSub}>
        per run · per day
      </text>

      {/* ── the bus between the planes ── */}
      <line x1={PLANE_X + 8} y1={BUS_Y} x2={PLANE_X + PLANE_W} y2={BUS_Y} className={d.bus} />
      <text x={196} y={193} className={d.lab}>
        NATS
      </text>
      <text x={238} y={193} className={d.blockSub}>
        event bus
      </text>
      {[400, 414, 428].map((x) => (
        <rect key={x} x={x} y={BUS_Y - 4} width={8} height={8} className={d.evt} />
      ))}
      <text x={444} y={193} className={d.blockSub}>
        idempotent ingest
      </text>
      <line x1={320} y1={140} x2={320} y2={BUS_Y} className={d.flow} />
      <line x1={346} y1={BUS_Y} x2={346} y2={268} className={d.flow} />
      <line x1={620} y1={172} x2={620} y2={228} className={d.http} />
      <text x={628} y={188} className={d.blockSub}>
        read-only HTTP
      </text>

      {/* ── product plane: PostgreSQL ── */}
      <rect x={PLANE_X} y={228} width={PLANE_W} height={132} rx={3} className={d.plane} />
      <text x={190} y={250} className={d.lab}>
        PRODUCT PLANE
      </text>
      <text x={326} y={250} className={d.blockSub}>
        owns the data
      </text>
      <g className={d.db}>
        <path d="M200 274 v40 a22 6 0 0 0 44 0 v-40" className="draw" />
        <ellipse cx={222} cy={274} rx={22} ry={6} />
      </g>
      <text x={222} y={340} textAnchor="middle" className={d.blockSub}>
        PostgreSQL
      </text>
      <Arrow a={[248, 296]} b={[284, 296]} />
      <Block x={288} y={268} w={116} h={56} label="SOW + DECK" sub="assembled" />
      <Arrow a={[404, 296]} b={[434, 296]} />

      {/* one policy choke point */}
      <g className={d.gate}>
        <path d="M438 272 L458 296 L438 320 M486 272 L466 296 L486 320" className="draw" />
        <circle cx={462} cy={296} r={2.5} />
      </g>
      <text x={462} y={340} textAnchor="middle" className={d.blockSub}>
        policy gate
      </text>
      <Arrow a={[488, 296]} b={[512, 296]} />

      {/* the approval queue: a person signs off */}
      <g className={d.queue}>
        {[2, 1, 0].map((k) => (
          <rect key={k} x={516 + k * 6} y={266 - k * 6} width={80} height={50} rx={2} />
        ))}
        <rect x={524} y={276} width={10} height={10} className={d.check} />
        <path d="M526 281 l2.5 2.5 l5 -6" className={d.checkMark} />
        <path d="M540 281 h46 M524 296 h60 M524 306 h44" className={d.queueLines} />
      </g>
      <text x={562} y={340} textAnchor="middle" className={d.blockLabel}>
        APPROVAL
      </text>
      <text x={562} y={354} textAnchor="middle" className={d.blockSub}>
        a person signs off
      </text>

      {/* no path out to the customer */}
      <line x1={612} y1={291} x2={636} y2={291} className={d.signal} />
      <path d="M640 280 v24" className={d.wall} />
      <g className={d.mail}>
        <rect x={650} y={280} width={40} height={24} rx={1.5} />
        <path d="M650 281 l20 13 l20 -13" />
      </g>
      <path d="M646 276 L694 308" className={d.wall} />
      <text x={670} y={324} textAnchor="middle" className={d.blockSub}>
        no send path
      </text>

      {/* figures */}
      <Note n={1} x={16} y={396} value="4,800+" label="automated tests" bx={16} by={396} />
      <Note n={2} x={250} y={396} value="US$2.45" label="AI spend, end-to-end pilot" bx={250} by={396} />
      <Note n={3} x={520} y={396} value="0" label="5xx errors in the pilot" bx={520} by={396} />
    </svg>
  );
}
