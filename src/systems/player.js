// THE VISITOR — the human you play. Chunky procedural tourist (see
// systems/player/visitor.js) plus snappy-but-weighted ground movement.
//
// INPUT (wave-2 contract; nobody else binds these):
//   WASD move · Shift run · Space jump, Space again in the air = double jump
//   with a forward flip · C hold = duck, C while running = slide, C in the air
//   = STOMP (slam + shockwave) · R = dodge roll (0.6 s, ~5 u, i-frames).
//   V look-around (hold) / tap V recentre / right-drag orbit belong to the camera;
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
// Wave 3 (Contract A — ground & collision core, player/ground.js):
//   groundInfo(x, z, out?) → { h, deck, water, limit, floor, prop, top, base }
//     h = where FEET rest: terrain | walkable deck | the TOP of a LOW PROP
//     (a collider whose height above the ground is ≤ 1.6), ramped over the
//     outer 0.3 u. prop = the collider stood on or null. Pass `out` in hot
//     loops (zero allocation); without it a fresh object comes back.
//   groundHeight(x, z) → number — the same h, no object at all.
//   pushOut(x, z, r = 0.45, out?) → { x, z, hit } — circle vs every SOLID
//     collider (circles + oriented boxes) through a spatial hash rebuilt when
//     ctx.colliders changes. hit = "turn around". LOW props never block NPCs.
//   speedBoost — multiplies walk/run speed (default 1; powerups sets 1.25).
//   colliderAudit — the counts printed once at world:ready (see ground.js),
//     plus .calibration: what player/calibrate.js did to each low prop
//     (lowered / raised to the drawn surface, kept SOLID because drawn
//     geometry would be inside a walker, ghosts retired) and a centre-ray
//     audit of standing tops vs drawn surfaces. ?caltrace keeps the per-point
//     crossings for debugging.
//   The visitor steps onto low props: ≤ 0.45 u just by walking (ramped), taller
//   ones with an automatic hop when he walks INTO them; he falls off ledges
//   with gravity instead of floating down; walls/trunks/houses never let him in.
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
import { createGroundCore, LOW_MAX } from './player/ground.js';
import { calibrateLowTops } from './player/calibrate.js';

