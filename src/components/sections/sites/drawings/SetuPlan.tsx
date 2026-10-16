import { angleAt, Arrow, Block, catmull, Dim, Leader, Note, pointAt, segPath, type P } from "./kit";
import d from "./drawings.module.css";

// Site plan: a vehicle on a road that dives under a GNSS-denied underpass,
// with Detail A blowing up the phone's on-device pipeline. Figures from profile.ts.

const ROAD: P[] = [
  [-30, 392],
  [110, 366],
  [240, 290],
  [372, 232],
  [470, 188],
  [566, 142],
  [652, 110],
  [750, 92],
];
const SEGS = catmull(ROAD);
const TUNNEL = 4;
const CAR_T = 0.45;
const CAR = pointAt(SEGS[2], CAR_T);
const CAR_A = angleAt(SEGS[2], CAR_T);

const FIXES: [number, number][] = [
  [0, 0.45],
  [1, 0.35],
  [1, 0.85],
  [5, 0.55],
  [6, 0.45],
];
const DR: [number, number, number][] = [
  [4, 0.25, 5],
  [4, 0.55, 8],
  [4, 0.85, 12],
];

function portal(t: number) {
  const p = pointAt(SEGS[TUNNEL], t);
  const a = (angleAt(SEGS[TUNNEL], t) * Math.PI) / 180;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const tx = Math.cos(a) * (t === 0 ? -5 : 5);
  const ty = Math.sin(a) * (t === 0 ? -5 : 5);
  const f = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
  const A: P = [p[0] + nx * 21, p[1] + ny * 21];
  const B: P = [p[0] - nx * 21, p[1] - ny * 21];
  return `M${f(A[0] + tx)} ${f(A[1] + ty)} L${f(A[0])} ${f(A[1])} L${f(B[0])} ${f(B[1])} L${f(B[0] + tx)} ${f(B[1] + ty)}`;
}

