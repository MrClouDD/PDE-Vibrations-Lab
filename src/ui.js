import { createView, buildMesh } from './render.js';
import { SHAPES } from './shapes/index.js';
import { project, basisOn, evaluate, findPeriod, clampN } from './solve.js';
import { PRESETS, HEAT_PRESETS, LAPLACE_PRESETS, problemList } from './presets.js';
import { statement, coefTex, bookCoefs } from './statement.js';
import { compileIC } from './ic.js';
import { evaluateHeat, heatSettle, laplaceTerms } from './bonus.js';
import { isRadial } from './shapes/sphere.js';
import { solveFull, evaluateFull } from './drive.js';

const $ = id => document.getElementById(id);
const PARAM_LABEL = { a: 'Wave speed a', c: 'Radius c', L: 'Length L', Lx: 'Width Lx', Ly: 'Height Ly' };
const LAPLACE_SHAPES = ['sphere', 'disk', 'rect'];
// Heat mode uses the `a` box as the diffusivity k; real-time seconds per heat replay at 0.5× speed.
const HEAT_REPLAY = 6;

const view = createView($('stage'));
const state = {
  eqn: 'wave', shape: 'sphere', bc: 'fixed', preset: 'book11', f: '1 - r/c', g: '0', us: 0, bcv: {}, F: '',
  params: { ...SHAPES.sphere.defaults }, N: 30, explore: false, idx: [], t: 0, speed: 0.5, playing: true,
  gain: 1, showString: true, view: 'lattice', psi: 0,
};
let sol = null, mesh = null;
// Last formulas that compiled, so a typo never strands a freshly rebuilt mesh without a solution.
const good = { f: null, g: null };
let lastRadial = false, lastModal = false, lastUs = 0; // what solveCore actually solved, for the statement

// Typeset rows of TeX into el, each with an optional book-style tag "(1)". Without MathJax the TeX shows as text.
function renderMath(el, rows) {
  if (window.mjState === 'loading') { el.textContent = rows.length ? 'Typesetting…' : ''; return; } // redrawn on mathjax-done
  const tex2svg = window.MathJax?.tex2svg;
  el.replaceChildren(...rows.map(({ tex, tag }) => {
    const row = document.createElement('div');
    row.className = 'eqrow';
    const t = document.createElement('span');
    t.className = 'tag'; t.textContent = tag ? `(${tag})` : '';
    const m = document.createElement('div');
    m.className = 'm';
    try {
      if (!tex2svg) throw new Error('no MathJax');
      m.append(tex2svg(tex, { display: false }));
    } catch { m.classList.add('raw'); m.textContent = tex; }
    row.append(t, m);
    return row;
  }));
}

// The worked example in the panel: (1) PDE, (2) boundary, (3) initial, then the series and its first coefficients.
function renderStatement() {
  const s = statement({ ...state, radial: lastRadial, modal: lastModal, us: lastUs });
  const lap = state.eqn === 'laplace', last = s.conds.length - 1;
  renderMath($('statement'), [
    { tex: s.pde, tag: 1 },
    ...s.conds.map((tex, i) => ({ tex, tag: lap || i < last ? 2 : 3 })),
  ]);
  renderMath($('solution'), s.series.map(tex => ({ tex })));
  let coef = '';
  if (state.explore && sol?.modes) coef = `\\text{One standing wave: }${sol.modes[0].label.replace(/=/g, '{=}')},\\ \\omega=${sol.modes[0].omega.toFixed(4)}`;
  else if (sol) {
    // Same normalization and indices as the series shown above.
    const modes = sol.kind === 'full' ? sol.full.modes : sol.modes;
    const raw = sol.kind === 'full' ? sol.full : sol;
    const { A, B } = bookCoefs({ ...state, radial: lastRadial, a: state.params.a }, modes, raw.A, raw.B);
    // Radial sphere: the series shown is indexed by n alone (all modes have l = 0).
    const labels = modes.map(m => (lastRadial ? m.label.replace(/l=0,\s*/, '') : m.label));
    coef = sol.kind === 'heat' ? coefTex(A, null, 4, { labels })
      : sol.kind === 'laplace' ? coefTex(A, null, 4, { labels, trigAsB: state.shape === 'disk' })
        : coefTex(A, B, 4, { labels });
  }
  $('coefs-head').hidden = !coef;
  renderMath($('coefs'), coef ? [{ tex: coef }] : []);
}
function solve() { solveCore(); renderStatement(); }
addEventListener('mathjax-done', renderStatement);

