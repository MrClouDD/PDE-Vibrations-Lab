// Every wave preset must start from (close to) its own f and g at the term count it opens with,
// so the first frame shows the shape the problem states, not a truncation artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mathjs from 'mathjs';
globalThis.math = mathjs.create(mathjs.all);
const { SHAPES } = await import('../src/shapes/index.js');
const { PRESETS } = await import('../src/presets.js');
const { compileIC } = await import('../src/ic.js');
const { solveFull, evaluateFull } = await import('../src/drive.js');
const { isRadial } = await import('../src/shapes/sphere.js');

const VARS = { string: { left: ['t'], right: ['t'] }, sphere: { surface: ['r', 'θ'] }, disk: { rim: ['r', 'θ'] }, rect: { bottom: ['x', 'y'], top: ['x', 'y'], left: ['x', 'y'], right: ['x', 'y'] } };
// Interior sample points in each shape's coordinates (away from the boundary, where any series converges slowest).
function points(id, p) {
  const out = [];
  for (let i = 1; i <= 6; i++) for (let j = 0; j < 6; j++) {
    const s = 0.1 + (0.8 * i) / 7, a = 0.3 + j;
    if (id === 'string') { if (!j) out.push([s * p.L]); }
    else if (id === 'rect') out.push([s * p.Lx, (0.1 + 0.8 * (j + 0.5) / 6) * p.Ly]);
    else if (id === 'disk') out.push([s * p.c, a]);
    else if (id === 'sphere') out.push([s * p.c, 0.2 + 0.45 * j, 0.7 * j]);
    else out.push([s * p.c, a, (0.1 + 0.8 * (j + 0.5) / 6) * p.L]);
  }
  return out;
}

for (const [id, list] of Object.entries(PRESETS)) for (const pre of list) {
  test(`preset ${id}:${pre.id} reproduces its initial shape within 10%`, () => {
    const S = SHAPES[id], p = { ...S.defaults, ...(pre.params || {}) }, bc = pre.bc || S.bcs[0].id;
    const sample = S.coords.map((_, i) => (i === 0 ? 0.5 * S.size(p) : 0.7));
    const f = compileIC(pre.f, S.coords, p, sample).fn, g = compileIC(pre.g ?? '0', S.coords, p, sample).fn;
    const spec = { values: {}, F: null, timed: false };
    for (const [k, e] of Object.entries(pre.bcv || {})) {
      spec.values[k] = compileIC(e, VARS[id][k], p, VARS[id][k].map((_, i) => (i ? 0.7 : 0.5))).fn;
      if (/\bt\b/.test(e)) spec.timed = true;
    }
    if (pre.F) { spec.F = compileIC(pre.F, ['x', 't'], p, [0.5, 0.7]).fn; if (/\bt\b/.test(pre.F)) spec.timed = true; }
    const radial = id === 'sphere' && isRadial(f, g, p.c) && !(spec.values.surface && !isRadial(spec.values.surface, () => 0, p.c));
    let N = Math.min(pre.N ?? 30, S.maxN); if (spec.timed) N = Math.min(N, 100);
    const pts = points(id, p), sol = solveFull(S, p, bc, f, g, spec, N, pts, { radial });
    const at = t => { const o = new Float64Array(pts.length); evaluateFull(sol, t, o); return o; };
    const fv = pts.map(f), u0 = at(0);
    // Scale: the size of f, or of the boundary data when the string or body starts flat.
    const bscale = Math.max(0, ...Object.values(spec.values).map(fn => Math.abs(fn(sample.length > 1 ? [S.size(p), 0.4] : [0.8]))));
    const scale = Math.max(...fv.map(Math.abs), bscale) || 1;
    const errF = Math.max(...fv.map((v, i) => Math.abs(u0[i] - v))) / scale;
    assert.ok(errF < 0.1, `f error ${errF.toFixed(3)} at N=${N}`);
    if (!spec.timed && fv.every(v => v === 0)) {
      const h = 1e-4, up = at(h), um = at(-h), gv = pts.map(g), gs = Math.max(...gv.map(Math.abs)) || 1;
      const errG = Math.max(...gv.map((v, i) => Math.abs((up[i] - um[i]) / (2 * h) - v))) / gs;
      assert.ok(errG < 0.1, `g error ${errG.toFixed(3)} at N=${N}`);
    }
  });
}
