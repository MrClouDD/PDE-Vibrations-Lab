import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';
import { besselJ } from '../src/special.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const S = SHAPES.cylinder, p = { a: 1, c: 1, L: 2 }, X1 = 2.404825557695773;
function solve(f, N, pts, bc = 'fixed') {
  const modes = S.modes(p, bc, N);
  const r = project(modes, S.quadGrid(p), f, () => 0);
  const basis = basisOn(modes, pts), out = new Float32Array(pts.length);
  return { modes, ...r, at: t => (evaluate(basis, modes, r.A, r.B, t, out), Array.from(out)) };
}

test('single mode J0(x1 r) sin(πz/L) has one active coefficient', () => {
  const s = solve(c => besselJ(0, X1 * c[0]) * Math.sin(Math.PI * c[2] / p.L), 40, [[0.2, 0, 0.7]]);
  const active = Array.from(s.A).filter(a => Math.abs(a) > 1e-6);
  assert.equal(active.length, 1); near(active[0], 1);
  near(findPeriod(s.modes, s.A, s.B), 2 * Math.PI / Math.hypot(X1, Math.PI / p.L), 1e-9);
});

test('fixed side and ends stay at zero', () => {
  const pulse = c => Math.exp(-25 * (c[0] ** 2 + (c[2] / p.L - 0.5) ** 2));
  const s = solve(pulse, 120, [[1, 0, 0.8], [0.4, 0, 0], [0.4, 0, p.L]]);
  for (const t of [0, 0.7]) s.at(t).forEach(v => near(v, 0, 1e-6));
});

test('free ends: zero slope in z at the ends', () => {
  const h = 1e-3, pulse = c => Math.exp(-25 * (c[0] ** 2 + (c[2] / p.L - 0.3) ** 2));
  const s = solve(pulse, 120, [[0.3, 0, 0], [0.3, 0, h]], 'endsfree');
  for (const t of [0, 0.5]) { const [a, b] = s.at(t); near((b - a) / h, 0, 2e-2); }
});
