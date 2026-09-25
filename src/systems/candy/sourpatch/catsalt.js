// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KIDS — THE CATS' SALT LINE (WAVE 4, Contract M).
//
// The night the rainbow came, the cats salted Welcome Plaza. A ring of poured
// salt round the plaza and the arrivals office, its west edge just landward
// of the Arrivals Pier: Sour Patch Kids will not cross it (sourpatch.js +
// raid.js treat it exactly like Sugar Pier's), so the plaza is a refuge — from
// gummies. Not from tigers. The sign says so, in the Mayor's own words.
//
// Drawn like Candyland's salt line (props.js) so the two read as one rule:
//   1. the CRUST — a continuous ribbon snapped to world.height with a raised
//      spine, the salt crystals on it, and the sign's post and heap, all MERGED
//      into one vertex-coloured mesh (1 draw call; segments over the water or
//      inside a building footprint are simply not emitted)
//   2. the ground BAND — a soft white terrain-following wash (1 call) so the
//      line reads after dark from the plaza
//   3. the SIGN board (1 call, CanvasTexture)
// 3 draw calls (the band is one-sided and single-pass: it faces up, and a
// transparent DoubleSide material would cost three.js two passes), ≈ 5k
// triangles, no shadow casters. Hidden until the raids begin (story
// `rainbow_bridge`).
//
// Kids fixer r1 (the 47–62 ms frame the raids switched on): raid.js builds
// this on the game's first frame (hidden, behind the loading screen) and
// precompiles its three materials; switching the raids on is then only
// setVisible(true). The sign post's collider is registered with the build as
// solid:false (read live by the ground core) and made solid by setVisible, so
// nobody bumps into an invisible post before the rainbow — and ctx.colliders
// does not grow on the frame the raids begin. A rebuild (the bridge moved the
// ring) moves that same collider rather than splicing it out.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash } from '../../../core/util.js';

const SEG = 200;
const LAT = [-1.25, -0.60, 0.0, 0.60, 1.25];
const LIFT = [0.02, 0.125, 0.225, 0.125, 0.02];
const CLUSTERS = 80;

