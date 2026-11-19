import { sphJ, sphJp, legendreP, zeros, gaussLegendre } from '../special.js';

const LMAX = 12;
const zcache = new Map();
// First `count` roots (radius 1) of j_l (fixed surface) or j_l' (free surface; l=0 includes the rigid 0 mode).
function roots(bc, l, count) {
  const key = `${bc}|${l}`;
  const have = zcache.get(key);
  if (have && have.length >= count) return have;
  // Nonzero roots of j_l and j_l' lie above l; starting there skips underflow to exactly 0 near x = 0.
  const start = Math.max(1e-9, l);
  const z = bc === 'free'
    ? zeros(x => sphJp(l, x), count, { includeZero: l === 0, start })
    : zeros(x => sphJ(l, x), count, { start });
  zcache.set(key, z);
  return z;
}

function mk(p, bc, l, m, n) {
  const beta = roots(bc, l, n)[n - 1] / p.c;
  // Divide P_l^m by (2m−1)!! so high-m explorer modes stay well inside Float32 range (any scale is an eigenfunction).
  let scale = 1;
  for (let i = 1; i <= m; i++) scale /= 2 * i - 1;
  const lbl = m ? `l=${l}, m=${m}, n=${n}` : `l=${l}, n=${n}`;
  return {
    label: lbl,
    omega: p.a * beta,
    f: c => scale * sphJ(l, beta * c[0]) * legendreP(l, m, Math.cos(c[1])) * (m ? Math.cos(m * c[2]) : 1),
  };
}

export const sphere = {
  id: 'sphere',
  label: 'Solid sphere',
  coords: ['r', 'θ'],
  bcs: [
    { id: 'fixed', label: 'Fixed surface u(c,t)=0' },
    { id: 'free', label: 'Free surface ∂u/∂r=0' },
  ],
  defaults: { a: 1, c: 1 },
  size: p => p.c,
  maxN: 300,
  // Radial-only series put all N terms in l = 0, so term n oscillates ~n/2 times along r: the radial
  // node count has to grow with N or the coefficients alias (noise from N ≈ 60 up). θ is trivial then.
  quadGrid(p, { N = 0, radial = false } = {}) {
    const nr = radial ? Math.max(64, Math.ceil(1.7 * N) + 32) : 64, nt = radial ? 4 : 32;
    const R = gaussLegendre(nr, 0, p.c), X = gaussLegendre(nt, -1, 1);
    const pts = [], w = new Float64Array(nr * nt);
    for (let i = 0; i < nr; i++) for (let j = 0; j < nt; j++) {
      pts.push([R.x[i], Math.acos(X.x[j]), 0]);
      w[i * nt + j] = R.x[i] ** 2 * R.w[i] * X.w[j];
    }
    return { pts, w };
  },
  // N lowest-frequency axisymmetric modes j_l(βr)P_l(cosθ), l = 0..LMAX.
  // With { radial: true } (f and g independent of θ, as in #11) only l = 0 modes are used, so N counts series terms.
  modes(p, bc, N, { radial = false } = {}) {
    const all = [];
    for (let l = 0; l <= (radial ? 0 : LMAX); l++) roots(bc, l, N).slice(0, N).forEach((z, i) => all.push([z, l, i + 1]));
    all.sort((u, v) => u[0] - v[0]);
    return all.slice(0, N).map(([, l, n]) => mk(p, bc, l, 0, n));
  },
  mode: (p, bc, [l, m, n]) => {
    l = Math.max(0, l | 0); m = Math.min(l, Math.max(0, m | 0)); n = Math.max(1, n | 0);
    return mk(p, bc, l, m, n);
  },
  explorer: [{ name: 'l', min: 0, def: 2 }, { name: 'm', min: 0, def: 1 }, { name: 'n', min: 1, def: 1 }],
};

// True when f and g don't vary with θ at a spread of sample radii.
export function isRadial(f, g, c) {
  for (const fn of [f, g]) for (const r of [0.13, 0.37, 0.61, 0.89].map(x => x * c)) {
    let y0;
    try { y0 = fn([r, 0.3, 0]); } catch { return false; }
    for (const th of [1.1, 1.9, 2.8]) {
      let y;
      try { y = fn([r, th, 0]); } catch { return false; }
      if (!(Math.abs(y - y0) <= 1e-12 * (1 + Math.abs(y0)))) return false;
    }
  }
  return true;
}