export function SetuPlan() {
  const road = segPath(SEGS);
  const tunnel = segPath(SEGS, TUNNEL, TUNNEL + 1);
  const mid = pointAt(SEGS[TUNNEL], 0.5);
  return (
    <svg
      viewBox="0 0 720 516"
      className={d.svg}
      role="img"
      aria-label="Site plan of SETU: a vehicle drives into a GNSS-denied underpass; GNSS fixes stop and dead-reckoning estimates continue with growing uncertainty. Detail A shows the phone's on-device pipeline: IMU, spectral velocity odometry, CNN-GRU velocity model, RI-EKF fusion and the offline map."
    >
      {/* ground: contours and footprints */}
      <g className={d.contour}>
        <path className="draw" d="M-10 168 C 70 150, 140 186, 220 160 S 340 96, 430 118" />
        <path className="draw" d="M-10 214 C 80 196, 150 232, 220 212 S 300 170, 340 176" />
        <path className="draw" d="M430 30 C 500 50, 560 20, 640 36 S 700 60, 730 52" />
      </g>
      <g className={d.footprint}>
        <rect x={120} y={222} width={58} height={34} />
        <rect x={44} y={286} width={40} height={28} />
        <rect x={398} y={70} width={64} height={40} />
        <rect x={590} y={196} width={50} height={36} />
        <rect x={640} y={150} width={36} height={26} />
      </g>

      {/* road and the underpass */}
      <path d={road} className={d.roadCase} />
      <path d={road} className={d.roadBed} />
      <path d={tunnel} className={d.tunnelMask} />
      <path d={tunnel} className={d.tunnelEdge} />
      <path d={tunnel} className={d.tunnelBed} />
      <path d={road} className={d.roadLine} />
      <path d={`${portal(0)} ${portal(1)}`} className={d.portal} />
      <text x={mid[0] - 136} y={mid[1] - 36} className={d.lab}>
        GNSS-DENIED UNDERPASS
      </text>

      {/* satellites and their fixes */}
      {(
        [
          [64, 52],
          [196, 34],
        ] as P[]
      ).map(([x, y], i) => {
        const fx = pointAt(SEGS[FIXES[i + 1][0]], FIXES[i + 1][1]);
        return (
          <g key={i}>
            <line x1={x} y1={y + 6} x2={fx[0]} y2={fx[1]} className={d.signal} />
            <g className={d.sat} transform={`translate(${x} ${y}) rotate(-20)`}>
              <rect x={-4} y={-4} width={8} height={8} />
              <rect x={-17} y={-2.5} width={10} height={5} />
              <rect x={7} y={-2.5} width={10} height={5} />
            </g>
          </g>
        );
      })}
      <g>
        <line x1={470} y1={30} x2={505} y2={112} className={d.signal} />
        <path d="M499 104 l12 10 M511 104 l-12 10" className={d.blocked} />
        <g className={d.sat} transform="translate(470 26) rotate(15)">
          <rect x={-4} y={-4} width={8} height={8} />
          <rect x={-17} y={-2.5} width={10} height={5} />
          <rect x={7} y={-2.5} width={10} height={5} />
        </g>
      </g>
      <text x={84} y={48} className={d.code}>
        GNSS
      </text>

      {/* fixes before and after; dead-reckoning estimates inside */}
      {FIXES.map(([s, t], i) => {
        const [x, y] = pointAt(SEGS[s], t);
        return (
          <g key={i} className={d.fixMark} transform={`translate(${x} ${y})`}>
            <circle r={4} />
            <path d="M-8 0 h4 M4 0 h4 M0 -8 v4 M0 4 v4" />
          </g>
        );
      })}
      {DR.map(([s, t, r], i) => {
        const [x, y] = pointAt(SEGS[s], t);
        const a = angleAt(SEGS[s], t);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
            <ellipse rx={r * 1.5} ry={r} className={d.ellipse} />
            <circle r={2.5} className={d.drMark} />
          </g>
        );
      })}

      {/* the vehicle, with the phone on the dash */}
      <g transform={`translate(${CAR[0]} ${CAR[1]}) rotate(${CAR_A})`} className={d.car}>
        <rect x={-23} y={-11} width={46} height={22} rx={5} />
        <path d="M8 -9 v18 M-12 -9 v18" />
        <rect x={-18} y={-14} width={9} height={3} className={d.wheel} />
        <rect x={9} y={-14} width={9} height={3} className={d.wheel} />
        <rect x={-18} y={11} width={9} height={3} className={d.wheel} />
        <rect x={9} y={11} width={9} height={3} className={d.wheel} />
        <rect x={10} y={-4} width={6} height={8} rx={1} className={d.phone} />
      </g>
      <circle cx={CAR[0]} cy={CAR[1]} r={30} className={d.detailRing} />
      <text x={CAR[0] + 30} y={CAR[1] - 24} className={d.code}>
        A
      </text>
      <line x1={CAR[0] + 10} y1={CAR[1] + 28} x2={300} y2={312} className={d.detailLead} />

      {/* north arrow */}
      <g className={d.north} transform="translate(694 30)">
        <path d="M0 -14 L-5 6 L0 2 L5 6 Z" />
        <text y={20} textAnchor="middle" className={d.code}>
          N
        </text>
      </g>

      {/* Detail A: the on-device pipeline, lettered large enough to read */}
      <rect x={240} y={312} width={472} height={198} className={d.detailBox} />
      <text x={254} y={336} className={d.code}>
        DETAIL A · ON-DEVICE PIPELINE
      </text>
      <Block x={252} y={410} w={72} h={44} label="IMU" sub="accel · gyro" />
      <Block x={338} y={410} w={68} h={44} label="SVO" sub="spectral" />
      <Block x={420} y={410} w={104} h={44} label="CNN-GRU" sub="velocity model" />
      <Block x={538} y={410} w={76} h={44} label="RI-EKF" sub="fusion" />
      <Block x={628} y={410} w={74} h={44} label="MAP" sub="MapLibre" />
      <Arrow a={[324, 432]} b={[337, 432]} />
      <Arrow a={[406, 432]} b={[419, 432]} />
      <Arrow a={[524, 432]} b={[537, 432]} />
      <Arrow a={[614, 432]} b={[627, 432]} />

      {/* survey annotations: the figures */}
      <Leader pts={[[288, 410], [288, 392]]} />
      <Note n={3} x={288} y={366} anchor="middle" value="227 Hz" label="sensor pipeline" bx={288} by={376} />

      <Dim a={[420, 398]} b={[524, 398]} ext={0} />
      <Note n={1} x={472} y={366} anchor="middle" value="207 KB" label="on-device model" bx={472} by={376} />

      <Leader pts={[[472, 454], [472, 466]]} />
      <Note n={4} x={472} y={484} anchor="middle" value="84,000+" label="parameters" bx={472} by={480} />

      <Leader pts={[[520, 454], [566, 470]]} />
      <Note n={2} x={572} y={484} value="1–5 ms" label="inference" bx={590} by={480} />
    </svg>
  );
}
