import { Arrow, Block, Dim, Leader, Note, type P } from "./kit";
import d from "./drawings.module.css";

// Site plan: a pile of product listings splits into text and image, through
// BERT and ResNet embeddings, into an XGBoost + LightGBM ensemble and out as a price.

function Tree({ x, y, label }: { x: number; y: number; label: string }) {
  const kids: P[] = [
    [x - 20, y + 22],
    [x + 20, y + 22],
  ];
  const leaves: P[] = [
    [x - 30, y + 44],
    [x - 10, y + 44],
    [x + 10, y + 44],
    [x + 30, y + 44],
  ];
  return (
    <g className={d.tree}>
      {kids.map(([kx, ky], i) => (
        <line key={i} x1={x} y1={y} x2={kx} y2={ky} className="draw" />
      ))}
      {leaves.map(([lx, ly], i) => (
        <line key={i} x1={kids[i < 2 ? 0 : 1][0]} y1={kids[0][1]} x2={lx} y2={ly} className="draw" />
      ))}
      <circle cx={x} cy={y} r={4} />
      {kids.map(([kx, ky], i) => (
        <circle key={i} cx={kx} cy={ky} r={3.5} />
      ))}
      {leaves.map(([lx, ly], i) => (
        <rect key={i} x={lx - 3} y={ly - 3} width={6} height={6} />
      ))}
      <text x={x} y={y + 64} textAnchor="middle" className={d.blockLabel}>
        {label}
      </text>
    </g>
  );
}

function Vector({ x, y }: { x: number; y: number }) {
  return (
    <g className={d.vector}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={x + i * 9} y={y} width={8} height={12} style={{ opacity: 0.35 + ((i * 37) % 10) / 15 }} />
      ))}
    </g>
  );
}

export function PricingPlan() {
  return (
    <svg
      viewBox="0 0 760 420"
      className={d.svg}
      role="img"
      aria-label="Site plan of the pricing pipeline: product listings split into text and image; BERT and ResNet embeddings are fused and fed to an XGBoost and LightGBM ensemble that outputs a price."
    >
      <g className={d.contour}>
        <path className="draw" d="M-10 392 C 90 372, 180 404, 300 386 S 420 350, 470 360" />
        <path className="draw" d="M-10 60 C 60 40, 120 76, 200 58" />
      </g>

      {/* the pile of listings */}
      {[3, 2, 1].map((k) => (
        <rect key={k} x={52 + k * 9} y={150 + k * 9} width={124} height={110} rx={2} className={d.card} />
      ))}
      <g className={d.cardTop}>
        <rect x={52} y={150} width={124} height={110} rx={2} />
        <rect x={62} y={162} width={56} height={44} className={d.frame} />
        <path d="M64 202 l14 -16 10 10 8 -7 20 13" className={d.frameArt} />
        <circle cx={104} cy={172} r={4} className={d.frameArt} />
        <path d="M126 168 h40 M126 178 h34 M126 188 h38 M62 222 h104 M62 234 h80 M62 246 h92" className={d.textLines} />
      </g>

      {/* text branch → BERT, image branch → ResNet */}
      <path d="M176 182 C 205 182, 205 138, 234 138" className={d.flow} />
      <path d="M176 232 C 205 232, 205 288, 234 288" className={d.flow} />
      <Block x={236} y={120} w={84} h={38} label="BERT" sub="text embedding" />
      <Block x={236} y={270} w={84} h={38} label="RESNET" sub="image embedding" />
      <Arrow a={[320, 139]} b={[334, 139]} />
      <Arrow a={[320, 289]} b={[334, 289]} />
      <Vector x={336} y={133} />
      <Vector x={336} y={283} />

      {/* fuse */}
      <path d="M408 139 C 430 139, 430 200, 446 200 M408 289 C 430 289, 430 226, 446 226" className={d.flow} />
      <rect x={446} y={178} width={10} height={70} className={d.fuse} />
      <text x={451} y={266} textAnchor="middle" className={d.blockSub}>
        fused
      </text>

      {/* ensemble */}
      <path d="M456 205 C 486 205, 500 128, 533 128 M456 221 C 486 221, 500 278, 533 278" className={d.flow} />
      <Tree x={538} y={128} label="XGBOOST" />
      <Tree x={538} y={278} label="LIGHTGBM" />
      <path d="M572 172 C 592 172, 590 206, 606 206 M572 322 C 592 322, 590 222, 606 222" className={d.flow} />
      <Block x={606} y={196} w={66} h={34} label="ENSEMBLE" />
      <Arrow a={[672, 213]} b={[684, 213]} />
      <g className={d.tag}>
        <path d="M686 199 h52 v28 h-52 l-8 -14 z" className="draw" />
        <circle cx={690} cy={213} r={2.5} />
        <text x={714} y={217} textAnchor="middle" className={d.blockLabel}>
          PRICE
        </text>
      </g>

      {/* annotations */}
      <Leader pts={[[100, 150], [100, 130]]} />
      <Note n={3} x={56} y={104} value="150,000+" label="products" bx={100} by={112} />

      <g className={d.bench}>
        <path d="M698 72 h28 M712 74 l-9 18 M712 74 l9 18 M712 74 v18" />
        <line x1={712} y1={96} x2={712} y2={198} className={d.benchLine} />
      </g>
      <Note n={1} x={690} y={70} anchor="end" value="Top 20%" label="global leaderboard" bx={680} by={74} />

      <Leader pts={[[724, 227], [724, 300]]} />
      <Note n={2} x={748} y={318} anchor="end" value="21.06%" label="SMAPE" bx={724} by={312} />

      <g className={d.datum}>
        <line x1={470} y1={372} x2={636} y2={372} className={d.datumBase} />
        <line x1={470} y1={398} x2={636} y2={398} />
        <text x={470} y={366} className={d.blockSub}>
          baseline models
        </text>
        <text x={470} y={412} className={d.blockSub}>
          ensemble · lower error
        </text>
      </g>
      <Dim a={[620, 372]} b={[620, 398]} />
      <Note n={4} x={636} y={382} value="15%" label="better than baseline" bx={648} by={385} />
    </svg>
  );
}
