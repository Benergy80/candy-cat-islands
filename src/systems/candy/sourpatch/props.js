// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID props.
//   · the half-licked lollipop in Lollipop Meadow (their day gag)
//   · the stolen hat (only costs anything while it is being stolen)
//   · THE SALT LINE — the safe ring around Sugar Pier. Critique r1 read it as
//     "just a picket fence" and r3 as "scattered floating shards", so it is now
//     a CONTINUOUS RIDGE: one ribbon mesh swept round r≈14 from the dock, five
//     vertices wide with a raised spine, every vertex snapped to world.height
//     (the profile is an offset from the terrain, so nothing can float and
//     nothing bridges the water), clustered crystals sitting on the spine, a
//     soft white ground band under it all, and a little sign that explains the
//     rule and then undermines it.
// 8 draw calls drawn (2 lollipop, 1 ridge, 1 crystals, 1 band, 3 sign) plus 2
// for the hat, which is hidden except during the theft.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat, shadows, rng, hash } from '../../../core/util.js';
import { CANDY } from '../../../core/palette.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Painted board: big rule, small disclaimer. */
function signTexture() {
  const W = 512, H = 176;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2d3a5c'; g.lineWidth = 9; g.strokeRect(11, 11, W - 22, H - 22);
  g.textAlign = 'center';
  g.fillStyle = '#2d3a5c';
  g.font = 'bold 62px "Trebuchet MS", sans-serif';
  g.fillText('SALT LINE', W / 2, 76);
  g.fillStyle = '#7b5a86';
  g.font = 'italic 33px "Trebuchet MS", sans-serif';
  g.fillText("they won't cross. probably.", W / 2, 126);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export function createProps(ctx, lolliSpot, salt) {
  const { world } = ctx;
  const g = new THREE.Group(); g.name = 'sourpatch-props'; ctx.scene.add(g);
  const rand = rng(hash('sourpatch-props'));

  // ── the smallest lollipop in the meadow, licked flat on one side ──────────
  const lolli = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 6), mat(CANDY.cream, { roughness: 0.6 }));
  stick.position.y = 0.95;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 16), mat(CANDY.syrup, { roughness: 0.35 }));
  disc.rotation.x = Math.PI / 2; disc.rotation.z = 0.25;
  disc.scale.set(1, 1, 0.78);               // the licked-down side
  disc.position.set(0.03, 1.98, 0);
  lolli.add(stick, disc);
  lolli.position.set(lolliSpot.x, lolliSpot.y, lolliSpot.z);
  lolli.rotation.y = lolliSpot.yaw ?? 0;
  shadows(lolli);
  g.add(lolli);
  ctx.colliders?.push({ x: lolliSpot.x, z: lolliSpot.z, r: 0.75 });

  // ── the hat (visible only during the theft) ───────────────────────────────
  const hat = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 10), mat(0x3aa8ff, { roughness: 0.6 }));
  crown.position.y = 0.16;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.045, 12), mat(0x1a1218, { roughness: 0.7 }));
  hat.add(crown, brim); shadows(hat);
  hat.visible = false;
  g.add(hat);

  // ── THE SALT LINE ─────────────────────────────────────────────────────────
  const CX = salt.x, CZ = salt.z, R = salt.r;
  const onLand = (x, z) => world.height(x, z) > 0.34;

  // 1. THE RIDGE (critique r3: "scattered floating shards"). The salt line is
  //    one continuous low crust of poured sugar — a ribbon mesh swept round the
  //    ring, five vertices wide, every single one snapped to world.height, with
  //    a raised spine down the middle. Nothing floats because nothing is placed
  //    independently of the ground: the profile is an OFFSET from the terrain.
  //    Segments that run out over the water simply are not emitted.
  const RIDGE_SEG = 180;
  const LAT = [-1.25, -0.60, 0.0, 0.60, 1.25];      // metres either side of the line
  const LIFT = [0.02, 0.125, 0.225, 0.125, 0.02];   // crust profile
  const ridge = (() => {
    const pos = [], col = [], idx = [];
    const ringOK = [];
    const vAt = (s, r) => (s * 5 + r);
    for (let s = 0; s <= RIDGE_SEG; s++) {
      const a = (s / RIDGE_SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      let ok = true;
      for (let r = 0; r < 5; r++) {
        const x = CX + ca * (R + LAT[r]), z = CZ + sa * (R + LAT[r]);
        const h = world.height(x, z);
        if (h <= 0.30) ok = false;
        // a little wobble so the crust is poured, not printed
        const wob = 0.72 + 0.28 * Math.sin(a * 9.3 + r * 0.7) * Math.sin(a * 3.1 + 1.4);
        pos.push(x, Math.max(0.10, h) + LIFT[r] * wob + 0.012, z);
        const shade = r === 2 ? 1.0 : 0.93;
        col.push(shade, shade, shade * 0.995);
      }
      ringOK.push(ok);
    }
    for (let s = 0; s < RIDGE_SEG; s++) {
      if (!ringOK[s] || !ringOK[s + 1]) continue;      // don't bridge the water
      for (let r = 0; r < 4; r++) {
        const a0 = vAt(s, r), a1 = vAt(s, r + 1), b0 = vAt(s + 1, r), b1 = vAt(s + 1, r + 1);
        idx.push(a0, b0, b1, a0, b1, a1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.38, metalness: 0.0, flatShading: true,
      emissive: new THREE.Color(0x44506e), emissiveIntensity: 0.30,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true; mesh.castShadow = false;
    return mesh;
  })();
  g.add(ridge);

  // 2. the crystals ON the ridge: clusters of octahedra sitting on the spine,
  //    never off on their own, never above the ground — y comes from the same
  //    world.height the ribbon used, plus the crust profile at that offset.
  const CRYST = 260;
  const crystGeo = new THREE.OctahedronGeometry(1, 0);
  // NOTE: no `vertexColors` — the hue comes from instanceColor, and asking for
  // vertex colours without a `color` attribute makes the vertex shader read a
  // zeroed generic attribute and paints every crystal black.
  const crystMat = new THREE.MeshStandardMaterial({
    roughness: 0.34, metalness: 0.0, flatShading: true,
    emissive: new THREE.Color(0x3a4a66), emissiveIntensity: 0.4,
  });
  const cryst = new THREE.InstancedMesh(crystGeo, crystMat, CRYST);
  cryst.castShadow = true; cryst.receiveShadow = true;
  let nC = 0;
  const SALT_HUES = [0xffffff, 0xf6f9ff, 0xeaf2ff, 0xfff6fb];
  const CLUSTERS = 70;
  for (let c = 0; c < CLUSTERS && nC < CRYST; c++) {
    const ang = (c / CLUSTERS) * Math.PI * 2 + rand() * 0.05;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (!onLand(CX + ca * R, CZ + sa * R)) continue;
    const n = 3 + ((rand() * 4) | 0);
    for (let i = 0; i < n && nC < CRYST; i++) {
      const lat = (rand() - 0.5) * 1.35;                 // stays inside the crust
      const off = (rand() - 0.5) * 0.55;                 // a little along the line
      const x = CX + ca * (R + lat) - sa * off, z = CZ + sa * (R + lat) + ca * off;
      if (!onLand(x, z)) continue;
      const prof = 0.225 * Math.max(0, 1 - (Math.abs(lat) / 1.25) ** 1.6);   // the ridge profile
      const sc = (i === 0 ? 0.20 + rand() * 0.16 : 0.085 + rand() * 0.11);
      _e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28); _q.setFromEuler(_e);
      _p.set(x, Math.max(0.10, world.height(x, z)) + prof + sc * 0.42, z);
      _s.set(sc * (0.8 + rand() * 0.5), sc * (0.7 + rand() * 0.5), sc * (0.8 + rand() * 0.5));
      _m.compose(_p, _q, _s);
      cryst.setMatrixAt(nC, _m);
      cryst.setColorAt(nC, _c.setHex(SALT_HUES[(rand() * SALT_HUES.length) | 0]));
      nC++;
    }
  }
  for (let i = nC; i < CRYST; i++) cryst.setMatrixAt(i, _m.makeScale(0, 0, 0));
  cryst.count = Math.max(1, nC);
  cryst.instanceMatrix.needsUpdate = true;
  if (cryst.instanceColor) cryst.instanceColor.needsUpdate = true;
  g.add(cryst);

  // 3. the ground band: a terrain-following annulus that fades at both edges,
  //    so from the pier you can SEE where the rule is even in the dark. Wider
  //    than the ridge, and washed out under it.
  const band = (() => {
    const SEG = 132;
    const radii = [R - 2.4, R, R + 2.4];
    const pos = new Float32Array((SEG + 1) * 3 * 3);
    const col = new Float32Array((SEG + 1) * 3 * 4);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      for (let r = 0; r < 3; r++) {
        const x = CX + Math.cos(a) * radii[r], z = CZ + Math.sin(a) * radii[r];
        const i = (s * 3 + r);
        pos[i * 3] = x; pos[i * 3 + 1] = Math.max(0.08, world.height(x, z)) + 0.05; pos[i * 3 + 2] = z;
        const edge = r === 1 ? 1 : 0;
        const land = world.height(x, z) > 0.30 ? 1 : 0;
        col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1;
        col[i * 4 + 3] = 0.34 * edge * land;
      }
    }
    const idx = [];
    for (let s = 0; s < SEG; s++) for (let r = 0; r < 2; r++) {
      const a0 = s * 3 + r, a1 = s * 3 + r + 1, b0 = (s + 1) * 3 + r, b1 = (s + 1) * 3 + r + 1;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // A ground decal is not lit geometry — an unlit white wash is the point.
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: true,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 2;
    return mesh;
  })();
  g.add(band);

  // 4. the sign, planted on the village side of the line beside the licorice road
  const sign = new THREE.Group();
  {
    // Walk the whole ring and pick the spot that is (a) open ground, (b) well
    // clear of every other prop — the r1 sign ended up tucked behind the
    // CANDYLAND billboard and never read — and (c) as close as possible to the
    // bearing of the licorice road, so you meet it on the way out.
    const roadAng = Math.atan2(30 - CZ, -70 - CX);
    let best = null;
    for (let a = 0; a < 96; a++) {
      const ang = (a / 96) * Math.PI * 2;
      const x = CX + Math.cos(ang) * (R - 0.5), z = CZ + Math.sin(ang) * (R - 0.5);
      if (!world.isFreeGround(x, z, { pathMargin: 1.0, avoidLandmarks: false, minHeight: 0.6 })) continue;
      let near = 99;
      for (const c of ctx.colliders || []) {
        if (c.r < 0.3) continue;
        const d = Math.hypot(c.x - x, c.z - z) - c.r;
        if (d < near) near = d;
      }
      if (near < 1.8) continue;
      const dA = Math.abs(Math.atan2(Math.sin(ang - roadAng), Math.cos(ang - roadAng)));
      const score = dA - Math.min(near, 6) * 0.10;
      if (!best || score < best.score) best = { x, z, ang, score, near: +near.toFixed(2) };
    }
    const ux = best ? Math.cos(best.ang) : -0.96, uz = best ? Math.sin(best.ang) : 0.27;
    const sx = best ? best.x : CX + ux * (R - 0.5), sz = best ? best.z : CZ + uz * (R - 0.5);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 1.95, 7), mat(0xe8e2ea, { roughness: 0.75 }));
    post.position.y = 0.97;
    // one material for the whole board (six would be six draw calls); the edge
    // faces are 10 cm wide so the wrapped texture never reads as anything there.
    // A touch of emissive keeps it legible after dark, when this sign matters.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.74, 0.10),
      new THREE.MeshStandardMaterial({
        map: signTexture(), roughness: 0.62, metalness: 0,
        emissive: new THREE.Color(0x6a6274), emissiveIntensity: 0.35,
      }),
    );
    board.position.y = 1.80;
    // a little cairn of salt heaped at the foot of the post
    const heap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.36, 7), mat(0xfdfdff, { roughness: 0.5 }));
    heap.position.y = 0.15;
    sign.add(post, board, heap);
    sign.position.set(sx, Math.max(0.08, world.height(sx, sz)), sz);
    sign.rotation.y = Math.atan2(-ux, -uz);     // face back toward the pier
    shadows(sign);
    ctx.colliders?.push({ x: sx, z: sz, r: 0.55 });
  }
  g.add(sign);

  return {
    group: g, lolli, hat, sign, salt: { crystals: cryst, ridge, band, count: nC },
    lolliTip: { x: lolliSpot.x + Math.sin(lolliSpot.yaw ?? 0) * 0.1, y: lolliSpot.y + 1.95, z: lolliSpot.z },
  };
}
