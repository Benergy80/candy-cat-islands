// ─────────────────────────────────────────────────────────────────────────────
// RUSTY — the smuggler cat under the quay at (92,44).
//
// One eye, one crate, one lantern and a map of Candyland with a dotted line on
// it. He is the only cat on the island who will admit out loud that there is an
// off-island. He does not do this for free. He does it for CANDY.
//
// This file owns his hideout geometry (3 draw calls) and everything he says.
// The economy itself lives in citizens.js (it needs story + inventory).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../../../core/util.js';

// ── tiny local merge (vertex-coloured, one draw call for the whole shack) ─────
function merge(items) {
  const parts = items.map((it) => ({ g: it.g.index ? it.g.toNonIndexed() : it.g, color: it.c ?? 0xffffff }));
  let n = 0; for (const p of parts) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const tc = new THREE.Color(); let o = 0;
  for (const p of parts) {
    const cnt = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array.subarray(0, cnt * 3), o * 3);
    if (p.g.attributes.normal) nor.set(p.g.attributes.normal.array.subarray(0, cnt * 3), o * 3);
    tc.set(p.color);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = tc.r; col[(o + i) * 3 + 1] = tc.g; col[(o + i) * 3 + 2] = tc.b; }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A hand-drawn map of the two islands, with the way out marked in dashes. */
