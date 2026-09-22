// THE VISITOR — the human you play. Chunky procedural tourist (see
// systems/player/visitor.js) plus snappy-but-weighted ground movement.
//
// INPUT (wave-2 contract; nobody else binds these):
//   WASD move · Shift run · Space jump, Space again in the air = double jump
//   with a forward flip · C hold = duck, C while running = slide, C in the air
//   = STOMP (slam + shockwave) · R = dodge roll (0.6 s, ~5 u, i-frames).
//   E/Enter interact, left-click / X use item, F cycle item, 1/2/3 camera:
//   those belong to other systems and are not read here.
//
// Public contract other systems depend on (do not rename):
//   position (Vector3, feet) · velocity · facing · speed · running · onFerry ·
//   locked · teleport(x,z) · group · mesh · setEmotion(e) · update(dt, ctx)
// Wave 2 additions:
//   onVehicle — a vehicle (canoe, catapult, flying machine) drives position;
//     this system stops moving and ground-clamping the body, keeps posing it,
//     and the camera keeps following. `locked` still freezes input on foot.
//   setPose('sit'|'stand'|'paddle'|'fly'|'flail') — riding poses.
//   playAction('swing'|'throw'|'spray', duration) → Promise — right-arm action
//     for the weapons system.
//   ducking · sliding · rolling · stomping · invulnerable · jumps
//   jump() · roll() — the same moves, for cutscenes / other systems.
// Round 4:
//   setSilhouette(on) / silhouetteOn — the THROUGH-GEOMETRY SILHOUETTE pass
//     (player/visitor.js): the body drawn a second time, flat cream, only where
//     something is in front of it, so the visitor can never be lost behind
//     instanced fronds, a plinth or a merged district. On by default; the
//     follow camera owns it and a free camera switches it off.
//   Water: the sea AND the Chocolate Lake (world.LAKE, surface 2.0) are both
//     wading surfaces — groundAt() reports {water, limit, floor} per point, so
//     nobody walks into the lake bowl and stands in chocolate up to the hat.
// Also here: a per-foot ground clamp (no shoe ever sinks into a step or deck),
//   a soft contact shadow + wide-zoom marker (player/decal.js), and one dim
//   warm PointLight riding the visitor after dark.
// Events emitted: 'player:step' {x,y,z,side} · 'player:jump' {double} ·
//   'player:land' · 'player:stomp' {x,z,r} · 'player:roll' {x,z,dir} ·
//   'player:slide' {x,z} · 'player:splash' {x,y,z,big} · 'player:teleport'
// Reads: ctx.colliders [{x,z,r,h?} | {x,z,w,d,rot,h?,box:true}] ·
//        ctx.walkables [{ test(x,z) -> height|null }]
import * as THREE from 'three';
import { damp, clamp } from '../core/util.js';
import { createVisitor } from './player/visitor.js';
import { createGroundDecals } from './player/decal.js';

const RADIUS = 0.36;          // collision radius
const SEA_WADE = 0.85;        // deepest SEA water we will wade into; past it, blocked
// Chocolate Lake. world.LAKE carves a bowl 1.2 units under its own surface, and
// nothing about that surface is sea level — a visitor who walked in stood on the
// bowl floor with the chocolate up to his hat brim. Inside the bowl the water
// level is LAKE.surface and the wading limit is shin-deep: the lake is opaque,
// so anything past that is a body double for drowning.
const LAKE_WADE = 0.32;
const DECK_LIFT = 0.035;      // clearance so shoes never sink into pier planks / steps
const ACCEL = 17;             // damping lambda toward target velocity
const DECEL = 11;
const TURN_RATE = 13;

