// Special functions for the series solutions. Pure, no DOM.

// J_m(x) for integer m via Bessel's integral (1/2π)∮cos(mτ − x sinτ)dτ.
// The integrand is periodic, so the trapezoid rule is spectrally accurate once K > |x| + m + ~30.
// ponytail: O(|x|+m) per call; callers cache per radius. Switch to Miller recurrence if it ever profiles hot.
export function besselJ(m, x) {
  if (x === 0) return m === 0 ? 1 : 0;
  if (m < 0) return (m % 2 ? -1 : 1) * besselJ(-m, x);
  const K = 2 * Math.ceil(Math.abs(x) + m + 40);
  let s = 0;
  for (let k = 0; k < K; k++) {
    const t = (2 * Math.PI * k) / K;
    s += Math.cos(m * t - x * Math.sin(t));
  }
  return s / K;
}

export const besselJp = (m, x) =>
  m === 0 ? -besselJ(1, x) : 0.5 * (besselJ(m - 1, x) - besselJ(m + 1, x));

// Spherical Bessel j_l(x): power series below x = l+1, closed form + upward recurrence above.
export function sphJ(l, x) {
  x = Math.abs(x);
  if (x < l + 1) {
    // j_l(x) = x^l Σ_k (−x²/2)^k / (k! (2l+2k+1)!!)
    let df = 1;
    for (let i = 3; i <= 2 * l + 1; i += 2) df *= i;
    let term = Math.pow(x, l) / df, sum = term;
    for (let k = 1; k < 60; k++) {
      term *= -(x * x) / (2 * k * (2 * l + 2 * k + 1));
      sum += term;
      if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
    }
    return sum;
  }
  let j0 = Math.sin(x) / x;
  if (l === 0) return j0;
  let j1 = Math.sin(x) / (x * x) - Math.cos(x) / x;
  for (let n = 1; n < l; n++) [j0, j1] = [j1, ((2 * n + 1) / x) * j1 - j0];
  return j1;
}

export function sphJp(l, x) {
  if (l === 0) return -sphJ(1, x);
  if (Math.abs(x) < 1e-8) return l === 1 ? 1 / 3 : 0;
  return sphJ(l - 1, x) - ((l + 1) / x) * sphJ(l, x);
}

// Associated Legendre P_l^m(x), no Condon–Shortley phase.
export function legendreP(l, m, x) {
  if (m > l) return 0;
  let pmm = 1;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  for (let i = 1; i <= m; i++) pmm *= (2 * i - 1) * s;
  if (l === m) return pmm;
  let p1 = x * (2 * m + 1) * pmm;
  for (let n = m + 2; n <= l; n++) [pmm, p1] = [p1, (x * (2 * n - 1) * p1 - (n + m - 1) * pmm) / (n - m)];
  return p1;
}

// First `count` positive roots of fn by scanning for sign changes, then bisection.
// Pass count = Infinity with `max` to get every root below max.
export function zeros(fn, count, { start = 1e-9, step = 0.05, includeZero = false, max = Infinity } = {}) {
  const out = includeZero ? [0] : [];
  let a = start, fa = fn(a);
  while (out.length < count && a < max) {
    const b = a + step, fb = fn(b);
    if (fa === 0) out.push(a);
    else if (fa * fb < 0) {
      let lo = a, hi = b, flo = fa;
      for (let i = 0; i < 60 && hi - lo > 1e-13; i++) {
        const mid = 0.5 * (lo + hi), fm = fn(mid);
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      out.push(0.5 * (lo + hi));
    }
    a = b; fa = fb;
  }
  return out;
}

// n-point Gauss–Legendre nodes/weights on [a,b].
export function gaussLegendre(n, a = -1, b = 1) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) [p0, p1] = [p1, ((2 * k - 1) * z * p1 - (k - 1) * p0) / k];
      pp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = 0.5 * (b - a) * z + 0.5 * (b + a);
    w[i] = (b - a) / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}
