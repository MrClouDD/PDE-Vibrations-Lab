import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';
import { besselJ } from '../src/special.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const S = SHAPES.disk, p = { a: 1, c: 1 }, X1 = 2.404825557695773;

function solve(f, g, N, pts, bc = 'fixed') {
  const modes = S.modes(p, bc, N);
  const r = project(modes, S.quadGrid(p), f, g);
  const basis = basisOn(modes, pts), out = new Float32Array(pts.length);
  return { modes, ...r, at: t => (evaluate(basis, modes, r.A, r.B, t, out), Array.from(out)) };
}

test('Review #8: f = J0(x1 r) is a single mode u0 J0(x1 r) cos(a x1 t)', () => {
  const s = solve(c => besselJ(0, X1 * c[0]), () => 0, 40, [[0.3, 0.2]]);
  near(s.A[0], 1, 1e-6);
  for (let k = 1; k < 40; k++) assert.ok(Math.abs(s.A[k]) < 1e-6, s.modes[k].label);
  near(s.at(0.5)[0], besselJ(0, X1 * 0.3) * Math.cos(X1 * 0.5), 1e-5);
  near(findPeriod(s.modes, s.A, s.B), (2 * Math.PI) / X1, 1e-9);
});

test('rim stays fixed', () => {
  const s = solve(c => Math.max(0, 1 - Math.hypot(c[0] * Math.cos(c[1]) - 0.4, c[0] * Math.sin(c[1])) / 0.6), () => 0, 100, [[1, 0], [1, 2]]);
  for (const t of [0, 0.4, 1.3]) s.at(t).forEach(v => near(v, 0, 1e-6));
});

test('off-center pluck excites m >= 1 and never exactly repeats', () => {
  const s = solve(c => Math.max(0, 1 - Math.hypot(c[0] * Math.cos(c[1]) - 0.4, c[0] * Math.sin(c[1])) / 0.6), () => 0, 100, [[0.5, 0]]);
  assert.ok(s.modes.some((m, k) => !m.label.startsWith('m=0') && Math.abs(s.A[k]) > 1e-3));
  assert.equal(findPeriod(s.modes, s.A, s.B), null);
});
