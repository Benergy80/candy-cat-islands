// ─────────────────────────────────────────────────────────────────────────────
// THE ENDING — WAVE 4, Contract L. The real escape.
//
//   1. Two halves of one MEOW AIR boarding pass (seat 1A, destination: AWAY):
//        · the Mayor's half, handed over with the honorary-citizen medal
//          (containment.js giveMedal → story `pass_cat`)
//        · the King's half, left on the Gummy Throne in the Candy Palace
//          (palace.js → story `pass_candy`)
//   2. At the top of the rainbow bridge stands a little glass case:
//      "IN CASE OF ESCAPE · BREAK GLASS". With both halves, E fires the flare.
//      It hangs red over the strait — everything on both islands can see it.
//   3. MEOW AIR answers: planes.summonJet(apex) (the air-routes builder's jet)
//      if it exists, otherwise our own stand-in jet flies the same beats: in
//      from the west, a bank round the flare, a hover 12 u over the deck, a
//      rope ladder unrolling to your feet.
//   4. As the jet brakes in, its rope ladder unrolls toward you and the prompt
//      comes up: "Grab the ladder" (E). Pressed, you take it the instant it is
//      in reach; not pressed, you take it anyway after a beat. Then you CLIMB —
//      6 s up the rungs while the tigers pad up the rainbow from Cat Island and
//      the Sourlings from the Candy Kingdom, and they gather on the deck
//      below you and look up. Nobody grabs. Everybody watches. (The
//      light-horror beat.)
//   5. At the hatch the CREDITS begin (own DOM, the title card's visual
//      language, ≈ 40 s, any key skips): "ESCAPED." pops over the jet as it
//      climbs out east, the lens lets it go and pulls back over both islands
//      shrinking below, and the roll rises; story `escaped_for_real`; then
//      location.reload() → the title card.
//
// The crowd is VISUAL-ONLY (no citizens/sourpatch 'gather' hook exists yet):
// 5 tigers + 8 kids as two InstancedMeshes with glowing eyes (r4: spaced so
// each body reads; the kids in the game's own silhouette — square head, corner
// nubs, big white eyes, lime grin — lit from inside in their own colour). If
// either system later grows `gatherAt({x,y,z,path,from})` returning truthy, it
// is called first and our stand-ins for that side stay home.
// THE WATCHERS (r4): from the first rung, eyes open pair by pair all over Cat
// Island's dark treeline and gardens, and a tall figure with a lantern stands on
// the Arrivals Pier looking up — the whole island watching you go, under the
// credits too. The credits grade the night a little (fogScale, and a lift on
// sky.js's exposure/hemi/ambient, which sky re-applies every frame, so it ends
// with the credits).
//
// API — ctx.systems.escape.routes.ending
//   phase ('idle'|'ready'|'flare'|'jet'|'ladder'|'climb'|'credits'|'done')
//   passes → { cat, candy } · creditsActive
//   debugPasses() (grant both halves) · debugSignal() (fire the flare now,
//   placing the visitor at the apex) · debugClimb(t) (skip to the climb, t s in)
//   debugCredits(t) (start the credits posed at t s; never reloads under ?shot)
//   debugJet(t) (pose the stand-in jet t s into its approach)
// URL: ?ending=passes · ?ending=signal · ?ending=credits · ?noreload=1
// Draw calls: the case 2 (one merged mesh + the glass; 1 once the glass is broken) while the bridge is up;
// crowd 2 + glows 1 (flare, smoke trail, all the eyes, the lantern) + the watcher 1 while the ending runs; the
// stand-in jet 3 only if planes.summonJet is missing. With the air-routes jet:
// summonJet(point, {hold: climb + 4, approach: 'short'}) (`approach` is a hint
// the air-routes jet may honour for a shorter run-in), jetHold at the first
// rung and again when it settles into its hover, jetGo() at the hatch;
// 'planes:summon' {phase:'ladder'} is honoured as well as the promise (stepped
// runs never yield to microtasks), and so is the ladder simply being in reach
// (the jet within LADDER_REACH of its hover point, the rope fully out).
// TIMING (flare → credits, jet idle, entering from the west): the run-in
// ≈ 18.2 s to in-reach, + LADDER_BEAT, + the 6-s climb ≈ 24.5 s.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash, clamp, damp, lerp, smoothstep } from '../../core/util.js';
import { createRider } from './ride.js';

