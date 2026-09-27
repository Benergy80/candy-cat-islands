// ─────────────────────────────────────────────────────────────────────────────
// THE SUGAR BLIMP — a two-way ride between the islands (WAVE 4 · Contract L)
//
// planes.js flies her: a fixed timetable, 20 s moored nose-in at each of two
// mooring masts, a slow drift across the strait in between (planes.blimp).
// This file owns everything on the ground and the ride itself:
//
//   MASTS       the SUGAR MOORING (WAVE 5 · Contract Q — moved off Sugar Pier
//               to the remote west headland past Chocolate Lake's far shore: a
//               landing wafer, a lantern, a bench, signposts, a windswept shore
//               and a 90 u cookie-stone trail from the lake road; see
//               buildMooring) and Fish Harbor (the mast
//               on the lawn east of the quay path). Candy-cane towers with a gold
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
import { clamp, smoothstep, lerp, rng, hash } from '../../core/util.js';
import { createRider, vehicleBusy, clearanceClaim } from './ride.js';
import { terrainMeshSampler } from '../planes.js';

const TAU = Math.PI * 2;
const CAPTAIN = 'Captain Whiskerton';

// ── the timetable atlas: two boards + the roundel + a plain white texel ─────
const AT = 512;
const R = {
  board: { candy: [0, 0, 512, 200], cat: [0, 216, 512, 200] }, roundel: [0, 424, 88, 88], white: [480, 480, 32, 32],
  // WAVE 5 · the Sugar Mooring's furniture: two signpost arms, a wafer tile, the lantern's glass
  arm: [96, 424, 312, 40], arm2: [96, 468, 312, 40], waffle: [416, 424, 56, 56], amber: [480, 436, 32, 32],
};
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
  // the mooring's signpost arms and name plate: cream wafer, plum letters.
  // After dark the PLATE is lit (a warm cream glow) and the letters stay dark
  // on it — glowing letters on an unlit arm smeared into orange-on-brown at
  // the game camera's distance (polish pass, Contract Q).
  function drawArm(rect, txt) {
    const [x, y, w, h] = rect;
    g.fillStyle = '#fff1dc'; g.fillRect(x, y, w, h);
    g.fillStyle = '#e8263f'; g.fillRect(x, y, w, 4); g.fillRect(x, y + h - 4, w, 4);
    g.fillStyle = '#4a1430'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, txt, w - 24, 28); g.fillText(txt, x + w / 2, y + h / 2 + 1);
    e.fillStyle = '#c9b48e'; e.fillRect(x, y, w, h);
    e.fillStyle = '#7a1a26'; e.fillRect(x, y, w, 4); e.fillRect(x, y + h - 4, w, 4);
    e.font = g.font; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillStyle = '#000'; e.fillText(txt, x + w / 2, y + h / 2 + 1);
    // the glyph edges bleed at mip distance: a hair of dark outline keeps the letters shut
    e.lineWidth = 1.5; e.strokeStyle = '#000'; e.strokeText(txt, x + w / 2, y + h / 2 + 1);
  }
  drawArm(R.arm, 'SUGAR MOORING');
  drawArm(R.arm2, 'BLIMP TO CAT ISLAND');
  {
    // a wafer tile: pale biscuit with a pressed grid (benches, the landing wafer's rim)
    const [x, y, w, h] = R.waffle;
    g.fillStyle = '#f2cf96'; g.fillRect(x, y, w, h);
    g.fillStyle = '#d9a864';
    for (let i = 0; i <= 4; i++) { g.fillRect(x + i * (w - 3) / 4, y, 3, h); g.fillRect(x, y + i * (h - 3) / 4, w, 3); }
    // the lantern's glass: warm by day, a burning amber after dark
    const [ax, ay, aw, ah] = R.amber;
    g.fillStyle = '#ffd99a'; g.fillRect(ax, ay, aw, ah);
    e.fillStyle = '#ffb03c'; e.fillRect(ax, ay, aw, ah);
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
      /** `rect`: an atlas rect — the geometry's own uvs are mapped into it
       *  (tiling it once per face); omitted = the plain white texel. */
      add(geo, m, color, rect = null) {
        const gg = geo.index ? geo.toNonIndexed() : geo;
        if (m) gg.applyMatrix4(m);
        const p = gg.attributes.position.array, n = gg.attributes.normal.array;
        const uv = rect && gg.attributes.uv ? gg.attributes.uv.array : null;
        const fn = typeof color === 'function' ? color : null;
        if (!fn) _c.setHex(color);
        for (let i = 0, t = 0; i < p.length; i += 9, t += 6) {
          if (fn) _c.setHex(fn((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3));
          for (let j = 0, q = 0; j < 9; j += 3, q += 2) {
            P.push(p[i + j], p[i + j + 1], p[i + j + 2]); N.push(n[i + j], n[i + j + 1], n[i + j + 2]); C.push(_c.r, _c.g, _c.b);
            if (uv) { const w = uvOf(rect, 0.04 + 0.92 * uv[t + q], 0.04 + 0.92 * uv[t + q + 1]); U.push(w[0], w[1]); }
            else if (rect) { const w = uvOf(rect, 0.5, 0.5); U.push(w[0], w[1]); }
            else U.push(WHITE_UV[0], WHITE_UV[1]);
          }
        }
        geo.dispose(); if (gg !== geo) gg.dispose();
      },
      /** a flat disc facing +y, its uvs spanning `rect` (a round label on the
       *  ground); `rot` turns the label (0: reads along +x, its top to −z) */
      disc(cx, cy, cz, r, rect, seg = 24, rot = 0) {
        const ux = Math.cos(rot), uz = Math.sin(rot), vx = Math.sin(rot), vz = -Math.cos(rot);
        for (let i = 0; i < seg; i++) {
          const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
          const pts = [[0, 0], [Math.cos(a1), Math.sin(a1)], [Math.cos(a0), Math.sin(a0)]];
          for (const [u, v] of pts) {
            P.push(cx + u * r, cy, cz + v * r); N.push(0, 1, 0); C.push(1, 1, 1);
            const w = uvOf(rect, 0.5 + (u * ux + v * uz) * 0.5, 0.5 + (u * vx + v * vz) * 0.5); U.push(w[0], w[1]);
          }
        }
      },
      /** one flat-shaded triangle (a, b, c counter-clockwise seen from its front), plain colour */
      tri(ax, ay, az, bx, by, bz, cx, cy, cz, color) {
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        _c.setHex(color);
        P.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        for (let j = 0; j < 3; j++) { N.push(nx, ny, nz); C.push(_c.r, _c.g, _c.b); U.push(WHITE_UV[0], WHITE_UV[1]); }
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
  const RED = 0xe8263f, CREAM = 0xfff4ea, GOLD = 0xffc93a, PINK = 0xffb3d1, MINT = 0xa8f0d1, CHOC = 0x5a3220, LIC = 0x1a1218, PLUM = 0x6b2a4a;
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
    // roundel flat on the grass under the ladder — or, at the Sugar Mooring,
    // the landing wafer and the rest of the stop (lamp, bench, signposts, trail)
    if (m.pad) buildMooring(kb, m);
    else kb.quad(m.foot.x, fy + 0.04, m.foot.z, 1.25, 0, 0, 0, 0, -1.25, R.roundel);
    // timetable board beside the foot: faces the way people arrive
    const bd = BOARD[name];
    const byb = (bd.deck ? fy : (m.pad && surfAt ? surfAt(bd.x, bd.z) : meshH(bd.x, bd.z)) - 0.05);
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
    else claimCircle(bx, bz, 4.6, 'blimp_mast_candy');      // (a fallen chocolate log lay against the plinth)
    masts[name] = { mesh, m, board: bd };
  }
  /** A vegetation clearance circle (candy vegetation's PASS 4 blanks every
   *  instance inside a foreign circle ≤ 9 u at world:ready); retired right
   *  after, and h −999 so nothing ever treats it as a wall meanwhile. */
  function claimCircle(x, z, r, id) {
    const c = { x, z, r, h: -999, solid: false, claim: id };
    ctx.colliders.push(c); retire.push(c);
    return c;
  }

  // ════════════════════════════════════════════════════════════════════════
  // THE SUGAR MOORING (WAVE 5 · Contract Q) — the Candy Kingdom's blimp stop,
  // off Sugar Pier and out on the WEST HEADLAND past Chocolate Lake's far
  // shore: sea to the west and the south, gumdrop scrub inland, and a ≈ 90 u
  // cookie-stone trail back to the lake road. (Polish pass: the first cut
  // stood on the lake's south shore, 25 u from its centre, and every frame of
  // it was the lake's boathouse, fountain and boardwalk.)
  // Everything here is merged into the candy mast's one mesh:
  //   the LANDING WAFER   a thick biscuit drum (peppermint BLIMP STOP disc on
  //                       top, turned to read from the lens) sat in a crushed-
  //                       sugar apron that runs down to the ground all round —
  //                       the walkable deck and its ramp
  //   a LANTERN           on the seaward corner, glass burning amber at night
  //   a BENCH             at the beach edge, looking out to sea (a low prop)
  //   SIGNPOSTS           the stop's name plate + an arm at the wafer, an arm
  //                       at the lake-road junction, a waymark half way. Every
  //                       arm is turned 30° off the default lens (it points AND
  //                       reads), and after dark the PLATES light up cream
  //                       behind dark letters.
  //   the TIMETABLE       live ETA board, facing the arriving trail + the lens
  //   the TRAIL           sugar-cookie stepping stones, lake road → the wafer
  //   BALLAST             sugar sacks and a licorice rope coil by the mast
  //   the SHORE           dune candy-grass, bleached driftwood candy canes and
  //                       sea-worn gumdrop pebbles — sparse and windswept
  // The layout below is in WORLD coordinates for this site (MOORING.site is
  // the ladder foot it was drawn round, planes.js AIR.masts.candy).
  // ════════════════════════════════════════════════════════════════════════
  const LENS = Math.PI / 4;                   // the default iso lens bearing (camera.js azimuth π/4)
  const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  /** An arm's printed faces are square to the lens when it points along
   *  LENS ± π/2 (straight across the screen). Turn it 30° off that, toward the
   *  bearing it should point along: it still reads as pointing, and its letters
   *  meet the camera at 30° instead of edge-on. */
  const readableArm = (want) => {
    let best = want, bd = 1e9;
    for (const base of [LENS - Math.PI / 2, LENS + Math.PI / 2]) for (const off of [-0.52, 0.52]) {
      const d = wrapA(base + off), diff = Math.abs(wrapA(d - want));
      if (diff < bd) { bd = diff; best = d; }
    }
    return best;
  };
  const _q4 = new THREE.Quaternion(), _v4 = new THREE.Vector3(), _u4 = new THREE.Vector3(0, 1, 0);
  /** A matrix that lays a +y-axis primitive along a→b (world), centred between them. */
  const along = (ax, ay, az, bx, by, bz) => {
    _v4.set(bx - ax, by - ay, bz - az).normalize();
    _q4.setFromUnitVectors(_u4, _v4);
    return new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q4, new THREE.Vector3(1, 1, 1));
  };
  function buildMooring(k, m) {
    const S = MOORING;
    const gy = (x, z) => meshH(x, z);
    const sy = (x, z) => (surfAt ? surfAt(x, z) : gy(x, z));
    const x0 = m.foot.x, z0 = m.foot.z, top = m.foot.y, R1 = S.padR, yi = top - S.rim;
    if (Math.hypot(x0 - S.site[0], z0 - S.site[1]) > 3) console.warn('[escape/blimp] the candy mast moved in planes.js — the Sugar Mooring furniture still stands at', S.site);
    // ── the landing wafer ────────────────────────────────────────────────────
    // A thick biscuit drum with pressed-grid sides, sunk below the lowest
    // ground round it, in a crushed-sugar apron whose inner edge is the drum's
    // rim step and whose outer edge rides the RENDERED ground all the way
    // round: on the seaward fall it is a mound the wafer sits on — never a
    // tier floating off (or cut by) the slope. The walkable is this surface.
    // the apron: per wedge, march out at S.slope until it meets the ground
    // (≤ 4.5 u: the headland falls 2–3 u to the west beach inside that)
    for (let i = 0; i < APRON.n; i++) {
      const a = (i + 0.5) / APRON.n * TAU, c = Math.cos(a), sn = Math.sin(a);
      let d = R1 + 0.3, y = yi - 0.3 * S.slope;
      for (; d < R1 + 4.5; d += 0.1) {
        y = yi - (d - R1) * S.slope;
        if (y <= gy(x0 + c * d, z0 + sn * d) + 0.02) break;
      }
      APRON.ro[i] = d; APRON.yo[i] = Math.min(y, gy(x0 + c * d, z0 + sn * d)) - 0.07;
      APRON.max = Math.max(APRON.max, d);
    }
    const RR = APRON.max;
    /** how far the apron reaches toward (x, z) */
    const apronAt = (x, z) => { let f = Math.atan2(z - z0, x - x0) / TAU * APRON.n - 0.5; f = ((f % APRON.n) + APRON.n) % APRON.n; const i0 = Math.floor(f), t = f - i0; return APRON.ro[i0] + (APRON.ro[(i0 + 1) % APRON.n] - APRON.ro[i0]) * t; };
    // what a prop stands on here: the wafer, its apron, or the rendered ground
    surfAt = (x, z) => {
      const d = Math.hypot(x - x0, z - z0);
      if (d <= R1) return top;
      const ro = apronAt(x, z), g = gy(x, z);
      if (d >= ro) return g;
      let f = Math.atan2(z - z0, x - x0) / TAU * APRON.n - 0.5; f = ((f % APRON.n) + APRON.n) % APRON.n;
      const i0 = Math.floor(f), t = f - i0, yo = APRON.yo[i0] + (APRON.yo[(i0 + 1) % APRON.n] - APRON.yo[i0]) * t;
      return Math.max(g, yi + (yo - yi) * (d - R1) / Math.max(0.05, ro - R1));
    };
    let low = top;
    for (let i = 0; i < APRON.n; i++) low = Math.min(low, APRON.yo[i]);
    const dH = top - (low - 0.35);
    const waffle = (x, y, z) => (((Math.floor((Math.atan2(z - z0, x - x0) + Math.PI) / TAU * 30) + Math.floor(y * 2.6 + 80)) % 2) ? 0xf2cf96 : 0xdcac6a);
    k.add(new THREE.CylinderGeometry(R1, R1 + 0.05, dH, 30, Math.max(2, Math.ceil(dH * 2.6))), M4(x0, top - dH / 2, z0), waffle);
    {
      // vertices on the wedge boundaries (averaging the two wedges' reach), so
      // the apron is one closed skirt
      const N = APRON.n, ri = R1 + 0.02;
      const bro = (j) => 0.5 * (APRON.ro[(j + N - 1) % N] + APRON.ro[j % N]);
      const byo = (j) => 0.5 * (APRON.yo[(j + N - 1) % N] + APRON.yo[j % N]);
      for (let i = 0; i < N; i++) {
        const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const r0 = bro(i), r1 = bro(i + 1), y0 = byo(i), y1 = byo(i + 1);
        const col = i % 2 ? 0xf3dcb6 : 0xebcea2;
        k.tri(x0 + c0 * ri, yi, z0 + s0 * ri, x0 + c1 * r1, y1, z0 + s1 * r1, x0 + c0 * r0, y0, z0 + s0 * r0, col);
        k.tri(x0 + c0 * ri, yi, z0 + s0 * ri, x0 + c1 * ri, yi, z0 + s1 * ri, x0 + c1 * r1, y1, z0 + s1 * r1, col);
      }
    }
    k.add(new THREE.TorusGeometry(R1 - 0.02, 0.11, 6, 30), M4(x0, top + 0.02, z0, Math.PI / 2), PINK);
    for (let i = 0; i < 12; i++) {                       // icing blobs dripping over the rim
      const a = i / 12 * TAU + 0.2;
      k.add(new THREE.SphereGeometry(0.2, 7, 5), M4(x0 + Math.cos(a) * (R1 + 0.02), top - 0.14, z0 + Math.sin(a) * (R1 + 0.02), 0, 0, 0, 1, 1.6, 1), CREAM);
    }
    k.disc(x0, top + 0.035, z0, R1 - 0.2, R.roundel, 28, -LENS);    // BLIMP STOP reads across the screen
    claimCircle(x0, z0, Math.min(RR, R1 + 2.4) + 1.2, 'blimp_mooring');

    // ── the lantern (the candy lamppost, in this mesh) ───────────────────────
    const lamp = (lx, lz, h = 3.3) => {
      const y = sy(lx, lz) - 0.05;
      k.add(new THREE.CylinderGeometry(0.44, 0.56, 0.34, 10), M4(lx, y + 0.17, lz), PLUM);
      k.add(new THREE.TorusGeometry(0.5, 0.1, 6, 12), M4(lx, y + 0.34, lz, Math.PI / 2), PINK);
      k.add(new THREE.CylinderGeometry(0.17, 0.2, h, 8, Math.round(h * 3)), M4(lx, y + 0.34 + h / 2, lz), (x, yy) => ((Math.floor(yy * 2.6 + 40) % 2) ? MINT : CREAM));
      const Rg = 0.62, ly = y + 0.34 + h + Rg * 0.9;
      k.add(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 6), M4(lx, ly - Rg * 0.95, lz), LIC);
      k.add(new THREE.SphereGeometry(Rg, 12, 9), M4(lx, ly, lz, 0, 0, 0, 1, 1.08, 1), 0xffffff, R.amber);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5;
        k.add(new THREE.BoxGeometry(0.09, Rg * 1.9, 0.09), M4(lx + Math.cos(a) * Rg * 1.04, ly, lz + Math.sin(a) * Rg * 1.04, 0, -a, 0), LIC);
      }
      k.add(new THREE.SphereGeometry(Rg * 0.52, 10, 6), M4(lx, ly + Rg * 0.86, lz, 0, 0, 0, 1, 0.5, 1), CREAM);
      k.add(new THREE.ConeGeometry(0.22, 0.34, 9), M4(lx, ly + Rg * 0.86 + 0.3, lz), RED);
      k.add(new THREE.SphereGeometry(0.13, 6, 5), M4(lx, ly + Rg * 0.86 + 0.52, lz), RED);
      ctx.colliders.push({ x: lx, z: lz, r: 0.5 });
      glowAt.push([lx, ly, lz]);
      return ly;
    };
    // ── a wafer bench (yaw: the way it faces) ────────────────────────────────
    const bench = (bx0, bz0, yaw, w = 2.6) => {
      const y = sy(bx0, bz0) - 0.04, cs = Math.cos(yaw), sn = Math.sin(yaw);
      const P2 = (dx, dz) => [bx0 + dx * cs + dz * sn, bz0 - dx * sn + dz * cs];
      for (const sd of [-1, 1]) {
        const [lx, lz] = P2(sd * (w / 2 - 0.24), 0);
        k.add(new THREE.BoxGeometry(0.22, 0.64, 0.9), M4(lx, y + 0.32, lz, 0, yaw, 0), LIC);
        const [ax, az] = P2(sd * (w / 2 - 0.24), -0.42);
        k.add(new THREE.BoxGeometry(0.2, 0.66, 0.16), M4(ax, y + 1.0, az, 0, yaw, 0), LIC);
      }
      k.add(new THREE.BoxGeometry(w, 0.18, 0.9), M4(bx0, y + 0.68, bz0, 0, yaw, 0), 0xffffff, R.waffle);
      const [kx, kz] = P2(0, -0.38);
      k.add(new THREE.BoxGeometry(w, 0.72, 0.16), M4(kx, y + 1.06, kz, 0.13, yaw, 0), 0xffffff, R.waffle);
      // Contract A: a low prop (stand on the seat), not a wall
      ctx.colliders.push({ x: bx0, z: bz0, w, d: 1.0, rot: -yaw, box: true, h: 0.78 });
    };
    // ── a signpost (candy style: plum collar, striped post, red knob) ─────────
    // arms: { plate: true, face, rect, w } — a name plate hung square in front
    //       of the post, facing `face`;
    //       { to, rect, w } — a pointing arm; `to` is the bearing it should
    //       point along, readableArm() turns it 30° off the lens.
    const post = (px, pz, arms, h = 3.1) => {
      const y = sy(px, pz) - 0.05;
      k.add(new THREE.CylinderGeometry(0.5, 0.62, 0.34, 10), M4(px, y + 0.17, pz), PLUM);
      k.add(new THREE.TorusGeometry(0.56, 0.1, 6, 12), M4(px, y + 0.34, pz, Math.PI / 2), 0xfff19a);
      k.add(new THREE.CylinderGeometry(0.16, 0.2, h, 8, Math.round(h * 3)), M4(px, y + h / 2 + 0.2, pz), (x, yy) => ((Math.floor(yy * 2.6 + 40) % 2) ? RED : CREAM));
      k.add(new THREE.SphereGeometry(0.3, 8, 6), M4(px, y + h + 0.34, pz), RED);
      let drop = 0;
      arms.forEach((a) => {
        const ay = y + h - 0.42 - drop;
        drop += a.plate ? 0.95 : 0.62;               // a plate hangs deeper: the arm below clears it from the lens
        if (a.plate) {
          const dir = a.face, dx = Math.sin(dir), dz = Math.cos(dir);
          const w = a.w || 2.5, cx = px + dx * 0.3, cz = pz + dz * 0.3, rx2 = Math.cos(dir), rz2 = -Math.sin(dir);
          k.add(new THREE.BoxGeometry(w + 0.16, 0.62, 0.12), M4(cx, ay, cz, 0, dir, 0), CHOC);
          k.quad(cx + dx * 0.065, ay, cz + dz * 0.065, rx2 * w * 0.47, 0, rz2 * w * 0.47, 0, 0.23, 0, a.rect);
          k.quad(cx - dx * 0.065, ay, cz - dz * 0.065, -rx2 * w * 0.47, 0, -rz2 * w * 0.47, 0, 0.23, 0, a.rect);
          return;
        }
        const dir = readableArm(a.to), dx = Math.sin(dir), dz = Math.cos(dir);
        const nx = Math.cos(dir), nz = -Math.sin(dir);                 // the arm's face normal
        const w = a.w || 2.5, off = 0.24 + w / 2, cx = px + dx * off, cz = pz + dz * off;
        k.add(new THREE.BoxGeometry(w, 0.5, 0.12), M4(cx, ay, cz, 0, dir + Math.PI / 2, 0), 0xfff1dc);
        k.add(new THREE.CylinderGeometry(1, 1, 1, 3), M4(px + dx * (off + w / 2 + 0.125), ay, pz + dz * (off + w / 2 + 0.125), 0, dir, -Math.PI / 2, 0.29, 0.12, 0.27), 0xfff1dc);
        // both faces read left→right: quad() faces right × up, so the
        // right-hand vector flips with the side
        k.quad(cx + nx * 0.065, ay, cz + nz * 0.065, -dx * w * 0.47, 0, -dz * w * 0.47, 0, 0.21, 0, a.rect);
        k.quad(cx - nx * 0.065, ay, cz - nz * 0.065, dx * w * 0.47, 0, dz * w * 0.47, 0, 0.21, 0, a.rect);
      });
      ctx.colliders.push({ x: px, z: pz, r: 0.55 });
    };

    // lantern on the seaward corner, bench at the beach edge, the name post
    // where the trail arrives
    { const [lx, lz] = S.lamp; lamp(lx, lz); claimCircle(lx, lz, 1.6, 'blimp_mooring'); }
    { const [bx0, bz0, yaw] = S.bench; bench(bx0, bz0, yaw); claimCircle(bx0, bz0, 2.2, 'blimp_mooring'); }
    {
      const [px, pz] = S.namePost;
      post(px, pz, [{ plate: true, face: LENS - 0.52, rect: R.arm, w: 2.4 },
        { to: Math.atan2(x0 - px, z0 - pz), rect: R.arm2, w: 2.15 }], 3.8);   // the arm clears a hat (bottom ≈ 2.2) — and the board behind
      claimCircle(px, pz, 1.4, 'blimp_mooring');
    }
    // ballast by the mast: three sugar sacks and a licorice rope coil
    {
      const [sx0, sz0] = S.sacks;
      const yaw = m.heading;
      [[0, 0, 1], [0.95, 0.25, 0.9], [0.45, 0.9, 0.85]].forEach(([dx, dz, sc], i) => {
        const x = sx0 + dx * Math.cos(yaw) + dz * Math.sin(yaw), z = sz0 - dx * Math.sin(yaw) + dz * Math.cos(yaw);
        const y = gy(x, z);
        k.add(new THREE.SphereGeometry(0.62 * sc, 10, 8), M4(x, y + 0.42 * sc, z, 0, i, 0, 1, 0.78, 0.9), CREAM);
        k.add(new THREE.TorusGeometry(0.5 * sc, 0.07, 5, 12), M4(x, y + 0.5 * sc, z, Math.PI / 2, 0, 0, 1.02, 0.92, 1), RED);
        k.add(new THREE.ConeGeometry(0.2 * sc, 0.34 * sc, 7), M4(x, y + 0.92 * sc, z), CREAM);
      });
      const cx = sx0 + 0.6, cz = sz0 + 1.9, cy = gy(cx, cz);
      for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.62 - i * 0.05, 0.1, 6, 16), M4(cx, cy + 0.08 + i * 0.16, cz, Math.PI / 2), i % 2 ? 0x8a1426 : 0xc8203c);
      ctx.colliders.push({ x: sx0 - 0.4, z: sz0 - 0.4, r: 1.2, h: 0.75 });
      claimCircle(sx0, sz0, 3.0, 'blimp_mooring');
    }
    // ── the trail: sugar-cookie stepping stones, lake road → the wafer ───────
    const tr = [...S.trail, [x0, z0]];
    const STONE = [0xffc6dc, 0xfff0d6, 0xbff2dc, 0xffe3a6];
    let n = 0, carry = 0.6;
    for (let i = 0; i < tr.length - 1; i++) {
      const [ax, az] = tr[i], [bx0, bz0] = tr[i + 1];
      const L = Math.hypot(bx0 - ax, bz0 - az), dx = (bx0 - ax) / L, dz = (bz0 - az) / L;
      // across the headland's scrub: a corridor the gummies and marshmallow
      // rocks give up (PASS 4 blanks them; their trunks are disarmed at world:ready)
      if (i >= S.clearFrom) for (let d = 0; d < L; d += 2.5) claimCircle(ax + dx * d, az + dz * d, 2.3, 'blimp_trail');
      for (let d = carry; d < L; d += 1.55) {
        const x = ax + dx * d, z = az + dz * d;
        if (Math.hypot(x - x0, z - z0) < apronAt(x, z) + 0.6) { carry = 0; break; }
        const j = Math.sin(n * 2.4) * 0.28, px = x - dz * j, pz = z + dx * j;
        const r0 = 0.5 + 0.1 * Math.abs(Math.sin(n * 1.7));
        let hi = -1e9, lo = 1e9;
        for (let q = 0; q < 6; q++) { const h = gy(px + Math.cos(q) * r0, pz + Math.sin(q) * r0); hi = Math.max(hi, h); lo = Math.min(lo, h); }
        hi = Math.max(hi, gy(px, pz));
        const th = hi - lo + 0.13;
        k.add(new THREE.CylinderGeometry(r0, r0 + 0.06, th, 11), M4(px, hi + 0.07 - th / 2, pz, 0, n, 0), STONE[n % 4]);
        // sprinkles on every other cookie
        if (n % 2 === 0) for (let q = 0; q < 3; q++) k.add(new THREE.BoxGeometry(0.2, 0.05, 0.06), M4(px + Math.cos(q * 2.1 + n) * r0 * 0.5, hi + 0.09, pz + Math.sin(q * 2.1 + n) * r0 * 0.5, 0, q * 1.3 + n, 0), [RED, MINT, 0x6aa8ff][q]);
        claimCircle(px, pz, 1.1, 'blimp_trail');
        n++;
        carry = d + 1.55 - L;
      }
      if (carry < 0) carry = 0;
    }
    stoneCount = n;
    // the junction post where the trail leaves the lake road, and a waymark
    // where it turns west along the ridge south of the lake
    {
      const [jx, jz] = S.junction, [tx, tz] = tr[1];
      post(jx, jz, [{ to: Math.atan2(tx - jx, tz - jz), rect: R.arm }], 3.2);
      claimCircle(jx, jz, 1.4, 'blimp_trail');
      const [wx, wz, wi] = S.waymark, [ux, uz] = tr[wi];
      post(wx, wz, [{ to: Math.atan2(ux - wx, uz - wz), rect: R.arm, w: 2.3 }], 2.7);
      claimCircle(wx, wz, 1.4, 'blimp_trail');
    }
    // ── the shore: sparse, windswept ─────────────────────────────────────────
    const rnd = rng(hash('blimp:sugar-mooring-shore'));
    // dune candy-grass: tufts of fat mint blades with cream tips, all leaning
    // downwind (the wind is off the sea: east, a little north)
    for (const [tx, tz, nb] of S.tufts) {
      if (gy(tx, tz) < 0.6) continue;
      if (Math.hypot(tx - x0, tz - z0) < apronAt(tx, tz) + 0.3) continue;
      for (let b = 0; b < nb; b++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.5, bx = tx + Math.cos(a) * rr, bz = tz + Math.sin(a) * rr;
        const hh = 0.75 + rnd() * 0.75, lean = 0.3 + rnd() * 0.3, base = sy(bx, bz) - 0.06;
        const col = (x, y) => (y - base > hh * 0.62 ? 0xfff2d6 : y - base > hh * 0.3 ? 0x9ee6bd : 0x6cc79a);
        k.add(new THREE.ConeGeometry(0.14, hh, 4, 2), M4(bx + Math.sin(lean) * hh * 0.5, base + Math.cos(lean) * hh * 0.5, bz - Math.sin(lean) * hh * 0.12, (rnd() - 0.5) * 0.3, rnd() * TAU, -lean), col);
      }
    }
    // driftwood candy canes: bleached shafts half sunk in the sand, the hook
    // lying flat at one end, stripes faded to blush
    for (const [ax, az, bx, bz, hook] of S.driftwood) {
      const ha = gy(ax, az), hb = gy(bx, bz);
      if (Math.min(ha, hb) < 0.3) continue;
      const ux = bx - ax, uz = bz - az, L = Math.hypot(ux, uz), yA = ha + 0.05, yB = hb + 0.05;
      const fade = (x, y, z) => ((Math.floor(((x - ax) * ux + (z - az) * uz) / L * 3.2 + 40) % 2) ? 0xf7ece0 : 0xe9b3b3);
      k.add(new THREE.CylinderGeometry(0.17, 0.17, Math.hypot(L, yB - yA), 9, Math.ceil(L * 3)), along(ax, yA, az, bx, yB, bz), fade);
      if (hook) {
        const psi = Math.atan2(-ux / L, -uz / L);
        const hm = new THREE.Matrix4().makeRotationY(psi).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        hm.setPosition(bx + Math.cos(psi) * 0.42, yB, bz - Math.sin(psi) * 0.42);
        k.add(new THREE.TorusGeometry(0.42, 0.16, 6, 10, Math.PI), hm, (x, y, z) => ((Math.floor(Math.atan2(z - bz, x - bx) * 2.2 + 40) % 2) ? 0xf7ece0 : 0xe9b3b3));
      }
    }
    // sea-worn gumdrop pebbles
    const PEB = [0xffb3c7, 0xbde8ff, 0xfff0a8, 0xc9f2d4, 0xe6c9ff];
    S.pebbles.forEach(([px, pz, r0], i) => {
      const y = sy(px, pz); if (y < 0.25) return;
      k.add(new THREE.SphereGeometry(r0, 9, 6), M4(px, y + r0 * 0.18, pz, 0, i, 0, 1, 0.55, 0.85), PEB[i % PEB.length]);
    });
    // the gummy trees the forest planted ON the cliffs' sugar-rock boulder
    // east of the wafer (vegetation cannot see terrain decor): gone
    for (const [cx, cz, cr] of S.offRock) claimCircle(cx, cz, cr, 'blimp_mooring');
    // the hull's footprint: nothing tall under the gondola or round the mast
    const fx = Math.sin(m.heading), fz = Math.cos(m.heading);
    for (const a of [-6, 0, 6, 12]) claimCircle(x0 + fx * a, z0 + fz * a, 6.2, 'blimp_mooring_hull');
  }
  let stoneCount = 0, surfAt = null;
  const glowAt = [];
  function mergeTwo(a, b) {
    const out = new THREE.BufferGeometry();
    for (const key of ['position', 'normal', 'color', 'uv']) {
      const A = a.attributes[key].array, B2 = b.attributes[key].array, it = a.attributes[key].itemSize;
      const arr = new Float32Array(A.length + B2.length); arr.set(A, 0); arr.set(B2, A.length);
      out.setAttribute(key, new THREE.BufferAttribute(arr, it));
    }
    return out;
  }
  // THE SUGAR MOORING's layout (world coordinates; see buildMooring). The
  // blimp noses NORTH here: the hull hangs over x -244…-236, z 33…58.5 —
  // everything but the wafer stands outside that strip or well under it.
  const MOORING = {
    site: [-239.3, 46.3],                    // the ladder foot this was drawn round
    padR: 2.3, rim: 0.3, slope: 0.72,        // wafer radius, the rim step, the sugar apron's fall per unit
    stepOff: [-237.7, 47.0],                 // where a rider steps off the ladder (toward the trail)
    lamp: [-242.4, 50.5],                    // the seaward (south-west) corner, between the wafer and the sea
    bench: [-244.4, 47.4, -Math.PI / 2],     // the west edge of the headland, looking out to sea
    // the tall things stand BEHIND the wafer or well to its side from the
    // default lens: in front of it the camera's cutout carves them away
    namePost: [-235.7, 44.1],                // the wafer's east side, facing the lens and the arriving trail
    board: [-243.2, 43.1, LENS],             // timetable, straight behind the wafer from the lens: faces both
    sacks: [-226.0, 37.4],                   // ballast at the mast's foot
    // lake road (junction) → round the lake's east and south shores, outside
    // its zone (≥ 21 u from the centre) → west along the ridge → over the neck
    // of the headland (east of the cliff ledge) → between the sugar-rock
    // boulder and the ledge → the wafer
    trail: [[-178, 40.5], [-177, 50], [-179, 60], [-186, 66.5], [-196, 69], [-206, 69.6], [-214.5, 69.0],
      [-221.5, 65.6], [-225.8, 60.8], [-228.6, 56.6], [-230.4, 53.2], [-234.8, 52.6]],
    clearFrom: 6,                            // segments from here on cross the headland's scrub
    junction: [-178.6, 37.6],
    waymark: [-201.2, 67.2, 6],              // x, z, and the trail point its arm points at
    // measured against the rendered cliff ledges, boulders and the beach
    // gumdrop (tools/_tmp/blimpp/probe_rock.mjs): all of these stand clear of them
    tufts: [[-245.4, 44.4, 6], [-246.0, 48.6, 5], [-244.4, 51.4, 5], [-237.4, 51.6, 5], [-231.2, 54.6, 4], [-229.0, 59.2, 6],
      [-226.6, 63.4, 5], [-239.6, 38.8, 5], [-232.4, 41.0, 4]],
    driftwood: [[-246.4, 48.4, -245.6, 45.8, 1], [-225.6, 66.8, -223.4, 68.4, 1], [-228.2, 62.8, -229.6, 61.0, 0]],
    offRock: [[-230.2, 49.0, 3.4], [-240.2, 40.2, 2.6]],
    pebbles: [[-245.8, 47.2, 0.34], [-246.6, 45.0, 0.28], [-244.6, 49.8, 0.3], [-224.4, 67.4, 0.3], [-227.0, 65.2, 0.26],
      [-236.2, 52.2, 0.24], [-229.2, 57.8, 0.3]],
  };
  // the sugar apron round the wafer (buildMooring fills it; the walkable reads it):
  // per wedge, where it meets the ground and at what height
  const APRON = { n: 48, ro: new Float32Array(48), yo: new Float32Array(48), max: 0 };
  const meshH = terrainMeshSampler(world);
  // where each board stands (world), and which way it faces (yaw of its front)
  const BOARD = {
    // the Sugar Mooring: beside the landing wafer (Sugar Pier's planks before WAVE 5)
    candy: MI.candy.pad ? { x: MOORING.board[0], z: MOORING.board[1], face: MOORING.board[2], deck: false } : { x: MI.candy.foot.x - 0.2, z: 19.75, face: 0, deck: true },
    // on the lawn south of the ladder foot, facing the quay path (south-east)
    cat: { x: MI.cat.foot.x + 0.4, z: MI.cat.foot.z + 3.4, face: 2.35, deck: false },
  };
  const retire = [];
  const collStart0 = ctx.colliders.length;
  for (const name of ['candy', 'cat']) {
    try { buildMast(name); } catch (err) { console.error('[escape/blimp] mast ' + name + ' failed', err); }
  }
  // the Sugar Mooring's lantern after dark: a soft additive bloom (crossed
  // radial-falloff quads) and a warm pool on the ground, in the candy
  // architecture's language (kit.js softGlow + lightPool). One draw call, only
  // while the lamps are lit; never casts, never raycast.
  let halo = null, haloMat = null;
  if (glowAt.length) {
    try {
      const S2 = 64, cv2 = document.createElement('canvas'); cv2.width = cv2.height = S2;
      const g2 = cv2.getContext('2d'), grd = g2.createRadialGradient(S2 / 2, S2 / 2, 0, S2 / 2, S2 / 2, S2 / 2);
      grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, '#9a9a9a'); grd.addColorStop(0.7, '#262626'); grd.addColorStop(1, '#000');
      g2.fillStyle = grd; g2.fillRect(0, 0, S2, S2);
      const fall = new THREE.CanvasTexture(cv2);
      haloMat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffb861, emissiveMap: fall, emissiveIntensity: 0, roughness: 1, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
      });
      haloMat.name = 'blimp_mooring_halo';
      const parts = [];
      for (const [x, y, z] of glowAt) {
        for (const ry of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(2.7, 2.7); q.rotateY(ry); q.translate(x, y, z); parts.push(q); }
        const hq = new THREE.PlaneGeometry(2.4, 2.4); hq.rotateX(-Math.PI / 2); hq.translate(x, y, z); parts.push(hq);
        const gy0 = meshH(x, z);
        const pool = new THREE.CircleGeometry(2.6, 20); pool.rotateX(-Math.PI / 2); pool.scale(1.24, 1, 1); pool.translate(x, gy0 + 0.12, z); parts.push(pool);
      }
      const P = [], U = [];
      for (const q of parts) {
        const gg = q.index ? q.toNonIndexed() : q;
        P.push(...gg.attributes.position.array); U.push(...gg.attributes.uv.array);
        if (gg !== q) gg.dispose(); q.dispose();
      }
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      hg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      hg.computeVertexNormals(); hg.computeBoundingSphere();
      halo = new THREE.Mesh(hg, haloMat);
      halo.name = 'blimp_mooring_halo'; halo.castShadow = false; halo.receiveShadow = false; halo.visible = false;
      halo.raycast = () => {};
      halo.renderOrder = 2;
      ctx.scene.add(halo);
    } catch (err) { console.warn('[escape/blimp] mooring glow skipped', err); halo = null; }
  }
  // the landing wafer is a deck (Contract A walkable): flat on top, a short
  // ramp over the rim step, then down the sugar apron to the ground — the
  // surface buildMooring draws — so feet (and Sour Patch Kids) ride it
  if (MI.candy.pad) {
    const m = MI.candy, R1 = MOORING.padR + 0.04, RS = R1 + 0.25, top = m.foot.y, yi = top - MOORING.rim, N = APRON.n;
    const RR = APRON.max || R1 + 1;
    ctx.walkables = ctx.walkables || [];
    ctx.walkables.push({
      mooring: true,
      test(x, z) {
        const dx = x - m.foot.x, dz = z - m.foot.z, d2 = dx * dx + dz * dz;
        if (d2 > RR * RR) return null;
        if (d2 <= R1 * R1) return top;
        const d = Math.sqrt(d2), g = world.height(x, z);
        if (d <= RS) return Math.max(g, top + (yi - top) * (d - R1) / (RS - R1));
        // down the apron wedge this point is in, to where it meets the ground
        let f = Math.atan2(dz, dx) / TAU * N - 0.5; f = ((f % N) + N) % N;
        const i0 = Math.floor(f), t = f - i0, i1 = (i0 + 1) % N;
        const ro = APRON.ro[i0] + (APRON.ro[i1] - APRON.ro[i0]) * t;
        if (d >= ro) return null;
        const yo = APRON.yo[i0] + (APRON.yo[i1] - APRON.yo[i0]) * t + 0.07;
        return Math.max(g, yi + (yo - yi) * (d - RS) / Math.max(0.05, ro - RS));
      },
    });
  }
  // colliders this file pushed (never disarmed below)
  const collStart = ctx.colliders.length;
  ctx.events.on('world:ready', () => {
    // Candy vegetation has just blanked every plant inside our claims — but
    // its trunk / rock colliders stay behind as invisible walls. Disarm the
    // small ones inside a claim that belong to a plant (an instance sits on
    // them: blanking zeroes the scale, not the position) which is really gone
    // (no visible instance there), as the airfield does under its runway.
    // Anybody else's props are left alone.
    const circles = retire.filter((c) => c.r > 0);
    let disarmed = 0;
    try {
      const inClaim = (x, z) => circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - 0.15);
      const cand = [];
      for (let i = 0; i < ctx.colliders.length; i++) {
        const c = ctx.colliders[i];
        if (!c || c.claim || c.solid === false || (i >= collStart0 && i < collStart)) continue;
        // plant trunks are small circles; fallen chocolate logs are small boxes
        const cr = c.box ? 0.5 * Math.hypot(c.w || 0, c.d || 0) : c.r;
        if (!(cr > 0) || cr > (c.box ? 3.8 : 1.6)) continue;
        if (inClaim(c.x, c.z)) cand.push(c);
      }
      if (cand.length) {
        const live = [];
        for (const rec of ctx.systems.candyVegetation?.meshes || []) {
          const a = rec.mesh?.instanceMatrix?.array; if (!a) continue;
          for (let i = 0; i < rec.n; i++) {
            const o = i * 16, x = a[o + 12], z = a[o + 14];
            if (x < -262 || x > -150) continue;
            const on = a[o] * a[o] + a[o + 1] * a[o + 1] + a[o + 2] * a[o + 2] > 1e-6;
            for (const c of cand) if (Math.abs(x - c.x) < 0.4 && Math.abs(z - c.z) < 0.4) { c._blimpPlant = true; if (on) c._blimpLive = true; }
          }
        }
        for (const c of cand) { if (c._blimpPlant && !c._blimpLive) { c.solid = false; disarmed++; } delete c._blimpLive; delete c._blimpPlant; }
      }
    } catch (err) { console.warn('[escape/blimp] trunk clean-up skipped', err); }
    if (disarmed) console.warn('[escape/blimp] Sugar Mooring: disarmed ' + disarmed + ' colliders of plants cleared from the mooring and trail');
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
  let from = null, to = null, st = 0, lastPhase = null, landedFor = 0, sayT = 0, saidMid = false, saidCoast = false;
  let atStop = false, stopSaid = -1e9;         // the Sugar Mooring's arrival banner (on foot)
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
    from = name; to = OTHER[name]; state = 'up'; st = 0; saidMid = false; saidCoast = false; landedFor = 0;
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
    // step off the roundel toward the island (never back under the ladder);
    // at the Sugar Mooring, toward the name post and the trail
    const so = m.pad ? MOORING.stepOff : null;
    const sx = so ? so[0] : m.foot.x - Math.sin(m.heading) * 0.2 + Math.cos(m.heading) * 1.4;
    const sz = so ? so[1] : m.foot.z - Math.cos(m.heading) * 0.2 - Math.sin(m.heading) * 1.4;
    if (m.pad) { atStop = true; stopSaid = ctx.state.elapsed || 0; }
    rider.unmount(sx, sz);
    state = 'idle';
    const toIsland = m.island;
    escape.success('blimp', { to: toIsland, from: from === 'candy' ? 'candy' : 'cat', landing: { x: sx, z: sz } });
    if (toIsland === 'candy') {
      try { ctx.systems.story?.set('escape_card_shown_blimp', true); } catch (err) { /* optional */ }
      ui()?.card?.({ title: 'ESCAPED', body: 'You escaped Cat Island by blimp. The cats waved you off. The cats wave at everything.', buttons: [{ label: 'For now.' }] });
      ui()?.toast?.('The Sugar Mooring. Feet on candy again — the cookie stones lead to the lake road.', 4.2);
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
    // Arriving on foot, the Sugar Mooring names itself: it lies in no landmark
    // zone (that is the point of it), so the HUD would otherwise say nothing —
    // and after dark the timetable reminds you the blimp is a way off.
    if (tick && pl && MI.candy.pad && state === 'idle') {
      const d = Math.hypot(pl.x - MI.candy.foot.x, pl.z - MI.candy.foot.z);
      if (!atStop && d < 12) {
        atStop = true;
        const now = ctx.state.elapsed || 0;
        if (now - stopSaid > 150 && !introOn()) {
          stopSaid = now;
          const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
          try {
            ui()?.banner?.('Sugar Mooring', night ? 'the blimp still runs · keep to the lantern' : 'blimp stop · the end of the trail', 3.6, 'candy');
            if (night) ui()?.say?.(`Night service. The SUGAR moors here every ${Math.round(PB.cycle / 60 * 10) / 10} minutes — next one ${fmt(PB.eta('candy'))}. Wait on the wafer, in the light.`, { speaker: 'Timetable', duration: 4.6 });
          } catch (err) { /* optional */ }
        }
      } else if (atStop && d > 18) atStop = false;
    }
    const lamp = ctx.systems.sky?.lampMix ?? (ctx.state.isNight ? 1 : 0);
    mat.emissiveIntensity = 1.35 * lamp;
    if (halo) { halo.visible = lamp > 0.02; haloMat.emissiveIntensity = 1.5 * lamp; haloMat.opacity = lamp; }

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
        // (starboard: the SUGAR flank — planes.js letters that side for the lens)
        FLY.heading = PB.heading + 1.0;
        ctx.state.flying = FLY;
        hushOn(true);
        const camY = ctx.camera.position.y;
        ctx.state.fogScale = Math.max(1, fogSaved || 1, 1 + clamp((camY - 30) / 60, 0, 1.2));
        if (!saidMid && PB.phase === 'cruise' && Math.abs(seat.x) < 20) {
          saidMid = true;
          const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
          ui()?.say(night ? 'Those lights on the water are not boats.' : 'Halfway! On your left: the sea. On your right: also the sea.', { speaker: CAPTAIN, duration: 3.6 });
        }
        // WAVE 5: the south-coast leg is the scenic part of the trip now
        if (!saidCoast && PB.phase === 'cruise' && Math.abs(seat.x + 120) < 14) {
          saidCoast = true;
          const night = !!(ctx.systems.sky?.lampsOn ?? ctx.state.isNight);
          ui()?.say(night ? 'Keep your voice down over the Kingdom. Something down there counts the blimps.'
            : 'Below us: the Candy Kingdom\'s south coast. The Syrup Delta, the airfield, and a great many sweets who think they are hiding.', { speaker: CAPTAIN, duration: 4.4 });
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
        if (m.pad) rider.unmount(MOORING.stepOff[0], MOORING.stepOff[1]);
        else rider.unmount(m.foot.x + Math.cos(m.heading) * 1.4, m.foot.z - Math.sin(m.heading) * 1.4);
        state = 'idle'; from = to = null;
      } else endRide(to);
    }
  };

  Object.defineProperty(route, 'riding', { get: () => state !== 'idle' });
  Object.defineProperty(route, 'state', { get: () => state });
  route.ready = () => true;
  /** Views: board at the Sugar Mooring and jump the blimp to k of the crossing (0.5 ≈ the south coast). */
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
  /** Tests: the Sugar Mooring's layout (world) and how many cookie stones were laid. */
  route.mooring = () => ({ foot: MI.candy.foot, stones: stoneCount, trail: MOORING.trail, junction: MOORING.junction, waymark: MOORING.waymark, lamp: MOORING.lamp, bench: MOORING.bench, namePost: MOORING.namePost, board: MOORING.board });
  /** Views: get off whatever we were doing (a view run after a ride view). */
  route.debugReset = function debugReset() {
    route._freeze = false;
    if (state !== 'idle') { PB.holdLadder(null); ctx.state.flying = null; hushOn(false); rider.unmount(); state = 'idle'; from = to = null; route._aborted = false; }
    try { ui()?.clear?.(); } catch (err) { /* optional */ }
    return true;
  };
  return escape.register('blimp', route);
}
