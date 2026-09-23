// ─────────────────────────────────────────────────────────────────────────────
// WEAPONS — what happens when you click with something in your hand.
//
// Input (wave-2 contract): LEFT-CLICK (a click, not a camera drag) or X.
// Hold either down and the weapon repeats at its own cadence. Space is the
// player's jump and is never read here.
//
//   bat          MELEE  2.2 u arc, 110° in front of your facing, knockback + stars
//   salt shaker  LOB    a shaker of salt arcs 6 u, bursts over 2.5 u, leaves a dusting
//   slingshot    SHOT   a gumball flies 14 u straight, first thing it touches gets it
//   spritzer /   SPRAY  5 u cone, 60°, continuous, 0.2 s cadence. Melts Sour Patch
//   spray bottle        Kids (kind 'spray'), makes cats flee, and DISSOLVES salt patches
//   salt gun     SALT   fires a blob that lands up to 6 u away and leaves a salt patch
//                       (r 1.2). Consecutive patches draw lines and rings, and the
//                       Kids will not cross them: ctx.systems.weapons.saltPatches
//   caramelizer  FIRE   a 25 u heat bolt. burn(point, 2.5): every system's onBurn()
//                       gets a chance to remove its own props; anything small the ray
//                       hit shrinks to nothing with fire, ash and a scorch mark
// WAVE 3 (Contract C) — inventory/volley.js does the flying, this file the arms:
//   jawbreaker_cannon 'cannon' · licorice_whip 'whip' · poprocks 'poprocks'
//   bubblegum_blower 'gum' · marshmallow_launcher 'marshmallow'
//   peppermint_boomerang 'boomerang' · water_balloon 'water'   (id → hit name)
//
// PUBLIC API  use() · burn(point, radius) · saltPatches [{x,z,r}] · addSaltPatch(x,z,r)
//             clearSaltPatches() · isSalted(x,z) · targets() · help · stats()
// EVENTS      emits 'weapon:use' { weapon (item id), hit (name sent to enemies), hits, kind, x, z }
//             · 'weapon:burn' { x, z, r }
//             listens 'player:stomp' { x, z, r }
// Enemy hooks ctx.systems.sourPatch.hit(kid, info) / catCitizens.hit(cat, info) with
//             { weapon, power, from:{x,z}, kind }. If a system has no hit(), we push
//             the target away ourselves so something always visibly happens.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat, clamp, lerp, smoothstep, damp } from '../core/util.js';
import { VISUALS, buildVisual, buildSaltPatch, buildPellet, applyPickupGlow } from './inventory/items.js';
import { createVolley } from './inventory/volley.js';
import { createFx } from './inventory/fx.js';

const COOLDOWN = {
  melee: 0.55, lob: 0.65, shot: 0.45, spray: 0.2, saltgun: 0.5, fire: 0.7,
  cannon: 1.0, whip: 0.62, poprocks: 0.7, gum: 0.5, marsh: 0.34, boomerang: 0.3, balloon: 0.6,
};
const DUR = {
  melee: 0.5, lob: 0.46, shot: 0.34, spray: 0.2, saltgun: 0.42, fire: 0.36,
  cannon: 0.6, whip: 0.5, poprocks: 0.46, gum: 0.38, marsh: 0.3, boomerang: 0.46, balloon: 0.46,
};
// fraction of DUR at which the thing actually leaves your hand
const RELEASE = {
  melee: 0.34, lob: 0.46, shot: 0.42, spray: 0.0, saltgun: 0.3, fire: 0.18,
  cannon: 0.16, whip: 0.4, poprocks: 0.46, gum: 0.2, marsh: 0.14, boomerang: 0.44, balloon: 0.46,
};
const ACTION = { melee: 'swing', whip: 'swing', spray: 'spray' };      // anything else: 'throw'
const AMMO_WORDS = {
  salt: 'salt', gumballs: 'gumballs', saltgun: 'salt', fuel: 'fuel', jawbreakers: 'jawbreakers',
  poprocks: 'Pop Rocks', gum: 'bubblegum', marshmallows: 'marshmallows', balloons: 'water balloons',
};
const MELEE_R = 2.2, MELEE_ARC = Math.PI * 110 / 180;
const LOB_RANGE = 6.0, LOB_AREA = 2.5;
const SHOT_RANGE = 14, SHOT_SPEED = 26, SHOT_R = 0.85;
const SPRAY_RANGE = 5.0, SPRAY_ARC = Math.PI / 3;
const SALT_R = 1.2, SALT_MAX = 96;
const FIRE_RANGE = 25, FIRE_SPEED = 62, BURN_R = 2.5, SCORCH_MAX = 28;

