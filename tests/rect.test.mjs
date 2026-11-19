import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const S = SHAPES.rect, p = { a: 1, Lx: 1.5, Ly: 1 };
const pluck = c => Math.max(0, 1 - Math.hypot(c[0] - 0.5, c[1] - 0.4) / 0.35);

function solve(f, N, pts, bc = 'fixed') {
  const modes = S.modes(p, bc, N);
  const r = project(modes, S.quadGrid(p), f, () => 0);
  const basis = basisOn(modes, pts), out = new Float32Array(pts.length);
  return { modes, ...r, at: t => (evaluate(basis, modes, r.A, r.B, t, out), Array.from(out)) };
}

test('single (1,2) mode', () => {
  const s = solve(c => Math.sin(Math.PI * c[0] / p.Lx) * Math.sin(2 * Math.PI * c[1] / p.Ly), 40, [[0.3, 0.3]]);
  const k = s.modes.findIndex(m => m.label === 'm=1, n=2');
  near(s.A[k], 1);
  s.A.forEach((a, i) => i !== k && assert.ok(Math.abs(a) < 1e-8));
  const w = Math.PI * Math.hypot(1 / p.Lx, 2 / p.Ly);
  near(findPeriod(s.modes, s.A, s.B), 2 * Math.PI / w, 1e-9);
});

test('pluck never exactly repeats; edges stay fixed', () => {
  const edges = [[0, 0.5], [p.Lx, 0.5], [0.7, 0], [0.7, p.Ly]];
  const s = solve(pluck, 100, edges);
  assert.equal(findPeriod(s.modes, s.A, s.B), null);
  for (const t of [0, 0.5, 1.7]) s.at(t).forEach(v => near(v, 0, 1e-6));
});

test('mixed: x edges fixed, y edges free', () => {
  const s = solve(pluck, 100, [[0, 0.5]], 'mixed');
  near(s.at(0.3)[0], 0, 1e-6);
  assert.ok(s.modes.some(m => m.label.endsWith('n=0')));
});