const opt = (sel, items, value) => {
  sel.replaceChildren(...items.map(([v, label]) => new Option(label, v)));
  sel.value = value;
};
const presetList = () =>
  state.eqn === 'laplace' ? LAPLACE_PRESETS[state.shape]
    : state.eqn === 'heat' ? (HEAT_PRESETS[state.shape] ?? PRESETS[state.shape].map(p => ({ ...p, label: `${p.label} (as temperature)`, us: 0 })))
      : PRESETS[state.shape];

function loadPreset(pre) {
  Object.assign(state, { preset: pre.id, f: pre.f ?? pre.h, g: pre.g ?? '0', us: pre.us ?? 0, t: 0, bcv: { ...(pre.bcv || {}) }, F: pre.F ?? '' });
  if (pre.bc) state.bc = pre.bc;
  if (pre.params) Object.assign(state.params, pre.params);
  if (pre.view) state.view = pre.view; // e.g. motion that vanishes on the middle slice
  if (pre.N && state.N < pre.N) state.N = Math.min(pre.N, SHAPES[state.shape].maxN); // narrow pulses need more terms
}

function shapeChanged() {
  const S = SHAPES[state.shape];
  good.f = good.g = null;
  if (state.eqn === 'laplace' && !LAPLACE_SHAPES.includes(state.shape)) state.eqn = 'wave';
  state.params = { ...S.defaults };
  state.bc = S.bcs[0].id;
  loadPreset(presetList()[0]);
  Object.assign(state, { N: Math.min(state.N, S.maxN), idx: S.explorer.map(e => e.def) });
  syncControls();
  rebuild(true);
}

