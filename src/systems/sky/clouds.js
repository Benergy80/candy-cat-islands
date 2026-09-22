// Chunky cartoon clouds: a handful of low-poly puffs merged into one blob,
// drawn as two InstancedMeshes (2 draw calls) that drift across the map and
// catch the sun colour on their sunward faces.
import * as THREE from 'three';
import { rng, hash } from '../../core/util.js';

// Clouds live above the tallest landmark (~35 + props) so they always read as
// SKY, and any cloud that drifts within NEAR_FADE of the camera shrinks away —
// otherwise a close one fills the frame and reads as a floating boulder.
const FIELD = { x: 470, z: 400, y0: 72, y1: 132 };
const NEAR_FADE = [100, 200];
const PER_VARIANT = 27;

/** Merge non-indexed puffs into one flat-shaded blob geometry. */
function puffBlob(r, puffs) {
  const base = new THREE.IcosahedronGeometry(1, 1); // 80 flat faces
  const geos = [];
  for (let i = 0; i < puffs; i++) {
    const t = puffs === 1 ? 0.5 : i / (puffs - 1);
    const g = base.clone();
    const along = (t - 0.5) * 2;                       // -1 .. 1
    const taper = 1 - 0.55 * along * along;            // fat in the middle
    const sx = (0.55 + r() * 0.35) * taper;
    const sy = (0.42 + r() * 0.30) * taper;
    const sz = (0.52 + r() * 0.32) * taper;
    const px = along * 0.95 + r.range(-0.10, 0.10);
    const py = 0.12 + (1 - along * along) * r.range(0.10, 0.34) + r.range(-0.04, 0.04);
    const pz = r.range(-0.34, 0.34);
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 3), r.range(0, 3), r.range(0, 3))),
      new THREE.Vector3(sx, sy, sz),
    ));
    geos.push(g);
  }
  // a flat-ish underside slab so the bottom reads as one shadowed mass
  const slab = new THREE.IcosahedronGeometry(1, 1);
  slab.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.02, 0), new THREE.Quaternion(), new THREE.Vector3(1.05, 0.26, 0.60),
  ));
  geos.push(slab);

  let total = 0;
  for (const g of geos) total += g.attributes.position.array.length;
  const arr = new Float32Array(total);
  let o = 0;
  for (const g of geos) { arr.set(g.attributes.position.array, o); o += g.attributes.position.array.length; g.dispose(); }
  base.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  out.computeVertexNormals(); // non-indexed → flat per-face normals
  return out;
}

