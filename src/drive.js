// Boundary values, boundary slopes and forcing, solved exactly as in Zill 12.6: u = ψ + v.
// ψ carries the boundary data; v is the usual eigenfunction series with homogeneous boundary
// conditions, driven by G = F − ψ_tt + a²∇²ψ. No DOM.
import { project, basisOn, findPeriod } from './solve.js';
import { legendreP, gaussLegendre } from './special.js';

// Laplace's equation inside the sphere, disk or rectangle with boundary data h: the static part ψ for
// held boundaries. Returns terms (ω = 0) and their coefficients.
export function laplaceTerms(shapeId, p, h, N) {
  const modes = [], A = [];
  const add = (label, f, a) => { modes.push({ label, omega: 0, f }); A.push(a); };
  if (shapeId === 'sphere') {
    // Zill 13.3 Example 1: u = Σ A_n (r/c)^n P_n(cos θ), A_n = (2n+1)/2 ∫ h P_n(cos θ) sin θ dθ.
    const X = gaussLegendre(96, -1, 1), hv = Array.from(X.x, x => h([p.c, Math.acos(x), 0]));
    for (let n = 0; n < N; n++) {
      let s = 0;
      for (let i = 0; i < X.x.length; i++) s += X.w[i] * hv[i] * legendreP(n, 0, X.x[i]);
      add(`n=${n}`, c => (c[0] / p.c) ** n * legendreP(n, 0, Math.cos(c[1])), ((2 * n + 1) / 2) * s);
    }
  } else if (shapeId === 'disk') {
    // u = a_0 + Σ (r/c)^n (a_n cos nθ + b_n sin nθ).
    const M = 512, hv = Array.from({ length: M }, (_, j) => h([p.c, (2 * Math.PI * j) / M]));
    const coef = (fn, scale) => hv.reduce((s, v, j) => s + v * fn((2 * Math.PI * j) / M), 0) * (scale / M);
    add('n=0', () => 1, coef(() => 1, 1));
    for (let n = 1; modes.length < N; n++) {
      add(`n=${n} (cos)`, c => (c[0] / p.c) ** n * Math.cos(n * c[1]), coef(t => Math.cos(n * t), 2));
      if (modes.length < N) add(`n=${n} (sin)`, c => (c[0] / p.c) ** n * Math.sin(n * c[1]), coef(t => Math.sin(n * t), 2));
    }
  } else if (shapeId === 'rect') {
    // Zill 12.5: u = 0 on three edges, u = h(x) on y = Ly. u = Σ B_n sin(nπx/Lx) sinh(nπy/Lx)/sinh(nπLy/Lx).
    const X = gaussLegendre(128, 0, p.Lx), hv = Array.from(X.x, x => h([x, p.Ly]));
    for (let n = 1; n <= N; n++) {
      const q = (n * Math.PI) / p.Lx;
      let s = 0;
      for (let i = 0; i < X.x.length; i++) s += X.w[i] * hv[i] * Math.sin(q * X.x[i]);
      // sinh ratio written with exponentials so large n doesn't overflow.
      const ratio = y => Math.exp(q * (y - p.Ly)) * (1 - Math.exp(-2 * q * y)) / (1 - Math.exp(-2 * q * p.Ly));
      add(`n=${n}`, c => Math.sin(q * c[0]) * ratio(c[1]), (2 / p.Lx) * s);
    }
  }
  return { modes, A: Float64Array.from(A) };
}


const zero = () => 0;

// ---------- ψ for each shape ----------

// String: ψ = c0(t) + c1(t) x + c2(t) x². Left/right are values (fixed) or slopes u_x (free).
function stringPsi(p, bc, vals) {
  const L = p.L, at = (fn, t) => (fn ? fn([t]) : 0);
  const left = vals.left, right = vals.right;
  const coef = t => {
    const A = at(left, t), B = at(right, t);
    if (bc === 'free') return [0, A, (B - A) / (2 * L)]; // slopes S0 = A, SL = B
    if (bc === 'fixfree') return [A, B, 0];             // value A at 0, slope B at L
    return [A, (B - A) / L, 0];                          // values at both ends
  };
  return { coef, P: x => [1, x, x * x] };
}

