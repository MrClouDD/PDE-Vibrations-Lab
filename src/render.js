// Three.js scene and one mesh builder per shape. Each mesh exposes the shape coordinates of its
// data vertices (`coords`), so the solver can precompute basis values there.
// Full URLs, no import map: the page host injects scripts first, and browsers ignore a late import map.
// OrbitControls' +esm build imports this same three URL, so both share one module instance.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js/+esm';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // ponytail: 2x DPR quadrupled fill cost for little visible gain
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  // Soft studio reflections for the glossy surfaces.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  // Slow orbit until the viewer grabs the scene.
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  let grabbed = false;
  const orbitListeners = [];
  const setOrbit = on => { controls.autoRotate = on; orbitListeners.forEach(fn => fn(on)); };
  controls.addEventListener('start', () => { grabbed = true; if (controls.autoRotate) setOrbit(false); });
  // Where the last refit put the camera, for the Reset button.
  const fit = { center: new THREE.Vector3(), dist: 1, dir: new THREE.Vector3(1, 0.8, 1).normalize() };
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // soft shadow on a plain floor; 2048 cost 4x for no visible difference
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  // Floor: a faint grid plus a plane that only shows the soft shadow.
  const floor = new THREE.Group();
  const grid = new THREE.GridHelper(1, 24);
  grid.material.transparent = true; grid.material.opacity = 0.22;
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  floor.add(shadowPlane, grid);
  scene.add(floor);
  let current = null, dirty = true; // dirty: something changed that the next frame must draw

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  const theme = () => {
    scene.background = new THREE.Color(css('--stage'));
    grid.material.color = new THREE.Color(css('--muted'));
    dirty = true;
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  theme();

  return {
    controls,
    grabbed: () => grabbed,
    setObject(obj, refit, dir = [1, 0.8, 1]) {
      if (current) { scene.remove(current); dispose(current); }
      scene.add((current = obj));
      dirty = true;
      const box = new THREE.Box3().setFromObject(obj), s = box.getBoundingSphere(new THREE.Sphere());
      // Floor sits below the body with room for downward motion; light and shadow box follow the body's size.
      floor.position.set(s.center.x, box.min.y - 0.5 * s.radius, s.center.z);
      floor.scale.setScalar(5 * s.radius);
      sun.target.position.copy(s.center);
      sun.position.copy(s.center).add(new THREE.Vector3(0.8, 2.2, 0.6).multiplyScalar(2 * s.radius));
      Object.assign(sun.shadow.camera, { left: -2 * s.radius, right: 2 * s.radius, top: 2 * s.radius, bottom: -2 * s.radius, near: 0.01, far: 8 * s.radius });
      sun.shadow.camera.updateProjectionMatrix();
      if (!refit) return;
      const vf = (camera.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * camera.aspect);
      const dist = (s.radius * 1.12) / Math.sin(Math.min(vf, hf));
      fit.center.copy(s.center); fit.dist = dist; fit.dir.set(...dir).normalize();
      controls.target.copy(s.center);
      camera.position.copy(s.center).add(fit.dir.clone().multiplyScalar(dist));
    },
    // Reset view button: back to the starting viewpoint (also undoes any pan).
    resetCamera() {
      controls.target.copy(fit.center);
      camera.position.copy(fit.center).add(fit.dir.clone().multiplyScalar(fit.dist));
      dirty = true;
    },
    orbit: () => controls.autoRotate,
    setOrbit,
    onOrbit: fn => orbitListeners.push(fn),
    // Draws only when the scene changed (force), the camera moved (drag, damping, auto-orbit) or the view resized,
    // so a paused, untouched page costs nothing.
    frame(force) {
      if (controls.update() || force || dirty) { renderer.render(scene, camera); dirty = false; }
    },
  };
}

function dispose(obj) {
  obj.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
}

// Diverging map: negative blue, zero pale neutral, positive red. v in [-1, 1].
const NEG = [0.1, 0.36, 0.78], MID = [0.66, 0.71, 0.76], POS = [0.86, 0.22, 0.14];
function cmap(v, out, o) {
  v = Math.max(-1, Math.min(1, v));
  v = Math.sign(v) * Math.pow(Math.abs(v), 0.6); // lift small values so mid-range u is visible
  const end = v < 0 ? NEG : POS, a = Math.abs(v);
  // Vertex colors are linear in three.js; convert from sRGB so on-screen colors match the legend.
  for (let k = 0; k < 3; k++) out[o + k] = Math.pow(MID[k] + (end[k] - MID[k]) * a, 2.2);
}

