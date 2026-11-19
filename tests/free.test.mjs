import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
function solve(S, p, bc, f, g, N, pts) {
  const modes = S.modes(p, bc, N);
  const r = project(modes, S.quadGrid(p), f, g);
  const basis = basisOn(modes, pts), out = new Float32Array(pts.length);
  return { modes, ...r, at: t => (evaluate(basis, modes, r.A, r.B, t, out), Array.from(out)) };
}

test('Review #12 sphere, free surface: uniform velocity drifts rigidly (u = t)', () => {
  const s = solve(SHAPES.sphere, { a: 1, c: 1 }, 'free', () => 0, () => 1, 20, [[0.3, 1, 0], [0.9, 2, 0]]);
  for (const t of [0.4, 1.3]) s.at(t).forEach(v => near(v, t, 1e-5));
  assert.equal(findPeriod(s.modes, s.A, s.B), null);
});

test('sphere free: pluck has zero radial slope at the surface', () => {
  const h = 1e-3;
  const s = solve(SHAPES.sphere, { a: 1, c: 1 }, 'free', c => Math.exp(-20 * c[0] ** 2), () => 0, 40, [[1, 1, 0], [1 - h, 1, 0]]);
  for (const t of [0, 0.6]) { const [a, b] = s.at(t); near((a - b) / h, 0, 2e-2); }
});

test('drum free rim: zero slope at the rim, rigid mode present', () => {
  const S = SHAPES.disk, h = 1e-3;
  const s = solve(S, { a: 1, c: 1 }, 'free', c => Math.exp(-15 * c[0] ** 2), () => 0, 60, [[1, 0.3], [1 - h, 0.3]]);
  assert.ok(s.modes.some(m => m.omega === 0));
  for (const t of [0, 0.5]) { const [a, b] = s.at(t); near((a - b) / h, 0, 2e-2); }
});
