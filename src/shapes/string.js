import { gaussLegendre } from '../special.js';

// 1D eigenfunctions on [0,L]; reused by the rectangle.
export function string1D(bc, L, n) {
  if (bc === 'free') { const k = (n * Math.PI) / L; return { k, f: x => Math.cos(k * x) }; }
  if (bc === 'fixfree') { const k = ((2 * n - 1) * Math.PI) / (2 * L); return { k, f: x => Math.sin(k * x) }; }
  const k = (n * Math.PI) / L;
  return { k, f: x => Math.sin(k * x) };
}
export const firstN = bc => (bc === 'free' ? 0 : 1);

const mk = (p, bc, n) => {
  const { k, f } = string1D(bc, p.L, n);
  return { label: `n=${n}`, omega: p.a * k, f: c => f(c[0]) };
};

export const string = {
  id: 'string',
  label: 'String',
  coords: ['x'],
  bcs: [
    { id: 'fixed', label: 'Fixed both ends' },
    { id: 'free', label: 'Free both ends' },
    { id: 'fixfree', label: 'Fixed left, free right' },
  ],
  defaults: { a: 1, L: 1 },
  size: p => p.L,
  maxN: 200,
  quadGrid(p) {
    const { x, w } = gaussLegendre(256, 0, p.L);
    return { pts: Array.from(x, v => [v]), w };
  },
  modes(p, bc, N) {
    const n0 = firstN(bc);
    return Array.from({ length: N }, (_, i) => mk(p, bc, n0 + i));
  },
  mode: (p, bc, [n]) => mk(p, bc, Math.max(firstN(bc), n | 0)),
  explorer: [{ name: 'n', min: 0, def: 1 }],
};