// Glossy, lightly clear-coated surface; color comes from u through the vertex colors.
// Soft clip for displacement: values beyond the calibrated scale (e.g. the 1/r focusing spike at a
// sphere's center) still rise, but saturate instead of flattening everything else.
const soft = (v, m) => 1.6 * m * Math.tanh(v / (1.6 * m));

const surfaceMat = (opts = {}) =>
  new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.32, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.3, ...opts,
  });

// A (nu+1)×(nv+1) vertex grid. place(coords, value, scale) → [x,y,z]; static parts never move, only recolor.
function gridPart({ nu, nv, coordAt, place, material, group = 'u', amp = 0, isStatic = false, value = (u) => u }) {
  const coords = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) coords.push(coordAt(i, j));
  const n = coords.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  coords.forEach((c, k) => pos.set(place(c, 0, 0), k * 3));
  const idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = !material.transparent;
  return {
    object3D: mesh, coords, group, amp, value,
    update(u, off, s, vmax) {
      for (let k = 0; k < n; k++) {
        const v = value(u[off + k], coords[k]);
        if (!isStatic) pos.set(place(coords[k], soft(v, vmax), s), k * 3);
        cmap(v / vmax, col, k * 3);
      }
      geo.attributes.color.needsUpdate = true;
      if (!isStatic) { geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); }
    },
  };
}