function mapTexture() {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = 220;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8d7ab'; g.fillRect(0, 0, 320, 220);
  // foxing / stains
  g.fillStyle = 'rgba(150,112,58,0.18)';
  for (const [x, y, r] of [[40, 30, 26], [280, 180, 34], [180, 20, 18], [30, 190, 22]]) {
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.strokeStyle = '#8a6a38'; g.lineWidth = 4; g.strokeRect(8, 8, 304, 204);
  // Candyland (left) + Cat Island (right)
  const blob = (cx, cy, rx, ry, fill, stroke) => {
    g.beginPath();
    for (let i = 0; i <= 22; i++) {
      const a = i / 22 * Math.PI * 2;
      const w = 1 + Math.sin(a * 3 + cx) * 0.12;
      const x = cx + Math.cos(a) * rx * w, y = cy + Math.sin(a) * ry * w;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 3; g.stroke();
  };
  blob(74, 122, 46, 40, '#f2a6c4', '#b8567f');
  blob(238, 118, 50, 42, '#c7dba0', '#6f8f45');
  g.fillStyle = '#7a4a2a'; g.font = 'bold 17px Georgia'; g.textAlign = 'center';
  g.fillText('THE CANDY', 74, 60);
  g.fillText('KINGDOM', 74, 78);
  g.fillText('HERE (bad)', 238, 74);
  g.font = 'italic 13px Georgia';
  g.fillText('they eat you at night', 74, 176);
  g.fillText('they keep you forever', 238, 172);
  // the dotted way out
  g.strokeStyle = '#b8431e'; g.lineWidth = 4; g.setLineDash([9, 7]);
  g.beginPath(); g.moveTo(206, 140); g.bezierCurveTo(170, 176, 130, 168, 104, 142); g.stroke();
  g.setLineDash([]);
  // X marks the canoe
  g.strokeStyle = '#b8431e'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(276, 152); g.lineTo(294, 170); g.moveTo(294, 152); g.lineTo(276, 170); g.stroke();
  g.font = 'bold 12px Georgia'; g.fillStyle = '#b8431e';
  g.fillText('canoe', 285, 190);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s);

/**
 * Rusty's crate hideout, tucked under the quay boards. 3 draw calls:
 * merged timber+crates, the pinned map, the lantern glow.
 */
export function buildHideout(ctx, x, z, ry = 0.6) {
  const world = ctx.world;
  // the shore here falls ~0.2 per unit, so the deck sits on the LOWEST corner of
  // its own footprint and a skirt of boards hides the gap on the uphill side
  let g0 = Infinity;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    g0 = Math.min(g0, world.height(x + Math.cos(a) * 2.3, z + Math.sin(a) * 2.3));
  }
  g0 = Math.max(Math.min(g0, world.height(x, z)) - 0.04, 0.4);
  const group = new THREE.Group();
  group.name = 'rusty_hideout';
  group.position.set(x, g0, z);
  group.rotation.y = ry;

  const P = [];
  const WOOD = 0x7a5334, WOOD2 = 0x8d6440, DARK = 0x4a3524, CRATE = 0xa07a4a, CRATE2 = 0xb78e58;
  // quay boards overhead — the reason it is "under the quay"
  for (let i = 0; i < 7; i++) {
    const b = box(0.62, 0.16, 3.2); b.translate(-1.9 + i * 0.64, 2.45, -0.72);
    P.push({ g: b, c: i % 2 ? WOOD : WOOD2 });
  }
  const beam = box(4.9, 0.26, 0.34); beam.translate(0, 2.26, 0.75); P.push({ g: beam, c: DARK });
  const beam2 = box(4.9, 0.26, 0.34); beam2.translate(0, 2.26, -1.9); P.push({ g: beam2, c: DARK });
  for (const s of [-1, 1]) for (const s2 of [-1, 1]) {
    const p = cyl(0.17, 0.19, 3.8, 7); p.translate(s * 2.15, 0.9, s2 * 1.9);
    P.push({ g: p, c: DARK });
  }
  // plank floor + skirt: a flat place to keep crates on a sloping shore
  for (let i = 0; i < 8; i++) {
    const d = box(0.56, 0.14, 4.2); d.translate(-1.96 + i * 0.56, 0.06, 0);
    P.push({ g: d, c: i % 2 ? 0x93714a : 0x836441 });
  }
  for (const [w, h, dz] of [[4.6, 0.7, 2.14], [4.6, 0.7, -2.14]]) {
    const s = box(w, h, 0.16); s.translate(0, -0.34, dz); P.push({ g: s, c: DARK });
  }
  for (const sx of [-2.26, 2.26]) {
    const s = box(0.16, 0.7, 4.3); s.translate(sx, -0.34, 0); P.push({ g: s, c: DARK });
  }
  // the back wall he pins things to
  for (let i = 0; i < 5; i++) {
    const pl = box(0.5, 2.2, 0.1); pl.translate(-1.15 + i * 0.52, 1.1, -1.86);
    P.push({ g: pl, c: i % 2 ? WOOD : WOOD2 });
  }
  // crates: one to sit on, two to hide behind, one open with fish in it
  const crate = (cx, cy, cz, s, rot, col) => {
    const b = box(0.9 * s, 0.78 * s, 0.9 * s); b.rotateY(rot); b.translate(cx, cy + 0.39 * s, cz);
    P.push({ g: b, c: col });
    for (const yy of [0.16, 0.62]) {
      const r = box(0.94 * s, 0.09 * s, 0.94 * s); r.rotateY(rot); r.translate(cx, cy + yy * s, cz);
      P.push({ g: r, c: DARK });
    }
  };
  crate(-1.35, 0.13, 0.5, 1.0, 0.2, CRATE);
  crate(-1.25, 0.91, 0.35, 0.86, -0.35, CRATE2);
  crate(1.45, 0.13, -0.7, 1.05, 0.5, CRATE2);
  crate(1.55, 0.95, -0.55, 0.8, 0.1, CRATE);
  // his stool-crate, out front, where he actually sits
  crate(0.55, 0.13, 1.30, 0.78, -0.25, CRATE2);
  // a fish skeleton, a tin mug and a coil of rope: this is a home
  const rope = new THREE.TorusGeometry(0.3, 0.075, 5, 12); rope.rotateX(Math.PI / 2); rope.translate(-0.4, 0.21, -1.2);
  P.push({ g: rope, c: 0xc9b184 });
  const mug = cyl(0.12, 0.1, 0.17, 7); mug.translate(0.52, 0.83, 1.15); P.push({ g: mug, c: 0xcfd6d8 });
  const spine = box(0.5, 0.05, 0.05); spine.rotateY(0.4); spine.translate(0.9, 0.16, 1.35); P.push({ g: spine, c: 0xe8e2d2 });
  for (let i = 0; i < 5; i++) {
    const rb = box(0.04, 0.04, 0.22); rb.rotateY(0.4); rb.translate(0.72 + i * 0.09, 0.16, 1.30 + i * 0.038);
    P.push({ g: rb, c: 0xe8e2d2 });
  }
  // the lantern hook
  const hook = cyl(0.035, 0.035, 0.5, 5); hook.translate(1.15, 2.1, 0.5); P.push({ g: hook, c: DARK });
  const shell = box(0.26, 0.3, 0.26); shell.translate(1.15, 1.7, 0.5); P.push({ g: shell, c: 0x3a3038 });

  const shack = new THREE.Mesh(merge(P), mat(0xffffff, { vertexColors: true, roughness: 0.82, flatShading: false }));
  shack.castShadow = true; shack.receiveShadow = true;
  group.add(shack);

  // pinned map (double-sided so it reads from the path too)
  const mapMat = new THREE.MeshStandardMaterial({ map: mapTexture(), roughness: 0.9, side: THREE.DoubleSide });
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.06), mapMat);
  mapMesh.position.set(-0.05, 1.42, -1.78);
  mapMesh.rotation.set(0.04, 0, -0.03);
  mapMesh.castShadow = false; mapMesh.receiveShadow = true;
  group.add(mapMesh);

  // lantern flame — emissive, no real light (the NPC light budget is spent)
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 9, 7),
    mat(0xffd88a, { roughness: 0.4, emissive: 0xffbc55, emissiveIntensity: 1.4 }),
  );
  glow.position.set(1.15, 1.70, 0.5);
  group.add(glow);

  let tris = 0;
  group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return { group, glow, tris: Math.round(tris), calls: 3 };
}

