// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY & PICKUPS — what you are carrying, and everything lying around the
// two islands waiting to be carried.
//
// 46 sweets (40 on Candyland, 6 smuggled onto Cat Island), fifteen weapons and
// tools, two fuel cans and (wave 3) ~75 AMMO pickups in themed caches. Every
// pickup is a floating, bobbing, spinning, sparkling item registered with the
// interaction system, so E picks it up and the prompt names it; ammo is also
// scooped up just by walking through it, and comes back 60–90 s later.
// One InstancedMesh per item TYPE (candy is three tintable shapes, so one
// geometry gives six flavours) — a whole island of gumdrops is one draw call.
//
// PUBLIC API
//   items            ordered (items.ORDER) [{ id, name, kind:'weapon'|'tool'|'candy', count,
//                    ammo?, max? }] — `ammo`/`max` are the live magazine, for the hotbar
//   add(id, n) · count(id) · has(id) · spend(id, n)
//   held             current weapon/tool id, or null (bare hands)
//   cycle()          F: next usable weapon in ORDER → bare hands → …   setHeld(id)
//   def(id)          the item table entry (name, kind, mode, hit, power, ammo)
//   ammo             { salt, gumballs, saltgun, fuel, jawbreakers, poprocks, gum,
//                    marshmallows, balloons } · addAmmo(kind, n) · useAmmo(kind, n) · caps
//   registerPickup({ id, x, z, itemId, n, label, mesh?, respawn?, variant?, tint?, y?, fixed?, auto? })
//   pickups          live list · hotbar() → [{ id, name, count, held, ammo }]
//   caches           the ammo clusters [{ id, x, z, itemId, n, label, island }]
//   help             [{ keys, text }] control lines for the UI's '?' card
// EVENTS  'inventory:pickup' {itemId,n,id} · 'inventory:held' {itemId} · 'inventory:change'
// Views:  tools/views/inventory.json
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat, clamp } from '../core/util.js';
import { ITEMS, VISUALS, ORDER, AMMO_CAP, AMMO_LOAD, CANDY_REFILL, buildVisual, applyPickupGlow } from './inventory/items.js';
import { createMarkers } from './inventory/markers.js';
import { authorPickups } from './inventory/places.js';