// Sphere / drum / rectangle: a static ψ that solves Laplace's equation with the boundary data,
// plus κ t² when a boundary slope has nonzero average (the body accelerates).
function staticPsi(shape, p, bc, vals) {
  if (shape === 'sphere' && vals.surface) {
    if (bc === 'fixed') return fromTerms(laplaceTerms('sphere', p, vals.surface, 40));
    // ∂u/∂r = q(θ): q = Σ q_l P_l. l ≥ 1 → (c/l)(r/c)^l P_l; l = 0 → q0 r²/(2c) with κ = 3a² q0/(2c).
    const X = gaussLegendre(96, -1, 1), qv = Array.from(X.x, x => vals.surface([p.c, Math.acos(x), 0]));
    const ql = Array.from({ length: 30 }, (_, l) => ((2 * l + 1) / 2) * X.x.reduce((s, x, i) => s + X.w[i] * qv[i] * legendreP(l, 0, x), 0));
    const w = c => {
      let s = (ql[0] * c[0] * c[0]) / (2 * p.c);
      for (let l = 1; l < ql.length; l++) s += ql[l] * (p.c / l) * (c[0] / p.c) ** l * legendreP(l, 0, Math.cos(c[1]));
      return s;
    };
    return { w, kappa: (3 * p.a * p.a * ql[0]) / (2 * p.c) };
  }
  if (shape === 'disk' && vals.rim) {
    if (bc === 'fixed') return fromTerms(laplaceTerms('disk', p, vals.rim, 41));
    // ∂u/∂r = q(θ) = a0 + Σ a_n cos nθ + b_n sin nθ; mean part a0 r²/(2c) with κ = a² a0 / c.
    const M = 512, qv = Array.from({ length: M }, (_, j) => vals.rim([p.c, (2 * Math.PI * j) / M]));
    const four = (fn, s) => qv.reduce((acc, v, j) => acc + v * fn((2 * Math.PI * j) / M), 0) * (s / M);
    const a0 = four(() => 1, 1), K = 30;
    const an = Array.from({ length: K + 1 }, (_, n) => (n ? four(t => Math.cos(n * t), 2) : 0));
    const bn = Array.from({ length: K + 1 }, (_, n) => (n ? four(t => Math.sin(n * t), 2) : 0));
    const w = c => {
      let s = (a0 * c[0] * c[0]) / (2 * p.c);
      for (let n = 1; n <= K; n++) s += (p.c / n) * (c[0] / p.c) ** n * (an[n] * Math.cos(n * c[1]) + bn[n] * Math.sin(n * c[1]));
      return s;
    };
    return { w, kappa: (p.a * p.a * a0) / p.c };
  }
  if (shape === 'rect' && bc === 'fixed' && (vals.bottom || vals.top || vals.left || vals.right)) {
    return { w: rectDirichlet(p, vals, 60), kappa: 0 };
  }
  return null;
}

const fromTerms = ({ modes, A }) => ({ w: c => modes.reduce((s, m, k) => s + A[k] * m.f(c), 0), kappa: 0 });

// Laplace on the rectangle with u = h on each edge: one sinh series per edge (Zill 12.5), superposed.
function rectDirichlet(p, vals, N) {
  const { Lx, Ly } = p, terms = [];
  // sinh(q s)/sinh(q S) without overflow for large q.
  const ratio = (q, s, S) => Math.exp(q * (s - S)) * (1 - Math.exp(-2 * q * s)) / (1 - Math.exp(-2 * q * S));
  const edge = (fn, len, along, across, acrossLen, flip, point) => {
    if (!fn) return;
    const X = gaussLegendre(128, 0, len), hv = Array.from(X.x, s => fn(point(s)));
    for (let n = 1; n <= N; n++) {
      const q = (n * Math.PI) / len;
      const b = (2 / len) * X.x.reduce((acc, s, i) => acc + X.w[i] * hv[i] * Math.sin(q * s), 0);
      if (Math.abs(b) < 1e-14) continue;
      terms.push(c => b * Math.sin(q * c[along]) * ratio(q, flip ? acrossLen - c[across] : c[across], acrossLen));
    }
  };
  edge(vals.top, Lx, 0, 1, Ly, false, s => [s, Ly]);
  edge(vals.bottom, Lx, 0, 1, Ly, true, s => [s, 0]);
  edge(vals.right, Ly, 1, 0, Lx, false, s => [Lx, s]);
  edge(vals.left, Ly, 1, 0, Lx, true, s => [0, s]);
  return c => terms.reduce((s, fn) => s + fn(c), 0);
}

