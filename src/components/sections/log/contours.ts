// Marching squares over a scalar field, with segments joined into polylines and a light
// Chaikin smoothing pass. Small and dependency-free; coordinates come back in grid units.

export type Pt = [number, number];
export type Isoline = { pts: Pt[]; closed: boolean };

/**
 * Isolines of `field` (row-major, nx × ny samples) at `level`.
 * Saddles are resolved with the cell-centre average.
 */
export function isolines(field: ArrayLike<number>, nx: number, ny: number, level: number): Isoline[] {
  const pts = new Map<number, Pt>();
  const segA: number[] = [];
  const segB: number[] = [];
  const f = (i: number, j: number) => field[j * nx + i];
  const t = (a: number, b: number) => (level - a) / (b - a);
  // edge ids: horizontal edge (i,j)→(i+1,j) is even, vertical edge (i,j)→(i,j+1) is odd
  const hId = (i: number, j: number) => (j * nx + i) * 2;
  const vId = (i: number, j: number) => (j * nx + i) * 2 + 1;

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = f(i, j);
      const tr = f(i + 1, j);
      const br = f(i + 1, j + 1);
      const bl = f(i, j + 1);
      const c = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      if (c === 0 || c === 15) continue;

      const T = () => {
        const id = hId(i, j);
        if (!pts.has(id)) pts.set(id, [i + t(tl, tr), j]);
        return id;
      };
      const R = () => {
        const id = vId(i + 1, j);
        if (!pts.has(id)) pts.set(id, [i + 1, j + t(tr, br)]);
        return id;
      };
      const B = () => {
        const id = hId(i, j + 1);
        if (!pts.has(id)) pts.set(id, [i + t(bl, br), j + 1]);
        return id;
      };
      const L = () => {
        const id = vId(i, j);
        if (!pts.has(id)) pts.set(id, [i, j + t(tl, bl)]);
        return id;
      };
      const seg = (a: number, b: number) => {
        segA.push(a);
        segB.push(b);
      };

      switch (c) {
        case 1:
        case 14:
          seg(L(), B());
          break;
        case 2:
        case 13:
          seg(B(), R());
          break;
        case 3:
        case 12:
          seg(L(), R());
          break;
        case 4:
        case 11:
          seg(T(), R());
          break;
        case 6:
        case 9:
          seg(T(), B());
          break;
        case 7:
        case 8:
          seg(L(), T());
          break;
        case 5: {
          // tr and bl above
          if ((tl + tr + br + bl) / 4 >= level) {
            seg(L(), T());
            seg(B(), R());
          } else {
            seg(T(), R());
            seg(L(), B());
          }
          break;
        }
        case 10: {
          // tl and br above
          if ((tl + tr + br + bl) / 4 >= level) {
            seg(T(), R());
            seg(L(), B());
          } else {
            seg(L(), T());
            seg(B(), R());
          }
          break;
        }
      }
    }
  }

  // join segments that share an edge crossing into polylines
  const adj = new Map<number, number[]>();
  const link = (edge: number, s: number) => {
    const list = adj.get(edge);
    if (list) list.push(s);
    else adj.set(edge, [s]);
  };
  for (let s = 0; s < segA.length; s++) {
    link(segA[s], s);
    link(segB[s], s);
  }
  const used = new Uint8Array(segA.length);
  const walk = (from: number) => {
    const next = adj.get(from)?.find((k) => !used[k]);
    if (next === undefined) return null;
    used[next] = 1;
    return segA[next] === from ? segB[next] : segA[next];
  };

  const lines: Isoline[] = [];
  for (let s = 0; s < segA.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const chain = [segA[s], segB[s]];
    for (;;) {
      const n = walk(chain[chain.length - 1]);
      if (n === null) break;
      chain.push(n);
      if (n === chain[0]) break;
    }
    const closed = chain.length > 2 && chain[chain.length - 1] === chain[0];
    if (!closed) {
      for (;;) {
        const n = walk(chain[0]);
        if (n === null) break;
        chain.unshift(n);
      }
    }
    const ids = closed ? chain.slice(0, -1) : chain;
    lines.push({ pts: ids.map((id) => pts.get(id)!), closed });
  }
  return lines;
}

/** Corner-cutting smoothing; keeps open ends fixed. */
export function chaikin(pts: Pt[], closed: boolean, iterations = 2): Pt[] {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const n = p.length;
    if (n < 3) return p;
    const out: Pt[] = [];
    if (!closed) out.push(p[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

export function toPath(pts: Pt[], closed: boolean, map: (p: Pt) => Pt) {
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = map(pts[i]);
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return closed ? `${d}Z` : d;
}
