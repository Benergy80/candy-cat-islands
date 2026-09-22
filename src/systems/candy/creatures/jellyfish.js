// COTTON-CANDY JELLYFISH — 12 soft glowing bells that rise out of the bay around
// Sugar Pier at dusk and drift until dawn. Eight hang over open water; four
// wander in over the shore, which is how you first notice them.
import * as THREE from 'three';
import { rng, hash, smoothstep } from '../../../core/util.js';
import { Pool, part, mergeParts, shadeAxis, glowMaterial, emissiveByInstance, TAU, uiToast } from './common.js';

// Anchors: [x, z]. Every one is over open water — the shoreline near the pier
// sits at about x = -34, so anchors stay east of that. (Round 3 had pushed four
// of these inland to get them into the pier camera; on the ground they read as
// balloons hovering over the shore road, so they are back in the bay and
// findability now comes from the early dusk ramp plus the near-pier cluster.)
const ANCHORS = [
  [-36, 45], [-29, 39], [-25, 31], [-31, 51], [-43, 51],
  [-22, 44], [-34, 58], [-27, 24],
  // Near-pier cluster: the first four you meet, right off the end of Sugar Pier.
  [-31, 27], [-30, 15], [-33, 30], [-28, 20],
];
const HUES = [0xff5c9e, 0x5cb8ff, 0xa86bff, 0xff8fc4, 0x7ce0ff, 0xff7ad0, 0x8f8fff];

function jellyGeo() {
  const bell = part(new THREE.SphereGeometry(1, 9, 4, 0, TAU, 0, 1.58), { scale: [0.88, 0.66, 0.88] });
  shadeAxis(bell, 'y', -0.1, 0.62, 0x8e6f86, 0xfff2fa);
  const parts = [bell];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3;
    parts.push(part(new THREE.ConeGeometry(0.085, 1.2, 3, 1, true), {
      pos: [Math.cos(a) * 0.56, -0.62, Math.sin(a) * 0.56], rot: [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22],
      color: 0xffe6f2,
    }));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    parts.push(part(new THREE.ConeGeometry(0.16, 0.72, 3, 1, true), {
      pos: [Math.cos(a) * 0.22, -0.34, Math.sin(a) * 0.22], color: 0xffffff,
    }));
  }
  return mergeParts(parts);
}

// Shrink a drift circle until the whole ring stays over water. Jellyfish that
// wandered onto the beach were what made them look airborne.
function waterRadius(world, x, z, want) {
  for (let rr = want; rr > 0.5; rr -= 0.25) {
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) {
      const a = (k / 12) * TAU;
      if (world.height(x + Math.cos(a) * rr, z + Math.sin(a) * rr * 0.7) > -0.8) ok = false;
    }
    if (ok) return rr;
  }
  return 0.5;
}

export function create(env) {
  const { ctx, world, scene } = env;
  const r = rng(hash('candy-jellyfish'));
  const N = ANCHORS.length;

  const bellMat = emissiveByInstance(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.9, depthWrite: false,
    emissive: 0xffffff, emissiveIntensity: 0.5,
  }));
  const bells = new Pool(scene, jellyGeo(), bellMat, N, { name: 'cottoncandy-jellyfish', cast: false });
  const halos = new Pool(scene, new THREE.PlaneGeometry(1, 1), glowMaterial(0.3), N, { name: 'jellyfish-glow', cast: false, colors: true });
  halos.mesh.renderOrder = 3;
  bells.mesh.renderOrder = 2;

  const jellies = ANCHORS.map(([x, z], i) => {
    // Bells ride the waterline: the dome breaks the surface and the tentacles
    // hang below it. SEA_LEVEL is 0, so this is a few tenths above/below it.
    const base = 0.2 + r() * 0.6;
    const hue = HUES[i % HUES.length];
    bells.tint(i, hue); halos.tint(i, hue);
    return {
      x, z, base, a: r() * TAU,
      rr: waterRadius(world, x, z, 2.4 + r() * 3.2),
      w: (0.06 + r() * 0.08) * (r() < 0.5 ? -1 : 1),
      ph: r() * TAU, spin: (r() - 0.5) * 0.3,
      scale: 1.0 + r() * 0.5,
    };
  });
  bells.flushColors(); halos.flushColors();

  let announced = false;
  return {
    name: 'jellyfish', jellies,
    update(dt, ctx) {
      const t = ctx.state.elapsed;
      // Round 3: "6 glowing at dusk near the pier must be findable". At 19:30
      // daylight is still ~0.35, which under the old ramp left them at a third
      // brightness and two thirds size — present in the frame and invisible in
      // practice. They now come up EARLY (dusk, not full night) and come up hot.
      const vis = 1 - smoothstep(0.04, 0.66, ctx.state.daylight ?? 1);
      bells.mesh.visible = halos.mesh.visible = vis > 0.02;
      if (!bells.mesh.visible) return;
      bellMat.emissiveIntensity = 0.35 + 1.25 * vis;
      halos.mat.opacity = 0.12 + 0.48 * vis;
      const camQ = ctx.camera.quaternion;
      for (let i = 0; i < N; i++) {
        const j = jellies[i];
        j.a += j.w * dt;
        const x = j.x + Math.cos(j.a) * j.rr;
        const z = j.z + Math.sin(j.a) * j.rr * 0.7;
        const pulse = Math.sin(t * 1.25 + j.ph);
        const y = j.base + pulse * 0.38 + Math.sin(t * 0.4 + j.ph * 1.7) * 0.3;
        const s = j.scale * (0.78 + 0.32 * vis);
        bells.place(i, x, y, z, t * j.spin + j.ph, s * (1 + pulse * 0.11), s * (1 - pulse * 0.13), s * (1 + pulse * 0.11));
        halos.billboard(i, x, y + 0.05 * s, z, s * (4.6 + pulse * 0.4), camQ);
      }
      bells.flush(); halos.flush();
      if (!announced && vis > 0.6) {
        const p = ctx.systems.player?.position;
        if (p && Math.hypot(p.x + 46, p.z - 28) < 26) {
          announced = true;
          uiToast(ctx, 'Cotton-candy jellyfish are coming up out of the bay.');
          ctx.systems.story?.set('saw_jellyfish', true);
        }
      }
    },
  };
}
