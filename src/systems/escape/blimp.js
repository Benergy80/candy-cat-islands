// ─────────────────────────────────────────────────────────────────────────────
// THE SUGAR BLIMP — a two-way ride between the islands (WAVE 4 · Contract L)
//
// planes.js flies her: a fixed timetable, 20 s moored nose-in at each of two
// mooring masts, a slow drift across the strait in between (planes.blimp).
// This file owns everything on the ground and the ride itself:
//
//   MASTS       Sugar Pier (the mast on the beach north of the pier, the rope
//               ladder landing on the planks) and Fish Harbor (the mast on the
//               lawn east of the quay path). Candy-cane towers with a gold
//               mooring cup where the cat nose docks, a red beacon after dark
//               (planes.js's nav lights), a BLIMP STOP roundel under the ladder
//               and a timetable board: "NEXT BLIMP 0:40" / "BOARDING · 0:12".
//   BOARDING    E at the ladder foot while she is moored (and not about to
//               cast off): a 2.4 s climb, over the rail onto the balcony at the
//               back of the gondola. escape.start('blimp').
//   THE RIDE    you stand on the balcony; she unmoors, drifts the strait
//               (ctx.state.flying is set so the camera frames the flight, a
//               three-quarter view from the balcony's side), noses in at the
//               other mast, the ladder drops and you climb down (E, or on
//               your own after a beat). escape.success('blimp', {to}) — both
//               directions, day AND night. Ground chatter is hushed on board.
//   NIGHT       the boards glow; the captain gets quieter; the timetable adds
//               a line nobody asked for.
//
// Route API (ctx.systems.escape.routes.blimp): id · label · ready() · riding ·
//   state ('idle'|'up'|'aboard'|'down') · masts · board(mast) · debugRide(k?) ·
//   debugClimb(mast, k) · debugSign(mast) — views: tools/views/air_routes.json
// Draw calls: one merged mesh per mast (tower + roundel + board, atlas-mapped)
//   = 2, plus a shadow pass each when in the shadow camera.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../../core/util.js';
import { createRider, vehicleBusy, clearanceClaim } from './ride.js';

const TAU = Math.PI * 2;
const CAPTAIN = 'Captain Whiskerton';

// ── the timetable atlas: two boards + the roundel + a plain white texel ─────
const AT = 512;
const R = { board: { candy: [0, 0, 512, 200], cat: [0, 216, 512, 200] }, roundel: [0, 424, 88, 88], white: [480, 480, 32, 32] };
const FONT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';