// A tube through n samples; each ring is shifted by place(coords, value) − place(coords, 0).
function tubePart({ n, coordAt, place, radius, group = 'u', amp, value = (u) => u }) {
  const coords = Array.from({ length: n }, (_, i) => coordAt(i));
  const p0 = new THREE.Vector3(...place(coords[0], 0, 0)), p1 = new THREE.Vector3(...place(coords[n - 1], 0, 0));
  const R = 10;
  const geo = new THREE.TubeGeometry(new THREE.LineCurve3(p0, p1), n - 1, radius, R, false);
  const pos = geo.attributes.position.array, base = Float32Array.from(pos);
  const col = new Float32Array(pos.length);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, surfaceMat());
  mesh.castShadow = true;
  return {
    object3D: mesh, coords, group, amp, value,
    update(u, off, s, vmax) {
      for (let i = 0; i < n; i++) {
        const v = value(u[off + i], coords[i]);
        const a = place(coords[i], soft(v, vmax), s), b = place(coords[i], 0, 0);
        for (let j = 0; j <= R; j++) {
          const k = (i * (R + 1) + j) * 3;
          pos[k] = base[k] + a[0] - b[0]; pos[k + 1] = base[k + 1] + a[1] - b[1]; pos[k + 2] = base[k + 2] + a[2] - b[2];
          cmap(v / vmax, col, k);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

function lines(points, color, opacity = 0.5) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

const sph = (r, th, ph) => [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)];


// Companion string v = r*u (the hint's substitution), laid along R (the default view's screen-right).
function companionString(c, R, parts, extras, ink) {
  const x0 = 1.35 * c, n = 160;
  const at = (d, y) => [R[0] * (x0 + d), y, R[2] * (x0 + d)];
  parts.push(tubePart({
    n, radius: 0.012 * c, group: 'v', amp: 0.3 * c, value: (u, k) => k[0] * u,
    coordAt: i => [(c * i) / (n - 1), Math.PI / 2, Math.PI],
    place: (k, v, s) => at(k[0], s * v),
  }));
  extras.push(lines([at(0, 0), at(c, 0)], ink, 0.4));
}

// Glass ball: a slice through the middle, drawn with u as height off the slice, inside the clear solid.
// vis.axis / vis.angle tilt the slice: it starts horizontal and turns about the x, y or z axis.
function pondParts(p, opts, isCyl) {
  const c = p.c, L = isCyl ? p.L : 0, vis = opts.vis || {}, NR = 90, NA = 160, ink = new THREE.Color(css('--muted'));
  const ang = ((vis.angle ?? 0) * Math.PI) / 180, axis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[vis.axis || 'x'];
  const R = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...axis), ang);
  const rot = v => new THREE.Vector3(...v).applyMatrix4(R).toArray();
  const e1 = rot([1, 0, 0]), e2 = rot([0, 0, -1]), n = rot([0, 1, 0]);
  // A tilted slice of the cylinder must stay inside it: radius min(c, L/2) once it leaves the horizontal.
  const rho = isCyl && Math.abs(n[1]) < 0.999 ? Math.min(c, L / 2) : c;
  const toShape = q => {
    if (isCyl) return [Math.hypot(q[0], q[2]), Math.atan2(q[2], q[0]), q[1] + L / 2];
    const r = Math.hypot(...q);
    return [r, r ? Math.acos(Math.max(-1, Math.min(1, q[1] / r))) : 0, Math.atan2(q[2], q[0])];
  };
  const toWorld = k => (isCyl ? cyl(k[0], k[1], k[2], L) : sph(k[0], k[1], k[2]));
  const parts = [gridPart({
    nu: NR, nv: NA, amp: 0.5 * c, material: surfaceMat(),
    coordAt: (i, j) => {
      const r = (rho * i) / NR, a = (2 * Math.PI * j) / NA;
      return toShape([0, 1, 2].map(d => r * (Math.cos(a) * e1[d] + Math.sin(a) * e2[d])));
    },
    place: (k, v, s) => { const q = toWorld(k); return [q[0] + s * v * n[0], q[1] + s * v * n[1], q[2] + s * v * n[2]]; },
  })];
  const rim = [], at = a => [0, 1, 2].map(d => rho * (Math.cos(a) * e1[d] + Math.sin(a) * e2[d]));
  for (let j = 0; j < NA; j++) rim.push(at((2 * Math.PI * j) / NA), at((2 * Math.PI * (j + 1)) / NA));
  const extras = [lines(rim, ink, 0.6)];
  if (!isCyl && opts.showString) companionString(c, [0.77, 0, -0.64], parts, extras, ink);
  extras.push(glassShell(isCyl ? new THREE.CylinderGeometry(1.02 * c, 1.02 * c, L, 96, 1) : new THREE.SphereGeometry(1.02 * c, 96, 64)));
  return { parts, extras, dir: [1, 0.62, 1.2] };
}


// Crisp, opaque round dots (wave spheres), sized in world units and a little larger and brighter where
// |u| is large; each dot reads separately instead of glows adding up.
const DOT_VERT = `
  attribute float glow; attribute vec3 color; varying vec3 vColor; varying float vGlow;
  uniform float scale; uniform float base; uniform float grow;
  void main() {
    vColor = color; vGlow = glow;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (base + grow * glow) * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const DOT_FRAG = `
  varying vec3 vColor; varying float vGlow;
  void main() {
    vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    gl_FragColor = vec4(pow(vColor, vec3(1.0 / 2.2)) * (0.75 + 0.5 * vGlow) * (1.0 - 1.2 * r2), 1.0);
  }`;

// minGlow keeps quiet points visible; dots are `base` + `grow`·glow world units across.
function pointsPart({ coords, place, amp, group = 'cloud', minGlow = 0, base = 0.03, grow = 0.1 }) {
  const n = coords.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n);
  coords.forEach((c, k) => pos.set(place(c, 0, 0), k * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: DOT_VERT, fragmentShader: DOT_FRAG,
    uniforms: { scale: { value: 900 * (devicePixelRatio || 1) }, base: { value: base }, grow: { value: grow } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return {
    object3D: pts, coords, group, amp, value: u => u,
    update(u, off, s, vmax) {
      for (let k = 0; k < n; k++) {
        const v = u[off + k], a = Math.min(1, Math.abs(v) / vmax);
        pos.set(place(coords[k], soft(v, vmax), s), k * 3);
        cmap(v / vmax, col, k * 3);
        glow[k] = Math.max(minGlow, Math.pow(a, 0.8)); // quiet points stay small and faint (down to minGlow)
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.glow.needsUpdate = true;
    },
  };
}



// Glass shell: a clear, glossy body plus a Fresnel rim glow, so the solid reads as one object
// while the waves glow inside it.
const RIM_VERT = `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const RIM_FRAG = `
  varying vec3 vN; varying vec3 vV; uniform vec3 tint; uniform float strength;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
    gl_FragColor = vec4(tint * f * strength, f * strength);
  }`;

function glassShell(geo) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0xdfeaf2, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.2,
  }));
  body.castShadow = true;
  const dark = new THREE.Color(css('--stage')).getHSL({}).l < 0.5;
  const rim = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, transparent: true, depthWrite: false,
    blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { tint: { value: new THREE.Color(dark ? 0x9fd4ff : 0x5a7fa0) }, strength: { value: dark ? 0.9 : 0.6 } },
  }));
  body.renderOrder = rim.renderOrder = 2; // draw after the glowing points inside
  g.add(body, rim);
  return g;
}

