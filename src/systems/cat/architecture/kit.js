// ─────────────────────────────────────────────────────────────────────────────
// KIT — a tiny authoring language for merged, vertex-coloured architecture.
//
// Everything you add goes into a bucket keyed by (district, material). At the
// end `finish()` merges each bucket into ONE BufferGeometry → ONE Mesh, so a
// whole town costs a handful of draw calls. Districts keep frustum culling
// meaningful; materials are shared across districts so night-glow can be driven
// from one place.
//
// Anchors (important): box / cyl / cone / prism / roof are BOTTOM-anchored —
// y is the ground the thing stands on. sph / torus / quad / sign are CENTRE-
// anchored. Rotations (o.rx, o.ry, o.rz) happen around the anchor point.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// the shared handrail helper (measuring, spans, colliders, jump gate) — see HANDRAILS at the end
import { railRun, RAILS, RAIL_H, POST_GAP, MIN_DROP, GATE, ABOVE, landingFloor, arcPts } from '../../candy/architecture/rails.js';

const _cache = new Map();
function cached(key, make) {
  let g = _cache.get(key);
  if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); _cache.set(key, g); }
  return g;
}

/** Build a non-indexed geometry from a flat triangle soup. */
function soup(tris, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs || new Array((tris.length / 3) * 2).fill(0)), 2));
  g.computeVertexNormals();
  return g;
}

/** Gable roof prism: ridge runs along +Z, slopes fall toward ±X. Bottom at y=0. */
function gable(w, h, d) {
  const x = w / 2, z = d / 2;
  const A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], R1 = [0, h, -z], R2 = [0, h, z];
  const t = [];
  const quad = (a, b, c, e) => { t.push(...a, ...b, ...c, ...a, ...c, ...e); };
  quad(B, C, R2, R1);      // +X slope
  quad(D, A, R1, R2);      // -X slope
  t.push(...A, ...B, ...R1);
  t.push(...C, ...D, ...R2);
  quad(A, D, C, B);        // underside
  return soup(t);
}

/** Ramp/wedge: full height at -X, zero at +X. Bottom at y=0. */
function wedge(w, h, d) {
  const x = w / 2, z = d / 2;
  const A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], E = [-x, h, -z], F = [-x, h, z];
  const t = [];
  const quad = (a, b, c, e) => { t.push(...a, ...b, ...c, ...a, ...c, ...e); };
  quad(E, F, C, B);  // slope
  quad(A, B, C, D);  // bottom (wound for downward normal after computeVertexNormals)
  quad(F, E, A, D);  // back wall
  t.push(...A, ...E, ...B);
  t.push(...C, ...F, ...D);
  return soup(t);
}

const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _quat = new THREE.Quaternion(), _eul = new THREE.Euler(), _mtx = new THREE.Matrix4(), _col = new THREE.Color();

export class Kit {
  constructor() {
    this.buckets = new Map();   // "district|mat" → { district, mat, geos: [] }
    this.d = 'misc';
    this.prims = 0;
    this.overflow = null;       // see _push: where non-opaque primitives go
    this.collapse = null;       // { fromMat: toMat } — mobile shells fold metal into matte
  }
  at(district) { this.d = district; return this; }