const CLIMB_T = 6.0;
const LADDER_BEAT = 0.3;        // the ladder is in reach: this long to press E, then you grab it anyway
const PROMPT_R = 62;            // the "Grab the ladder" prompt comes up when the jet is this close (its rope unrolling)
const LADDER_REACH = 1.6;       // …and the rope is in reach when the jet is this close to its hover point
const FOLLOW_T = 3.6;           // credits: the lens follows the jet climbing out this long…
const BLEND_T = 3.6;            // …then eases over this long into the pull-back over both islands
const HOVER_H = 12;             // the jet hovers this far over the deck
// the climb's lens: outside the U's bend, a little off square (az, rad), pulling back and settling as you go up
// (r4: from just east of north, a touch higher — the bend runs the width of the frame,
//  the tigers gathered up one side and the kids up the other, the ladder between them;
//  r3's 0.35 put the raiders' leg in the corner of the frame, cut by its edge)
const CLIMB_CAM = { az: 0.15, d0: 34, d1: 37, el0: 0.2, el1: 0.14, fov: 46, ty: 4.6 };
const CREDITS_T = 40;
const TIGERS = 5, KIDS = 8;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const backOut = (x) => { const c = 2.1; x = clamp(x, 0, 1); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export function create(ctx, escape) {
  const { world } = ctx;
  const params = ctx.params || new URLSearchParams('');
  const story = () => ctx.systems.story;
  const ui = () => ctx.systems.ui;
  const bridge = () => escape.routes?.bridge;
  const player = () => ctx.systems.player;
  const rider = createRider(ctx);

  const group = new THREE.Group(); group.name = 'ending'; group.visible = false;
  group.userData.noOcclude = true; group.userData.noFade = true;
  ctx.scene.add(group);

  const S = {
    phase: 'idle', t: 0, flareT: -1, jetT: 0, theirs: false, ladderT: 0, climbT: 0, credT: 0,
    ladder: { x: 0, y: 0, z: 0 }, broken: false, cam: null, camO: null, target: new THREE.Vector3(), savedFog: 1,
    grab: false,               // E pressed while the ladder was still coming in: take it the instant it is in reach
    // the credits' opening lens: where the climb's shot left off (az, el, dist, fov, target) → follow the jet
    follow: false, fA: { az: 0, el: 0.1, dist: 34, fov: 50, x: 0, y: 0, z: 0 }, jx: 0, jy: 0, jz: 0,
  };
  const has = (f) => !!story()?.get(f);
  const passes = () => ({ cat: has('pass_cat'), candy: has('pass_candy') });

  // ═══════════════════════════════════════════════ the case at the apex ═══
  let caseSpot = null, caseMeshes = null, caseCol = null, flareEntry = null, ladderEntry = null;
  // The case is TWO draw calls: one vertex-coloured mesh (gumdrop pedestal,
  // brass tray and lid, the flare pistol, the sign, its post) and the glass.
  // The sign's canvas carries a white patch and a black patch under the
  // lettering: every other part samples white through `map` (uv) and black
  // through `emissiveMap` (uv1), so only the sign glows after dark. The pistol
  // is laid down LAST, so breaking the glass hides it with a draw range.
  const CV_W = 256, CV_H = 192;                              // sign 256 × 128 on top, patches under it
  const UV_WHITE = [0.25, 1 - 160 / CV_H], UV_BLACK = [0.75, 1 - 160 / CV_H];
  function buildCase() {
    const B = bridge(); if (!B?.frameAt || caseSpot) return;
    const s = B.sAt(B.apex.x, B.apex.z);
    const f = B.frameAt(s >= 0 ? s : B.length / 2);
    const lat = B.halfWidth - 0.75;                             // on the inside of the U, by the rail
    caseSpot = { x: f.x + f.nx * lat, y: f.y, z: f.z + f.nz * lat, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz, stand: { x: f.x - f.nx * 0.4, z: f.z - f.nz * 0.4 } };
    const yaw = Math.atan2(-f.nx, -f.nz);                       // the case's front faces the deck centre
    const parts = [];
    /** A part in world space with a flat vertex colour and the two patch UVs (or its own). */
    const put = (g, hex, x, y, z, ry = 0, uvs = null) => {
      g = g.index ? g.toNonIndexed() : g;
      const n = g.attributes.position.count;
      const uv = new Float32Array(n * 2), uv1 = new Float32Array(n * 2);
      if (uvs) { uv.set(uvs.slice(0, n * 2)); uv1.set(uvs.slice(0, n * 2)); }
      else for (let i = 0; i < n; i++) { uv[i * 2] = UV_WHITE[0]; uv[i * 2 + 1] = UV_WHITE[1]; uv1[i * 2] = UV_BLACK[0]; uv1[i * 2 + 1] = UV_BLACK[1]; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      g.rotateY(ry); g.translate(x, y, z);
      const col = new Float32Array(n * 3), c = new THREE.Color(hex);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
      return g;
    };
    const { x, y, z } = caseSpot;
    put(new THREE.CylinderGeometry(0.42, 0.55, 0.95, 10), 0xff5c93, x, y + 0.48, z);          // gumdrop pedestal
    put(new THREE.TorusGeometry(0.44, 0.08, 6, 14).rotateX(Math.PI / 2), 0xfff4ea, x, y + 0.95, z);
    put(new THREE.BoxGeometry(0.86, 0.08, 0.66), 0xffd84d, x, y + 1.0, z, yaw);                // brass tray
    put(new THREE.BoxGeometry(0.86, 0.08, 0.66), 0xffd84d, x, y + 1.66, z, yaw);               // lid
    // the sign on a little candy post beside the case, facing the deck
    const sx = x - caseSpot.nx * 0.02 + caseSpot.tx * 0.95, sz = z - caseSpot.nz * 0.02 + caseSpot.tz * 0.95;
    put(new THREE.CylinderGeometry(0.06, 0.07, 0.95, 6), 0xff5c93, sx + caseSpot.nx * 0.04, y + 0.47, sz + caseSpot.nz * 0.04);
    {
      const front = new THREE.PlaneGeometry(1.25, 0.62).toNonIndexed();
      const fu = front.attributes.uv.array.slice();
      for (let i = 1; i < fu.length; i += 2) fu[i] = (1 - 126 / CV_H) + fu[i] * (126 / CV_H) - 1 / CV_H;   // the top 128 px
      put(front, 0xffffff, sx, y + 1.25, sz, yaw, fu);
      put(new THREE.PlaneGeometry(1.25, 0.62).rotateY(Math.PI), 0x2b2442, sx + caseSpot.nx * 0.01, y + 1.25, sz + caseSpot.nz * 0.01, yaw);   // plain back
    }
    const baseCount = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    // the flare pistol, fat and cartoonish: red body, gold barrel (LAST: see above)
    const gun = [
      [new THREE.BoxGeometry(0.44, 0.16, 0.18), 0xe8324f, 0, 1.2, 0],
      [new THREE.CylinderGeometry(0.1, 0.12, 0.34, 8).rotateZ(Math.PI / 2), 0xffc94a, 0.28, 1.22, 0],
      [new THREE.BoxGeometry(0.14, 0.24, 0.14), 0x8a1f35, -0.14, 1.07, 0],
    ];
    for (const [g, hex, gx, gy, gz] of gun) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const wx = x + gx * cs + gz * sn, wz = z - gx * sn + gz * cs;
      put(g, hex, wx, y + gy, wz, yaw);
    }
    const geo = mergeGeometries(parts, false);
    geo.computeBoundingSphere();
    const tex = caseSignTexture();
    const texE = tex.clone(); texE.channel = 1; texE.needsUpdate = true;
    const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, emissive: 0xffffff, emissiveMap: texE, emissiveIntensity: 0.1, roughness: 0.5, metalness: 0.05 });
    const base = new THREE.Mesh(geo, vmat); base.castShadow = true; base.receiveShadow = true; base.name = 'ending_case';
    base.userData.baseCount = baseCount;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.58, 0.6), new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.32, emissive: 0x9fe4ff, emissiveIntensity: 0.12, depthWrite: false }));
    glass.position.set(x, y + 1.33, z); glass.rotation.y = yaw; glass.name = 'ending_case_glass';
    caseMeshes = { base, glass };
    for (const m of Object.values(caseMeshes)) { m.userData.noOcclude = true; group.add(m); }
    caseCol = { x, z, r: 0.55, ending: true };
    ctx.colliders.push(caseCol);
    group.visible = true;
  }
  function caseSignTexture() {
    const cv = document.createElement('canvas'); cv.width = CV_W; cv.height = CV_H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 128, 128, 64);            // the white patch (map)
    g.fillStyle = '#000000'; g.fillRect(128, 128, 128, 64);          // the black patch (emissiveMap)
    g.fillStyle = '#2b2442'; g.beginPath(); g.roundRect?.(2, 2, 252, 124, 16); if (!g.roundRect) g.rect(2, 2, 252, 124); g.fill();
    g.fillStyle = '#e8324f'; g.beginPath(); g.roundRect?.(9, 9, 238, 110, 11); if (!g.roundRect) g.rect(9, 9, 238, 110); g.fill();
    g.fillStyle = '#fff6ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 25px "Baloo 2", "Trebuchet MS", sans-serif'; g.fillText('IN CASE OF ESCAPE', 128, 40);
    g.font = '900 30px "Baloo 2", "Trebuchet MS", sans-serif'; g.fillText('BREAK GLASS', 128, 74);
    g.font = 'italic 700 14px "Nunito", sans-serif'; g.fillStyle = '#ffd8e2'; g.fillText('boarding pass required · MEOW AIR', 128, 102);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  // ═══════════════════════════════════════════════ billboards (flare, eyes) ═
  const BB_V = /* glsl */`
    attribute vec3 aC; attribute vec2 aQ; attribute float aSize; attribute vec4 aCol; attribute vec3 aOff;
    varying vec2 vQ; varying vec4 vCol; varying float vStar; varying float vFogK;
    #include <fog_pars_vertex>
    void main() {
      vQ = aQ; vCol = aCol; vStar = aSize < 0.0 ? 1.0 : 0.0;       // a negative size = a four-point glint
      vFogK = aOff.z;
      vec4 mvPosition = viewMatrix * vec4(aC, 1.0);
      // aOff.y: the least angular size (rad) — far eyes stay pinpricks instead of vanishing;
      // aOff.x: a sideways shift in view space (in sizes), so a PAIR of eyes stays a level pair from anywhere
      float sz = max(abs(aSize), -mvPosition.z * aOff.y);
      mvPosition.x += aOff.x * sz;
      mvPosition.xy += aQ * sz;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const BB_F = /* glsl */`
    varying vec2 vQ; varying vec4 vCol; varying float vStar; varying float vFogK;
    #include <fog_pars_fragment>
    void main() {
      float d = dot(vQ, vQ);
      if (d > 1.0 || vCol.a <= 0.001) discard;
      float k = vStar > 0.5
        ? (exp(-abs(vQ.x) * 22.0) * exp(-abs(vQ.y) * 1.6) + exp(-abs(vQ.y) * 22.0) * exp(-abs(vQ.x) * 1.6)) * (1.0 - d)
        : exp(-d * 3.5) * 0.8 + exp(-d * 26.0);
      vec3 c = vCol.rgb * k * vCol.a;
      #ifdef USE_FOG
        c *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth) * vFogK;
      #endif
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`;
  const TRAIL_N = 14;
  // THE WATCHERS (r4, the light-horror beat of the send-off): as you climb, eyes
  // open in the dark all over Cat Island — in the treeline, the long grass,
  // the gardens — pair by pair, until the whole island is watching you go, and
  // they stay open under the credits. And on the Arrivals Pier, at the foot of
  // the rainbow, one tall figure with a lantern stands and looks up.
  const WATCH_N = 56;
  const BB_TRAIL = 2 + (TIGERS + KIDS) * 2, BB_GLINT = BB_TRAIL + TRAIL_N;
  const BB_WATCH = BB_GLINT + 1, BB_FIG = BB_WATCH + WATCH_N * 2;
  const BB_N = BB_FIG + 4;                  // flare core + halo + two eyes per figure + smoke trail + glint + watchers + the figure's eyes, lantern and its pool of light
  const bbC = new Float32Array(BB_N * 4 * 3), bbCol = new Float32Array(BB_N * 4 * 4), bbSz = new Float32Array(BB_N * 4);
  const bbOff = new Float32Array(BB_N * 4 * 3);
  const bbGeo = new THREE.BufferGeometry();
  {
    const Q = new Float32Array(BB_N * 4 * 2), idx = [];
    for (let k = 0; k < BB_N; k++) {
      const q = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let v = 0; v < 4; v++) { Q[(k * 4 + v) * 2] = q[v][0]; Q[(k * 4 + v) * 2 + 1] = q[v][1]; bbOff[(k * 4 + v) * 3 + 2] = 0.7; }
      const b = k * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    bbGeo.setAttribute('position', new THREE.BufferAttribute(bbC, 3));
    bbGeo.setAttribute('aC', new THREE.BufferAttribute(bbC, 3));
    bbGeo.setAttribute('aQ', new THREE.BufferAttribute(Q, 2));
    bbGeo.setAttribute('aSize', new THREE.BufferAttribute(bbSz, 1));
    bbGeo.setAttribute('aCol', new THREE.BufferAttribute(bbCol, 4));
    bbGeo.setAttribute('aOff', new THREE.BufferAttribute(bbOff, 3));
    bbGeo.setIndex(idx);
    bbGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, -10), 400);
  }
  const bbMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog), vertexShader: BB_V, fragmentShader: BB_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const bb = new THREE.Mesh(bbGeo, bbMat); bb.name = 'fx_ending_glows'; bb.renderOrder = 7; bb.frustumCulled = false; bb.visible = false;
  bb.raycast = () => {};
  group.add(bb);
  function setBB(k, x, y, z, size, r, g, b, a) {
    for (let v = 0; v < 4; v++) {
      const i = k * 4 + v;
      bbC[i * 3] = x; bbC[i * 3 + 1] = y; bbC[i * 3 + 2] = z; bbSz[i] = size;
      bbCol[i * 4] = r; bbCol[i * 4 + 1] = g; bbCol[i * 4 + 2] = b; bbCol[i * 4 + 3] = a;
    }
  }
  /** Per-quad extras: sideways view-space shift (sizes), least angular size (rad), fog weight. */
  function setBBx(k, ox, minAng, fogK) {
    for (let v = 0; v < 4; v++) { const i = (k * 4 + v) * 3; bbOff[i] = ox; bbOff[i + 1] = minAng; bbOff[i + 2] = fogK; }
  }
  function flushBB() { bbGeo.attributes.aC.needsUpdate = true; bbGeo.attributes.aSize.needsUpdate = true; bbGeo.attributes.aCol.needsUpdate = true; }

  // ═══════════════════════════════════════════════ the flare ═══════════════
  const flare = { x: 0, y: 0, z: 0, on: false, emitter: null };
  function flarePos(t) {
    // up from the case 2.2 s, a pop, then a slow drift down under its little chute
    const c = caseSpot;
    if (t < 2.2) { const k = 1 - Math.pow(1 - t / 2.2, 2.2); flare.x = c.x + Math.sin(t * 5) * 0.2; flare.y = c.y + 1.4 + k * 38; flare.z = c.z; }
    else { const u = t - 2.2; flare.x = c.x + Math.sin(u * 0.4) * 2.2; flare.y = c.y + 39.4 - Math.min(26, u * 0.55); flare.z = c.z + Math.cos(u * 0.33) * 1.6; }
  }
  function fire() {
    if (S.phase !== 'ready' && S.phase !== 'idle') return;
    if (!caseSpot) buildCase();
    if (!caseSpot) return;
    S.phase = 'flare'; S.t = 0; S.flareT = 0; S.broken = true;
    story()?.set('meow_air_signalled', true);
    if (caseMeshes) { caseMeshes.glass.visible = false; caseMeshes.base.geometry.setDrawRange(0, caseMeshes.base.userData.baseCount); }
    const P = ctx.systems.particles;
    P?.burst?.({ x: caseSpot.x, y: caseSpot.y + 1.35, z: caseSpot.z, count: 26, color: [0xdff6ff, 0xffffff, 0x9fe4ff], speed: 4.2, life: 0.9, size: 0.16, gravity: -12, spread: 0.6, shape: 'confetti' });
    flare.on = true; bb.visible = true;
    try { flare.emitter = P?.emitter?.({ rate: 40, follow: () => flare, color: [0xff3a3a, 0xff8a5a, 0xffd0a0], speed: 0.6, life: 1.4, size: 0.5, sizeEnd: 0.1, gravity: 0.6, spread: 0.3, shape: 'sparkle', blend: 'add', range: 0 }); } catch (e) { flare.emitter = null; }
    ui()?.toast?.('The flare hangs over the strait. Both islands can see it.');
    ui()?.setObjective?.('Wait for MEOW AIR.', 'Everyone else is on their way, too.');
    try { ctx.systems.audio?.play?.('flare'); } catch (e) {}
    crowdStart();
    summon();                     // MEOW AIR answers at once (the flare keeps burning on its own clock)
  }

  // ═══════════════════════════════════════════════ the jet ══════════════════
  let jet = null;             // our stand-in (built on demand)
  const JET = { curve: null, len: 0, dur: 13, hover: new THREE.Vector3(), depart: 0 };
  const _jp = new THREE.Vector3(), _jt = new THREE.Vector3(), _jt2 = new THREE.Vector3();
  function summon() {
    S.phase = 'jet'; S.jetT = 0; S.grab = false;
    const A = { x: caseSpot.stand.x, y: caseSpot.y, z: caseSpot.stand.z };
    S.ladder.x = A.x; S.ladder.y = A.y; S.ladder.z = A.z;
    const planes = ctx.systems.planes;
    if (typeof planes?.summonJet === 'function') {
      try {
        S.theirs = true;
        // (hold: it waits out the whole climb even if our jetHold lands before its hover;
        //  approach: a shorter run-in, if the air-routes jet offers one)
        Promise.resolve(planes.summonJet({ x: A.x, y: A.y, z: A.z }, { hold: CLIMB_T + 4, approach: 'short' }))
          .then(() => { if (S.phase === 'jet') onLadder(); }).catch(() => { if (S.phase === 'jet') standIn(); });
        return;
      } catch (e) { S.theirs = false; }
    }
    standIn();
  }
  /** How far the answering jet is from its hover point over the ladder (∞ if unknown). No allocation. */
  function jetGap() {
    const hx = S.ladder.x, hy = S.ladder.y + HOVER_H, hz = S.ladder.z;
    if (S.theirs) {
      const j = ctx.systems.planes?.aircraft?.jet;
      return j && Number.isFinite(j.x) ? Math.hypot(j.x - hx, j.y - hy, j.z - hz) : Infinity;
    }
    if (!jet) return Infinity;
    const p = jet.group.position;
    return Math.hypot(p.x - hx, p.y - hy, p.z - hz);
  }
  /** The ladder is coming: the prompt goes up while the rope unrolls toward you. */
  function offerLadder() {
    if (ladderEntry) return;
    ladderEntry = register({
      id: 'ending_ladder', x: S.ladder.x, z: S.ladder.z, r: 3.2, label: 'Grab the ladder',
      onInteract() {
        if (S.phase === 'ladder') { startClimb(); return; }
        if (S.phase !== 'jet' || S.grab) return;
        S.grab = true;
        if (ladderEntry) ladderEntry.label = 'Hold on…';
        try { ui()?.toast?.('You reach up. The ladder swings in.'); } catch (e) {}
      },
    });
  }
  function standIn() {
    S.theirs = false; S.jetT = 0; S.phase = 'jet';
    if (!jet) jet = buildJet();
    const A = S.ladder;
    JET.hover.set(A.x, A.y + HOVER_H, A.z);
    const pts = [[-380, 70, -40], [-170, 56, -86], [-40, 44, -88], [52, 34, -46], [46, 22, 22], [-14, 14, 14], [0, HOVER_H, 0]]
      .map(([x, y, z]) => new THREE.Vector3(A.x + x, A.y + y, A.z + z));
    JET.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    JET.len = JET.curve.getLength();
    jet.group.visible = true; jet.ladder.scale.y = 0.001;
    placeJet(0);
  }
  /** Stand-in flight: approach (arc-length with a braking ease), hover, depart. */
  function placeJet(t) {
    const g = jet.group;
    if (S.phase === 'jet' || t < JET.dur) {
      const u = clamp(t / JET.dur, 0, 1);
      const k = 1 - Math.pow(1 - u, 2.4);                    // brakes into the hover
      JET.curve.getPointAt(k, _jp);
      JET.curve.getTangentAt(Math.min(0.999, k), _jt);
      JET.curve.getTangentAt(Math.min(0.999, k + 0.02), _jt2);
      g.position.copy(_jp);
      const yaw = Math.atan2(_jt.x, _jt.z) - Math.PI / 2;     // the model's nose is +X
      const turn = Math.atan2(_jt2.x * _jt.z - _jt2.z * _jt.x, _jt2.x * _jt.x + _jt2.z * _jt.z);
      g.rotation.set(0, yaw, 0);
      g.rotateX(clamp(-turn * 14, -0.55, 0.55) * (1 - u * u));   // bank into the turn, level out on the hover
      g.rotateZ(clamp(_jt.y * 1.4, -0.3, 0.3) + u * 0.08);
    }
  }
  function hoverJet(t) {
    const g = jet.group;
    g.position.set(JET.hover.x, JET.hover.y + Math.sin(t * 1.7) * 0.22, JET.hover.z);
  }
  function departJet(t) {
    const g = jet.group;
    const k = t * t * 0.5 * 9 + t * 1.5;                     // accelerates
    g.position.set(JET.hover.x + k, JET.hover.y + Math.sin(t * 1.7) * 0.2 * Math.max(0, 1 - t) + k * 0.32, JET.hover.z - k * 0.08);
    g.rotation.set(0, Math.atan2(1, -0.08) - Math.PI / 2, 0);
    g.rotateZ(Math.min(0.32, t * 0.2));
    jet.ladder.scale.y = Math.max(0.001, 1 - t * 1.6);
    if (k > 700) g.visible = false;
  }
  function buildJet() {
    const parts = [];
    const put = (geo, hex, fn) => {
      let g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); fn?.(g);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(hex);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
    };
    const W = 0xfffaf2, O = 0xff8a2a, INK = 0x2b2442, PINK = 0xff9fbf;
    put(new THREE.CylinderGeometry(1.35, 1.25, 11, 14), W, (g) => g.rotateZ(Math.PI / 2));                     // fuselage along X
    put(new THREE.SphereGeometry(1.35, 14, 10), W, (g) => { g.scale(1.6, 1, 1); g.translate(5.5, 0, 0); });  // nose
    put(new THREE.ConeGeometry(1.25, 4, 14), W, (g) => { g.rotateZ(Math.PI / 2); g.translate(-7.4, 0.25, 0); });   // tail cone
    put(new THREE.CylinderGeometry(1.38, 1.28, 9.5, 14, 1, true), O, (g) => { g.scale(1, 0.34, 1.01); g.rotateZ(Math.PI / 2); g.translate(-0.4, -0.72, 0); });   // orange belly stripe
    put(new THREE.BoxGeometry(3.2, 0.28, 13.5), W, (g) => { g.translate(0.2, -0.45, 0); });                  // wings
    put(new THREE.BoxGeometry(2.0, 0.3, 1.4), O, (g) => g.translate(0.2, -0.45, 6.4));                     // wingtips
    put(new THREE.BoxGeometry(2.0, 0.3, 1.4), O, (g) => g.translate(0.2, -0.45, -6.4));
    put(new THREE.BoxGeometry(1.8, 0.22, 5.2), W, (g) => g.translate(-7.6, 0.6, 0));                        // tailplane
    for (const zz of [-3.3, 3.3]) put(new THREE.CylinderGeometry(0.6, 0.55, 2.6, 12), O, (g) => { g.rotateZ(Math.PI / 2); g.translate(0.8, -1.2, zz); });   // engines
    // the fin is a cat's TAIL: a curl
    put(new THREE.TorusGeometry(1.35, 0.36, 8, 16, Math.PI * 1.35), O, (g) => { g.rotateZ(-0.2); g.translate(-7.8, 2.5, 0); });
    // cat ears on the nose
    for (const zz of [-0.72, 0.72]) {
      put(new THREE.ConeGeometry(0.5, 1.0, 4), O, (g) => { g.rotateX(zz > 0 ? -0.25 : 0.25); g.translate(4.4, 1.55, zz); });
      put(new THREE.ConeGeometry(0.28, 0.6, 4), PINK, (g) => { g.rotateX(zz > 0 ? -0.25 : 0.25); g.translate(4.62, 1.5, zz); });
    }
    // windows: ink dots down both flanks, a cockpit band
    for (let k = 0; k < 8; k++) for (const zz of [-1.27, 1.27]) put(new THREE.BoxGeometry(0.42, 0.42, 0.1), INK, (g) => g.translate(3.2 - k * 1.05, 0.35, zz));
    put(new THREE.BoxGeometry(0.9, 0.45, 2.3), INK, (g) => g.translate(6.6, 0.45, 0));
    // the open door + a belly hatch the ladder hangs from
    put(new THREE.BoxGeometry(1.1, 0.12, 1.1), INK, (g) => g.translate(0, -1.32, 0));
    const body = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.08 }));
    body.castShadow = true;
    // MEOW AIR lettering, both flanks
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const c2 = cv.getContext('2d'); c2.clearRect(0, 0, 512, 96);
    c2.font = '900 76px "Baloo 2", "Trebuchet MS", sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.lineWidth = 10; c2.strokeStyle = '#2b2442'; c2.strokeText('MEOW AIR', 256, 52); c2.fillStyle = '#ff8a2a'; c2.fillText('MEOW AIR', 256, 52);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const dmat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const dgeo = [];
    for (const side of [-1, 1]) {
      const p = new THREE.PlaneGeometry(6.4, 1.2);
      if (side < 0) p.rotateY(Math.PI);
      p.translate(-1.2, -0.25, side * 1.36);
      dgeo.push(p);
    }
    const decal = new THREE.Mesh(mergeGeometries(dgeo, false), dmat);
    // rope ladder: hangs from the hatch (origin at the hatch, rungs down −Y, scaled to unroll)
    const lp = [];
    const rope = new THREE.Color(0xc98b4a), rung = new THREE.Color(0xfff4ea);
    const lput = (geo, c) => { const g = geo.toNonIndexed(); g.deleteAttribute('uv'); const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); lp.push(g); };
    const LL = HOVER_H - 1.45;                                 // hatch (1.3 under the jet's centre) to just above the deck
    for (const zz of [-0.36, 0.36]) lput(new THREE.BoxGeometry(0.09, LL, 0.09).translate(0, -LL / 2, zz), rope);
    for (let k = 1; k < LL / 0.55; k++) lput(new THREE.BoxGeometry(0.14, 0.12, 0.82).translate(0, -k * 0.55, 0), k % 2 ? rung : new THREE.Color(0xff5c93));
    const ladder = new THREE.Mesh(mergeGeometries(lp, false), body.material);
    ladder.position.set(0, -1.3, 0);
    const g = new THREE.Group(); g.name = 'meowair_standin';
    g.add(body, decal, ladder);
    g.traverse((o) => { o.userData.noOcclude = true; o.userData.noFade = true; o.raycast = () => {}; });
    ladder.userData.keepUpright = true;
    group.add(g);
    return { group: g, body, decal, ladder };
  }

  // ═══════════════════════════════════════════════ the ladder + the climb ══
  function onLadder() {
    if (S.phase !== 'jet') return;
    S.phase = 'ladder'; S.ladderT = 0;
    offerLadder();
    if (ladderEntry) ladderEntry.label = 'Climb aboard MEOW AIR';
    if (S.grab) { startClimb(); return; }                  // he was already reaching for it
    ui()?.toast?.('A rope ladder swings down to your feet.');
  }
  function jetTop(out) {
    const planes = ctx.systems.planes;
    const j = S.theirs ? planes?.aircraft?.jet : null;
    if (j && Number.isFinite(j.x)) { out.x = j.x; out.y = j.y - 1.3; out.z = j.z; }
    else if (jet) { out.x = jet.group.position.x; out.y = jet.group.position.y - 1.3; out.z = jet.group.position.z; }
    else { out.x = S.ladder.x; out.y = S.ladder.y + HOVER_H - 1.3; out.z = S.ladder.z; }
    return out;
  }
  const _top = { x: 0, y: 0, z: 0 };
  function startClimb() {
    if (S.phase !== 'ladder') return;
    S.phase = 'climb'; S.climbT = 0;
    ladderEntry?.remove?.(); ladderEntry = null;
    const pl = player(); if (!pl) return;
    rider.mount('ending', S.ladder.x, S.ladder.y, S.ladder.z, 0.8);
    // the air-routes jet holds ≈ 8 s once its ladder is down: make it wait for us
    // (a no-op if it has not quite settled into its hover yet: summon()'s `hold`
    //  and the 'planes:summon' hover hook below cover that)
    if (S.theirs) { try { ctx.systems.planes?.jetHold?.(CLIMB_T + 3); } catch (e) {} }
    escape.start('ending', { from: ctx.state.island || 'sea', to: 'away' });
    hudHide(true);
    startWatch(0);
    const cam = ctx.systems.camera;
    // from outside the U, level with the deck: the crowd strung along the rainbow
    // below, the visitor on the rungs, the jet above, the strait and both islands behind
    S.camBase = Math.atan2(-caseSpot.nx, -caseSpot.nz);
    S.camO = { target: S.target, azimuth: S.camBase + CLIMB_CAM.az, elevation: CLIMB_CAM.el0, distance: CLIMB_CAM.d0, fov: CLIMB_CAM.fov, pitch: 0.0, noTilt: true, in: 1.1, hold: CLIMB_T + 3.2, out: 0.6 };
    S.target.set(S.ladder.x, S.ladder.y + CLIMB_CAM.ty, S.ladder.z);
    try { S.cam = cam?.cinematic?.(S.camO) ?? null; } catch (e) { S.cam = null; }
  }
  function stepClimb(dt) {
    S.climbT += dt;
    const k = clamp(S.climbT / CLIMB_T, 0, 1);
    jetTop(_top);
    const x = lerp(S.ladder.x, _top.x, k), z = lerp(S.ladder.z, _top.z, k);
    const y = lerp(S.ladder.y, _top.y - 1.4, k * k * (3 - 2 * k) * 0.35 + k * 0.65);
    const az = S.camO ? S.camO.azimuth : 0, ox = Math.sin(az) * 0.42, oz = Math.cos(az) * 0.42;
    rider.place(x + ox, y, z + oz, Math.atan2(-ox, -oz));
    const pl = player(); if (pl) pl.scriptedWalk = 2.2;                      // the legs keep going
    S.target.set(S.ladder.x, S.ladder.y + CLIMB_CAM.ty + k * 2.5, S.ladder.z);
    if (S.camO) {
      S.camO.distance = lerp(CLIMB_CAM.d0, CLIMB_CAM.d1, k); S.camO.elevation = lerp(CLIMB_CAM.el0, CLIMB_CAM.el1, k);
      S.camO.azimuth = S.camBase + CLIMB_CAM.az + S.climbT * 0.03; S.camO.fov = CLIMB_CAM.fov;
    }
    if (S.climbT >= CLIMB_T) hatch();
  }
  /** Through the hatch: seat 1A, window. The jet goes, and the credits start over it. */
  function hatch() {
    const pl = player();
    if (pl?.group) pl.group.visible = false;                                // inside
    if (S.theirs) { try { ctx.systems.planes?.jetGo?.(); } catch (e) {} }
    escape.success('ending', { from: ctx.state.island || 'sea', to: 'away' });
    // the credits' opening lens picks up exactly where the climb's shot is
    const A = S.fA, o = S.camO;
    A.az = o ? o.azimuth : 0.3; A.el = o ? o.elevation : 0.1; A.dist = o ? o.distance : 34; A.fov = o ? (o.fov || 50) : 50;
    A.x = S.target.x; A.y = S.target.y; A.z = S.target.z;
    jetPos(S); S.follow = true;
    try { S.cam?.cancel?.(); } catch (e) {}
    startCredits(0);
  }
  /** Where the jet is (theirs, or our stand-in), into o.jx/jy/jz. */
  function jetPos(o) {
    const j = S.theirs ? ctx.systems.planes?.aircraft?.jet : (jet ? jet.group.position : null);
    if (j && Number.isFinite(j.x)) { o.jx = j.x; o.jy = j.y; o.jz = j.z; }
    else { o.jx = S.ladder.x; o.jy = S.ladder.y + HOVER_H; o.jz = S.ladder.z; }
  }

  // ═══════════════════════════════════════════════ the crowd (visual) ══════
  let crowd = null;
  const kidSelf = { value: 0.2 };        // the kids' self-light (brighter after dark)
  function crowdStart() {
    const B = bridge(); if (!B?.frameAt) return;
    const apexS = Math.max(0, B.sAt(caseSpot.x, caseSpot.z));
    const aS = apexS > 0 ? apexS : B.length / 2;
    const hook = { x: caseSpot.x, y: caseSpot.y, z: caseSpot.z, path: B.path };
    let tigersHome = false, kidsHome = false;
    try { tigersHome = !!ctx.systems.catCitizens?.gatherAt?.({ ...hook, from: 'cat' }); } catch (e) {}
    try { kidsHome = !!ctx.systems.sourPatch?.gatherAt?.({ ...hook, from: 'candy' }); } catch (e) {}
    if (!crowd) crowd = buildCrowd();
    const R = rng(hash('ending:crowd'));
    crowd.list.length = 0;
    const add = (kind, i, n) => {
      const fromCat = kind === 'tiger';
      // r4: spaced so every body reads on its own (r3's all stood within 4.6 u
      // of deck: the tigers merged into one black blob) — the tigers in a loose
      // staggered pair of rows up the Cat side, the kids a tighter huddle up
      // the Candy side, each alternating across the deck
      const ring = fromCat ? 3.4 + i * 2.7 + R() * 0.5 : 2.4 + i * 1.35 + R() * 0.35;
      const side = (i % 2 ? 1 : -1) * (fromCat ? 0.55 + R() * 0.7 : 0.35 + R() * 1.1);
      crowd.list.push({
        kind, i,
        s: fromCat ? B.length - 1.5 - R() * 10 - i * 3.2 : 1.5 + R() * 10 + i * 2.6,        // where they start
        goal: fromCat ? aS + ring : aS - ring,
        lat: clamp(side, -(B.halfWidth - 0.75), B.halfWidth - 0.75), speed: (fromCat ? 4.4 : 5.0) + R() * 0.8,
        ph: R() * 6.28, delay: R() * 2.5 + (fromCat ? 0.4 : 0), x: 0, y: 0, z: 0, yaw: 0, look: 0, home: fromCat ? tigersHome : kidsHome,
      });
    };
    for (let i = 0; i < TIGERS; i++) add('tiger', i, TIGERS);
    for (let i = 0; i < KIDS; i++) add('kid', i, KIDS);
    crowd.on = true; crowd.t = 0;
    crowd.tigers.visible = !tigersHome; crowd.kids.visible = !kidsHome;
  }
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _s4 = new THREE.Vector3(1, 1, 1), _fr = {};
  function stepCrowd(dt) {
    if (!crowd?.on) return;
    const B = bridge(); if (!B?.frameAt) return;
    crowd.t += dt;
    const night = clamp(1 - (ctx.state.daylight ?? 1), 0, 1);
    const P = player()?.position;
    let ti = 0, ki = 0;
    for (let ci = 0; ci < crowd.list.length; ci++) {
      const c = crowd.list[ci];
      const moving = crowd.t > c.delay && Math.abs(c.goal - c.s) > 0.05;
      if (moving) { const dir = Math.sign(c.goal - c.s); c.s += dir * Math.min(Math.abs(c.goal - c.s), c.speed * dt * ss(0, 1.2, Math.abs(c.goal - c.s) + 0.2)); }
      const f = B.frameAt(c.s, _fr);
      c.x = f.x + f.nx * c.lat; c.z = f.z + f.nz * c.lat;
      const h = B.heightAt(c.x, c.z); c.y = h != null ? h : f.y;
      // face along the deck while walking, then turn to the ladder and look UP
      const want = moving ? Math.atan2(f.tx * Math.sign(c.goal - c.s), f.tz * Math.sign(c.goal - c.s))
        : Math.atan2((P ? P.x : caseSpot.x) - c.x, (P ? P.z : caseSpot.z) - c.z);
      let d = want - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      c.yaw += d * (1 - Math.exp(-5 * dt));
      c.look = damp(c.look, moving ? 0 : 1, 2.2, dt);
      const bob = moving ? Math.abs(Math.sin(crowd.t * (c.kind === 'tiger' ? 7 : 11) + c.ph)) * (c.kind === 'tiger' ? 0.12 : 0.2) : Math.sin(crowd.t * 1.3 + c.ph) * 0.02;
      _e4.set(-c.look * (c.kind === 'tiger' ? 0.32 : 0.42), c.yaw, moving ? Math.sin(crowd.t * 9 + c.ph) * 0.05 : 0, 'YXZ');
      _q4.setFromEuler(_e4);
      const sc = c.kind === 'tiger' ? 1.0 + (c.i % 3) * 0.08 : 0.9 + (c.i % 4) * 0.07;
      _s4.set(sc, sc, sc);
      _m4.compose(_v4.set(c.x, c.y + bob, c.z), _q4, _s4);
      if (c.kind === 'tiger') crowd.tigers.setMatrixAt(ti++, _m4); else crowd.kids.setMatrixAt(ki++, _m4);
      // eyes: two glints on the face (through the instance matrix, so they tilt up
      // with the stare); brighter after dark, brightest once they stop and look
      const tig = c.kind === 'tiger';
      const a = (c.home ? 0 : 1) * (0.55 + 0.9 * night) * (0.6 + 0.4 * c.look) * (crowd.t > c.delay ? 1 : 0);
      const blink = (Math.sin(crowd.t * 0.9 + c.ph * 5) > 0.97) ? 0 : 1;
      const k = 2 + ci * 2, sz = tig ? 0.2 : 0.14;
      for (let e = 0; e < 2; e++) {
        _v5.set((e ? 1 : -1) * (tig ? 0.2 : 0.15), tig ? 1.5 : 1.28, tig ? 1.62 : 0.4).applyMatrix4(_m4);
        if (tig) setBB(k + e, _v5.x, _v5.y, _v5.z, sz, 1.0, 0.86, 0.25, a * blink);
        else setBB(k + e, _v5.x, _v5.y, _v5.z, sz, 0.72, 1.0, 0.3, a * blink * 0.8);
      }
    }
    crowd.tigers.instanceMatrix.needsUpdate = true; crowd.kids.instanceMatrix.needsUpdate = true;
    kidSelf.value = 0.18 + 0.5 * night;
    bb.visible = true;
  }
  function crowdStop() {
    if (!crowd) return;
    crowd.on = false; crowd.tigers.visible = false; crowd.kids.visible = false;
    for (let k = 2; k < BB_TRAIL; k++) setBB(k, 0, -999, 0, 0, 0, 0, 0, 0);
  }
  function buildCrowd() {
    const parts = [];
    const put = (geo, hex, fn) => {
      let g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); fn?.(g);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(hex);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    };
    // ── TIGER (≈ 2.3 u long, faces +Z): striped torso, big head, ears, tail ──
    const OR = 0xf08a2c, DK = 0x2a1a14, CR = 0xfff0d8;
    const torso = put(new THREE.SphereGeometry(0.62, 12, 8), OR, (g) => { g.scale(0.95, 0.85, 1.75); g.translate(0, 1.0, 0); });
    stripe(torso, (x, y, z) => Math.sin(z * 7.5 + Math.abs(x) * 2.2) > 0.55, DK);
    parts.push(torso);
    const head = put(new THREE.SphereGeometry(0.52, 12, 9), OR, (g) => { g.scale(1.05, 0.95, 0.98); g.translate(0, 1.35, 1.2); });
    stripe(head, (x, y, z) => y > 1.55 && Math.sin(x * 14) > 0.4, DK);
    parts.push(head);
    parts.push(put(new THREE.SphereGeometry(0.28, 10, 7), CR, (g) => { g.scale(1.1, 0.75, 0.8); g.translate(0, 1.2, 1.62); }));   // muzzle
    parts.push(put(new THREE.SphereGeometry(0.08, 6, 5), DK, (g) => g.translate(0, 1.3, 1.86)));                              // nose
    for (const sx of [-1, 1]) {
      parts.push(put(new THREE.ConeGeometry(0.2, 0.34, 4), OR, (g) => { g.rotateZ(sx * -0.3); g.translate(sx * 0.32, 1.83, 1.12); }));
      parts.push(put(new THREE.CylinderGeometry(0.15, 0.13, 0.95, 7), OR, (g) => g.translate(sx * 0.34, 0.45, 0.68)));     // legs
      parts.push(put(new THREE.CylinderGeometry(0.15, 0.13, 0.95, 7), OR, (g) => g.translate(sx * 0.34, 0.45, -0.72)));
      parts.push(put(new THREE.SphereGeometry(0.17, 7, 5), CR, (g) => { g.scale(1, 0.6, 1.3); g.translate(sx * 0.34, 0.06, 0.76); }));
      parts.push(put(new THREE.SphereGeometry(0.17, 7, 5), CR, (g) => { g.scale(1, 0.6, 1.3); g.translate(sx * 0.34, 0.06, -0.66); }));
    }
    const tail = put(new THREE.TorusGeometry(0.55, 0.1, 6, 10, Math.PI * 1.1), OR, (g) => { g.rotateY(Math.PI / 2); g.translate(0, 1.35, -1.25); });
    stripe(tail, (x, y, z) => Math.sin(y * 12 + z * 9) > 0.3, DK);
    parts.push(tail);
    const tigerGeo = mergeGeometries(parts, false);
    // ── SOURLING (≈ 1.5 u), in the game's own silhouette (sourpatch/body.js):
    // a flat-topped square head with two corner nubs, big white eyes, a lime grin,
    // a blocky body, stubby arms up — so a row of them reads as KIDS, not capsules.
    // Body parts are white (the instance colour tints them); the face is `keep`
    // (aKeep = 1: the instance colour never touches it) ──
    const kp = [];
    const W = 0xffffff;
    const kput = (geo, hex, keep, fn) => { const g = put(geo, hex, fn); g.setAttribute('aKeep', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(keep ? 1 : 0), 1)); kp.push(g); return g; };
    kput(new THREE.SphereGeometry(1, 10, 8), W, false, (g) => { g.scale(0.3, 0.33, 0.23); g.translate(0, 0.62, 0); });          // body
    kput(new THREE.SphereGeometry(1, 12, 9), W, false, (g) => {                                                            // head: squared, flat on top, wider at the crown
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const sq = 1 / Math.max(0.72, Math.hypot(x, z));                 // push the round toward a rounded square
        x *= lerp(1, sq, 0.45); z *= lerp(1, sq, 0.3);
        if (y > 0.5) y = 0.5 + (y - 0.5) * 0.25;
        x *= 1 + 0.18 * Math.max(0, y);
        p.setXYZ(i, x * 0.39, y * 0.36, z * 0.34);
      }
      g.computeVertexNormals();
      g.translate(0, 1.25, 0);
    });
    for (const sx of [-1, 1]) {
      kput(new THREE.OctahedronGeometry(1, 0), W, false, (g) => { g.scale(0.09, 0.13, 0.08); g.rotateZ(sx * -0.34); g.translate(sx * 0.4, 1.4, -0.02); });   // corner nubs
      kput(new THREE.SphereGeometry(0.125, 9, 7), 0xffffff, true, (g) => g.translate(sx * 0.15, 1.27, 0.26));                  // eyes
      kput(new THREE.SphereGeometry(0.066, 6, 5), 0x1a0a16, true, (g) => g.translate(sx * 0.15, 1.28, 0.365));                 // pupils (looking up at you)
      kput(new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), W, false, (g) => { g.rotateZ(sx * 2.55); g.translate(sx * 0.36, 0.98, 0.04); });   // arms up: reaching
      kput(new THREE.CapsuleGeometry(0.11, 0.2, 3, 6), W, false, (g) => g.translate(sx * 0.13, 0.2, 0));                        // legs
    }
    kput(new THREE.TorusGeometry(0.15, 0.035, 4, 12, Math.PI), 0xa8ff2c, true, (g) => { g.rotateZ(Math.PI); g.scale(1, 0.45, 0.6); g.translate(0, 1.1, 0.3); });   // the grin
    const kidGeo = mergeGeometries(kp, false);
    // sugar crystals: brighter flecks on the body (kept near white so the instance colour tints them)
    {
      const col = kidGeo.attributes.color, keep = kidGeo.attributes.aKeep, R = rng(hash('ending:sugar'));
      for (let i = 0; i < col.count; i += 3) {
        if (keep.getX(i) > 0.5) continue;
        const v = R() < 0.18 ? 1.25 : 0.92 + R() * 0.08;
        for (let q = 0; q < 3 && i + q < col.count; q++) col.setXYZ(i + q, v, v, v);
      }
    }
    // a little self-light so they read against a dusk sky (still mostly silhouette: that is the point)
    const tigers = new THREE.InstancedMesh(tigerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, emissive: 0x4a2408, emissiveIntensity: 0.5 }), TIGERS);
    // the kids glow in their OWN colour (gummy, lit from inside) — the face stays white/ink/lime
    const kidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 });
    kidMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSelf = kidSelf;
      // (the chunks are still #includes here: swap in color_vertex with the instance tint gated by aKeep)
      const cv = THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), aKeep);');
      sh.vertexShader = 'attribute float aKeep;\n' + sh.vertexShader.replace('#include <color_vertex>', cv);
      sh.fragmentShader = 'uniform float uSelf;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uSelf;');
    };
    kidMat.customProgramCacheKey = () => 'ending-kid';
    const kids = new THREE.InstancedMesh(kidGeo, kidMat, KIDS);
    const kc = [0xff3355, 0x5be27a, 0xff8c1a, 0x3aa8ff, 0xffe23a, 0xb35bff, 0xff3355, 0x5be27a];
    for (let i = 0; i < KIDS; i++) kids.setColorAt(i, new THREE.Color(kc[i % kc.length]));
    tigers.castShadow = true; kids.castShadow = true;
    tigers.frustumCulled = false; kids.frustumCulled = false;
    tigers.name = 'ending_tigers'; kids.name = 'ending_kids';
    tigers.visible = false; kids.visible = false;
    for (const m of [tigers, kids]) { m.userData.noOcclude = true; m.userData.noFade = true; m.raycast = () => {}; group.add(m); }
    return { tigers, kids, list: [], on: false, t: 0 };
  }
  function stripe(g, test, hex) {
    const pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color(hex);
    for (let f = 0; f < pos.count; f += 3) {
      let x = 0, y = 0, z = 0;
      for (let q = 0; q < 3; q++) { x += pos.getX(f + q) / 3; y += pos.getY(f + q) / 3; z += pos.getZ(f + q) / 3; }
      if (test(x, y, z)) for (let q = 0; q < 3; q++) col.setXYZ(f + q, c.r, c.g, c.b);
    }
  }

  // ═══════════════════════════════════════════════ the watchers ════════════
  // (see WATCH_N) Pairs of eyes on Cat Island's free ground — the treeline, the
  // long grass, the gardens (world.isFreeGround keeps them out of the streets
  // and the buildings) — a few up in the trees. Each pair is ONE centre and two
  // billboards shifted apart in view space, so it stays a level pair from any
  // lens, and never shrinks below a pinprick however far the credits pull back.
  // The figure: one merged silhouette mesh (+1 draw call while the ending runs),
  // its eyes and lantern are billboards in the glow mesh.
  const watch = { list: null, fig: null, fx: 0, fy: 0, fz: 0, yaw: 0, on: false, t: 0 };
  const FIG_S = 1.3;                      // the figure is TALL (≈ 3.7 u): a little wrong, as it should be
  function buildWatchers() {
    if (watch.list) return;
    const R = rng(hash('ending:watchers'));
    const B = bridge();
    const foot = B?.ends?.cat || { x: 31, z: 21 };
    const list = [];
    for (let tries = 0; list.length < WATCH_N && tries < 8000; tries++) {
      // half of them along the coast that faces the strait (what every ending lens sees), half island-wide
      const coast = (tries & 1) === 0;
      const x = coast ? 40 + R() * 45 : 42 + R() * 118, z = coast ? -64 + R() * 104 : -78 + R() * 160;
      if (world.islandAt(x, z) !== 'cat') continue;
      if (!world.isFreeGround(x, z, { pathMargin: 1.8, minHeight: 0.9 })) continue;
      const d = Math.hypot(x - foot.x, z - foot.z);
      if (d < 16 || d > 130) continue;
      let apart = true;
      for (let j = 0; j < list.length; j++) { const w = list[j]; if ((w.x - x) * (w.x - x) + (w.z - z) * (w.z - z) < 49) { apart = false; break; } }
      if (!apart) continue;
      const high = R() < 0.2, warm = R() < 0.45;
      list.push({
        x, z, y: world.height(x, z) + (high ? 2.4 + R() * 2.4 : 0.5 + R() * 0.8),
        ph: R(), open: 0.4 + R() * 5.6, sz: high ? 0.19 : 0.13 + R() * 0.05,
        r: warm ? 1.0 : 0.82, g: warm ? 0.74 : 1.0, b: warm ? 0.2 : 0.34,
      });
    }
    watch.list = list;
    for (let i = 0; i < WATCH_N; i++) {
      setBBx(BB_WATCH + i * 2, -1.05, 0.004, 0.2); setBBx(BB_WATCH + i * 2 + 1, 1.05, 0.004, 0.2);
      setBB(BB_WATCH + i * 2, 0, -999, 0, 0, 0, 0, 0, 0); setBB(BB_WATCH + i * 2 + 1, 0, -999, 0, 0, 0, 0, 0, 0);
    }
    // the figure: on the Arrivals Pier's planks, a few steps landward of the rainbow's
    // foot (the pier runs from the foot toward the island; the deck lands on its head)
    if (B?.frameAt && B.length) {
      const y0 = B.frameAt(B.length, {}).y;
      const cen = world.ISLANDS?.cat?.center || { x: 150, z: 0 };
      const toLand = Math.atan2(cen.z - foot.z, cen.x - foot.x);
      watch.fx = foot.x + Math.cos(toLand) * 6; watch.fz = foot.z + Math.sin(toLand) * 6; watch.fy = y0;
      // (south of the landing: the deck comes in from the north, so the planks there are clear)
      found: for (const r of [5, 6, 4.5, 7, 8]) for (const da of [0.7, 0.5, 0.9, 0.3, 0]) {
        const x = foot.x + Math.cos(toLand + da) * r, z = foot.z + Math.sin(toLand + da) * r;
        if (B.heightAt?.(x, z) != null) continue;                 // never on the deck itself
        const y = plankY(x, z, y0);
        if (y != null) { watch.fx = x; watch.fz = z; watch.fy = y; break found; }
      }
      const ax = B.apex?.x ?? 0, az = B.apex?.z ?? -48;
      watch.yaw = Math.atan2(ax - watch.fx, az - watch.fz);
      watch.fig = buildFigure();
      watch.fig.position.set(watch.fx, watch.fy, watch.fz); watch.fig.rotation.y = watch.yaw;
      watch.fig.scale.setScalar(FIG_S);
      setBBx(BB_FIG, -1.0, 0.003, 0.15); setBBx(BB_FIG + 1, 1.0, 0.003, 0.15); setBBx(BB_FIG + 2, 0, 0.007, 0.3); setBBx(BB_FIG + 3, 0, 0.02, 0.35);
    }
    bbGeo.attributes.aOff.needsUpdate = true;
  }
  /** The highest walkable (not the rainbow) at (x, z) within 0.8 of y0, or null. */
  function plankY(x, z, y0) {
    let best = null;
    for (const w of ctx.walkables || []) {
      if (!w || w.id === 'rainbowBridge' || typeof w.test !== 'function') continue;
      try { const y = w.test(x, z); if (typeof y === 'number' && Number.isFinite(y) && Math.abs(y - y0) < 0.8 && (best == null || y > best)) best = y; } catch (e) {}
    }
    return best;
  }
  function buildFigure() {
    const parts = [];
    const put = (geo, fn) => { let g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); fn?.(g); parts.push(g); };
    put(new THREE.CylinderGeometry(0.26, 0.66, 1.95, 10), (g) => g.translate(0, 0.97, 0));                     // a long coat
    put(new THREE.SphereGeometry(0.42, 10, 8), (g) => { g.scale(1.05, 0.7, 0.8); g.translate(0, 1.92, 0); });     // shoulders
    put(new THREE.SphereGeometry(0.34, 12, 9), (g) => g.translate(0, 2.4, 0.04));                                  // head
    for (const sx of [-1, 1]) put(new THREE.ConeGeometry(0.13, 0.42, 5), (g) => { g.rotateZ(-sx * 0.22); g.translate(sx * 0.18, 2.78, 0.02); });   // tall ears
    put(new THREE.TorusGeometry(0.42, 0.075, 6, 14, Math.PI * 1.3), (g) => { g.rotateY(Math.PI / 2); g.rotateX(-0.5); g.translate(0, 0.62, -0.62); });   // the tail, curled
    put(new THREE.CylinderGeometry(0.085, 0.07, 0.95, 6), (g) => { g.rotateZ(-1.0); g.translate(0.5, 1.6, 0.16); });   // the arm out to the lantern
    put(new THREE.BoxGeometry(0.04, 0.42, 0.04), (g) => g.translate(0.9, 1.1, 0.16));
    put(new THREE.BoxGeometry(0.22, 0.3, 0.22), (g) => g.translate(0.9, 0.82, 0.16));                           // the lantern (its light: a billboard)
    const geo = mergeGeometries(parts, false); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x120a16, roughness: 0.95, metalness: 0, emissive: 0x05020a }));
    m.name = 'ending_watcher'; m.visible = false; m.castShadow = false;
    m.userData.noOcclude = true; m.userData.noFade = true; m.raycast = () => {};
    group.add(m);
    return m;
  }
  function startWatch(t = 0) {
    buildWatchers();
    watch.on = true; watch.t = Math.max(watch.t, t);
    if (watch.fig) watch.fig.visible = true;
    bb.visible = true; group.visible = true;      // (the group shows with the case; a credits-only run has no case)
  }
  function stopWatch() {
    watch.on = false;
    if (watch.fig) watch.fig.visible = false;
    for (let k = BB_WATCH; k < BB_N; k++) setBB(k, 0, -999, 0, 0, 0, 0, 0, 0);
  }
  function stepWatch(dt) {
    if (!watch.on || !watch.list) return;
    watch.t += dt;
    const t = watch.t;
    const night = clamp(1 - (ctx.state.daylight ?? 1), 0, 1), vis = 0.4 + 0.6 * night;
    for (let i = 0; i < watch.list.length; i++) {
      const w = watch.list[i];
      const bl = t * 0.23 + w.ph * 3.7;
      const blink = (bl - Math.floor(bl)) < 0.05 ? 0 : 1;
      const come = 0.6 + 0.4 * smoothstep(-0.4, 0.4, Math.sin(t * 0.19 + w.ph * 6.28));
      const a = ss(w.open, w.open + 0.9, t) * blink * come * vis * 2.1;
      setBB(BB_WATCH + i * 2, w.x, w.y, w.z, w.sz, w.r, w.g, w.b, a);
      setBB(BB_WATCH + i * 2 + 1, w.x, w.y, w.z, w.sz, w.r, w.g, w.b, a);
    }
    if (watch.fig) {
      const c = Math.cos(watch.yaw), sn = Math.sin(watch.yaw);
      const eo = ss(0.6, 1.8, t) * vis * 1.3;
      const bl = t * 0.17;
      const blink = (bl - Math.floor(bl)) < 0.04 ? 0 : 1;
      const ex2 = watch.fx + sn * 0.3 * FIG_S, ez2 = watch.fz + c * 0.3 * FIG_S;
      setBB(BB_FIG, ex2, watch.fy + 2.44 * FIG_S, ez2, 0.09, 0.8, 1.0, 0.62, eo * blink);
      setBB(BB_FIG + 1, ex2, watch.fy + 2.44 * FIG_S, ez2, 0.09, 0.8, 1.0, 0.62, eo * blink);
      // the lantern (the arm's reach: 0.9 to the figure's right, 0.16 forward)
      const lx = watch.fx + (c * 0.9 + sn * 0.16) * FIG_S, lz = watch.fz + (-sn * 0.9 + c * 0.16) * FIG_S;
      const fl = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.1);
      setBB(BB_FIG + 2, lx, watch.fy + 0.84 * FIG_S, lz, 0.75, 1.0, 0.7, 0.34, fl * (0.55 + 0.75 * night));
      // …and its warm pool, just BEHIND him from wherever the lens is: he stands
      // out of it as a silhouette (the glow is drawn after him, depth-tested)
      const cp = ctx.camera.position;
      let bx = watch.fx - cp.x, bz = watch.fz - cp.z; const bl2 = Math.hypot(bx, bz) || 1; bx /= bl2; bz /= bl2;
      setBB(BB_FIG + 3, watch.fx + bx * 1.1, watch.fy + 1.3 * FIG_S, watch.fz + bz * 1.1, 3.1, 1.0, 0.52, 0.22, fl * 0.62 * (0.3 + 0.7 * night) * ss(0.2, 1.4, t));
    }
  }

  // ═══════════════════════════════════════════════ HUD + credits (DOM) ═════
  let styleOn = false;
  function ensureStyle() {
    if (styleOn || document.getElementById('cci-endc-style')) { styleOn = true; return; }
    const st = document.createElement('style'); st.id = 'cci-endc-style'; st.textContent = CREDITS_CSS; document.head.appendChild(st); styleOn = true;
  }
  function hudHide(v) {
    ensureStyle();
    ctx.uiRoot?.classList.toggle('cci-endc-on', !!v);
    if (v) { try { ui()?.prompt?.(null); } catch (e) {} }
  }
  let cr = null;              // credits DOM
  const MOTE_N = 26;
  function buildCredits() {
    if (cr || !ctx.uiRoot) return cr;
    ensureStyle();
    const el = document.createElement('div');
    el.className = 'cci cci-endc';
    const L = (txt, cls, fill) => [...txt].map((ch, i) => (ch === ' ' ? '<i class="sp"></i>' : `<span class="l ${cls}"${fill ? ` style="--c:${fill(i)}"` : ''}><b class="o">${ch}</b><b class="f">${ch}</b></span>`)).join('');
    const STRIPES = ['#f2447f', '#ff7a4d', '#a765ee', '#20b3a6', '#f2447f', '#ff7a4d', '#a765ee', '#20b3a6'];
    const block = (head, rows) => `<div class="blk"><div class="rib">${head}</div>${rows.map(([a, b]) => `<div class="row"><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
    el.innerHTML = `
      <div class="cci-endc-veil"></div>
      <div class="cci-endc-motes">${Array.from({ length: MOTE_N }, () => '<i></i>').join('')}</div>
      <div class="cci-endc-hero" role="heading" aria-level="1" aria-label="ESCAPED. For real.">
        <span class="cci-endc-sr">ESCAPED. For real.</span>
        <div class="esc" aria-hidden="true">${L('ESCAPED.', 'cd', (i) => STRIPES[i % STRIPES.length])}</div>
        <div class="real" aria-hidden="true">${L('For real.', 'ct')}</div>
      </div>
      <div class="cci-endc-rollwrap"><div class="cci-endc-roll">
        <div class="big">Original Game Concept by <b>Daniel Lavitt</b></div>
        <div class="big">Produced by <b>ChiLab + Claude</b></div>
        ${block('THE ISLANDS', [
          ['The Candy Kingdom', 'gummy forests, the Great Cupcake, Gumdrop Village, the Candy Palace'],
          ['Cat Island', 'Meow Donald’s, Purrliament Square, Whisker Heights, the Watchtower'],
          ['Terrain, Sea & Sky', 'frosting hills, the syrup river, a strait with a whale in it'],
        ])}
        ${block('THE LOCALS', [
          ['The Sourlings', 'sparkling by day, peckish by night'],
          ['The Citizens of Cat Island', 'and their night shift'],
          ['Cat Island Containment', 'the cats who would not let you leave'],
          ['Rusty', 'under the quay, for a price'],
          ['The Gummy Regent', 'on the carpet, mostly'],
        ])}
        ${block('THE WAYS HOME', [
          ['The Sugarfin Express', 'a whale, a deck and a walrus in a hat'],
          ['The Undersea Cave · The Big Fling', 'the hole that is not a hole, and the catapult'],
          ['Smuggler’s Cove · Wing Nut Field', 'the canoe and the flying machine'],
          ['The CatBlimp · The Banner Biplane', 'SUGAR one side, CATNIP the other'],
          ['The Rainbow Bridge', 'for better or worse'],
          ['MEOW AIR', 'seat 1A, window'],
        ])}
        ${block('THE KIT', [
          ['Salt, Spray & the Caramelizer', 'and every other sweet thing that fires'],
          ['Invincibility Stars', 'catch them if you can'],
          ['Camera, Map & Touch', 'so you could always see where you were going'],
        ])}
        <div class="quip">No cats were harmed. Several were mildly inconvenienced.</div>
        <div class="quip">The Sourlings would like it noted that they were only ever hungry.</div>
        <div class="bye">Thanks for playing.</div>
        <div class="mini"><span>ESCAPE FROM</span> THE CANDY KINGDOM <i>AND</i> CAT ISLAND</div>
      </div></div>
      <div class="cci-endc-press">press any key</div>`;
    ctx.uiRoot.appendChild(el);
    const R = rng(hash('ending:motes'));
    const motes = [...el.querySelectorAll('.cci-endc-motes i')].map((m, i) => {
      const cols = ['#ff7eaa', '#ffd166', '#8fe6c8', '#c49bff', '#fff4e6', '#7cc8ff', '#ff9a6b'];
      const w = 5 + R() * 8, h = w * (1.8 + R() * 1.4);
      m.style.width = w.toFixed(1) + 'px'; m.style.height = h.toFixed(1) + 'px'; m.style.background = cols[i % cols.length];
      return { m, x: R(), y: R(), sp: 0.03 + R() * 0.05, rot: R() * 360, spin: (R() - 0.5) * 90, sway: R() * 6.28 };
    });
    cr = {
      el, veil: el.querySelector('.cci-endc-veil'), hero: el.querySelector('.cci-endc-hero'),
      esc: [...el.querySelectorAll('.esc .l')], real: el.querySelector('.real'), roll: el.querySelector('.cci-endc-roll'),
      press: el.querySelector('.cci-endc-press'), motes, rollH: 0, last: {},
    };
    return cr;
  }
  const setStyle = (node, key, prop, val) => { if (!node) return; if (cr.last[key] !== val) { cr.last[key] = val; node.style[prop] = val; } };
  function drawCredits(t) {
    if (!buildCredits()) return;
    const vh = window.innerHeight || 800;
    if (!cr.rollH) cr.rollH = cr.roll.offsetHeight || 1400;
    setStyle(cr.el, 'disp', 'display', 'block');
    // (the veil comes in slowly: the jet's climb-out reads under the opening letters)
    setStyle(cr.veil, 'veil', 'opacity', ss(0.6, 3.6, t).toFixed(3));
    // ESCAPED. (letters pop in) · For real. · then the pair rises to the top
    cr.esc.forEach((l, i) => {
      const k = backOut((t - 0.7 - i * 0.09) / 0.5);
      setStyle(l, 'e' + i, 'transform', `translateY(${((1 - Math.min(1, k)) * 0.5).toFixed(3)}em) scale(${Math.max(0, k).toFixed(3)})`);
    });
    const kr = ss(1.9, 2.8, t);
    setStyle(cr.real, 'real', 'opacity', kr.toFixed(3));
    setStyle(cr.real, 'realT', 'transform', `translateY(${((1 - kr) * 18).toFixed(1)}px)`);
    const up = ss(7.0, 8.4, t);
    setStyle(cr.hero, 'hero', 'transform', `translate(-50%, calc(-50% - ${(up * 31).toFixed(2)}vh)) scale(${(1 - up * 0.54).toFixed(3)})`);
    // the roll: from under the frame to past the top, 8 → 37 s; the last lines settle mid-frame
    const k = clamp((t - 8.2) / (CREDITS_T - 11), 0, 1);
    const y0 = vh * 1.02, y1 = vh * 0.5 - cr.rollH + 150;
    setStyle(cr.roll, 'roll', 'transform', `translate(-50%, ${lerp(y0, y1, k).toFixed(1)}px)`);
    const pk = ss(CREDITS_T - 5, CREDITS_T - 4, t);
    setStyle(cr.press, 'press', 'opacity', (pk * (0.75 + 0.25 * Math.sin(t * 3.2))).toFixed(3));
    // sprinkles drift down behind the type
    const vw = window.innerWidth || 1200;
    for (const m of cr.motes) {
      const yy = ((m.y + t * m.sp) % 1.1) - 0.05, xx = m.x + Math.sin(t * 0.6 + m.sway) * 0.012;
      m.m.style.transform = `translate(${(xx * vw).toFixed(1)}px, ${(yy * vh).toFixed(1)}px) rotate(${(m.rot + t * m.spin).toFixed(1)}deg)`;
      m.m.style.opacity = (ss(1.5, 3.5, t) * 0.9).toFixed(2);
    }
  }
  // ── the far LOD (r6). Past ≈ 200 u the pull-back has both islands in frame,
  // and the whole world at once is ≈ 1.38M triangles: over the 1.3M budget.
  // The ground cover that vegetation.js / nature.js already treat as near
  // field on the mobile tier (their MOBILE_NEAR sets: tufts, flowers, catnip,
  // scree, reeds…) is a few pixels across by then, under the veil and the
  // roll, so it goes, SMALLEST FIRST, as the lens backs off (≈ −160k tris,
  // −23 calls with everything in view) and comes back if the lens comes in.
  // The candy speckle stays (gumdrops, cotton candy, canes): from up here that
  // is what the Candy Kingdom looks like. Visibility we OWN: only what we hid
  // is ever re-shown, and all of it comes back when the credits end.
  const FAR_LOD = [
    'candyveg_grass', 'candyveg_mat', 'candyveg_mint', 'candyveg_reed', 'candyveg_lily', 'candyveg_crystal', 'candyveg_bean',
    'cat_nature_grass', 'cat_nature_wildflower', 'cat_nature_catnipLow', 'cat_nature_catnip', 'cat_nature_catnipTall',
    'cat_nature_lavender', 'cat_nature_marram', 'cat_nature_scree', 'cat_nature_shell', 'cat_nature_litter', 'cat_nature_sunflower',
    'cat_nature_marigold', 'cat_nature_driftwood', 'cat_nature_fishbone', 'cat_nature_yarn', 'cat_nature_agave',
  ];
  const LOD_D0 = 205, LOD_D1 = 305, LOD_BACK = 12;   // hide distance by instance size (0.3 u → 205 … 1.6 u → 305), hysteresis
  let lod = null, lodDist = 0;
  function lodScan() {
    if (lod) return lod;
    lod = [];
    const M = new THREE.Matrix4(), meanR = (o) => {
      const geo = o.geometry; if (!geo.boundingSphere) geo.computeBoundingSphere();
      const n = o.instanceMatrix?.count ?? o.count, step = Math.max(1, Math.floor(n / 32));
      let sum = 0, k = 0;
      for (let i = 0; i < n; i += step) {
        o.getMatrixAt(i, M); const e = M.elements;
        const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
        if (s > 1e-4) { sum += s; k++; }                   // (blanked instances are zero-scale)
      }
      return k ? geo.boundingSphere.radius * sum / k : 0;
    };
    const add = (o) => { const r = meanR(o); if (r > 0) lod.push({ mesh: o, d: LOD_D0 + (LOD_D1 - LOD_D0) * clamp((r - 0.3) / 1.3, 0, 1), hid: false }); };
    const names = new Set(FAR_LOD);
    ctx.scene.traverse((o) => { if (o.isInstancedMesh && names.has(o.name)) add(o); });
    if (lod.length < 6) {
      // (renamed species: fall back to what they have in common — small,
      // numerous, shadowless, opaque instanced planting under the two
      // scenery groups; never anything that glows or moves)
      lod.length = 0;
      ctx.scene.traverse((o) => {
        if (!o.isInstancedMesh || o.castShadow || (o.instanceMatrix?.count ?? 0) < 60 || /eye|glow|shadow|bird|gull|pigeon|koi|fish|butterfl/i.test(o.name)) return;
        let top = o; for (let q = o; q.parent && q.parent !== ctx.scene; q = q.parent) top = q.parent;
        if (!/veg|nature/i.test(top.name)) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || m.blending !== THREE.NormalBlending) return;
        if (meanR(o) <= 1.25) add(o);
      });
    }
    return lod;
  }
  function lodApply(dist) {
    lodDist = dist;
    if (!lod) return;
    for (let i = 0; i < lod.length; i++) {
      const e = lod[i];
      if (!e.hid) { if (dist > e.d && e.mesh.visible) { e.mesh.visible = false; e.hid = true; } }
      else if (dist < e.d - LOD_BACK) { e.mesh.visible = true; e.hid = false; }
    }
  }
  function lodRestore() {
    if (!lod) return;
    for (const e of lod) if (e.hid) { e.mesh.visible = true; e.hid = false; }
  }
  const FREE = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 0, fov: 40 };   // reused every frame
  function creditsCamera(t) {
    const cam = ctx.systems.camera; if (!cam?.setFree) return;
    // the pull-back: both islands shrinking below
    const k = ss(0, CREDITS_T * 0.9, t);
    let dist = lerp(95, 560, k * k * (3 - 2 * k) * 0.4 + k * 0.6);
    let az = lerp(0.3, 0.95, k), el = lerp(0.62, 1.16, k), fov = 40, tx = 4, ty = 6, tz = -4;
    if (S.follow) {
      const w = ss(FOLLOW_T, FOLLOW_T + BLEND_T, t);
      if (w < 1) {
        // …but first the jet climbing out: from exactly where the climb's shot
        // left off onto the jet, aimed 7 u over it so it rides under the
        // "ESCAPED." letters, the lens backing off as it goes
        const A = S.fA, kf = ss(0, 2.2, t);
        const ax = lerp(A.x, S.jx, kf), ay = lerp(A.y, S.jy + 7, kf), azz = lerp(A.z, S.jz, kf);
        const aAz = A.az + t * 0.05, aEl = lerp(A.el, 0.2, ss(0, 3, t));
        const aDist = lerp(A.dist, 62, ss(0, 3.4, t)), aFov = lerp(A.fov, 46, ss(0, 3, t));
        let d = az - aAz; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        tx = lerp(ax, tx, w); ty = lerp(ay, ty, w); tz = lerp(azz, tz, w);
        az = aAz + d * w; el = lerp(aEl, el, w); fov = lerp(aFov, fov, w);
        dist = Math.exp(lerp(Math.log(aDist), Math.log(dist), w));
      }
    }
    // (r4: a thinner haze than a scenic view gets — at night the fog is navy,
    //  and it was eating Cat Island's far half; see also the exposure lift in update)
    ctx.state.fogScale = Math.max(3, dist / 34);
    lodApply(dist);
    FREE.target[0] = tx; FREE.target[1] = ty; FREE.target[2] = tz;
    FREE.azimuth = az; FREE.elevation = el; FREE.distance = dist; FREE.fov = fov;
    try { cam.setFree(FREE); } catch (e) {}
  }
  function startCredits(t0 = 0) {
    S.phase = 'credits'; S.credT = t0;
    hudHide(true);
    buildCredits();
    lodRestore(); lodScan();
    story()?.set('escaped_for_real', true);
    S.savedFog = ctx.state.fogScale || 1;
    startWatch(CLIMB_T + t0);
    const pl = player(); if (pl) { pl.locked = true; if (pl.group) pl.group.visible = false; }
    if (bridge()?.debugWalk) bridge().debugWalk(null);
    creditsCamera(t0); drawCredits(t0);
    armSkip();
  }
  let skipFn = null;
  function armSkip() {
    if (skipFn || ctx.shot) return;
    skipFn = () => { if (S.phase === 'credits' && S.credT > 1.5) finish(); };
    window.addEventListener('pointerdown', skipFn, true);
    window.addEventListener('keydown', skipFn, true);
  }
  function finish() {
    if (S.phase === 'done') return;
    S.phase = 'done';
    story()?.set('escaped_for_real', true);
    if (skipFn) { window.removeEventListener('pointerdown', skipFn, true); window.removeEventListener('keydown', skipFn, true); skipFn = null; }
    if (!ctx.shot && !params.has('noreload')) { try { location.reload(); } catch (e) {} return; }
    lodRestore();
    // under the harness / ?noreload: fold everything away and hand the world back
    if (cr) cr.el.style.display = 'none';
    hudHide(false);
    crowdStop(); stopWatch(); S.follow = false;
    ctx.state.fogScale = S.savedFog;
    try { ctx.systems.camera?.setFree?.(null); } catch (e) {}
    try { if (rider.riding) rider.unmount(); } catch (e) {}
    const pl = player(); if (pl) { pl.locked = false; if (pl.group) pl.group.visible = true; }
    // (back on Sugar Pier, not in the sea under wherever the jet was)
    const e0 = bridge()?.ends?.candy;
    // (the pier's walkable is gated by the feet's current height: bring them down first)
    if (e0 && pl?.teleport) { try { pl.position.y = 5.3; pl.teleport(e0.x, e0.z + 2.5); ctx.systems.camera?.snap?.(); } catch (e) {} }
  }

  // ═══════════════════════════════════════════════ objectives + markers ════
  function register(spec) {
    const I = ctx.systems.interaction; if (!I?.register) return null;
    try { return I.register(spec); } catch (e) { return null; }
  }
  function refreshObjective() {
    if (!bridge()?.up || S.phase !== 'idle' && S.phase !== 'ready') return;
    const p = passes();
    if (!p.cat) return;                                   // before the medal, containment owns the goal
    const sub = p.candy ? 'Both halves! Signal MEOW AIR from the top of the rainbow.'
      : 'The King’s half of the boarding pass is on the Candy Palace throne.';
    try { ui()?.setObjective?.('The islands are joined. So are their problems.', sub); } catch (e) {}
    try {
      const kh = escape.routes?.palace?.kingsHalf;
      if (!p.candy && kh) ui()?.addMapMarker?.({ id: 'kings_half', x: kh.x, z: kh.z, glyph: 'key', label: 'The King’s half' });
      else ui()?.removeMapMarker?.('kings_half');
      if (p.candy && caseSpot) ui()?.addMapMarker?.({ id: 'meow_flare', x: caseSpot.x, z: caseSpot.z, glyph: 'plane', label: 'Signal MEOW AIR' });
    } catch (e) {}
  }
  const refreshSoon = () => escape.after(0.05, refreshObjective);
  ctx.events.on('story:pass_cat', refreshSoon);
  ctx.events.on('story:pass_candy', (v) => {
    refreshSoon();
    if (v && passes().cat) { try { ui()?.say?.('The halves fit. The perforations match. Somewhere, a jet is waiting for a flare.', { speaker: 'Boarding pass' }); } catch (e) {} }
  });
  ctx.events.on('bridge:up', () => { buildCase(); refreshSoon(); });
  // the air-routes jet also announces its ladder synchronously (a stepped run
  // never yields to the promise's microtask, and neither need we)
  ctx.events.on('planes:summon', (e) => {
    if (!S.theirs) return;
    if (e?.phase === 'ladder' && S.phase === 'jet') onLadder();
    // already on the rungs when she settles into her hover: make her wait for the top
    if ((e?.phase === 'hover' || e?.phase === 'ladder') && S.phase === 'climb') {
      try { ctx.systems.planes?.jetHold?.(Math.max(0, CLIMB_T - S.climbT) + 3); } catch (err) {}
    }
  });
  // containment rewrites the goal on every trip; after the medal, ours is the one that matters
  ctx.events.on('escape:success', (e) => { if (e?.route !== 'ending') escape.after(1.3, refreshObjective); });

  // ═══════════════════════════════════════════════ world:ready ═════════════
  ctx.events.on('world:ready', () => {
    if (bridge()?.up) buildCase();
    flareEntry = register({
      id: 'ending_flare', x: 0, z: 0, r: 2.4, label: 'Read: IN CASE OF ESCAPE',
      getPos: () => caseSpot ? caseSpot.stand : { x: 1e6, z: 1e6 },
      onInteract() {
        if (!caseSpot || S.phase !== 'ready' && S.phase !== 'idle') return;
        const p = passes();
        if (p.cat && p.candy) fire();
        else {
          const which = p.cat ? 'the King’s half (Candy Palace, the throne)' : p.candy ? 'the Mayor’s half (be a citizen first)' : 'both halves';
          ui()?.say?.(`IN CASE OF ESCAPE, BREAK GLASS. Underneath, smaller: "Boarding pass required. You are missing ${which}." — MEOW AIR`, { speaker: 'The glass case' });
        }
      },
    });
    if (flareEntry) flareEntry.enabled = false;
    const q = params.get?.('ending');
    if (q === 'passes' || q === 'signal' || q === 'credits') {
      escape.after(0.2, () => {
        if (q === 'credits') { api.debugCredits(0); return; }
        api.debugPasses();
        if (q === 'signal') api.debugSignal();
      });
    }
  });

  // ═══════════════════════════════════════════════ api + update ═══════════
  const api = {
    get phase() { return S.phase; },
    get passes() { return passes(); },
    get creditsActive() { return S.phase === 'credits'; },
    get caseSpot() { return caseSpot; },
    /** Test hook: the credits' far LOD — the lens distance and how much ground cover it has put away. */
    get creditsLOD() { return { dist: +lodDist.toFixed(1), hidden: lod ? lod.filter((e) => e.hid).map((e) => e.mesh.name) : [], of: lod ? lod.length : 0 }; },
    debugPasses() {
      if (!bridge()?.up) bridge()?.debugRaise?.(true);
      story()?.set('honorary_citizen', true);
      story()?.set('pass_cat', true); story()?.set('pass_candy', true);
      buildCase(); refreshObjective();
      return passes();
    },
    debugSignal() {
      api.debugPasses();
      bridge()?.debugPlace?.(bridge().sAt(caseSpot.stand.x, caseSpot.stand.z));
      if (S.phase === 'idle' || S.phase === 'ready') { S.phase = 'ready'; fire(); }
      return S.phase;
    },
    debugJet(t = 6) {
      if (S.phase === 'idle' || S.phase === 'ready') api.debugSignal();
      S.flareT = Math.max(S.flareT, 2.6); S.t = Math.max(S.t, 2.6);
      if (S.phase === 'flare') summon();
      if (!S.theirs) S.jetT = Math.max(0, t - 1 / 30);
      else { try { ctx.systems.planes?.debugSummon?.(S.ladder.x, S.ladder.y, S.ladder.z, t >= JET.dur ? 'hover' : 'approach', false); } catch (e) {} }
      return S.phase;
    },
    debugClimb(t = 3) {
      if (S.phase !== 'climb') {
        api.debugJet(JET.dur + 2);
        if (S.theirs) { try { ctx.systems.planes?.debugSummon?.(S.ladder.x, S.ladder.y, S.ladder.z, 'hover', false); } catch (e) {} onLadder(); }
        else { S.jetT = JET.dur + 1.6; if (S.phase === 'jet') { placeJet(JET.dur); hoverJet(0); jet.ladder.scale.y = 1; onLadder(); } }
        startClimb();
        if (crowd) { crowd.t = 20; for (const c of crowd.list) c.s = c.goal; }
      }
      S.climbT = Math.max(0, t - 1 / 30);
      watch.t = S.climbT;
      // (the harness's teleport drops a running shot: take the lens back, as bridge.debugCine does)
      try { if (S.camO) S.cam = ctx.systems.camera?.cinematic?.(S.camO) ?? S.cam; } catch (e) {}
      return S.phase;
    },
    debugCredits(t = 3) {
      S.follow = false;                                    // (no jet to follow: straight to the islands)
      startCredits(Math.max(0, t - 1 / 30));
      return S.phase;
    },
    update(dt, c) {
      const B = bridge();
      if (S.phase === 'done') return;
      // the case: only on the deck, only when the bridge stands
      if (flareEntry) {
        const P = player()?.position;
        const on = !!(B?.up && caseSpot && P && P.y > caseSpot.y - 3 && (S.phase === 'idle' || S.phase === 'ready'));
        flareEntry.enabled = on;
        if (on) flareEntry.label = (has('pass_cat') && has('pass_candy')) ? 'Signal MEOW AIR' : 'Read: IN CASE OF ESCAPE';
      }
      if (S.phase === 'idle' && B?.up && has('pass_cat') && has('pass_candy')) S.phase = 'ready';
      if (caseMeshes && caseMeshes.base.parent) {
        const night = clamp(1 - (c.state.daylight ?? 1), 0, 1);
        caseMeshes.base.material.emissiveIntensity = 0.1 + night * 0.6;
        if (!S.broken) caseMeshes.glass.material.emissiveIntensity = 0.12 + (S.phase === 'ready' ? 0.35 + 0.3 * Math.sin(c.state.elapsed * 3) : 0);
      }
      if (S.phase === 'idle' || S.phase === 'ready') return;
      S.t += dt;

      // the flare: rises, pops, hangs red over everything
      if (flare.on && caseSpot) {
        S.flareT += dt;
        flarePos(S.flareT);
        const pop = S.flareT >= 2.2 && S.flareT - dt < 2.2;
        if (pop) ctx.systems.particles?.burst?.({ x: flare.x, y: flare.y, z: flare.z, count: 90, color: [0xff2a3a, 0xff7a5a, 0xffd0a0, 0xffffff], speed: 12, life: 2.2, size: 0.45, gravity: -2, spread: 2, shape: 'sparkle', blend: 'add' });
        const pulse = 0.8 + 0.2 * Math.sin(S.flareT * 17) * Math.sin(S.flareT * 5.3);
        bridge()?.setAlarm?.(ss(1.8, 3.2, S.flareT) * (1 - ss(40, 55, S.flareT)));
        const big = S.flareT < 2.2 ? 1.6 : 3.4;
        setBB(0, flare.x, flare.y, flare.z, big, 1.0, 0.1, 0.08, 1.35 * pulse);
        setBB(1, flare.x, flare.y, flare.z, big * 0.34, 1.0, 0.92, 0.8, 1.6);
        setBB(BB_GLINT, flare.x, flare.y, flare.z, -big * 2.2, 1.0, 0.55, 0.45, 0.9 * pulse);
        // the launch trail: pink smoke puffs from the case up to where it popped, thinning away
        const top = S.flareT < 2.2 ? flare.y : caseSpot.y + 39.4;
        const fade = 1 - ss(6, 22, S.flareT);
        for (let i = 0; i < TRAIL_N; i++) {
          const u = (i + 0.5) / TRAIL_N, yy = caseSpot.y + 1.6 + (top - caseSpot.y - 1.6) * u;
          const wob = Math.sin(u * 9 + S.flareT * 0.6) * (0.3 + S.flareT * 0.06);
          setBB(BB_TRAIL + i, caseSpot.x + wob, yy, caseSpot.z + Math.cos(u * 7) * 0.3, 2.1 + u * 1.1 + S.flareT * 0.12, 0.5, 0.14, 0.18, 0.16 * fade * (0.55 + 0.45 * u));
        }
        if (S.flareT > 55) {
          flare.on = false; bridge()?.setAlarm?.(0);
          for (const k of [0, 1, BB_GLINT]) setBB(k, 0, -999, 0, 0, 0, 0, 0, 0);
          for (let i = 0; i < TRAIL_N; i++) setBB(BB_TRAIL + i, 0, -999, 0, 0, 0, 0, 0, 0);
          try { flare.emitter?.stop?.(); } catch (e) {}
        }
      }
      if (S.phase === 'jet') {
        S.jetT += dt;
        if (!S.theirs && jet) {
          if (S.jetT < JET.dur) placeJet(S.jetT);
          else {
            hoverJet(S.jetT - JET.dur);
            jet.ladder.scale.y = Math.max(0.001, clamp((S.jetT - JET.dur - 0.3) / 1.5, 0, 1));
            if (S.jetT > JET.dur + 1.8) onLadder();
          }
          if (S.phase === 'jet' && S.jetT > JET.dur - 3.5) offerLadder();
        } else if (S.theirs) {
          // her rope unrolls over the last stretch of the run-in (≈ 4 s): the
          // prompt goes up with it, and the rope is in reach once she is all but
          // settled over you (the hover / ladder events are honoured too)
          const gap = jetGap();
          if (gap < PROMPT_R) offerLadder();
          if (gap < LADDER_REACH) onLadder();
          else if (S.jetT > 45) standIn();                    // nobody answered: our own jet comes
        }
      }
      if (S.phase === 'ladder') {
        S.ladderT += dt;
        if (jet && !S.theirs) { S.jetT += dt; hoverJet(S.jetT - JET.dur); }
        if (S.ladderT > LADDER_BEAT) startClimb();             // a beat of hesitation, then you go
      }
      if (S.phase === 'climb') { if (jet && !S.theirs) { S.jetT += dt; hoverJet(S.jetT - JET.dur); } stepClimb(dt); }
      if (S.phase === 'credits') {
        S.credT += dt;
        if (S.follow) {
          // the jet climbs out under the opening credits, the visitor in seat 1A
          // (the rider stays aboard until the lens has let the jet go)
          if (jet && !S.theirs) departJet(S.credT);
          if (S.credT < FOLLOW_T + BLEND_T) {
            jetPos(S);
            if (rider.riding) rider.place(S.jx, S.jy, S.jz);
          } else if (crowd?.on) crowdStop();
        }
        creditsCamera(S.credT); drawCredits(S.credT);
        // the credits' grade: sky.js sets the exposure from its palette every
        // frame (before us), so this lift lasts exactly as long as the credits —
        // enough that Cat Island's palms, dock and tower read in the dark
        // (and the moonlit fill with it: sky.js re-applies hemi/ambient from its palette each update too)
        try {
          const n = clamp(1 - (c.state.daylight ?? 1), 0, 1), sky = ctx.systems.sky;
          if (ctx.renderer) ctx.renderer.toneMappingExposure *= 1 + 0.8 * n;
          if (sky?.hemi) sky.hemi.intensity *= 1 + 2.6 * n;
          if (sky?.ambient) sky.ambient.intensity *= 1 + 2.0 * n;
        } catch (e) {}
        if (!ctx.shot && S.credT > 1.5 && c.input?.pressed?.size) finish();
        if (S.credT >= CREDITS_T) finish();
      }
      stepCrowd(dt);
      stepWatch(dt);
      if (bb.visible) flushBB();
    },
  };
  // under the harness keep the stand-in jet reachable for views
  api.jet = () => jet;
  /** Tuning: the climb's lens (mutable; read every frame of the climb). */
  api.climbCam = CLIMB_CAM;
  return escape.register('ending', api);
}

// ── credits: the title card's language (Baloo 2 / Nunito, ink outlines, candy
// stripes, a pink ribbon, a gold badge, mint "cat" letters, sprinkles) ────────
const CREDITS_CSS = `
#ui.cci-endc-on > :not(.cci-endc):not(.cci-fade):not(.cci-nvig):not(.cci-vig):not(.tch-rot):not(style) { visibility: hidden !important; }
#ui .cci-endc { position: fixed; inset: 0; z-index: 86; overflow: hidden; pointer-events: none; display: none; --ink: #24122c;
  --hf: clamp(46px, min(12vw, 15vh), 150px); }
#ui .cci-endc-veil { position: absolute; inset: 0; opacity: 0;
  background:
    radial-gradient(ellipse 120% 95% at 50% 46%, rgba(44,14,52,0) 48%, rgba(36,10,46,.55) 100%),
    linear-gradient(180deg, rgba(44,14,52,.35) 0%, rgba(44,14,52,.12) 30%, rgba(44,14,52,.3) 70%, rgba(30,8,38,.72) 100%); }