// Arrows anchored at fixed grid points (one instanced mesh): tail at the point, shaft then head, growing
// along `dir(k)` when u > 0 and the opposite way when u < 0, length |u|, colored by u — a quiver plot.
function arrowPart({ coords, place, dir, amp, group = 'arrows' }) {
  // Unit arrow from y = 0 (tail) to y = 1 (tip): shaft 0–0.62, head 0.62–1.
  const cone = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8).translate(0, 0.31, 0),
    new THREE.ConeGeometry(0.24, 0.38, 12).translate(0, 0.81, 0),
  ]);
  const n = coords.length;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
  const mesh = new THREE.InstancedMesh(cone, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const base = coords.map(k => new THREE.Vector3(...place(k))), dirs = coords.map(k => new THREE.Vector3(...dir(k)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), rgb = [0, 0, 0];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < n; k++) { mesh.setMatrixAt(k, zero); mesh.setColorAt(k, col.setRGB(...MID)); }
  return {
    object3D: mesh, coords, group, amp, value: u => u,
    update(u, off, s, vmax) {
      for (let k = 0; k < n; k++) {
        const v = u[off + k], len = Math.min(amp * 1.4, s * Math.abs(soft(v, vmax)));
        if (!(len > 1e-4 * amp) || !dirs[k].lengthSq()) { mesh.setMatrixAt(k, zero); continue; }
        d.copy(dirs[k]).multiplyScalar(Math.sign(v));
        q.setFromUnitVectors(up, d);
        m.compose(base[k], q, sc.set(len, len, len));
        mesh.setMatrixAt(k, m);
        cmap(v / vmax, rgb, 0);
        mesh.setColorAt(k, col.setRGB(rgb[0], rgb[1], rgb[2]));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// Arrow field (default for solids): a regular grid filling the body; at each point an arrow along the
// radius (cylinder: away from the axis), outward for u > 0, inward for u < 0, length |u|. A fixed wall
// shows no arrows because u = 0 there. The scalar u is drawn along the radius — a picture of u.
function latticeParts(p, opts, isCyl) {
  // vis.arrowN: grid steps per radius (arrow spacing); vis.arrowSize: arrow length scale; vis.corner: cut a corner open.
  const vis = opts.vis || {}, c = p.c, L = isCyl ? p.L : 0, h = c / (vis.arrowN ?? 7.5), coords = [], corner = vis.corner ?? true;
  const span = isCyl ? Math.max(c, L / 2) : c;
  for (let x = -span; x <= span + 1e-9; x += h) for (let y = -span; y <= span + 1e-9; y += h) for (let z = -span; z <= span + 1e-9; z += h) {
    // Optionally leave out the octant facing the starting camera so the center is in view (the glass stays whole).
    if (corner && x > 1e-9 && y > 1e-9 && z > 1e-9) continue;
    if (isCyl) {
      const r = Math.hypot(x, z);
      if (r <= c * 0.999 && Math.abs(y) <= L / 2) coords.push([r, Math.atan2(z, x), y + L / 2]);
    } else {
      const r = Math.hypot(x, y, z);
      if (r <= c * 0.999) coords.push([r, r ? Math.acos(y / r) : 0, Math.atan2(z, x)]);
    }
  }
  const place = isCyl ? k => cyl(k[0], k[1], k[2], L) : k => sph(k[0], k[1], k[2]);
  // Outward unit vector (cylinder: away from the axis); the center point has none and is never drawn.
  const dir = isCyl ? k => (k[0] ? [Math.cos(k[1]), 0, Math.sin(k[1])] : [0, 0, 0]) : k => (k[0] ? sph(1, k[1], k[2]) : [0, 0, 0]);
  // Full-size arrow ~0.8 grid steps long at size 1, so neighbors don't overlap.
  const parts = [arrowPart({ coords, place, dir, amp: 0.8 * h * (vis.arrowSize ?? 1), group: 'lattice' })];
  const extras = [glassShell(isCyl ? new THREE.CylinderGeometry(1.04 * c, 1.04 * c, 1.02 * L, 96, 1) : new THREE.SphereGeometry(1.04 * c, 96, 64))];
  if (!isCyl && opts.showString) companionString(c, [0.77, 0, -0.64], parts, extras, new THREE.Color(css('--muted')));
  return { parts, extras, dir: [1, 0.5, 1.2] };
}


// Wave spheres (after "3D wave spheres" dot-art): nested spheres of glowing dots on latitude rings
// (cylinder: nested tubes), each dot pushed along the radius by u and colored/glowing by u. The dots
// are see-through, so every shell's ripple shows at once without cutting anything away.
function waveSphereParts(p, opts, isCyl) {
  // vis.shells: how many nested shells; vis.rings: latitude rings on the outermost shell (inner shells
  // get proportionally fewer, keeping the dot spacing even); vis.dot: dot size scale.
  const vis = opts.vis || {}, c = p.c, L = isCyl ? p.L : 0, coords = [], nS = vis.shells ?? 6, R = vis.rings ?? 28;
  for (let k = 1; k <= nS; k++) {
    const f = (0.9 * k) / nS, r = f * c, rings = Math.max(4, Math.round((R * f) / 0.9)), step = (Math.PI * r) / rings;
    if (isCyl) {
      const nz = Math.round(L / step), na = Math.round((2 * Math.PI * r) / step);
      for (let i = 0; i <= nz; i++) for (let j = 0; j < na; j++) coords.push([r, (2 * Math.PI * j) / na, (L * i) / nz]);
    } else {
      for (let i = 1; i < rings; i++) {
        const th = (Math.PI * i) / rings, na = Math.max(3, Math.round((2 * Math.PI * r * Math.sin(th)) / step));
        for (let j = 0; j < na; j++) coords.push([r, th, (2 * Math.PI * (j + 0.5 * (i % 2))) / na]);
      }
    }
  }
  const place = isCyl ? (k, v, s) => cyl(k[0] + s * v, k[1], k[2], L) : (k, v, s) => sph(k[0] + s * v, k[1], k[2]);
  const d = vis.dot ?? 1;
  const parts = [pointsPart({ coords, place, amp: 0.06 * c, group: 'cloud', minGlow: 0.3, base: 0.009 * c * d, grow: 0.006 * c * d })];
  parts[0].object3D.renderOrder = 1;
  const extras = [glassShell(isCyl ? new THREE.CylinderGeometry(1.03 * c, 1.03 * c, 1.01 * L, 96, 1) : new THREE.SphereGeometry(1.03 * c, 96, 64))];
  if (!isCyl && opts.showString) companionString(c, [0.77, 0, -0.64], parts, extras, new THREE.Color(css('--muted')));
  return { parts, extras, dir: [1, 0.5, 1.2] };
}


function stringParts(p, opts = {}) {
  const L = p.L, n = 240, ink = new THREE.Color(css('--muted'));
  const parts = [tubePart({
    n, radius: 0.012 * L * (opts.vis?.thick ?? 1), amp: 0.22 * L,
    coordAt: i => [(L * i) / (n - 1)],
    place: (k, v, s) => [k[0] - L / 2, s * v, 0],
  })];
  return { parts, extras: [lines([[-L / 2, 0, 0], [L / 2, 0, 0]], ink, 0.35)], dir: [0.12, 0.3, 1] };
}

function diskParts(p, opts = {}) {
  const vis = opts.vis || {}, q = vis.detail ?? 1;
  const c = p.c, ink = new THREE.Color(css('--muted')), NR = Math.round(64 * q), NT = Math.round(128 * q);
  const parts = [gridPart({
    nu: NR, nv: NT, amp: 0.28 * c, material: surfaceMat({ wireframe: !!vis.wire }),
    coordAt: (i, j) => [(c * i) / NR, (2 * Math.PI * j) / NT],
    place: (k, v, s) => [k[0] * Math.cos(k[1]), s * v, -k[0] * Math.sin(k[1])],
  })];
  const rim = [];
  for (let j = 0; j < NT; j++) {
    const a = (2 * Math.PI * j) / NT, b = (2 * Math.PI * (j + 1)) / NT;
    rim.push([c * Math.cos(a), 0, -c * Math.sin(a)], [c * Math.cos(b), 0, -c * Math.sin(b)]);
  }
  return { parts, extras: [lines(rim, ink, 0.6)], dir: [0.9, 0.85, 1.3] };
}

function rectParts(p, opts = {}) {
  const vis = opts.vis || {}, NX = Math.round(96 * (vis.detail ?? 1));
  const { Lx, Ly } = p, ink = new THREE.Color(css('--muted')), NY = Math.max(8, Math.round((NX * Ly) / Lx));
  const parts = [gridPart({
    nu: NX, nv: NY, amp: 0.2 * Math.max(Lx, Ly), material: surfaceMat({ wireframe: !!vis.wire }),
    coordAt: (i, j) => [(Lx * i) / NX, (Ly * j) / NY],
    place: (k, v, s) => [k[0] - Lx / 2, s * v, Ly / 2 - k[1]],
  })];
  const x0 = -Lx / 2, x1 = Lx / 2, z0 = -Ly / 2, z1 = Ly / 2;
  const frame = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z0], [x1, 0, z1], [x1, 0, z1], [x0, 0, z1], [x0, 0, z1], [x0, 0, z0]];
  return { parts, extras: [lines(frame, ink, 0.6)], dir: [0.7, 0.9, 1.3] };
}

// Solid cylinder r < c, 0 < z < L, axis vertical. Same cut-away idea as the sphere: wedge 0 < θ < π/2 removed.
const cyl = (r, th, z, L) => [r * Math.cos(th), z - L / 2, r * Math.sin(th)];

// Slice view: one plane through the vertical axis at azimuth psi, displaced along its normal by u.
// The two halves of the plane (s > 0 and s < 0) map to azimuths psi and psi + π.

const BUILDERS = { string: stringParts, disk: diskParts, rect: rectParts };

export function buildMesh(shapeId, p, opts = {}) {
  const solid = shapeId === 'sphere' || shapeId === 'cylinder', isCyl = shapeId === 'cylinder';
  // Solids: arrow field, glass ball (rotatable middle slice), or wave spheres (the default).
  const { parts, extras, dir } = solid && opts.view === 'lattice' ? latticeParts(p, opts, isCyl)
    : solid && opts.view === 'glass' ? pondParts(p, opts, isCyl)
    : solid ? waveSphereParts(p, opts, isCyl)
      : BUILDERS[shapeId](p, opts);
  const group = new THREE.Group();
  const coords = [], offs = [];
  for (const part of parts) { offs.push(coords.length); coords.push(...part.coords); group.add(part.object3D); }
  extras.forEach(e => group.add(e));
  let scales = {}, vmax = {};
  return {
    object3D: group,
    coords,
    dir,
    // maxAbs[i] = largest |u| at vertex i over a sample of times; sets displacement and color scales per group.
    // The 97th percentile (not the max) sets the scale, so a single focusing spike can't flatten the rest.
    // floor: a share of |u| measured across the whole body, so a view where u is truly ~0 (e.g. a slice
    // on a nodal plane) stays flat instead of magnifying round-off to full height.
    calibrate(maxAbs, floor = 0) {
      const vals = {}, m = {};
      parts.forEach((part, pi) => {
        const arr = (vals[part.group] ??= []);
        for (let k = 0; k < part.coords.length; k++) arr.push(Math.abs(part.value(maxAbs[offs[pi] + k], part.coords[k])) || 0);
      });
      for (const [g, arr] of Object.entries(vals)) {
        arr.sort((a, b) => a - b);
        m[g] = Math.max(arr[Math.floor(0.97 * (arr.length - 1))] || arr[arr.length - 1] || 0, g === 'v' ? 0 : floor) || 1;
      }
      vmax = {}; scales = {};
      parts.forEach(part => {
        const mm = m[part.group] || 1;
        vmax[part.group] = mm;
        scales[part.group] = Math.max(scales[part.group] || 0, part.amp / mm);
      });
    },
    // groupGain lets a caller freeze one group's motion, e.g. { shell: 0 } to color shells without moving them.
    apply(u, gain = 1, groupGain = {}) {
      parts.forEach((part, pi) => part.update(u, offs[pi], scales[part.group] * gain * (groupGain[part.group] ?? 1), vmax[part.group] || 1));
    },
  };
}
