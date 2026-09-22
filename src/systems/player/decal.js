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
import * as THREE from 'three';

function radial(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, a] of stops) grd.addColorStop(t, `rgba(255,255,255,${a})`);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function decal(alphaMap, color, opacity, order, blending) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color, alphaMap, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      blending: blending || THREE.NormalBlending, toneMapped: blending ? false : true,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = order;
  m.castShadow = false; m.receiveShadow = false;
  m.userData.noFade = true;
  return m;
}

/** { group, update(dt, { x, y, z, normal, hop, speed, zoom, night }) } */
export function createGroundDecals() {
  const group = new THREE.Group();
  const pool = decal(radial([[0, 0.85], [0.35, 0.5], [0.72, 0.14], [1, 0]]), 0xffb964, 0.0, 1, THREE.AdditiveBlending);
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
        d.position.set(s.x, s.y + 0.035 + (d === ring ? 0.008 : d === pool ? -0.004 : 0), s.z);
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
