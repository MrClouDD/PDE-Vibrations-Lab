import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod, clampN } from '../src/solve.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const S = SHAPES.string, p = { a: 1, L: 1 };

function solveAt(bc, f, g, N, pts) {
  const modes = S.modes(p, bc, N);
  const { A, B, warnings } = project(modes, S.quadGrid(p), f, g);
  const basis = basisOn(modes, pts);
  const out = new Float32Array(pts.length);
  return { modes, A, B, warnings, at: t => (evaluate(basis, modes, A, B, t, out), Array.from(out)) };
}

test('fixed string, single mode sin(πx)', () => {
  const s = solveAt('fixed', c => Math.sin(Math.PI * c[0]), () => 0, 20, [[0.5]]);
  near(s.A[0], 1);
  for (let i = 1; i < 20; i++) assert.ok(Math.abs(s.A[i]) < 1e-8);
  near(s.at(0.5)[0], 0);
  near(s.at(1)[0], -1);
});

test('pluck reproduced at t=0', () => {
  const s = solveAt('fixed', c => (c[0] < 0.5 ? 2 * c[0] : 2 - 2 * c[0]), () => 0, 200, [[0.3]]);
  near(s.at(0)[0], 0.6, 0.02);
});

test('findPeriod', () => {
  const pl = solveAt('fixed', c => (c[0] < 0.5 ? 2 * c[0] : 2 - 2 * c[0]), () => 0, 30, [[0.3]]);
  near(findPeriod(pl.modes, pl.A, pl.B), 2);
  const ff = solveAt('fixfree', c => c[0], () => 0, 30, [[0.3]]);
  near(findPeriod(ff.modes, ff.A, ff.B), 4);
  const fake = [{ omega: 1 }, { omega: Math.SQRT2 }];
  assert.equal(findPeriod(fake, [1, 1], [0, 0]), null);
});

test('free string drifts with average velocity', () => {
  const s = solveAt('free', () => 0, () => 1, 20, [[0.2]]);
  const z = s.modes.findIndex(m => m.omega === 0);
  near(s.B[z], 1);
  near(s.at(0.7)[0] - s.at(0)[0], 0.7, 1e-5);
  assert.equal(findPeriod(s.modes, s.A, s.B), null);
});

test('non-finite samples treated as 0 with one warning', () => {
  const s = solveAt('fixed', c => 1 / (c[0] - c[0]), () => 0, 5, [[0.5]]);
  assert.ok(Array.from(s.A).every(Number.isFinite));
  assert.equal(s.warnings.length, 1);
});

test('clampN', () => {
  assert.deepEqual(clampN(S, 10000), { N: 200, capped: true });
  assert.deepEqual(clampN(S, 10), { N: 10, capped: false });
});

test('clampN caps the sphere at 300', async () => {
  const { SHAPES: all } = await import('../src/shapes/index.js');
  assert.deepEqual(clampN(all.sphere, 10000), { N: 300, capped: true });
});

test('every shape has an explorer mode with omega > 0 at its defaults', async () => {
  const { SHAPES: all } = await import('../src/shapes/index.js');
  for (const S of Object.values(all)) {
    const idx = S.explorer.map(e => e.def);
    const m = S.mode(S.defaults, S.bcs[0].id, idx);
    assert.ok(m.omega > 0 && Number.isFinite(m.f(S.quadGrid(S.defaults).pts[7])), S.id);
  }
});
