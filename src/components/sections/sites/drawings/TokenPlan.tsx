import { Arrow, Dim, Note } from "./kit";
import d from "./drawings.module.css";

// Site plan: an auto-generated Move module launches Lakshyacoin from the pad;
// 90% of supply runs into liquidity pools under lock (profile.ts).

const BAR_X = 24;
const BAR_W = 592;
const LOCKED = BAR_X + BAR_W * 0.9;

export function CoinGlyph({ r = 26 }: { r?: number }) {
  // Lakshyacoin: a coin whose face is a target, because लक्ष्य means target
  const k = r / 26;
  return (
    <g className={d.coin}>
      <circle r={r} />
      <circle r={18 * k} />
      <circle r={4 * k} className={d.coinCore} />
      <path d={`M0 ${-18 * k} v${8 * k} M0 ${18 * k} v${-8 * k} M${-18 * k} 0 h${8 * k} M${18 * k} 0 h${-8 * k}`} />
    </g>
  );
}

export function TokenPlan() {
  return (
    <svg
      viewBox="0 0 640 312"
      className={d.svg}
      role="img"
      aria-label="Site plan of TokenForge: an automatically generated Move module launches Lakshyacoin from the launchpad, and 90% of the supply is locked in liquidity pools."
    >
      <g className={d.contour}>
        <path className="draw" d="M150 24 C 220 10, 300 34, 380 20 S 520 6, 640 22" />
      </g>

      {/* the generated Move module */}
      <g className={d.doc}>
        <path d="M24 30 h108 l20 20 v140 h-128 z" className="draw" />
        <path d="M132 30 v20 h20" />
      </g>
      <text x={34} y={66} className={d.code}>
        MOVE MODULE
      </text>
      {[94, 64, 82, 50, 88, 70, 40, 76].map((w, i) => (
        <rect key={i} x={i % 3 === 0 ? 34 : 44} y={80 + i * 12} width={w - (i % 3 === 0 ? 0 : 10)} height={4} className={d.codeBar} />
      ))}
      <Arrow a={[158, 118]} b={[196, 130]} />
      <text x={158} y={106} className={d.blockSub}>
        auto-generated
      </text>

      {/* launchpad and coin */}
      <path d="M196 168 h140 l-14 -16 h-112 z" className={d.pad} />
      <path d="M216 168 v14 M316 168 v14 M206 182 h120" className={d.padLegs} />
      <path d="M266 136 v10 M256 140 v8 M276 140 v8" className={d.exhaust} />
      <g transform="translate(266 102)">
        <CoinGlyph />
      </g>
      <text x={266} y={62} textAnchor="middle" className={d.lab}>
        LAKSHYACOIN
      </text>

      {/* liquidity pool under lock */}
      <Arrow a={[340, 140]} b={[398, 132]} />
      <path d="M404 92 L420 172 H580 L596 92" className={d.pool} />
      <path d="M414 120 H586 M418 140 H582 M421 156 H579" className={d.poolLevel} />
      <g className={d.lock} transform="translate(500 66)">
        <rect x={-12} y={0} width={24} height={20} rx={2} />
        <path d="M-7 0 v-7 a7 7 0 0 1 14 0 v7" />
        <circle cx={0} cy={9} r={2} />
      </g>
      <text x={500} y={194} textAnchor="middle" className={d.lab}>
        LIQUIDITY POOLS · LOCKED
      </text>

      {/* supply bar */}
      <line x1={500} y1={198} x2={500} y2={222} className={d.signal} />
      <rect x={BAR_X} y={222} width={LOCKED - BAR_X} height={22} className={d.supplyLocked} />
      <rect x={LOCKED} y={222} width={BAR_X + BAR_W - LOCKED} height={22} className={d.supplyRest} />
      <text x={BAR_X + 10} y={237} className={d.code}>
        SUPPLY
      </text>
      <Dim a={[BAR_X, 258]} b={[LOCKED, 258]} ext={-14} />
      <Note n={1} x={(BAR_X + LOCKED) / 2} y={282} anchor="middle" value="90%" label="supply locked in liquidity pools" bx={(BAR_X + LOCKED) / 2} by={282} />
    </svg>
  );
}
