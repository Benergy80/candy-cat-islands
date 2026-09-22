// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY & PICKUPS — what you are carrying, and everything lying around the
// two islands waiting to be carried.
//
// 46 sweets (40 on Candyland, 6 smuggled onto Cat Island), eight tools, two fuel
// cans. Every pickup is a floating, bobbing, spinning, sparkling item registered
// with the interaction system, so E picks it up and the prompt names it.
// One InstancedMesh per item TYPE (candy is three tintable shapes, so one
// geometry gives six flavours) — a whole island of gumdrops is one draw call.
//
// PUBLIC API
//   items            ordered [{ id, name, kind:'weapon'|'tool'|'candy'|'ammo', count }]
//   add(id, n) · count(id) · has(id) · spend(id, n)
//   held             current weapon/tool id, or null (bare hands)
//   cycle()          F: next weapon/tool → null → …          setHeld(id)
//   def(id)          the item table entry (name, kind, mode, power, ammo)
//   ammo             { salt, gumballs, saltgun, fuel } · addAmmo(kind, n) · useAmmo(kind, n)
//   registerPickup({ id, x, z, itemId, n, label, mesh?, respawn?, variant?, tint?, y?, fixed? })
//   pickups          live list · hotbar() → [{ id, name, count, held, ammo }]
//   help             [{ keys, text }] control lines for the UI's '?' card
// EVENTS  'inventory:pickup' {itemId,n,id} · 'inventory:held' {itemId} · 'inventory:change'
// Views:  tools/views/inventory.json
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat, clamp } from '../core/util.js';
import { ITEMS, VISUALS, buildVisual, applyPickupGlow } from './inventory/items.js';
import { createMarkers } from './inventory/markers.js';
import { authorPickups } from './inventory/places.js';

const AMMO_CAP = { salt: 12, gumballs: 20, saltgun: 30, fuel: 20 };
const CANDY_REFILL = { salt: 2, gumballs: 2, saltgun: 5 };
const BOB = 0.13, SPIN = 0.9;
const POOL_RANGE = 140;          // pools further than this stop drawing entirely
const SPARKLE_RANGE = 34;
const MARK_RANGE = 78;           // markers fade out over the last 18 u of this
const LAVENDER = 0xb388ff;       // every sweet's marker hue

