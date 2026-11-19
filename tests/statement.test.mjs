// Textbook-style problem block, solution and picker (UI plan, Tasks 1-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mathjs from 'mathjs';
globalThis.math = mathjs.create(mathjs.all);
const { toTex, statement, coefTex } = await import('../src/statement.js');
const { problemList, PRESETS } = await import('../src/presets.js');

const has = (arr, s) => assert.ok(arr.some(x => x.includes(s)), `${s} not in\n${arr.join('\n')}`);

test('toTex typesets formulas and never throws on a typo', () => {
  assert.ok(toTex('1 - r/c').includes(String.raw`\frac{r}{c}`), toTex('1 - r/c'));
  assert.ok(toTex('sin(θ').includes(String.raw`\text`));
  assert.ok(toTex('cos(θ)').includes(String.raw`\theta`));
  assert.ok(!/\\cdot[A-Za-z]/.test(toTex('0.3*L')), toTex('0.3*L')); // a variable after \cdot stays separate
});

test('statement: #11 as the book writes it', () => {
  const s = statement({ eqn: 'wave', shape: 'sphere', bc: 'fixed', f: '1 - r/c', g: '0', bcv: {}, F: '', radial: true });
  has(s.conds, 'u(c,t)=0');
  has(s.conds, String.raw`\frac{r}{c}`);
  assert.ok(s.pde.includes('u_{tt}'));
  has(s.series, String.raw`\sin`);
});

test('statement: driven string end shows the typed boundary value and ψ + v', () => {
  const s = statement({ eqn: 'wave', shape: 'string', bc: 'fixed', f: '0', g: '0', bcv: { right: 'sin(t)' }, F: '' });
  has(s.conds, String.raw`u(L,t)=\sin`);
  has(s.series, String.raw`\psi`);
});

test('statement: every shape, BC and equation produces strings', () => {
  for (const eqn of ['wave', 'heat', 'laplace']) for (const shape of ['sphere', 'string', 'rect', 'disk', 'cylinder'])
    for (const bc of ['fixed', 'free', 'fixfree', 'mixed', 'sidefree', 'endsfree']) {
      const s = statement({ eqn, shape, bc, f: '1', g: '0', bcv: {}, F: '', us: 0 });
      assert.equal(typeof s.pde, 'string');
      assert.ok(s.conds.length > 0);
    }
});

test('coefTex: first coefficients, B_n = 0 when released from rest', () => {
  const t = coefTex([0.63662, -0.31831], [0, 0]);
  assert.ok(t.includes('A_{1}=0.637'), t);
  assert.ok(t.includes('B_{n}=0'), t);
});

test('problemList: book problems first, every wave preset once', () => {
  const L = problemList();
  assert.equal(L[0].value, 'sphere:book11');
  for (const it of L.filter(i => i.group === 'From the book')) assert.ok(it.label.startsWith('Zill'), it.label);
  const all = Object.entries(PRESETS).flatMap(([s, ps]) => ps.map(p => `${s}:${p.id}`)).sort();
  assert.deepEqual(L.map(i => i.value).sort(), all);
});

test('bookCoefs: #11 coefficients in the book normalization, A_n = 8/(nπ)^3 for odd n', async () => {
  const { bookCoefs } = await import('../src/statement.js');
  const { SHAPES } = await import('../src/shapes/index.js');
  const { solveFull } = await import('../src/drive.js');
  const sol = solveFull(SHAPES.sphere, { a: 1, c: 1 }, 'fixed', c => 1 - c[0], () => 0, {}, 30, [], { radial: true });
  const { A } = bookCoefs({ shape: 'sphere', bc: 'fixed', radial: true, a: 1 }, sol.modes, sol.A, sol.B);
  assert.ok(Math.abs(A[0] - 8 / Math.PI ** 3) < 1e-4, A[0]);
  assert.ok(Math.abs(A[1]) < 1e-6, A[1]);
  assert.ok(Math.abs(A[2] - 8 / (3 * Math.PI) ** 3) < 1e-4, A[2]);
});