export function createClouds() {
  const r = rng(hash('sky-clouds'));
  const uniforms = {
    uLit: { value: new THREE.Vector3(1, 1, 1) },
    uShad: { value: new THREE.Vector3(0.76, 0.84, 0.92) },
    uRim: { value: new THREE.Vector3(1, 0.95, 0.85) },
    uRimS: { value: 0.35 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFogCol: { value: new THREE.Vector3(0.85, 0.9, 0.95) },
    uFogNear: { value: 160 },
    uFogFar: { value: 620 },
    uOutLin: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, fog: false, side: THREE.FrontSide,
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying vec3 vN; varying float vDist; varying float vSeed; varying float vUpY; varying vec3 vW;
      void main(){
        vec4 ip = instanceMatrix * vec4(position, 1.0);
        vW = ip.xyz;
        // Blend the flat face normal toward an ellipsoidal "blob" normal: keeps
        // the chunky faceted SILHOUETTE but shades it like a soft round puff
        // instead of a polygonal rock.
        // The y term used to be 5.7x the x term, which pinned almost every
        // normal to straight up — so a low sun could never find a sunward face
        // and the whole cloud averaged to one mauve tone. Keep the puff bias,
        // but leave enough lateral spread for the sun side to actually exist.
        vec3 blob = normalize(vec3(position.x * 0.82, (position.y - 0.10) * 1.55, position.z * 1.0) + 1e-5);
        vec3 n = normalize(mix(normal, blob, 0.56));
        vN = normalize(mat3(instanceMatrix) * n);
        vUpY = position.y;
        vec4 mv = modelViewMatrix * ip;
        vDist = -mv.z;
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vN; varying float vDist; varying float vSeed; varying float vUpY; varying vec3 vW;
      uniform vec3 uLit, uShad, uRim, uSunDir, uFogCol;
      uniform float uRimS, uFogNear, uFogFar, uOutLin;
      void main(){
        vec3 n = normalize(vN);
        float up = n.y * 0.5 + 0.5;
        float s = max(dot(n, uSunDir), 0.0);
        // Light the body by the SUN DIRECTION (not just "upness"), so the lobe
        // next to a low sun goes gold instead of staying baked-dark.
        float litF = mix(up, s * 0.88 + 0.12, 0.72);
        // A narrow terminator: chunky cartoon clouds want two readable tones,
        // not a long smooth ramp that averages gold and violet into mauve.
        vec3 col = mix(uShad, uLit, smoothstep(0.36, 0.68, litF));
        // silver lining: faces turned toward the sun glow with its colour
        col = mix(col, uRim, pow(s, 1.4) * uRimS);
        // GOLD RIM on the sun-facing limb. Keyed on the silhouette × how much
        // the face points at the sun, so every cloud gets a gold edge on the
        // sun side whether or not the camera happens to look into the sun.
        // A mix, not an add: adding gold to a bright face just clips to white.
        vec3 Vr = normalize(vW - cameraPosition);
        float limb = pow(1.0 - abs(dot(n, -Vr)), 2.2);
        float sunSide = smoothstep(-0.05, 0.52, s);
        // limb catches horizon clouds (normal nearly perpendicular to the eye);
        // the sunSide term catches clouds overhead, where the limb never fires.
        float rimF = max(limb * 1.10, sunSide * sunSide * 0.88);
        col = mix(col, uRim, clamp(rimF * sunSide * uRimS, 0.0, 0.92));
        // HEADROOM. Adding gold on top of an already-bright cream face clips the
        // red channel first and the cloud turns WHITE — which is exactly why
        // golden hour read as pale cotton. Scale every additive by the room left
        // in the brightest channel, so the glow lands where it reads as gold:
        // the shadow side and the silhouette edge.
        float head = 1.0 - clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
        float room = 0.24 + 0.76 * head;
        col += uRim * pow(s, 7.0) * uRimS * 0.62 * room;
        // BACKLIT: looking toward a low sun, the shadow side of a cloud should
        // glow and its silhouette should go gold, not stay grey.
        float fwd = max(dot(Vr, uSunDir), 0.0);
        col += uRim * (pow(fwd, 5.0) * 0.50 + limb * pow(fwd, 2.0) * 0.66) * (0.35 + uRimS) * room;
        // shadowed belly
        col *= 1.0 - 0.22 * smoothstep(0.14, -0.30, vUpY);
        col *= 0.94 + 0.11 * fract(vSeed * 7.13);
        col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, vDist) * 0.72);
        if (uOutLin > 0.5) col = pow(max(col, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const group = new THREE.Group();
  group.name = 'clouds';
  const batches = [];
  for (let v = 0; v < 2; v++) {
    const geo = puffBlob(r, v === 0 ? 6 : 5);
    const mesh = new THREE.InstancedMesh(geo, material, PER_VARIANT);
    const seeds = new Float32Array(PER_VARIANT);
    const inst = [];
    // clouds come in loose flocks, not an even scatter
    let fx = 0, fz = 0, left = 0;
    for (let i = 0; i < PER_VARIANT; i++) {
      seeds[i] = r();
      if (left <= 0) { fx = r.range(-FIELD.x, FIELD.x); fz = r.range(-FIELD.z, FIELD.z); left = r.int(2, 4); }
      left--;
      const hero = r.chance(0.22);
      inst.push({
        x: fx + r.range(-90, 90),
        y: r.range(FIELD.y0, FIELD.y1),
        z: fz + r.range(-70, 70),
        s: hero ? r.range(24, 36) : r.range(10, 23),
        rot: r.range(0, Math.PI * 2),
        spd: r.range(0.55, 1.35),
        bobA: r.range(0.6, 2.2),
        bobP: r.range(0, 6.28),
      });
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    batches.push({ mesh, inst });
  }

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _e = new THREE.Euler();
  const span = FIELD.x * 2;

  function update(elapsed, camX = 0, camZ = 0) {
    for (const b of batches) {
      for (let i = 0; i < b.inst.length; i++) {
        const c = b.inst[i];
        let x = c.x + elapsed * 0.42 * c.spd;
        x = ((x + FIELD.x) % span + span) % span - FIELD.x;
        // fade in/out at the wrap seam so nothing pops, and shrink anything
        // that drifts right over the camera
        const dxz = Math.hypot(x - camX, c.z - camZ);
        const near = Math.min(1, Math.max(0, (dxz - NEAR_FADE[0]) / (NEAR_FADE[1] - NEAR_FADE[0])));
        const s = c.s * Math.max(0, Math.min(1, (FIELD.x - Math.abs(x)) / 90)) * (near * near * (3 - 2 * near));
        _p.set(x, c.y + Math.sin(elapsed * 0.13 + c.bobP) * c.bobA, c.z);
        _e.set(0, c.rot, 0);
        _q.setFromEuler(_e);
        _s.set(s, s, s);
        b.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(0);
  return { group, uniforms, material, update, count: PER_VARIANT * 2 };
}
