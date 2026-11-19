import { test } from 'node:test';
import assert from 'node:assert/strict';
import { besselJ, besselJp, sphJ, sphJp, legendreP, zeros, gaussLegendre } from '../src/special.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('besselJ values', () => {
  near(besselJ(0, 1), 0.7651976865579666);
  near(besselJ(5, 10), -0.2340615281867936);
  near(besselJ(0, 40), 0.007366890001639, 1e-8); // asymptotic expansion
  assert.equal(besselJ(3, 0), 0);
});

test('Bessel zeros', () => {
  const z = zeros(x => besselJ(0, x), 2);
  near(z[0], 2.404825557695773); near(z[1], 5.520078110286311);
  near(zeros(x => besselJ(1, x), 1)[0], 3.831705970207512);
  near(zeros(x => besselJp(0, x), 1)[0], 3.831705970207512);
});

test('spherical Bessel', () => {
  near(sphJ(0, 0.7), Math.sin(0.7) / 0.7);
  assert.equal(sphJ(0, 0), 1);
  near(sphJ(1, 1), 0.30116867893975674);
  near(sphJ(5, 0.3), 0.3 ** 5 / 10395 * (1 - 0.09 / 26), 1e-11); // small-x series
  const z = zeros(x => sphJ(0, x), 3);
  z.forEach((v, i) => near(v, (i + 1) * Math.PI));
  near(zeros(x => sphJp(0, x), 1)[0], 4.493409457909064);
  near(zeros(x => sphJp(0, x), 1, { includeZero: true })[0], 0);
});

test('legendreP', () => {
  near(legendreP(2, 0, 0.5), -0.125);
  near(legendreP(1, 1, 0.6), 0.8);
});

test('gaussLegendre', () => {
  const { x, w } = gaussLegendre(8, 0, 1);
  let s = 0, s7 = 0;
  for (let i = 0; i < 8; i++) { s += w[i]; s7 += w[i] * x[i] ** 7; }
  near(s, 1, 1e-12); near(s7, 1 / 8, 1e-12);
});
