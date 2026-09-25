// ─────────────────────────────────────────────────────────────────────────────
// SUGAR RUSH AIRFIELD — the banner biplane's fuel stop, and a lift to Cat
// Island if you can talk your way into the deckchair (WAVE 4 · Contract L)
//
// planes.js flies the biplane (planes.biplane): round the rim of the Candy
// Kingdom, and — by day only, on a timetable of two stops a day (approaches
// start ≈ 06:04 and ≈ 14:27), never while the lamps are lit — down onto this
// strip: touch down westbound, roll out, a tight turn onto the apron, engine
// off at the candy pump for 25 s (the banner lies out on the runway behind him,
// its tow rope dropping off the tail onto the ground), then off east.
//
// This file owns the ground and the deal:
//   THE PAD     ONE raised slab (planes.air.strip.pad — the smoothed upper
//               envelope of the RENDERED terrain mesh, so no ground ever pokes
//               through it): a mown candy-lawn runway (46 × 9) with peppermint
//               threshold bars, a dashed centre line and candy-cane cones on its
//               white edge bands; a sugar-cube apron on the beach side held to a
//               gentle fall, finished with a red-and-white candy KERB; a wafer
//               skirt all round where the slab stands proud of the ground. It is
//               a ctx.walkables deck (Contract A), so the visitor, the kids and
//               the taxiing plane all stand ON it.
//   THE FIELD   the CANDY PUMP (gumball globe on a red pedestal, lit while the
//               field is open, dark at night), a striped windsock, three
//               lollipop LAMPS (warm pools on the apron after dark; the one by
//               the bench does not work properly), a passengers' bench, the
//               DO NOT TOUCH THE BANNER sign (two posts; glows red after dark),
//               and the field board: NEXT PLANE 1:20 · REFUELLING — ASK THE
//               PILOT · FLIGHTS RESUME AT DAWN.
//   THE BENCH   after dark something sits on it. Hunched, dark, two pale eyes
//               that follow you. It is not there when you get close. It is
//               there again when you look back from the runway.
//   THE DEAL    while he refuels, E at the cockpit: three lines. He does not
//               fly TO Cat Island (nobody sane does); he will for a sweet (any
//               inventory candy, spent); and only if you promise never to touch
//               the banner. Then E again climbs you into the deckchair behind
//               him (the camera swings round behind the wing so you can see
//               yourself in it). He waits while you talk (planes.biplane.wait).
//               E anywhere round the pump or the cockpit reaches him; E in the
//               deckchair before take-off climbs back out (that press is spent).
//   THE FLIGHT  across the strait and down Wing Nut Field's take-off corridor
//               onto the grass; you step off; he turns round and goes home.
//               escape.start on boarding, escape.success('biplane', {to:'cat'})
//               on stepping off. Ground chatter is hushed in the air; the map
//               strip reads "Aboard the banner biplane".
//
// Colliders: the pump, the windsock pole, the board (a thin wall), the sign,
// the lamp posts, the bench (low: you can stand on it), and the parked biplane
// itself (fuselage + wings, solid only while it is stopped). The strip claims
// its ground: candy vegetation blanks what grows on it (claims read at
// world:ready), and the trunks it had there stop being walls.
// Route API: id · label · ready() · riding · talkStep · board() · debugTalk(step)
//            · debugRide(phase, k) · debugReset() · debugSitter(on) · strip
// Draw calls: strip (1: pad, props, lamps, signs — atlas-mapped) + windsock (1)
//             + the bench's night visitor (2, after dark only).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp, smoothstep } from '../../core/util.js';
import { createRider, vehicleBusy } from './ride.js';
import { buildPad } from '../planes.js';

const TAU = Math.PI * 2;
const PILOT = 'Captain Goggles';
const AT = 512;
const R = { board: [0, 0, 512, 200], small: [0, 216, 320, 104], pump: [336, 216, 176, 64], white: [480, 480, 32, 32] };
const FONT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';
const KERB_H = 0.24, KERB_W = 0.45;       // the apron's candy kerb
const POOL_R = 4.3;                        // lamp pool radius (u)

