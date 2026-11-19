import { besselJ, gaussLegendre } from '../special.js';
import { roots, nthRoot } from './disk.js';

// Boundary option → [side, ends]. Side uses J_m roots (fixed) or J_m' roots (free); ends use sin (fixed) or cos (free).
const PAIRS = { fixed: ['fixed', 'fixed'], sidefree: ['free', 'fixed'], endsfree: ['fixed', 'free'], free: ['free', 'free'] };

function mk(p, bc, m, n, k, alpha) {
  const [, ends] = PAIRS[bc], a = alpha / p.c, kz = (k * Math.PI) / p.L;
  const Z = ends === 'free' ? Math.cos : Math.sin, cache = new Map();
  const J = r => { let v = cache.get(r); if (v === undefined) cache.set(r, (v = besselJ(m, a * r))); return v; };
  return {
    label: m ? `m=${m}, n=${n}, k=${k}` : `n=${n}, k=${k}`,
    omega: p.a * Math.hypot(a, kz),
    f: c => J(c[0]) * (m ? Math.cos(m * c[1]) : 1) * Z(kz * c[2]),
  };
}

export const cylinder = {
  id: 'cylinder',
  label: 'Solid cylinder',
  coords: ['r', 'θ', 'z'],
  icVars: 'r, z',
  bcs: [
    { id: 'fixed', label: 'Side and ends fixed' },
    { id: 'sidefree', label: 'Side free, ends fixed' },
    { id: 'endsfree', label: 'Side fixed, ends free' },
    { id: 'free', label: 'Side and ends free' },
  ],
  defaults: { a: 1, c: 1, L: 2 },
  size: p => Math.max(p.c, p.L),
  maxN: 300,
  quadGrid(p) {
    const R = gaussLegendre(48, 0, p.c), Zg = gaussLegendre(48, 0, p.L), pts = [], w = new Float64Array(48 * 48);
    for (let i = 0; i < 48; i++) for (let j = 0; j < 48; j++) {
      pts.push([R.x[i], 0, Zg.x[j]]);
      w[i * 48 + j] = R.x[i] * R.w[i] * Zg.w[j];
    }
    return { pts, w };
  },
  // N lowest axisymmetric modes J0(αr)·Z_k(z).
  // Roots are scanned only up to xmax; the result is complete once the N-th frequency is below xmax/c,
  // since any root beyond xmax gives a higher frequency.
  modes(p, bc, N) {
    const [side, ends] = PAIRS[bc];
    for (let xmax = 2 * Math.sqrt(N) + 12; ; xmax *= 1.5) {
      const al = roots(side, 0, xmax), all = [];
      for (let n = 0; n < al.length; n++) for (let k = ends === 'free' ? 0 : 1; k <= N; k++) {
        all.push([Math.hypot(al[n] / p.c, (k * Math.PI) / p.L), n + 1, k, al[n]]);
      }
      all.sort((u, v) => u[0] - v[0]);
      if (all.length >= N && all[N - 1][0] <= xmax / p.c) return all.slice(0, N).map(([, n, k, alpha]) => mk(p, bc, 0, n, k, alpha));
    }
  },
  mode(p, bc, [m, n, k]) {
    const [side, ends] = PAIRS[bc];
    m = Math.max(0, m | 0); n = Math.max(1, n | 0); k = Math.max(ends === 'free' ? 0 : 1, k | 0);
    return mk(p, bc, m, n, k, nthRoot(side, m, n));
  },
  explorer: [{ name: 'm', min: 0, def: 1 }, { name: 'n', min: 1, def: 1 }, { name: 'k', min: 0, def: 2 }],
};
