// Series machinery shared by every shape. A Mode is { label, omega, f(coords) }.

// Expansion coefficients by quadrature: A = <f,φ>/‖φ‖², B = <g,φ>/(ω‖φ‖²) (or <g,φ>/‖φ‖² when ω = 0).
export function project(modes, grid, f, g) {
  const n = grid.pts.length, warnings = [];
  const sample = (fn, name) => {
    const v = new Float64Array(n);
    let bad = false;
    for (let i = 0; i < n; i++) {
      let y;
      try { y = fn(grid.pts[i]); } catch { y = NaN; } // e.g. a typed formula using a variable this shape lacks
      if (Number.isFinite(y)) v[i] = y; else bad = true;
    }
    if (bad) warnings.push(`${name} is undefined at some points; treated as 0`);
    return v;
  };
  const fv = sample(f, 'f'), gv = sample(g, 'g');
  const A = new Float64Array(modes.length), B = new Float64Array(modes.length);
  modes.forEach((m, k) => {
    let nn = 0, af = 0, ag = 0;
    for (let i = 0; i < n; i++) {
      const phi = m.f(grid.pts[i]), wp = grid.w[i] * phi;
      nn += wp * phi; af += wp * fv[i]; ag += wp * gv[i];
    }
    A[k] = af / nn;
    B[k] = m.omega > 0 ? ag / (m.omega * nn) : ag / nn;
  });
  return { A, B, warnings };
}

export const basisOn = (modes, coordsList) =>
  modes.map(m => Float32Array.from(coordsList, c => m.f(c)));

// u = Σ_{k<nUse} φ_k (A cos ωt + B sin ωt), or φ_k (A + B t) for the ω = 0 rigid mode.
export function evaluate(basis, modes, A, B, t, out, nUse = modes.length) {
  out.fill(0);
  for (let k = 0; k < nUse; k++) {
    if (Math.abs(A[k]) + Math.abs(B[k]) < 1e-12) continue; // e.g. l>0 modes of a radial initial condition
    const w = modes[k].omega;
    const T = w > 0 ? A[k] * Math.cos(w * t) + B[k] * Math.sin(w * t) : A[k] + B[k] * t;
    if (T === 0) continue;
    const b = basis[k];
    for (let i = 0; i < out.length; i++) out[i] += T * b[i];
  }
}

// Exact period if every active frequency is an integer multiple of the lowest, else null.
export function findPeriod(modes, A, B, tol = 1e-6, nUse = modes.length) {
  let max = 0;
  for (let k = 0; k < nUse; k++) max = Math.max(max, Math.abs(A[k]) + Math.abs(B[k]));
  if (max === 0) return null;
  const active = [];
  for (let k = 0; k < nUse; k++) {
    if (Math.abs(A[k]) + Math.abs(B[k]) <= 1e-8 * max) continue;
    if (modes[k].omega === 0) {
      if (Math.abs(B[k]) > 1e-8 * max) return null; // rigid drift A + Bt never repeats
      continue; // a constant offset doesn't affect the period
    }
    active.push(modes[k].omega);
  }
  if (!active.length) return null;
  const w0 = Math.min(...active);
  for (const w of active) {
    const r = w / w0;
    if (Math.abs(r - Math.round(r)) > tol * r) return null;
  }
  return (2 * Math.PI) / w0;
}

export const clampN = (shape, N) => (N > shape.maxN ? { N: shape.maxN, capped: true } : { N, capped: false });