function signTexture() {
  const W = 512, H = 224;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf3e4'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1d5f5c'; g.lineWidth = 10; g.strokeRect(12, 12, W - 24, H - 24);
  g.textAlign = 'center';
  g.fillStyle = '#1d5f5c';
  g.font = 'bold 60px "Trebuchet MS", sans-serif';
  g.fillText('SALT LINE', W / 2, 78, W - 150);
  // (every line fitted inside the frame: the long one ran off both edges)
  g.fillStyle = '#6a3f55';
  g.font = 'italic 29px "Trebuchet MS", sans-serif';
  g.fillText('guests inside after dark. gummies: no.', W / 2, 124, W - 64);
  g.font = '24px "Trebuchet MS", sans-serif';
  g.fillStyle = '#4a4a4a';
  g.fillText('(does not work on tigers)   — the Mayor', W / 2, 168, W - 64);
  // a paw print, stamped
  g.fillStyle = '#c0504d';
  const px = W - 62, py = 60;
  g.beginPath(); g.ellipse(px, py + 10, 15, 12, 0, 0, Math.PI * 2); g.fill();
  for (const [dx, dy] of [[-16, -8], [-6, -18], [6, -18], [16, -8]]) { g.beginPath(); g.ellipse(px + dx, py + dy, 5.5, 7, 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createCatSalt(ctx, ring) {
  const { world } = ctx;
  const g = new THREE.Group(); g.name = 'sourpatch-catsalt'; g.visible = false;
  ctx.scene.add(g);
  let crust = null, band = null, board = null, tris = 0, signAt = null, emitted = 0, buildMs = 0;
  // the sign post: ONE collider object for good (moved on a rebuild), solid
  // only while the ring is shown
  const postCol = { x: 0, z: 0, r: 0.55, solid: false };
  let postIn = false;

  /** Inside something drawn (a building footprint): a box collider without a
   *  low `h` whose footprint holds this point. The crust is not poured there. */
  // (only the big boxes near the ring's line, gathered once per build)
  let near = [];
  function gatherBuildings() {
    near = [];
    for (const c of ctx.colliders || []) {
      if (!c || !c.box || (typeof c.h === 'number' && c.h <= 1.6)) continue;
      const w = c.w || 0, d = c.d || 0;
      if (!(w > 3 || d > 3)) continue;
      const dr = Math.hypot(c.x - ring.x, c.z - ring.z);
      if (Math.abs(dr - ring.r) < w + d + 2) near.push(c);
    }
  }
  function underBuilding(x, z) {
    for (const c of near) {
      const w = c.w || 0, d = c.d || 0;
      if (Math.abs(x - c.x) > (w + d) || Math.abs(z - c.z) > (w + d)) continue;
      const cs = Math.cos(-(c.rot || 0)), sn = Math.sin(-(c.rot || 0));
      const lx = (x - c.x) * cs - (z - c.z) * sn, lz = (x - c.x) * sn + (z - c.z) * cs;
      if (Math.abs(lx) < w / 2 && Math.abs(lz) < d / 2 && (w > 3 || d > 3)) return true;
    }
    return false;
  }

  function build() {
    const t0 = performance.now();
    for (const o of [crust, band, board]) if (o) {
      g.remove(o); o.geometry.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
    }
    gatherBuildings();
    const rand = rng(hash('sourpatch-catsalt'));
    const CX = ring.x, CZ = ring.z, R = ring.r;
    const land = (x, z) => world.height(x, z) > 0.30;

    // 1a. the crust ribbon
    const pos = [], col = [], idx = [];
    const ok = [];
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let good = !underBuilding(CX + ca * R, CZ + sa * R);
      for (let r = 0; r < 5; r++) {
        const x = CX + ca * (R + LAT[r]), z = CZ + sa * (R + LAT[r]);
        const h = world.height(x, z);
        if (h <= 0.30) good = false;
        const wob = 0.72 + 0.28 * Math.sin(a * 9.3 + r * 0.7) * Math.sin(a * 3.1 + 1.4);
        pos.push(x, Math.max(0.10, h) + LIFT[r] * wob + 0.015, z);
        const sh = r === 2 ? 1.0 : 0.93;
        col.push(sh, sh, sh * 0.995);
      }
      ok.push(good);
    }
    for (let s = 0; s < SEG; s++) {
      if (!ok[s] || !ok[s + 1]) continue;
      emitted++;
      for (let r = 0; r < 4; r++) {
        const a0 = s * 5 + r, a1 = s * 5 + r + 1, b0 = (s + 1) * 5 + r, b1 = (s + 1) * 5 + r + 1;
        idx.push(a0, b0, b1, a0, b1, a1);
      }
    }
    let ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ribbon.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ribbon.setIndex(idx);
    ribbon = ribbon.toNonIndexed();
    const parts = [ribbon];

    // 1b. crystals on the spine (merged, not instanced: they never move)
    const oct = new THREE.OctahedronGeometry(1, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const HUES = [[1, 1, 1], [0.965, 0.976, 1], [0.918, 0.95, 1], [1, 0.965, 0.984]];
    for (let c = 0; c < CLUSTERS; c++) {
      const ang = (c / CLUSTERS) * Math.PI * 2 + rand() * 0.05;
      const si = Math.round(ang / (Math.PI * 2) * SEG) % SEG;
      if (!ok[si]) continue;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const n = 3 + ((rand() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const lat = (rand() - 0.5) * 1.35, off = (rand() - 0.5) * 0.55;
        const x = CX + ca * (R + lat) - sa * off, z = CZ + sa * (R + lat) + ca * off;
        if (!land(x, z)) continue;
        const prof = 0.225 * Math.max(0, 1 - (Math.abs(lat) / 1.25) ** 1.6);
        const s0 = i === 0 ? 0.20 + rand() * 0.16 : 0.085 + rand() * 0.11;
        e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28); q.setFromEuler(e);
        p.set(x, Math.max(0.10, world.height(x, z)) + prof + s0 * 0.42, z);
        sc.set(s0 * (0.8 + rand() * 0.5), s0 * (0.7 + rand() * 0.5), s0 * (0.8 + rand() * 0.5));
        m.compose(p, q, sc);
        const gg = oct.clone().applyMatrix4(m);
        const hu = HUES[(rand() * HUES.length) | 0];
        const cc = new Float32Array(gg.attributes.position.count * 3);
        for (let v = 0; v < cc.length; v += 3) { cc[v] = hu[0]; cc[v + 1] = hu[1]; cc[v + 2] = hu[2]; }
        gg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        gg.deleteAttribute('uv');
        parts.push(gg);
      }
    }

    // 1c. the sign's post + a heap of salt at its foot (merged into the crust)
    //     on the ring's west side, facing the pier: the first thing you read
    //     walking up from the boats
    const pierA = Math.atan2(22 - CZ, 42 - CX);
    let best = null;
    const around = [];                                   // colliders anywhere near the line (gathered once)
    for (const c of ctx.colliders || []) {
      if (!c || c === postCol) continue;                 // (its own post, on a rebuild)
      const cr = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
      if (!(cr >= 0.3)) continue;
      if (Math.abs(Math.hypot(c.x - CX, c.z - CZ) - R) < cr + 8) around.push(c);
    }
    for (let a = 0; a < 120; a++) {
      const ang = (a / 120) * Math.PI * 2;
      const x = CX + Math.cos(ang) * (R - 0.7), z = CZ + Math.sin(ang) * (R - 0.7);
      if (world.height(x, z) < 0.6 || !world.isFreeGround(x, z, { pathMargin: 2.4, avoidLandmarks: false, minHeight: 0.6 })) continue;
      let near = 99;
      for (const c of around) {
        const cr = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : (c.r || 0);
        const d = Math.hypot(c.x - x, c.z - z) - cr;
        if (d < near) near = d;
      }
      if (near < 1.4) continue;
      const dA = Math.abs(Math.atan2(Math.sin(ang - pierA), Math.cos(ang - pierA)));
      const score = dA - Math.min(near, 5) * 0.08;
      if (!best || score < best.score) best = { x, z, ang, score };
    }
    const sang = best ? best.ang : pierA;
    const sx = best ? best.x : CX + Math.cos(pierA) * (R - 0.7), sz = best ? best.z : CZ + Math.sin(pierA) * (R - 0.7);
    const sy = Math.max(0.1, world.height(sx, sz));
    const rotY = Math.atan2(Math.cos(sang), Math.sin(sang));        // board faces outward (toward the pier)
    // (the post stands BEHIND the board — inward of it — so it never crosses
    // the Mayor's lettering: kids fixer r1, the render read "afte▮ark")
    const px = sx - Math.cos(sang) * 0.17, pz = sz - Math.sin(sang) * 0.17;
    const post = new THREE.CylinderGeometry(0.10, 0.12, 1.95, 7).toNonIndexed(); post.translate(px, sy + 0.97, pz);
    const heap = new THREE.ConeGeometry(0.52, 0.36, 7).toNonIndexed(); heap.translate(px, sy + 0.15, pz);
    for (const [gg, hex] of [[post, [0.36, 0.25, 0.2]], [heap, [1, 1, 1]]]) {
      const cc = new Float32Array(gg.attributes.position.count * 3);
      for (let v = 0; v < cc.length; v += 3) { cc[v] = hex[0]; cc[v + 1] = hex[1]; cc[v + 2] = hex[2]; }
      gg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      gg.deleteAttribute('uv');
      parts.push(gg);
    }
    ribbon.deleteAttribute('uv');
    const merged = mergeGeometries(parts.map((gg) => { if (gg.attributes.normal) gg.deleteAttribute('normal'); return gg; }), false);
    merged.computeVertexNormals();
    crust = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.38, metalness: 0, flatShading: true,
      emissive: new THREE.Color(0x44506e), emissiveIntensity: 0.32,
    }));
    crust.name = 'catsalt-crust'; crust.receiveShadow = true; crust.castShadow = false;
    g.add(crust);

    // 2. the ground band
    {
      const BS = 144, radii = [R - 2.4, R, R + 2.4];
      const bp = new Float32Array((BS + 1) * 9), bc = new Float32Array((BS + 1) * 12);
      for (let s = 0; s <= BS; s++) {
        const a = (s / BS) * Math.PI * 2;
        const si = Math.round(a / (Math.PI * 2) * SEG) % SEG;
        for (let r = 0; r < 3; r++) {
          const x = CX + Math.cos(a) * radii[r], z = CZ + Math.sin(a) * radii[r], i = s * 3 + r;
          bp[i * 3] = x; bp[i * 3 + 1] = Math.max(0.08, world.height(x, z)) + 0.05; bp[i * 3 + 2] = z;
          bc[i * 4] = 1; bc[i * 4 + 1] = 1; bc[i * 4 + 2] = 1;
          bc[i * 4 + 3] = r === 1 && land(x, z) && ok[si] ? 0.34 : 0;
        }
      }
      const bi = [];
      for (let s = 0; s < BS; s++) for (let r = 0; r < 2; r++) {
        const a0 = s * 3 + r, a1 = s * 3 + r + 1, b0 = (s + 1) * 3 + r, b1 = (s + 1) * 3 + r + 1;
        bi.push(a0, b0, b1, a0, b1, a1);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 4));
      bg.setIndex(bi);
      // (FrontSide: the ribbon's quads wind counter-clockwise seen from above,
      // so its face is up; transparent + DoubleSide would be drawn twice)
      band = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.FrontSide, forceSinglePass: true, fog: true }));
      band.name = 'catsalt-band'; band.renderOrder = 2;
      g.add(band);
    }

    // 3. the board
    board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 0.10), new THREE.MeshStandardMaterial({
      map: signTexture(), roughness: 0.62, metalness: 0, emissive: new THREE.Color(0x6a6274), emissiveIntensity: 0.35,
    }));
    board.position.set(sx, sy + 1.92, sz);
    board.rotation.y = rotY;
    board.name = 'catsalt-sign';
    g.add(board);
    signAt = { x: +sx.toFixed(1), z: +sz.toFixed(1) };
    postCol.x = sx; postCol.z = sz;
    if (!postIn && Array.isArray(ctx.colliders)) { ctx.colliders.push(postCol); postIn = true; }

    tris = (merged.attributes.position.count / 3) + bi2tris(band.geometry) + 12;
    buildMs = performance.now() - t0;
  }
  const bi2tris = (geo) => (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3);

  build();
  return {
    group: g,
    setVisible(v) { g.visible = !!v; postCol.solid = !!v; },
    rebuild() { emitted = 0; build(); },
    /** Compile the three materials now (hidden: renderer.compile traverses
     *  the group whatever its visibility), so the first frame the ring shows
     *  does not stall on shader programs. */
    precompile() {
      try { if (ctx.renderer?.compile && ctx.camera) ctx.renderer.compile(g, ctx.camera, ctx.scene); } catch (e) { /* visuals only */ }
    },
    stats: () => ({ visible: g.visible, tris: Math.round(tris), segments: emitted, sign: signAt, calls: 3, buildMs: +buildMs.toFixed(1), postSolid: postCol.solid }),
  };
}
