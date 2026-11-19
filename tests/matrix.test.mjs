// Every shape × boundary condition × preset, in each equation, yields finite values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mathjs from 'mathjs';
globalThis.math = mathjs.create(mathjs.all);
const { compileIC } = await import('../src/ic.js');
const { SHAPES } = await import('../src/shapes/index.js');
const { PRESETS, HEAT_PRESETS, LAPLACE_PRESETS } = await import('../src/presets.js');
const { project, basisOn, evaluate } = await import('../src/solve.js');
const { evaluateHeat, laplaceTerms } = await import('../src/bonus.js');

const finite = (arr, what) => assert.ok(Array.from(arr).every(Number.isFinite), what);

for (const S of Object.values(SHAPES)) {
  const p = S.defaults, grid = S.quadGrid(p), pts = grid.pts.filter((_, i) => i % 37 === 0);
  test(`${S.id}: wave and heat presets stay finite for every boundary condition`, () => {
    for (const bc of S.bcs) {
      const modes = S.modes(p, bc.id, 40), basis = basisOn(modes, pts), out = new Float32Array(pts.length);
      for (const pre of [...PRESETS[S.id], ...(HEAT_PRESETS[S.id] ?? [])]) {
        const f = compileIC(pre.f, S.coords, p).fn, g = compileIC(pre.g ?? '0', S.coords, p).fn;
        const { A, B } = project(modes, grid, f, g);
        finite(A, `${S.id}/${bc.id}/${pre.id} A`); finite(B, `${S.id}/${bc.id}/${pre.id} B`);
        for (const t of [0, 0.37, 3.1]) {
          evaluate(basis, modes, A, B, t, out); finite(out, `${S.id}/${bc.id}/${pre.id} wave t=${t}`);
          evaluateHeat(basis, modes, A, 1, p.a, t, out, pre.us ?? 0); finite(out, `${S.id}/${bc.id}/${pre.id} heat t=${t}`);
        }
      }
      for (const idx of [S.explorer.map(e => e.def), S.explorer.map(e => e.min + 3)]) {
        const m = S.mode(p, bc.id, idx);
        assert.ok(m.omega > 0, `${S.id}/${bc.id} mode ${idx}`);
        finite(pts.map(c => m.f(c)), `${S.id}/${bc.id} mode ${idx}`);
      }
    }
  });
}

for (const [id, list] of Object.entries(LAPLACE_PRESETS)) {
  test(`${id}: Laplace presets stay finite`, () => {
    const S = SHAPES[id], p = S.defaults, pts = S.quadGrid(p).pts.filter((_, i) => i % 37 === 0);
    for (const pre of list) {
      const { modes, A } = laplaceTerms(id, p, compileIC(pre.h, S.coords, p).fn, 60);
      const out = new Float32Array(pts.length);
      evaluate(basisOn(modes, pts), modes, A, new Float64Array(A.length), 0, out);
      finite(out, `${id}/${pre.id}`);
    }
  });
}