#ui .cci-endc-motes { position: absolute; inset: 0; }
#ui .cci-endc-motes i { position: absolute; left: 0; top: 0; border-radius: 99px; border: 1.2px solid rgba(36,18,44,.5); opacity: 0; box-shadow: inset 0 1.2px 0 rgba(255,255,255,.55); }
/* (r6) the roll fades out BELOW the pinned title, never under it: once risen the
   title is centred at 15vh at 0.46 of var(--hf), so its lowest ink (and shadow)
   sits above 15vh + half of var(--hf) at every viewport size */
#ui .cci-endc-rollwrap { position: absolute; inset: 0;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, transparent calc(15vh + .5 * var(--hf)), #000 calc(26vh + .5 * var(--hf)), #000 100%);
  mask-image: linear-gradient(180deg, transparent 0, transparent calc(15vh + .5 * var(--hf)), #000 calc(26vh + .5 * var(--hf)), #000 100%); }
#ui .cci-endc-hero { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); transform-origin: 50% 50%;
  display: flex; flex-direction: column; align-items: center; font-size: var(--hf); white-space: nowrap; }
#ui .cci-endc-hero .esc, #ui .cci-endc-hero .real { display: flex; align-items: flex-end; font: 800 1em/.92 "Baloo 2", "Trebuchet MS", sans-serif;
  filter: drop-shadow(0 .05em 0 var(--ink)) drop-shadow(0 .14em .16em rgba(16,4,24,.5)); }