const BOB = 0.13, SPIN = 0.9;
const NO_TILT = [0, 0, 0];      // (shared: `|| [0, 0, 0]` built a fresh array per pickup per frame)
const POOL_RANGE = 104;          // pickups further than this from the camera's FOCUS stop drawing
const AMMO_RANGE = 62;           // ammo is small: its pools only draw near the camera's focus
const SPARKLE_RANGE = 34;
const MARK_RANGE = 78;           // markers fade out over the last 18 u of this
const AMMO_MARK_RANGE = 54;
const AUTO_R = 1.35;             // walk through ammo to scoop it up
const LAVENDER = 0xb388ff;       // every sweet's marker hue
const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };

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
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    // conservative reach of one instance around its origin, at scale 1
    const geoR = geo.boundingSphere.center.length() + geo.boundingSphere.radius;
    p = { key, V, geo, tris, cap: 0, mesh: null, count: 0, colorDirty: true,
      geoR, bounds: new THREE.Sphere(), x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, sMax: 0 };
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
    // Culled against the frame's own bounds (Contract J): update() fits
    // p.bounds round the instances it packed this frame, so a pool whose
    // pickups are all behind the lens costs no draw call (up to 13 of 18 were).
    m.frustumCulled = true;
    m.boundingSphere = p.bounds;
    m.count = 0;
    if (p.V.tint) { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < cap; i++) m.setColorAt(i, c); }
    group.add(m);
    p.mesh = m; p.cap = cap; p.colorDirty = true;
  }

  // ── the bag ────────────────────────────────────────────────────────────────
  const items = [];                                  // ordered by ORDER, stable
  const ammo = {};
  for (const k in AMMO_CAP) ammo[k] = 0;
  let held = null;
  const seen = new Set();                            // items ever picked up (for first-time toasts)

  // Unknown ids (another builder's key item) are TOOLS, never candy: a winch in
  // the bag must not read as sweets to the Sour Patch Kids or the hotbar.
  const def = (id) => ITEMS[id] || { id, name: String(id).replace(/[-_]/g, ' '), kind: 'tool', keyItem: true };
  const entryFor = (id) => items.find((it) => it.id === id);
  /** The F ring: things with a use, in ORDER. Key items ride in the bag only. */
  const carryable = () => items.filter((it) => (it.kind === 'weapon' || it.kind === 'tool') && def(it.id).mode && it.count > 0);

  /** Mirror the live magazine onto the bag entry (the hotbar reads it.ammo / it.max). */
  function syncAmmoFields() {
    for (const it of items) {
      const d = ITEMS[it.id];
      if (!d?.ammo) continue;
      it.ammo = ammo[d.ammo] || 0;
      it.max = AMMO_CAP[d.ammo] ?? null;
    }
  }

  function add(itemId, n = 1) {
    const d = def(itemId);
    // fuel cans + ammo never sit in the bag — they go straight into the counter
    if (d.refills) {
      for (const k in d.refills) addAmmo(k, d.refills[k] * n);
      ctx.events.emit('inventory:pickup', { itemId, n, refill: true });
      return 0;
    }
    let it = entryFor(itemId);
    if (!it) {
      it = { id: itemId, name: d.name, kind: d.kind, count: 0 };
      let at = items.length;
      for (let i = 0; i < items.length; i++) if (rank(items[i].id) > rank(itemId)) { at = i; break; }
      items.splice(at, 0, it);
    }
    it.count += n;
    if (itemId === 'candy') for (const k in CANDY_REFILL) addAmmo(k, CANDY_REFILL[k] * n);
    else if (d.ammo && !seen.has(itemId)) {                                    // a found weapon comes loaded
      ammo[d.ammo] = Math.max(ammo[d.ammo] || 0, AMMO_LOAD[d.ammo] ?? AMMO_CAP[d.ammo] ?? 0);
    }
    seen.add(itemId);
    syncAmmoFields();
    if (!held && d.mode && (d.kind === 'weapon' || d.kind === 'tool')) setHeld(itemId);
    ctx.events.emit('inventory:pickup', { itemId, n, count: it.count });
    ctx.events.emit('inventory:change', { itemId });
    return it.count;
  }

  function spend(itemId, n = 1) {
    const it = entryFor(itemId);
    if (!it || it.count < n) return false;
    it.count -= n;
    // a spent key item leaves the bag (and your hand); candy stays at 0 as a purse
    if (it.count <= 0 && it.id !== 'candy' && def(it.id).keyItem) {
      items.splice(items.indexOf(it), 1);
      if (held === it.id) setHeld(null);
    }
    ctx.events.emit('inventory:change', { itemId });
    return true;
  }

  function addAmmo(kind, n) {
    if (!(kind in ammo)) ammo[kind] = 0;
    ammo[kind] = clamp(ammo[kind] + n, 0, AMMO_CAP[kind] ?? 99);
    syncAmmoFields();
    return ammo[kind];
  }
  function useAmmo(kind, n = 1) {
    if (!kind) return true;
    if ((ammo[kind] || 0) < n) return false;
    ammo[kind] -= n;
    syncAmmoFields();
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

  // ── merged ammo toasts: a cache scooped in one run is ONE line, not six ─────
  const pendingAmmo = new Map();                      // counter → gained
  let pendingT = 0;
  const AMMO_WORD = {
    salt: 'Salt', saltgun: 'Salt-gun salt', gumballs: 'Gumballs', fuel: 'Fuel', jawbreakers: 'Jawbreakers',
    poprocks: 'Pop Rocks', gum: 'Bubblegum', marshmallows: 'Marshmallows', balloons: 'Water balloons',
  };
  const weaponFor = (kind) => { for (const id in ITEMS) if (ITEMS[id].ammo === kind) return ITEMS[id]; return null; };
  function flushAmmoToast() {
    if (!pendingAmmo.size) return;
    const parts = [];
    let missing = null;
    for (const [k, g] of pendingAmmo) {
      if (k === 'saltgun' && pendingAmmo.has('salt')) continue;
      parts.push(g > 0 ? `${AMMO_WORD[k] || k} +${g} (${ammo[k] || 0}/${AMMO_CAP[k] ?? '?'})` : `${AMMO_WORD[k] || k} full`);
      const w = weaponFor(k);
      if (w && !seen.has(w.id) && !missing) missing = w;
    }
    pendingAmmo.clear();
    const hint = missing ? ` — for the ${missing.name}${where[missing.id] ? ` (${where[missing.id]})` : ''}` : '';
    ctx.systems.ui?.toast(parts.join(' · ') + hint, missing ? 3.6 : 2.4, { icon: 'spark' });
  }

  // ── pickups ────────────────────────────────────────────────────────────────
  const pickups = [];
  let packDirty = true;

  const where = {};                                  // weapon id → where its pickup lies (for hints)
  function registerPickup(spec) {
    const d = def(spec.itemId);
    const key = spec.variant || d.pickupVisual || d.visual || 'gumdrop';
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
      isAmmo: d.kind === 'ammo' && !!V.ammo,
      auto: spec.auto ?? (d.kind === 'ammo' && !!V.ammo),
      _pos: { x: 0, z: 0, y: 0 },
    };
    if (d.kind === 'weapon' && spec.where) where[spec.itemId] = spec.where;
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
        const o = p._pos;                             // reused: ~120 pickups ask every frame
        o.x = p.x - dx / d2 * k; o.z = p.z - dz / d2 * k; o.y = p.baseY;
        return o;
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
    const before = d.refills ? Object.fromEntries(Object.keys(d.refills).map((k) => [k, ammo[k] || 0])) : null;
    add(p.itemId, p.n);
    const ui = ctx.systems.ui;
    if (p.mapId) { try { ui?.removeMapMarker?.(p.mapId); } catch { /* the map is optional */ } }
    if (p.isAmmo && before) {
      for (const k in before) {
        const g = (ammo[k] || 0) - before[k];
        pendingAmmo.set(k, (pendingAmmo.get(k) || 0) + g);
      }
      pendingT = 0.75;
    } else if (p.itemId === 'candy') {
      const c = count('candy');
      ui?.toast(`Candy +${p.n}  (${c})`, 2.2, { icon: 'spark' });
    } else if (d.refills) {
      ui?.toast(`Fuel can — Caramelizer +${d.refills.fuel}`, 3.0, { icon: 'spark' });
    } else {
      ui?.toast(`${d.name} — F to cycle, click or X to ${d.hint || 'use'}`, 5.0, { icon: 'spark' });
      if (p.say) for (const line of p.say) ui?.say(line, { speaker: d.name, duration: 5.5 });
    }
    if (first && d.ammo) ui?.toast(`${d.name}: ${ammo[d.ammo]} ${d.ammo === 'fuel' ? 'shots of fuel' : (AMMO_WORD[d.ammo] || d.ammo).toLowerCase()}`, 3.4, { icon: 'spark' });
    if (p.respawn) p.respawnT = p.respawn;
  }

  const count = (id) => entryFor(id)?.count ?? 0;

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

  // ── map markers (Contract G): weapons + ammo caches, if the map offers them ─
  const caches = [];
  const mapQueue = [];
  let mapTry = 0;
  function pushMarkers() {
    const ui = ctx.systems.ui;
    if (typeof ui?.addMapMarker !== 'function') return false;
    for (const m of mapQueue) { try { ui.addMapMarker(m); } catch (err) { console.warn('[inventory] map marker', err?.message || err); break; } }
    mapQueue.length = 0;
    return true;
  }
  ctx.events.on('story:knows_spray', () => {
    const p = pickups.find((q) => q.itemId === 'spray' && !q.taken);
    if (p) { mapQueue.push({ id: p.mapId = 'weapon_spray', x: p.x, z: p.z, glyph: 'weapon', label: 'Spray Bottle' }); pushMarkers(); }
  });

  ctx.events.on('world:ready', () => {
    let n = 0;
    for (const spec of authorPickups(ctx, clear, nudge)) {
      const p = registerPickup(spec); n++;
      const d = def(spec.itemId);
      if (d.kind === 'weapon' && spec.map !== false) {
        p.mapId = 'weapon_' + spec.itemId;
        mapQueue.push({ id: p.mapId, x: p.x, z: p.z, glyph: 'weapon', label: d.name });
      }
      if (spec.cache && !caches.some((c) => c.id === spec.cache.id)) caches.push(spec.cache);
      if (p.isAmmo && spec.respawn == null) p.respawn = 60 + ((p.phase * 997) % 31);   // 60–90 s, seeded
    }
    for (const c of caches) mapQueue.push({ id: 'ammo_' + c.id, x: c.x, z: c.z, glyph: 'ammo', label: c.label });
    pushMarkers();
    const sweets = pickups.filter((p) => p.itemId === 'candy').length;
    const am = pickups.filter((p) => p.isAmmo);
    const per = { candy: 0, cat: 0 };
    for (const p of am) { const isl = world.islandAt(p.x, p.z); if (isl) per[isl] = (per[isl] || 0) + 1; }
    console.warn(`[inventory] ${n} pickups (${sweets} sweets, ${am.length} ammo: candy ${per.candy} / cat ${per.cat},`
      + ` ${n - sweets - am.length} tools) · ${pools.size} pools · ${poolTris} tris of geometry`);
    for (const line of api.help) ctx.events.emit('ui:help', line);
  });

  // ── frame ──────────────────────────────────────────────────────────────────
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _dir = new THREE.Vector3();
  const _col = new THREE.Color();

  function update(dt, ctx) {
    const t = ctx.state.elapsed;
    // Cull against the CAMERA, not the player: free-camera screenshots still see
    // the sweets they are pointed at, and the far island costs nothing.
    const pl = ctx.systems.player?.position;
    const cam = ctx.camera?.position;
    const px = cam ? cam.x : (pl ? pl.x : 0), pz = cam ? cam.z : (pl ? pl.z : 0);
    const sx = pl ? pl.x : px, sz = pl ? pl.z : pz;
    // FOCUS: where the camera is actually looking (its ray meets the ground),
    // so ammo — small and numerous — only costs draw calls near the action.
    let fx = sx, fz = sz;
    if (cam && ctx.camera) {
      ctx.camera.getWorldDirection(_dir);
      const gy = pl ? pl.y : 0;
      const k = _dir.y < -0.05 ? Math.min(260, (cam.y - gy) / -_dir.y) : 60;
      fx = cam.x + _dir.x * k; fz = cam.z + _dir.z * k;
    }
    if (pendingT > 0 && (pendingT -= dt) <= 0) flushAmmoToast();
    if (mapQueue.length && (mapTry -= dt) <= 0) { mapTry = 1; pushMarkers(); }
    const canScoop = pl && !ctx.systems.player?.onFerry && !ctx.state.paused;

    if (ctx.input.pressed.has('KeyF')) {
      const h = cycle();
      const d = h ? def(h) : null;
      ctx.systems.ui?.toast(d ? `${d.name} in hand` : 'Hands free', 1.8, { icon: 'spark' });
    }

    for (const p of pools.values()) {
      p.count = 0; p.near = false;
      p.x0 = p.y0 = p.z0 = Infinity; p.x1 = p.y1 = p.z1 = -Infinity; p.sMax = 0;
    }
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
      let d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
      if (p.isAmmo && canScoop && Math.abs(p.x - sx) < AUTO_R && Math.abs(p.z - sz) < AUTO_R
        && (p.x - sx) * (p.x - sx) + (p.z - sz) * (p.z - sz) < AUTO_R * AUTO_R
        && Math.abs(pl.y - p.discY) < 2.2) { take(p); continue; }
      // cull by where the camera LOOKS (not where it stands): the far side of
      // the island costs no draw calls, and free overview cameras still see
      // what they are aimed at
      const f2 = (p.x - fx) * (p.x - fx) + (p.z - fz) * (p.z - fz);
      const R = p.isAmmo ? AMMO_RANGE : POOL_RANGE;
      if (f2 > R * R) continue;
      if (p.isAmmo) d2 = Math.min(d2, f2 * 0.6);
      pool_.near = true;
      const i = pool_.count++;
      if (i >= pool_.cap) continue;                 // grown next frame
      const tilt = p.V.tilt || NO_TILT;
      _e.set(tilt[0], t * SPIN + p.phase, tilt[2]);
      _q.setFromEuler(_e);
      _p.set(p.x, p.baseY + Math.sin(t * 1.7 + p.phase) * BOB, p.z);
      _s.setScalar(p.scale);
      _m.compose(_p, _q, _s);
      pool_.mesh?.setMatrixAt(i, _m);
      if (_p.x < pool_.x0) pool_.x0 = _p.x; if (_p.x > pool_.x1) pool_.x1 = _p.x;
      if (_p.y < pool_.y0) pool_.y0 = _p.y; if (_p.y > pool_.y1) pool_.y1 = _p.y;
      if (_p.z < pool_.z0) pool_.z0 = _p.z; if (_p.z > pool_.z1) pool_.z1 = _p.z;
      if (p.scale > pool_.sMax) pool_.sMax = p.scale;
      if (p.V.tint && pool_.mesh) { _col.set(p.tint || 0xffffff); pool_.mesh.setColorAt(i, _col); }

      // ── the marker: a pulsing pool of light and the shaft standing in it ────
      const MR = p.isAmmo ? AMMO_MARK_RANGE : MARK_RANGE;
      if (d2 < MR * MR) {
        const dist = Math.sqrt(d2);
        const fade = Math.min(1, (MR - dist) / 18);
        const pulse = 1 + 0.11 * Math.sin(t * 2.0 + p.phase);
        const gain = markGain * fade * (0.86 + 0.14 * Math.sin(t * 2.0 + p.phase)) * (p.isAmmo ? 0.8 : 1);
        markers.disc(p.x, p.discY, p.z, p.markR * pulse, p.hue, gain, p.discQuat);
        const h = Math.max(0.4, _p.y - p.discY - 0.10);
        // ammo wears a shorter, dimmer shaft: a cache reads as one glow, not a picket fence
        markers.shaft(p.x, p.discY + 0.02, p.z, p.markR * 0.78, p.isAmmo ? h * 0.8 : h,
          Math.atan2(px - p.x, pz - p.z), p.hue, gain * (p.isAmmo ? 0.42 : 0.72));
      }

      // a twinkle every second or so, only close enough to see
      const sd2 = (p.x - sx) * (p.x - sx) + (p.z - sz) * (p.z - sz);
      if (sd2 < SPARKLE_RANGE * SPARKLE_RANGE) {
        p.sparkleT -= dt;
        if (p.sparkleT <= 0) {
          p.sparkleT = (p.isAmmo ? 2.2 : p.isTool ? 1.25 : 0.9) + (p.phase % 1) * 0.8;
          ctx.systems.particles?.sparkle(p.x, _p.y + 0.16, p.z, p.tint || p.hue || 0xfff2c0, p.isAmmo ? 2 : p.isTool ? 5 : 3);
          // tools also breathe a slow ember up out of the shaft
          if (p.isTool && !p.isAmmo) ctx.systems.particles?.burst({
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
      const hx = (p.x1 - p.x0) * 0.5, hy = (p.y1 - p.y0) * 0.5, hz = (p.z1 - p.z0) * 0.5;
      p.bounds.center.set(p.x0 + hx, p.y0 + hy, p.z0 + hz);
      p.bounds.radius = Math.sqrt(hx * hx + hy * hy + hz * hz) + p.geoR * p.sMax;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.V.tint && p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
    markers.end();
    packDirty = false;
  }

  // ── public API ─────────────────────────────────────────────────────────────
  const api = {
    group, items, pickups, pools, ITEMS, ORDER, caches,
    get held() { return held; },
    set held(v) { setHeld(v); },
    ammo, addAmmo, useAmmo, caps: AMMO_CAP,
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
    /** Debug / views: put a weapon (loaded) in your hand. */
    give(id, n = 1) { add(id, n); if (ITEMS[id]?.mode) setHeld(id); return held; },
    stats() {
      let calls = 0, tris = 0;
      for (const p of pools.values()) if (p.mesh?.visible && p.mesh.count) { calls++; tris += p.tris * p.mesh.count; }
      const mk = markers.stats();
      return {
        calls: calls + mk.calls, triangles: tris + mk.triangles,
        pickups: pickups.length, pools: pools.size, markers: mk.calls,
        ammoPickups: pickups.filter((p) => p.isAmmo).length,
      };
    },
    update,
  };
  return api;
}
