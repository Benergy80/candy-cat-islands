// Ground decals for the visitor: a soft contact shadow that tightens when the
// feet land, a WARM CONTACT POOL that takes the shadow's job over after dark,
// and a faint "here I am" ring that only fades in when the camera is pulled way
// out (at wide zoom the visitor is ~45 px and otherwise gets lost).
//
// Why the pool exists: the contact shadow is a dark disc, and a dark disc on
// ground that is already dark is worth exactly nothing — a critic measured the
// night contact shadow at zero and read the visitor as hovering. So the anchor
// crossfades: dark disc by day, additive amber pool by night, and there is never
// an hour with neither.
//
// STAYING ON TOP OF THE FLOOR. The discs are flat and sit at the ground height
// the player hands us, but the floor that is DRAWN is often a little higher: the
// cave corridor is flat 2.3 u slabs under a rolling walk height, with a gloss
// strip (+0.08) and a licorice inlay (+0.115) laid down its middle; decks,
// kerbs and bumps do the same. A disc 3 cm up sank under all of that and read as
// a cream half-disc. So each disc is PULLED toward the lens in depth only
// (DECAL_PULL, view space, gl_Position.z — x/y do not move, so it stays exactly
// where it is on screen) and beats any floor up to ~DECAL_PULL × sin(elevation)
// above its plane (0.24 u at the cave's 0.95, 0.18 at the iso 0.64); plus a
// polygonOffset for the coplanar case.
// The pull would also let the pool paint over his shoes — so the discs draw in
// the OPAQUE queue (CustomBlending, same look) at DECAL_ORDER, after every scene
// opaque and BEFORE his body (visitor.js: silhouette 9990, body 9991). When a
// disc draws, the depth buffer holds the floor and nothing of him; his body then
// covers it wherever he stands in front of it.
import * as THREE from 'three';

const DECAL_PULL = 0.30;          // u, toward the lens, depth only
const DECAL_ORDER = 9980;         // + 1 / 2 / 3: pool, shadow, ring — all before visitor.js's 9990
const LIFT = 0.04;                // above the ground height we are handed

function pullPatch(sh) {
  sh.uniforms.decalPull = { value: DECAL_PULL };
  if (!sh.vertexShader.includes('#include <project_vertex>')) return;        // never break the render
  sh.vertexShader = 'uniform float decalPull;\n' + sh.vertexShader.replace(
    '#include <project_vertex>',
    '#include <project_vertex>\n\t{\n\t\tvec4 dcP = projectionMatrix * vec4( mvPosition.xy, mvPosition.z + decalPull, 1.0 );\n\t\tgl_Position.z = dcP.z / max( dcP.w, 1e-4 ) * gl_Position.w;\n\t}',
  );
}

// The falloff goes in the RGB channels, on black: an alphaMap is read from .g.
// (White at canvas alpha `a` uploads un-premultiplied as G = 255 wherever a > 0,
// so the old map was a hard-edged disc at full strength with a speckled rim —
// the "cream disc" — and the stops below never reached the shader.) Linear, not
// sRGB: the stops are coverage values, not colours.
function radial(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, a] of stops) { const v = Math.round(a * 255); grd.addColorStop(t, `rgb(${v},${v},${v})`); }
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function decal(alphaMap, color, opacity, order, additive) {
  const mat = new THREE.MeshBasicMaterial({
    color, alphaMap, transparent: false, opacity, depthWrite: false, side: THREE.DoubleSide,
    // opaque queue, blended by hand: SrcAlpha + (additive ? One : OneMinusSrcAlpha)
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    toneMapped: !additive,
  });
  mat.onBeforeCompile = pullPatch;
  mat.customProgramCacheKey = () => 'visitor-decal-pull';
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = DECAL_ORDER + order;
  m.castShadow = false; m.receiveShadow = false;
  m.userData.noFade = true;
  return m;
}

/** { group, update(dt, { x, y, z, normal, hop, speed, zoom, night }) } */
export function createGroundDecals() {
  const group = new THREE.Group();
  const pool = decal(radial([[0, 0.85], [0.35, 0.5], [0.72, 0.14], [1, 0]]), 0xffb964, 0.0, 1, true);
  const shadow = decal(radial([[0, 0.95], [0.45, 0.72], [0.8, 0.18], [1, 0]]), 0x2a1c24, 0.42, 2);
  const ring = decal(radial([[0, 0], [0.60, 0], [0.74, 0.9], [0.88, 0.55], [1, 0]]), 0xffc84a, 0.0, 3);
  group.add(pool, shadow, ring);
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const q = new THREE.Quaternion(), flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  return {
    group, shadow, ring, pool,
    update(dt, s) {
      const hop = s.hop || 0;
      // sit on the ground, tipped to the slope so it never cuts into a hillside
      n.set(s.normal?.x || 0, s.normal?.y ?? 1, s.normal?.z || 0).normalize();
      q.setFromUnitVectors(up, n);
      const air = Math.min(1, hop / 0.55);
      const night = Math.min(1, Math.max(0, s.night || 0));
      for (const d of [pool, shadow, ring]) {
        d.position.set(s.x, s.y + LIFT + (d === ring ? 0.008 : d === pool ? -0.004 : 0), s.z);
        d.quaternion.copy(q).multiply(flat);
      }
      // an ellipse ~1.3× the foot print (0.60 × 0.44): tight and dark on contact,
      // wide and faint in the air. The plane's local Y is world Z.
      const sc = 1 + air * 0.62 + Math.min(0.13, (s.speed || 0) * 0.015);
      shadow.scale.set(0.80 * sc, 0.66 * sc, 1);
      // Day: the dark disc. Night: it would be invisible anyway, so hand the job
      // to the warm pool and keep only a trace of dark for the contact edge.
      shadow.material.opacity = 0.5 * (1 - air * 0.62) * (1 - 0.6 * night);
      pool.scale.set(1.55 * sc, 1.30 * sc, 1);
      pool.material.opacity = (0.055 + 0.62 * night) * (1 - air * 0.45);
      pool.visible = pool.material.opacity > 0.012;
      // marker only past ~1.9× the default framing, so it never intrudes up
      // close; it has to grow with the zoom or it is 20 px at the far stop
      const zk = Math.min(1, Math.max(0, ((s.zoom || 0) - 40) / 30));
      const pulse = 0.86 + 0.14 * Math.sin((s.elapsed || 0) * 2.1);
      ring.material.opacity = zk * 0.62 * pulse;
      ring.visible = zk > 0.01;
      const rs = 1.35 + zk * 0.95;
      ring.scale.set(rs, rs, 1);
    },
  };
}