  _push(geo, color, o) {
    let m = o.mat || 'matte';
    if (this.collapse && this.collapse[m]) m = this.collapse[m];
    // A shell Part only owns its OPAQUE masses (walls, roof, ironwork) so the
    // whole shell can be faded as one mesh while the player is inside. Glass,
    // signs, bulbs and the additive night spill belong to the town-wide pools —
    // forward them so a hollow building still costs two draw calls, not six.
    // Only the town-wide GLOW pools are forwarded (bulbs, lamps and the additive
    // night spill, which must stay lit whether or not you are indoors). Walls,
    // glass and painted signs all stay with the shell so the whole building can
    // dissolve as one while the player is inside it.
    if (this.overflow && (m === 'spill' || m === 'glow' || m === 'lamp')) return this.overflow._push(geo, color, o);
    // transform around the anchor
    _eul.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _quat.setFromEuler(_eul);
    _pos.set(o.x, o.y, o.z);
    _scl.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _mtx.compose(_pos, _quat, _scl);
    geo.applyMatrix4(_mtx);
    if (o.flat) geo.computeVertexNormals();
    // vertex colours + a cheap contact-shadow gradient near the anchor plane
    const p = geo.attributes.position, n = p.count;
    const arr = new Float32Array(n * 3);
    _col.set(color);
    let r = _col.r, g = _col.g, b = _col.b;
    const sh = o.shade ?? 1; r *= sh; g *= sh; b *= sh;
    const aoK = o.ao ?? 1, aoBase = o.aoBase ?? o.y, aoH = o.aoH ?? 1.4;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (aoK > 0) { const t = Math.min(1, Math.max(0, (p.getY(i) - aoBase) / aoH)); k = 1 - aoK * 0.2 * (1 - t * t); }
      arr[i * 3] = r * k; arr[i * 3 + 1] = g * k; arr[i * 3 + 2] = b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    // Only the bulk matte geometry is split per district (so frustum culling has
    // something to bite on). Signs, glass and metal are small and are pooled
    // town-wide so night-glow is one material and the mesh count stays low.
    const d = m === 'matte' ? this.d : 'town';
    const key = d + '|' + m;
    let bk = this.buckets.get(key);
    if (!bk) { bk = { district: d, mat: m, geos: [] }; this.buckets.set(key, bk); }
    bk.geos.push(geo);
    this.prims++;
    return geo;
  }