// ---------- modal time coefficients ----------

// T'' + ω²T = Q(t), T(0) = A, T'(0) = Bω (B as returned by project). Q is either a constant per mode
// (static data) or sampled on a time grid and treated as piecewise linear, integrated exactly.
function makeT(modes, A, B, Q) {
  const n = modes.length, out = new Float64Array(n);
  if (!Q || Q.static) {
    const q = Q?.static;
    return t => {
      for (let k = 0; k < n; k++) {
        const w = modes[k].omega, qk = q ? q[k] : 0;
        out[k] = w > 0
          ? qk / (w * w) + (A[k] - qk / (w * w)) * Math.cos(w * t) + B[k] * Math.sin(w * t)
          : A[k] + B[k] * t + 0.5 * qk * t * t;
      }
      return out;
    };
  }
  const { dt, rows } = Q, K = rows.length - 1;
  // Running integrals of cos(ωs)Q, sin(ωs)Q (ω > 0) or Q, sQ (ω = 0) up to each grid time.
  const lin = (k, j) => { const b = (rows[k + 1][j] - rows[k][j]) / dt; return [rows[k][j] - b * k * dt, b]; };
  const prim = (w, a, b, s) => (w > 0
    ? [(a + b * s) * Math.sin(w * s) / w + (b * Math.cos(w * s)) / (w * w), -(a + b * s) * Math.cos(w * s) / w + (b * Math.sin(w * s)) / (w * w)]
    : [a * s + (b * s * s) / 2, (a * s * s) / 2 + (b * s * s * s) / 3]);
  const I1 = Array.from({ length: K + 1 }, () => new Float64Array(n)), I2 = Array.from({ length: K + 1 }, () => new Float64Array(n));
  for (let k = 0; k < K; k++) for (let j = 0; j < n; j++) {
    const w = modes[j].omega, [a, b] = lin(k, j), u0 = prim(w, a, b, k * dt), u1 = prim(w, a, b, (k + 1) * dt);
    I1[k + 1][j] = I1[k][j] + u1[0] - u0[0];
    I2[k + 1][j] = I2[k][j] + u1[1] - u0[1];
  }
  return t => {
    t = Math.max(0, Math.min(t, K * dt));
    const k = Math.min(K - 1, Math.floor(t / dt));
    for (let j = 0; j < n; j++) {
      const w = modes[j].omega, [a, b] = lin(k, j), u0 = prim(w, a, b, k * dt), u1 = prim(w, a, b, t);
      const i1 = I1[k][j] + u1[0] - u0[0], i2 = I2[k][j] + u1[1] - u0[1];
      out[j] = w > 0
        ? A[j] * Math.cos(w * t) + B[j] * Math.sin(w * t) + (Math.sin(w * t) * i1 - Math.cos(w * t) * i2) / w
        : A[j] + B[j] * t + t * i1 - i2;
    }
    return out;
  };
}

// ---------- the full solve ----------

