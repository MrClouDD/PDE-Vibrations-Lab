// Initial conditions per shape, as math.js formulas in the shape's coordinate names.
export const PRESETS = {
  sphere: [
    { id: 'book11', label: 'Zill 13.3 #11: f = 1 − r/c, g = 0', f: '1 - r/c', g: '0' },
    { id: 'ring', label: 'Ripple ring: thin pulse at r = 0.6c', f: 'exp(-150*(r/c - 0.6)^2)', g: '0', N: 80 },
    { id: 'stone', label: 'Stone drop: sharp kick at the center', f: '0', g: 'exp(-120*(r/c)^2)', N: 80 },
    { id: 'tilt', label: 'Tilted pluck (not radial)', f: '(1 - r/c)*cos(θ)', g: '0' },
    { id: 'heldcos', label: 'Surface held at u = cos θ, starts flat', f: '0', g: '0', bc: 'fixed', bcv: { surface: 'cos(θ)' } },
  ],
  disk: [
    { id: 'pluck', label: 'Off-center pluck', f: 'max(0, 1 - sqrt(r^2 + 0.16*c^2 - 0.8*c*r*cos(θ))/(0.6*c))', g: '0' },
    { id: 'book8', label: 'Zill Ch. 13 Review #8: f = J₀(x₁r/c)', f: 'besselj0(2.404825557695773*r/c)', g: '0' },
    { id: 'strike', label: 'Drumstick strike', f: '0', g: 'exp(-60*(r^2 + 0.09*c^2 - 0.6*c*r*cos(θ))/c^2)' },
    { id: 'heldsin', label: 'Rim held at u = sin 2θ, starts flat', f: '0', g: '0', bc: 'fixed', bcv: { rim: 'sin(2*θ)' } },
  ],
  rect: [
    { id: 'pluck', label: 'Off-center pluck', f: 'max(0, 1 - sqrt((x - 0.35*Lx)^2 + (y - 0.4*Ly)^2)/(0.3*Ly))', g: '0' },
    { id: 'mode12', label: 'Pure (1, 2) mode', f: 'sin(pi*x/Lx)*sin(2*pi*y/Ly)', g: '0' },
    { id: 'strike', label: 'Strike near a corner', f: '0', g: 'exp(-80*((x - 0.25*Lx)^2 + (y - 0.3*Ly)^2))' },
  ],
  cylinder: [
    { id: 'pulse', label: 'Pulse at the center', f: 'exp(-25*((r/c)^2 + (z/L - 0.5)^2))', g: '0' },
    { id: 'ring', label: 'Ripple ring: thin pulse at r = 0.6c', f: 'exp(-150*(r/c - 0.6)^2)', g: '0', N: 120 },
  ],
  string: [
    { id: 'pluck', label: 'Pluck at 30%', f: 'x < 0.3*L ? x/(0.3*L) : (L - x)/(0.7*L)', g: '0' },
    { id: 'drive', label: 'Zill 12.6 #15: end driven, u(L, t) = sin t', f: '0', g: '0', bc: 'fixed', bcv: { right: 'sin(t)' } },
    { id: 'gravity', label: 'Zill 12.6 #10: falling under its own weight (g = 1)', f: '0', g: '0', bc: 'fixed', F: '-1' },
    { id: 'rev6', label: 'Zill Ch. 12 Review #6: forced by x², left end held at 1, f = (1 − x)²', f: '(1 - x/L)^2', g: '0', bc: 'fixed', bcv: { left: '1' }, F: 'x^2' },
    { id: 'pull', label: 'Zill 12.7 #6: bar pulled at its free end, u_x(L) = F₀/E = 0.5', f: '0', g: '0', bc: 'fixfree', bcv: { right: '0.5' } },
    { id: 'ax', label: 'Zill 12.6 #9: forcing A x (A = 1)', f: '0', g: '0', bc: 'fixed', F: 'x' },
    { id: 'p20', label: 'Zill 12.6 #20: forcing sin x cos t on 0 < x < π', f: '0', g: '0', bc: 'fixed', F: 'sin(x)*cos(t)', params: { L: Math.PI } },
    { id: 'strike', label: 'Strike (hammer)', f: '0', g: 'exp(-200*(x/L - 0.3)^2)' },
  ],
};

// Heat (bonus): f is the initial temperature, us the temperature held on a fixed boundary.
// Shapes without an entry reuse their wave presets as temperatures with us = 0.
export const HEAT_PRESETS = {
  sphere: [
    { id: 'book9', label: 'Zill 13.3 #9: surface held at 100, starts at 0', f: '0', us: 100 },
    { id: 'hot', label: 'Hot center, surface at 0', f: '100*exp(-20*(r/c)^2)', us: 0 },
  ],
};

// Laplace (bonus): h is the boundary data.
export const LAPLACE_PRESETS = {
  sphere: [
    { id: 'book1', label: 'Zill 13.3 #1: 50 on the top half, 0 below', h: 'θ < pi/2 ? 50 : 0' },
    { id: 'book3', label: 'Zill 13.3 #3: h = cos θ', h: 'cos(θ)' },
    { id: 'rev11', label: 'Zill Ch. 13 Review #11: 100 top, −100 bottom', h: 'θ < pi/2 ? 100 : -100' },
  ],
  disk: [
    { id: 'rev1', label: 'Zill Ch. 13 Review #1: u₀ top half, −u₀ bottom', h: 'θ < pi ? 1 : -1' },
    { id: 'rev2', label: 'Zill Ch. 13 Review #2: 1 on the right half', h: 'θ < pi/2 or θ > 3*pi/2 ? 1 : 0' },
  ],
  rect: [
    { id: 'sine', label: 'h = sin(πx/Lx)', h: 'sin(pi*x/Lx)' },
    { id: 'tent', label: 'h = x(Lx − x)', h: 'x*(Lx - x)' },
  ],
};

// One picker for the page: the book's problems first (any shape), then the demos grouped by shape.
// Values are `shape:presetId`. Book problems are the presets whose label starts with "Zill".
const SHAPE_NAME = { sphere: 'Solid sphere', string: 'String', disk: 'Drum', rect: 'Rectangular membrane', cylinder: 'Solid cylinder' };
export function problemList() {
  const items = Object.entries(PRESETS).flatMap(([shape, ps]) => ps.map(p => ({ shape, p })));
  const book = items.filter(i => i.p.label.startsWith('Zill'));
  const demos = items.filter(i => !i.p.label.startsWith('Zill'));
  return [
    ...book.map(({ shape, p }) => ({ group: 'From the book', value: `${shape}:${p.id}`, label: p.label })),
    ...demos.map(({ shape, p }) => ({ group: `Demos: ${SHAPE_NAME[shape]}`, value: `${shape}:${p.id}`, label: p.label })),
  ];
}
