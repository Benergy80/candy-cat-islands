// Terrain decor: gumdrop sea-cliffs, the whipped-cream waterfall ledge, the
// Chocolate Lake boardwalk, syrup-delta sandbars, Fish Harbor's stone quay and
// the stylised bluff stone at the lighthouse / Yarn Hill.
// Everything is merged into a handful of vertex-coloured meshes.
import * as THREE from 'three';
import { rng, hash } from '../../core/util.js';
import { CANDY, CAT } from '../../core/palette.js';
import { GLSL_NOISE, patchMaterial, smooth, colorOf } from './common.js';

const TAU = Math.PI * 2;
const pushCollider = (ctx, c) => { if (Array.isArray(ctx.colliders)) ctx.colliders.push(c); };

// ─────────────────────────────────────────────────────────────────────────────
// INTERIORS ARE ROOMS, NOT SCENERY
// Terrain builds BEFORE either architecture system, so no room rect exists at
// build time — a 4-unit ochre boulder happily landed on the Watchtower floor.
// Two guards:
//   1. build time — the landmark cores the architecture agents own are off
//      limits inside `CORE_KEEP` of their radius;
//   2. 'world:ready' — every recorded lump is re-tested against the real
//      api.interiors rects of BOTH islands, and the offenders collapse to a
//      point (zero-area triangles; no geometry rebuild, no draw-call change).
// ─────────────────────────────────────────────────────────────────────────────
const CORE_IDS = ['lighthouse', 'meow_donalds', 'main_street', 'town_square', 'residential', 'candy_village', 'giant_cupcake'];
const CORE_KEEP = 0.6;
/** Is (x,z) inside the inner 60% of a landmark core the architects own? */
function inArchCore(world, x, z, extra = 0) {
  for (const id of CORE_IDS) {
    const l = world.LANDMARKS[id];
    if (!l) continue;
    const rr = l.r * CORE_KEEP + extra;
    if ((x - l.x) ** 2 + (z - l.z) ** 2 < rr * rr) return true;
  }
  return false;
}

const INTERIOR_PAD = 0.8;
/** Normalise an api.interiors entry (room yaw is the opposite handedness). */
function roomShape(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return null;
  if (b.radius > 0 && !(b.w > 0)) return { x: b.x, z: b.z, circle: b.radius };
  const w = b.w ?? 0, d = b.d ?? 0;
  if (!(w > 0) || !(d > 0)) return null;
  const rot = -(b.rot || 0);
  return { x: b.x, z: b.z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), out: Math.hypot(w, d) / 2 };
}
function hitsRoom(shapes, x, z, r) {
  for (let i = 0; i < shapes.length; i++) {
    const b = shapes[i], dx = x - b.x, dz = z - b.z;
    if (b.circle) { const rr = b.circle + r + INTERIOR_PAD; if (dx * dx + dz * dz < rr * rr) return true; continue; }
    const reach = b.out + r + INTERIOR_PAD;
    if (dx * dx + dz * dz > reach * reach) continue;
    const lx = Math.abs(dx * b.c + dz * b.s), lz = Math.abs(-dx * b.s + dz * b.c);
    if (lx < b.hw + r + INTERIOR_PAD && lz < b.hd + r + INTERIOR_PAD) return true;
  }
  return false;
}
/**
 * items: [{ x, z, r, v0, v1 }] — world position, footprint radius and the
 * half-open vertex range this lump owns in `mesh.geometry`.
 */