  // ── primitives ─────────────────────────────────────────────────────────────
  /** Bottom-anchored box. */
  box(x, y, z, w, h, d, color, o = {}) {
    const g = cached(`box`, () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: d * (o.sz ?? 1) });
  }
  /** Bottom-anchored cylinder (rTop, rBot). o.seg (12), o.open, o.center. */
  cyl(x, y, z, rTop, rBot, h, color, o = {}) {
    const seg = o.seg || 12, open = !!o.open, tl = o.theta ?? Math.PI * 2, ts = o.thetaStart ?? 0;
    const ratio = Math.abs(rTop - rBot) > 1e-4 ? rTop / Math.max(1e-4, rBot) : 1;
    const off = o.center ? 0 : 0.5;
    const g = cached(`cyl${seg}|${open}|${tl.toFixed(3)}|${ts.toFixed(3)}|${ratio.toFixed(3)}|${off}`,
      () => new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open, ts, tl).translate(0, off, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: rBot, sy: h, sz: rBot });
  }
  /** Bottom-anchored cone. */
  cone(x, y, z, r, h, color, o = {}) {
    const seg = o.seg || 12;
    const g = cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r, sy: h, sz: r });
  }
  /** Centre-anchored sphere. o.seg (12) o.rings (8) */
  sph(x, y, z, r, color, o = {}) {
    const seg = o.seg || 12, rings = o.rings || 8, pl = o.phiLength ?? Math.PI;
    const g = cached(`sph${seg}_${rings}_${pl.toFixed(2)}`, () => new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, pl)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r * (o.sx ?? 1), sy: r * (o.sy ?? 1), sz: r * (o.sz ?? 1), ao: o.ao ?? 0 });
  }
  /** Centre-anchored torus in the XY plane (use o.rx = -PI/2 to lay it flat). */
  torus(x, y, z, r, tube, color, o = {}) {
    const seg = o.seg || 16, tseg = o.tseg || 6, arc = o.arc ?? Math.PI * 2;
    const k = Math.max(0.01, tube / r);
    const g = cached(`tor${seg}_${tseg}_${arc.toFixed(2)}_${k.toFixed(3)}`, () => new THREE.TorusGeometry(1, k, tseg, seg, arc)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: r, sy: r, sz: r, ao: o.ao ?? 0 });
  }
  /** Gable roof, bottom-anchored, ridge along Z (use o.ry to turn). */
  roof(x, y, z, w, h, d, color, o = {}) {
    const g = cached('gable', () => gable(1, 1, 1)).clone();
    const m = this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: d });
    if (o.ribs) this._ribs(x, y, z, w, h, d, o.ribColor ?? color, o);
    return m;
  }
  /** Barrel tiles running down both slopes of a gable roof. */
  _ribs(x, y, z, w, h, d, color, o) {
    const n = o.ribs, seg = 5;
    const len = Math.hypot(w / 2, h) * 1.03, ang = Math.atan2(h, w / 2);
    const rr = o.ribR ?? Math.min(0.2, d / (n * 2.05));
    const ca = Math.cos(o.ry || 0), sa = Math.sin(o.ry || 0);
    const nx = Math.sin(ang), ny = Math.cos(ang); // outward normal of the +X slope
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < n; i++) {
        const lz = -d / 2 + d * ((i + 0.5) / n);
        const lx = s * (w / 4 + nx * rr * 0.55);
        const ly = h / 2 + ny * rr * 0.55;
        const wx = x + lx * ca + lz * sa, wz = z - lx * sa + lz * ca;
        this.cyl(wx, y + ly, wz, rr, rr, len, color, { seg, open: true, center: true, rz: s > 0 ? (Math.PI / 2 - ang) : (Math.PI / 2 + ang), ry: o.ry || 0, ao: 0, mat: o.mat });
      }
    }
  }
  /** Ramp/wedge, bottom-anchored, high side at -X. */
  wedge(x, y, z, w, h, d, color, o = {}) {
    const g = cached('wedge', () => wedge(1, 1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: d });
  }
  /** Centre-anchored vertical quad facing +Z (turn with o.ry / tilt with o.rx). */
  quad(x, y, z, w, h, color, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: h, sz: 1, ao: o.ao ?? 0 });
  }
  /** Centre-anchored horizontal quad (faces +Y). */
  hquad(x, y, z, w, d, color, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    return this._push(g, color, { ...o, x, y, z, sx: w, sy: d, sz: 1, rx: -Math.PI / 2 + (o.rx || 0), ao: 0 });
  }
  /** Tube through world-space points. */
  tube(points, r, color, o = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    let g = new THREE.TubeGeometry(curve, o.seg || Math.max(8, points.length * 4), r, o.rseg || 6, false);
    if (g.index) g = g.toNonIndexed();
    return this._push(g, color, { ...o, x: 0, y: 0, z: 0, ao: 0 });
  }
  /** A sign face: an atlas cell mapped onto a quad (centre-anchored, faces +Z). */
  sign(cell, x, y, z, w, h, o = {}) {
    const g = cached('plane', () => new THREE.PlaneGeometry(1, 1)).clone();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
    uv.needsUpdate = true;
    return this._push(g, 0xffffff, { ...o, x, y, z, sx: w, sy: h, sz: 1, ao: 0, mat: (o.glow ? 'signglow' : 'sign') + cell.page });
  }
  /** Same but lying flat (faces +Y) — for painted ground markings / posters on tables. */
  signFlat(cell, x, y, z, w, d, o = {}) {
    return this.sign(cell, x, y, z, w, d, { ...o, rx: -Math.PI / 2 + (o.rx || 0) });
  }

  /**
   * Mobile tier (after SignAtlas.combine()): move every sign<p> / signglow<p>
   * bucket onto the one combined page — UVs rewritten into page p's slot of
   * the { C, R } grid, buckets folded into sign0 / signglow0.
   */
  remapPages(L) {
    if (!L) return;
    const re = /^(sign|signglow)(\d+)$/;
    const out = new Map();
    for (const [key, bk] of this.buckets) {
      const m = re.exec(bk.mat);
      if (!m) { if (out.has(key)) out.get(key).geos.push(...bk.geos); else out.set(key, bk); continue; }
      const page = +m[2], col = page % L.C, row = Math.floor(page / L.C);
      for (const geo of bk.geos) {
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / L.C, (L.R - 1 - row + uv.getY(i)) / L.R);
      }
      const mat = m[1] + '0', nk = bk.district + '|' + mat;
      const into = out.get(nk);
      if (into) into.geos.push(...bk.geos);
      else out.set(nk, { district: bk.district, mat, geos: bk.geos });
    }
    this.buckets = out;
  }

  // ── output ─────────────────────────────────────────────────────────────────
  finish(materials, parent, report) {
    const meshes = [];
    let tris = 0;
    for (const bk of this.buckets.values()) {
      const mtl = materials[bk.mat];
      if (!mtl) { console.warn('[cat/arch] missing material', bk.mat); continue; }
      let geo;
      try { geo = bk.geos.length === 1 ? bk.geos[0] : mergeGeometries(bk.geos, false); }
      catch (e) { console.warn('[cat/arch] merge failed', bk.mat, e.message); continue; }
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mtl);
      mesh.name = 'cat_' + bk.district + '_' + bk.mat;
      mesh.castShadow = bk.mat === 'matte' || bk.mat === 'metal';
      mesh.receiveShadow = bk.mat === 'matte' || bk.mat === 'metal' || bk.mat.startsWith('sign') && !bk.mat.startsWith('signglow') || bk.mat === 'win';
      if (bk.mat === 'spill') { mesh.renderOrder = 6; mesh.frustumCulled = false; }
      parent.add(mesh);
      meshes.push(mesh);
      const n = geo.attributes.position.count / 3;
      tris += n;
      if (report) report[bk.district + ':' + bk.mat] = Math.round(n);
      bk.geos.length = 0;
    }
    this.buckets.clear();
    return { meshes, tris };
  }
}

