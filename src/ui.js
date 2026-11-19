import { createView, buildMesh } from './render.js';
import { SHAPES } from './shapes/index.js';
import { project, basisOn, evaluate, findPeriod, clampN } from './solve.js';
import { PRESETS, problemList } from './presets.js';
import { statement, coefTex, bookCoefs } from './statement.js';
import { compileIC } from './ic.js';
import { isRadial } from './shapes/sphere.js';
import { solveFull, evaluateFull } from './drive.js';

const $ = id => document.getElementById(id);
const PARAM_LABEL = { a: 'Wave speed a', c: 'Radius c', L: 'Length L', Lx: 'Width Lx', Ly: 'Height Ly' };

const view = createView($('stage'));
const state = {
  shape: 'sphere', bc: 'fixed', preset: 'book11', f: '1 - r/c', g: '0', bcv: {}, F: '',
  params: { ...SHAPES.sphere.defaults }, N: 30, explore: false, idx: [], t: 0, speed: 0.5, playing: true,
  gain: 1, showString: true,
  // Each shape remembers its own view (see VIEWS).
  views: { sphere: 'wavesph', cylinder: 'wavesph', disk: 'surface', rect: 'surface', string: 'tube' },
  // Look of each view, adjustable from the View panel (see VIS_CONTROLS).
  vis: { shells: 6, rings: 28, dot: 1, arrowN: 7.5, arrowSize: 1, corner: true, axis: 'x', angle: 0, thick: 1, wire: false, detail: 1,
    flatN: 20, flatDot: 1, flatArrowN: 10, flatArrowSize: 1, beads: 60, beadSize: 1 },
};
let sol = null, mesh = null;
// Last formulas that compiled, so a typo never strands a freshly rebuilt mesh without a solution.
const good = { f: null, g: null };
let lastRadial = false, lastModal = false; // what solveCore actually solved, for the statement

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
  const s = statement({ ...state, radial: lastRadial, modal: lastModal }), last = s.conds.length - 1;
  renderMath($('statement'), [
    { tex: s.pde, tag: 1 },
    ...s.conds.map((tex, i) => ({ tex, tag: i < last ? 2 : 3 })),
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
    coef = coefTex(A, B, 4, { labels });
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
const presetList = () => PRESETS[state.shape];

function loadPreset(pre) {
  Object.assign(state, { preset: pre.id, f: pre.f, g: pre.g ?? '0', t: 0, bcv: { ...(pre.bcv || {}) }, F: pre.F ?? '' });
  if (pre.bc) state.bc = pre.bc;
  if (pre.params) Object.assign(state.params, pre.params);
  if (pre.N && state.N < pre.N) state.N = Math.min(pre.N, SHAPES[state.shape].maxN); // narrow pulses need more terms
}

function shapeChanged() {
  const S = SHAPES[state.shape];
  good.f = good.g = null;
  state.params = { ...S.defaults };
  state.bc = S.bcs[0].id;
  loadPreset(presetList()[0]);
  Object.assign(state, { N: Math.min(state.N, S.maxN), idx: S.explorer.map(e => e.def) });
  syncControls();
  rebuild(true);
}

// View settings: sliders and options for the current view (solids) or shape. Each change rebuilds the
// mesh (keeping the camera) after a short pause, so dragging a slider stays smooth.
// The views each kind of shape offers, first = default.
const SOLID_VIEWS = [
  ['wavesph', 'Wave spheres: nested shells of dots, each dot pushed along the radius by u'],
  ['arrowfield', 'Arrow field: arrows pointing out where u > 0 and in where u < 0'],
  ['glass', 'Glass ball: a rippling slice through the middle of the clear solid'],
];
const FLAT_VIEWS = [
  ['surface', 'Surface: the membrane as a colored sheet'],
  ['dots', 'Dots: a grid of dots, each lifted by u'],
  ['arrows', 'Arrows: up where u > 0, down where u < 0'],
];
const VIEWS = {
  sphere: SOLID_VIEWS, cylinder: SOLID_VIEWS, disk: FLAT_VIEWS, rect: FLAT_VIEWS,
  string: [['tube', 'String: a smooth tube'], ['beads', 'Beads: a row of beads, each lifted by u']],
};
const curView = () => state.views[state.shape];
const VIS_CONTROLS = {
  wavesph: [
    { key: 'shells', label: 'Number of shells', min: 2, max: 10, step: 1 },
    { key: 'rings', label: 'Latitude rings (outer shell)', min: 8, max: 60, step: 1 },
    { key: 'dot', label: 'Dot size', min: 0.4, max: 3, step: 0.1, fmt: v => `${v.toFixed(1)}×` },
  ],
  arrowfield: [
    { key: 'arrowN', label: 'Arrows per radius (spacing)', min: 4, max: 12, step: 0.5 },
    { key: 'arrowSize', label: 'Arrow size', min: 0.3, max: 2.5, step: 0.1, fmt: v => `${v.toFixed(1)}×` },
    { key: 'corner', label: 'Cut a corner open to see inside', type: 'check' },
  ],
  glass: [
    { key: 'axis', label: 'Turn the slice about the', type: 'select', options: [['x', 'x axis'], ['y', 'y axis (vertical)'], ['z', 'z axis']] },
    { key: 'angle', label: 'Slice angle', min: 0, max: 180, step: 1, fmt: v => `${v}°` },
  ],
  tube: [{ key: 'thick', label: 'String thickness', min: 0.3, max: 4, step: 0.1, fmt: v => `${v.toFixed(1)}×` }],
  beads: [
    { key: 'beads', label: 'Number of beads', min: 15, max: 200, step: 1 },
    { key: 'beadSize', label: 'Bead size', min: 0.3, max: 2.5, step: 0.1, fmt: v => `${v.toFixed(1)}×` },
  ],
  dots: [
    { key: 'flatN', label: 'Dots across (spacing)', min: 6, max: 50, step: 1 },
    { key: 'flatDot', label: 'Dot size', min: 0.3, max: 2.5, step: 0.1, fmt: v => `${v.toFixed(1)}×` },
  ],
  arrows: [
    { key: 'flatArrowN', label: 'Arrows across (spacing)', min: 4, max: 24, step: 1 },
    { key: 'flatArrowSize', label: 'Arrow size', min: 0.3, max: 2.5, step: 0.1, fmt: v => `${v.toFixed(1)}×` },
  ],
  surface: [
    { key: 'detail', label: 'Surface detail', min: 0.5, max: 2, step: 0.25, fmt: v => `${v.toFixed(2)}×` },
    { key: 'wire', label: 'Show as a wire mesh', type: 'check' },
  ],
};
let visTimer;
const visChanged = () => { clearTimeout(visTimer); visTimer = setTimeout(() => rebuild(false), 150); };
function renderVis() {
  const list = VIS_CONTROLS[curView()] ?? [];
  $('vis').replaceChildren(...list.map(cfg => {
    const v = state.vis[cfg.key], id = `vis-${cfg.key}`;
    if (cfg.type === 'check') {
      const lab = document.createElement('label');
      lab.className = 'check';
      lab.innerHTML = `<input id="${id}" type="checkbox"${v ? ' checked' : ''}> <span>${cfg.label}</span>`;
      lab.querySelector('input').addEventListener('change', e => { state.vis[cfg.key] = e.target.checked; visChanged(); });
      return lab;
    }
    if (cfg.type === 'select') {
      const lab = document.createElement('label');
      lab.innerHTML = `<span>${cfg.label}</span><select id="${id}"></select>`;
      const sel = lab.querySelector('select');
      opt(sel, cfg.options, v);
      sel.addEventListener('change', e => { state.vis[cfg.key] = e.target.value; visChanged(); });
      return lab;
    }
    const box = document.createElement('div');
    box.className = 'stack';
    const show = x => (cfg.fmt ? cfg.fmt(x) : String(x));
    box.innerHTML = `<label for="${id}"><span>${cfg.label}</span></label>`
      + `<div class="row"><input id="${id}" type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${v}"><output>${show(v)}</output></div>`;
    box.querySelector('input').addEventListener('input', e => {
      state.vis[cfg.key] = +e.target.value;
      box.querySelector('output').textContent = show(+e.target.value);
      visChanged();
    });
    return box;
  }));
}

function syncControls() {
  const S = SHAPES[state.shape];
  opt($('bc'), S.bcs.map(b => [b.id, b.label]), state.bc);
  // Boundary value / slope boxes, in the forms the book's vibration problems use.
  const fields = !state.explore ? bcFields() : [];
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
  const note = state.explore ? '' : state.shape === 'cylinder'
    ? 'Boundary values aren\'t available for the cylinder; no vibration problem in the book uses them.'
    : state.shape === 'rect' && state.bc !== 'fixed' ? 'Boundary values on the rectangle need all edges fixed.' : '';
  $('bcv-note').textContent = note; $('bcv-note').hidden = !note;
  if (!fields.length) $('bcv-err').textContent = '';
  opt($('preset'), [...presetList().map(p => [p.id, p.label]), ['custom', 'Custom (type below)']], state.preset);
  $('f').value = state.f; $('g').value = state.g;
  const vars = S.icVars ?? S.coords.join(', ');
  $('f-label').textContent = `f(${vars}) initial shape`;
  $('g-label').textContent = `g(${vars}) initial velocity`;
  $('params').replaceChildren(...Object.keys(S.defaults).map(k => {
    const lab = document.createElement('label');
    lab.className = 'num';
    const name = PARAM_LABEL[k] || k;
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
  $('explore').checked = state.explore;
  $('explore-idx').hidden = $('explore-info').hidden = !state.explore;
  $('N').max = S.maxN; $('N').value = state.N; $('N-out').textContent = state.N;
  // One picker for the book's problems (any shape) and the demos; anything else reads "your own problem".
  const pick = `${state.shape}:${state.preset}`, list = problemList();
  const groups = [...new Set(list.map(i => i.group))].map(g => {
    const og = document.createElement('optgroup');
    og.label = g;
    og.append(...list.filter(i => i.group === g).map(i => new Option(i.label, i.value)));
    return og;
  });
  $('problem').replaceChildren(...groups, new Option('Your own problem (see "Try your own problem" below)', 'custom'));
  $('problem').value = list.some(i => i.value === pick) ? pick : 'custom';
  const chosen = list.find(i => i.value === $('problem').value);
  $('eq').textContent = (chosen ? chosen.label : 'Your own problem') + (state.explore ? ' · showing one standing wave' : '');
  const solid = state.shape === 'sphere' || state.shape === 'cylinder';
  const withString = state.shape === 'sphere';
  $('view-pick').querySelector('span').textContent = solid ? 'Show the inside as' : 'Show it as';
  opt($('view'), VIEWS[state.shape], curView());
  renderVis();
  $('string-row').hidden = $('string-note').hidden = !withString;
  $('legend-note').textContent = withString && state.showString ? '· right: string v = r·u' : '';
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
  const showString = state.showString;
  mesh = buildMesh(state.shape, state.params, { showString, view: curView(), vis: state.vis });
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
  const g = compileIC(state.g, S.coords, p, sample);
  $('f-err').textContent = f.error || ''; $('g-err').textContent = g.error || '';
  // On a typo keep solving with the last valid formula (the error stays visible under the input).
  for (const [k, c] of [['f', f], ['g', g]]) {
    if (c.error) c.fn = good[k]; else good[k] = c.fn;
    if (c.fn) c.error = null; // solvable with the fallback; the message stays on screen
  }
  const radial = state.shape === 'sphere' && isRadial(f.fn ?? (() => 0), g.fn ?? (() => 0), p.c);
  lastRadial = radial; lastModal = false;
  const out = new Float32Array(mesh.coords.length);
  const steps = n => Array.from({ length: 24 }, (_, k) => (n * k) / 24);

  if (state.explore) {
    // A single pure mode φ cos(ωt): A = 1, B = 0, so nothing drifts and nothing is capped.
    const modes = [S.mode(p, state.bc, state.idx)], A = Float64Array.of(1), B = Float64Array.of(0);
    $('explore-info').textContent = `${modes[0].label}: ω = ${modes[0].omega.toFixed(4)}, period 2π/ω = ${((2 * Math.PI) / modes[0].omega).toFixed(4)}`;
    const basis = basisOn(modes, mesh.coords), period = findPeriod(modes, A, B), win = period ?? (2 * S.size(p)) / p.a;
    const refPts = refPoints(S), refBasis = basisOn(modes, refPts), refOut = new Float32Array(refPts.length);
    calibrate(t => (evaluate(basis, modes, A, B, t, out), out), steps(win),
      t => (evaluate(refBasis, modes, A, B, t, refOut), refOut));
    sol = { kind: 'wave', modes, A, B, basis, out, period, loop: period, window: period ?? 10 * win, rate: 1 };
    $('warn').textContent = '';
    $('period').textContent = period ? `Repeats exactly every ${period.toFixed(3)} time units.` : 'This standing wave has ω = 0: it does not move.';
    $('scrub').max = sol.window;
    return;
  }
  if (f.error || g.error) return;
  const spec = boundarySpec(p);
  $('bcv-err').textContent = spec.error || '';
  if (spec.error) return;
  let { N, capped } = clampN(S, state.N);
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
}

// Controls
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
$('view').addEventListener('change', e => { state.views[state.shape] = e.target.value; syncControls(); rebuild(true); });
$('show-string').addEventListener('change', e => { state.showString = e.target.checked; syncControls(); rebuild(true); });

// A book problem or demo, on any shape: start clean (that shape's defaults, 30 terms) and load it; the view stays.
$('problem').addEventListener('change', e => {
  if (e.target.value === 'custom') { $('own').open = true; return; }
  const [shape, id] = e.target.value.split(':'), S = SHAPES[shape];
  Object.assign(state, { explore: false, shape, params: { ...S.defaults }, bc: S.bcs[0].id, N: 30, idx: S.explorer.map(x => x.def) });
  good.f = good.g = null;
  $('shape').value = shape;
  loadPreset(PRESETS[shape].find(p => p.id === id));
  syncControls();
  rebuild(true);
});
// Camera buttons: Reset view (back to the starting viewpoint, undoing any pan) and Orbit on/off.
// The mouse/touch guide beside them (index.html) stays on screen.
document.querySelector('.camera').addEventListener('click', e => {
  const k = e.target.closest('button')?.dataset.cam;
  if (k === 'orbit') view.setOrbit(!view.orbit());
  if (k === 'reset') view.resetCamera();
});
view.onOrbit(on => $('orbit').setAttribute('aria-pressed', String(on)));

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
      state.t += dt * state.speed * sol.rate;
      if (sol.loop) state.t %= sol.loop;
    }
    if (sol.kind === 'full') evaluateFull(sol.full, state.t, sol.out);
    else evaluate(sol.basis, sol.modes, sol.A, sol.B, state.t, sol.out);
    mesh.apply(sol.out, state.gain);
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