function cullInsideInteriors(ctx, mesh, items, label) {
  if (!items.length || !ctx.events?.on) return;
  ctx.events.on('world:ready', () => {
    const shapes = [];
    for (const sys of [ctx.systems?.catArchitecture, ctx.systems?.candyArchitecture]) {
      for (const b of sys?.interiors || []) { const q = roomShape(b); if (q) shapes.push(q); }
    }
    if (!shapes.length) return;
    const pos = mesh.geometry.attributes.position;
    let n = 0;
    for (const it of items) {
      if (!hitsRoom(shapes, it.x, it.z, it.r)) continue;
      const cx = pos.getX(it.v0), cy = pos.getY(it.v0), cz = pos.getZ(it.v0);
      for (let v = it.v0; v < it.v1; v++) pos.setXYZ(v, cx, cy, cz);
      if (it.coll) it.coll.r = 0;            // no invisible wall where the rock was
      n++;
    }
    if (n) { pos.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
    console.warn(`[terrain/${label}] interior clearance: ${n} decor lumps removed from ${shapes.length} rooms`);
  });
}

class Accum {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.n = 0; }
  add(geo, matrix, color, tint) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    g.computeVertexNormals();
    const p = g.attributes.position.array, nr = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(nr[i]); }
    const c = new THREE.Color();
    for (let i = 0; i < p.length / 3; i++) {
      c.copy(color);
      if (tint) tint(c, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], i);
      this.col.push(c.r, c.g, c.b);
    }
    this.n += p.length / 3;
    g.dispose?.();
  }
  addRaw(positions, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const nr = g.attributes.normal.array;
    for (let i = 0; i < positions.length; i++) { this.pos.push(positions[i]); this.nor.push(nr[i]); }
    for (let i = 0; i < colors.length; i++) this.col.push(colors[i]);
    this.n += positions.length / 3;
  }
  /** Real xz reach of the vertices [v0,v1) about (x,z) — the cull needs the
   *  lump's ACTUAL footprint, not the nominal scale it was composed with. */
  radiusXZ(v0, v1, x, z) {
    let m2 = 0;
    for (let v = v0; v < v1; v++) {
      const dx = this.pos[v * 3] - x, dz = this.pos[v * 3 + 2] - z;
      const d = dx * dx + dz * dz; if (d > m2) m2 = d;
    }
    return Math.sqrt(m2);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get tris() { return this.n / 3; }
}