function syncControls() {
  const S = SHAPES[state.shape], wave = state.eqn === 'wave', lap = state.eqn === 'laplace';
  opt($('eqn'), [['wave', 'Wave equation'], ['heat', 'Heat equation (bonus)'],
    ...(LAPLACE_SHAPES.includes(state.shape) ? [['laplace', "Laplace's equation (bonus)"]] : [])], state.eqn);
  opt($('bc'), S.bcs.map(b => [b.id, b.label]), state.bc);
  $('bc-row').hidden = lap;
  // Boundary value / slope boxes (wave equation only), in the forms the book's vibration problems use.
  const fields = wave && !state.explore ? bcFields() : [];
  $('bcv').replaceChildren(...fields.map(fd => {
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${fd.label}</span><input id="bcv-${fd.key}" type="text" spellcheck="false" autocomplete="off" placeholder="0">`;
    const inp = lab.querySelector('input');
    inp.value = fd.key === 'F' ? state.F : state.bcv[fd.key] ?? '';
    inp.addEventListener('input', e => {
      if (fd.key === 'F') state.F = e.target.value; else state.bcv[fd.key] = e.target.value;
      state.preset = 'custom'; $('preset').value = 'custom';
      clearTimeout(typing); typing = setTimeout(() => { state.t = 0; solve(); }, 300);
    });
    return lab;
  }));
  const note = !wave || state.explore ? '' : state.shape === 'cylinder'
    ? 'Boundary values aren\'t available for the cylinder; no vibration problem in the book uses them.'
    : state.shape === 'rect' && state.bc !== 'fixed' ? 'Boundary values on the rectangle need all edges fixed.' : '';
  $('bcv-note').textContent = note; $('bcv-note').hidden = !note;
  if (!fields.length) $('bcv-err').textContent = '';
  opt($('preset'), [...presetList().map(p => [p.id, p.label]), ['custom', 'Custom (type below)']], state.preset);
  $('f').value = state.f; $('g').value = state.g;
  const vars = S.icVars ?? S.coords.join(', ');
  $('f-label').textContent = lap
    ? (state.shape === 'rect' ? 'h(x) on the top edge y = Ly' : 'h(θ) on the boundary r = c')
    : state.eqn === 'heat' ? `f(${vars}) initial temperature` : `f(${vars}) initial shape`;
  $('g-label').textContent = `g(${vars}) initial velocity`;
  $('g-row').hidden = !wave;
  $('us-row').hidden = state.eqn !== 'heat' || /free/.test(state.bc);
  $('us').value = state.us;
  $('params').replaceChildren(...Object.keys(S.defaults).filter(k => !(lap && k === 'a')).map(k => {
    const lab = document.createElement('label');
    lab.className = 'num';
    const name = k === 'a' && state.eqn === 'heat' ? 'Diffusivity k' : PARAM_LABEL[k] || k;
    lab.innerHTML = `<span>${name}</span><input id="p-${k}" type="number" step="0.1" min="0.1" value="${state.params[k]}">`;
    lab.querySelector('input').addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (v > 0) { state.params[k] = v; rebuild(true); } else e.target.value = state.params[k];
    });
    return lab;
  }));
  if (state.idx.length !== S.explorer.length) state.idx = S.explorer.map(e => e.def);
  $('explore-idx').replaceChildren(...S.explorer.map((e, i) => {
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${e.name}</span><input id="idx-${e.name}" type="number" step="1" min="${e.min}" max="40" value="${state.idx[i]}">`;
    lab.querySelector('input').addEventListener('change', ev => {
      const v = Math.max(e.min, Math.min(40, Math.round(+ev.target.value || e.min)));
      ev.target.value = v; state.idx[i] = v; state.t = 0; solve();
    });
    return lab;
  }));
  $('explore-row').hidden = !wave;
  $('explore').checked = state.explore;
  $('explore-idx').hidden = $('explore-info').hidden = !state.explore;
  $('N').max = lap ? 60 : S.maxN; $('N').value = state.N; $('N-out').textContent = state.N;
  // One picker for the book's problems (any shape) and the demos; anything else reads "your own problem".
  const pick = `${state.shape}:${state.preset}`, list = problemList();
  const groups = [...new Set(list.map(i => i.group))].map(g => {
    const og = document.createElement('optgroup');
    og.label = g;
    og.append(...list.filter(i => i.group === g).map(i => new Option(i.label, i.value)));
    return og;
  });
  $('problem').replaceChildren(...groups, new Option('Your own problem (see "Try your own problem" below)', 'custom'));
  $('problem').value = wave && list.some(i => i.value === pick) ? pick : 'custom';
  const chosen = list.find(i => i.value === $('problem').value);
  $('eq').textContent = (chosen ? chosen.label
    : wave ? 'Your own problem' : lap ? "Laplace's equation (bonus)" : 'Heat equation (bonus)')
    + (wave && state.explore ? ' · showing one standing wave' : '');
  const solid = state.shape === 'sphere' || state.shape === 'cylinder';
  const withString = state.shape === 'sphere' && state.view !== 'slice' && wave;
  $('view-row').hidden = !solid;
  $('view').value = state.view;
  $('psi-row').hidden = state.view !== 'slice';
  $('string-row').hidden = $('string-note').hidden = !withString;
  $('legend-note').textContent = withString && state.showString ? '· right: string v = r·u' : '';
  view.controls.autoRotate = lap || !view.grabbed();
}