/** Detached sub-builder: collects into its own buckets so you can merge a moving
 *  object (a boat, a hand, a croissant) into a single standalone Mesh/Group. */
export class Part extends Kit {
  build(materials) {
    const group = new THREE.Group();
    const r = this.finish(materials, group);
    group.userData.tris = r.tris;
    return group;
  }
}

/**
 * Per-vertex animation for a small merged mesh (flags, string lights, nets).
 * `fn(arr, base, i, t)` writes arr[i..i+2] from base[i..i+2].
 */
export function ripple(group, fn) {
  const targets = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const p = o.geometry.attributes.position;
    targets.push({ p, base: new Float32Array(p.array) });
  });
  return (t) => {
    for (const tg of targets) {
      const a = tg.p.array, b = tg.base;
      for (let i = 0; i < a.length; i += 3) fn(a, b, i, t);
      tg.p.needsUpdate = true;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDRAILS (Contract O, "Ramps and handrails") — the Cat Island half.
//
// The measuring, the spans, the colliders and the jump gate are the Candy
// Kingdom's shared helper (candy/architecture/rails.js railRun: every span is
// MEASURED and only a drop > 1.2 u gets a rail unless o.force; thin box
// colliders, ≤ 1.2 u long, h = RAIL_SOLID — solid, no top; o.gate makes them
// solid only while the visitor's feet are in a band round the deck). What is
// Cat Island's own is the LOOK, drawn by the styles below with this Kit's
// primitives into the SITE'S OWN builder (the district kit, or a shell Part so
// the rail fades with its building) — merged into buckets the site already
// draws: +0 draw calls.
//
//   catRail(ctx, B, pts, o) → railRun's registry entry (pts [[x, z, y], …])
//   timberStyle(o)   the harbour language: square posts, a ball knob, plank rails
//   wroughtStyle(o)  the lighthouse language: iron bars and a round iron rail
//   tubeStyle(o)     Meow Donald's: red steel posts, yellow tube rails
//   spiralStyle(o)   a turned timber handrail on existing iron balusters
// Every style takes o.foot(x, z, y) → where a post's FOOT stands (a stair's
// post stands on its own tread, not on the rail's sloped deck line).
// ─────────────────────────────────────────────────────────────────────────────
export { RAILS, RAIL_H, POST_GAP, MIN_DROP, landingFloor, arcPts };

/** A timber/iron BAR from a to b ([x, y, z], its centre line): a box w wide × h tall, long axis along a→b. */
export function beam(B, a, b, w, h, color, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hz = Math.hypot(dx, dz), len = Math.hypot(hz, dy);
  if (len < 1e-3) return null;
  const ry = Math.atan2(dx, dz), rx = -Math.atan2(dy, hz);
  // the box is bottom-anchored: step down half its height along its own up
  const sx = Math.sin(rx), ux = Math.sin(ry) * sx, uy = Math.cos(rx), uz = Math.cos(ry) * sx;
  return B.box((a[0] + b[0]) / 2 - ux * h / 2, (a[1] + b[1]) / 2 - uy * h / 2, (a[2] + b[2]) / 2 - uz * h / 2,
    w, h, len + (o.over ?? 0), color, { ry, rx, ao: 0, mat: o.mat, shade: o.shade });
}
/** A round rod from a to b ([x, y, z]), open-ended (its ends bury in a post). */
export function rod(B, a, b, r, color, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hz = Math.hypot(dx, dz), len = Math.hypot(hz, dy);
  if (len < 1e-3) return null;
  return B.cyl((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, r, len + (o.over ?? 0), color,
    { center: true, open: true, seg: o.seg || 6, rx: Math.PI / 2 - Math.atan2(dy, hz), ry: Math.atan2(dx, dz), ao: 0, mat: o.mat });
}

/**
 * TIMBER (the Arrivals Pier's own railing, and anything built of harbour
 * timber): square posts with a ball knob, a broad plank top rail, a narrower
 * mid rail. Defaults reproduce the pier's original rail exactly (posts 0.18,
 * knob r 0.13, top 0.26 × 0.15, mid 0.2 × 0.12 at deck + 0.58).
 */
export function timberStyle(o = {}) {
  const post = o.post ?? 0x8d5a34, knob = o.knob ?? 0xb4834f, top = o.top ?? 0xb4834f, mid = o.mid ?? 0x8d5a34;
  const pw = o.postW ?? 0.18, midShift = o.midShift ?? 0;
  return {
    post(B, x, y, z, h, i) {
      const f = o.foot ? o.foot(x, z, y) : y, t = y + h + 0.125;
      B.box(x, f, z, pw, t - f, pw, post, { ao: 0.4, aoBase: f, ry: o.yaw ?? 0 });
      B.sph(x, t + 0.05, z, 0.13, knob, { seg: 7, rings: 5 });
    },
    rail(B, a, b, kind) {
      if (kind === 'top') beam(B, a, b, 0.26, 0.15, top, { over: 0.02 });
      else beam(B, [a[0], a[1] + midShift, a[2]], [b[0], b[1] + midShift, b[2]], 0.2, 0.12, mid, { over: 0.02 });
    },
  };
}

/**
 * WROUGHT IRON (the Watchtower: the same dark iron as its lantern gallery):
 * square bars with a ball finial, a round top rail, a thinner mid rail. All on
 * the 'metal' material (a shell's own ironwork bucket, or the town pool).
 */
export function wroughtStyle(o = {}) {
  const iron = o.iron ?? 0x3a4a4c, fin = o.finial ?? 0x3a4a4c, midShift = o.midShift ?? 0;
  const tall = o.tall ?? [];                     // [[x, z]]: newel posts, a head taller with a gold ball
  // o.goldAll: EVERY post wears a gold ball (the flight's treatment, carried
  // round the drum ledge: a black bar with an iron pip read as site fencing)
  return {
    post(B, x, y, z, h, i) {
      const f = o.foot ? o.foot(x, z, y) : y;
      const newel = tall.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.3);
      const gold = newel || !!o.goldAll;
      const t = y + h + (newel ? 0.22 : 0.04);
      const pw = newel ? 0.14 : (o.goldAll ? 0.1 : 0.09);
      B.box(x, f, z, pw, t - f, pw, iron, { ao: 0, mat: 'metal', ry: o.yaw ?? 0 });
      if (o.goldAll && !newel) B.cyl(x, t - 0.02, z, 0.075, 0.06, 0.05, iron, { seg: 6, mat: 'metal', ao: 0 });   // a collar under the ball
      B.sph(x, t + (newel ? 0.1 : gold ? 0.09 : 0.05), z, newel ? 0.13 : gold ? 0.1 : 0.075, gold ? (o.gold ?? 0xf2c14e) : fin, { seg: 7, rings: 5, mat: gold ? undefined : 'metal' });
    },
    rail(B, a, b, kind) {
      if (kind === 'top') rod(B, a, b, 0.06, iron, { mat: 'metal', over: 0.04 });
      else rod(B, [a[0], a[1] + midShift, a[2]], [b[0], b[1] + midShift, b[2]], 0.035, iron, { mat: 'metal', over: 0.02 });
    },
  };
}

/**
 * TUBE (Meow Donald's forecourt: the restaurant's own red and yellow): round
 * red steel posts with a yellow ball cap, a fat yellow top tube, a thinner
 * yellow mid tube — the drive-thru's crowd rail. 'matte' only (the district's
 * own bucket), so it costs no draw call.
 */
export function tubeStyle(o = {}) {
  const post = o.post ?? 0xd52b1e, rail = o.rail ?? 0xffc72c, cap = o.cap ?? 0xffc72c;
  return {
    post(B, x, y, z, h) {
      const f = o.foot ? o.foot(x, z, y) : y;
      B.cyl(x, f - 0.05, z, 0.07, 0.08, y + h - f + 0.07, post, { seg: 8, ao: 0.4, aoBase: f });
      B.cyl(x, f - 0.02, z, 0.13, 0.15, 0.08, post, { seg: 8, ao: 0 });                 // base plate
      B.sph(x, y + h + 0.06, z, 0.11, cap, { seg: 8, rings: 5 });
    },
    rail(B, a, b, kind) {
      if (kind === 'top') rod(B, a, b, 0.07, rail, { seg: 8, over: 0.06 });
      else rod(B, a, b, 0.045, rail, { seg: 6, over: 0.04 });
    },
  };
}

/**
 * SPIRAL (the Watchtower's stair inside the drum): the iron balusters are
 * already there, one per tread (interiors.js watchInterior); each gets a collar
 * up to the handrail, the handrail is a turned timber rail following the helix,
 * and an iron mid rail threads the balusters.
 */
export function spiralStyle(o = {}) {
  const iron = o.iron ?? 0x3a4a4c, wood = o.wood ?? 0x8a6238, from = o.from ?? 0.86;
  return {
    post(B, x, y, z, h) {
      B.cyl(x, y + from, z, 0.05, 0.05, h - from + 0.02, iron, { seg: 6, mat: 'metal', ao: 0 });
      B.sph(x, y + h + 0.02, z, 0.085, wood, { seg: 7, rings: 5 });
      // a foot plate bolted to the tread: seen from above the flight, a bare
      // baluster under the helix read as hanging from the rail through the
      // tread above it rather than standing on its own
      if (o.foot !== false) B.cyl(x, y - 0.01, z, 0.1, 0.12, 0.05, iron, { seg: 8, mat: 'metal', ao: 0 });
    },
    rail(B, a, b, kind) {
      if (kind === 'top') rod(B, a, b, 0.065, wood, { seg: 7, over: 0.03 });
      else rod(B, a, b, 0.032, iron, { mat: 'metal', over: 0.02 });
    },
  };
}

/**
 * The highest walkable surface at (x, z) no higher than y + 0.3, or the
 * landing floor (terrain / the wading floor over the sea): what a walker
 * stepping off a deck at height y lands on. Read ONCE per sample at build time.
 */
export function landingBelow(ctx) {
  const land = landingFloor(ctx.world);
  return (x, z, y) => {
    let best = land(x, z);
    const ws = ctx.walkables || [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]; if (!w || !w.test) continue;
      let t = null;
      try { t = w.test(x, z); } catch (e) { t = null; }
      if (typeof t === 'number' && t === t && t <= y + 0.3 && t > best) best = t;
    }
    return best;
  };
}

/**
 * One railed edge. `o` is railRun's (site, edge, out, style, force, mid, gate,
 * lead, leadBack, have, below, h, noPosts, noRail) plus:
 *   o.gateLo  — for a gated run, how far under the deck the band starts
 *               (railRun's GATE is 2.3: right for a deck whose walkable lifts
 *               anyone within 2.2 of it; a walkable that only lifts within a
 *               step, like the Watchtower's helix, needs its own)
 *   o.claim   — T (the architecture's authoring api): claim each span's
 *               footprint so nothing is planted through the rail
 */
export function catRail(ctx, B, pts, o = {}) {
  const e = railRun(ctx, B, pts, { below: o.below || landingBelow(ctx), ...o });
  if (o.gate && o.gateLo != null) for (const c of e.cols) if (c.gateY != null) c.gateY += GATE - o.gateLo;
  // (a collider's rot is the player's sense, a claim's yaw the kit's: negate)
  if (o.claim) for (const c of e.cols) o.claim.claim(c.x, c.z, 0.7, c.d + 0.2, -c.rot);
  return e;
}
export { GATE, ABOVE };
