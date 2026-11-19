import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const S = SHAPES.sphere, p = { a: 1, c: 1 };

function solve(f, g, N, pts, bc = 'fixed') {
  const modes = S.modes(p, bc, N);
  const r = project(modes, S.quadGrid(p), f, g);
  const basis = basisOn(modes, pts), out = new Float32Array(pts.length);
  return { modes, ...r, at: t => (evaluate(basis, modes, r.A, r.B, t, out), Array.from(out)) };
}

test('#11 matches d\'Alembert via v = r u', () => {
  const s = solve(c => 1 - c[0], () => 0, 40, [[0.5, 1, 0]]);
  near(s.at(0.3)[0], 0.32, 0.01);
});

test('#11 has no l>0 content and repeats every 2c/a', () => {
  const s = solve(c => 1 - c[0], () => 0, 40, [[0.5, 1, 0]]);
  s.modes.forEach((m, k) => { if (!m.label.startsWith('l=0')) assert.ok(Math.abs(s.A[k]) < 1e-8, m.label); });
  near(findPeriod(s.modes, s.A, s.B), 2, 1e-6);
});

test('fixed surface stays at zero, even when f violates it', () => {
  for (const f of [c => 1 - c[0], () => 1]) {
    const s = solve(f, () => 0, 40, [[1, 0.4, 0], [1, 2.2, 1]]);
    for (const t of [0, 0.37, 1.1]) s.at(t).forEach(v => near(v, 0, 1e-6));
  }
  const s = solve(() => 1, () => 0, 40, [[0.5, 1, 0]]);
  near(s.at(0)[0], 1, 0.15);
});

test('non-radial f picks up l>0 modes', () => {
  const s = solve(c => (1 - c[0]) * Math.cos(c[1]), () => 0, 60, [[0.5, 1, 0]]);
  assert.ok(s.modes.some((m, k) => m.label.startsWith('l=1') && Math.abs(s.A[k]) > 1e-3));
});
