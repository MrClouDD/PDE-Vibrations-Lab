import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mathjs from 'mathjs';
globalThis.math = mathjs.create(mathjs.all);
const { compileIC } = await import('../src/ic.js');
const { SHAPES } = await import('../src/shapes/index.js');
const { project } = await import('../src/solve.js');

test('compiles a preset formula', () => {
  assert.equal(compileIC('1 - r/c', ['r', 'θ'], { c: 2 }).fn([1, 0]), 0.5);
});

test('θ, theta and th are the same variable', () => {
  for (const e of ['cos(θ)', 'cos(theta)', 'cos(th)']) assert.equal(compileIC(e, ['r', 'θ'], {}).fn([0, 0]), 1);
});

test('syntax error and unknown symbol give an error, not a throw', () => {
  assert.ok(compileIC('sin(', ['x'], {}).error);
  assert.ok(compileIC('q + 1', ['x'], { L: 1 }, [0.5]).error);
  assert.ok(compileIC('', ['x'], {}).error);
});

test('ternary and besselj0 work', () => {
  assert.equal(compileIC('x < 0.5 ? 1 : 2', ['x'], {}).fn([0.7]), 2);
  assert.ok(Math.abs(compileIC('besselj0(2.404825557695773)', ['r'], {}).fn([0])) < 1e-9);
});

test('1/r on the sphere: finite coefficients and one warning', () => {
  const S = SHAPES.sphere, p = { a: 1, c: 1 };
  const { fn } = compileIC('1/(r - r)', ['r', 'θ'], p);
  const { A, warnings } = project(S.modes(p, 'fixed', 10), S.quadGrid(p), fn, () => 0);
  assert.ok(Array.from(A).every(Number.isFinite));
  assert.equal(warnings.length, 1);
});
