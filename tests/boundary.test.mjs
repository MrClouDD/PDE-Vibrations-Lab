// Boundary values, slopes and forcing (design addendum). Cases have exact answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/shapes/index.js';
import { solveFull, evaluateFull } from '../src/drive.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
function run(shape, p, bc, f, g, spec, N, pts) {
  const S = SHAPES[shape], sol = solveFull(S, p, bc, f, g, spec, N, pts);
  const out = new Float32Array(pts.length);
  return { sol, at: t => (evaluateFull(sol, t, out), Array.from(out)) };
}
const avg = (at, T, k = 400) => { let s = 0; for (let i = 0; i < k; i++) s += at((T * (i + 0.5)) / k)[0]; return s / k; };

test('string: ends held at u(0)=1, u(1)=0 and f = 1 - x stays put (Ch. 12 Review #6 boundary)', () => {
  const r = run('string', { a: 1, L: 1 }, 'fixed', c => 1 - c[0], () => 0,
    { values: { left: () => 1, right: () => 0 } }, 60, [[0.3]]);
  for (const t of [0, 0.4, 1.7]) near(r.at(t)[0], 0.7, 1e-4);
  near(r.sol.period ?? 0, 0); // static: nothing moves, no period needed
});

test('string: gravity (12.6 #10) oscillates about w = g x(x-1)/(2a^2)', () => {
  const r = run('string', { a: 1, L: 1 }, 'fixed', () => 0, () => 0, { F: () => -1 }, 80, [[0.5]]);
  near(r.sol.period, 2, 1e-9);
  near(avg(r.at, 2), -1 / 8, 2e-3);
  near(r.at(0)[0], 0, 1e-4);
});

test('string: end driven u(1,t) = sin t (12.6 #15) matches the incoming wave sin(t - (1 - x))', () => {
  const r = run('string', { a: 1, L: 1 }, 'fixed', () => 0, () => 0,
    { values: { left: () => 0, right: c => Math.sin(c[0]) }, timed: true }, 80, [[0.5], [0.1], [1], [0]]);
  const [mid, early, end, start] = r.at(0.8);
  near(mid, Math.sin(0.3), 0.02);
  near(early, 0, 0.02);
  near(end, Math.sin(0.8), 1e-3);
  near(start, 0, 1e-6);
  assert.equal(r.sol.period, null);
});

test('string: bar pulled at its free end (12.7 #6) averages to the static stretch S x', () => {
  const r = run('string', { a: 1, L: 1 }, 'fixfree', () => 0, () => 0,
    { values: { left: () => 0, right: () => 0.5 } }, 80, [[0.6]]);
  near(r.sol.period, 4, 1e-9);
  near(avg(r.at, 4), 0.3, 3e-3);
});

test('string: free-free with unequal end slopes accelerates (t^2 growth)', () => {
  const r = run('string', { a: 1, L: 1 }, 'free', () => 0, () => 0,
    { values: { left: () => 0, right: () => 1 } }, 60, [[0.5]]);
  assert.equal(r.sol.period, null);
  // mean of u over the bar grows like a^2 (S_L - S_0) t^2 / (2L)
  const m = t => { let s = 0; const k = 200; const pts = []; for (let i = 0; i < k; i++) pts.push([(i + 0.5) / k]);
    const q = run('string', { a: 1, L: 1 }, 'free', () => 0, () => 0, { values: { left: () => 0, right: () => 1 } }, 60, pts);
    return q.at(t).reduce((a, b) => a + b, 0) / k; };
  near(m(2) - m(0), 0.5 * 4, 2e-2);
});

test('sphere: surface held at h = cos θ with f = (r/c) cos θ is a steady state', () => {
  const r = run('sphere', { a: 1, c: 1 }, 'fixed', c => c[0] * Math.cos(c[1]), () => 0,
    { values: { surface: c => Math.cos(c[1]) } }, 40, [[0.5, 1.0, 0]]);
  for (const t of [0, 0.9]) near(r.at(t)[0], 0.5 * Math.cos(1.0), 1e-4);
});

test('sphere: constant surface slope q pushes the ball to accelerate exactly as r^2/(2c) + 3a^2 q t^2/(2c)', () => {
  const r = run('sphere', { a: 1, c: 1 }, 'free', c => c[0] ** 2 / 2, () => 0,
    { values: { surface: () => 1 } }, 30, [[0.4, 1.2, 0]]);
  near(r.at(0.7)[0], 0.16 / 2 + 1.5 * 0.49, 1e-4);
  assert.equal(r.sol.period, null);
});

test('drum: rim held at h = sin 2θ with harmonic f = r^2 sin 2θ stays put', () => {
  const r = run('disk', { a: 1, c: 1 }, 'fixed', c => c[0] ** 2 * Math.sin(2 * c[1]), () => 0,
    { values: { rim: c => Math.sin(2 * c[1]) } }, 60, [[0.6, 0.5]]);
  for (const t of [0, 1.3]) near(r.at(t)[0], 0.36 * Math.sin(1), 1e-3);
});

test('drum: constant rim slope accelerates as r^2/(2c) + a^2 q t^2 / c', () => {
  const r = run('disk', { a: 1, c: 1 }, 'free', c => c[0] ** 2 / 2, () => 0,
    { values: { rim: () => 1 } }, 40, [[0.5, 0.3]]);
  near(r.at(0.6)[0], 0.125 + 0.36, 1e-4);
});

test('rectangle: edge values of the harmonic u = x y keep it steady', () => {
  const p = { a: 1, Lx: 1.5, Ly: 1 };
  const r = run('rect', p, 'fixed', c => c[0] * c[1], () => 0,
    { values: { bottom: () => 0, top: c => c[0] * p.Ly, left: () => 0, right: c => p.Lx * c[1] } }, 120, [[0.7, 0.4]]);
  for (const t of [0, 0.8]) near(r.at(t)[0], 0.28, 5e-3);
});

test('no boundary data and no forcing reproduces the plain series (#11)', () => {
  const r = run('sphere', { a: 1, c: 1 }, 'fixed', c => 1 - c[0], () => 0, {}, 40, [[0.5, 1, 0]]);
  near(r.at(0.3)[0], 0.32, 0.01);
  near(r.sol.period, 2, 1e-9);
});

test('sphere #11 stays accurate at high N (radial sampling keeps up with the terms)', () => {
  for (const N of [80, 300]) {
    const pts = [0.1, 0.5, 0.9].map(r => [r, 1, 0]);
    const sol = solveFull(SHAPES.sphere, { a: 1, c: 1 }, 'fixed', c => 1 - c[0], () => 0, {}, N, pts, { radial: true });
    const out = new Float32Array(pts.length);
    evaluateFull(sol, 0, out);
    out.forEach((v, i) => near(v, 1 - pts[i][0], 0.01));
  }
});