#ui .cci-endc-hero .real { font-size: .5em; margin-top: .12em; opacity: 0; }
#ui .cci-endc .l { position: relative; display: inline-block; transform-origin: 50% 85%; transform: scale(0); }
#ui .cci-endc .real .l { transform: none; }
#ui .cci-endc .l b { display: block; font: inherit; }
#ui .cci-endc .l .o { position: absolute; left: 0; top: 0; color: var(--ink); -webkit-text-stroke: .17em var(--ink); }
#ui .cci-endc .l .f { position: relative; color: transparent; -webkit-background-clip: text; background-clip: text; }
#ui .cci-endc .l.cd .f { background-image: linear-gradient(180deg, rgba(255,255,255,.66) 0%, rgba(255,255,255,.14) 30%, rgba(255,255,255,0) 44%),
  linear-gradient(0deg, rgba(90,10,50,.32) 0%, rgba(90,10,50,0) 30%), repeating-linear-gradient(126deg, var(--c) 0 .09em, #fff6ec .09em .18em); }
#ui .cci-endc .l.ct .f { background-image: linear-gradient(180deg, rgba(255,255,255,.62) 0%, rgba(255,255,255,.1) 34%, rgba(255,255,255,0) 46%),
  linear-gradient(180deg, #e6fff6 0%, #a2f0d7 40%, #52c7a8 72%, #2fa88c 100%); }
#ui .cci-endc .sp { display: inline-block; width: .26em; }
#ui .cci-endc-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
#ui .cci-endc-roll { position: absolute; left: 50%; top: 0; width: min(760px, 92vw); transform: translate(-50%, 110vh);
  display: flex; flex-direction: column; align-items: center; gap: 30px; text-align: center; color: #fff4e6;
  font: 700 clamp(14px, 1.45vw, 19px)/1.35 "Nunito", "Trebuchet MS", sans-serif;
  text-shadow: 0 1.5px 0 rgba(26,8,32,.95), 0 2px 10px rgba(0,0,0,.65); }
#ui .cci-endc-roll .big { font: 800 clamp(20px, 2.3vw, 32px)/1.2 "Baloo 2", "Trebuchet MS", sans-serif; letter-spacing: .01em; }
#ui .cci-endc-roll .big b { color: #ffd166; font-weight: 800; }
#ui .cci-endc-roll .blk { display: flex; flex-direction: column; align-items: center; gap: 9px; }
#ui .cci-endc-roll .rib { margin-bottom: 6px; padding: .3em 1.1em .24em; border-radius: .35em; border: 2.5px solid var(--ink);
  font: 800 clamp(12px, 1.2vw, 16px)/1 "Baloo 2", sans-serif; letter-spacing: .2em; color: #fff8ee; text-shadow: 0 1.5px 0 rgba(36,18,44,.6);
  background: linear-gradient(180deg, #ff86ae 0%, #ef4f84 58%, #d7386f 100%);
  box-shadow: 0 3px 0 var(--ink), 0 8px 14px rgba(16,4,24,.35), inset 0 2px 0 rgba(255,255,255,.5); }
#ui .cci-endc-roll .row { display: flex; flex-direction: column; align-items: center; }
#ui .cci-endc-roll .row b { font: 800 clamp(16px, 1.7vw, 23px)/1.2 "Baloo 2", sans-serif; color: #fffaf2; }
#ui .cci-endc-roll .row span { font-style: italic; color: #ffd9e6; opacity: .95; }
#ui .cci-endc-roll .quip { max-width: 34em; font-style: italic; color: #d8f7ec; }
#ui .cci-endc-roll .bye { margin-top: 26px; font: 800 clamp(30px, 3.6vw, 52px)/1 "Baloo 2", sans-serif; color: #fffaf2;
  -webkit-text-stroke: .06em var(--ink); paint-order: stroke fill; text-shadow: 0 .08em 0 var(--ink), 0 .2em .3em rgba(10,2,16,.5); }
#ui .cci-endc-roll .mini { margin-top: 4px; font: 800 clamp(15px, 1.6vw, 21px)/1 "Baloo 2", sans-serif; letter-spacing: .08em; color: #ff8fb6; }
#ui .cci-endc-roll .mini span { color: #fff4e6; font-size: .7em; letter-spacing: .2em; margin-right: .3em; }
#ui .cci-endc-roll .mini i { font-style: normal; color: #ffc94a; margin: 0 .25em; }
#ui .cci-endc-press { position: absolute; left: 50%; bottom: calc(26px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); opacity: 0;
  padding: .85em 1.9em .9em; border-radius: 999px; white-space: nowrap; border: 3.5px solid var(--ink);
  font: 900 clamp(12px, calc(.5vw + 7px), 16px)/1 "Nunito", sans-serif; letter-spacing: .17em; text-transform: uppercase; color: #fffaf2;
  background: linear-gradient(180deg, #ff8fb6 0%, #ff5c93 46%, #e23a74 100%); text-shadow: 0 2px 0 var(--ink);
  box-shadow: 0 5px 0 var(--ink), inset 0 2.5px 0 rgba(255,255,255,.55), 0 12px 26px rgba(10,4,20,.45); }
`;