const RADIUS = 0.36;          // collision radius
const SEA_WADE = 0.85;        // deepest SEA water we will wade into; past it, blocked
// Chocolate Lake. world.LAKE carves a bowl 1.2 units under its own surface, and
// nothing about that surface is sea level — a visitor who walked in stood on the
// bowl floor with the chocolate up to his hat brim. Inside the bowl the water
// level is LAKE.surface and the wading limit is shin-deep: the lake is opaque,
// so anything past that is a body double for drowning.
const LAKE_WADE = 0.32;
const DECK_LIFT = 0.035;      // clearance so shoes never sink into pier planks, steps or a prop top
const ACCEL = 17;             // damping lambda toward target velocity
const DECEL = 11;
const TURN_RATE = 13;
// ── ground core (wave 3) ─────────────────────────────────────────────────────
const FOOT_PAD = 0.22;        // shoe reach past the body centre: he stands on a ledge until his heel leaves it
const STEP_FREE = 0.45;       // props up to this tall are walked onto; taller ones are hopped onto
const HOP_MARGIN = 0.2;       // the auto-hop clears the top by this much, then settles onto it
const HOP_STEP = 0.15;        // mid-hop the ledge stays solid until the feet are this close to its top
const MAX_SUBSTEP = 0.3;      // longest collision step (no tunnelling through a 0.26-u fence at a sprint)

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
  let autoHop = false;                          // airborne because we hopped up onto a low prop
  let lastHopRise = 0;
  let pose = 'stand', poseK = 0;
  let action = null;                            // { kind, t, dur, resolve }

  const UP = { x: 0, y: 1, z: 0 };
  const hasListeners = (n) => { const s = ctx.events.map?.get(n); return !!(s && s.size); };
  /** particles may be a stub (its file failed to load) — never take the player
   *  down with it: the visitor still walks, he just walks without dust. */
  const burst = (o) => { const f = ctx.systems.particles?.burst; if (typeof f === 'function') { try { f.call(ctx.systems.particles, o); } catch { /* dust is optional */ } } };
  const puff = (o) => { if (!hasListeners(o.ev)) burst(o.p); ctx.events.emit(o.ev, o.d); };

  // ── ground & collision core (player/ground.js): terrain, decks, water, low
  // props to stand on, and a spatial hash over ctx.colliders for the solids.
  const core = createGroundCore(ctx, world, { seaWade: SEA_WADE, lakeWade: LAKE_WADE });
  const _g = {}, _gT = {}, _gF = {};
  /** Ground under the VISITOR at (x,z): he may stand on tall tops he has
   *  already cleared, and his shoe reach (FOOT_PAD) keeps him on a ledge. */
  let stepFree = STEP_FREE;     // HOP_STEP while an auto-hop is rising: no shin through the bench edge
  const groundAt = (x, z, out = _gT) => core.groundAt(x, z, position.y, FOOT_PAD, out, stepFree);
  /** Standing here would put the water over `limit`: the shore says no. */
  const passable = (x, z) => { const g = groundAt(x, z); return g.deck || g.water - g.h <= g.limit; };
  const _res = { x: 0, z: 0, hit: false, low: null, lowTop: 0, lowNx: 0, lowNz: 0 };
  let bumpLow = null, bumpTop = 0, bumpNx = 0, bumpNz = 0;
  /** Push the body out of every solid it overlaps and slide along the face;
   *  a low prop taller than a stride blocks too, until the feet clear it, and
   *  is remembered so update() can hop up onto it. */
  function resolve(nx, nz, feetY, out) {
    core.pushOut(nx, nz, RADIUS, feetY, velocity, out, stepFree);
    if (out.low && !bumpLow) { bumpLow = out.low; bumpTop = out.lowTop; bumpNx = out.lowNx; bumpNz = out.lowNz; }
    return out;
  }
  let auditDone = false;
  const _pOut = { x: 0, z: 0, hit: false };

  function land() {
    const wasStomp = stomping;
    hopY = 0; hopV = 0; airborne = false; jumps = 0; flipT = -1; stomping = false; autoHop = false;
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
    /** Contract A. Where feet rest at (x,z) for any WALKER (NPC rules: low
     *  props are stood on, ramped; nothing taller is). Pass `out` to reuse an
     *  object: { h, deck, water, limit, floor, prop, top, base }. */
    groundInfo(x, z, out) { return core.groundAt(x, z, -Infinity, 0, out || {}); },
    /** Contract A, allocation-free: just the height the feet rest at. */
    groundHeight(x, z) { return core.groundAt(x, z, -Infinity, 0, _gF).h; },
    /** Contract A. Resolve a walker's circle against every SOLID collider.
     *  Returns { x, z, hit } (pass `out` to reuse one). ≤ 0.02 ms per call. */
    pushOut(x, z, r = 0.45, out) { return core.pushOut(x, z, r, -Infinity, null, out || {}); },
    /** Multiplies walk/run speed; read every frame (powerups: 1.25 while a star runs). */
    speedBoost: 1,
    /** Filled once at world:ready: collider counts + the most common unheighted solids. */
    colliderAudit: null,
    /** The ground core itself (stats, audit(), lowPropsNear(x,z,r), kindOf(c)). */
    ground: core,
    /** Debug snapshot of the vertical state (tests / the verifier). */
    get groundDebug() { return { groundY, hopY, hopV, airborne, autoHop, jumps, bumpTop: bumpLow ? bumpTop : null, lastHopRise }; },

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
      airborne = true; stomping = false; slideT = 0; jumps = dbl ? 2 : 1; justJumped = true; autoHop = false;
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
      // land on a crate or a rock if there is one here, never on a wall top
      const g = core.groundAt(x, z, core.baseAt(x, z) + LOW_MAX + 0.05, FOOT_PAD, _gT, STEP_FREE);
      position.set(x, g.floor + ((g.deck || g.prop) ? DECK_LIFT : 0), z);
      velocity.set(0, 0, 0);
      groundY = position.y; hopY = 0; hopV = 0; airborne = false; wade = 0;
      jumps = 0; flipT = -1; stomping = false; slideT = 0; rollT = 0; iframe = 0; duck = 0; ducking = false; autoHop = false;
      prevSpeed = 0; turnRate = 0; slopePitch = slopeRoll = 0;
      visitor.reset();
      group.position.copy(position);
      group.rotation.y = visFacing = facing;
      ctx.events.emit('player:teleport', { x: position.x, y: position.y, z: position.z });
    },

    update(dt, ctx) {
      if (!auditDone) { auditDone = true; runAudit(); }
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
      const boost = Number.isFinite(api.speedBoost) ? clamp(api.speedBoost, 0.2, 3) : 1;
      let sp = api.speed * boost * (api.running ? 1.58 : 1) * (ducking ? DUCK_SPEED : 1);
      sp *= 1 - wade * 0.42;
      if (ax.active) {
        const dx = b.fx * ax.y + b.rx * ax.x, dz = b.fz * ax.y + b.rz * ax.x;
        const l = Math.hypot(dx, dz) || 1;
        const ahead = 1.3;
        // terrain grade only — a crate ahead is hopped onto, not trudged up
        const grade = (core.baseAt(position.x + dx / l * ahead, position.z + dz / l * ahead) - core.baseAt(position.x, position.z)) / ahead;
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
      bumpLow = null;
      stepFree = (airborne && autoHop) ? HOP_STEP : STEP_FREE;
      core.sweep(192);                        // catch colliders moved / regrown in place (full pass ≈ 20 frames)
      if (!vehicle) {
        const moveLen = Math.hypot(velocity.x, velocity.z) * dt;
        const sub = Math.min(4, Math.max(1, Math.ceil(moveLen / MAX_SUBSTEP)));
        const sdt = dt / sub;
        for (let si = 0; si < sub; si++) {
          let nx = position.x + velocity.x * sdt, nz = position.z + velocity.z * sdt;
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
      }

      // ── ground follow (terrain, deck or prop top), no jitter ────────────
      const g = groundAt(position.x, position.z, _g);
      const hsMove = Math.hypot(velocity.x, velocity.z);
      if (vehicle || (api.onFerry && !g.deck)) {
        groundY = position.y - hopY;            // the vehicle / ferry owns vertical placement
      } else {
        const targetGround = g.floor + ((g.deck || g.prop) ? DECK_LIFT : 0);
        if (airborne) {
          // In the air the BODY keeps its height; only the ground under it
          // changes (a crate slid under the feet, a ledge fell away).
          const absY = groundY + hopY;
          groundY = targetGround; hopY = absY - targetGround;
        } else {
          const stepUp = targetGround - groundY;
          if (-stepUp > 0.45 + hsMove * dt * 0.9) {
            // walked off a crate / wall / deck edge: FALL, don't float down
            airborne = true; hopY = -stepUp; hopV = 0; groundY = targetGround;
            stomping = false; flipT = -1; slideT = 0; autoHop = false;
          } else if (bumpLow && !frozen && ax.active && rollT <= 0 && slideT <= 0 && !ducking) {
            // walked INTO a low prop taller than a stride: hop up onto it
            const il = Math.hypot(tx, tz) || 1;
            const into = -(tx / il * bumpNx + tz / il * bumpNz);
            const rise = bumpTop - groundY;
            if (into > 0.5 && rise > 0.05 && rise < LOW_MAX + 0.4) {
              lastHopRise = rise;
              hopV = Math.sqrt(2 * GRAV * (rise + HOP_MARGIN));
              airborne = true; jumps = 1; justJumped = true; stomping = false; flipT = -1; autoHop = true;
              ctx.events.emit('player:jump', { x: position.x, y: position.y, z: position.z, double: false, auto: true });
            }
            groundY = damp(groundY, targetGround, Math.abs(stepUp) > 0.9 ? 9 : 20, dt);
          } else {
            groundY = damp(groundY, targetGround, Math.abs(stepUp) > 0.9 ? 9 : 20, dt);
          }
        }
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
        const wasUnder = hopY < -0.02;          // the ground rose into us (a ledge we are hopping up)
        hopV -= (stomping ? GRAV * 2.2 : GRAV) * dt;
        hopY += hopV * dt;
        if (flipT >= 0) flipT += dt;
        // an auto-hop is a MANTLE: the moment the feet are over the top at
        // its height — rising or falling — settle onto it right there, instead
        // of sailing across a one-metre bench and dropping off the far side
        const mantle = autoHop && !!g.prop && hopY >= -0.06 && hopY <= HOP_MARGIN + 0.05;
        if ((hopY <= 0 && hopV <= 0) || mantle) {
          const under = hopY;
          landed = true; land();
          if (wasUnder) groundY += under;       // stay put; the ground follow lifts us the rest
        }
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
      if (!g.deck && !g.prop && !vehicle) {
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
          const fg = core.groundAt(f.x, f.z, position.y, 0, _gF, STEP_FREE);
          const fy = fg.floor + ((fg.deck || fg.prop) ? DECK_LIFT : 0);
          lift[i] = f.lift + (fy - f.y);
        }
        visitor.setFootLift(lift[0], lift[1]);
      } else visitor.setFootLift(0, 0);

      decals.update(dt, {
        // riding something: drop the contact shadow onto the real ground below
        x: position.x, y: vehicle ? world.height(position.x, position.z) : groundY, z: position.z,
        normal: gn, hop: vehicle ? Math.max(0, position.y - world.height(position.x, position.z)) : Math.max(0, hopY), speed: hs,
        zoom: ctx.systems.camera?.current?.distance || 0, elapsed: ctx.state.elapsed,
        night: nightK,          // the dark contact disc hands over to the warm pool
      });
      ctx.state.playerMoving = hs > 0.5;
      ctx.state.playerSpeed = hs;
      ctx.state.playerWading = wade > 0.2;
      ctx.state.playerAirborne = airborne;
    },
  };

  /** Once, at world:ready (the first frame after it, when every system —
   *  including the ones created after the player — has pushed its colliders). */
  function runAudit() {
    try {
      let cal = null;
      try { cal = calibrateLowTops(ctx, core, { skip: group, budgetMs: 600, trace: !!ctx.params?.has?.('caltrace') }); } catch (e) { cal = { error: e?.message }; }
      const A = core.audit();
      A.calibration = cal;
      api.colliderAudit = A;
      const t0 = performance.now(); let k = 0;
      for (let i = 0; i < 2000; i++) { core.pushOut(-140 + (i % 40) * 0.9, 40 + ((i / 40) | 0) * 0.9, 0.45, -Infinity, null, _pOut); k += _pOut.hit ? 1 : 0; }
      A.pushOutMs = +((performance.now() - t0) / 2000).toFixed(5);
      console.info(`[player] ground core: ${A.total} colliders · ${A.withH} carry h · ${A.low} LOW props (standable: ${A.lowLegacy} legacy absolute-h, ${A.lowRelative} contract h) · ` +
        `${A.tall} solid with a top (hurdles/walls, jumpable) · ${A.solidNoH} solid without h · ${A.nonSolid} solid:false · hash build ${core.stats.lastBuildMs.toFixed(1)} ms · pushOut ${A.pushOutMs} ms/call`);
      if (cal) {
        console.info(`[player] low props calibrated to their meshes: ${cal.props} low props · ${cal.lowered} lowered (mean ${cal.meanDrop} u) · ${cal.raised} raised · ${cal.sloped || 0} follow their slope · ${cal.solid} kept SOLID (drawn geometry at body height) · ${cal.ghosts} ghost colliders retired · ${cal.kept} kept · ${cal.unreached || 0} unreached · ` +
          `${cal.bigMeshes || 0} merged meshes walked (${cal.walkedTris || 0} tris, ${cal.phase2Ms} ms) + ${cal.smallMeshes || 0} meshes / ${cal.instances || 0} instances ray-cast (${cal.phase1Ms} ms) · ${cal.ms} ms${cal.error ? ' · ERROR ' + cal.error : ''}`);
        const au = cal.audit;
        if (au) console.info(`[player] low-prop audit (centre ray): ${au.within} of ${au.n} standable props within ±0.25 u of the drawn surface · ${au.float} float > 0.25` +
          (au.grooved ? ` (${au.grooved} of them: the centre line falls in a groove between chocolate squares; ${au.groovedWithin} within ±0.25 of the squares either side)` : '') + ` · ${au.sink} sink > 0.25` +
          (au.worstFloat.length ? ` · worst float ${au.worstFloat.slice(0, 4).map((w) => `(${w[0]},${w[1]}) +${w[2]}${w[3] ? ' ' + w[3] : ''}`).join(' ')}` : '') +
          (au.worstSink.length ? ` · worst sink ${au.worstSink.slice(0, 3).map((w) => `(${w[0]},${w[1]}) ${w[2]}`).join(' ')}` : ''));
        if (cal.solidList?.length) console.info('[player] low props kept SOLID (walkers would stand inside drawn geometry; add a taller h or trim the mesh):\n' +
          cal.solidList.slice(0, 40).map((q) => `  (${q.at.join(',')}) ${q.why === 'clutter' ? `drawn geometry +${q.rise} u above the standing top${q.centre ? ' at the centre' : ` at ${q.sides} of 4 side points`}` : 'no surface under it, drawn geometry around it'}${q.top != null ? ' · perch top ' + q.top : ' · no top'}`).join('\n'));
      }
      console.info('[player] most common SOLID colliders without h (add h ≤ 1.6 to make the low ones standable):\n' +
        A.groups.map((g, i) => `  ${i + 1}. ${g.n}× ${g.kind} (mean size ${g.meanSize}) e.g. ${g.example.join(',')}`).join('\n'));
    } catch (e) { console.info('[player] collider audit skipped', e?.message); }
  }
  ctx.events.on('world:ready', () => { core.sync(); });

  api.teleport(start.x, start.z);
  return api;
}
