// Turns typed initial-condition formulas into functions of a shape's coordinates. No DOM.
import { besselJ } from './special.js';

let registered = false;
function mathjs() {
  const m = globalThis.math;
  if (!m) throw new Error('math.js not loaded');
  if (!registered) {
    m.import({ besselj0: x => besselJ(0, x), besselj: (n, x) => besselJ(n, x) }, { override: true });
    registered = true;
  }
  return m;
}

// coordNames use θ for angles; users may also type theta or th.
export function compileIC(expr, coordNames, params, sample) {
  const names = coordNames.map(n => (n === 'θ' ? 'theta' : n));
  const src = String(expr).trim().replace(/θ/g, 'theta').replace(/\bth\b/g, 'theta');
  if (!src) return { error: 'Enter a formula, for example 0.' };
  let code;
  try { code = mathjs().compile(src); } catch (e) { return { error: `Can't read this formula: ${e.message}` }; }
  const scope = { ...params, pi: Math.PI, e: Math.E };
  const fn = c => {
    for (let i = 0; i < names.length; i++) scope[names[i]] = c[i] ?? 0;
    const v = code.evaluate(scope);
    return typeof v === 'boolean' ? +v : Number(v);
  };
  if (sample) {
    try { fn(sample); } catch (e) {
      return { error: `${e.message}. Use ${coordNames.join(', ')} and ${Object.keys(params).join(', ')}.` };
    }
  }
  return { fn };
}
