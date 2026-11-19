// Regression tests for the final review's findings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn, evaluate, findPeriod } from '../src/solve.js';
import { isRadial } from '../src/shapes/sphere.js';

test('free string pluck repeats every 2L/a (constant zero mode does not block the period)', () => {
  const S = SHAPES.string, p = { a: 1, L: 1 }, modes = S.modes(p, 'free', 30);
  const { A, B } = project(modes, S.quadGrid(p), c => (c[0] < 0.3 ? c[0] / 0.3 : (1 - c[0]) / 0.7), () => 0);
  assert.ok(Math.abs(findPeriod(modes, A, B) - 2) < 1e-9);
});

test('sphere explorer l = m = 40 stays finite and moderate', () => {
  const m = SHAPES.sphere.mode({ a: 1, c: 1 }, 'fixed', [40, 40, 1]);
  const vals = SHAPES.sphere.quadGrid({ a: 1, c: 1 }).pts.map(c => m.f(c));
  assert.ok(vals.every(Number.isFinite));
  assert.ok(Math.max(...vals.map(Math.abs)) < 1e3);
});

test('radial initial conditions use only l = 0 modes, so N counts #11 series terms', () => {
  const f = c => 1 - c[0], g = () => 0;
  assert.equal(isRadial(f, g, 1), true);
  assert.equal(isRadial(c => (1 - c[0]) * Math.cos(c[1]), g, 1), false);
  const modes = SHAPES.sphere.modes({ a: 1, c: 1 }, 'fixed', 30, { radial: true });
  assert.equal(modes.length, 30);
  assert.ok(modes.every(m => m.label.startsWith('l=0')));
});

test('a formula that throws at some points is treated like undefined, with a warning', () => {
  const S = SHAPES.string, p = { a: 1, L: 1 }, modes = S.modes(p, 'fixed', 5);
  const { A, warnings } = project(modes, S.quadGrid(p), c => { if (c[0] > 0.5) throw new Error('x'); return 1; }, () => 0);
  assert.ok(Array.from(A).every(Number.isFinite));
  assert.equal(warnings.length, 1);
});