// ── moves ────────────────────────────────────────────────────────────────────
const GRAV = 17;
const JUMP_H = 1.60;                            // apex of the first hop, world units
const JUMP_V = Math.sqrt(2 * GRAV * JUMP_H);    // = 7.38
const JUMP2_V = 6.6;                            // the flip jump, kicked from wherever you are
const FLIP_DUR = 0.72;                          // one full forward rotation
const STOMP_V = -25;                            // slam speed
const STOMP_R = 3.5;                            // shockwave radius (weapons/enemies read this)
const ROLL_TIME = 0.6, ROLL_DIST = 5.0;         // dodge roll
const IFRAME_TAIL = 0.15;                       // invulnerable a hair past the roll
const SLIDE_MAX = 2.0, SLIDE_MIN_SPEED = 7.5;   // C while running
const DUCK_SPEED = 0.45;

export function create(ctx) {
  const { scene, world } = ctx;
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];

  const visitor = createVisitor();
  const group = visitor.group;
  scene.add(group);
  // Every visitor mesh casts (NPCs do) — except the ones that opt out: the hat
  // brim (its shadow was falling straight down the face) and the silhouette
  // pass, which is a second copy of the body and would cast the same shadow
  // twice. Marking them all noFade keeps the camera's blocker-fade off the
  // player himself.
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !(o.userData.noShadow || o.userData.silhouette);
    o.userData.noFade = true;
  });

  const decals = createGroundDecals();
  scene.add(decals.group);

  // Night fill: a dim warm lamp riding the visitor, so after dark the face, the
  // hat and the sailor stripes stay the brightest thing on screen and you can
  // always find yourself. Off (and out of the light list) during the day.
  // Shallow decay = the body is lit evenly instead of the chest blowing out.
  // IT HAS TO BE IN FRONT OF HIM. At (0, 1.42, 0.10) — which is where it was —
  // the lamp sits INSIDE the head: every face normal points away from it, so
  // the one thing it was added to light was the one thing it could not. Out at
  // z = 0.85 it washes the face, the chest and the ground he is standing on.
  const fill = new THREE.PointLight(0xffcf9a, 0, 7, 0.8);
  fill.position.set(0, 1.34, 0.85);
  fill.visible = false;
  group.add(fill);
  const FILL_MAX = 1.15;

  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const start = world.PLAYER_START;
  position.set(start.x, Math.max(world.height(start.x, start.z), 0), start.z);
  group.position.copy(position);

  // spawn facing roughly toward the default iso camera so the face reads on arrival
  let facing = Math.PI * 0.25 + 0.32;
  let visFacing = facing;
  let autoEmotion = true;
  let hopY = 0, hopV = 0, airborne = false;
  let jumps = 0, flipT = -1;                    // flipT >= 0 while the double-jump flip runs
  let justJumped = false;                       // one-frame squash kick for the visitor
  let wade = 0, splashT = 0;
  let prevSpeed = 0, turnRate = 0;
  let slopePitch = 0, slopeRoll = 0;
  let groundY = position.y;
  let duck = 0, ducking = false;                // duck is the damped 0..1 blend
  let slideT = 0, slideDir = { x: 0, z: 1 }, slideDust = 0;
  let rollT = 0, rollDir = { x: 0, z: 1 }, iframe = 0;
  let stomping = false;
  let pose = 'stand', poseK = 0;
  let action = null;                            // { kind, t, dur, resolve }

  const UP = { x: 0, y: 1, z: 0 };
  const hasListeners = (n) => { const s = ctx.events.map?.get(n); return !!(s && s.size); };
  /** particles may be a stub (its file failed to load) — never take the player
   *  down with it: the visitor still walks, he just walks without dust. */
  const burst = (o) => { const f = ctx.systems.particles?.burst; if (typeof f === 'function') { try { f.call(ctx.systems.particles, o); } catch { /* dust is optional */ } } };
  const puff = (o) => { if (!hasListeners(o.ev)) burst(o.p); ctx.events.emit(o.ev, o.d); };

  /**
   * Terrain height OR the highest walkable deck under (x,z), plus WHICH water is
   * over that point:
   *   water  — the surface level of the water here (0 = the sea, LAKE.surface
   *            inside the Chocolate Lake basin). NaN-free, always a number.
   *   limit  — how deep we are willing to wade in that water.
   *   floor  — the lowest y the feet may stand at here (ground, or the wading
   *            floor when the ground under the water is below it).
   */
  const LAKE = world.LAKE;
  function groundAt(x, z) {
    let h = world.height(x, z); let deck = false;
    const ws = ctx.walkables;
    for (let i = 0; i < ws.length; i++) {
      const t = ws[i] && ws[i].test && ws[i].test(x, z);
      if (typeof t === 'number' && Number.isFinite(t) && t > h - 0.05) { h = Math.max(h, t); deck = true; }
    }
    let water = 0, limit = SEA_WADE;
    if (!deck && LAKE) {
      const dx = x - LAKE.x, dz = z - LAKE.z;
      if (dx * dx + dz * dz < (LAKE.r + 8) * (LAKE.r + 8) && h < LAKE.surface) { water = LAKE.surface; limit = LAKE_WADE; }
    }
    return { h, deck, water, limit, floor: deck ? h : Math.max(h, water - limit) };
  }
  /** Standing here would put the water over `limit`: the shore says no. */
  const passable = (x, z) => { const g = groundAt(x, z); return g.deck || g.water - g.h <= g.limit; };

  /**
   * Push the body out of every solid it overlaps, then let it slide along the
   * surface. Two collider shapes, both from ctx.colliders:
   *   circle { x, z, r, h? }                       trunks, posts, rocks, cats
   *   box    { x, z, w, d, rot, h?, box:true }     walls, crates, long benches
   * A collider that publishes `h` is only solid while the feet are below it, so
   * a fence can be jumped and a cat house cannot. Writes into `out`.
   */
  function resolve(nx, nz, feetY, out) {
    const cols = ctx.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c || c.solid === false) continue;
      if (c.h != null && feetY > c.h - 0.05) continue;       // cleared it — jump over
      let px, pz, nxw, nzw;                                  // contact point + outward normal
      if (c.box) {
        const rot = c.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
        const dx = nx - c.x, dz = nz - c.z;
        const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;   // into box space
        const hw = (c.w || 0) * 0.5, hd = (c.d || 0) * 0.5;
        if (hw <= 0 || hd <= 0) continue;
        const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hd, hd);
        let ox = lx - qx, oz = lz - qz;
        const d2 = ox * ox + oz * oz;
        let nlx, nlz, pen;
        if (d2 > 1e-10) {
          if (d2 >= RADIUS * RADIUS) continue;
          const d = Math.sqrt(d2); nlx = ox / d; nlz = oz / d; pen = RADIUS - d;
        } else {
          // dead centre inside the box (spawned in a wall): out the nearest face
          const ex = hw - Math.abs(lx), ez = hd - Math.abs(lz);
          if (ex < ez) { nlx = lx < 0 ? -1 : 1; nlz = 0; pen = ex + RADIUS; }
          else { nlx = 0; nlz = lz < 0 ? -1 : 1; pen = ez + RADIUS; }
        }
        nxw = nlx * cs - nlz * sn; nzw = nlx * sn + nlz * cs;    // back to world
        px = nx + nxw * pen; pz = nz + nzw * pen;
      } else {
        const rr = (c.r || 0) + RADIUS;
        if (rr <= RADIUS) continue;
        const dx = nx - c.x, dz = nz - c.z; const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (d2 < 1e-8) { nxw = 1; nzw = 0; px = c.x + rr; pz = c.z; }
        else { const d = Math.sqrt(d2); nxw = dx / d; nzw = dz / d; px = c.x + nxw * rr; pz = c.z + nzw * rr; }
      }
      nx = px; nz = pz;
      const vn = velocity.x * nxw + velocity.z * nzw;
      if (vn < 0) { velocity.x -= vn * nxw; velocity.z -= vn * nzw; }   // slide along the face
    }
    out.x = nx; out.z = nz;
    return out;
  }
  const _res = { x: 0, z: 0 };

  function land() {
    const wasStomp = stomping;
    hopY = 0; hopV = 0; airborne = false; jumps = 0; flipT = -1; stomping = false;
    ctx.events.emit('player:land', { x: position.x, y: groundY, z: position.z, stomp: wasStomp });
    if (wasStomp) {
      ctx.events.emit('player:stomp', { x: position.x, y: groundY, z: position.z, r: STOMP_R });
      // a flat ring that runs OUT along the ground, not a white cloud over the
      // visitor: wide spread, small grains, low life, so the pose still reads
      burst({
        x: position.x, y: groundY + 0.06, z: position.z, count: 18,
        color: [0xf3e2c8, 0xe0c9a8, 0xcbb08c], speed: 9, life: 0.38, size: 0.16, gravity: -14, spread: 1.45,
      });
      ctx.systems.camera?.shake?.(0.55, 0.42);
    }
    return wasStomp;
  }

  const api = {
    group, mesh: group, visitor, position, velocity,
    get facing() { return facing; },
    set facing(v) { facing = v; visFacing = v; },
    speed: 7, running: false, onFerry: false, onVehicle: false, locked: false, radius: RADIUS,
    /** Scripted locomotion (ferry gangway, cutscenes): a driver that moves
     *  `position` itself writes the metres-per-second it is moving us at here,
     *  EVERY frame it drives, and the rig plays its walk cycle at that speed
     *  instead of the idle it would otherwise hold while `locked`. Consumed
     *  (zeroed) each update, so letting go of the controls stops the legs. */
    scriptedWalk: 0,
    /** Tells the architecture systems they can register oriented-box walls
     *  instead of synthesising chains of circles (see candy/architecture.js). */
    boxColliders: true,
    get wading() { return wade > 0.15; },
    get grounded() { return !airborne; },
    get ducking() { return ducking; },
    get sliding() { return slideT > 0; },
    get rolling() { return rollT > 0; },
    get stomping() { return stomping; },
    get invulnerable() { return iframe > 0; },
    set invulnerable(v) { iframe = v ? Math.max(iframe, 0.2) : 0; },
    get jumps() { return jumps; },
    get pose() { return pose; },
    /** 'scared' | 'happy' | 'neutral' — changes the face. Pass null to hand control
     *  back to the automatic mood (scared at night on Candyland). */
    setEmotion(e) { autoEmotion = (e == null); visitor.setEmotion(e || 'neutral'); },
    get emotion() { return visitor.getEmotion(); },
    /** The through-geometry silhouette pass on/off (see the header). */
    setSilhouette(on) { return visitor.setSilhouette(on); },
    get silhouetteOn() { return visitor.silhouetteOn; },
    /** What the feet are standing in at (x,z): { h, deck, water, limit, floor }. */
    groundInfo(x, z) { return groundAt(x, z); },

    /** Riding pose. 'stand' hands the body back to the walk cycle. */
    setPose(p) { pose = ['sit', 'paddle', 'fly', 'flail'].includes(p) ? p : 'stand'; return pose; },

    /**
     * A one-shot right-arm action for the weapons system:
     *   'swing' overhead chop · 'throw' windup + flick · 'spray' arm out, jitter.
     * Resolves when the arm is back in the walk cycle. A new action supersedes
     * the old one (whose promise resolves immediately).
     */
    playAction(kind = 'swing', duration = 0.45) {
      const k = ['swing', 'throw', 'spray'].includes(kind) ? kind : 'swing';
      action?.resolve?.();
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      action = { kind: k, t: 0, dur: Math.max(0.08, duration), resolve };
      ctx.events.emit('player:action', { kind: k, duration: action.dur });
      return promise;
    },
    get action() { return action?.kind || null; },

    /** Hop. Call again in the air for the flip. Returns true if it took. */
    jump() {
      if (api.onVehicle || api.locked || api.onFerry || ctx.state.paused) return false;
      if (rollT > 0 || jumps >= 2) return false;
      const dbl = jumps >= 1;
      hopV = dbl ? JUMP2_V : JUMP_V;
      airborne = true; stomping = false; slideT = 0; jumps = dbl ? 2 : 1; justJumped = true;
      if (dbl) flipT = 0;
      ctx.events.emit('player:jump', { x: position.x, y: position.y, z: position.z, double: dbl });
      burst({
        x: position.x, y: position.y + 0.06, z: position.z, count: dbl ? 10 : 6,
        color: dbl ? [0xffe9a8, 0xfff6e6] : [0xfff3df, 0xecd9c4], speed: dbl ? 3.4 : 1.8,
        life: 0.4, size: 0.16, gravity: -5, spread: 0.55,
      });
      return true;
    },

    /** Dodge roll in the movement direction (or facing when standing still). */
    roll() {
      if (api.onVehicle || api.locked || api.onFerry || ctx.state.paused) return false;
      if (rollT > 0 || airborne) return false;
      const hs = Math.hypot(velocity.x, velocity.z);
      if (hs > 0.4) { rollDir.x = velocity.x / hs; rollDir.z = velocity.z / hs; }
      else { rollDir.x = Math.sin(facing); rollDir.z = Math.cos(facing); }
      rollT = ROLL_TIME; iframe = ROLL_TIME + IFRAME_TAIL; slideT = 0; ducking = false;
      facing = Math.atan2(rollDir.x, rollDir.z);
      ctx.events.emit('player:roll', { x: position.x, z: position.z, dir: { ...rollDir } });
      return true;
    },

    teleport(x, z) {
      const g = groundAt(x, z);
      position.set(x, g.floor, z);
      velocity.set(0, 0, 0);
      groundY = position.y; hopY = 0; hopV = 0; airborne = false; wade = 0;
      jumps = 0; flipT = -1; stomping = false; slideT = 0; rollT = 0; iframe = 0; duck = 0; ducking = false;
      prevSpeed = 0; turnRate = 0; slopePitch = slopeRoll = 0;
      visitor.reset();
      group.position.copy(position);
      group.rotation.y = visFacing = facing;
      ctx.events.emit('player:teleport', { x: position.x, y: position.y, z: position.z });
    },

    update(dt, ctx) {
      if (dt <= 0) return;
      const vehicle = !!api.onVehicle;
      const frozen = ctx.state.paused || api.onFerry || api.locked || vehicle;
      const inp = ctx.input;

      // ── intent ──────────────────────────────────────────────────────────
      let ax = frozen ? { x: 0, y: 0, active: false } : inp.axis();
      if (!ax.active && (inp.virtual.x || inp.virtual.y) && !frozen) ax = { x: inp.virtual.x, y: inp.virtual.y, active: true };
      const b = ctx.systems.camera?.basis() || { fx: 0, fz: -1, rx: 1, rz: 0 };

      // ── moves: Space jump / double jump · C duck / slide / stomp · R roll ─
      if (!frozen) {
        const hsNow = Math.hypot(velocity.x, velocity.z);
        if (inp.pressed.has('Space')) api.jump();
        if (inp.pressed.has('KeyR')) api.roll();
        if (inp.pressed.has('KeyC')) {
          if (airborne && !stomping) { stomping = true; hopV = Math.min(hopV, STOMP_V); flipT = -1; }
          else if (!airborne && rollT <= 0 && slideT <= 0 && hsNow > SLIDE_MIN_SPEED) {
            // SLIDE — keeps the momentum you came in with, dies out by friction
            slideT = SLIDE_MAX; slideDust = 0;
            slideDir.x = velocity.x / hsNow; slideDir.z = velocity.z / hsNow;
            facing = Math.atan2(slideDir.x, slideDir.z);
            ctx.events.emit('player:slide', { x: position.x, z: position.z });
          }
        }
        ducking = inp.down('KeyC') && !airborne && rollT <= 0 && slideT <= 0;
      } else ducking = false;
      duck = damp(duck, ducking ? 1 : 0, 12, dt);
      if (iframe > 0) iframe -= dt;
      api.running = !frozen && !ducking && slideT <= 0 && (inp.down('ShiftLeft') || inp.down('ShiftRight'));

      // speed modifiers: running, ducking, wading, uphill
      let sp = api.speed * (api.running ? 1.58 : 1) * (ducking ? DUCK_SPEED : 1);
      sp *= 1 - wade * 0.42;
      if (ax.active) {
        const dx = b.fx * ax.y + b.rx * ax.x, dz = b.fz * ax.y + b.rz * ax.x;
        const l = Math.hypot(dx, dz) || 1;
        const ahead = 1.3;
        const grade = (groundAt(position.x + dx / l * ahead, position.z + dz / l * ahead).h - groundY) / ahead;
        sp *= clamp(1 - Math.max(0, grade) * 0.62, 0.52, 1);
      }
      const tx = ax.active ? (b.fx * ax.y + b.rx * ax.x) * sp : 0;
      const tz = ax.active ? (b.fz * ax.y + b.rz * ax.x) * sp : 0;
      const lam = ax.active ? ACCEL : DECEL;
      velocity.x = damp(velocity.x, tx, lam, dt);
      velocity.z = damp(velocity.z, tz, lam, dt);
      if (!ax.active && velocity.lengthSq() < 0.02) velocity.set(0, 0, 0);

      // the roll and the slide OWN the velocity while they run
      if (rollT > 0) {
        rollT -= dt;
        const u = clamp(1 - rollT / ROLL_TIME, 0, 1);
        const rs = (ROLL_DIST / ROLL_TIME) * (1.25 - 0.5 * u);     // ∫ = ROLL_DIST
        velocity.x = rollDir.x * rs; velocity.z = rollDir.z * rs;
        if (rollT <= 0) { rollT = 0; velocity.x *= 0.45; velocity.z *= 0.45; }
      } else if (slideT > 0) {
        slideT -= dt;
        const cur = Math.hypot(velocity.x, velocity.z);
        const ns = damp(cur, 0, 1.5, dt);
        velocity.x = slideDir.x * ns; velocity.z = slideDir.z * ns;
        slideDust -= dt * (0.4 + ns * 0.5);
        if (slideDust <= 0) {
          slideDust = 1;
          burst({
            x: position.x - slideDir.x * 0.3, y: position.y + 0.08, z: position.z - slideDir.z * 0.3,
            count: 6, color: [0xfff3df, 0xecd9c4], speed: 2.4, life: 0.42, size: 0.19, gravity: -5, spread: 0.5,
          });
        }
        if (ns < 2.5 || slideT <= 0) slideT = 0;
      }

      // ── integrate + collide ─────────────────────────────────────────────
      if (!vehicle) {
        let nx = position.x + velocity.x * dt, nz = position.z + velocity.z * dt;
        // water / sea edge: block, but slide along the shoreline so you don't stick
        if (!passable(nx, nz)) {
          if (passable(nx, position.z)) { nz = position.z; velocity.z *= 0.25; }
          else if (passable(position.x, nz)) { nx = position.x; velocity.x *= 0.25; }
          else { nx = position.x; nz = position.z; velocity.x *= 0.12; velocity.z *= 0.12; }
        }
        // solid props and walls — push out, then slide along the surface
        resolve(nx, nz, position.y, _res);
        position.x = _res.x; position.z = _res.z;
      }

      // ── ground follow (terrain or walkable deck), no jitter ─────────────
      const g = groundAt(position.x, position.z);
      if (vehicle || (api.onFerry && !g.deck)) {
        groundY = position.y - hopY;            // the vehicle / ferry owns vertical placement
      } else {
        const targetGround = g.floor + (g.deck ? DECK_LIFT : 0);
        const stepUp = targetGround - groundY;
        groundY = damp(groundY, targetGround, Math.abs(stepUp) > 0.9 ? 9 : 20, dt);
      }

      // wading
      const submerged = (g.deck || vehicle) ? 0 : clamp((g.water - g.h) / 0.6, 0, 1);
      const wasWading = wade > 0.2;
      wade = damp(wade, submerged, 8, dt);
      const hs = Math.hypot(velocity.x, velocity.z);
      if (wade > 0.2) {
        splashT -= dt * (0.6 + hs * 0.55);
        if (!wasWading) { splashT = 0; }
        if (splashT <= 0) {
          splashT = 1;
          puff({
            ev: 'player:splash', d: { x: position.x, y: g.water + 0.05, z: position.z, big: hs > 5 },
            p: { x: position.x, y: g.water + 0.1, z: position.z, count: hs > 5 ? 14 : 7, color: g.water > 0.5 ? [0x8a5a33, 0xc08a52] : [0xffffff, 0xcdeafd], speed: 1.8 + hs * 0.22, life: 0.5, size: 0.2, gravity: -7, spread: 0.7 },
          });
        }
      }

      // ── air ─────────────────────────────────────────────────────────────
      let landed = false;
      const tookOff = justJumped; justJumped = false;
      if (!vehicle && airborne) {
        hopV -= (stomping ? GRAV * 2.2 : GRAV) * dt;
        hopY += hopV * dt;
        if (flipT >= 0) flipT += dt;
        if (hopY <= 0) { landed = true; land(); }
      }
      if (vehicle) { hopY = 0; airborne = false; }
      position.y = groundY + hopY;

      // ── facing ──────────────────────────────────────────────────────────
      if (ax.active && hs > 0.3 && rollT <= 0 && slideT <= 0) facing = Math.atan2(velocity.x, velocity.z);
      let dA = facing - visFacing;
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      const turnStep = dA * (1 - Math.exp(-TURN_RATE * dt));
      visFacing += turnStep;
      turnRate = damp(turnRate, turnStep / dt, 10, dt);
      group.rotation.y = visFacing;

      // ── terrain slope under the feet (subtle body tilt) ─────────────────
      let gn = UP;
      if (!g.deck && !vehicle) {
        gn = world.normal(position.x, position.z, 0.6);
        const s = Math.sin(visFacing), c = Math.cos(visFacing);
        slopePitch = damp(slopePitch, clamp(-(gn.x * s + gn.z * c) / Math.max(0.2, gn.y), -0.5, 0.5), 7, dt);
        slopeRoll = damp(slopeRoll, clamp((gn.x * c - gn.z * s) / Math.max(0.2, gn.y), -0.5, 0.5), 7, dt);
      } else { slopePitch = damp(slopePitch, 0, 8, dt); slopeRoll = damp(slopeRoll, 0, 8, dt); }

      // ── mood + night readability ────────────────────────────────────────
      if (autoEmotion) visitor.setEmotion(ctx.state.isNight && ctx.state.island === 'candy' ? 'scared' : 'neutral');
      const nightK = 1 - clamp(ctx.state.daylight ?? 1, 0, 1);
      visitor.setNightGlow(nightK);
      fill.intensity = FILL_MAX * nightK;
      fill.visible = nightK > 0.02;
      // The through-geometry silhouette belongs to the follow camera. A free
      // camera is framing the island, not the visitor, and a cream ghost showing
      // through a hillside in an overview render is just a bug with a halo.
      visitor.setSilhouette(!ctx.systems.camera?.isFree?.());

      // ── pose ────────────────────────────────────────────────────────────
      if (action) {
        action.t += dt;
        if (action.t >= action.dur) { action.resolve?.(); action = null; }
      }
      poseK = damp(poseK, pose === 'stand' ? 0 : 1, 7, dt);
      const accel = (hs - prevSpeed) / dt; prevSpeed = hs;
      // A scripted walk overrides both the speed the rig sees and the `locked`
      // flag that would pin it to idle — otherwise a cutscene that slides the
      // body along a path animates a statue on a skateboard.
      const scripted = api.scriptedWalk || 0; api.scriptedWalk = 0;
      const rigSpeed = scripted > 0.05 ? scripted : ((airborne || rollT > 0) ? 0 : hs);
      const anim = visitor.update(dt, {
        elapsed: ctx.state.elapsed, speed: rigSpeed, moving: rigSpeed > 0.35 && slideT <= 0 && rollT <= 0,
        turnRate, accel: clamp(accel, -60, 60),
        hop: airborne ? clamp(hopY / 0.8, 0, 1) : 0, wade,
        slopePitch, slopeRoll, locked: frozen && scripted <= 0.05, landed, tookOff,
        duck, slide: slideT > 0 ? 1 : 0, stomp: stomping ? 1 : 0,
        roll: rollT > 0 ? clamp(1 - rollT / ROLL_TIME, 0, 1) : -1,
        flip: flipT >= 0 ? clamp(flipT / FLIP_DUR, 0, 1) : -1,
        pose, poseK, action,
      });

      // footfall → particles / audio hook
      if (anim.step && !airborne) {
        const s = Math.sin(visFacing), c = Math.cos(visFacing);
        const fx = position.x + c * anim.step * 0.16, fz = position.z - s * anim.step * 0.16;
        const dust = wade > 0.2
          ? { x: fx, y: 0.06, z: fz, count: 6, color: [0xffffff, 0xcdeafd], speed: 2.2, life: 0.45, size: 0.18, gravity: -8, spread: 0.35 }
          : { x: fx, y: position.y + 0.06, z: fz, count: 4, color: [0xfff3df, 0xecd9c4], speed: 0.9, life: 0.42, size: 0.14, gravity: -3.2, spread: 0.3 };
        puff({ ev: 'player:step', d: { x: fx, y: position.y, z: fz, side: anim.step, running: api.running }, p: dust });
      }

      group.position.set(position.x, position.y, position.z);

      // ── per-foot ground clamp ───────────────────────────────────────────
      // The body follows the ground under its own centre, so on a step, a deck
      // edge or a slope one shoe ends up inside the geometry. Sample the ground
      // under each sole (real world matrices, this frame) and hand the visitor
      // an absolute lift: what it already applies, plus the gap that is left.
      // Skipped whenever the feet are not meant to be on the ground: airborne,
      // mid-roll, riding a vehicle.
      if (!airborne && rollT <= 0 && !vehicle && poseK < 0.2) {
        const feet = visitor.feetWorld();
        const lift = [0, 0];
        for (let i = 0; i < 2; i++) {
          const f = feet[i];
          const fg = groundAt(f.x, f.z);
          const fy = fg.floor + (fg.deck ? DECK_LIFT : 0);
          lift[i] = f.lift + (fy - f.y);
        }
        visitor.setFootLift(lift[0], lift[1]);
      } else visitor.setFootLift(0, 0);

      decals.update(dt, {
        // riding something: drop the contact shadow onto the real ground below
        x: position.x, y: vehicle ? world.height(position.x, position.z) : groundY, z: position.z,
        normal: gn, hop: vehicle ? Math.max(0, position.y - world.height(position.x, position.z)) : hopY, speed: hs,
        zoom: ctx.systems.camera?.current?.distance || 0, elapsed: ctx.state.elapsed,
        night: nightK,          // the dark contact disc hands over to the warm pool
      });
      ctx.state.playerMoving = hs > 0.5;
      ctx.state.playerSpeed = hs;
      ctx.state.playerWading = wade > 0.2;
      ctx.state.playerAirborne = airborne;
    },
  };

  api.teleport(start.x, start.z);
  return api;
}