// spec: { values: { left/right | surface | rim | bottom/top/left/right: fn }, F: fn([x, t]) (string),
//         timed: true if any of them depend on t (string only) }. pts: where the caller will draw u.
export function solveFull(S, p, bc, f, g, spec = {}, N = 30, pts = [], opts = {}) {
  const vals = spec.values || {}, grid = S.quadGrid(p, { N, radial: !!opts.radial });
  const modes = S.modes(p, bc, N, { radial: !!opts.radial });
  const basis = basisOn(modes, pts);
  const hasVals = Object.values(vals).some(Boolean);

  if (S.id === 'string' && (hasVals || spec.F)) {
    const { coef, P } = stringPsi(p, bc, vals), F = spec.F || zero, a2 = p.a * p.a, h = 1e-3;
    const d1 = t => coef(t + h).map((v, i) => (v - coef(t - h)[i]) / (2 * h));
    const d2 = t => { const m = coef(t), pl = coef(t + h), mi = coef(t - h); return m.map((v, i) => (pl[i] - 2 * v + mi[i]) / (h * h)); };
    const psi = (c, k) => { const x = c[0], q = k; return q[0] + q[1] * x + q[2] * x * x; };
    const c0 = coef(0), v0 = d1(0);
    const r = project(modes, grid, c => f(c) - psi(c, c0), c => g(c) - psi(c, v0));
    const G = t => { const dd = spec.timed ? d2(t) : [0, 0, 0], cc = coef(t);
      return c => F([c[0], t]) - psi(c, dd) + 2 * a2 * cc[2]; };
    let Q, period = null, accel = false;
    if (spec.timed) {
      const window = opts.window ?? (12 * p.L) / p.a, K = opts.steps ?? 600, dt = window / K;
      const rows = Array.from({ length: K + 1 }, (_, k) => project(modes, grid, G(k * dt), zero).A);
      Q = { dt, rows };
    } else {
      Q = { static: project(modes, grid, G(0), zero).A };
      accel = modes.some((m, k) => m.omega === 0 && (Math.abs(Q.static[k]) > 1e-9 || Math.abs(r.B[k]) > 1e-9));
      if (!accel) period = findPeriod(modes, Float64Array.from(r.A, (a, k) => a - (modes[k].omega > 0 ? Q.static[k] / modes[k].omega ** 2 : 0)), r.B);
    }
    const layer = ps => ({ basis: basisOn(modes, ps), P: [0, 1, 2].map(i => Float32Array.from(ps, c => P(c[0])[i])) });
    const Pv = [0, 1, 2].map(i => Float32Array.from(pts, c => P(c[0])[i]));
    return { modes, A: r.A, B: r.B, basis, T: makeT(modes, r.A, r.B, Q), P: Pv, q: coef, period, timed: !!spec.timed, drift: accel,
      ref: opts.refPts ? layer(opts.refPts) : null,
      window: spec.timed ? Q.dt * (Q.rows.length - 1) : null, warnings: r.warnings };
  }

  const st = hasVals ? staticPsi(S.id, p, bc, vals) : null;
  const w = st?.w || zero, kappa = st?.kappa || 0;
  const r = project(modes, grid, c => f(c) - w(c), g);
  const drift = kappa !== 0 || modes.some((m, k) => m.omega === 0 && Math.abs(r.B[k]) > 1e-9);
  const Pof = ps => (st ? [Float32Array.from(ps, c => w(c)), new Float32Array(ps.length).fill(1)] : []);
  return {
    modes, A: r.A, B: r.B, basis, T: makeT(modes, r.A, r.B, null),
    P: Pof(pts), ref: opts.refPts ? { basis: basisOn(modes, opts.refPts), P: Pof(opts.refPts) } : null,
    q: t => [1, kappa * t * t],
    period: drift ? null : findPeriod(modes, r.A, r.B), drift, timed: false, window: null, warnings: r.warnings,
  };
}

// u(t) at the drawing points: Σ_j q_j(t) P_j + Σ_n T_n(t) φ_n, using the first nUse modes.
// `layer` defaults to the drawing points; pass sol.ref to evaluate at the reference points instead.
export function evaluateFull(sol, t, out, nUse = sol.modes.length, layer = sol) {
  out.fill(0);
  const q = sol.q(t);
  layer.P.forEach((Pj, j) => { const c = q[j]; if (c) for (let i = 0; i < out.length; i++) out[i] += c * Pj[i]; });
  const T = sol.T(t);
  for (let k = 0; k < nUse; k++) {
    const c = T[k];
    if (!c) continue;
    const b = layer.basis[k];
    for (let i = 0; i < out.length; i++) out[i] += c * b[i];
  }
}