export function create(ctx) {
  const world = ctx.world;
  const group = new THREE.Group();
  group.name = 'inventory';
  ctx.scene.add(group);

  // A pickup is lit like everything else, plus a whisper of emissive: enough to
  // lift a floating sweet off Candyland's own wall of sweets (and to find one in
  // a shadow) without turning it into a lantern.
  // …and, since round 3, a FRESNEL RIM in the object's own hue plus a baked
  // `glow` mask for hot tips and canisters (see items.applyPickupGlow). That is
  // what pulls a heat gun out of a sand-coloured cliff without a second pass.
  const mats = {
    gloss: applyPickupGlow(
      mat(0xffffff, { vertexColors: true, roughness: 0.30, metalness: 0.0, emissive: 0xffe9b8, emissiveIntensity: 0.16 }),
      { rim: 0.62, glow: 1.45 },
    ),
    matte: applyPickupGlow(
      mat(0xffffff, { vertexColors: true, roughness: 0.62, metalness: 0.0, emissive: 0xffe9b8, emissiveIntensity: 0.13 }),
      { rim: 0.50, glow: 1.30 },
    ),
  };

  const markers = createMarkers(ctx);
  const _UP = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();

  // ── instanced pools, one per visual ────────────────────────────────────────
  const pools = new Map();
  let poolTris = 0;
  function pool(key) {
    let p = pools.get(key);
    if (p) return p;
    const V = VISUALS[key];
    if (!V) return null;
    const { geo, tris } = buildVisual(key, { halo: true });
    p = { key, V, geo, tris, cap: 0, mesh: null, count: 0, colorDirty: true };
    pools.set(key, p);
    poolTris += tris;
    return p;
  }
  function ensureCap(p, need) {
    if (p.mesh && p.cap >= need) return;
    const cap = Math.max(8, need + 6, p.cap * 2);
    if (p.mesh) { group.remove(p.mesh); p.mesh.dispose(); }
    const m = new THREE.InstancedMesh(p.geo, p.V.gloss ? mats.gloss : mats.matte, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false; m.receiveShadow = false;   // they float and sparkle: a cast shadow reads as a bug
    m.frustumCulled = false;
    m.count = 0;
    if (p.V.tint) { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < cap; i++) m.setColorAt(i, c); }
    group.add(m);
    p.mesh = m; p.cap = cap; p.colorDirty = true;
  }

  // ── the bag ────────────────────────────────────────────────────────────────
  const items = [];                                  // ordered, stable
  const ammo = { salt: 0, gumballs: 0, saltgun: 0, fuel: 0 };
  let held = null;
  const seen = new Set();                            // items ever picked up (for first-time toasts)

  const def = (id) => ITEMS[id] || { id, name: id, kind: 'candy' };
  const entryFor = (id) => items.find((it) => it.id === id);
  const carryable = () => items.filter((it) => it.kind === 'weapon' || it.kind === 'tool');

  function add(itemId, n = 1) {
    const d = def(itemId);
    // fuel cans never sit in the bag — they go straight into the Caramelizer
    if (d.refills) {
      for (const k in d.refills) addAmmo(k, d.refills[k] * n);
      ctx.events.emit('inventory:pickup', { itemId, n, refill: true });
      return 0;
    }
    let it = entryFor(itemId);
    if (!it) { it = { id: itemId, name: d.name, kind: d.kind, count: 0 }; items.push(it); }
    it.count += n;
    if (itemId === 'candy') for (const k in CANDY_REFILL) addAmmo(k, CANDY_REFILL[k] * n);
    else if (d.ammo && !seen.has(itemId)) ammo[d.ammo] = AMMO_CAP[d.ammo] ?? 0;   // a found weapon comes loaded
    seen.add(itemId);
    if (!held && (d.kind === 'weapon' || d.kind === 'tool')) setHeld(itemId);
    ctx.events.emit('inventory:pickup', { itemId, n, count: it.count });
    ctx.events.emit('inventory:change', { itemId });
    return it.count;
  }

  function spend(itemId, n = 1) {
    const it = entryFor(itemId);
    if (!it || it.count < n) return false;
    it.count -= n;
    ctx.events.emit('inventory:change', { itemId });
    return true;
  }

  function addAmmo(kind, n) {
    if (!(kind in ammo)) ammo[kind] = 0;
    ammo[kind] = clamp(ammo[kind] + n, 0, AMMO_CAP[kind] ?? 99);
    return ammo[kind];
  }
  function useAmmo(kind, n = 1) {
    if (!kind) return true;
    if ((ammo[kind] || 0) < n) return false;
    ammo[kind] -= n;
    return true;
  }

  function setHeld(id) {
    if (id === held) return held;
    held = id || null;
    ctx.events.emit('inventory:held', { itemId: held });
    return held;
  }

  function cycle(dir = 1) {
    const ring = carryable().map((it) => it.id);
    if (!ring.length) return null;
    ring.push(null);                                  // …and a slot for empty hands
    const i = ring.indexOf(held);
    return setHeld(ring[(i + dir + ring.length) % ring.length]);
  }

  // ── pickups ────────────────────────────────────────────────────────────────
  const pickups = [];
  let packDirty = true;

  function registerPickup(spec) {
    const d = def(spec.itemId);
    const key = spec.variant || d.visual || 'gumdrop';
    const V = VISUALS[key] || VISUALS.gumdrop;
    const p = {
      ...spec,
      id: spec.id || `pk${pickups.length}`,
      n: spec.n ?? 1,
      key, V, taken: false, respawnT: 0,
      phase: (pickups.length * 0.7919) % 6.283,
      sparkleT: (pickups.length * 0.37) % 1.4,
      scale: spec.scale ?? V.pick ?? 1.3,
      tint: spec.tint ?? null,
      y: spec.y ?? null,
    };
    p.ground = world.height(p.x, p.z);
    p.baseY = p.y != null ? p.y : p.ground + (V.lift ?? 0.8);
    // ── marker vocabulary ────────────────────────────────────────────────────
    // Sweets all wear the same lavender; every tool wears its own hue, so you
    // can name the thing in the distance before you can see its silhouette.
    p.isTool = d.kind === 'weapon' || d.kind === 'tool' || d.kind === 'ammo';
    p.hue = spec.hue ?? (p.isTool ? (V.hue ?? 0xfff0b0) : LAVENDER);
    p.markR = spec.mark ?? V.mark ?? (p.isTool ? 1.3 : 0.92);
    const nrm = world.normal(p.x, p.z);
    p.discQuat = new THREE.Quaternion().setFromUnitVectors(_UP, _n.set(nrm.x, nrm.y, nrm.z));
    // …and the pool of light it stands on. A pickup over a deck, an alley floor
    // or a step puts its disc on THAT surface, not on the terrain buried under
    // it, and one left on a counter (the salt shaker) gets its disc on the
    // counter rather than on the grass 1.8 m below.
    let gy = spec.discY != null ? spec.discY : (spec.y != null ? spec.y - 0.72 : p.ground);
    if (spec.discY == null) {
      for (const w of ctx.walkables || []) {
        const wy = w.test?.(p.x, p.z);
        if (wy != null && wy > gy && wy < p.baseY - 0.35) gy = wy;
      }
    }
    p.discY = gy + 0.07;
    const pl = pool(key);
    if (pl) { pl.want = (pl.want || 0) + 1; ensureCap(pl, pl.want); }
    // PROMPT PRIORITY. interaction.js shows whichever entry is *nearest*, and a
    // pickup often sits inside a shop's or a booth's own interact zone — where
    // "Buy a ferry ticket" would sit on top of "Take the Salt Shaker" forever.
    // There is no priority field to set, so a pickup reports itself up to 0.9 u
    // closer than it really is: it wins the tie, and the prompt pill (which
    // reads the same point) moves by less than a pixel at game distance.
    const BIAS = 0.9;
    p.entry = ctx.systems.interaction?.register({
      id: 'pick_' + p.id, x: p.x, z: p.z, y: p.baseY, r: spec.r ?? (spec.itemId === 'candy' ? 2.3 : 2.8),
      promptH: 1.05,
      label: spec.label || `Pick up ${d.name}`,
      getPos() {
        const q = ctx.systems.player?.position;
        if (!q) return p;
        const dx = p.x - q.x, dz = p.z - q.z, d2 = Math.hypot(dx, dz);
        if (d2 < 0.001) return p;
        const k = Math.min(BIAS, d2 * 0.45);
        return { x: p.x - dx / d2 * k, z: p.z - dz / d2 * k, y: p.baseY };
      },
      onInteract: () => take(p),
    });
    pickups.push(p);
    packDirty = true;
    return p;
  }

  function take(p) {
    if (p.taken) return;
    p.taken = true;
    packDirty = true;
    if (p.entry) p.entry.enabled = false;
    const d = def(p.itemId);
    const y = p.baseY + 0.2;
    const P = ctx.systems.particles;
    P?.sparkle(p.x, y, p.z, p.tint || 0xfff0b0, 14);
    P?.burst({
      x: p.x, y, z: p.z, count: 12, color: p.tint ? [p.tint, 0xffffff] : [0xffffff, 0xfff0b0],
      speed: 2.6, up: 1.2, life: 0.6, size: 0.22, sizeEnd: 0.04, gravity: -5, drag: 2.2, spread: 0.4,
    });
    const first = !seen.has(p.itemId);
    add(p.itemId, p.n);
    const ui = ctx.systems.ui;
    if (p.itemId === 'candy') {
      const c = count('candy');
      ui?.toast(`Candy +${p.n}  (${c})`, 2.2, { icon: 'spark' });
    } else if (d.refills) {
      ui?.toast(`Fuel can — Caramelizer +${d.refills.fuel}`, 3.0, { icon: 'spark' });
    } else {
      ui?.toast(`${d.name} — F to cycle, click or X to ${d.hint || 'use'}`, 5.0, { icon: 'spark' });
      if (p.say) for (const line of p.say) ui?.say(line, { speaker: d.name, duration: 5.5 });
    }
    if (first && d.ammo) ui?.toast(`${d.name}: ${ammo[d.ammo]} ${d.ammo === 'fuel' ? 'shots of fuel' : d.ammo}`, 3.4, { icon: 'spark' });
    if (p.respawn) p.respawnT = p.respawn;
  }

  const count = (id) => (id === 'candy' || ITEMS[id] ? (entryFor(id)?.count ?? 0) : 0);

  // ── authored layout, once every builder's colliders exist ──────────────────
  function colliderClear(x, z, pad) {
    const cols = ctx.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.box) {                                   // oriented box collider (wave-2 contract)
        const ca = Math.cos(c.rot || 0), sa = Math.sin(c.rot || 0);
        const dx = x - c.x, dz = z - c.z;
        const lx = Math.abs(dx * ca + dz * sa), lz = Math.abs(-dx * sa + dz * ca);
        if (lx < (c.w || 1) / 2 + pad && lz < (c.d || 1) / 2 + pad) return false;
      } else if (Math.hypot(x - c.x, z - c.z) < (c.r || 0) + pad) return false;
    }
    return true;
  }
  const clear = (x, z, pad = 1.0) =>
    world.isFreeGround(x, z, { pathMargin: 0.35, riverMargin: 1.2, avoidLandmarks: false, minHeight: 0.9 })
    && colliderClear(x, z, pad);

  function nudge(x, z, pad = 1.0) {
    if (clear(x, z, pad)) return { x, z };
    for (let r = 0.9; r <= 7.2; r += 0.9) {
      for (let a = 0; a < 14; a++) {
        const ang = a / 14 * Math.PI * 2 + r;
        const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
        if (clear(px, pz, pad)) return { x: px, z: pz };
      }
    }
    // last resort: off the props at least, even if it is on the path
    for (let r = 0.9; r <= 7.2; r += 0.9) for (let a = 0; a < 14; a++) {
      const ang = a / 14 * Math.PI * 2;
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (colliderClear(px, pz, pad) && world.height(px, pz) > 0.7) return { x: px, z: pz };
    }
    return null;
  }

  ctx.events.on('world:ready', () => {
    let n = 0;
    for (const spec of authorPickups(ctx, clear, nudge)) { registerPickup(spec); n++; }
    const sweets = pickups.filter((p) => p.itemId === 'candy').length;
    console.warn(`[inventory] ${n} pickups (${sweets} sweets, ${n - sweets} tools) · ${pools.size} pools`
      + ` · ${poolTris} tris of geometry · ${pools.size} draw calls max`);
    for (const line of api.help) ctx.events.emit('ui:help', line);
  });

  // ── frame ──────────────────────────────────────────────────────────────────
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _col = new THREE.Color();

  function update(dt, ctx) {
    const t = ctx.state.elapsed;
    // Cull against the CAMERA, not the player: free-camera screenshots still see
    // the sweets they are pointed at, and the far island costs nothing.
    const pl = ctx.systems.player?.position;
    const cam = ctx.camera?.position;
    const px = cam ? cam.x : (pl ? pl.x : 0), pz = cam ? cam.z : (pl ? pl.z : 0);
    const sx = pl ? pl.x : px, sz = pl ? pl.z : pz;

    if (ctx.input.pressed.has('KeyF')) {
      const h = cycle();
      const d = h ? def(h) : null;
      ctx.systems.ui?.toast(d ? `${d.name} in hand` : 'Hands free', 1.8, { icon: 'spark' });
    }

    for (const p of pools.values()) { p.count = 0; p.near = false; }
    markers.begin();
    // markers breathe with the clock: bright enough to fight noon frosting,
    // proper beacons after dark.
    const markGain = 1.25 + 0.55 * (1 - (ctx.state.daylight ?? 1));

    for (const p of pickups) {
      if (p.taken) {
        if (p.respawnT > 0 && (p.respawnT -= dt) <= 0) { p.taken = false; if (p.entry) p.entry.enabled = true; packDirty = true; }
        continue;
      }
      const pool_ = pools.get(p.key); if (!pool_?.geo) continue;
      const d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
      if (d2 > POOL_RANGE * POOL_RANGE) continue;
      pool_.near = true;
      const i = pool_.count++;
      if (i >= pool_.cap) continue;                 // grown next frame
      const tilt = p.V.tilt || [0, 0, 0];
      _e.set(tilt[0], t * SPIN + p.phase, tilt[2]);
      _q.setFromEuler(_e);
      _p.set(p.x, p.baseY + Math.sin(t * 1.7 + p.phase) * BOB, p.z);
      _s.setScalar(p.scale);
      _m.compose(_p, _q, _s);
      pool_.mesh?.setMatrixAt(i, _m);
      if (p.V.tint && pool_.mesh) { _col.set(p.tint || 0xffffff); pool_.mesh.setColorAt(i, _col); }

      // ── the marker: a pulsing pool of light and the shaft standing in it ────
      if (d2 < MARK_RANGE * MARK_RANGE) {
        const dist = Math.sqrt(d2);
        const fade = Math.min(1, (MARK_RANGE - dist) / 18);
        const pulse = 1 + 0.11 * Math.sin(t * 2.0 + p.phase);
        const gain = markGain * fade * (0.86 + 0.14 * Math.sin(t * 2.0 + p.phase));
        markers.disc(p.x, p.discY, p.z, p.markR * pulse, p.hue, gain, p.discQuat);
        const h = Math.max(0.4, _p.y - p.discY - 0.10);
        markers.shaft(p.x, p.discY + 0.02, p.z, p.markR * 0.78, h,
          Math.atan2(px - p.x, pz - p.z), p.hue, gain * 0.72);
      }

      // a twinkle every second or so, only close enough to see
      const sd2 = (p.x - sx) * (p.x - sx) + (p.z - sz) * (p.z - sz);
      if (sd2 < SPARKLE_RANGE * SPARKLE_RANGE) {
        p.sparkleT -= dt;
        if (p.sparkleT <= 0) {
          p.sparkleT = (p.isTool ? 1.25 : 0.9) + (p.phase % 1) * 0.8;
          ctx.systems.particles?.sparkle(p.x, _p.y + 0.16, p.z, p.tint || p.hue || 0xfff2c0, p.isTool ? 5 : 3);
          // tools also breathe a slow ember up out of the shaft
          if (p.isTool) ctx.systems.particles?.burst({
            x: p.x, y: p.discY + 0.10, z: p.z, count: 2, color: [p.hue, 0xffffff],
            area: p.markR * 0.6, speed: 0.25, up: 0.5, vy: 0.55, vyJitter: 0.25,
            life: 1.9, size: 0.16, sizeEnd: 0.02, gravity: 0.35, drag: 0.8,
            shape: 'sparkle', blend: 'add',
          });
        }
      }
    }

    for (const p of pools.values()) {
      if (!p.near) { if (p.mesh) p.mesh.visible = false; continue; }
      ensureCap(p, p.count);
      if (!p.mesh) continue;
      p.mesh.visible = true;
      p.mesh.count = Math.min(p.count, p.cap);
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.V.tint && p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
    markers.end();
    packDirty = false;
  }

  // ── public API ─────────────────────────────────────────────────────────────
  const api = {
    group, items, pickups, pools, ITEMS,
    get held() { return held; },
    set held(v) { setHeld(v); },
    ammo, addAmmo, useAmmo,
    add, spend, count, def, setHeld, cycle, registerPickup,
    has: (id) => count(id) > 0,
    heldDef: () => (held ? def(held) : null),
    ammoFor: (id) => { const d = def(id); return d?.ammo ? (ammo[d.ammo] || 0) : null; },
    /** For the HUD hotbar: everything you can hold, plus the candy purse. */
    hotbar() {
      return items
        .filter((it) => it.kind !== 'ammo')
        .map((it) => ({
          id: it.id, name: it.name, kind: it.kind, count: it.count,
          held: it.id === held, ammo: api.ammoFor(it.id),
        }));
    },
    help: [
      { keys: ['Click', 'X'], text: 'use the held item' },
      { keys: ['F'], text: 'cycle held item' },
    ],
    stats() {
      let calls = 0, tris = 0;
      for (const p of pools.values()) if (p.mesh?.visible && p.mesh.count) { calls++; tris += p.tris * p.mesh.count; }
      const mk = markers.stats();
      return {
        calls: calls + mk.calls, triangles: tris + mk.triangles,
        pickups: pickups.length, pools: pools.size, markers: mk.calls,
      };
    },
    update,
  };
  return api;
}