function blob(seed, detail = 1, rough = 0.22) {
  const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const r = rng(seed);
  const p = g.attributes.position;
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let s = cache.get(key);
    if (s === undefined) { s = 1 + (r() - 0.5) * rough * 2; cache.set(key, s); }
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

// ── Candyland decor ─────────────────────────────────────────────────────────
export function buildCandyDecor(ctx, uniforms, prof, lakeSurface) {
  const { world } = ctx;
  const acc = new Accum();
  const r = rng(hash('terrain-candy-decor'));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const cream = colorOf(0xfff6ec), creamShade = colorOf(CANDY.frostingShade);
  const licorice = colorOf(0x120c12), caramel = colorOf(CANDY.caramel);
  const lumps = [];   // { x, z, r, v0, v1, coll } — culled against api.interiors
  const postWood = colorOf(0x5a3420);   // dark chocolate, never pure black
  const sugar = colorOf(0xead0a2);

  // ── whipped-cream waterfall ledge ─────────────────────────────────────────
  const P = prof.P;
  let startIdx = prof.k;
  for (let i = 0; i < prof.k; i++) if (P[i].pool) { startIdx = i; break; }
  const startAlong = P[startIdx].along - 3.5;
  const lipAlong = P[prof.k].along;
  const surfAt = (along) => {
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].along < along) lo = mid; else hi = mid; }
    const t = (along - P[lo].along) / Math.max(1e-5, P[hi].along - P[lo].along);
    return { p: P[lo], surf: P[lo].surf + (P[hi].surf - P[lo].surf) * t };
  };
  {
    const AL = 14, AC = 25, ACROSS = 10.5;
    const pos = [], cols = [];
    const grid = [];
    for (let a = 0; a <= AL; a++) {
      const along = startAlong + ((lipAlong - startAlong) * a) / AL;
      const s = surfAt(along);
      const row = [];
      for (let c = 0; c <= AC; c++) {
        const f = (c / AC) * 2 - 1;
        const off = f * ACROSS;
        const x = s.p.x + s.p.nx * off, z = s.p.z + s.p.nz * off;
        const terr = world.height(x, z);
        const core = prof.poolTop - 0.58 + Math.max(0, Math.abs(off) - 3.6) * 0.52;
        const bAc = smooth(ACROSS, 6.2, Math.abs(off));
        const bAl = smooth(startAlong, startAlong + 5.0, along);
        const y = Math.max(terr, terr + (core - terr) * bAc * bAl);
        row.push({ x, y, z, lit: bAc * bAl });
      }
      grid.push(row);
    }
    const tri = (A, B, C) => {
      for (const v of [A, B, C]) pos.push(v.x, v.y, v.z);
      for (const v of [A, B, C]) {
        const c = cream.clone().lerp(creamShade, 0.38 * (1 - v.lit) + 0.12 * r());
        cols.push(c.r, c.g, c.b);
      }
    };
    for (let a = 0; a < AL; a++) for (let c = 0; c < AC; c++) {
      tri(grid[a][c], grid[a + 1][c], grid[a][c + 1]);
      tri(grid[a][c + 1], grid[a + 1][c], grid[a + 1][c + 1]);
    }
    // the lip face: a chunky frosting drop the syrup pours over
    const FACE = 6, REACH = 3.1;
    const lipRow = grid[AL];
    const s0 = surfAt(lipAlong);
    const faceGrid = [lipRow.map((v) => ({ ...v, lit: 0.9 }))];
    for (let fr = 1; fr <= FACE; fr++) {
      const v = fr / FACE;
      const row = [];
      for (let c = 0; c <= AC; c++) {
        const f = (c / AC) * 2 - 1;
        const off = f * ACROSS;
        const x = s0.p.x + s0.p.tx * v * REACH + s0.p.nx * off;
        const z = s0.p.z + s0.p.tz * v * REACH + s0.p.nz * off;
        const terr = world.height(x, z);
        const y0 = lipRow[c].y;
        const y = y0 + (terr - y0) * (v * 0.35 + v * v * 0.65);
        row.push({ x, y: Math.max(terr - 0.1, y), z, lit: 0.9 - v * 0.75 });
      }
      faceGrid.push(row);
    }
    for (let a = 0; a < FACE; a++) for (let c = 0; c < AC; c++) {
      tri(faceGrid[a][c], faceGrid[a + 1][c], faceGrid[a][c + 1]);
      tri(faceGrid[a][c + 1], faceGrid[a + 1][c], faceGrid[a + 1][c + 1]);
    }
    acc.addRaw(pos, cols);
    pushCollider(ctx, { x: s0.p.x + s0.p.nx * 8.5, z: s0.p.z + s0.p.nz * 8.5, r: 3.2 });
    pushCollider(ctx, { x: s0.p.x - s0.p.nx * 8.5, z: s0.p.z - s0.p.nz * 8.5, r: 3.2 });
  }

  // ── Chocolate Lake boardwalk posts + caramel kerb ─────────────────────────
  {
    const path = world.PATHS.find((p) => p.id === 'candy_main');
    const curve = new THREE.CatmullRomCurve3(path.points.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal', 0.5);
    const len = curve.getLength();
    const n = Math.round(len / 2.4);
    const pts = curve.getSpacedPoints(n);
    const post = new THREE.CylinderGeometry(0.22, 0.26, 1, 6);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const terr = world.height(p.x, p.z);
      if (terr > lakeSurface - 0.1) continue;
      const a = pts[i - 1];
      let tx = p.x - a.x, tz = p.z - a.z; const L = Math.hypot(tx, tz) || 1;
      const nx = -tz / L, nz = tx / L;
      for (const sgn of [-1, 1]) {
        const px = p.x + nx * sgn * 1.7, pz = p.z + nz * sgn * 1.7;
        const g = world.height(px, pz);
        const top = lakeSurface + 0.62;
        const hgt = top - (g - 0.4);
        m.compose(new THREE.Vector3(px, (top + g - 0.4) / 2, pz), q.setFromEuler(e.set(0, r() * TAU, 0)), new THREE.Vector3(1, hgt, 1));
        acc.add(post, m, postWood, (c) => c.multiplyScalar(0.82 + r() * 0.34));
      }
    }
  }

  // ── syrup-delta sandbars ──────────────────────────────────────────────────
  {
    const bar = blob(hash('sandbar'), 1, 0.16);
    const spots = [[-94, 76], [-101, 79], [-96.5, 84], [-103, 70.5]];
    for (const [x, z] of spots) {
      const y = world.height(x, z);
      if (inArchCore(world, x, z, 3.5)) continue;
      const v0 = acc.n;
      m.compose(new THREE.Vector3(x, y + 0.35, z), q.setFromEuler(e.set(0, r() * TAU, 0)),
        new THREE.Vector3(3.2 + r() * 2.2, 0.42 + r() * 0.26, 2.2 + r() * 1.6));
      acc.add(bar, m, sugar, (c, px, py) => c.multiplyScalar(0.9 + 0.14 * r()).lerp(caramel, py < y + 0.25 ? 0.35 : 0.05));
      lumps.push({ x, z, r: acc.radiusXZ(v0, acc.n, x, z), v0, v1: acc.n, coll: null });
    }
  }

  const geo = acc.geometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.0, flatShading: true });
  patchMaterial(mat, {
    key: 'terrain-candy-decor', uniforms: { ...uniforms },
    vertexHead: 'varying vec3 vWPos;',
    vertexBody: 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragmentHead: GLSL_NOISE + 'varying vec3 vWPos;',
    fragmentColor: /* glsl */`
      diffuseColor.rgb *= 0.94 + 0.13 * tFbm(vWPos.xz * 0.9 + vWPos.y * 0.3);`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_candy_decor';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  cullInsideInteriors(ctx, mesh, lumps, 'candy_decor');
  return { mesh, tris: acc.tris };
}

// ── Gumdrop sea-cliffs (west coast of Candyland) ─────────────────────────────
export function buildGumdrops(ctx, uniforms) {
  const { world } = ctx;
  const acc = new Accum();
  const r = rng(hash('terrain-gumdrops'));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const isl = world.ISLANDS.candy;
  const hues = [0xe01247, 0x0f7fd6, 0xe8b400, 0x18a84f, 0x8a2fd6, 0xe05f00];
  const shapes = [blob(101, 1, 0.13), blob(202, 1, 0.19), blob(303, 1, 0.10)];
  let placed = 0;
  const taken = [];
  const lumps = [];   // { x, z, r, v0, v1, coll } — culled against api.interiors
  for (let a = 0; a < 220 && placed < 34; a++) {
    const ang = (a / 220) * TAU;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    if (cx > -0.25) continue;                              // west coast only
    // march outward for the waterline
    let hit = -1;
    for (let rad = 80; rad < 165; rad += 0.7) {
      const x = isl.center.x + cx * rad * 1.08, z = isl.center.z + cz * rad * 0.86;
      if (world.height(x, z) < 0.9) { hit = rad; break; }
    }
    if (hit < 0) continue;
    const nCluster = r() < 0.45 ? 2 : 1;
    for (let cN = 0; cN < nCluster && placed < 34; cN++) {
      const rad = hit + (r() - 0.4) * 9;
      const jx = (r() - 0.5) * 7, jz = (r() - 0.5) * 7;
      const x = isl.center.x + cx * rad * 1.08 + jx, z = isl.center.z + cz * rad * 0.86 + jz;
      if (z > 58 || z < -52) continue;
      // Gumdrop Cliffs has its own, smaller boulders (buildCliffs). Thirty-four
      // 4-to-9-unit domes parked on that waterline walled the cliff face off
      // completely — from the sea the bluff was invisible behind jelly beans.
      if (Math.hypot(x + 222, z - 18) < 46) continue;
      let clash = false;
      for (const t of taken) if (Math.hypot(t[0] - x, t[1] - z) < t[2] + 3.5) { clash = true; break; }
      if (clash) continue;
      const ground = world.height(x, z);
      if (ground < -2.6 || ground > 9.5) continue;
      const s = 3.6 + r() * 5.4 + (ground > 2 ? 1.6 : 0);
      if (inArchCore(world, x, z, s * 0.5)) continue;
      taken.push([x, z, s]);
      const v0 = acc.n;
      const col = colorOf(hues[Math.floor(r() * hues.length)]);
      m.compose(
        new THREE.Vector3(x, Math.max(ground, -0.6) + s * 0.42, z),
        q.setFromEuler(e.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3)),
        new THREE.Vector3(s, s * (0.78 + r() * 0.4), s * (0.86 + r() * 0.3)),
      );
      acc.add(shapes[Math.floor(r() * shapes.length)], m, col, (c, px, py) => {
        // sugar-frosted crown, richer core
        c.multiplyScalar(0.80 + 0.26 * r());
        const top = smooth(ground + s * 0.35, ground + s * 1.1, py);
        c.lerp(colorOf(0xffffff), top * 0.14);
      });
      const coll = { x, z, r: s * 0.8 };
      pushCollider(ctx, coll);
      lumps.push({ x, z, r: acc.radiusXZ(v0, acc.n, x, z), v0, v1: acc.n, coll });
      placed++;
    }
  }
  const geo = acc.geometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.22, metalness: 0.0, flatShading: true,
  });
  patchMaterial(mat, {
    key: 'terrain-gumdrops', uniforms: { ...uniforms },
    vertexHead: 'varying vec3 vWPos; varying vec3 vWNor;',
    vertexBody: 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNor = normalize(mat3(modelMatrix) * objectNormal);',
    fragmentHead: 'varying vec3 vWPos; varying vec3 vWNor; uniform float uDaylight;',
    fragmentEmissive: /* glsl */`
      {
        // Fake translucency: the rim glows with the gumdrop's own colour.
        // AT NIGHT THIS IS A RIM ONLY, capped at 0.08 x albedo (sky r3: the old
        // flat 0.03-0.22 self-glow meant the boulders lit themselves and never
        // took the moon key). By day it can be generous — the sun swamps it.
        vec3 V = normalize(cameraPosition - vWPos);
        float rim = pow(1.0 - clamp(dot(normalize(vWNor), V), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += diffuseColor.rgb * mix(0.006 + 0.074 * rim, 0.050 + 0.320 * rim, uDaylight);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_gumdrops';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  cullInsideInteriors(ctx, mesh, lumps, 'gumdrops');
  return { mesh, tris: acc.tris, count: placed };
}

// ── Gumdrop Cliffs (-222, 18) ────────────────────────────────────────────────
// world.height() puts a 9-unit bluff here whose seaward rim runs at 0.8–1.0
// rise/run. That IS a cliff, but nothing marked it, so it read as a lilac hill.
// This builds what a cliff needs to be legible from the game camera:
//   · two contour-following sugar-rock LEDGES cut into the face
//   · a sugar-sand beach apron at the foot (drift meshes; the ground shader
//     already paints the sand, and world.height leaves it walkable)
//   · gumdrop boulders spilled down the face and along the beach
// Heights are all sampled from world.height — nothing here reshapes the world.
export function buildCliffs(ctx, uniforms) {
  const { world } = ctx;
  const acc = new Accum();
  const r = rng(hash('terrain-cliffs'));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const CX = -222, CZ = 18;
  const rockLo = colorOf(0x6d5583), rockMid = colorOf(0x9c85b4), rockTop = colorOf(0xd9c8e8);
  const sugar = colorOf(0xefe0c2);
  const hues = [0xe01247, 0x0f7fd6, 0xe8b400, 0x18a84f, 0x8a2fd6, 0xe05f00];

  /** Radius from the landmark centre at which the ground drops to `targetH`. */
  const contour = (a, targetH) => {
    const cx = Math.cos(a), cz = Math.sin(a);
    let prev = world.height(CX, CZ), prevR = 0;
    for (let rad = 5; rad < 86; rad += 0.6) {
      const h = world.height(CX + cx * rad, CZ + cz * rad);
      if (h <= targetH) {
        const t = (prev - targetH) / Math.max(1e-4, prev - h);
        return prevR + (rad - prevR) * t;
      }
      prev = h; prevR = rad;
    }
    return -1;
  };

  // The seaward arc: west through south-west. (cos a, sin a) = (x, z).
  const A0 = 1.75, A1 = 4.45, NB = 54;
  const bearings = [];
  for (let i = 0; i <= NB; i++) bearings.push(A0 + ((A1 - A0) * i) / NB);

  // ── two terraces cut into the face ─────────────────────────────────────────
  const terrace = (targetH, depth0, lift) => {
    const pos = [], cols = [];
    const tri = (A, B, C, shade) => {
      for (const v of [A, B, C]) pos.push(v[0], v[1], v[2]);
      for (let i = 0; i < 3; i++) {
        const c = rockLo.clone().lerp(rockMid, 0.45 + 0.35 * r()).lerp(rockTop, shade);
        c.multiplyScalar(0.88 + 0.24 * r());
        cols.push(c.r, c.g, c.b);
      }
    };
    let run = [];
    const flush = () => {
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i], b = run[i + 1];
        // shelf top (sugar-dusted) …
        tri(a.in, b.in, a.out, 0.55); tri(b.in, b.out, a.out, 0.55);
        // … and the face that drops off its lip
        tri(a.out, b.out, a.low, 0.05); tri(b.out, b.low, a.low, 0.05);
      }
      run = [];
    };
    for (const a of bearings) {
      const rad = contour(a, targetH);
      // The seaward face averages 0.34 rise/run with 0.8–1.0 at the lip, so a
      // strict "only where it is steep" gate produced NO ledges at all. The gate
      // is now generous (the ±1.3-unit contours within 13 units, i.e. slope
      // > 0.2) and the shelf itself does the work: it projects out of the slope
      // far enough that its riser is a real 1.5–2 unit step.
      const rUp = contour(a, targetH + 1.3), rDn = contour(a, targetH - 1.3);
      if (rad < 0 || rUp < 0 || rDn < 0 || rDn - rUp > 13.0) { flush(); continue; }
      const cx = Math.cos(a), cz = Math.sin(a);
      const d = depth0 * (0.70 + 0.62 * (0.5 + 0.5 * Math.sin(a * 5.3 + targetH)));
      const ix = CX + cx * (rad - 1.2), iz = CZ + cz * (rad - 1.2);
      const ox = CX + cx * (rad + d), oz = CZ + cz * (rad + d);
      const top = targetH + lift;
      const low = Math.min(top - 1.45, world.height(ox, oz) - 0.10);
      run.push({
        in: [ix, Math.max(world.height(ix, iz) + 0.12, top - 0.35), iz],
        out: [ox, top, oz],
        low: [ox + cx * 0.5, low, oz + cz * 0.5],
      });
    }
    flush();
    if (pos.length) acc.addRaw(pos, cols);
    return pos.length / 9;
  };
  const ledgeTris = terrace(6.0, 4.2, 0.55) + terrace(3.0, 3.6, 0.48);

  // ── sugar-sand drifts on the beach below ──────────────────────────────────
  const lumps = [];   // { x, z, r, v0, v1, coll } — culled against api.interiors
  const drift = blob(hash('cliff-sand'), 1, 0.18);
  for (let i = 0; i < 14; i++) {
    const a = A0 + (A1 - A0) * ((i + 0.35 * r()) / 14);
    const rad = contour(a, 0.95 + r() * 0.8);
    if (rad < 0) continue;
    const x = CX + Math.cos(a) * (rad + 1.5 + r() * 5), z = CZ + Math.sin(a) * (rad + 1.5 + r() * 5);
    const g = world.height(x, z);
    if (g < -1.2 || g > 2.2) continue;
    if (inArchCore(world, x, z, 3.0)) continue;
    const v0 = acc.n;
    m.compose(new THREE.Vector3(x, g + 0.14, z), q.setFromEuler(e.set(0, r() * TAU, 0)),
      new THREE.Vector3(2.6 + r() * 2.6, 0.20 + r() * 0.14, 1.9 + r() * 2.0));
    acc.add(drift, m, sugar, (c) => c.multiplyScalar(0.90 + 0.16 * r()));
    lumps.push({ x, z, r: acc.radiusXZ(v0, acc.n, x, z), v0, v1: acc.n, coll: null });
  }

  // ── gumdrop boulders: on the ledges and spilled down onto the sand ────────
  const shapes = [blob(811, 1, 0.15), blob(922, 1, 0.22), blob(733, 1, 0.11)];
  const taken = [];
  let boulders = 0;
  for (let i = 0; i < 130 && boulders < 30; i++) {
    const a = A0 + (A1 - A0) * r();
    const tier = r();
    const targetH = tier < 0.34 ? 5.6 : tier < 0.68 ? 2.7 : 1.0;
    const rad = contour(a, targetH);
    if (rad < 0) continue;
    const off = tier < 0.68 ? 1.0 + r() * 2.4 : 2.0 + r() * 7.0;
    const x = CX + Math.cos(a) * (rad + off), z = CZ + Math.sin(a) * (rad + off);
    const g = world.height(x, z);
    if (g < -1.0 || g > 8.0) continue;
    const s = 1.8 + r() * 3.2;
    let clash = false;
    for (const t of taken) if (Math.hypot(t[0] - x, t[1] - z) < t[2] + s * 0.8 + 1.6) { clash = true; break; }
    if (clash) continue;
    if (inArchCore(world, x, z, s * 0.5)) continue;
    taken.push([x, z, s]);
    const v0 = acc.n;
    // most are sugar-rock; one in three is an actual gumdrop boulder
    const gum = r() < 0.52;
    const col = gum ? colorOf(hues[Math.floor(r() * hues.length)]) : rockMid.clone();
    m.compose(new THREE.Vector3(x, g + s * 0.34, z), q.setFromEuler(e.set((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5)),
      new THREE.Vector3(s, s * (0.68 + r() * 0.4), s * (0.88 + r() * 0.3)));
    acc.add(shapes[Math.floor(r() * shapes.length)], m, col, (c, px, py) => {
      c.multiplyScalar(0.82 + 0.26 * r());
      c.lerp(colorOf(0xffffff), smooth(g + s * 0.3, g + s * 1.05, py) * (gum ? 0.16 : 0.30));
    });
    const coll = s > 1.9 ? { x, z, r: s * 0.62 } : null;
    if (coll) pushCollider(ctx, coll);
    lumps.push({ x, z, r: acc.radiusXZ(v0, acc.n, x, z), v0, v1: acc.n, coll });
    boulders++;
  }

  const geo = acc.geometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0, flatShading: true });
  patchMaterial(mat, {
    key: 'terrain-cliffs', uniforms: { ...uniforms },
    vertexHead: 'varying vec3 vWPos; varying vec3 vWNor;',
    vertexBody: 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNor = normalize(mat3(modelMatrix) * objectNormal);',
    fragmentHead: GLSL_NOISE + 'varying vec3 vWPos; varying vec3 vWNor; uniform float uDaylight;',
    fragmentColor: /* glsl */`
      {
        // bedding strata: horizontal on the shelves, vertical striations on the
        // steep faces — the pair is what reads as "cliff" at game distance
        float up = clamp(vWNor.y, 0.0, 1.0);
        float bed = sin(vWPos.y * 2.3 + tFbm2(vWPos.xz * 0.35) * 3.2);
        float vein = sin(dot(vWPos.xz, vec2(0.78, -0.62)) * 2.2 + tFbm2(vWPos.xz * 0.2) * 4.0);
        diffuseColor.rgb *= 0.93 + 0.11 * bed + 0.09 * vein * (1.0 - up);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + vec3(0.02),
                               smoothstep(0.6, 0.98, bed) * up * 0.5);
      }`,
    fragmentEmissive: /* glsl */`
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float rim = pow(1.0 - clamp(dot(normalize(vWNor), V), 0.0, 1.0), 2.4);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.14 * mix(0.5, 0.85, uDaylight);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_cliffs';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  cullInsideInteriors(ctx, mesh, lumps, 'cliffs');
  return { mesh, tris: acc.tris, ledgeTris, boulders };
}