test('review: forced or driven problems show the modal form T_n(t), not cos/sin with A_n', () => {
  const s = statement({ eqn: 'wave', shape: 'string', bc: 'fixed', f: '0', g: '0', bcv: {}, F: '-1', modal: true });
  has(s.series, 'T_n');
  assert.ok(!s.series.some(x => x.includes(String.raw`A_n\cos`)), s.series.join('\n'));
});

test('review: all-free boundaries show the rigid n = 0 term A_0 + B_0 t', () => {
  for (const shape of ['string', 'disk', 'rect', 'sphere', 'cylinder']) {
    const s = statement({ eqn: 'wave', shape, bc: 'free', f: '1', g: '0', bcv: {}, F: '' });
    has(s.series, 'B_0t');
  }
});

test('minor: heat defines λ_n; radial free sphere names j_0, not j_l P_l', () => {
  const s = statement({ eqn: 'heat', shape: 'string', bc: 'fixed', f: '1', us: 0 });
  has(s.series, String.raw`\lambda_n=`);
  const r = statement({ eqn: 'heat', shape: 'sphere', bc: 'free', f: '1', us: 0, radial: true });
  assert.ok(!r.series.some(x => x.includes('P_l')), r.series.join('\n'));
});

test('minor: Laplace series split into short rows; disk gets its coefficient integrals', () => {
  for (const shape of ['sphere', 'disk', 'rect']) {
    const s = statement({ eqn: 'laplace', shape, bc: 'fixed', f: '1' });
    assert.ok(s.series.length >= 2, shape);
  }
  has(statement({ eqn: 'laplace', shape: 'disk', bc: 'fixed', f: '1' }).series, 'B_n=');
});

test('minor: besselj0 typesets as J_0 with its first zero x_1', () => {
  const t = toTex('besselj0(2.404825557695773*r/c)');
  assert.ok(t.includes('J_0') && t.includes('x_1') && !t.includes('besselj0'), t);
});

test('bookCoefs leaves Laplace (ω = 0) coefficients alone', async () => {
  const { bookCoefs } = await import('../src/statement.js');
  const { A } = bookCoefs({ eqn: 'laplace', shape: 'sphere', bc: 'fixed', radial: true, a: 1 }, [{ omega: 0 }], [2], null);
  assert.equal(A[0], 2);
});

test('review: coefficients are labelled by mode, sin terms as B for the Laplace disk', () => {
  const t = coefTex([1, 2, 3], null, 4, { labels: ['m=0, n=1', 'm=2, n=1 (cos)', 'm=2, n=1 (sin)'] });
  assert.ok(t.includes('A_{0,1}=1') && t.includes(String.raw`A_{2,1}^{\cos}=2`), t);
  const d = coefTex([1, 2, 3], null, 4, { labels: ['n=0', 'n=1 (cos)', 'n=1 (sin)'], trigAsB: true });
  assert.ok(d.includes('A_{0}=1') && d.includes('A_{1}=2') && d.includes('B_{1}=3'), d);
});

test('Review #6 preset visibly moves: mid-string swings by more than 0.1', async () => {
  const { compileIC } = await import('../src/ic.js');
  const { SHAPES } = await import('../src/shapes/index.js');
  const { solveFull, evaluateFull } = await import('../src/drive.js');
  const pre = PRESETS.string.find(p => p.id === 'rev6'), p = { a: 1, L: 1 };
  const fx = e => compileIC(e, ['x'], p, [0.5]).fn, ft = e => compileIC(e, ['x', 't'], p, [0.5, 0.7]).fn;
  const sol = solveFull(SHAPES.string, p, 'fixed', fx(pre.f), fx(pre.g), { values: { left: ft(pre.bcv.left) }, F: ft(pre.F) }, 60, [[0.5]]);
  const out = new Float32Array(1), vals = [];
  for (let i = 0; i < 80; i++) { evaluateFull(sol, (4 * i) / 80, out); vals.push(out[0]); }
  assert.ok(Math.max(...vals) - Math.min(...vals) > 0.1, `swing ${Math.max(...vals) - Math.min(...vals)}`);
});
