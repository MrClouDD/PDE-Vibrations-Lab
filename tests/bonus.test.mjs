import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { project, basisOn } from '../src/solve.js';
import { evaluateHeat, heatSettle, laplaceTerms } from '../src/bonus.js';
import { evaluate } from '../src/solve.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('heat, Zill 13.3 #9: sphere surface held at 100, starts at 0', () => {
  const S = SHAPES.sphere, p = { a: 1, c: 1 }, us = 100;
  const modes = S.modes(p, 'fixed', 40);
  const { A } = project(modes, S.quadGrid(p), () => 0 - us, () => 0);
  const basis = basisOn(modes, [[0.5, 1, 0]]), out = new Float32Array(1);
  evaluateHeat(basis, modes, A, 1, 1, 2, out, us); near(out[0], 100, 0.5);
  evaluateHeat(basis, modes, A, 1, 1, 0.05, out, us); assert.ok(out[0] < 100);
  near(heatSettle(modes, A, 1, 1), Math.log(100) / Math.PI ** 2, 1e-6);
});

test('Laplace, Zill 13.3 #3: h = cos θ on the sphere gives u = (r/c) cos θ', () => {
  const { modes, A } = laplaceTerms('sphere', { c: 1 }, c => Math.cos(c[1]), 10);
  const basis = basisOn(modes, [[0.5, 1.0, 0]]), out = new Float32Array(1);
  evaluate(basis, modes, A, new Float64Array(A.length), 0, out);
  near(out[0], 0.5 * Math.cos(1.0), 1e-6);
});

test('Laplace on the disk and rectangle reproduce their boundary data', () => {
  const d = laplaceTerms('disk', { c: 2 }, c => Math.sin(2 * c[1]), 12);
  const bd = basisOn(d.modes, [[1, 0.4]]), o = new Float32Array(1);
  evaluate(bd, d.modes, d.A, new Float64Array(d.A.length), 0, o);
  near(o[0], (1 / 2) ** 2 * Math.sin(0.8), 1e-6);
  const r = laplaceTerms('rect', { Lx: 1.5, Ly: 1 }, c => Math.sin(Math.PI * c[0] / 1.5), 12);
  const br = basisOn(r.modes, [[0.6, 0.5]]);
  evaluate(br, r.modes, r.A, new Float64Array(r.A.length), 0, o);
  near(o[0], Math.sin(Math.PI * 0.6 / 1.5) * Math.sinh(Math.PI * 0.5 / 1.5) / Math.sinh(Math.PI / 1.5), 1e-6);
});