// Boundary boxes per shape and boundary condition. `vars` are the formula's variables; `at` maps them
// to the shape coordinates the solver passes in.
function bcFields() {
  const bc = state.bc;
  if (state.shape === 'string') return [
    { key: 'left', label: bc === 'free' ? 'Left slope u<sub>x</sub>(0, t) =' : 'Left end u(0, t) =', vars: ['t'] },
    { key: 'right', label: bc === 'fixed' ? 'Right end u(L, t) =' : 'Right slope u<sub>x</sub>(L, t) =', vars: ['t'] },
    { key: 'F', label: 'Forcing F(x, t) in a²u<sub>xx</sub> + F = u<sub>tt</sub>', vars: ['x', 't'] },
  ];
  if (state.shape === 'sphere') return [{ key: 'surface', label: bc === 'fixed' ? 'Surface u(c, θ) =' : 'Surface slope ∂u/∂r(c, θ) =', vars: ['r', 'θ'] }];
  if (state.shape === 'disk') return [{ key: 'rim', label: bc === 'fixed' ? 'Rim u(c, θ) =' : 'Rim slope ∂u/∂r(c, θ) =', vars: ['r', 'θ'] }];
  if (state.shape === 'rect' && bc === 'fixed') return [
    { key: 'bottom', label: 'Bottom edge u(x, 0) =', vars: ['x', 'y'] },
    { key: 'top', label: 'Top edge u(x, Ly) =', vars: ['x', 'y'] },
    { key: 'left', label: 'Left edge u(0, y) =', vars: ['x', 'y'] },
    { key: 'right', label: 'Right edge u(Lx, y) =', vars: ['x', 'y'] },
  ];
  return [];
}

const usesT = expr => { try { return globalThis.math.parse(expr.replace(/θ/g, 'theta')).filter(n => n.isSymbolNode && n.name === 't').length > 0; } catch { return false; } };
const safe = fn => c => { let v; try { v = fn(c); } catch { v = 0; } return Number.isFinite(v) ? v : 0; };

// Compiled boundary spec for drive.js, or { error }. Empty boxes and plain 0 mean "zero".
function boundarySpec(p) {
  const spec = { values: {}, F: null, timed: false };
  for (const fd of bcFields()) {
    const expr = (fd.key === 'F' ? state.F : state.bcv[fd.key] ?? '').trim();
    if (!expr || expr === '0') continue;
    const sample = fd.vars.map((v, i) => (i === 0 ? 0.5 : 0.7));
    const c = compileIC(expr, fd.vars, p, sample);
    if (c.error) return { error: `${fd.label.replace(/<[^>]+>/g, '')} ${c.error}` };
    const t = usesT(expr);
    if (t && state.shape !== 'string') return { error: 'Time-dependent boundary values work on the string only.' };
    spec.timed ||= t;
    if (fd.key === 'F') spec.F = safe(c.fn); else spec.values[fd.key] = safe(c.fn);
  }
  return spec;
}

function rebuild(refit) {
  const showString = state.showString && state.eqn === 'wave';
  mesh = buildMesh(state.shape, state.params, { showString, view: state.view, psi: (state.psi * Math.PI) / 180 });
  view.setObject(mesh.object3D, refit, mesh.dir);
  solve();
}

// Per-vertex max |u| over sample times sets the displacement and color scales. refAt (optional)
// evaluates u at points spread through the whole body; 20% of its max is the smallest scale allowed.
function calibrate(at, times, refAt) {
  const maxAbs = new Float32Array(mesh.coords.length);
  let ref = 0;
  for (const t of times) {
    const out = at(t);
    for (let i = 0; i < out.length; i++) maxAbs[i] = Math.max(maxAbs[i], Math.abs(out[i]) || 0);
    if (refAt) for (const v of refAt(t)) ref = Math.max(ref, Math.abs(v) || 0);
  }
  mesh.calibrate(maxAbs, 0.2 * ref);
}
const refPoints = S => S.quadGrid(state.params).pts.filter((_, i) => i % 7 === 0);

