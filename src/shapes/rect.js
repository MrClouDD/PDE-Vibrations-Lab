import { gaussLegendre } from '../special.js';
import { string1D, firstN } from './string.js';

// Boundary option → [x-pair, y-pair] 1D conditions.
const PAIRS = { fixed: ['fixed', 'fixed'], free: ['free', 'free'], mixed: ['fixed', 'free'] };

function mk(p, bc, m, n) {
  const [bx, by] = PAIRS[bc], X = string1D(bx, p.Lx, m), Y = string1D(by, p.Ly, n);
  return { label: `m=${m}, n=${n}`, omega: p.a * Math.hypot(X.k, Y.k), f: c => X.f(c[0]) * Y.f(c[1]) };
}

export const rect = {
  id: 'rect',
  label: 'Rectangular membrane',
  coords: ['x', 'y'],
  bcs: [
    { id: 'fixed', label: 'All edges fixed' },
    { id: 'free', label: 'All edges free' },
    { id: 'mixed', label: 'x-edges fixed, y-edges free' },
  ],
  defaults: { a: 1, Lx: 1.5, Ly: 1 },
  size: p => Math.max(p.Lx, p.Ly),
  maxN: 400,
  quadGrid(p) {
    const X = gaussLegendre(48, 0, p.Lx), Y = gaussLegendre(48, 0, p.Ly), pts = [], w = new Float64Array(48 * 48);
    for (let i = 0; i < 48; i++) for (let j = 0; j < 48; j++) { pts.push([X.x[i], Y.x[j]]); w[i * 48 + j] = X.w[i] * Y.w[j]; }
    return { pts, w };
  },
  modes(p, bc, N) {
    const [bx, by] = PAIRS[bc], M = Math.ceil(2.5 * Math.sqrt(N)) + 6, all = [];
    for (let m = firstN(bx); m <= M; m++) for (let n = firstN(by); n <= M; n++) all.push(mk(p, bc, m, n));
    all.sort((u, v) => u.omega - v.omega);
    return all.slice(0, N);
  },
  mode(p, bc, [m, n]) {
    const [bx, by] = PAIRS[bc];
    return mk(p, bc, Math.max(firstN(bx), m | 0), Math.max(firstN(by), n | 0));
  },
  explorer: [{ name: 'm', min: 0, def: 2 }, { name: 'n', min: 0, def: 1 }],
};