export function create(ctx, escape) {
  const planes = ctx.systems.planes;
  const BPa = planes?.biplane, STR = planes?.air?.strip;
  if (!BPa || !STR) {
    console.warn('[escape/biplane] planes.biplane missing — the biplane route is idle');
    return escape.register('biplane', { id: 'biplane', label: 'The banner biplane', ready: () => false, get riding() { return false; }, update() {} });
  }
  const { world } = ctx;
  ctx.colliders = ctx.colliders || [];
  ctx.walkables = ctx.walkables || [];
  const ui = () => ctx.systems.ui;
  const rider = createRider(ctx);
  const mine = new Set();          // our own colliders (never disarmed as 'trunks')
  const col = (c) => { ctx.colliders.push(c); mine.add(c); return c; };

  // strip frame (planes.air.strip): along = runway axis (east-ish), side + = north
  const SU = STR.along, SN = STR.north;
  const SP = (a, s) => [STR.x + SU.x * a + SN.x * s, STR.z + SU.z * a + SN.z * s];
  const AS = STR.apron ?? -1;                     // the apron's side of the runway (−1 = south)
  const YAW = Math.atan2(SU.x, SU.z);             // a mesh's +z pointing down the runway (east)
  const gH = (x, z) => world.height(x, z);
  // the pad: a = along, k = toward the apron (planes.js built it; rebuilt here if not)
  const PADD = STR.pad || buildPad(world, STR);
  const { hAK, insideAK, meshH, NA, NK, A0, K0, G } = PADD;
  const PH = PADD.H, APK = PADD.APK, APA = PADD.APA;
  const HALF_L = STR.len / 2, HALF_W = STR.wid / 2;
  const XA = (a, k) => PADD.toX(a, k), ZA = (a, k) => PADD.toZ(a, k);
  const KD = { x: SN.x * AS, z: SN.z * AS };      // unit vector toward the apron (k+)
  /** Where a prop stands: the pad, else the rendered ground. */
  const restH = (x, z) => { const p = PADD.at(x, z, 0.05); return p !== null ? p : Math.max(gH(x, z), meshH(x, z)); };
  /** The apron's candy kerb band (a, k inside the pad). */
  const kerbAt = (a, k) => k >= HALF_W - 0.01 && a <= APA + 0.01 && (a > APA - KERB_W || k > APK - KERB_W || a < -HALF_L + KERB_W);

  // ── atlas ──────────────────────────────────────────────────────────────────
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const gv = document.createElement('canvas'); gv.width = AT; gv.height = AT;
  const g = cv.getContext('2d'), e = gv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, AT, AT);
  e.fillStyle = '#000'; e.fillRect(0, 0, AT, AT);
  const mkTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tex = mkTex(cv), glow = mkTex(gv);
  const fit = (c2, txt, maxW, px) => { let s = px; for (; s > 10; s -= 2) { c2.font = `900 ${s}px ${FONT}`; if (c2.measureText(txt).width <= maxW) break; } return s; };
  g.textAlign = e.textAlign = 'center'; g.textBaseline = e.textBaseline = 'middle';
  // the small sign: DO NOT TOUCH THE BANNER — after dark the whole plate glows
  // ember red and the letters burn (emissive × uSign)
  {
    const [x, y, w, h] = R.small;
    g.fillStyle = '#fff6ea'; g.fillRect(x, y, w, h);
    g.fillStyle = '#e8263f'; g.fillRect(x, y, w, 12); g.fillRect(x, y + h - 12, w, 12);
    e.fillStyle = '#2c0406'; e.fillRect(x, y, w, h);
    e.fillStyle = '#ff2a1c'; e.fillRect(x, y, w, 12); e.fillRect(x, y + h - 12, w, 12);
    for (const [txt, ty] of [['DO NOT TOUCH', y + 36], ['THE BANNER', y + 70]]) {
      fit(g, txt, w - 36, 34); e.font = g.font;
      g.fillStyle = '#7a1024'; g.fillText(txt, x + w / 2, ty);
      e.fillStyle = '#ff3a22'; e.fillText(txt, x + w / 2, ty);
    }
  }
  // the pump's globe label: SUGAR 100 (G channel = the pump light)
  {
    const [x, y, w, h] = R.pump;
    g.fillStyle = '#ffe23a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#7a1024'; fit(g, 'SUGAR 100', w - 16, 36); g.fillText('SUGAR 100', x + w / 2, y + h / 2 + 2);
    e.fillStyle = '#00ff00'; e.fillRect(x, y, w, h);
  }
  let boardKey = '';
  function drawBoard(big, small, night) {
    const [x, y, w, h] = R.board;
    g.fillStyle = '#5a3220'; g.fillRect(x, y, w, h);
    g.fillStyle = night ? '#241832' : '#f6fff4'; g.beginPath(); g.roundRect(x + 10, y + 10, w - 20, h - 20, 14); g.fill();
    g.save(); g.beginPath(); g.roundRect(x + 10, y + 10, w - 20, 56, [14, 14, 0, 0]); g.clip();
    for (let i = -2; i < 24; i++) { g.fillStyle = i % 2 ? '#3fbf6a' : '#e9fff0'; g.beginPath(); g.moveTo(x + i * 26, y + 66); g.lineTo(x + i * 26 + 26, y + 66); g.lineTo(x + i * 26 + 60, y + 10); g.lineTo(x + i * 26 + 34, y + 10); g.fill(); }
    g.restore();
    e.fillStyle = '#000'; e.fillRect(x, y, w, h);
    const head = 'SUGAR RUSH AIRFIELD';
    fit(g, head, w - 60, 34); e.font = g.font;
    g.lineWidth = 6; g.strokeStyle = '#fff6ea'; g.strokeText(head, x + w / 2, y + 39);
    g.fillStyle = '#1f5a34'; g.fillText(head, x + w / 2, y + 39);
    e.fillStyle = '#301800'; e.fillText(head, x + w / 2, y + 39);
    fit(g, big, w - 50, 58); e.font = g.font;
    g.fillStyle = night ? '#ffd27a' : '#2a1640'; g.fillText(big, x + w / 2, y + 112);
    e.fillStyle = '#ffc040'; e.fillText(big, x + w / 2, y + 112);
    fit(g, small, w - 70, 24); e.font = g.font;
    g.fillStyle = night ? '#ff7a8a' : '#5a6a5a'; g.fillText(small, x + w / 2, y + 162);
    e.fillStyle = night ? '#ff4050' : '#000'; e.fillText(small, x + w / 2, y + 162);
  }
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function boardFor() {
    const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
    const ph = BPa.phase;
    if (ph === 'refuel') return ['REFUELLING · ' + fmt(BPa.refuelLeft), 'talk to the pilot · he likes sweets', night];
    if (ph === 'approach') return ['LANDING NOW', 'stand clear of the runway', night];
    if (ph === 'ferry' || ph === 'dropoff' || ph === 'home') return ['ON A CHARTER', 'back on the loop soon', night];
    const eta = BPa.eta();
    if (!Number.isFinite(eta) || night) return ['FLIGHTS RESUME AT DAWN', night ? 'if you do' : 'last landing has gone', night];
    return ['NEXT PLANE ' + fmt(eta), 'fuel stop · 25 s · lifts by arrangement', night];
  }
  function refreshBoard(force = false) {
    const [big, small, night] = boardFor();
    const key = big + '|' + small + '|' + night;
    if (!force && key === boardKey) return;
    boardKey = key;
    drawBoard(big, small, night);
    tex.needsUpdate = true; glow.needsUpdate = true;
  }

  // ── the field's lamps (placed first: every vertex learns its lamp light) ────
  // Three lollipop lamps. After dark each lays a warm pool on the pad (a
  // per-vertex term, no real lights); the one by the bench flickers, and
  // flickers worse while the bench is taken.
  const LAMPS = [
    { a: -HALF_L + 0.85, k: APK - 0.95, flick: 1 },    // by the bench
    { a: APA - 0.95, k: APK - 0.95, flick: 0 },        // the apron's far corner
    { a: -HALF_L - 1.7, k: -HALF_W - 0.4, flick: 0 },  // off the west end, by the board
  ];
  for (const L of LAMPS) { L.x = XA(L.a, L.k); L.z = ZA(L.a, L.k); L.y = restH(L.x, L.z); }

  // ── geometry kit (merged, vertex colour + atlas uv + lamp glow; world space) ─
  const uvOf = (rect, u, v) => [(rect[0] + u * rect[2]) / AT, 1 - (rect[1] + (1 - v) * rect[3]) / AT];
  const WHITE_UV = uvOf(R.white, 0.5, 0.5);
  const _c = new THREE.Color(), _d = new THREE.Color();
  const P = [], N = [], C = [], U = [], GW = [];
  let head = 0;                    // lamp-head glow of what is being added (1 steady, 2 flickering)
  function vtx(x, y, z, nx, ny, nz, r, gg, b, u, v) {
    P.push(x, y, z); N.push(nx, ny, nz); C.push(r, gg, b); U.push(u, v);
    let ps = 0, pf = 0;
    for (let i = 0; i < LAMPS.length; i++) {
      const L = LAMPS[i], dx = x - L.x, dz = z - L.z;
      const q = Math.exp(-(dx * dx + dz * dz) / (POOL_R * POOL_R)) * clamp(1.5 - (y - L.y) / 3, 0, 1);
      if (L.flick) pf += q; else ps += q;
    }
    GW.push(head, Math.min(1, ps), Math.min(1, pf));
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  function add(geo, m, color, uvRect = null) {
    const gg = geo.index ? geo.toNonIndexed() : geo;
    const uvs = uvRect ? gg.attributes.uv?.array : null;
    if (m) gg.applyMatrix4(m);
    const p = gg.attributes.position.array, n = gg.attributes.normal.array;
    const fn = typeof color === 'function' ? color : null;
    if (!fn) _c.setHex(color);
    for (let i = 0; i < p.length; i += 9) {
      if (fn) _c.setHex(fn((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3));
      for (let j = 0; j < 3; j++) {
        const q = i + j * 3;
        let u = WHITE_UV[0], v = WHITE_UV[1];
        if (uvs) { const uv = uvOf(uvRect, uvs[(i / 3 + j) * 2], uvs[(i / 3 + j) * 2 + 1]); u = uv[0]; v = uv[1]; }
        vtx(p[q], p[q + 1], p[q + 2], n[q], n[q + 1], n[q + 2], _c.r, _c.g, _c.b, u, v);
      }
    }
    geo.dispose(); if (gg !== geo) gg.dispose();
  }
  /** One flat triangle; ca/cb/cc = hex per corner. `face` = the direction its
   *  normal must point along ([x,y,z]); the winding is flipped to match. */
  function tri3(a, b, c, ca, cb, cc, face) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * face[0] + ny * face[1] + nz * face[2] < 0) { const t = b; b = c; c = t; const tc = cb; cb = cc; cc = tc; nx = -nx; ny = -ny; nz = -nz; }
    for (const [q, h] of [[a, ca], [b, cb], [c, cc]]) { _d.setHex(h); vtx(q[0], q[1], q[2], nx, ny, nz, _d.r, _d.g, _d.b, WHITE_UV[0], WHITE_UV[1]); }
  }
  const UPV = [0, 1, 0];
  const triUp = (a, b, c, hex) => tri3(a, b, c, hex, hex, hex, UPV);
  function quad(cx, cy, cz, rx, ry, rz, ux, uy, uz, rect) {
    const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux, nl = Math.hypot(nx, ny, nz) || 1;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      const uv = uvOf(rect, (su + 1) / 2, (sv + 1) / 2);
      vtx(cx + rx * su + ux * sv, cy + ry * su + uy * sv, cz + rz * su + uz * sv, nx / nl, ny / nl, nz / nl, 1, 1, 1, uv[0], uv[1]);
    }
  }

  // ── THE PAD: lawn runway + sugar-cube apron, one slab on the 1 u pad grid ────
  const LAWN_A = 0x7fd873, LAWN_B = 0x6cc764, EDGE = 0xe8fff0, BAR = 0xe8263f, DASH = 0xfff6ea;
  const TILE_A = 0xfdf3e3, TILE_B = 0xf2e2c8, GROUT = 0xd9c2a0, SK_TOP = 0xf0d9b8, SK_BOT = 0x9c7654;
  const PV = (i, j) => [XA(A0 + i * G, K0 + j * G), PH[i * NK + j], ZA(A0 + i * G, K0 + j * G)];
  const PT = (a, k, dy = 0) => [XA(a, k), hAK(a, k) + dy, ZA(a, k)];
  for (let i = 0; i < NA - 1; i++) for (let j = 0; j < NK - 1; j++) {
    const ac = A0 + (i + 0.5) * G, kc = K0 + (j + 0.5) * G;
    if (!insideAK(ac, kc)) continue;
    let hex;
    if (kc < HALF_W) hex = Math.abs(kc) > HALF_W - 1 ? EDGE : (Math.floor((ac + HALF_L) / 4) % 2 ? LAWN_A : LAWN_B);
    else hex = ((Math.floor((ac + HALF_L) / 2) + Math.floor((kc - HALF_W) / 2)) % 2) ? TILE_A : TILE_B;
    const p00 = PV(i, j), p10 = PV(i + 1, j), p01 = PV(i, j + 1), p11 = PV(i + 1, j + 1);
    triUp(p00, p10, p01, hex); triUp(p10, p11, p01, hex);          // the pad's own split (hAK agrees)
  }
  /** A painted stripe (a0,k0)→(a1,k1), `w` wide, `dy` over the pad, cut at the grid. */
  function stripe(a0, k0, a1, k1, w, dy, hex) {
    const L = Math.hypot(a1 - a0, k1 - k0), n = Math.max(1, Math.ceil(L / 0.5));
    const pa = -(k1 - k0) / L * w / 2, pk = (a1 - a0) / L * w / 2;
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      const A = a0 + (a1 - a0) * t0, KA = k0 + (k1 - k0) * t0, B = a0 + (a1 - a0) * t1, KB = k0 + (k1 - k0) * t1;
      const q0 = PT(A + pa, KA + pk, dy), q1 = PT(B + pa, KB + pk, dy), q2 = PT(B - pa, KB - pk, dy), q3 = PT(A - pa, KA - pk, dy);
      triUp(q0, q1, q2, hex); triUp(q0, q2, q3, hex);
    }
  }
  // threshold bars ("piano keys") at both ends, a dashed centre line, apron grout
  for (const end of [-1, 1]) for (let n = -3; n <= 3; n++) { const a0 = end * (HALF_L - 3.2); stripe(a0 - 1.1, n * 1.05, a0 + 1.1, n * 1.05, 0.7, 0.04, BAR); }
  for (let a = -HALF_L + 7; a < HALF_L - 7; a += 4.2) stripe(a, 0, a + 2.2, 0, 0.36, 0.04, DASH);
  for (let a = -HALF_L + 2; a < APA - 0.5; a += 2) stripe(a, HALF_W + 0.02, a, APK - KERB_W, 0.07, 0.025, GROUT);
  for (let k = HALF_W + 2; k < APK - KERB_W - 0.5; k += 2) stripe(-HALF_L + KERB_W, k, APA - KERB_W, k, 0.07, 0.025, GROUT);
  // the skirt: all round the slab, from its lip down past the ground (darker
  // toward the foot, so it sits in the grass instead of floating on it); the
  // apron's three open sides carry the candy kerb on top
  {
    const OUT = [[-HALF_L, -HALF_W], [HALF_L, -HALF_W], [HALF_L, HALF_W], [APA, HALF_W], [APA, APK], [-HALF_L, APK], [-HALF_L, HALF_W], [-HALF_L, -HALF_W]];
    for (let ei = 0; ei < OUT.length - 1; ei++) {
      const [a0, k0] = OUT[ei], [a1, k1] = OUT[ei + 1];
      const L = Math.hypot(a1 - a0, k1 - k0), n = Math.round(L / 0.5);
      const da = (a1 - a0) / L, dk = (k1 - k0) / L, oa = dk, ok = -da;            // outward, in (a, k)
      const ox = oa * SU.x + ok * KD.x, oz = oa * SU.z + ok * KD.z, OUTV = [ox, 0, oz], INV = [-ox, 0, -oz];
      const kerb = ei >= 3 && ei <= 5;
      const at = (t) => [a0 + (a1 - a0) * t, k0 + (k1 - k0) * t];
      const top = (t) => { const [a, k] = at(t); return PT(a, k, kerb ? KERB_H : 0); };
      const bot = (t) => {
        const [a, k] = at(t), x = XA(a, k), z = ZA(a, k);
        return [x, Math.min(meshH(x, z), meshH(x + ox * 0.8, z + oz * 0.8), gH(x, z)) - 0.35, z];
      };
      for (let s = 0; s < n; s++) {
        const A = top(s / n), B = top((s + 1) / n), Cc = bot((s + 1) / n), D = bot(s / n);
        tri3(A, B, Cc, SK_TOP, SK_TOP, SK_BOT, OUTV); tri3(A, Cc, D, SK_TOP, SK_BOT, SK_BOT, OUTV);
      }
      if (!kerb) continue;
      // the kerb: 1 u blocks, red / white, KERB_W deep, KERB_H proud of the apron
      const nk = Math.round(L);
      for (let s = 0; s < nk; s++) {
        const [pa0, pk0] = at(s / nk), [pa1, pk1] = at((s + 1) / nk);
        const hex = s % 2 ? 0xfff6ea : BAR, dark = s % 2 ? 0xd8c8b8 : 0xa81830;
        const o0 = PT(pa0, pk0, KERB_H), o1 = PT(pa1, pk1, KERB_H);
        const i0 = PT(pa0 - oa * KERB_W, pk0 - ok * KERB_W, KERB_H), i1 = PT(pa1 - oa * KERB_W, pk1 - ok * KERB_W, KERB_H);
        triUp(o0, o1, i1, hex); triUp(o0, i1, i0, hex);
        const i0b = PT(pa0 - oa * KERB_W, pk0 - ok * KERB_W, -0.03), i1b = PT(pa1 - oa * KERB_W, pk1 - ok * KERB_W, -0.03);
        tri3(i0, i1, i1b, hex, hex, dark, INV); tri3(i0, i1b, i0b, hex, dark, dark, INV);
      }
      // end caps where the kerb meets the runway edge
      for (const [t, sgn] of [[0, -1], [1, 1]]) {
        const [pa, pk] = at(t);
        if (!(Math.abs(pk - HALF_W) < 1e-6)) continue;
        const f = [sgn * (da * SU.x + dk * KD.x), 0, sgn * (da * SU.z + dk * KD.z)];
        const o = PT(pa, pk, KERB_H), ob = PT(pa, pk, -0.03), ii = PT(pa - oa * KERB_W, pk - ok * KERB_W, KERB_H), ib = PT(pa - oa * KERB_W, pk - ok * KERB_W, -0.03);
        tri3(o, ii, ib, BAR, BAR, 0xa81830, f); tri3(o, ib, ob, BAR, 0xa81830, 0xa81830, f);
      }
    }
  }
  // candy-cane cones on the white edge bands every 6 u (the apron edge stays open)
  for (let a = -HALF_L + 1; a <= HALF_L - 1; a += 6) for (const k of [-(HALF_W - 0.45), HALF_W - 0.45]) {
    if (k > 0 && a < APA + 0.6) continue;
    const [x, y, z] = PT(a, k);
    add(new THREE.ConeGeometry(0.34, 0.9, 8, 2), M4(x, y + 0.45, z), (px, py) => ((Math.floor((py - y) * 4.2) % 2) ? BAR : 0xffffff));
  }

  // ── the candy pump ─────────────────────────────────────────────────────────
  const pump = BPa.pump;
  const pumpY = restH(pump.x, pump.z);
  {
    const x = pump.x, z = pump.z, y = pumpY;
    const face = Math.atan2(BPa.park.x - x, BPa.park.z - z);         // front faces the parked plane
    add(new THREE.CylinderGeometry(1.1, 1.2, 0.3, 12), M4(x, y + 0.1, z), 0xf2e2c8);
    add(new THREE.BoxGeometry(1.25, 1.55, 0.95), M4(x, y + 1.0, z, 0, face, 0), 0xe8263f);
    add(new THREE.BoxGeometry(1.35, 0.14, 1.05), M4(x, y + 1.8, z, 0, face, 0), 0xffc93a);
    // gauge face + needle on the front
    const fx = Math.sin(face), fz = Math.cos(face);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16), M4(x + fx * 0.49, y + 1.25, z + fz * 0.49, Math.PI / 2, face, 0), 0xfff6ea);
    add(new THREE.BoxGeometry(0.05, 0.28, 0.04), M4(x + fx * 0.53, y + 1.3, z + fz * 0.53, 0, face, -0.6), 0x1a1218);
    // the gumball globe (label band glows while the field is open)
    add(new THREE.SphereGeometry(0.82, 16, 12), M4(x, y + 2.55, z), 0xffe9f4);
    const cols = [0xff3355, 0x3aa8ff, 0x5be27a, 0xffe23a, 0xb35bff, 0xff8c1a];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, el = -0.5 + (i % 5) * 0.28, rr = 0.8;
      add(new THREE.SphereGeometry(0.2, 8, 6), M4(x + Math.cos(a) * Math.cos(el) * rr, y + 2.55 + Math.sin(el) * rr, z + Math.sin(a) * Math.cos(el) * rr), cols[i % cols.length]);
    }
    add(new THREE.CylinderGeometry(0.4, 0.55, 0.3, 12), M4(x, y + 3.38, z), 0xe8263f);
    add(new THREE.SphereGeometry(0.22, 10, 8), M4(x, y + 3.6, z), 0xffc93a);
    const band = new THREE.CylinderGeometry(0.86, 0.86, 0.34, 20, 1, true);
    add(band, M4(x, y + 1.99, z, 0, face, 0), 0xffffff, R.pump);
    // hose holster on the side facing the plane
    add(new THREE.TorusGeometry(0.2, 0.07, 6, 10), M4(pump.nozzle.x, pump.nozzle.y - 0.1, pump.nozzle.z, 0, face, 0), 0x3fbf6a);
    col({ x, z, r: 1.05 });
  }
  // ── windsock pole (the sock is its own mesh, it moves) ─────────────────────
  const sockAt = SP(HALF_L - 4, (HALF_W + 3.2) * AS);
  const sockY = restH(sockAt[0], sockAt[1]);
  add(new THREE.CylinderGeometry(0.11, 0.15, 5.2, 8, 5), M4(sockAt[0], sockY + 2.6, sockAt[1]), (x, y) => ((Math.floor((y - sockY) * 1.2) % 2) ? 0xe8263f : 0xffffff));
  add(new THREE.TorusGeometry(0.42, 0.06, 6, 14), M4(sockAt[0], sockY + 5.0, sockAt[1], Math.PI / 2, 0, 0), 0xffc93a);
  col({ x: sockAt[0], z: sockAt[1], r: 0.35 });

  // ── the field board ────────────────────────────────────────────────────────
  // it stands off the runway's west end, facing up the path from the village
  const boardAt = SP(-HALF_L - 3.2, 1.5), boardFace = YAW + Math.PI + 0.55;
  {
    const [bx, bz] = boardAt, by = restH(bx, bz);
    const rx = Math.cos(boardFace), rz = -Math.sin(boardFace), nx = Math.sin(boardFace), nz = Math.cos(boardFace);
    const hw = 1.9, hh = 0.74, cy = by + 2.05;
    add(new THREE.BoxGeometry(hw * 2 + 0.3, hh * 2 + 0.3, 0.16), M4(bx, cy, bz, 0, boardFace, 0), 0x5a3220);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.1, 0.12, cy + 0.6 - by, 8, 3), M4(bx + rx * s * (hw + 0.05), (cy + 0.6 + by) / 2, bz + rz * s * (hw + 0.05)), (x, y) => ((Math.floor(y * 3 + 40) % 2) ? 0x3fbf6a : 0xffffff));
      add(new THREE.SphereGeometry(0.18, 8, 6), M4(bx + rx * s * (hw + 0.05), cy + 0.66, bz + rz * s * (hw + 0.05)), 0xffc93a);
    }
    quad(bx + nx * 0.09, cy, bz + nz * 0.09, rx * hw, 0, rz * hw, 0, hh, 0, R.board);
    quad(bx - nx * 0.09, cy, bz - nz * 0.09, -rx * hw, 0, -rz * hw, 0, hh, 0, R.board);
    // no h: always SOLID (Contract A); collider rot = −(mesh yaw) (ground.js's box frame)
    col({ x: bx, z: bz, w: hw * 2 + 0.4, d: 0.4, rot: -boardFace, box: true });
  }
  // ── DO NOT TOUCH THE BANNER: a plate between TWO posts (the old single post
  // ran straight through the lettering), at the apron's runway corner, turned
  // toward where the banner lies; after dark it glows ember red ──────────────
  const noteA = APA - 2.1, noteK = HALF_W + 1.6;
  const noteAt = [XA(noteA, noteK), ZA(noteA, noteK)];
  const noteFace = Math.atan2(-KD.x * 0.86 - SU.x * 0.5, -KD.z * 0.86 - SU.z * 0.5);
  {
    const [bx, bz] = noteAt, by = restH(bx, bz);
    const rx = Math.cos(noteFace), rz = -Math.sin(noteFace), nx = Math.sin(noteFace), nz = Math.cos(noteFace);
    const hw = 1.05, hh = 0.34, cy = by + 1.3;
    add(new THREE.BoxGeometry(hw * 2 + 0.14, hh * 2 + 0.14, 0.1), M4(bx, cy, bz, 0, noteFace, 0), 0x5a3220);
    quad(bx + nx * 0.056, cy, bz + nz * 0.056, rx * hw, 0, rz * hw, 0, hh, 0, R.small);
    quad(bx - nx * 0.056, cy, bz - nz * 0.056, -rx * hw, 0, -rz * hw, 0, hh, 0, R.small);
    for (const s of [-1, 1]) {
      const px = bx + rx * s * (hw + 0.13), pz = bz + rz * s * (hw + 0.13), top = cy + hh + 0.12;
      add(new THREE.CylinderGeometry(0.075, 0.09, top - by, 6), M4(px, (top + by) / 2, pz), 0x5a3220);
      add(new THREE.SphereGeometry(0.11, 8, 6), M4(px, top + 0.04, pz), 0xe8263f);
    }
    col({ x: bx, z: bz, w: hw * 2 + 0.45, d: 0.3, rot: -noteFace, box: true });
  }
  // ── the passengers' bench: on the apron by the kerb, facing the runway ─────
  const benchA = -HALF_L + 3.6, benchK = APK - 1.35;
  const benchAt = [XA(benchA, benchK), ZA(benchA, benchK)];
  const benchY = restH(benchAt[0], benchAt[1]);
  {
    const [bx, bz] = benchAt, by = benchY;
    add(new THREE.BoxGeometry(2.4, 0.16, 0.7), M4(bx, by + 0.5, bz, 0, YAW + Math.PI / 2, 0), 0xf2a0c0);
    add(new THREE.BoxGeometry(2.4, 0.5, 0.12), M4(bx + KD.x * 0.34, by + 0.85, bz + KD.z * 0.34, 0, YAW + Math.PI / 2, 0), 0xe8263f);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.5, 0.6), M4(bx + SU.x * s * 1.05, by + 0.25, bz + SU.z * s * 1.05, 0, YAW + Math.PI / 2, 0), 0x5a3220);
    col({ x: bx, z: bz, w: 2.4, d: 0.8, rot: -(YAW + Math.PI / 2), h: 0.58, box: true });
  }
  // ── the lollipop lamps ─────────────────────────────────────────────────────
  for (const L of LAMPS) {
    const y = L.y;
    add(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 10), M4(L.x, y + 0.1, L.z), 0x5a3220);
    add(new THREE.CylinderGeometry(0.1, 0.13, 3.7, 8, 9), M4(L.x, y + 1.95, L.z), (px, py) => ((Math.floor((py - y) * 2.4) % 2) ? BAR : 0xffffff));
    add(new THREE.TorusGeometry(0.2, 0.06, 6, 12), M4(L.x, y + 3.78, L.z, Math.PI / 2, 0, 0), 0xffc93a);
    head = L.flick ? 2 : 1;
    add(new THREE.SphereGeometry(0.46, 14, 10), M4(L.x, y + 4.22, L.z), 0xffefc4);
    head = 0;
    add(new THREE.ConeGeometry(0.3, 0.34, 10), M4(L.x, y + 4.76, L.z), BAR);
    col({ x: L.x, z: L.z, r: 0.3 });
  }

  // ── build: one mesh ─────────────────────────────────────────────────────────
  // Night (uNight = the street-lamp mix): the slab's albedo drops to ~40% so
  // the field is dark ground under the lamps; the lamp heads burn and lay warm
  // pools (vGlow.yz); the bench lamp's pool and head follow uFlick.
  const uSign = { value: 0 }, uPump = { value: 1 }, uNight = { value: 0 }, uFlick = { value: 1 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, emissiveMap: glow, emissive: 0xffffff, roughness: 0.7, metalness: 0 });
  // the pad hugs the ground within a hand's breadth: win every depth tie with it
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSign = uSign; sh.uniforms.uPump = uPump; sh.uniforms.uNight = uNight; sh.uniforms.uFlick = uFlick;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSign;\nuniform float uPump;\nuniform float uNight;\nuniform float uFlick;\nvarying vec3 vGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.2, uNight);')
      .replace('#include <emissivemap_fragment>', [
        '#ifdef USE_EMISSIVEMAP',
        'vec4 eCol = texture2D( emissiveMap, vEmissiveMapUv );',
        'totalEmissiveRadiance = eCol.rgb * uSign * (1.0 - step(0.9, eCol.g) * step(eCol.r, 0.1)) + vec3(1.0, 0.72, 0.35) * step(0.9, eCol.g) * step(eCol.r, 0.1) * uPump;',
        '#endif',
        'float headK = min(vGlow.x, 1.0) * mix(1.0, uFlick, step(1.5, vGlow.x));',
        'totalEmissiveRadiance += vec3(1.0, 0.6, 0.26) * headK * 5.0 * uNight;',
        'totalEmissiveRadiance += vColor.rgb * vec3(1.0, 0.58, 0.26) * (vGlow.y + vGlow.z * uFlick) * uNight * 1.8;',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'air_strip_v2';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(GW, 3));
  geo.computeBoundingSphere();
  const strip = new THREE.Mesh(geo, mat);
  strip.name = 'air_strip';
  strip.receiveShadow = true; strip.castShadow = false;
  ctx.scene.add(strip);

  // ── the windsock: a striped tapered tube that swings downwind and ripples ───
  const sockGeo = new THREE.CylinderGeometry(0.16, 0.38, 2.4, 10, 6, true);
  sockGeo.rotateX(Math.PI / 2); sockGeo.translate(0, 0, 1.2);
  {
    const p = sockGeo.attributes.position, cl = [];
    for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); _c.setHex(Math.floor(zz / 0.48) % 2 ? 0xffffff : 0xff6a1a); cl.push(_c.r, _c.g, _c.b); }
    sockGeo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  }
  const sockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
  const sock = new THREE.Mesh(sockGeo, sockMat);
  sock.name = 'air_windsock'; sock.castShadow = true;
  sock.position.set(sockAt[0], sockY + 5.0, sockAt[1]);
  ctx.scene.add(sock);

  // ── the bench's night visitor ──────────────────────────────────────────────
  // A hunched thing, darker than the dark, rim-lit by the bench lamp, with two
  // pale eyes that turn to follow you. It is gone when you get within 7.5 u
  // and back once you are 21 u away. Never by day. (2 draw calls, night only.)
  const sitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const uEyes = { value: 0 };
  sitMat.onBeforeCompile = (sh) => {
    sh.uniforms.uEyes = uEyes;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEm;\nvarying float vEm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEyes;\nvarying float vEm;')
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);',
        'totalEmissiveRadiance += vec3(1.0, 0.58, 0.28) * rimK * 0.42 * uEyes * (1.0 - vEm);',
        'totalEmissiveRadiance += vColor.rgb * vEm * uEyes * 3.2;',
      ].join('\n'));
  };
  sitMat.customProgramCacheKey = () => 'air_sitter_v1';
  function merge(parts) {
    const Pp = [], Nn = [], Cc = [], Ee = [];
    for (const [pg, m, hex, em] of parts) {
      const gg = pg.index ? pg.toNonIndexed() : pg; if (m) gg.applyMatrix4(m);
      _c.setHex(hex);
      const p = gg.attributes.position.array, n = gg.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) { Pp.push(p[i], p[i + 1], p[i + 2]); Nn.push(n[i], n[i + 1], n[i + 2]); Cc.push(_c.r, _c.g, _c.b); Ee.push(em || 0); }
      pg.dispose(); if (gg !== pg) gg.dispose();
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    bg.setAttribute('aEm', new THREE.Float32BufferAttribute(Ee, 1));
    bg.computeBoundingSphere();
    return bg;
  }
  const _q = new THREE.Quaternion(), _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  /** a limb from a to b (local), radii r0 → r1 */
  const limb = (a, b, r0, r1) => {
    _v0.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _v0.length(); _v0.normalize();
    _q.setFromUnitVectors(_v1.set(0, 1, 0), _v0);
    return [new THREE.CylinderGeometry(r1, r0, L, 7), new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q.clone(), _one)];
  };
  const DARK = 0x1c1022, EYE = 0xe6ff86;
  const body = [
    [new THREE.SphereGeometry(0.42, 10, 8), M4(0, 0.46, -0.06, 0.42, 0, 0, 1.05, 1.2, 0.9), DARK],
    [new THREE.SphereGeometry(0.34, 9, 7), M4(0, 0.86, 0.04, 0, 0, 0, 1.25, 0.85, 1), DARK],
    ...[-1, 1].flatMap((s) => [
      [new THREE.BoxGeometry(0.24, 0.22, 0.56), M4(s * 0.17, 0.09, 0.26), DARK],
      [new THREE.BoxGeometry(0.2, 0.56, 0.2), M4(s * 0.17, -0.28, 0.52), DARK],
      [new THREE.BoxGeometry(0.22, 0.1, 0.32), M4(s * 0.17, -0.54, 0.6), DARK],
      [...limb([s * 0.37, 0.86, 0.1], [s * 0.21, 0.02, 0.64], 0.1, 0.075), DARK],
      [new THREE.SphereGeometry(0.11, 7, 5), M4(s * 0.21, 0.0, 0.66), DARK],
    ]),
  ];
  const headParts = [
    [new THREE.SphereGeometry(0.3, 10, 8), M4(0, 0.02, 0.16, 0, 0, 0, 1, 0.92, 1.05), DARK],
    [new THREE.SphereGeometry(0.15, 8, 6), M4(0, -0.07, 0.42, 0, 0, 0, 1, 0.8, 1.1), DARK],
    ...[-1, 1].flatMap((s) => [
      [new THREE.SphereGeometry(0.12, 7, 5), M4(s * 0.21, 0.26, 0.08), DARK],
      [new THREE.SphereGeometry(0.058, 8, 6), M4(s * 0.11, 0.08, 0.42), EYE, 1],
    ]),
  ];
  const sitBody = new THREE.Mesh(merge(body), sitMat), sitHead = new THREE.Mesh(merge(headParts), sitMat);
  sitBody.name = 'air_bench_visitor'; sitHead.name = 'air_bench_visitor_head';
  const sitYaw = Math.atan2(-KD.x, -KD.z);                  // facing the runway
  const sitX = benchAt[0] - KD.x * 0.05, sitZ = benchAt[1] - KD.z * 0.05, sitY = benchY + 0.58;
  sitBody.position.set(sitX, sitY, sitZ); sitBody.rotation.set(0, sitYaw, 0, 'YXZ');
  sitHead.position.set(sitX + Math.sin(sitYaw) * 0.2, sitY + 0.96, sitZ + Math.cos(sitYaw) * 0.2);
  sitHead.rotation.order = 'YXZ';
  for (const m of [sitBody, sitHead]) { m.castShadow = true; m.receiveShadow = false; m.visible = false; m.userData.noOcclude = true; ctx.scene.add(m); }
  let sitGone = false, sitForce = -1, sitOn = false, headYaw = 0, flickT = 0;
  const wrapPi = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  function updateSitter(dt, lamp) {
    const p = ctx.systems.player?.position;
    const night = lamp > 0.55;
    const d = p ? Math.hypot(p.x - sitX, p.z - sitZ) : 99;
    if (!night) sitGone = false;
    else if (d < 7.5) sitGone = true;           // it is not there when you get close…
    else if (d > 21) sitGone = false;           // …and it is back when you look again
    sitOn = sitForce === 1 || (sitForce !== 0 && night && !sitGone && d < 150);
    sitBody.visible = sitHead.visible = sitOn;
    uEyes.value = sitOn ? (sitForce === 1 ? 1 : clamp((lamp - 0.55) / 0.3, 0, 1)) : 0;
    if (!sitOn) return;
    let want = 0;
    if (p) want = clamp(wrapPi(Math.atan2(p.x - sitX, p.z - sitZ) - sitYaw), -1.25, 1.25);
    headYaw += (want - headYaw) * Math.min(1, dt * 1.4);
    sitHead.rotation.set(0.28 - 0.3 * smoothstep(21, 9, d), sitYaw + headYaw, 0.1 * Math.sin(flickT * 0.7), 'YXZ');
  }

  // ── clearing the ground: claims for candy vegetation, then retire them ─────
  const claims = [];
  for (let a = -HALF_L - 2; a <= HALF_L + 2; a += 3) for (let s0 = -HALF_W - 1.5; s0 <= 13.5; s0 += 3) {
    if (s0 > HALF_W + 1 && a > 2) continue;                      // beyond the runway only at the apron end
    const [x, z] = SP(a, s0 * AS);                               // s0 > 0 = the apron side
    const c = { x, z, r: 3.1, solid: false, claim: 'air_strip' };
    ctx.colliders.push(c); claims.push(c);
  }
  const _ak = { a: 0, k: 0 };
  const inStrip = (x, z, pad = 0) => { PADD.toAK(x, z, _ak); return insideAK(_ak.a, _ak.k, 1.2 + pad); };
  ctx.events.on('world:ready', () => {
    for (const c of claims) { c.r = 0; c.x = 1e6; }
    // the trunks of whatever was blanked here must not stay behind as walls
    let n = 0;
    for (const c of ctx.colliders) {
      if (!c || c.box || c.solid === false || mine.has(c) || !(c.r > 0) || c.r > 1.6) continue;
      if (inStrip(c.x, c.z)) { c.solid = false; n++; }
    }
    if (n) console.warn('[escape/biplane] airstrip: disarmed ' + n + ' trunk colliders under the runway');
    try { ui()?.addMapMarker?.({ id: 'airstrip', x: STR.x, z: STR.z, glyph: 'plane', label: 'Sugar Rush Airfield · biplane fuel stop' }); } catch (err) { /* optional */ }
    // belt and braces: the rendered terrain must never show through the pad
    const T = ctx.systems.terrain?.ground?.candy;
    if (T?.geometry?.attributes?.position) {
      const pa = T.geometry.attributes.position, V = Math.round(Math.sqrt(pa.count));
      const x0 = pa.getX(0), z0 = pa.getZ(0), st = pa.getX(1) - x0;
      let bad = 0;
      for (let a = -HALF_L; a <= HALF_L; a += 0.5) for (let k = -HALF_W; k <= APK; k += 0.5) {
        if (!insideAK(a, k)) continue;
        const x = XA(a, k), z = ZA(a, k), fi = (x - x0) / st, fj = (z - z0) / st, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
        if (i < 0 || j < 0 || i >= V - 1 || j >= V - 1) continue;
        const h = (ii, jj) => pa.getY(jj * V + ii);
        const m = u + v <= 1 ? h(i, j) + (h(i + 1, j) - h(i, j)) * u + (h(i, j + 1) - h(i, j)) * v
          : h(i + 1, j + 1) + (h(i, j + 1) - h(i + 1, j + 1)) * (1 - u) + (h(i + 1, j) - h(i + 1, j + 1)) * (1 - v);
        if (m > hAK(a, k) - 0.02) bad++;
      }
      if (bad) console.warn('[escape/biplane] airstrip pad: the terrain mesh reaches the pad at ' + bad + ' samples (terrain grid changed?)');
    }
  });
  // the pad is a deck (Contract A): the visitor, the kids and the plane stand ON it
  ctx.walkables.push({
    id: 'airstrip_pad', air: true,
    test(x, z) {
      const dx = x - STR.x, dz = z - STR.z;
      if (dx * dx + dz * dz > 900) return null;                  // the pad lies within 26 u of the strip centre
      PADD.toAK(x, z, _ak);
      if (!insideAK(_ak.a, _ak.k, 0.05)) return null;
      const h = hAK(_ak.a, _ak.k);
      return kerbAt(_ak.a, _ak.k) ? h + KERB_H : h;
    },
  });

  // ── the parked plane is solid (fuselage + wings) while it stands still ──────
  // No `h`: Contract A reads h > 1.6 as a legacy ABSOLUTE top (the apron is at
  // y ≈ 4, so h 2.6 made the plane a ghost). Without h the boxes are always
  // SOLID; `solid` (read live) switches them. They start OFF at the pump stand,
  // not parked at x = 1e6: the ground core bins them there on its first build,
  // so going solid at the pump costs no re-bin (Wing Nut Field's stop moves
  // them once; the rolling validator re-bins that within ~20 frames).
  const PK = BPa.park, PKf = { x: Math.sin(PK.heading), z: Math.cos(PK.heading) };
  const planeCols = [
    { x: PK.x - PKf.x * 0.3, z: PK.z - PKf.z * 0.3, w: 1.5, d: 5.4, rot: -PK.heading, box: true, solid: false, air: 'biplane' },
    { x: PK.x + PKf.x * 0.55, z: PK.z + PKf.z * 0.55, w: 6.6, d: 1.6, rot: -PK.heading, box: true, solid: false, air: 'biplane' },
  ];
  for (const c of planeCols) col(c);
  const PK0 = planeCols.map((c) => ({ x: c.x, z: c.z }));
  let parkedX = NaN, parkedZ = NaN;
  function parkColliders(on) {
    const a = planes.aircraft?.biplane;
    if (!on || !a) { if (parkedX === parkedX) { parkedX = parkedZ = NaN; for (const c of planeCols) c.solid = false; } return; }
    if (Math.abs(a.x - parkedX) < 0.05 && Math.abs(a.z - parkedZ) < 0.05) return;
    parkedX = a.x; parkedZ = a.z;
    const h = a.heading, fx = Math.sin(h), fz = Math.cos(h);
    if (Math.hypot(a.x - PK.x, a.z - PK.z) < 0.5) {
      // at the pump: the boxes are already binned right here — only turn them
      // (rot is read live; moving them even 1 cm would force a hash re-bin)
      for (let i = 0; i < 2; i++) Object.assign(planeCols[i], { x: PK0[i].x, z: PK0[i].z, rot: -h, solid: true });
      return;
    }
    // box frame: local z = (−sin rot, cos rot), so a nose along (sin h, cos h) is rot = −h
    Object.assign(planeCols[0], { x: a.x - fx * 0.3, z: a.z - fz * 0.3, rot: -h, solid: true });
    Object.assign(planeCols[1], { x: a.x + fx * 0.55, z: a.z + fz * 0.55, rot: -h, solid: true });
  }

  // ── the deal ────────────────────────────────────────────────────────────────
  const route = { id: 'biplane', label: 'The banner biplane' };
  let talk = 0;                  // 0 not yet · 1 asked · 2 paid · 3 promised
  let state = 'idle';            // 'idle' | 'aboard' | 'off'
  let stopSeq = -1, sayLock = 0, flightSaid = 0;
  const pilotPos = new THREE.Vector3(), seat = new THREE.Vector3();
  const FLY = { alt: 0, y: 0, speed: 0, vy: 0, energy: 1, heading: 0, thermal: 0, boost: false, vehicle: 'biplane' };
  const player = () => ctx.systems.player;
  const introOn = () => !!ctx.systems.intro?.active;
  const say = (text, dur = 3.8) => ui()?.say(text, { speaker: PILOT, duration: dur });
  const inv = () => ctx.systems.inventory;
  /** any sweet the visitor carries: plain candy first, then any other candy-kind item */
  function sweetId() {
    const I = inv(); if (!I) return null;
    if ((I.count?.('candy') || 0) > 0) return 'candy';
    for (const it of I.items || []) if (it && it.kind === 'candy' && it.count > 0) return it.id;
    return null;
  }
  const LABEL = ['Talk to the pilot', 'Offer the pilot a sweet', 'Promise not to touch the banner', 'Climb into the deckchair'];
  // The E prompts are registered at world:ready: main.js creates 'escape'
  // BEFORE 'interaction', so ctx.systems.interaction does not exist while
  // create() runs (the sibling routes register the same way). update() guards
  // on null. register() stores a COPY of the spec: keep the entries it returns.
  let gate = null, boardGate = null;
  const PILOT_GRAB = 2.6;
  // Standing at the candy pump is "at the fuel stop": he parks 4.8 u off it,
  // so the plane-centred reach (r 4.2) missed most of the pump's far side.
  // Within PUMP_GRAB of the pump (collider r 1.05 + the visitor's 0.36 + room
  // to be nudged off it) the gate reports his own spot too.
  const PUMP_GRAB = 2.7;
  // A climb-back-out spends its E press, and talk()/board() stay shut for a
  // beat after it, so that one press can never seat him again.
  let cancelT = 0;
  // …and the other way round: the first SEAT_GRACE s in the deckchair eat any
  // E (the tail of a conversation mashed through), so a climb-out is always a
  // deliberate press. After that a pinned 'Climb back out' cue says so.
  const SEAT_GRACE = 0.35;
  let seatT = 0, outCue = false, cueNN = null;
  const outEntry = { id: 'biplane_out', r: 1.2, promptH: 1.5, getPos: () => seat };
  // interaction.js re-prompts only when its nearest changes (and an entry that
  // re-enables itself every frame can win it over a seated visitor), so the
  // cue is re-asserted whenever that nearest changes; E is ours meanwhile —
  // escape runs first and spends it. Off: the pill goes back to that nearest.
  function cue(on) {
    const nn = ctx.systems.interaction?.nearest?.() ?? null;
    if (on === outCue && (!on || nn === cueNN)) return;
    outCue = on; cueNN = nn;
    try {
      if (on) ui()?.prompt?.('Climb back out', outEntry);
      else ui()?.prompt?.(nn ? (nn.label || 'Interact') : null, nn);
    } catch (err) { /* optional */ }
  }
  ctx.events.on('world:ready', () => {
    const I = ctx.systems.interaction;
    if (!I?.register) { console.warn('[escape/biplane] no interaction system — the pilot has no E prompt'); return; }
    try {
      // Beside the cockpit the pilot is THE thing to press E for (a passing
      // Sour Patch Kid's "Talk to …" must not steal the deal): within
      // PILOT_GRAB of his seat the gate reports the visitor's own spot
      // (distance 0); further out it competes normally from the plane.
      const gp = { x: BPa.park.x, y: 0, z: BPa.park.z };
      gate = I.register({
        id: 'biplane_pilot', x: BPa.park.x, z: BPa.park.z, r: 4.2, label: LABEL[Math.min(3, talk)],
        getPos() {
          const a = planes.aircraft?.biplane; if (!a) return BPa.park;
          const p = player()?.position;
          BPa.pilot(pilotPos);
          const grab = p && (Math.hypot(p.x - pilotPos.x, p.z - pilotPos.z) < PILOT_GRAB
            || (BPa.phase === 'refuel' && Math.hypot(p.x - pump.x, p.z - pump.z) < PUMP_GRAB));
          if (grab) { gp.x = p.x; gp.z = p.z; } else { gp.x = a.x; gp.z = a.z; }
          gp.y = a.y;
          return gp;
        },
        onInteract() { route.talk(); },
      }) || null;
      if (gate) gate.enabled = false;
    } catch (err) { console.warn('[escape/biplane] pilot prompt failed', err); }
    try {
      boardGate = I.register({
        id: 'airstrip_board', x: boardAt[0] + Math.sin(boardFace) * 1.3, z: boardAt[1] + Math.cos(boardFace) * 1.3, r: 2.6,
        label: 'Read the airfield board',
        onInteract() {
          const [big, small, night] = boardFor();
          ui()?.say(big.charAt(0) + big.slice(1).toLowerCase() + '. ' + (night ? 'The pump is off. The field is dark. Something keeps sitting on the bench.' : small.charAt(0).toUpperCase() + small.slice(1) + '.'), { speaker: 'Airfield board', duration: 4 });
        },
      }) || null;
    } catch (err) { console.warn('[escape/biplane] board prompt failed', err); }
  });

  route.talk = function talkStep() {
    if (BPa.phase !== 'refuel' || state !== 'idle' || cancelT > 0 || vehicleBusy(ctx) || introOn()) return false;
    const story = ctx.systems.story;
    const dealt = !!story?.get?.('biplane_deal');
    BPa.wait(12);
    if (talk === 0) {
      if (dealt) { say('Back again? Same deal: one sweet, hands off the banner.'); talk = 1; return true; }
      say('Fuel stop! Twenty-five seconds and I\'m gone. …Cat Island? Nobody flies TO Cat Island. Nobody sane.', 4.4);
      talk = 1; return true;
    }
    if (talk === 1) {
      const id = sweetId();
      if (!id) { say('No sweet, no seat. Law of the sky. I drop them all over the Candy Kingdom — go and find one.', 4.2); return true; }
      inv()?.spend?.(id, 1);
      ctx.events.emit('biplane:paid', { itemId: id });
      if (dealt) { say('*crunch* …Right. In you get.', 3); talk = 3; return true; }
      say('…Is that a gumdrop? *crunch* …Fine. ONE condition.', 3.6);
      talk = 2; return true;
    }
    if (talk === 2) {
      say('Nobody touches the banner. Not a finger. Not a sneeze. Not a THOUGHT. Promise? …Good. Deckchair\'s in the back.', 4.6);
      try { story?.set?.('biplane_deal', true); } catch (err) { /* optional */ }
      talk = 3; return true;
    }
    return route.board();
  };
  route.board = function board() {
    const pl = player();
    if (!pl || BPa.phase !== 'refuel' || state !== 'idle' || cancelT > 0 || vehicleBusy(ctx) || introOn()) return false;
    if (talk < 3) return route.talk();
    BPa.wait(6);
    if (!BPa.board()) return false;
    BPa.seat(seat);
    rider.mount('biplane', seat.x, seat.y, seat.z, 1.6);
    rider.pose('sit');
    state = 'aboard'; flightSaid = 0; seatT = 0; flightObj = false;
    place(true);
    seatCamStart();
    escape.start('biplane', { label: 'the banner biplane', from: 'candy', to: 'cat', arrived: 'cat' });
    ui()?.toast?.('Hold on to the deckchair. The deckchair is not attached very well.', 3.8);
    return true;
  };

  // Nobody on the ground can be heard up here (the flyer's rule)
  ctx.events.on('ui:say', (ev) => {
    if (state !== 'aboard' || BPa.onGround || !ev || !ev.speaker || ev.speaker === PILOT) return;
    const u = ui(); if (!u) return;
    try {
      const q = u.sayQueue, txt = String(ev.text);
      const i = Array.isArray(q) ? q.findIndex((x) => x && x.text === txt) : -1;
      if (i >= 0) q.splice(i, 1); else u.clear?.();
    } catch (err) { /* optional */ }
  });
  // a fresh stop resets the conversation
  ctx.events.on('planes:biplane', (ev) => {
    if (ev?.phase === 'refuel') { talk = 0; stopSeq++; }
  });

  let fogSaved, fogOn = false;
  function fog(on) {
    if (on && !fogOn) { fogSaved = ctx.state.fogScale; fogOn = true; }
    if (!on && fogOn) { ctx.state.fogScale = fogSaved; fogOn = false; fogSaved = undefined; }
  }

  // ── the aboard extras: the map strip names where you are; the camera swings
  // round behind the lower wing so you see yourself in the deckchair (from the
  // front the pilot and the upper wing hide the seat — the visitor's amber
  // see-through pass then reads as a flat orange cut-out) ────────────────────
  const PLACE = 'Aboard the banner biplane';
  let placeMine = false;
  function place(on) {
    if (on && !placeMine && !ctx.state.placeOverride) { ctx.state.placeOverride = PLACE; placeMine = true; }
    else if (!on && placeMine) { if (ctx.state.placeOverride === PLACE) ctx.state.placeOverride = null; placeMine = false; }
  }
  const AZP = { azimuth: 0 };
  let swing = null;                  // { t, from, to, set }
  function seatCamStart() {
    const cam = ctx.systems.camera, a = planes.aircraft?.biplane;
    if (!cam?.params || !cam.setParams || !a) { swing = null; return; }
    const h = a.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const side = ((pump.x - a.x) * rx + (pump.z - a.z) * rz) >= 0 ? 1 : -1;
    // ~70° off the tail toward the pump: side-on to the deckchair, the upper
    // wing ahead of it and the chair back edge-on, so nothing stands between
    const ox = -fx * 0.34 + rx * side * 0.94, oz = -fz * 0.34 + rz * side * 0.94;
    const from = cam.current?.azimuth ?? cam.params.azimuth;
    swing = { t: 0, from, to: Math.atan2(ox, oz), set: NaN };
  }
  function seatCam(dt) {
    if (!swing) return;
    const cam = ctx.systems.camera;
    if (!cam?.setParams) { swing = null; return; }
    // the player turned it himself (Q/E / drag write params.azimuth): hands off
    if (swing.set === swing.set && Math.abs(wrapPi(cam.params.azimuth - swing.set)) > 0.03) { swing = null; return; }
    swing.t = Math.min(1, swing.t + dt / 0.9);
    const k = swing.t * swing.t * (3 - 2 * swing.t);
    AZP.azimuth = swing.from + wrapPi(swing.to - swing.from) * k;
    swing.set = AZP.azimuth;
    try { cam.setParams(AZP); } catch (err) { swing = null; return; }
    if (swing.t >= 1) swing = null;
  }
  // walking onto the field names it (it is not a world landmark, so the HUD
  // would otherwise keep whatever place it announced last)
  let onField = false, fieldSaidAt = -1e9, flightObj = false;
  function fieldBanner(pl) {
    let inField = false;
    if (pl) { PADD.toAK(pl.x, pl.z, _ak); inField = insideAK(_ak.a, _ak.k, 2) && Math.abs(pl.y - hAK(_ak.a, _ak.k)) < 3; }
    if (inField && !onField && ctx.state.elapsed - fieldSaidAt > 75 && !introOn()) {
      fieldSaidAt = ctx.state.elapsed;
      const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
      const sub = night ? 'Flights resume at dawn.' : BPa.phase === 'refuel' ? 'He is refuelling. He likes sweets.' : 'Biplane fuel stop · lifts by arrangement';
      try { ui()?.banner?.('Sugar Rush Airfield', sub, 3.6, 'candy'); } catch (err) { /* optional */ }
    }
    onField = inField;
  }

  let offT = 0, sockA = 0, sockT = 0, boardT = 0;
  route.update = function update(dt) {
    const ph = BPa.phase;
    if (cancelT > 0) cancelT -= dt;
    // board text: 4 Hz, and only when someone could read it (the text itself changes ≤ 1/s)
    const pl = player()?.position;
    boardT -= dt;
    if (boardT <= 0) { boardT = 0.25; if (!pl || Math.hypot(pl.x - STR.x, pl.z - STR.z) < 110) refreshBoard(); }
    const lamp = ctx.systems.sky?.lampMix ?? (ctx.state.isNight ? 1 : 0);
    uSign.value = 1.3 * lamp;
    uNight.value = lamp;
    uPump.value = BPa.flyingToday || ph === 'refuel' || ph === 'approach' ? 0.9 * (1 - lamp) : 0;
    // the bench lamp: a bad contact (worse while the bench is taken)
    flickT += dt;
    {
      const buzz = 0.78 + 0.18 * Math.sin(flickT * 23.7) * Math.sin(flickT * 3.1);
      const cut = Math.sin(flickT * 1.37) + Math.sin(flickT * 3.71 + 1.1) + (sitOn ? 0.55 : 0) > 1.55;
      uFlick.value = cut ? 0.06 : buzz;
    }
    updateSitter(dt, lamp);
    // the windsock: swings downwind, ripples
    sockT += dt;
    const wind = 0.9 + 0.5 * Math.sin(sockT * 0.13) + 0.2 * Math.sin(sockT * 0.71);
    sockA = 2.2 + 0.35 * Math.sin(sockT * 0.09);
    sock.rotation.set(0.9 - 0.55 * clamp(wind, 0, 1.6) / 1.6 + 0.05 * Math.sin(sockT * 4.3), sockA + 0.07 * Math.sin(sockT * 2.1), 0.05 * Math.sin(sockT * 3.3), 'YXZ');
    sock.scale.set(1, 1, 0.94 + 0.06 * Math.sin(sockT * 6.1));
    // the parked plane is solid
    parkColliders(BPa.stopped && state !== 'aboard');
    // the pilot's gate
    if (gate) {
      gate.enabled = ph === 'refuel' && state === 'idle' && !introOn();
      const lbl = LABEL[Math.min(3, talk)];
      if (gate.label !== lbl) { gate.label = lbl; if (ctx.systems.interaction?.nearest?.() === gate) ui()?.prompt?.(lbl, gate); }
    }
    if (boardGate) boardGate.enabled = state === 'idle';

    if (state === 'idle') { fieldBanner(pl); return; }
    onField = true;                   // (stepping off at the pump is not "arriving")
    BPa.seat(seat);
    if (state === 'aboard') {
      rider.place(seat.x, seat.y, seat.z, seat.facing);
      place(true);
      const air = !BPa.onGround && (ph === 'ferry' || ph === 'home' || ph === 'depart');
      if (air) {
        const gy = world.height(seat.x, seat.z);
        FLY.alt = seat.y - Math.max(gy, 0); FLY.y = seat.y; FLY.speed = BPa.speed;
        // well off the tail: the deckchair side-on, and the banner streaming out
        // behind across the frame instead of looming at the lens from below
        FLY.heading = BPa.heading - 1.1;
        ctx.state.flying = FLY;
        fog(true);
        ctx.state.fogScale = Math.max(1, fogSaved || 1, 1 + clamp((ctx.camera.position.y - 30) / 60, 0, 1));
        if (flightSaid === 0 && FLY.alt > 12) { flightSaid = 1; say('Hold on to your hat. You haven\'t got a hat. Hold on to something.', 3.6); }
        else if (flightSaid === 1 && Math.abs(seat.x) < 25) { flightSaid = 2; const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight); say(night ? 'Don\'t look down. The water\'s got eyes tonight.' : 'Don\'t wave at the cats. It only encourages them.', 3.6); }
      } else if (ctx.state.flying === FLY) { ctx.state.flying = null; fog(false); }
      // committed: off the ground and bound for Cat Island — say so on the HUD
      if (ph === 'ferry' && !flightObj) {
        flightObj = true;
        try {
          ui()?.setObjective?.('Hold on to the deckchair', 'Next stop: Wing Nut Field, Cat Island');
          ui()?.banner?.('Bound for Cat Island', 'the banner biplane · one way', 3.6, 'cat');
        } catch (err) { /* optional */ }
      }
      seatT += dt;
      // cancel before take-off: E climbs back out (still in the Candy Kingdom).
      // The press is SPENT here: escape runs before interaction in main.js, and
      // unmount() re-enables the pilot's gate — left in the set, the same E
      // would reach it this frame and seat him again (a second escape:start).
      if (ph === 'refuel') {
        seatCam(dt);
        const e = ctx.input?.pressed;
        const hit = !!e && (e.has('KeyE') || e.has('Enter'));
        if (hit && seatT < SEAT_GRACE) { e.delete('KeyE'); e.delete('Enter'); }
        else if (hit && BPa.refuelLeft > 1.5) {
          e.delete('KeyE'); e.delete('Enter');
          cancelT = 0.4;
          cue(false);
          BPa.unboard();
          // step down on the pump side, behind the lower wing's trailing edge
          // (the wing box spans −0.25…1.35 u along him and ±3.3 u across)
          const a = planes.aircraft.biplane, h = a.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
          const side = ((pump.x - a.x) * rx + (pump.z - a.z) * rz) >= 0 ? 1 : -1;
          state = 'idle'; talk = 3; swing = null;
          if (gate) gate.enabled = false;
          ctx.state.flying = null; fog(false); place(false);
          rider.unmount(a.x + rx * side * 2.4 - fx * 1.6, a.z + rz * side * 2.4 - fz * 1.6);
          if (gate) gate.enabled = false;                 // unmount() just restored it: not this frame
          say('Cold feet? Suit yourself. The deckchair\'s yours till the tank\'s full.', 3.2);
          return;
        }
        cue(seatT >= SEAT_GRACE && BPa.refuelLeft > 1.5);
      } else { swing = null; cue(false); }
      if (ph === 'dropoff') {
        if (flightSaid < 3) { flightSaid = 3; say('Wing Nut Field! Everybody off who\'s getting off. Which is you.', 3.4); }
        offT += dt;
        if (offT > 1.2) {
          offT = 0;
          const d = BPa.dropoff;
          ctx.state.flying = null; fog(false); place(false);
          rider.unmount(d.off[0], d.off[1]);
          state = 'idle'; talk = 0; flightObj = false;
          BPa.release();
          escape.success('biplane', { to: 'cat', from: 'candy', landing: { x: d.off[0], z: d.off[1] } });
          ui()?.toast?.('Wing Nut Field, Cat Island. The biplane turns for home. You don\'t.', 4.2);
        }
      } else offT = 0;
    }
  };

  Object.defineProperty(route, 'riding', { get: () => state === 'aboard' });
  Object.defineProperty(route, 'talkStep', { get: () => talk });
  route.ready = () => true;
  route.strip = {
    x: STR.x, z: STR.z, along: SU, north: SN, len: STR.len, wid: STR.wid, pump: { x: pump.x, z: pump.z }, sock: { x: sockAt[0], z: sockAt[1] },
    board: { x: boardAt[0], z: boardAt[1] }, bench: { x: benchAt[0], z: benchAt[1] }, sign: { x: noteAt[0], z: noteAt[1] },
    lamps: LAMPS.map((L) => ({ x: L.x, z: L.z })), pad: { at: (x, z) => PADD.at(x, z), apronK: APK, apronA: APA, kerbH: KERB_H },
  };
  Object.defineProperty(route, 'benchTaken', { get: () => sitOn });
  /** Views: the plane refuelling and the pilot mid-sentence (step 1..3). */
  route.debugTalk = function debugTalk(step = 1, k = 0.3) {
    planes.debugBiplane('refuel', k, true);
    talk = 0; state = 'idle'; cancelT = 0;
    const I = inv();
    if (I && !sweetId()) I.add?.('candy', 1);
    let ok = false;
    for (let i = 0; i < step; i++) ok = route.talk();
    return { talk, ok };
  };
  /** Views: sat in the deckchair at `phase` k ('ferry' 0.5 = mid-strait). */
  route.debugRide = function debugRide(phase = 'ferry', k = 0.5) {
    planes.debugBiplane('refuel', 0.5, true);
    talk = 3; state = 'idle'; cancelT = 0;
    route.board();
    planes.debugBiplane(phase, k, true);
    // (he walked across the field to get here: the HUD names it, as it would have)
    if (phase === 'refuel') { fieldSaidAt = ctx.state.elapsed; try { ui()?.banner?.('Sugar Rush Airfield', 'He is refuelling. He likes sweets.', 3.6, 'candy'); } catch (err) { /* optional */ } }
    route.update(1 / 30);
    if (swing) { swing.t = 1; AZP.azimuth = swing.to; try { ctx.systems.camera?.setParams?.(AZP); } catch (err) { /* optional */ } swing = null; }
    try { ctx.systems.camera?.snap?.(); } catch (err) { /* optional */ }
    return { phase: BPa.phase, flying: !!ctx.state.flying };
  };
  /** Views: out of the deckchair, conversation forgotten. */
  route.debugReset = function debugReset() {
    if (state !== 'idle') { ctx.state.flying = null; fog(false); cue(false); rider.unmount(); state = 'idle'; }
    place(false); swing = null; flightObj = false; sitForce = -1; sitGone = false;
    talk = 0; cancelT = 0; try { BPa.unboard(); ui()?.clear?.(); } catch (err) { /* optional */ }
    return true;
  };
  /** Views / tests: the bench's night visitor — 1 there, 0 gone, -1 its own rules. */
  route.debugSitter = function debugSitter(on = 1) { sitForce = on === true ? 1 : on === false ? 0 : Number(on); sitGone = false; updateSitter(0, ctx.systems.sky?.lampMix ?? 1); return sitOn; };
  refreshBoard(true);
  return escape.register('biplane', route);
}
