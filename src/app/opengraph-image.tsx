import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Lakshya Jain — AI Engineer. A night survey of an AI engineer's terrain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "assets/fonts");
const [expanded, regular, mono] = await Promise.all([
  readFile(join(fontDir, "Archivo-ExpandedBold.ttf")),
  readFile(join(fontDir, "Archivo-Regular.ttf")),
  readFile(join(fontDir, "MartianMono-Regular.ttf")),
]);

/** Contours of a small loss surface with two basins, as SVG path data. */
function contourPaths() {
  const paths: { d: string; index: boolean }[] = [];
  for (let i = 1; i <= 22; i++) {
    const r = i * 21;
    const pts: string[] = [];
    for (let a = 0; a <= 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(3 * t + i * 0.35) + 0.07 * Math.cos(5 * t - i * 0.2);
      const x = 1010 + Math.cos(t) * r * 1.45 * wobble;
      const y = 170 + Math.sin(t) * r * 0.82 * wobble;
      pts.push(`${a === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    paths.push({ d: pts.join(" ") + " Z", index: i % 5 === 0 });
  }
  return paths;
}

export default function Image() {
  const contours = contourPaths();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0b100d",
          color: "#eef2ec",
          fontFamily: "Archivo",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", inset: 0 }}>
          {contours.map((c, i) => (
            <path key={i} d={c.d} fill="none" stroke={c.index ? "#46554c" : "#2f3c35"} strokeWidth={c.index ? 2 : 1} />
          ))}
          <circle cx="1010" cy="170" r="7" fill="#ff5b23" />
          <circle cx="1010" cy="170" r="22" fill="none" stroke="#ff5b23" strokeWidth="2" />
          <path d="M1010 130 V150 M1010 190 V210 M970 170 H990 M1030 170 H1050" stroke="#ff5b23" strokeWidth="2" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: "100%" }}>
          <div style={{ display: "flex", fontFamily: "Martian Mono", fontSize: 18, letterSpacing: 3, color: "#9eaba2" }}>
            28°36′50″N 77°12′32″E · DELHI
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontFamily: "Archivo Expanded", fontSize: 84, letterSpacing: 18, lineHeight: 1 }}>LAKSHYA JAIN</div>
            <div style={{ fontSize: 34, color: "#cfd8d1" }}>AI Engineer — agents, retrieval, edge ML, robotics &amp; XR</div>
          </div>
          <div style={{ display: "flex", fontFamily: "Martian Mono", fontSize: 16, letterSpacing: 2, color: "#6f7f75" }}>
            LAKSHYA (SANSKRIT) = TARGET · SURVEYED 2026
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo Expanded", data: expanded, weight: 700, style: "normal" },
        { name: "Archivo", data: regular, weight: 400, style: "normal" },
        { name: "Martian Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