function solveCore() {
  const S = SHAPES[state.shape], p = state.params;
  const sample = S.coords.map((_, i) => (i === 0 ? 0.5 * S.size(p) : 0.7));
  const f = compileIC(state.f, S.coords, p, sample);
  const g = state.eqn === 'wave' ? compileIC(state.g, S.coords, p, sample) : { fn: () => 0 };
  $('f-err').textContent = f.error || ''; $('g-err').textContent = g.error || '';
  // On a typo keep solving with the last valid formula (the error stays visible under the input).
  for (const [k, c] of [['f', f], ['g', g]]) {
    if (c.error) c.fn = good[k]; else good[k] = c.fn;
    if (c.fn) c.error = null; // solvable with the fallback; the message stays on screen
  }
  const radial = state.shape === 'sphere' && isRadial(f.fn ?? (() => 0), g.fn ?? (() => 0), p.c);
  lastRadial = radial; lastModal = false; lastUs = 0;
  const out = new Float32Array(mesh.coords.length);
  const steps = n => Array.from({ length: 24 }, (_, k) => (n * k) / 24);

  if (state.eqn === 'laplace') {
    if (f.error) return;
    const N = Math.min(state.N, 60);
    const h = c => { let v; try { v = f.fn(c); } catch { v = 0; } return Number.isFinite(v) ? v : 0; };
    const { modes, A } = laplaceTerms(state.shape, p, h, N), B = new Float64Array(N);
    const basis = basisOn(modes, mesh.coords);
    calibrate(() => (evaluate(basis, modes, A, B, 0, out), out), [0]);
    sol = { kind: 'laplace', modes, A, B, basis, out, loop: N * 0.4 + 2, window: N * 0.4 + 2 };
    $('warn').textContent = '';
    $('period').textContent = `Steady state, built one term at a time (${N} terms).`;
    $('scrub').max = sol.window;
    return;
  }

  if (state.eqn === 'heat') {
    if (f.error) return;
    const us = $('us-row').hidden ? 0 : state.us, k = p.a;
    lastUs = us;
    const { N, capped } = clampN(S, state.N);
    const modes = S.modes(p, state.bc, N, { radial });
    const { A, warnings } = project(modes, S.quadGrid(p, { N, radial }), c => f.fn(c) - us, () => 0);
    const basis = basisOn(modes, mesh.coords);
    const settle = heatSettle(modes, A, k, p.a) || 1, loop = settle * 1.25;
    calibrate(t => (evaluateHeat(basis, modes, A, k, p.a, t, out, us), out), steps(settle));
    sol = { kind: 'heat', modes, A, basis, out, us, k, loop, window: loop, rate: loop / HEAT_REPLAY / 0.5 };
    $('warn').textContent = [...warnings, capped ? `N capped at ${N} for this shape.` : ''].filter(Boolean).join(' ');
    $('period').textContent = `Heat spreads to steady state by t ≈ ${settle.toFixed(3)}, then replays.`;
    $('scrub').max = sol.window;
    return;
  }

  let modes, A, B, warnings = [], capped = false, N = state.N;
  if (state.explore) {
    // A single pure mode φ cos(ωt): A = 1, B = 0.
    modes = [S.mode(p, state.bc, state.idx)];
    A = Float64Array.of(1); B = Float64Array.of(0);
    $('explore-info').textContent = `${modes[0].label}: ω = ${modes[0].omega.toFixed(4)}, period 2π/ω = ${((2 * Math.PI) / modes[0].omega).toFixed(4)}`;
  } else {
    if (f.error || g.error) return;
    const spec = boundarySpec(p);
    $('bcv-err').textContent = spec.error || '';
    if (spec.error) return;
    ({ N, capped } = clampN(S, state.N));
    if (spec.timed) N = Math.min(N, 100); // time-driven problems integrate every mode over time
    // Boundary values that vary with θ make the sphere's motion non-radial.
    const rad = radial && !(spec.values.surface && !isRadial(spec.values.surface, () => 0, p.c));
    const refPts = refPoints(S), refOut = new Float32Array(refPts.length);
    const full = solveFull(S, p, state.bc, safe(f.fn), safe(g.fn), spec, N, mesh.coords, { radial: rad, refPts });
    // Forcing, time-driven ends, or boundary data that push the whole body: modes are forced oscillators.
    lastModal = !!spec.F || full.timed || (full.drift && Object.keys(spec.values).length > 0);
    const S2 = full.timed ? full.window : (full.period ?? (2 * S.size(p)) / p.a);
    calibrate(t => (evaluateFull(full, t, out), out), steps(full.drift ? 2 * S2 : S2),
      t => (evaluateFull(full, t, refOut, undefined, full.ref), refOut));
    const loop = full.period ?? (full.timed ? full.window : full.drift ? 2 * S2 : null);
    sol = { kind: 'full', full, out, period: full.period, loop, window: loop ?? 10 * S2, rate: 1 };
    $('warn').textContent = [
      ...full.warnings,
      capped ? `N capped at ${N} for this shape.` : '',
      full.drift ? `The boundary data or average velocity push the whole body along (it accelerates or drifts); replaying every ${loop.toFixed(2)}.` : '',
      full.timed ? `Time-driven problem: shown for 0 ≤ t ≤ ${full.window.toFixed(1)}, then replayed.` : '',
    ].filter(Boolean).join(' ');
    $('period').textContent = full.period
      ? `Repeats exactly every ${full.period.toFixed(3)} time units${state.shape === 'sphere' && Math.abs(full.period - 2 * p.c / p.a) < 1e-6 ? ' (= 2c/a)' : ''}.`
      : full.timed || full.drift ? 'Driven by the boundary or forcing: does not repeat.'
        : 'Never exactly repeats: the active frequencies are not whole multiples of one another.';
    $('scrub').max = sol.window;
    return;
  }
  const basis = basisOn(modes, mesh.coords);
  const period = findPeriod(modes, A, B);
  // Calibrate over a window of times so a pure strike (f = 0) still gets a sensible size.
  const win = period ?? (2 * S.size(p)) / p.a;
  const refPts = refPoints(S), refBasis = basisOn(modes, refPts), refOut = new Float32Array(refPts.length);
  calibrate(t => (evaluate(basis, modes, A, B, t, out), out), steps(win),
    t => (evaluate(refBasis, modes, A, B, t, refOut), refOut));
  // A free boundary with nonzero average velocity excites the ω = 0 rigid mode: the body drifts, so loop it.
  const drift = modes.some((m, k) => m.omega === 0 && Math.abs(B[k]) > 1e-9);
  const loop = period ?? (drift ? 2 * win : null);
  sol = { kind: 'wave', modes, A, B, basis, out, period, loop, window: loop ?? 10 * win, rate: 1 };
  $('warn').textContent = [
    ...warnings,
    capped ? `N capped at ${N} for this shape.` : '',
    drift ? `Free boundary with nonzero average velocity: the whole body drifts (rigid-motion mode). Replaying every ${loop.toFixed(2)}.` : '',
  ].filter(Boolean).join(' ');
  $('period').textContent = period
    ? `Repeats exactly every ${period.toFixed(3)} time units${state.shape === 'sphere' && Math.abs(period - 2 * p.c / p.a) < 1e-6 ? ' (= 2c/a)' : ''}.`
    : 'Never exactly repeats: the active frequencies are not whole multiples of one another.';
  $('scrub').max = sol.window;
}

