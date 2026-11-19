import { besselJ, besselJp, zeros, gaussLegendre } from '../special.js';

const zcache = new Map();
// Every root (radius 1) below xmax of J_m (fixed rim) or J_m' (free rim; m=0 includes the rigid 0 mode).
export function roots(bc, m, xmax) {
  const key = `${bc}|${m}`, have = zcache.get(key);
  if (have && have.xmax >= xmax) return have.z.filter(z => z < xmax);
  // All nonzero roots of J_m and J_m' lie above m; starting there skips round-off sign flips near 0.
  const start = Math.max(1e-9, m);
  const z = bc === 'free'
    ? zeros(x => besselJp(m, x), Infinity, { includeZero: m === 0, max: xmax, start })
    : zeros(x => besselJ(m, x), Infinity, { max: xmax, start });
  zcache.set(key, { xmax, z });
  return z;
}
export const nthRoot = (bc, m, n) => {
  let x = 20 + m;
  for (;;) { const z = roots(bc, m, x); if (z.length >= n) return z[n - 1]; x *= 1.6; }
};

// J_m(αr)·cos/sin(mθ); J values cached per radius since grids reuse a few dozen radii.
function mk(p, m, n, alpha, trig, bc) {
  const a = alpha / p.c, cache = new Map();
  const J = r => { let v = cache.get(r); if (v === undefined) cache.set(r, (v = besselJ(m, a * r))); return v; };
  const ang = trig === 's' ? Math.sin : Math.cos;
  return {
    label: `m=${m}, n=${n}${m ? (trig === 's' ? ' (sin)' : ' (cos)') : ''}`,
    omega: p.a * a,
    f: c => J(c[0]) * (m ? ang(m * c[1]) : 1),
  };
}

export const disk = {
  id: 'disk',
  label: 'Drum (circular membrane)',
  coords: ['r', 'θ'],
  bcs: [
    { id: 'fixed', label: 'Fixed rim u(c,θ,t)=0' },
    { id: 'free', label: 'Free rim ∂u/∂r=0' },
  ],
  defaults: { a: 1, c: 1 },
  size: p => p.c,
  maxN: 200, // ponytail: N=300 takes ~0.5 s to set up; Bessel tables would lift this cap
  quadGrid(p) {
    const R = gaussLegendre(64, 0, p.c), M = 64, pts = [], w = new Float64Array(64 * M);
    for (let i = 0; i < 64; i++) for (let j = 0; j < M; j++) {
      pts.push([R.x[i], (2 * Math.PI * j) / M]);
      w[i * M + j] = R.x[i] * R.w[i] * ((2 * Math.PI) / M);
    }
    return { pts, w };
  },
  // N lowest modes. Weyl's law gives about x²/4 modes below x, so scanning to 2√N + 12 is enough.
  modes(p, bc, N) {
    let xmax = 2 * Math.sqrt(N) + 12, all;
    for (;;) {
      all = [];
      for (let m = 0; m < xmax; m++) roots(bc, m, xmax).forEach((z, i) => {
        all.push([z, m, i + 1, 'c']);
        if (m) all.push([z, m, i + 1, 's']);
      });
      if (all.length >= N) break;
      xmax *= 1.5;
    }
    all.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
    return all.slice(0, N).map(([z, m, n, trig]) => mk(p, m, n, z, trig, bc));
  },
  mode(p, bc, [m, n]) {
    m = Math.max(0, m | 0); n = Math.max(1, n | 0);
    return mk(p, m, n, nthRoot(bc, m, n), 'c', bc);
  },
  explorer: [{ name: 'm', min: 0, def: 2 }, { name: 'n', min: 1, def: 1 }],
};