export function create(ctx, escape) {
  const planes = ctx.systems.planes;
  const PB = planes?.blimp;
  if (!PB || !PB.masts) {
    console.warn('[escape/blimp] planes.blimp missing — the blimp route is idle');
    return escape.register('blimp', { id: 'blimp', label: 'The SUGAR Blimp', ready: () => false, get riding() { return false; }, update() {} });
  }
  const { world } = ctx;
  const MI = PB.masts;
  const OTHER = { candy: 'cat', cat: 'candy' };
  const DEST = { candy: 'CAT ISLAND', cat: 'THE CANDY KINGDOM' };
  ctx.colliders = ctx.colliders || [];
  const ui = () => ctx.systems.ui;
  const rider = createRider(ctx);

  // ── atlas ──────────────────────────────────────────────────────────────────
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const gv = document.createElement('canvas'); gv.width = AT; gv.height = AT;
  const g = cv.getContext('2d'), e = gv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, AT, AT);
  e.fillStyle = '#000'; e.fillRect(0, 0, AT, AT);
  const mkTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tex = mkTex(cv), glow = mkTex(gv);
  const fit = (c2, txt, maxW, px) => { let s = px; for (; s > 10; s -= 2) { c2.font = `900 ${s}px ${FONT}`; if (c2.measureText(txt).width <= maxW) break; } return s; };
  // the roundel under the ladder: a peppermint disc with BLIMP STOP
  {
    const [x, y, w] = R.roundel, cx = x + w / 2, cy = y + w / 2;
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#e8263f' : '#fff4f0';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, w / 2 - 1, i / 12 * TAU, (i + 1) / 12 * TAU); g.fill();
    }
    g.fillStyle = '#fff4f0'; g.beginPath(); g.arc(cx, cy, w * 0.3, 0, TAU); g.fill();
    g.fillStyle = '#7a1024'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'BLIMP', w * 0.52, 16); g.fillText('BLIMP', cx, cy - 7);
    fit(g, 'STOP', w * 0.5, 16); g.fillText('STOP', cx, cy + 9);
  }
  const boardText = { candy: '', cat: '' };
  function drawBoard(mast, big, small, night) {
    const [x, y, w, h] = R.board[mast];
    g.save(); e.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip(); e.beginPath(); e.rect(x, y, w, h); e.clip();
    // wafer board, candy-stripe header, cream panel
    g.fillStyle = '#6b3a1f'; g.fillRect(x, y, w, h);
    g.fillStyle = '#fff6ea'; g.beginPath(); g.roundRect(x + 10, y + 10, w - 20, h - 20, 14); g.fill();
    g.save(); g.beginPath(); g.roundRect(x + 10, y + 10, w - 20, 54, [14, 14, 0, 0]); g.clip();
    for (let i = -2; i < 24; i++) { g.fillStyle = i % 2 ? '#e8263f' : '#ffd9e2'; g.beginPath(); g.moveTo(x + i * 26, y + 64); g.lineTo(x + i * 26 + 26, y + 64); g.lineTo(x + i * 26 + 60, y + 10); g.lineTo(x + i * 26 + 34, y + 10); g.fill(); }
    g.restore();
    e.fillStyle = '#000'; e.fillRect(x, y, w, h);
    g.textAlign = e.textAlign = 'center'; g.textBaseline = e.textBaseline = 'middle';
    const head = 'SUGAR BLIMP  ▸  ' + DEST[mast];
    fit(g, head, w - 60, 30); e.font = g.font;
    g.lineWidth = 6; g.strokeStyle = '#fff6ea'; g.strokeText(head, x + w / 2, y + 38);
    g.fillStyle = '#7a1024'; g.fillText(head, x + w / 2, y + 38);
    e.fillStyle = '#6a3048'; e.fillText(head, x + w / 2, y + 38);
    fit(g, big, w - 50, 66); e.font = g.font;
    g.fillStyle = '#2a1640'; g.fillText(big, x + w / 2, y + 110);
    e.fillStyle = '#ffe6a0'; e.fillText(big, x + w / 2, y + 110);
    fit(g, small, w - 70, 24); e.font = g.font;
    g.fillStyle = night ? '#8a1830' : '#6b5a7a'; g.fillText(small, x + w / 2, y + 160);
    e.fillStyle = night ? '#ff6a7a' : '#302838'; e.fillText(small, x + w / 2, y + 160);
    g.restore(); e.restore();
  }
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function boardFor(mast, night) {
    if (PB.moored === mast) return ['BOARDING · ' + fmt(PB.departIn), night ? 'hold the rope · don\'t look down' : 'climb the ladder · E'];
    const eta = PB.eta(mast);
    return ['NEXT BLIMP ' + fmt(eta), night ? 'night service · don\'t wait alone' : 'every ' + Math.round(PB.cycle / 60 * 10) / 10 + ' min · day and night'];
  }
  function refreshBoard(mast, force = false) {
    const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
    const [big, small] = boardFor(mast, night);
    const key = big + '|' + small;
    if (!force && key === boardText[mast]) return;
    boardText[mast] = key;
    drawBoard(mast, big, small, night);
    tex.needsUpdate = true; glow.needsUpdate = true;
  }

  // ── geometry kit: merged parts, vertex colour + atlas uv ────────────────────
  const uvOf = (rect, u, v) => [(rect[0] + u * rect[2]) / AT, 1 - (rect[1] + (1 - v) * rect[3]) / AT];
  const WHITE_UV = uvOf(R.white, 0.5, 0.5);
  const _c = new THREE.Color();
  function kit() {
    const P = [], N = [], C = [], U = [];
    return {
      P, N, C, U,
      add(geo, m, color) {
        const gg = geo.index ? geo.toNonIndexed() : geo;
        if (m) gg.applyMatrix4(m);
        const p = gg.attributes.position.array, n = gg.attributes.normal.array;
        const fn = typeof color === 'function' ? color : null;
        if (!fn) _c.setHex(color);
        for (let i = 0; i < p.length; i += 9) {
          if (fn) _c.setHex(fn((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3));
          for (let j = 0; j < 9; j += 3) { P.push(p[i + j], p[i + j + 1], p[i + j + 2]); N.push(n[i + j], n[i + j + 1], n[i + j + 2]); C.push(_c.r, _c.g, _c.b); U.push(WHITE_UV[0], WHITE_UV[1]); }
        }
        geo.dispose(); if (gg !== geo) gg.dispose();
      },
      /** a textured quad: centre c, right r (half-width vector), up u (half-height vector), atlas rect */
      quad(cx, cy, cz, rx, ry, rz, ux, uy, uz, rect) {
        const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux, nl = Math.hypot(nx, ny, nz) || 1;
        const corner = (su, sv) => [cx + rx * su + ux * sv, cy + ry * su + uy * sv, cz + rz * su + uz * sv];
        const vs = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
        for (const [su, sv] of vs) {
          const q = corner(su, sv); P.push(q[0], q[1], q[2]); N.push(nx / nl, ny / nl, nz / nl); C.push(1, 1, 1);
          const uv = uvOf(rect, (su + 1) / 2, (sv + 1) / 2); U.push(uv[0], uv[1]);
        }
      },
      build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        geo.computeBoundingSphere();
        return geo;
      },
    };
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.62, metalness: 0,
  });
  mat.name = 'blimp_mast';

  // ── build one mast (+ its board and roundel) ────────────────────────────────
  const masts = {};
  const RED = 0xe8263f, CREAM = 0xfff4ea, GOLD = 0xffc93a, PINK = 0xffb3d1, MINT = 0xa8f0d1, CHOC = 0x5a3220, LIC = 0x1a1218;
  const cane = (x, y, z) => ((Math.floor(y * 1.5 + (Math.atan2(z, x) / TAU) * 2 + 40) % 2) ? RED : CREAM);
  function buildMast(name) {
    const m = MI[name];
    const k = kit();
    const bx = m.base.x, bz = m.base.z;
    let by = world.height(bx, bz);
    for (let a = 0; a < 6; a++) by = Math.min(by, world.height(bx + Math.cos(a) * 1.8, bz + Math.sin(a) * 1.8));
    const topY = m.top.y, fx = Math.sin(m.heading), fz = Math.cos(m.heading);
    const colTop = topY - 0.9;
    const H = colTop - by;
    // local frame: origin at the column foot
    const o = new THREE.Vector3(bx, by, bz);
    // plinth: pink fondant drum with an icing rim, gold kerb
    k.add(new THREE.CylinderGeometry(1.95, 2.25, 0.9, 16), M4(0, 0.25, 0), PINK);
    k.add(new THREE.TorusGeometry(1.98, 0.16, 6, 20), M4(0, 0.72, 0, Math.PI / 2), CREAM);
    k.add(new THREE.CylinderGeometry(2.3, 2.3, 0.18, 16), M4(0, -0.12, 0), GOLD);
    // the column: a fat candy cane, spiral striped
    const col = new THREE.CylinderGeometry(0.46, 0.72, H - 0.7, 14, Math.max(4, Math.round(H * 2.2)));
    k.add(col, M4(0, 0.7 + (H - 0.7) / 2, 0), cane);
    // gold collars + climbing pegs up the landward side
    for (const f of [0.28, 0.56, 0.84]) k.add(new THREE.TorusGeometry(0.66 - f * 0.2, 0.1, 6, 16), M4(0, 0.7 + (H - 0.7) * f, 0, Math.PI / 2), GOLD);
    for (let y = 1.4; y < H - 1; y += 0.75) k.add(new THREE.BoxGeometry(0.5, 0.09, 0.09), M4(fx * 0.66, y, fz * 0.66, 0, Math.atan2(fx, fz) + Math.PI / 2, 0), GOLD);
    // the head: a swivel dome and the mooring cup, open toward the blimp's nose
    k.add(new THREE.SphereGeometry(0.62, 12, 8), M4(0, H, 0), MINT);
    const cup = new THREE.CylinderGeometry(1.05, 0.42, 1.2, 16, 1, true);
    const cupM = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-fx, 0, -fz)));
    cupM.setPosition(-fx * 0.25, topY - by, -fz * 0.25);
    const cupG = cup.toNonIndexed();                 // both faces: the inside of the cup is what the nose sees
    k.add(cupG.clone(), cupM, GOLD);
    const inner = cupG.clone(); const ip = inner.attributes.position.array, inn = inner.attributes.normal.array;
    for (let i = 0; i < ip.length; i += 9) { for (let j = 0; j < 3; j++) { const t = ip[i + 3 + j]; ip[i + 3 + j] = ip[i + 6 + j]; ip[i + 6 + j] = t; } }
    for (let i = 0; i < inn.length; i++) inn[i] = -inn[i];
    { const t = inn.slice(); for (let i = 0; i < inn.length; i += 9) for (let j = 0; j < 3; j++) { inn[i + 3 + j] = t[i + 6 + j]; inn[i + 6 + j] = t[i + 3 + j]; } }
    k.add(inner, cupM, 0xd89a1a);
    cup.dispose(); cupG.dispose();
    k.add(new THREE.BoxGeometry(0.34, 0.34, 1.2), M4(-fx * 0.2, topY - by - 0.45, -fz * 0.2, 0, Math.atan2(fx, fz), 0), GOLD);   // the arm
    // beacon: a red glass cap on a stalk (the light itself is planes.js's nav point)
    k.add(new THREE.CylinderGeometry(0.09, 0.12, 1.9, 6), M4(0, H + 1.0, 0), LIC);
    k.add(new THREE.SphereGeometry(0.3, 10, 8), M4(0, topY + 2.35 - by, 0), 0xff4050);
    // pennant from the head, streaming downwind of the nose
    k.add(new THREE.ConeGeometry(0.45, 1.8, 3), M4(fx * 0.9, H + 0.25, fz * 0.9, 0, 0, Math.PI / 2 * 0.95, 1, 1, 0.25), MINT);
    const mesh = new THREE.Mesh(k.build(), mat);
    mesh.position.copy(o);
    mesh.name = 'blimp_mast_' + name;
    mesh.castShadow = true; mesh.receiveShadow = true;
    ctx.scene.add(mesh);

    // board + roundel: a second kit in WORLD space, merged into the same mesh
    const kb = kit();
    const fy = m.foot.y;
    // roundel flat on the planks / grass under the ladder
    kb.quad(m.foot.x, fy + 0.04, m.foot.z, 1.25, 0, 0, 0, 0, -1.25, R.roundel);
    // timetable board beside the foot: faces the way people arrive
    const bd = BOARD[name];
    const byb = (bd.deck ? fy : world.height(bd.x, bd.z));
    const rx = Math.cos(bd.face), rz = -Math.sin(bd.face);          // board's right, from its front
    const nx = Math.sin(bd.face), nz = Math.cos(bd.face);           // its facing
    const hw = 1.75, hh = 0.68, cy = byb + 1.95;
    kb.add(new THREE.BoxGeometry(hw * 2 + 0.3, hh * 2 + 0.3, 0.16), M4(bd.x, cy, bd.z, 0, bd.face, 0), CHOC);
    for (const s of [-1, 1]) {
      kb.add(new THREE.CylinderGeometry(0.1, 0.12, cy + 0.5 - byb, 8, 3), M4(bd.x + rx * s * (hw + 0.05), (cy + 0.5 + byb) / 2, bd.z + rz * s * (hw + 0.05)), (x, y) => ((Math.floor(y * 3 + 40) % 2) ? RED : CREAM));
      kb.add(new THREE.SphereGeometry(0.17, 8, 6), M4(bd.x + rx * s * (hw + 0.05), cy + 0.56, bd.z + rz * s * (hw + 0.05)), GOLD);
    }
    kb.quad(bd.x + nx * 0.09, cy, bd.z + nz * 0.09, rx * hw, 0, rz * hw, 0, hh, 0, R.board[name]);
    kb.quad(bd.x - nx * 0.09, cy, bd.z - nz * 0.09, -rx * hw, 0, -rz * hw, 0, hh, 0, R.board[name]);
    const boardMesh = new THREE.Mesh(kb.build(), mat);
    boardMesh.name = 'blimp_board_' + name;
    boardMesh.castShadow = false; boardMesh.receiveShadow = true;
    // merge: one draw call per mast (tower in local space → shift into world)
    const gA = mesh.geometry.clone(); gA.translate(o.x, o.y, o.z);
    const merged = mergeTwo(gA, boardMesh.geometry);
    mesh.geometry.dispose(); boardMesh.geometry.dispose(); gA.dispose();
    mesh.geometry = merged; mesh.position.set(0, 0, 0);
    mesh.geometry.computeBoundingSphere();
    // colliders: the plinth (solid), the board (a thin wall). No `h` on
    // either: Contract A reads any h > 1.6 as a legacy ABSOLUTE top, and these
    // stand on ground at y ≈ 3–5, so an h of 2.9 put the top under the
    // visitor's feet and he walked straight through. No h = always SOLID.
    ctx.colliders.push({ x: bx, z: bz, r: 2.2 });
    ctx.colliders.push({ x: bd.x, z: bd.z, w: hw * 2 + 0.4, d: 0.4, rot: -bd.face, box: true });   // collider rot = −(mesh yaw)
    // keep the plants off the plinth (cat nature honours boxes, candy
    // vegetation circles; both read them at world:ready)
    if (m.island === 'cat') clearanceClaim(ctx, bx, bz, 5.4, 5.4, 0, 'blimp_mast_cat');
    else { const c = { x: bx, z: bz, r: 3.2, solid: false, claim: 'blimp_mast_candy' }; ctx.colliders.push(c); retire.push(c); }
    masts[name] = { mesh, m, board: bd };
  }
  function mergeTwo(a, b) {
    const out = new THREE.BufferGeometry();
    for (const key of ['position', 'normal', 'color', 'uv']) {
      const A = a.attributes[key].array, B2 = b.attributes[key].array, it = a.attributes[key].itemSize;
      const arr = new Float32Array(A.length + B2.length); arr.set(A, 0); arr.set(B2, A.length);
      out.setAttribute(key, new THREE.BufferAttribute(arr, it));
    }
    return out;
  }
  // where each board stands (world), and which way it faces (yaw of its front)
  const BOARD = {
    // on the pier's north edge beside the ladder, facing the planks (south)
    candy: { x: MI.candy.foot.x - 0.2, z: 19.75, face: 0, deck: true },
    // on the lawn south of the ladder foot, facing the quay path (south-east)
    cat: { x: MI.cat.foot.x + 0.4, z: MI.cat.foot.z + 3.4, face: 2.35, deck: false },
  };
  const retire = [];
  for (const name of ['candy', 'cat']) {
    try { buildMast(name); } catch (err) { console.error('[escape/blimp] mast ' + name + ' failed', err); }
  }
  ctx.events.on('world:ready', () => {
    for (const c of retire) { c.r = 0; c.x = 1e6; }
    for (const name of ['candy', 'cat']) {
      const m = MI[name];
      try { ui()?.addMapMarker?.({ id: 'blimp_stop_' + name, x: m.foot.x, z: m.foot.z, glyph: 'plane', label: 'Blimp stop · ' + m.label }); } catch (err) { /* optional */ }
    }
  });
  refreshBoard('candy', true); refreshBoard('cat', true);

  // ── the ride ────────────────────────────────────────────────────────────────
  const route = { id: 'blimp', label: 'The SUGAR Blimp', masts: MI };
  let state = 'idle';              // 'idle' | 'up' | 'aboard' | 'down'
  let from = null, to = null, st = 0, lastPhase = null, landedFor = 0, sayT = 0, saidMid = false;
  const seat = new THREE.Vector3(), top = new THREE.Vector3(), tmp = new THREE.Vector3();
  const FLY = { alt: 0, y: 0, speed: 0, vy: 0, energy: 1, heading: 0, thermal: 0, boost: false, vehicle: 'blimp' };
  let fogSaved, fogOn = false;
  const player = () => ctx.systems.player;
  const introOn = () => !!ctx.systems.intro?.active;
  const NAMES = ['candy', 'cat'];
  const LADDER_GRAB = 2.0;          // the roundel is r 1.25

  // The E prompts (the rope ladder, the timetable board) are registered at
  // world:ready: main.js creates 'escape' BEFORE 'interaction', so
  // ctx.systems.interaction does not exist yet while create() runs (cave.js,
  // flyer.js, canoe.js, catapult.js register the same way). update() guards on
  // null, so until then there is simply nothing to press.
  const gates = { candy: null, cat: null }, signs = { candy: null, cat: null };
  const timetableLine = (name) => {
    const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
    const eta = PB.eta(name);
    return PB.moored === name
      ? `Boarding now — she casts off in ${fmt(PB.departIn)}. Rope ladder, hands on the rungs.`
      : `Next SUGAR blimp to ${name === 'candy' ? 'Cat Island' : 'the Candy Kingdom'}: ${fmt(eta)}.` + (night ? ' Night crossings run on time. Please do not wave at anything below.' : ' Moors twenty seconds. Waits for no one.');
  };
  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction;
    if (!I?.register) { console.warn('[escape/blimp] no interaction system — the ladders have no E prompt'); return; }
    for (const name of NAMES) {
      const m = MI[name];
      try {
        // interaction.register() stores a COPY of the spec: keep the entry it returns
        // Standing on the BLIMP STOP roundel, the ladder is THE thing to press E
        // for: Fish Harbor's water-balloon ammo lies 1.1 u from its foot and
        // would otherwise win interaction.nearest(). Within LADDER_GRAB the
        // gate reports the visitor's own spot (distance 0: always nearest, the
        // pill floats over him); further out it competes normally from the foot.
        const gp = { x: m.foot.x, y: m.foot.y, z: m.foot.z };
        gates[name] = I.register({
          id: 'blimp_ladder_' + name, x: m.foot.x, z: m.foot.z, r: 2.7,
          getPos() {
            const p = player()?.position;
            if (p && Math.hypot(p.x - m.foot.x, p.z - m.foot.z) < LADDER_GRAB) { gp.x = p.x; gp.z = p.z; } else { gp.x = m.foot.x; gp.z = m.foot.z; }
            return gp;
          },
          label: 'Blimp ride to ' + (name === 'candy' ? 'Cat Island' : 'the Candy Kingdom'),
          onInteract() { route.board(name); },
        }) || null;
        if (gates[name]) gates[name].enabled = false;
      } catch (err) { console.warn('[escape/blimp] ladder prompt ' + name + ' failed', err); }
      try {
        const bd = BOARD[name];
        signs[name] = I.register({
          id: 'blimp_board_' + name, x: bd.x + Math.sin(bd.face) * 1.2, z: bd.z + Math.cos(bd.face) * 1.2, r: 2.4,
          label: 'Read the blimp timetable',
          onInteract() { ui()?.say(timetableLine(name), { speaker: 'Timetable', duration: 4.2 }); },
        }) || null;
        if (masts[name]) masts[name].sign = signs[name];
      } catch (err) { console.warn('[escape/blimp] timetable prompt ' + name + ' failed', err); }
    }
  });

  route.board = function board(name, quiet = false) {
    const pl = player();
    if (!pl || state !== 'idle' || vehicleBusy(ctx) || introOn()) return false;
    if (PB.moored !== name || PB.ladder < 0.95) { ui()?.toast?.('The ladder is up. Next blimp ' + fmt(PB.eta(name)) + '.', 3); return false; }
    if (PB.departIn < 3.2) { ui()?.toast?.('Too late — she is casting off. Next one in ' + fmt(PB.eta(name) || PB.cycle - PB.dwell) + '.', 3.2); return false; }
    const m = MI[name];
    from = name; to = OTHER[name]; state = 'up'; st = 0; saidMid = false; landedFor = 0;
    rider.mount('blimp', m.foot.x, m.foot.y, m.foot.z, 2.2);
    rider.pose(null);
    PB.holdLadder(1);
    for (const n of ['candy', 'cat']) if (gates[n]) gates[n].enabled = false;
    // Contract L: escape.start on boarding. Leaving Candyland is not an
    // escape the cats should shout about (cave.js's `arrived` convention).
    escape.start('blimp', from === 'candy'
      ? { label: 'the SUGAR blimp', from: 'candy', to: 'cat', arrived: 'cat' }
      : { label: 'the SUGAR blimp', from: 'cat', to: 'candy' });
    if (!quiet) ui()?.toast?.('All aboard the SUGAR! She casts off in ' + fmt(PB.departIn) + '.', 3.4);
    return true;
  };

  function placeOnLadder(k) {
    // k: 0 = foot, 1 = the top of the ladder (then onto the balcony)
    PB.ladderTop(top);
    const m = MI[state === 'down' ? to : from];
    const x = lerp(m.foot.x, top.x, k), z = lerp(m.foot.z, top.z, k);
    const y = lerp(m.foot.y, top.y - 1.35, k);
    rider.place(x, y, z, PB.heading);
  }
  function hushOn(on) {
    if (on && !fogOn) { fogSaved = ctx.state.fogScale; fogOn = true; }
    if (!on && fogOn) { ctx.state.fogScale = fogSaved; fogOn = false; fogSaved = undefined; }
  }
  function endRide(arrived) {
    ctx.state.flying = null;
    hushOn(false);
    PB.holdLadder(null);
    const m = MI[arrived];
    // step off the roundel toward the island (never back under the ladder)
    const sx = m.foot.x - Math.sin(m.heading) * 0.2 + Math.cos(m.heading) * 1.4;
    const sz = m.foot.z - Math.cos(m.heading) * 0.2 - Math.sin(m.heading) * 1.4;
    rider.unmount(sx, sz);
    state = 'idle';
    const toIsland = m.island;
    escape.success('blimp', { to: toIsland, from: from === 'candy' ? 'candy' : 'cat', landing: { x: sx, z: sz } });
    if (toIsland === 'candy') {
      try { ctx.systems.story?.set('escape_card_shown_blimp', true); } catch (err) { /* optional */ }
      ui()?.card?.({ title: 'ESCAPED', body: 'You escaped Cat Island by blimp. The cats waved you off. The cats wave at everything.', buttons: [{ label: 'For now.' }] });
      ui()?.toast?.('Sugar Pier. Feet on candy again.', 3.6);
    } else {
      ui()?.toast?.('Fish Harbor. The cats are delighted to see you. They are always delighted.', 4.2);
    }
    from = to = null;
  }

  // Nobody on the ground can be heard from a gondola: while she is under way,
  // spoken lines from anyone but the crew are dropped (same rule as the flyer).
  ctx.events.on('ui:say', (ev) => {
    if (state !== 'aboard' || PB.phase === 'moored' || !ev || !ev.speaker || ev.speaker === CAPTAIN || ev.speaker === 'Timetable') return;
    const u = ui(); if (!u) return;
    try {
      const q = u.sayQueue, txt = String(ev.text);
      const i = Array.isArray(q) ? q.findIndex((x) => x && x.text === txt) : -1;
      if (i >= 0) q.splice(i, 1); else u.clear?.();
    } catch (err) { /* optional */ }
  });

  const CLIMB = 2.4, STEP = 0.55;
  route.update = function update(dt) {
    // boards (4 Hz, and only near: the text changes once a second at most) + gates
    sayT -= dt;
    const pl = player()?.position;
    const tick = sayT <= 0;
    if (tick) sayT = 0.25;
    for (const name of NAMES) {
      const m = MI[name];
      if (tick && (!pl || Math.hypot(pl.x - m.foot.x, pl.z - m.foot.z) < 95)) refreshBoard(name);
      const gate = gates[name];
      if (gate) gate.enabled = state === 'idle' && PB.moored === name && PB.ladder > 0.95 && PB.departIn > 3.2 && !introOn();
      if (signs[name]) signs[name].enabled = state === 'idle' && !(gate && gate.enabled);
    }
    const lamp = ctx.systems.sky?.lampMix ?? (ctx.state.isNight ? 1 : 0);
    mat.emissiveIntensity = 1.35 * lamp;

    if (state === 'idle') return;
    if (dt <= 0) { if (state === 'aboard') { PB.seat(seat); rider.place(seat.x, seat.y, seat.z, seat.facing); } return; }
    if (!route._freeze) st += dt;                // debugClimb holds the visitor mid-ladder
    if (state === 'up') {
      if (st < CLIMB) placeOnLadder(smoothstep(0, 1, st / CLIMB));
      else if (st < CLIMB + STEP) {
        PB.ladderTop(top); PB.seat(seat);
        const k = smoothstep(0, 1, (st - CLIMB) / STEP);
        rider.place(lerp(top.x, seat.x, k), lerp(top.y - 1.35, seat.y, k) + Math.sin(k * Math.PI) * 0.5, lerp(top.z, seat.z, k), PB.heading);
      } else {
        state = 'aboard'; st = 0; PB.holdLadder(null);
        const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
        ui()?.say(night ? 'Night crossing. Stay on the balcony. And whatever you hear down there — don\'t answer it.'
          : 'Welcome aboard the SUGAR! Paws inside the rail. Refreshments are the view.', { speaker: CAPTAIN, duration: 4.2 });
      }
      return;
    }
    if (state === 'aboard') {
      PB.seat(seat);
      rider.place(seat.x, seat.y, seat.z, seat.facing);
      const under = PB.phase !== 'moored';
      if (under) {
        const g = world.height(seat.x, seat.z);
        FLY.alt = seat.y - Math.max(g, 0); FLY.y = seat.y; FLY.speed = Math.max(PB.speed, 0.5);
        // the camera frames flight from behind `heading`: offset it so the lens
        // sits off the balcony's quarter, looking at the passenger, not the tail
        FLY.heading = PB.heading - 1.0;
        ctx.state.flying = FLY;
        hushOn(true);
        const camY = ctx.camera.position.y;
        ctx.state.fogScale = Math.max(1, fogSaved || 1, 1 + clamp((camY - 30) / 60, 0, 1.2));
        if (!saidMid && PB.phase === 'cruise' && Math.abs(seat.x) < 20) {
          saidMid = true;
          const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
          ui()?.say(night ? 'Those lights on the water are not boats.' : 'Halfway! On your left: the sea. On your right: also the sea.', { speaker: CAPTAIN, duration: 3.6 });
        }
      } else {
        if (ctx.state.flying === FLY) ctx.state.flying = null;
        hushOn(false);
      }
      // arrived: the ladder drops at the other mast — down you go (E, or on your own)
      if (PB.moored === to && PB.ladder > 0.95) {
        landedFor += dt;
        const e = ctx.input?.pressed;
        if (landedFor > 1.4 || (e && (e.has('KeyE') || e.has('Enter')))) { state = 'down'; st = 0; PB.holdLadder(1); ctx.state.flying = null; hushOn(false); }
      } else if (PB.moored === from && PB.departIn > 0.5) {
        // still at the first mast: E climbs back down
        const e = ctx.input?.pressed;
        if (e && (e.has('KeyE') || e.has('Enter'))) {
          state = 'down'; st = 0; PB.holdLadder(1); const t2 = to; to = from; from = t2; route._aborted = true;
        }
      }
      return;
    }
    if (state === 'down') {
      if (st < STEP) {
        PB.ladderTop(top); PB.seat(seat);
        const k = smoothstep(0, 1, st / STEP);
        rider.place(lerp(seat.x, top.x, k), lerp(seat.y, top.y - 1.35, k) + Math.sin(k * Math.PI) * 0.5, lerp(seat.z, top.z, k), PB.heading + Math.PI);
      } else if (st < STEP + CLIMB) placeOnLadder(1 - smoothstep(0, 1, (st - STEP) / CLIMB));
      else if (route._aborted) {
        // climbed back down where we started: no ride, no escape
        route._aborted = false;
        const m = MI[to];
        PB.holdLadder(null); ctx.state.flying = null; hushOn(false);
        rider.unmount(m.foot.x + Math.cos(m.heading) * 1.4, m.foot.z - Math.sin(m.heading) * 1.4);
        state = 'idle'; from = to = null;
      } else endRide(to);
    }
  };

  Object.defineProperty(route, 'riding', { get: () => state !== 'idle' });
  Object.defineProperty(route, 'state', { get: () => state });
  route.ready = () => true;
  /** Views: board at Sugar Pier and jump the blimp to k of the crossing (0.5 = mid-strait). */
  route.debugRide = function debugRide(k = 0.5, leg = 'mid') {
    planes.debugBlimp('candy', 0.3, true);
    planes.setHold(false);
    state = 'idle';
    route.board('candy', true);
    state = 'aboard'; st = 0; PB.holdLadder(null);
    planes.debugBlimp(leg, k, true);
    route.update(1 / 30);
    try { ctx.systems.camera?.snap?.(); } catch (err) { /* optional */ }
    ui()?.clear?.();
    return { x: seat.x, y: seat.y, z: seat.z, flying: !!ctx.state.flying };
  };
  /** Views: put the visitor on the ladder at `mast`, k up it (0 foot … 1 top). */
  route.debugClimb = function debugClimb(mast = 'candy', k = 0.5) {
    planes.debugBlimp(mast, 0.4, true);
    state = 'idle';
    route.board(mast, true);
    st = clamp(k, 0, 1) * CLIMB;
    route._freeze = true;
    route.update(1 / 30);
    ui()?.clear?.();
    return { state, k };
  };
  route.debugSign = (mast = 'candy') => { refreshBoard(mast, true); return boardText[mast]; };
  /** Views: get off whatever we were doing (a view run after a ride view). */
  route.debugReset = function debugReset() {
    route._freeze = false;
    if (state !== 'idle') { PB.holdLadder(null); ctx.state.flying = null; hushOn(false); rider.unmount(); state = 'idle'; from = to = null; route._aborted = false; }
    try { ui()?.clear?.(); } catch (err) { /* optional */ }
    return true;
  };
  return escape.register('blimp', route);
}