export function create(ctx) {
  const world = ctx.world;
  const group = new THREE.Group();
  group.name = 'weapons';
  ctx.scene.add(group);

  const warned = new Set();
  const warn = (k, e) => { if (!warned.has(k)) { warned.add(k); console.warn(`[weapons] ${k}:`, e?.message || e); } };

  // muzzle bursts, trail ribbons, impact splats (inventory/fx.js): ≤ 2 calls
  let fx = null;
  try { fx = createFx(ctx, group); } catch (err) { warn('fx init', err); }

  // ── the thing in your right hand ───────────────────────────────────────────
  // Same geometry builders AND the same rim/heat shader as the pickup pools, so
  // the Caramelizer you saw glowing in the grass is the Caramelizer in your fist
  // (a fraction less rim, because a thing 40 cm from the camera needs no help).
  const heldMat = applyPickupGlow(
    mat(0xffffff, { vertexColors: true, roughness: 0.34, metalness: 0.0 }),
    { rim: 0.26, glow: 1.25 },
  );
  const heldGeos = new Map();
  // NB: the pickup pools bake a halo ring into their geometry — right for a
  // thing floating in a meadow, absurd for a thing in your fist. Held items get
  // their own plain bake (one per weapon you ever hold).
  function geoFor(key) {
    if (!heldGeos.has(key)) heldGeos.set(key, buildVisual(key).geo);
    return heldGeos.get(key);
  }
  // Drawn AFTER the visitor's through-geometry silhouette (renderOrder 9990,
  // player/visitor.js): a big weapon carried in front of the chest is ≥ 0.75 u
  // in front of the torso, so as an ordinary opaque it would trip that pass
  // and get a cream-orange ghost of the body painted over it. In the
  // transparent queue at 9995 (opacity 1, depth write on) it looks identical
  // but is not in the depth buffer yet when the silhouette tests.
  heldMat.transparent = true; heldMat.opacity = 1; heldMat.depthWrite = true;
  const heldMesh = new THREE.Mesh(new THREE.BufferGeometry(), heldMat);
  heldMesh.renderOrder = 9995;
  heldMesh.castShadow = true; heldMesh.visible = false;
  heldMesh.userData.noFade = true; heldMesh.userData.noRay = true;
  let heldKey = null, heldParent = null;

  function attachHeld() {
    const pl = ctx.systems.player;
    const hand = pl?.visitor?.nodes?.armR?.el || pl?.visitor?.nodes?.armR?.sh || pl?.group;
    if (hand && hand !== heldParent) { hand.add(heldMesh); heldParent = hand; }
  }
  let releasedT = 0;
  function syncHeld() {
    const inv = ctx.systems.inventory;
    const d = inv?.heldDef?.();
    const key = d?.visual || null;
    if (key !== heldKey) {
      heldKey = key;
      if (key && VISUALS[key]) {
        heldMesh.geometry = geoFor(key);
        const h = VISUALS[key].hold || { pos: [0, -0.28, 0.04], rot: [2.5, 0, 0], scale: 1 };
        heldMesh.position.set(...h.pos);
        heldMesh.rotation.set(...h.rot);
        heldMesh.scale.setScalar(h.scale ?? 1);
        attachHeld();
      }
    }
    // What is actually in the fist this frame: nothing while the boomerang is
    // out, nothing for a beat after a throw, nothing once the last balloon /
    // pouch is gone.
    let show = !!(key && VISUALS[key]);
    if (show && d) {
      if (volley?.handEmpty(d.mode)) show = false;
      else if (d.throwable && (releasedT > 0 || (d.ammo && (inv.ammo?.[d.ammo] || 0) <= 0))) show = false;
    }
    heldMesh.visible = show;
  }
  /** World position of the right fist (for the whip's lash). */
  function handPos(v) {
    if (heldParent && heldMesh.parent) { heldParent.updateWorldMatrix(true, false); return v.setFromMatrixPosition(heldParent.matrixWorld); }
    const p = ctx.systems.player?.position;
    return p ? v.set(p.x, p.y + 1.0, p.z) : v.set(0, 1, 0);
  }

  // ── instanced decals: salt patches + scorch marks ──────────────────────────
  const discGeo = buildSaltPatch().geo;
  const saltMat = mat(0xffffff, {
    vertexColors: true, roughness: 0.42, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const scorchMat = mat(0x2a2018, {
    vertexColors: true, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const saltMesh = new THREE.InstancedMesh(discGeo, saltMat, SALT_MAX);
  const scorchMesh = new THREE.InstancedMesh(discGeo, scorchMat, SCORCH_MAX);
  for (const m of [saltMesh, scorchMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
    m.count = 0; m.userData.noRay = true;
    group.add(m);
  }
  const saltPatches = [];        // [{ x, z, r, y, grow }]  ← read by the sour patch kids
  const scorches = [];

  function addSaltPatch(x, z, r = SALT_R) {
    for (const p of saltPatches) {
      if (Math.hypot(p.x - x, p.z - z) < r * 0.5) { p.r = Math.max(p.r, r); return p; }
    }
    const p = { x, z, r, y: Math.max(0.02, world.height(x, z)) + 0.05, grow: 0, spin: (saltPatches.length * 1.7) % 6.28 };
    saltPatches.push(p);
    while (saltPatches.length > SALT_MAX) saltPatches.shift();
    return p;
  }
  function addScorch(x, z, r) {
    scorches.push({ x, z, r, y: Math.max(0.02, world.height(x, z)) + 0.04, grow: 0, spin: (scorches.length * 2.3) % 6.28 });
    while (scorches.length > SCORCH_MAX) scorches.shift();
  }
  const isSalted = (x, z) => saltPatches.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);

  // ── projectiles (one instanced ball for all of them) ───────────────────────
  const pelletGeo = buildPellet().geo;
  const pelletMat = mat(0xffffff, { vertexColors: true, roughness: 0.4, metalness: 0 });
  const pellets = new THREE.InstancedMesh(pelletGeo, pelletMat, 24);
  pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pellets.castShadow = false; pellets.frustumCulled = false; pellets.count = 0;
  pellets.userData.noRay = true;
  {
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < 24; i++) pellets.setColorAt(i, c);
  }
  group.add(pellets);
  const shots = [];

  // ── targets ────────────────────────────────────────────────────────────────
  // Recycled target records: projectiles sweep against these every frame, so
  // building fresh objects here was the one per-frame allocation in the file.
  const _targets = [];
  const _tpool = [];
  function tslot(ref, sys, sysName, x, z, name) {
    const t = _tpool[_targets.length] || (_tpool[_targets.length] = {});
    t.ref = ref; t.sys = sys; t.sysName = sysName; t.x = x; t.z = z; t.name = name;
    _targets.push(t);
  }
  function targets() {
    _targets.length = 0;
    const sp = ctx.systems.sourPatch;
    if (sp?.kids) for (const k of sp.kids) {
      if (k.vis !== undefined && k.vis < 0.25) continue;
      tslot(k, sp, 'sourPatch', k.x ?? k.pos?.x ?? 0, k.z ?? k.pos?.z ?? 0, k.name || 'kid');
    }
    const cc = ctx.systems.catCitizens;
    if (cc?.cats) for (const c of cc.cats) {
      tslot(c, cc, 'catCitizens', c.x ?? c.pos?.x ?? 0, c.z ?? c.pos?.z ?? 0, c.name || 'cat');
    }
    return _targets;
  }

  const pushes = [];
  function pushBack(t, info) {
    const dx = t.x - info.from.x, dz = t.z - info.from.z;
    const d = Math.hypot(dx, dz) || 1;
    const s = 4.2 * (info.power || 2);
    pushes.push({ ref: t.ref, vx: dx / d * s, vz: dz / d * s, t: 0.35 });
  }

  /** Tell an enemy system it was hit; if it has no hook, shove the target ourselves. */
  function strike(t, info) {
    let handled = false;
    try {
      if (typeof t.sys?.hit === 'function') { t.sys.hit(t.ref, info); handled = true; }
    } catch (err) { warn('hit hook (' + t.sysName + ')', err); }
    if (!handled) pushBack(t, info);
    return true;
  }

  function hitArea(x, z, r, info) {
    let n = 0;
    for (const t of targets()) {
      if (Math.hypot(t.x - x, t.z - z) > r) continue;
      strike(t, { ...info, from: info.from || { x, z } });
      n++;
    }
    return n;
  }

  // ── burning things down ────────────────────────────────────────────────────
  const shrinks = [];
  const _ray = new THREE.Raycaster();
  _ray.layers.set(0);
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  const _mtx = new THREE.Matrix4(), _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3();

  function skipped(obj) {
    const inv = ctx.systems.inventory?.group, pg = ctx.systems.player?.group;
    const pools = ctx.systems.particles?.pools;
    for (let o = obj; o; o = o.parent) {
      if (o === group || o === inv || o === pg) return true;
      if (o.userData?.noRay) return true;
      if (pools && (o === pools.normal?.mesh || o === pools.additive?.mesh)) return true;
    }
    const m = obj.material;
    if (m && (m.depthWrite === false || m.isMeshBasicMaterial)) return true;
    return false;
  }

  /** First solid thing a ray from `o` along `d` meets, or null. */
  function castOne(o, d, far) {
    _ray.set(o, d); _ray.far = far; _ray.near = 0.05;
    let hits;
    try { hits = _ray.intersectObjects(ctx.scene.children, true); }
    catch (err) { warn('raycast', err); return null; }
    for (const h of hits) {
      if (!h.object?.visible) continue;
      if (skipped(h.object)) continue;
      return h;
    }
    return null;
  }

  /** Destroy what the ray found: instanced blades vanish, small meshes shrink away. */
  function consume(hit) {
    const o = hit.object;
    if (!o || o.userData.burned) return false;
    if (o.isInstancedMesh && hit.instanceId != null) {
      const key = 'i' + hit.instanceId;
      if (o.userData[key]) return false;
      o.userData[key] = 1;
      o.getMatrixAt(hit.instanceId, _mtx);
      _mtx.decompose(_p2, _q2, _s2);
      shrinks.push({ mesh: o, id: hit.instanceId, p: _p2.clone(), q: _q2.clone(), s: _s2.clone(), t: 0, dur: 0.5 });
      return true;
    }
    const g = o.geometry;
    if (!g) return false;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const sc = Math.max(o.scale.x, o.scale.y, o.scale.z) || 1;
    if ((g.boundingSphere?.radius || 99) * sc > 6) return false;      // too big to burn: scorch only
    o.userData.burned = true;
    shrinks.push({ obj: o, s: o.scale.clone(), t: 0, dur: 0.6 });
    return true;
  }

  /**
   * THE DESTRUCTION CONTRACT. Every system gets first refusal via api.onBurn,
   * then we raycast around the point and eat whatever small geometry is there.
   */
  function burn(point, radius = BURN_R, seedHit = null) {
    const P = point.isVector3 ? point : new THREE.Vector3(point.x, point.y ?? world.height(point.x, point.z), point.z);
    for (const name in ctx.systems) {
      const s = ctx.systems[name];
      if (!s || s === api || typeof s.onBurn !== 'function') continue;
      try { s.onBurn({ x: P.x, y: P.y, z: P.z }, radius); } catch (err) { warn('onBurn (' + name + ')', err); }
    }
    let eaten = 0;
    if (seedHit && consume(seedHit)) eaten++;
    _o.set(P.x, P.y + 0.55, P.z);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      _d.set(Math.cos(a), -0.18, Math.sin(a)).normalize();
      const h = castOne(_o, _d, radius);
      if (h && consume(h)) eaten++;
    }
    const hits = hitArea(P.x, P.z, radius * 1.15, { weapon: 'fire', power: 3, kind: 'throw', from: { x: P.x, z: P.z } });
    fireBurst(P, radius, eaten);
    addScorch(P.x, P.z, radius * 0.78);
    ctx.events.emit('weapon:burn', { x: P.x, z: P.z, r: radius, eaten, hits });
    return { eaten, hits };
  }

  // ── particle flavours ──────────────────────────────────────────────────────
  const P = () => ctx.systems.particles;
  function stars(x, y, z) {
    P()?.burst({ x, y, z, count: 12, shape: 'sparkle', blend: 'add', color: [0xffe23a, 0xfff6b0, 0xffb03a], speed: 4.2, up: 0.9, life: 0.55, lifeVar: 0.3, size: 0.5, sizeEnd: 0.06, gravity: -5, drag: 2.4, spread: 0.5, spin: 3 });
    P()?.burst({ x, y, z, count: 6, shape: 'confetti', color: [0xffffff, 0xffe23a], speed: 3.4, life: 0.6, size: 0.2, gravity: -8, spread: 0.5, spin: 8 });
  }
  function saltBurst(x, y, z, r) {
    P()?.burst({ x, y, z, count: 26, shape: 'puff', color: [0xffffff, 0xf2f6ff], colorEnd: 0xffffff, speed: 2.6 * r, up: 0.5, life: 0.9, lifeVar: 0.35, size: 0.34, sizeEnd: 0.9, sizeVar: 0.4, gravity: -2.4, drag: 2.6, spread: 0.5 * r, alpha: 0.8 });
    P()?.sparkle(x, y + 0.2, z, 0xffffff, 12);
  }
  function mist(x, y, z, dir, color) {
    P()?.burst({
      x: x + dir.x * 0.7, y, z: z + dir.z * 0.7, count: 7, shape: 'puff',
      color: [color, 0xffffff], colorEnd: 0xffffff,
      speed: 1.1, up: 0.25, life: 0.5, lifeVar: 0.3, size: 0.16, sizeEnd: 0.62, sizeVar: 0.4,
      gravity: -1.1, drag: 1.5, spread: 0.24, alpha: 0.55,
    });
    // the cone itself, thrown forward
    const o = { x: x + dir.x * 1.9, y: y - 0.1, z: z + dir.z * 1.9, count: 5, shape: 'puff', color: [color, 0xffffff], colorEnd: 0xffffff, speed: 0.8, up: 0.2, life: 0.62, size: 0.3, sizeEnd: 1.1, sizeVar: 0.4, gravity: -0.8, drag: 1.2, spread: 1.1, alpha: 0.4 };
    P()?.burst(o);
  }
  function fizz(x, y, z) {
    P()?.burst({ x, y: y + 0.1, z, count: 14, shape: 'sparkle', blend: 'add', color: [0xffffff, 0xcfe8ff], speed: 1.6, up: 1.1, life: 0.5, size: 0.3, sizeEnd: 0.04, gravity: 1.2, drag: 2.4, spread: 0.8 });
  }
  function fireBurst(p, r, eaten) {
    P()?.burst({ x: p.x, y: p.y + 0.4, z: p.z, count: 22, shape: 'puff', color: [0xffd23a, 0xff6a1a, 0xffffff], colorEnd: 0xff3a1a, speed: 3.4 * r * 0.5, up: 1.4, life: 0.55, lifeVar: 0.3, size: 0.5, sizeEnd: 1.3, sizeVar: 0.4, gravity: 3.2, drag: 2.2, spread: 0.5 * r, alpha: 0.95 });
    P()?.burst({ x: p.x, y: p.y + 0.3, z: p.z, count: 16 + eaten * 8, shape: 'puff', color: [0x3a3028, 0x6b5a4a], colorEnd: 0x9a8a78, speed: 1.6, up: 0.9, life: 1.9, lifeVar: 0.4, size: 0.3, sizeEnd: 1.1, sizeVar: 0.5, gravity: 0.9, drag: 1.1, spread: 0.7, alpha: 0.45, wind: 1.2 });
    P()?.sparkle(p.x, p.y + 0.5, p.z, 0xffb03a, 10);
  }

  // ── the swing / lob / spray poses ──────────────────────────────────────────
  let anim = null;
  const REST = { sx: 0, sz: 0, ex: 0 };
  function pose(name, u) {
    switch (name) {
      case 'melee': {
        if (u < 0.3) { const k = u / 0.3; return { sx: lerp(0, -2.25, k * k), sz: lerp(0, 0.55, k), ex: lerp(0, -1.5, k), tw: lerp(0, 0.5, k) }; }
        if (u < 0.56) { const k = (u - 0.3) / 0.26; return { sx: lerp(-2.25, 1.25, k), sz: lerp(0.55, -0.15, k), ex: lerp(-1.5, -0.1, k), tw: lerp(0.5, -0.65, k) }; }
        { const k = (u - 0.56) / 0.44; return { sx: lerp(1.25, 0, k), sz: lerp(-0.15, 0, k), ex: lerp(-0.1, 0, k), tw: lerp(-0.65, 0, k) }; }
      }
      case 'lob': case 'shot': {
        if (u < 0.45) { const k = u / 0.45; return { sx: lerp(0, -2.5, k), sz: lerp(0, 0.25, k), ex: lerp(0, -1.9, k), tw: lerp(0, 0.35, k) }; }
        if (u < 0.7) { const k = (u - 0.45) / 0.25; return { sx: lerp(-2.5, -0.25, k), sz: lerp(0.25, 0, k), ex: lerp(-1.9, -0.1, k), tw: lerp(0.35, -0.3, k) }; }
        { const k = (u - 0.7) / 0.3; return { sx: lerp(-0.25, 0, k), sz: 0, ex: lerp(-0.1, 0, k), tw: lerp(-0.3, 0, k) }; }
      }
      case 'saltgun': case 'fire': {
        // hip-fire: forearm raised 35° so the forward-carried gun sits level
        // (the same pose the gun is CARRIED in, so a shot starts and ends there)
        const kick = Math.exp(-u * 9) * (u < 0.1 ? u * 10 : 1);
        return { sx: -0.46 - kick * 0.45, sz: -0.14, ex: -0.16 + kick * 0.2, tw: -0.10 * (1 - u) };
      }
      case 'spray': return { sx: -1.05, sz: -0.18, ex: -0.38, tw: -0.1 };
      // ── wave 3 ─────────────────────────────────────────────────────────────
      case 'cannon': case 'gum': case 'marsh': {
        // already aimed (the carry pose), fire at RELEASE, the recoil throws
        // the arm up, and it settles back to the carry
        const r = RELEASE[name], big = name === 'cannon' ? 1 : 0.45;
        const kick = u >= r ? Math.exp(-(u - r) * 9) * Math.min(1, (u - r) * 30) : 0;
        const w = 1 - smoothstep(0.72, 1, u);
        return {
          sx: -0.46 - kick * 0.8 * big, sz: -0.14,
          ex: -0.16 + kick * 0.3 * big, tw: (-0.12 - kick * 0.3 * big) * w,
        };
      }
      case 'whip': {
        // a big overhead wind-up, then the crack comes down and across
        if (u < 0.36) { const k = u / 0.36; return { sx: lerp(0, -2.7, k * k), sz: lerp(0, 0.7, k), ex: lerp(0, -1.3, k), tw: lerp(0, 0.6, k) }; }
        if (u < 0.56) { const k = (u - 0.36) / 0.2; return { sx: lerp(-2.7, 0.9, k), sz: lerp(0.7, -0.3, k), ex: lerp(-1.3, 0, k), tw: lerp(0.6, -0.7, k) }; }
        { const k = (u - 0.56) / 0.44; return { sx: lerp(0.9, 0, k), sz: lerp(-0.3, 0, k), ex: 0, tw: lerp(-0.7, 0, k) }; }
      }
      case 'poprocks': case 'balloon': case 'boomerang': return pose('lob', u);
      default: return REST;
    }
  }

  // ── carrying: a gun rides level at the hip (its hip-fire pose), a balloon /
  // pouch / boomerang is held up at the chest, so what is in your hand reads
  // as IN YOUR HAND at the game camera instead of dangling at knee height ──
  const CARRY = {
    gun: { sx: -0.46, sz: -0.14, ex: -0.16 },
    throw: { sx: -0.32, sz: -0.12, ex: -1.3 },
  };
  let carryK = 0, carryPose = null;
  function carryWanted() {
    const pl = ctx.systems.player;
    if (!pl || !heldMesh.visible || pl.onVehicle || pl.onFerry || ctx.state.vehicle) return null;   // (a scruff-carry sets onFerry)
    const d = ctx.systems.inventory?.heldDef?.();
    const V = d ? VISUALS[d.visual] : null;
    if (!V) return null;
    if (V.gun) return CARRY.gun;
    if (d.throwable || d.mode === 'boomerang') return CARRY.throw;
    return null;
  }
  function applyPose(dt) {
    const n = ctx.systems.player?.visitor?.nodes;
    if (!n?.armR) return;
    const want = carryWanted() || (anim && carryPose && carryK > 0.01 ? carryPose : null);
    if (want) carryPose = want;
    carryK = damp(carryK, want ? 1 : 0, 10, dt);
    const c = carryPose, ck = c ? carryK : 0;
    if (!anim) {
      if (ck < 0.005) return;
      n.armR.sh.rotation.x += (c.sx - n.armR.sh.rotation.x) * ck;
      n.armR.sh.rotation.z += (c.sz + 0.34 - n.armR.sh.rotation.z) * ck;
      n.armR.el.rotation.x += (c.ex - n.armR.el.rotation.x) * ck;
      return;
    }
    const u = clamp(anim.t / anim.dur, 0, 1);
    const p = pose(anim.name, u);
    // an action starts from, and settles back into, the carry pose
    const a = ck > 0 ? smoothstep(0, 0.14, u) * (1 - smoothstep(0.74, 1, u)) : 1;
    const bx = ck > 0 ? c.sx * ck : 0, bz = ck > 0 ? c.sz * ck : 0, be = ck > 0 ? c.ex * ck : 0;
    n.armR.sh.rotation.x = lerp(bx, p.sx, a);
    n.armR.sh.rotation.z = lerp(bz, p.sz ?? 0, a) + 0.34;
    n.armR.el.rotation.x = lerp(be, p.ex ?? 0, a);
    if (n.torso && p.tw) n.torso.rotation.y += p.tw * 0.5;
  }

  // ── firing ─────────────────────────────────────────────────────────────────
  const cd = {};
  let firstUse = true, shotSeq = 0;
  // The first-use hint names ONE weapon ("fire a jawbreaker"); the moment you
  // hold something else it is wrong, so it leaves (ui.toast returns the spec,
  // whose .live is the on-screen toast once it shows).
  let hintToast = null, hintFor = null;
  function expireHint(nowHeld) {
    if (!hintToast || nowHeld === hintFor) return;
    try {
      if (hintToast.live && hintToast.live.life > 0.15) hintToast.live.life = 0.15;
      else if (!hintToast.live) hintToast.secs = 0.01;
    } catch { /* the toast shape is ui.js's business */ }
    hintToast = null;
  }
  const GUMBALLS = [0xff3355, 0x5be27a, 0x3aa8ff, 0xffe23a, 0xb35bff, 0xff8c1a];
  const _from = { x: 0, z: 0 };

  function facing() {
    const pl = ctx.systems.player;
    const f = pl?.facing ?? 0;
    return { x: Math.sin(f), z: Math.cos(f) };
  }
  const _mz = new THREE.Vector3();
  function muzzle() {
    const pl = ctx.systems.player?.position || { x: 0, y: 0, z: 0 };
    const d = facing();
    // a GUN fires from its own muzzle (VISUALS[key].gun, item space), so the
    // jawbreaker leaves the barrel you can see; anything else from the chest
    const g = heldKey && heldMesh.visible && heldMesh.parent ? VISUALS[heldKey]?.gun : null;
    if (g) {
      heldMesh.updateWorldMatrix(true, false);
      _mz.set(g[0], g[1], g[2]).applyMatrix4(heldMesh.matrixWorld);
      const dx = _mz.x - pl.x, dz = _mz.z - pl.z;
      // never behind the body (a stale pose right after a turn): clamp to the front
      if (dx * d.x + dz * d.z > 0.2 && Math.abs(_mz.y - pl.y - 1.0) < 0.9) return { x: _mz.x, y: _mz.y, z: _mz.z, d };
    }
    return { x: pl.x + d.x * 0.5, y: pl.y + 1.08, z: pl.z + d.z * 0.5, d };
  }

  function beginUse(mode) {
    anim = { name: mode, t: 0, dur: DUR[mode] || 0.4, fired: false };
    ctx.systems.player?.playAction?.(ACTION[mode] || 'throw', DUR[mode] || 0.45);
  }

  /** Actually make the weapon do its thing (at the release frame of the animation). */
  function release(mode, d) {
    const inv = ctx.systems.inventory;
    const id = inv?.held;
    const def = inv?.def?.(id) || {};
    const m = muzzle();
    const pl = ctx.systems.player?.position || { x: 0, y: 0, z: 0 };
    _from.x = pl.x; _from.z = pl.z;
    let hits = 0;

    if (mode === 'melee') {
      const fx = d.x, fz = d.z;
      for (const t of targets()) {
        const dx = t.x - pl.x, dz = t.z - pl.z;
        const dist = Math.hypot(dx, dz);
        if (dist > MELEE_R || dist < 0.01) continue;
        const dot = (dx * fx + dz * fz) / dist;
        if (dot < Math.cos(MELEE_ARC / 2)) continue;
        strike(t, { weapon: id, power: def.power ?? 3, from: { x: _from.x, z: _from.z }, kind: 'melee' });
        stars(t.x, world.height(t.x, t.z) + 1.0, t.z);
        fx?.bonk(t.x, world.height(t.x, t.z) + 1.2, t.z, 0xff2d4a, 1.6);
        hits++;
      }
      P()?.burst({ x: m.x + d.x * 1.2, y: m.y - 0.2, z: m.z + d.z * 1.2, count: 7, shape: 'puff', color: [0xffffff, 0xffe6f2], speed: 2.4, life: 0.32, size: 0.18, sizeEnd: 0.5, gravity: -1.5, drag: 3, spread: 0.7, alpha: 0.4 });
    } else if (mode === 'lob') {
      const s = makeArc(m, d, LOB_RANGE, 0.55, 0xffffff, 'salt', aimAt(pl, d, LOB_RANGE + 1.5, 0.7));
      shots.push(s); launchFx(s, m, d, 0x5fd8ff, 0x8fdcff, 0.44);
    } else if (mode === 'saltgun') {
      const s = makeArc(m, d, LOB_RANGE, 0.42, 0xf2f6ff, 'saltgun', null);
      shots.push(s); launchFx(s, m, d, 0x23e0c6, 0x4fe8d8, 0.44);
    } else if (mode === 'shot') {
      const a = aimAt(pl, d, SHOT_RANGE, 0.45);
      let dx = d.x, dz = d.z;
      if (a) { const l = Math.hypot(a.x - m.x, a.z - m.z) || 1; dx = (a.x - m.x) / l; dz = (a.z - m.z) / l; }
      shots.push({
        kind: 'gumball', x: m.x, y: m.y, z: m.z, px: m.x, pz: m.z,
        vx: dx * SHOT_SPEED, vy: 1.2, vz: dz * SHOT_SPEED,
        life: SHOT_RANGE / SHOT_SPEED, t: 0, r: 0.16, color: GUMBALLS[shotSeq++ % GUMBALLS.length],
      });
      launchFx(shots[shots.length - 1], m, d, 0xffa22a, shots[shots.length - 1].color, 0.4);
    } else if (mode === 'fire') {
      _o.set(m.x, m.y, m.z); _d.set(d.x, -0.06, d.z).normalize();
      const hit = castOne(_o, _d, FIRE_RANGE);
      const dist = hit ? hit.distance : FIRE_RANGE;
      const end = { x: m.x + _d.x * dist, y: m.y + _d.y * dist, z: m.z + _d.z * dist };
      shots.push({ kind: 'bolt', x: m.x, y: m.y, z: m.z, vx: _d.x * FIRE_SPEED, vy: _d.y * FIRE_SPEED, vz: _d.z * FIRE_SPEED, life: Math.max(0.04, dist / FIRE_SPEED), t: 0, r: 0.22, color: 0xffb03a, end, hit });
      launchFx(shots[shots.length - 1], m, d, 0xff8a14, 0xff8a14, 0.62, 0.2);
      P()?.burst({ x: m.x + d.x * 0.5, y: m.y, z: m.z + d.z * 0.5, count: 8, shape: 'sparkle', blend: 'add', color: [0xffd23a, 0xff6a1a], speed: 3, life: 0.25, size: 0.4, sizeEnd: 0.05, gravity: 0, drag: 4, spread: 0.2 });
    } else if (mode === 'spray') {
      hits = sprayTick(d, id, def);
    } else if (volley) {
      hits = volley.fire(mode, id, def, d, m, pl);
      releasedT = 0.28;                             // the hand is empty for a beat after a throw
    }
    // projectiles announce themselves when they LAND, so 'weapon:use' always
    // carries the real hit count.
    if (mode === 'melee') ctx.events.emit('weapon:use', { weapon: id, hits, kind: 'melee', x: pl.x, z: pl.z });
    return hits;
  }

  /** Gentle aim assist: the nearest enemy inside a cone, or null. */
  function aimAt(pl, d, range, cosMin) {
    let best = null, bd = Infinity;
    for (const t of targets()) {
      const dx = t.x - pl.x, dz = t.z - pl.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.2) continue;
      if ((dx * d.x + dz * d.z) / dist < cosMin) continue;
      if (dist < bd) { bd = dist; best = t; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  function makeArc(m, d, range, flight, color, kind, aim) {
    const tx = aim ? aim.x : m.x + d.x * range;
    const tz = aim ? aim.z : m.z + d.z * range;
    const ty = Math.max(0.05, world.height(tx, tz)) + 0.08;
    return {
      kind, x: m.x, y: m.y, z: m.z, t: 0, life: flight, r: 0.18, color,
      x0: m.x, y0: m.y, z0: m.z, x1: tx, y1: ty, z1: tz, arc: 1.6,
    };
  }

  /** Muzzle burst at the tip + a trail ribbon that follows the shot. */
  function launchFx(s, m, d, flash, trail, width, age = 0.26) {
    if (!fx) return;
    fx.muzzle(m.x + d.x * 0.3, m.y, m.z + d.z * 0.3, flash, 1.35);
    s.tr = fx.trail(trail, width, age);
    fx.trailPush(s.tr, s.x, s.y, s.z);
  }

  function sprayTick(d, id, def) {
    const pl = ctx.systems.player?.position || { x: 0, y: 0, z: 0 };
    const color = id === 'spritzer' ? 0xf4ff9a : 0xcfeaff;
    mist(pl.x, pl.y + 1.05, pl.z, d, color);
    let hits = 0;
    for (const t of targets()) {
      const dx = t.x - pl.x, dz = t.z - pl.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SPRAY_RANGE || dist < 0.01) continue;
      if ((dx * d.x + dz * d.z) / dist < Math.cos(SPRAY_ARC / 2)) continue;
      strike(t, { weapon: id, power: def.power ?? 1.2, from: { x: pl.x, z: pl.z }, kind: 'spray' });
      hits++;
    }
    // water dissolves salt: the spray bottle is how you take a salt line back down
    for (let i = saltPatches.length - 1; i >= 0; i--) {
      const p = saltPatches[i];
      const dx = p.x - pl.x, dz = p.z - pl.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SPRAY_RANGE + p.r || dist < 0.01) continue;
      if ((dx * d.x + dz * d.z) / dist < Math.cos(SPRAY_ARC / 2) - 0.12) continue;
      saltPatches.splice(i, 1);
      fizz(p.x, p.y, p.z);
    }
    ctx.events.emit('weapon:use', { weapon: id, hits, kind: 'spray', x: pl.x, z: pl.z });
    return hits;
  }

  /** Can we fire right now? Handles ammo + the empty-click. */
  function tryUse() {
    const inv = ctx.systems.inventory;
    const id = inv?.held;
    if (!id) return false;
    const def = inv.def(id);
    const mode = def?.mode;
    if (!mode) return false;
    if ((cd[mode] || 0) > 0) return false;
    if (volley?.busy(mode)) return false;
    if (def.ammo && !inv.useAmmo(def.ammo, 1)) {
      if ((cd.dry || 0) <= 0) {
        cd.dry = 1.2;
        const word = AMMO_WORDS[def.ammo] || def.ammo;
        ctx.systems.ui?.toast(def.ammo === 'fuel' ? 'The Caramelizer is out of fuel.'
          : `Out of ${word}! Look for a glowing ${word} cache, or pick up candy.`, 2.8, { warn: true, icon: 'warn' });
        P()?.burst({ x: ctx.systems.player.position.x, y: ctx.systems.player.position.y + 1.1, z: ctx.systems.player.position.z, count: 4, shape: 'puff', color: 0xcccccc, speed: 1, life: 0.3, size: 0.1, gravity: -2, spread: 0.2, alpha: 0.4 });
      }
      return false;
    }
    cd[mode] = COOLDOWN[mode] || 0.5;
    if (firstUse) {
      firstUse = false;
      hintToast = ctx.systems.ui?.toast(`Click or X: ${def.hint || 'use'}. F swaps what you are holding.`, 4.5, { icon: 'spark' }) || null;
      hintFor = id;
    }
    if (mode === 'spray') { beginUse('spray'); release('spray', facing()); }
    else beginUse(mode);
    return true;
  }

  // ── stomp (the player's C-in-the-air slam) ─────────────────────────────────
  ctx.events.on('player:stomp', (e) => {
    const pl = ctx.systems.player?.position || { x: 0, z: 0 };
    const x = e?.x ?? pl.x, z = e?.z ?? pl.z, r = e?.r ?? 3.4;
    const n = hitArea(x, z, r, { weapon: 'stomp', power: 2.4, kind: 'melee', from: { x, z } });
    if (n) ctx.events.emit('weapon:use', { weapon: 'stomp', hits: n, kind: 'melee', x, z });
  });

  // ── input ──────────────────────────────────────────────────────────────────
  let pDown = false, pT = 0, pDrag = 0, firedDown = false;
  function readInput(dt) {
    const inp = ctx.input, p = inp.pointer;
    let trigger = inp.pressed.has('KeyX');
    let hold = inp.down('KeyX');
    if (p.down && !pDown) { pDown = true; pT = 0; pDrag = 0; firedDown = false; }
    if (pDown) { pT += dt; pDrag += Math.abs(p.dragDX) + Math.abs(p.dragDY); }
    if (!p.down && pDown) {
      pDown = false;
      if (pDrag < 12 && pT < 0.6 && !firedDown) trigger = true;
    }
    if (pDown && pDrag < 12 && pT > 0.25) hold = true;
    return { trigger, hold };
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  const _m4 = new THREE.Matrix4(), _pv = new THREE.Vector3(), _qv = new THREE.Quaternion(), _sv = new THREE.Vector3(), _cv = new THREE.Color();

  function update(dt, ctx) {
    if (releasedT > 0) releasedT -= dt;
    if (hintToast) expireHint(ctx.systems.inventory?.held ?? null);
    syncHeld();
    attachHeld();
    for (const k in cd) if (cd[k] > 0) cd[k] = Math.max(0, cd[k] - dt);

    const pl = ctx.systems.player;
    const blocked = !pl || pl.locked || ctx.state.paused || pl.onFerry || pl.onVehicle || !!ctx.state.vehicle;
    const { trigger, hold } = readInput(dt);
    if (!blocked) {
      const inv = ctx.systems.inventory;
      const mode = inv?.held ? inv.def(inv.held)?.mode : null;
      if (mode) {
        if (trigger) { if (tryUse()) firedDown = true; }
        else if (hold && (cd[mode] || 0) <= 0) { if (tryUse()) firedDown = true; }
      }
    }

    // animation → release
    if (anim) {
      anim.t += dt;
      const u = anim.t / anim.dur;
      if (!anim.fired && u >= (RELEASE[anim.name] ?? 0.4) && anim.name !== 'spray') {
        anim.fired = true;
        release(anim.name, facing());
      }
      applyPose(dt);
      if (anim.t > anim.dur * (anim.name === 'spray' ? 1 : 1.25)) anim = null;
    } else applyPose(dt);

    // projectiles
    let pn = 0;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t += dt;
      const u = clamp(s.t / s.life, 0, 1);
      if (s.x1 !== undefined) {                      // lobbed arc
        s.x = lerp(s.x0, s.x1, u); s.z = lerp(s.z0, s.z1, u);
        s.y = lerp(s.y0, s.y1, u) + Math.sin(u * Math.PI) * s.arc;
      } else {
        if (s.kind === 'gumball') s.vy -= 9 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      }
      let done = s.t >= s.life;
      if (fx && s.tr !== undefined) fx.trailPush(s.tr, s.x, s.y, s.z);
      if (s.kind === 'gumball') {
        if (!done) {
          // swept test: at 26 u/s a frame is nearly a metre, so sample the step
          for (const t of targets()) {
            let near = false;
            for (let k = 0; k <= 2 && !near; k++) {
              const ux = s.px + (s.x - s.px) * (k / 2), uz = s.pz + (s.z - s.pz) * (k / 2);
              if (Math.hypot(t.x - ux, t.z - uz) <= SHOT_R) near = true;
            }
            if (!near) continue;
            strike(t, { weapon: 'slingshot', power: 2, from: { x: s.x0 ?? s.x, z: s.z0 ?? s.z }, kind: 'throw' });
            P()?.burst({ x: s.x, y: s.y, z: s.z, count: 10, shape: 'confetti', color: [s.color, 0xffffff], speed: 3.4, life: 0.5, size: 0.16, gravity: -9, spread: 0.3, spin: 9 });
            fx?.bonk(s.x, s.y + 0.3, s.z, s.color, 1.5);
            ctx.events.emit('weapon:use', { weapon: 'slingshot', hits: 1, kind: 'throw', x: s.x, z: s.z });
            s.scored = true; done = true; break;
          }
          if (!done && s.y < world.height(s.x, s.z) + 0.1) done = true;
        }
        s.px = s.x; s.pz = s.z;
      }
      if (done) {
        shots.splice(i, 1);
        fx?.trailEnd(s.tr);
        if (s.kind === 'salt') {
          saltBurst(s.x1, (s.y1 ?? s.y) + 0.25, s.z1, 1.1);
          if (fx) { fx.puff(s.x1, (s.y1 ?? s.y) + 0.45, s.z1, 0xe6f6ff, 2.0, 0.6); fx.ring(s.x1, s.y1 ?? s.y, s.z1, 0x5fd8ff, LOB_AREA * 2, 0.5); }
          const n = hitArea(s.x1, s.z1, LOB_AREA, { weapon: 'salt', power: 2, kind: 'throw', from: { x: s.x0, z: s.z0 } });
          addSaltPatch(s.x1, s.z1, 0.95);
          ctx.events.emit('weapon:use', { weapon: 'salt', hits: n, kind: 'throw', x: s.x1, z: s.z1 });
        } else if (s.kind === 'saltgun') {
          saltBurst(s.x1, (s.y1 ?? s.y) + 0.2, s.z1, 0.9);
          fx?.ring(s.x1, s.y1 ?? s.y, s.z1, 0x23e0c6, SALT_R * 2.4, 0.4);
          addSaltPatch(s.x1, s.z1, SALT_R);
          ctx.events.emit('weapon:use', { weapon: 'saltgun', hits: 0, kind: 'throw', x: s.x1, z: s.z1 });
        } else if (s.kind === 'gumball') {
          if (!s.scored) {
            P()?.burst({ x: s.x, y: s.y, z: s.z, count: 6, shape: 'puff', color: [s.color, 0xffffff], speed: 1.6, life: 0.4, size: 0.14, sizeEnd: 0.4, gravity: -3, spread: 0.3, alpha: 0.6 });
            ctx.events.emit('weapon:use', { weapon: 'slingshot', hits: 0, kind: 'throw', x: s.x, z: s.z });
          }
        } else if (s.kind === 'bolt') {
          const e = s.end || { x: s.x, y: s.y, z: s.z };
          const r = burn(new THREE.Vector3(e.x, e.y, e.z), BURN_R, s.hit);
          if (fx) { fx.sprite(fx.CELL.burst, e.x, e.y + 0.4, e.z, 0xff8a14, 0.8, 2.6, 0.3, false, 1, 0, 0.45); fx.ring(e.x, world.height(e.x, e.z), e.z, 0xff6a1a, BURN_R * 2, 0.5); }
          ctx.events.emit('weapon:use', { weapon: 'caramelizer', hits: r.hits, kind: 'throw', x: e.x, z: e.z });
        }
        continue;
      }
      if (pn < 24) {
        _pv.set(s.x, s.y, s.z);
        _sv.setScalar(s.kind === 'bolt' ? 1.6 : 1);
        _m4.compose(_pv, _qv.identity(), _sv);
        pellets.setMatrixAt(pn, _m4);
        _cv.set(s.color); pellets.setColorAt(pn, _cv);
        pn++;
        if (s.kind === 'bolt') P()?.burst({ x: s.x, y: s.y, z: s.z, count: 2, shape: 'sparkle', blend: 'add', color: [0xffd23a, 0xff6a1a], speed: 0.6, life: 0.22, size: 0.38, sizeEnd: 0.02, gravity: 0, drag: 3, spread: 0.1 });
        else if (s.kind === 'salt' || s.kind === 'saltgun') P()?.burst({ x: s.x, y: s.y, z: s.z, count: 1, shape: 'puff', color: 0xffffff, speed: 0.2, life: 0.4, size: 0.1, sizeEnd: 0.3, gravity: -1, spread: 0.1, alpha: 0.5 });
      }
    }
    pellets.count = pn;
    pellets.visible = pn > 0;
    try { volley?.update(dt); } catch (err) { warn('volley', err); }
    if (pn) { pellets.instanceMatrix.needsUpdate = true; if (pellets.instanceColor) pellets.instanceColor.needsUpdate = true; }

    // knockback fallback
    for (let i = pushes.length - 1; i >= 0; i--) {
      const p = pushes[i];
      p.t -= dt;
      const k = Math.max(0, p.t / 0.35);
      const nx = (p.ref.x ?? p.ref.pos?.x ?? 0) + p.vx * k * dt;
      const nz = (p.ref.z ?? p.ref.pos?.z ?? 0) + p.vz * k * dt;
      if (world.height(nx, nz) > 0.3) {
        if (p.ref.x !== undefined) { p.ref.x = nx; p.ref.z = nz; }
        if (p.ref.pos) { p.ref.pos.x = nx; p.ref.pos.z = nz; }
      }
      if (p.t <= 0) pushes.splice(i, 1);
    }

    // shrink tweens (things the Caramelizer ate)
    for (let i = shrinks.length - 1; i >= 0; i--) {
      const s = shrinks[i];
      s.t += dt;
      const k = clamp(1 - s.t / s.dur, 0, 1);
      if (s.mesh) {
        _sv.copy(s.s).multiplyScalar(k);
        _m4.compose(s.p, s.q, _sv);
        s.mesh.setMatrixAt(s.id, _m4);
        s.mesh.instanceMatrix.needsUpdate = true;
      } else if (s.obj) {
        s.obj.scale.copy(s.s).multiplyScalar(k);
        if (k <= 0) s.obj.visible = false;
      }
      if (k <= 0) shrinks.splice(i, 1);
    }

    // decals
    const t = ctx.state.elapsed;
    let sn = 0;
    for (const p of saltPatches) {
      if (p.grow < 1) p.grow = Math.min(1, p.grow + dt * 4);
      if (sn >= SALT_MAX) break;
      _pv.set(p.x, p.y, p.z);
      _qv.setFromAxisAngle(UP, p.spin);
      _sv.set(p.r * p.grow, 1, p.r * p.grow);
      _m4.compose(_pv, _qv, _sv);
      saltMesh.setMatrixAt(sn++, _m4);
    }
    saltMesh.count = sn; saltMesh.visible = sn > 0;
    if (sn) saltMesh.instanceMatrix.needsUpdate = true;
    let cn = 0;
    for (const p of scorches) {
      if (p.grow < 1) p.grow = Math.min(1, p.grow + dt * 6);
      if (cn >= SCORCH_MAX) break;
      _pv.set(p.x, p.y, p.z);
      _qv.setFromAxisAngle(UP, p.spin);
      _sv.set(p.r * p.grow, 1, p.r * p.grow);
      _m4.compose(_pv, _qv, _sv);
      scorchMesh.setMatrixAt(cn++, _m4);
    }
    scorchMesh.count = cn; scorchMesh.visible = cn > 0;
    if (cn) scorchMesh.instanceMatrix.needsUpdate = true;
    void t;
    try { fx?.update(dt); } catch (err) { warn('fx', err); }
  }
  const UP = new THREE.Vector3(0, 1, 0);

  // ── wave 3 ─────────────────────────────────────────────────────────────────
  let volley = null;
  try {
    volley = createVolley(ctx, { group, targets, strike, hitArea, aimAt, saltPatches, fizz, warn, handPos, fx });
  } catch (err) { warn('volley init', err); }

  const api = {
    group, saltPatches, scorches, shots,
    get volley() { return volley; },
    get fx() { return fx; },
    addSaltPatch, clearSaltPatches: () => { saltPatches.length = 0; }, isSalted,
    burn, targets, strike, hitArea,
    /** Fire the held item now (used by tests/debug). */
    use: () => tryUse(),
    get held() { return ctx.systems.inventory?.held || null; },
    help: [
      { keys: ['Click', 'X'], text: 'swing / throw / fire / spray / burn' },
      { keys: ['F'], text: 'cycle held item' },
    ],
    stats() {
      let calls = 0;
      if (saltMesh.visible) calls++;
      if (scorchMesh.visible) calls++;
      if (pellets.visible) calls++;
      if (heldMesh.visible) calls++;
      const v = volley?.stats?.() || { calls: 0, inAir: 0 };
      const f = fx?.stats?.() || { calls: 0 };
      return { calls: calls + v.calls + f.calls, salt: saltPatches.length, scorch: scorches.length, shots: shots.length, volley: v, fx: f };
    },
    update,
  };

  ctx.events.on('world:ready', () => {
    for (const line of api.help) ctx.events.emit('ui:help', line);
    console.warn('[weapons] click or X to use · melee/lob/shot/spray/salt-gun/caramelizer + wave 3: cannon/whip/poprocks/gum/marshmallow/boomerang/water'
      + ` · salt patches cap ${SALT_MAX} · burn() → onBurn(point,r) on every system`);
  });

  return api;
}
