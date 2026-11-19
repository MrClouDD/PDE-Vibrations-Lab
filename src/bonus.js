// Bonus equations on the same eigenfunctions: heat (decaying modes) and Laplace (steady state). No DOM.
import { legendreP, gaussLegendre } from './special.js';

// Heat equation u_t = k∇²u. Each mode decays as exp(−k λ t), with λ = (ω/a)² the Laplacian eigenvalue.
export function evaluateHeat(basis, modes, A, k, a, t, out, offset = 0, nUse = modes.length) {
  out.fill(offset);
  for (let j = 0; j < nUse; j++) {
    if (Math.abs(A[j]) < 1e-12) continue;
    const lam = (modes[j].omega / a) ** 2, T = A[j] * Math.exp(-k * lam * t), b = basis[j];
    for (let i = 0; i < out.length; i++) out[i] += T * b[i];
  }
}

// Time for the slowest active mode to decay to 1%.
export function heatSettle(modes, A, k, a) {
  const max = Math.max(...Array.from(A, Math.abs));
  let lam = Infinity;
  modes.forEach((m, j) => { if (m.omega > 0 && Math.abs(A[j]) > 1e-8 * max) lam = Math.min(lam, (m.omega / a) ** 2); });
  return Number.isFinite(lam) ? Math.log(100) / (k * lam) : 0;
}

// Laplace's equation with boundary data h. Returns modes (ω = 0) and their coefficients;
// summing the first n terms shows the solution being built up term by term.
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