// ── Cat Island decor: harbour quay + bluff stone ─────────────────────────────
export function buildCatDecor(ctx, uniforms) {
  const { world } = ctx;
  const acc = new Accum();
  const r = rng(hash('terrain-cat-decor'));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  // Warm ochre, never grey: the old 0xbdb2a0 stone read as unpainted concrete
  // on a sunny Mediterranean beach and every critic flagged it.
  const capCream = colorOf(0xe6d6b0), quayTan = colorOf(0xc9a978), quayBase = colorOf(0x8e6f4a);
  const ochre = colorOf(0xc79a5f), ochreDark = colorOf(0x7f5c33), wood = colorOf(CAT.wood);
  const lumps = [];   // { x, z, r, v0, v1, coll } — culled against api.interiors

  // ── Fish Harbor quay: ONE continuous low stone wall with a capstone ───────
  // Was: a ring of 1.1 × 1.5 × 2.0 grey boxes dropped on the waterline, which
  // read at any distance as a row of concrete blocks left on the sand. A quay is
  // a single built edge, so this is a continuous ribbon — outer face, capstone,
  // short inner face — and it exists ONLY along the harbour frontage
  // (88–112 × 48–68). Anywhere else that ring was just litter on a beach.
  {
    const cx = 100, cz = 58, DECK = 3.4;
    const inFrontage = (x, z) => x > 88 && x < 112 && z > 48 && z < 68;
    const pos = [], cols = [];
    const push = (v, col, shade) => {
      pos.push(v[0], v[1], v[2]);
      const c = col.clone().multiplyScalar(shade);
      cols.push(c.r, c.g, c.b);
    };
    const quad = (A, B, C, D, col, sa, sb) => {   // A,B on one rib; C,D on the next
      push(A, col, sa); push(C, col, sa); push(B, col, sb);
      push(B, col, sb); push(C, col, sa); push(D, col, sb);
    };
    let run = [];
    const flush = () => {
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i], b = run[i + 1];
        quad(a.back, a.front, b.back, b.front, capCream, a.sh, b.sh);            // capstone
        quad(a.front, a.foot, b.front, b.foot, quayTan, a.sh, b.sh);             // seaward face
        quad(a.heel, a.back, b.heel, b.back, quayTan, a.sh * 0.9, b.sh * 0.9);   // landward face
      }
      run = [];
    };
    let bollard = 0;
    for (let a = 0; a <= 260; a++) {
      const ang = (a / 260) * TAU;
      const ux = Math.cos(ang), uz = Math.sin(ang);
      let hit = -1;
      for (let rad = 6; rad < 30; rad += 0.3) {
        if (world.height(cx + ux * rad, cz + uz * rad) < 2.45) { hit = rad; break; }
      }
      const x = cx + ux * (hit - 0.35), z = cz + uz * (hit - 0.35);
      if (hit < 0 || !inFrontage(x, z)) { flush(); continue; }
      const capY = DECK + 0.18 + Math.sin(ang * 7.0) * 0.05;
      const gOut = world.height(x + ux * 0.9, z + uz * 0.9);
      run.push({
        back: [x - ux * 0.52, capY, z - uz * 0.52],
        front: [x + ux * 0.52, capY, z + uz * 0.52],
        foot: [x + ux * 0.72, Math.min(gOut - 0.25, capY - 1.9), z + uz * 0.72],
        heel: [x - ux * 0.52, Math.min(world.height(x - ux * 0.9, z - uz * 0.9) - 0.2, capY - 0.5), z - uz * 0.52],
        sh: 0.90 + 0.16 * (0.5 + 0.5 * Math.sin(ang * 23.0)),
      });
      // mooring bollards along the cap
      if (++bollard % 26 === 4) {
        const bol = new THREE.CylinderGeometry(0.30, 0.34, 1, 7);
        m.compose(new THREE.Vector3(x, capY + 0.42, z), q.setFromEuler(e.set(0, r() * TAU, 0)), new THREE.Vector3(1, 0.95, 1));
        acc.add(bol, m, wood, (c) => c.multiplyScalar(0.85 + r() * 0.25));
      }
    }
    flush();
    if (pos.length) {
      // darken the last metre of the seaward face so the wall has a wet base
      for (let i = 0; i < pos.length / 3; i++) {
        const y = pos[i * 3 + 1];
        const t = Math.min(1, Math.max(0, (DECK + 0.05 - y) / 1.5));
        const k = 1 - t * 0.42;
        cols[i * 3] = cols[i * 3] * k + quayBase.r * t * 0.30;
        cols[i * 3 + 1] = cols[i * 3 + 1] * k + quayBase.g * t * 0.30;
        cols[i * 3 + 2] = cols[i * 3 + 2] * k + quayBase.b * t * 0.30;
      }
      acc.addRaw(pos, cols);
    }
  }

  // ── bluff boulders: lighthouse headland, Yarn Hill, escape beach ──────────
  // Rounded WARM OCHRE boulders with a darker, damp-looking base and a
  // sun-bleached crown. The old versions were flat grey and the lowest-detail
  // blob (detail 0, 20 faces) is a faceted lump that reads as a cut block, so
  // every stone is now at least detail 1 and noticeably squashed.
  {
    // lobed, not faceted: a high radial jitter at detail 1 gives a boulder a
    // bumpy silhouette instead of the polystyrene-block read
    const shapes = [blob(511, 1, 0.36), blob(622, 1, 0.27), blob(733, 1, 0.44), blob(844, 2, 0.22)];
    const zones = [
      { x: 218, z: 30, r0: 5, r1: 17, n: 17, s: [0.9, 4.4] },
      { x: 188, z: -64, r0: 8, r1: 22, n: 18, s: [1.0, 5.2] },
      { x: 228, z: -6, r0: 4, r1: 14, n: 11, s: [0.8, 3.6] },
    ];
    for (const zn of zones) {
      for (let i = 0; i < zn.n; i++) {
        const ang = r() * TAU, rad = zn.r0 + Math.sqrt(r()) * (zn.r1 - zn.r0);
        const x = zn.x + Math.cos(ang) * rad, z = zn.z + Math.sin(ang) * rad;
        const g = world.height(x, z);
        if (g < 0.3) continue;
        const s = zn.s[0] + r() * (zn.s[1] - zn.s[0]);
        // The Watchtower stands in the middle of zone 1: its plinth is 5.9 u
        // across and its ground floor is an enterable room. Keep off the core.
        if (inArchCore(world, x, z, s * 0.5)) continue;
        const v0 = acc.n;
        m.compose(new THREE.Vector3(x, g + s * 0.24, z), q.setFromEuler(e.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3)),
          new THREE.Vector3(s * (0.95 + r() * 0.45), s * (0.48 + r() * 0.34), s * (0.95 + r() * 0.45)));
        const warm = r() < 0.30 ? ochreDark : ochre;
        acc.add(shapes[Math.floor(r() * shapes.length)], m, warm, (c, px, py) => {
          c.multiplyScalar(0.88 + r() * 0.22);
          c.lerp(ochreDark, (1 - smooth(g - 0.1, g + s * 0.55, py)) * 0.62);      // darker, damp base
          c.lerp(colorOf(0xf0dcb4), smooth(g + s * 0.35, g + s * 0.95, py) * 0.30); // sun-bleached crown
        });
        lumps.push({ x, z, r: acc.radiusXZ(v0, acc.n, x, z), v0, v1: acc.n, coll: null });
        if (s > 2.4) { const c = { x, z, r: s * 0.55 }; lumps[lumps.length - 1].coll = c; pushCollider(ctx, c); }
      }
    }
  }

  const geo = acc.geometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, flatShading: true });
  patchMaterial(mat, {
    key: 'terrain-cat-decor', uniforms: { ...uniforms },
    vertexHead: 'varying vec3 vWPos;',
    vertexBody: 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragmentHead: GLSL_NOISE + 'varying vec3 vWPos;',
    fragmentColor: /* glsl */`
      {
        // bedding strata: enough to read as rock, not enough to stripe it
        float band = sin(vWPos.y * 3.0 + tFbm2(vWPos.xz * 0.45) * 3.2);
        diffuseColor.rgb *= 0.92 + 0.13 * band + 0.09 * (tFbm(vWPos.xz * 1.3) - 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.10, 0.98),
                               smoothstep(0.55, 0.95, band) * 0.5);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_cat_decor';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  cullInsideInteriors(ctx, mesh, lumps, 'cat_decor');
  return { mesh, tris: acc.tris };
}