// Controls
$('eqn').addEventListener('change', e => {
  state.eqn = e.target.value; state.explore = false; good.f = good.g = null;
  loadPreset(presetList()[0]); syncControls(); rebuild(false);
});
$('shape').addEventListener('change', e => { state.shape = e.target.value; shapeChanged(); });
$('bc').addEventListener('change', e => { state.bc = e.target.value; state.t = 0; syncControls(); solve(); });
$('preset').addEventListener('change', e => {
  const pre = presetList().find(p => p.id === e.target.value);
  if (pre) loadPreset(pre); else state.preset = 'custom';
  syncControls();
  if (pre?.params || pre?.view) rebuild(true); else solve(); // a new size or view needs a new mesh
});
let typing;
for (const k of ['f', 'g']) $(k).addEventListener('input', e => {
  state[k] = e.target.value; state.preset = 'custom'; $('preset').value = 'custom';
  clearTimeout(typing); typing = setTimeout(() => { state.t = 0; solve(); }, 300);
});
$('us').addEventListener('change', e => { state.us = parseFloat(e.target.value) || 0; state.t = 0; solve(); });
$('explore').addEventListener('change', e => { state.explore = e.target.checked; state.t = 0; syncControls(); solve(); });
$('N').addEventListener('input', e => { state.N = +e.target.value; $('N-out').textContent = state.N; });
$('N').addEventListener('change', () => { state.t = 0; solve(); });
$('play').addEventListener('click', () => {
  state.playing = !state.playing;
  $('play').textContent = state.playing ? 'Pause' : 'Play';
});
$('speed').addEventListener('input', e => { state.speed = +e.target.value; $('speed-out').textContent = `${state.speed.toFixed(2)}×`; });
$('gain').addEventListener('input', e => { state.gain = +e.target.value; });
$('scrub').addEventListener('input', e => { state.t = +e.target.value; });
$('view').addEventListener('change', e => { state.view = e.target.value; syncControls(); rebuild(true); });
let psiTimer;
$('psi').addEventListener('input', e => {
  state.psi = +e.target.value; $('psi-out').textContent = `${state.psi}°`;
  clearTimeout(psiTimer); psiTimer = setTimeout(() => rebuild(false), 60);
});
$('show-string').addEventListener('change', e => { state.showString = e.target.checked; syncControls(); rebuild(true); });