// ═══ what he says ════════════════════════════════════════════════════════════
export const RUSTY = {
  // first meeting — the spray bottle, for nothing, because he likes the idea
  free: [
    "Shh. Down here. Don't look at the lantern, look at me. ...no, that's my bad eye. Other side.",
    "Name's Rusty. I move things. Fish, mostly. Secrets, when the fish are slow.",
    'You want the spray bottle. Back alley behind the Catnip Dispensary, Main Street — 112, -16. Just sitting there.',
    "That one's free. The cats HATE that thing. Watching one hate it is payment enough for me.",
    "Everyone on that street knows exactly where it is. Everyone on that street is pretending not to look at it.",
  ],
  // the ask
  ask: [
    'Everything else costs candy. Not money. Money is just paper here, and paper gets wet.',
    "I know, I know. 'Rusty, it's CANDY.' Yeah. And I'm a cat under a pier with one eye. We all pick a currency.",
    'One piece opens a mouth. Three opens a shed. Five opens a door. Standard rates.',
  ],
  none: [
    "No candy? Then we're just two lads under a jetty, which is honestly fine, but it isn't business.",
    'The Candy Kingdom has candy lying in the road. Lying in the ROAD. Nobody there believes me either.',
    "Come back with something sweet and I'll remember where I put things.",
  ],
  // tiers
  t1: [
    "...oh. Oh that's good. That's a proper one.",
    "Right. Smuggler's Cove. East, past the lighthouse, where the rocks go the wrong way — 236, 44.",
    "There's a canoe under the tarp. It's mine. It was somebody else's. Take it, and don't say my name to the water.",
  ],
  t3: [
    'Three. You keep your word. Nobody on this island keeps their word, they just keep YOU.',
    "So I went up to the catapult at the top of the harbour road. The Big Fling. 120, 78.",
    "I fixed it. New rope, new bucket, tightened the thing that goes clunk. It'll throw you clean over the water.",
    "It might also throw you clean into the water. I said fixed, not safe.",
  ],
  t5: [
    "Five. Alright. Sit down, this one's heavy.",
    'The cave under Yarn Hill goes further than the hill does. Under the sea. Comes up somewhere pink.',
    "Key's under the yarn ball. Don't tell the Mayor. Don't tell the Mayor's HAT, it's the same thing.",
    "If you get out — and you might, you've got the look — don't come back for me. I've got a crate and a view. That's a life.",
  ],
  // idle flavour, after everything is bought
  done: [
    'Canoe, catapult, cave. Three ways out. More than anyone else on this island has ever been offered.',
    "Me? I tried the canoe in '09. Got two hundred metres and the sea turned me round like a mum straightening a collar.",
    "Doesn't work for me. Never has. Might work for you. That's the whole reason I keep the map up.",
    'Go on. Before it gets dark and everyone gets... tall.',
  ],
  // reactions to the escape attempts (story flags)
  onFail: [
    'Heard you got brought back. Everybody hears. That is the actual worst part of this place.',
    "Don't sulk. Sulking is how they get you. Sulking turns into settling in.",
    "Try another way. That's what the three routes are FOR. Nobody escapes on their first go, they escape on their fourth.",
  ],
  onNight: [
    "You're out late. I'd go home, except you don't have one, and neither do I, so.",
    "They don't come under here. Something about the salt. Or the smell. I've stopped asking.",
    "Bad time to be tall and pink, friend. Sit behind the crate till it's light.",
  ],
};
