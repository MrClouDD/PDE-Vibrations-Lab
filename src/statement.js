// The problem and its series solution as LaTeX, laid out the way Zill's worked examples are:
// (1) the PDE, (2) boundary conditions, (3) initial conditions, then u = Σ … with the Aₙ, Bₙ integrals.
// Pure: takes plain state, returns strings. Rendering (MathJax) happens in ui.js.

// Typed formula → TeX via math.js; anything it can't parse is shown verbatim.
export function toTex(expr) {
  const s = String(expr ?? '').trim() || '0';
  try {
    return globalThis.math.parse(s.replace(/θ/g, 'theta')).toTex({ parenthesis: 'auto', implicit: 'hide' })
      .replace(/\{ /g, '{').replace(/\\mathrm\{([A-Za-z])\}/g, '{$1}') // math.js pads braces and sets lone variables upright
      .replace(/\\mathrm\{besselj0\}/g, 'J_0').replace(/2\.404825557695773/g, 'x_1'); // J₀ and its first zero, as in Zill
  } catch {
    return `\\text{${s.replace(/[\\{}$&#^_%~]/g, ch => `\\${ch === '\\' ? 'backslash ' : ch}`)}}`;
  }
}

const COORD = {
  sphere: { x: 'r', all: 'r,\\theta', dom: '0<r<c' },
  string: { x: 'x', all: 'x', dom: '0<x<L' },
  rect: { x: 'x,y', all: 'x,y', dom: '0<x<L_x,\\ 0<y<L_y' },
  disk: { x: 'r,\\theta', all: 'r,\\theta', dom: '0<r<c' },
  cylinder: { x: 'r,z', all: 'r,z', dom: '0<r<c,\\ 0<z<L' },
};
const LAP = {
  sphere: 'u_{rr}+\\tfrac{2}{r}u_r+\\tfrac{1}{r^2}\\left(u_{\\theta\\theta}+\\cot\\theta\\,u_\\theta\\right)',
  string: 'u_{xx}',
  rect: 'u_{xx}+u_{yy}',
  disk: 'u_{rr}+\\tfrac{1}{r}u_r+\\tfrac{1}{r^2}u_{\\theta\\theta}',
  cylinder: 'u_{rr}+\\tfrac{1}{r}u_r+u_{zz}',
};
// #11's own form when nothing depends on θ.
const LAP_RADIAL = 'u_{rr}+\\tfrac{2}{r}u_r';

const val = v => (String(v ?? '').trim() ? toTex(v) : '0');

// Boundary lines per shape/BC, with any typed boundary values.
function boundary(shape, bc, bcv = {}, eqn = 'wave', us = 0, radial = false) {
  const T = eqn === 'laplace' ? '' : ',t';
  const th = radial ? '' : ',\\theta';
  if (eqn === 'heat') {
    const held = `${us}`;
    return {
      sphere: [bc === 'free' ? `u_r(c${th}${T})=0` : `u(c${th}${T})=${held}`],
      string: bc === 'fixed' ? [`u(0${T})=${held},\\quad u(L${T})=${held}`] : bc === 'free' ? [`u_x(0${T})=0,\\quad u_x(L${T})=0`] : [`u(0${T})=${held},\\quad u_x(L${T})=0`],
      disk: [bc === 'free' ? `u_r(c,\\theta${T})=0` : `u(c,\\theta${T})=${held}`],
      rect: [bc === 'fixed' ? `u=${held}\\text{ on all four edges}` : bc === 'free' ? '\\partial u/\\partial n=0\\text{ on all four edges}' : `u=${held}\\text{ on }x=0,L_x;\\ u_y=0\\text{ on }y=0,L_y`],
      cylinder: [cylBC(bc, held)],
    }[shape];
  }
  if (eqn === 'laplace') return {
    sphere: ['u(c,\\theta)=h(\\theta)'],
    disk: ['u(c,\\theta)=h(\\theta)'],
    rect: ['u(x,0)=0,\\quad u(0,y)=0,\\quad u(L_x,y)=0', 'u(x,L_y)=h(x)'],
  }[shape] ?? ['u=h\\text{ on the boundary}'];
  switch (shape) {
    case 'string': {
      const L = bc === 'free' ? 'u_x(0,t)' : 'u(0,t)', R = bc === 'fixed' ? 'u(L,t)' : 'u_x(L,t)';
      return [`${L}=${val(bcv.left)},\\quad ${R}=${val(bcv.right)}`];
    }
    case 'sphere': return [`${bc === 'free' ? 'u_r' : 'u'}(c${th},t)=${val(bcv.surface)}`];
    case 'disk': return [`${bc === 'free' ? 'u_r(c,\\theta,t)' : 'u(c,\\theta,t)'}=${val(bcv.rim)}`];
    case 'rect':
      if (bc === 'fixed') return [
        `u(x,0,t)=${val(bcv.bottom)},\\quad u(x,L_y,t)=${val(bcv.top)}`,
        `u(0,y,t)=${val(bcv.left)},\\quad u(L_x,y,t)=${val(bcv.right)}`,
      ];
      return bc === 'free' ? ['\\partial u/\\partial n=0\\text{ on all four edges}']
        : ['u(0,y,t)=u(L_x,y,t)=0,\\quad u_y(x,0,t)=u_y(x,L_y,t)=0'];
    default: return [cylBC(bc, '0')];
  }
}
function cylBC(bc, held) {
  const side = bc === 'sidefree' || bc === 'free' ? 'u_r(c,z,t)=0' : `u(c,z,t)=${held}`;
  const ends = bc === 'endsfree' || bc === 'free' ? 'u_z(r,0,t)=u_z(r,L,t)=0' : `u(r,0,t)=u(r,L,t)=${held}`;
  return `${side},\\quad ${ends}`;
}

// Eigenfunction φₙ, its frequency ωₙ, and its eigenvalue λₙ = (ωₙ/a)² (used by the heat series), per shape/BC.
function phi(shape, bc, radial) {
  switch (shape) {
    case 'string': return {
      fixed: ['\\sin\\frac{n\\pi x}{L}', '\\frac{n\\pi a}{L}', '(n\\pi/L)^2'],
      free: ['\\cos\\frac{n\\pi x}{L}', '\\frac{n\\pi a}{L}', '(n\\pi/L)^2'],
      fixfree: ['\\sin\\frac{(2n-1)\\pi x}{2L}', '\\frac{(2n-1)\\pi a}{2L}', '\\left(\\frac{(2n-1)\\pi}{2L}\\right)^2'],
    }[bc] ?? ['\\sin\\frac{n\\pi x}{L}', '\\frac{n\\pi a}{L}', '(n\\pi/L)^2'];
    case 'sphere':
      if (radial && bc === 'fixed') return ['\\frac{\\sin(n\\pi r/c)}{r}', '\\frac{n\\pi a}{c}', '(n\\pi/c)^2'];
      if (radial) return ['j_0(\\beta r)=\\frac{\\sin\\beta r}{\\beta r}', "a\\beta,\\ j_0'(\\beta c)=0", '\\beta^2'];
      return [`j_l(\\beta r)\\,P_l(\\cos\\theta)`, `a\\beta,\\ ${bc === 'free' ? "j_l'(\\beta c)" : 'j_l(\\beta c)'}=0`, '\\beta^2'];
    case 'disk': return [`J_m(\\beta r)\\,(\\cos m\\theta,\\ \\sin m\\theta)`, `a\\beta,\\ ${bc === 'free' ? "J_m'(\\beta c)" : 'J_m(\\beta c)'}=0`, '\\beta^2'];
    case 'rect': {
      const X = bc === 'free' ? '\\cos' : '\\sin', Y = bc === 'fixed' ? '\\sin' : '\\cos';
      return [`${X}\\frac{m\\pi x}{L_x}\\,${Y}\\frac{n\\pi y}{L_y}`, 'a\\pi\\sqrt{m^2/L_x^2+n^2/L_y^2}', '\\pi^2(m^2/L_x^2+n^2/L_y^2)'];
    }
    default: return ['J_m(\\beta r)\\cos m\\theta\\;Z(kz)', 'a\\sqrt{\\beta^2+k^2}', '\\beta^2+k^2'];
  }
}

function waveSeries(s) {
  const { shape, bc, radial } = s;
  const driven = Object.values(s.bcv || {}).some(v => String(v ?? '').trim() && String(v).trim() !== '0') || String(s.F ?? '').trim();
  const out = [];
  // One short formula per row so each fits the panel.
  if (driven) out.push('u=\\psi+v\\quad\\text{(Zill 12.6)}', '\\psi\\text{: matches the boundary data and forcing}');
  const w = driven ? 'v' : 'u';
  // Forcing, time-driven ends, or a net push: each mode obeys a forced oscillator, not plain cos/sin.
  if (s.modal) {
    const [f, om] = phi(shape, bc, radial);
    out.push(`${w}=\\sum_n T_n(t)\\,\\phi_n,\\quad \\phi_n=${f}`, `\\omega_n=${om}`);
    out.push("T_n''+\\omega_n^2T_n=G_n(t),\\quad T_n(0)=A_n,\\quad T_n'(0)=\\omega_nB_n");
    out.push('G_n:\\ \\text{the forcing projected on }\\phi_n');
    return out;
  }
  if (shape === 'string' && bc === 'fixed') {
    out.push(`${w}=\\sum_{n=1}^{\\infty}\\left(A_n\\cos\\tfrac{n\\pi a}{L}t+B_n\\sin\\tfrac{n\\pi a}{L}t\\right)\\sin\\tfrac{n\\pi}{L}x`);
    out.push('A_n=\\frac{2}{L}\\int_0^L f(x)\\sin\\frac{n\\pi}{L}x\\,dx');
    out.push('B_n=\\frac{2}{n\\pi a}\\int_0^L g(x)\\sin\\frac{n\\pi}{L}x\\,dx');
    return out;
  }
  if (shape === 'sphere' && radial && bc === 'fixed') {
    out.push(`${w}=\\sum_{n=1}^{\\infty}\\left(A_n\\cos\\tfrac{n\\pi a}{c}t+B_n\\sin\\tfrac{n\\pi a}{c}t\\right)\\frac{\\sin(n\\pi r/c)}{r}`);
    out.push('A_n=\\frac{2}{c}\\int_0^c r\\,f(r)\\sin\\frac{n\\pi r}{c}\\,dr');
    out.push('B_n=\\frac{2}{n\\pi a}\\int_0^c r\\,g(r)\\sin\\frac{n\\pi r}{c}\\,dr');
    out.push('v=ru:\\ \\ v_{tt}=a^2v_{rr},\\ \\ v(0,t)=v(c,t)=0');
    return out;
  }
  const [f, om] = phi(shape, bc, radial);
  out.push(`${w}=\\sum_n\\left(A_n\\cos\\omega_n t+B_n\\sin\\omega_n t\\right)\\phi_n`);
  out.push(`\\phi_n=${f}`, `\\omega_n=${om}`);
  out.push('A_n=\\frac{\\int f\\,\\phi_n\\,dV}{\\int \\phi_n^2\\,dV},\\quad B_n=\\frac{\\int g\\,\\phi_n\\,dV}{\\omega_n\\int \\phi_n^2\\,dV}');
  // All-free boundaries also allow ω = 0: the rigid term, which drifts if the average velocity isn't zero.
  if (bc === 'free') out.push('\\text{plus }(A_0+B_0t)\\,\\phi_0,\\quad \\phi_0=1', 'A_0=\\frac{\\int f\\,dV}{\\int dV},\\quad B_0=\\frac{\\int g\\,dV}{\\int dV}');
  return out;
}

export function statement(s) {
  const { eqn, shape, bc } = s;
  const C = COORD[shape];
  const radial = shape === 'sphere' && s.radial;
  if (eqn === 'laplace') {
    const pde = { sphere: `${LAP.sphere}=0`, disk: `${LAP.disk}=0`, rect: 'u_{xx}+u_{yy}=0' }[shape] ?? '\\nabla^2u=0';
    const series = {
      sphere: [
        'u(r,\\theta)=\\sum_{n=0}^{\\infty}A_n\\left(\\frac{r}{c}\\right)^{n}P_n(\\cos\\theta)',
        'A_n=\\frac{2n+1}{2}\\int_0^{\\pi}h(\\theta)P_n(\\cos\\theta)\\sin\\theta\\,d\\theta',
      ],
      disk: [
        'u(r,\\theta)=A_0+\\sum_{n=1}^{\\infty}\\left(\\frac{r}{c}\\right)^{n}(A_n\\cos n\\theta+B_n\\sin n\\theta)',
        'A_0=\\frac{1}{2\\pi}\\int_0^{2\\pi}h(\\theta)\\,d\\theta',
        'A_n=\\frac{1}{\\pi}\\int_0^{2\\pi}h(\\theta)\\cos n\\theta\\,d\\theta,\\quad B_n=\\frac{1}{\\pi}\\int_0^{2\\pi}h(\\theta)\\sin n\\theta\\,d\\theta',
      ],
      rect: [
        'u(x,y)=\\sum_{n=1}^{\\infty}A_n\\frac{\\sinh(n\\pi y/L_x)}{\\sinh(n\\pi L_y/L_x)}\\sin\\frac{n\\pi x}{L_x}',
        'A_n=\\frac{2}{L_x}\\int_0^{L_x}h(x)\\sin\\frac{n\\pi x}{L_x}\\,dx',
      ],
    }[shape] ?? [];
    return { pde: `${pde},\\quad ${C.dom}`, conds: [...boundary(shape, bc, {}, eqn), `h=${val(s.f)}`], series };
  }
  if (eqn === 'heat') {
    const [f, , lam] = phi(shape, bc, radial), us = s.us ? 'u_s+' : '', fu = s.us ? '(f-u_s)' : 'f';
    return {
      pde: `k\\left(${radial ? LAP_RADIAL : LAP[shape]}\\right)=u_t,\\quad ${C.dom},\\ t>0`,
      conds: [...boundary(shape, bc, {}, eqn, s.us ?? 0, radial), `u(${C.x},0)=${val(s.f)}`],
      series: [
        `u=${us}\\sum_n A_n e^{-k\\lambda_n t}\\phi_n`,
        `\\phi_n=${f},\\quad \\lambda_n=${lam}`,
        `A_n=\\frac{\\int ${fu}\\,\\phi_n\\,dV}{\\int\\phi_n^2\\,dV}`,
      ],
    };
  }
  const F = String(s.F ?? '').trim() && shape === 'string' ? `+${toTex(s.F)}` : '';
  return {
    pde: `a^2\\left(${radial ? LAP_RADIAL : LAP[shape]}\\right)${F}=u_{tt},\\quad ${C.dom},\\ t>0`,
    conds: [...boundary(shape, bc, s.bcv, eqn, 0, radial), `u(${C.x},0)=${val(s.f)},\\quad \\left.\\frac{\\partial u}{\\partial t}\\right|_{t=0}=${val(s.g)}`],
    series: waveSeries({ ...s, radial }),
  };
}

// The solver's sphere modes are j₀(βr) = sin(βr)/(βr); the formula shown uses sin(nπr/c)/r, so A and B
// are divided by β = ω/a to match. Every other formula shown already uses the solver's φₙ.
export function bookCoefs(s, modes, A, B) {
  if (!(s.shape === 'sphere' && s.radial && s.bc === 'fixed') || s.eqn === 'laplace' || !modes) return { A, B };
  const k = modes.map(m => (m.omega > 0 ? s.a / m.omega : 1));
  return { A: Array.from(A, (v, i) => v * k[i]), B: B && Array.from(B, (v, i) => v * k[i]) };
}

const num = v => (Math.abs(v) < 1e-12 ? '0' : String(+v.toPrecision(3)).replace(/e([+-]\d+)/, (_, e) => `\\times10^{${+e}}`));
// First k coefficients in order of frequency; B_n = 0 when the motion starts from rest.
// labels (the solver's mode labels, e.g. "m=2, n=1 (sin)") give each value its index; trigAsB names the
// sin terms B (Laplace on the disk), otherwise they carry a cos/sin superscript.
export function coefTex(A, B, k = 4, { labels = null, trigAsB = false } = {}) {
  const name = (base, i) => {
    const lab = labels?.[i];
    if (!lab) return `${base}_{${i + 1}}`;
    const trig = lab.match(/\((sin|cos)\)/)?.[1], idx = lab.replace(/\((sin|cos)\)/, '').replace(/[A-Za-z]+=/g, '').replace(/\s/g, '');
    if (trigAsB) return `${trig === 'sin' ? 'B' : base}_{${idx}}`;
    return `${base}_{${idx}}${trig ? `^{\\${trig}}` : ''}`;
  };
  const list = (C, base) => Array.from(C).slice(0, k).map((v, i) => `${name(base, i)}=${num(v)}`).join(',\\ ') + (C.length > k ? ',\\ \\dots' : '');
  if (B === null) return list(A, 'A'); // heat: no B's
  const zeroB = !B || Array.from(B).every(v => Math.abs(v) < 1e-12);
  return `${list(A, 'A')}${zeroB ? ';\\quad B_{n}=0' : `;\\quad ${list(B, 'B')}`}`;
}