// A book problem or demo, on any shape: start clean (that shape's defaults, 30 terms, glass view) and load it.
$('problem').addEventListener('change', e => {
  if (e.target.value === 'custom') { $('own').open = true; return; }
  const [shape, id] = e.target.value.split(':'), S = SHAPES[shape];
  Object.assign(state, { eqn: 'wave', explore: false, shape, params: { ...S.defaults }, bc: S.bcs[0].id, N: 30, view: 'lattice', idx: S.explorer.map(x => x.def) });
  good.f = good.g = null;
  $('shape').value = shape;
  loadPreset(PRESETS[shape].find(p => p.id === id));
  syncControls();
  rebuild(true);
});
// The how-to hint fades once someone has dragged the view.
$('stage').addEventListener('pointerdown', () => setTimeout(() => $('hint').classList.add('gone'), 1500), { once: true });

// Animation loop. dt is clamped so a hidden tab resumes without a jump.
let last = performance.now();
const drawn = { sol: null, t: NaN, gain: NaN };
// Skip all work while the 3D view is scrolled off screen (phones stack the panel below it).
let onScreen = true;
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe($('stage'));
function tick(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.1)); // first rAF stamp can precede `last`
  last = now;
  if (!onScreen) { requestAnimationFrame(tick); return; }
  // Recompute u only when time, gain or the solution changed (playing, scrubbing, or a new problem).
  const changed = !!sol && (state.playing || sol !== drawn.sol || state.t !== drawn.t || state.gain !== drawn.gain);
  if (changed) {
    if (state.playing) {
      // Laplace advances one term per 0.4 s of real time regardless of speed; the others scale with speed.
      state.t += sol.kind === 'laplace' ? dt : dt * state.speed * sol.rate;
      if (sol.loop) state.t %= sol.loop;
    }
    if (sol.kind === 'heat') evaluateHeat(sol.basis, sol.modes, sol.A, sol.k, state.params.a, Math.min(state.t, sol.loop / 1.25), sol.out, sol.us);
    else if (sol.kind === 'laplace') {
      const n = Math.max(1, Math.min(sol.modes.length, Math.floor(state.t / 0.4) + 1));
      evaluate(sol.basis, sol.modes, sol.A, sol.B, 0, sol.out, n);
      $('period').textContent = `Steady state, built one term at a time: ${n} of ${sol.modes.length} terms.`;
    } else if (sol.kind === 'full') evaluateFull(sol.full, state.t, sol.out);
    else evaluate(sol.basis, sol.modes, sol.A, sol.B, state.t, sol.out);
    mesh.apply(sol.out, state.gain, sol.kind === 'wave' || sol.kind === 'full' ? undefined : { shell: 0 });
    $('t-out').textContent = state.t.toFixed(2);
    if (state.playing) $('scrub').value = state.t % sol.window;
    Object.assign(drawn, { sol, t: state.t, gain: state.gain });
  }
  view.frame(changed);
  requestAnimationFrame(tick);
}

opt($('shape'), Object.values(SHAPES).map(S => [S.id, S.label]), state.shape);
// #string, #disk, ... opens straight to that shape.
const fromHash = () => {
  const h = location.hash.slice(1);
  if (SHAPES[h] && h !== state.shape) { state.shape = h; $('shape').value = h; shapeChanged(); return true; }
};
addEventListener('hashchange', fromHash);
if (!fromHash()) { syncControls(); rebuild(true); }
requestAnimationFrame(tick);
