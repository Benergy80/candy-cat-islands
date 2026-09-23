// ─────────────────────────────────────────────────────────────────────────────
// ITEM GEOMETRY KIT — every pickable thing in the game, baked into ONE
// vertex-coloured BufferGeometry per item type so a whole island's worth of
// gumdrops costs a single InstancedMesh draw call.
//
// Authoring convention: y = 0 is the GRIP (where the hand closes on it) and the
// item extends along +Y. `hold` then only has to rotate that axis out of the
// fist; `tilt` is the lazy angle it floats at while it is still a pickup.
// Candy pools are TINTABLE: their vertex colours are a white/grey shade mask
// that the per-instance colour multiplies, so one gumdrop geometry gives six
// flavours for free.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import * as A from './arsenal.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

/** Accumulate coloured primitives in one local space → one baked geometry. */
export function part() {
  const pos = [], nrm = [], col = [], glw = [];
  const api = {
    /** opts: { pos, rot, scale, glow, bands:{size,offset,colors:[a,b]} } */
    add(geo, color, opts = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const s = typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : (opts.scale || [1, 1, 1]);
      _e.set(...(opts.rot || [0, 0, 0]));
      _q.setFromEuler(_e);
      _m.compose(_v.set(...(opts.pos || [0, 0, 0])), _q, _s.set(s[0], s[1], s[2]));
      g.applyMatrix4(_m);
      const P = g.attributes.position.array;
      const N = g.attributes.normal ? g.attributes.normal.array : null;
      const n = g.attributes.position.count;
      _c.set(color);
      const bands = opts.bands;
      const gl = opts.glow || 0;
      if (bands) _c2.set(bands.colors[1]);
      for (let i = 0; i < n; i++) {
        pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (N) nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else nrm.push(0, 1, 0);
        glw.push(gl);
        if (bands) {
          const k = Math.floor((P[i * 3 + 1] + (bands.offset || 0)) / bands.size);
          const c = ((k % 2) + 2) % 2 ? _c2 : _c;
          col.push(c.r, c.g, c.b);
        } else col.push(_c.r, _c.g, _c.b);
      }
      if (g !== geo) g.dispose();
      geo.dispose();
      return api;
    },
    box(w, h, d, color, o) { return api.add(new THREE.BoxGeometry(w, h, d), color, o); },
    cyl(r0, r1, h, seg, color, o) { return api.add(new THREE.CylinderGeometry(r0, r1, h, seg, (o && o.hseg) || 1), color, o); },
    sph(r, seg, rings, color, o) { return api.add(new THREE.SphereGeometry(r, seg, rings), color, o); },
    cone(r, h, seg, color, o) { return api.add(new THREE.ConeGeometry(r, h, seg), color, o); },
    tet(r, color, o) { return api.add(new THREE.TetrahedronGeometry(r), color, o); },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      // per-vertex heat mask: 0 = lit normally, 1 = glows in its own hue.
      // applyPickupGlow() below turns it into emissive, so a nozzle, a canister
      // or a rubber band can burn while the rest of the body stays a solid.
      g.setAttribute('glow', new THREE.Float32BufferAttribute(glw, 1));
      g.computeBoundingSphere();
      return g;
    },
    get tris() { return pos.length / 9; },
  };
  return api;
}

/**
 * The pickup/held look, patched into any vertex-coloured MeshStandardMaterial:
 *   · a FRESNEL RIM in the surface's own hue, so a tan heat gun lying against a
 *     tan cliff still draws its own outline out of the rock;
 *   · the baked `glow` attribute as emissive, so hot tips / salt canisters /
 *     rubber bands read as light sources instead of paint.
 * Costs nothing: no extra pass, no extra draw call, no extra material.
 */
export function applyPickupGlow(material, { rim = 0.55, glow = 1.35, power = 2.3 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uGlow = { value: glow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHeat = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeat;\nuniform float uRim;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
	{
		float gF = pow( 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 ), ${power.toFixed(2)} );
		vec3 gT = vColor.rgb * 0.65 + 0.35;
		totalEmissiveRadiance += gT * ( vHeat * uGlow + gF * uRim );
	}`);
  };
  material.customProgramCacheKey = () => `pickGlow:${rim}:${glow}:${power}`;
  material.needsUpdate = true;
  return material;
}

// ── the sweets ───────────────────────────────────────────────────────────────
// (white/grey shade masks — the per-instance colour supplies the flavour)
function gumdrop(p) {
  p.sph(0.30, 10, 7, 0xffffff, { pos: [0, 0.30, 0], scale: [1, 1.02, 1] });
  p.cyl(0.30, 0.235, 0.14, 10, 0xf2f2f2, { pos: [0, 0.07, 0] });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.31;
    p.tet(0.052, 0xffffff, { pos: [Math.cos(a) * 0.27, 0.16 + (i % 3) * 0.16, Math.sin(a) * 0.27], rot: [a, a * 1.7, 0.4] });
  }
}

function lollipop(p) {
  p.cyl(0.036, 0.036, 0.56, 6, 0xfdfdfd, { pos: [0, 0.28, 0] });
  p.cyl(0.27, 0.27, 0.075, 14, 0xffffff, { pos: [0, 0.66, 0] });
  for (let i = 0; i < 9; i++) {                       // spiral of shade blocks = swirl
    const t = i / 9, a = t * 6.6, r = 0.055 + t * 0.20;
    p.box(0.10, 0.085, 0.075, 0x8c8c8c, { pos: [Math.cos(a) * r, 0.665, Math.sin(a) * r], rot: [0, -a, 0] });
  }
  p.cyl(0.28, 0.28, 0.02, 14, 0xdedede, { pos: [0, 0.628, 0] });
}

function wrapper(p) {
  p.sph(0.235, 10, 7, 0xffffff, { pos: [0, 0.26, 0], scale: [1.35, 1, 1] });
  for (const s of [-1, 1]) {
    p.cone(0.175, 0.24, 7, 0xf0f0f0, { pos: [s * 0.41, 0.26, 0], rot: [0, 0, s * Math.PI / 2] });
    p.box(0.03, 0.16, 0.16, 0xe4e4e4, { pos: [s * 0.53, 0.26, 0], rot: [s * 0.5, 0, 0] });
  }
}

// ── the tools ────────────────────────────────────────────────────────────────
// COLOUR RULE (round 3): a weapon is never the colour of the place it lies in.
// Candyland is pastel frosting and Cat Island is stone and sand, so every tool
// is pushed to a saturated, *non-environment* hue and given a hot detail on the
// `glow` channel. A tan heat gun on a tan cliff was invisible; this one is not.
function saltShaker(p) {
  p.cyl(0.155, 0.185, 0.32, 12, 0xfffdf6, { pos: [0, 0.16, 0] });
  p.sph(0.155, 10, 5, 0xfffdf6, { pos: [0, 0.32, 0], scale: [1, 0.62, 1] });
  p.cyl(0.125, 0.112, 0.10, 10, 0x2fc8f0, { pos: [0, 0.42, 0] });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57;
    p.box(0.038, 0.032, 0.038, 0xf2fdff, { pos: [Math.cos(a) * 0.05, 0.472, Math.sin(a) * 0.05], glow: 0.9 });
  }
  p.box(0.17, 0.13, 0.02, 0x1f7ad8, { pos: [0, 0.17, 0.186] });   // little blue label
  p.box(0.12, 0.028, 0.008, 0xffffff, { pos: [0, 0.20, 0.196], glow: 0.5 });
  p.cyl(0.19, 0.19, 0.03, 12, 0x2fc8f0, { pos: [0, 0.015, 0] });
}

function candyBat(p) {
  p.cyl(0.056, 0.062, 0.20, 8, 0x2a1a22, { pos: [0, 0.10, 0] });                 // licorice grip
  p.cyl(0.068, 0.068, 0.05, 10, 0xffd21f, { pos: [0, 0.215, 0], glow: 0.35 });   // brass ferrule
  p.add(new THREE.CylinderGeometry(0.102, 0.064, 0.74, 8, 16), 0xfffaf4,
    { pos: [0, 0.60, 0], bands: { size: 0.105, offset: 0.02, colors: [0xfffaf4, 0xff1f3f] } });
  const hook = [[0.00, 0.99, 0.0], [0.06, 1.06, 0.0], [0.15, 1.10, 0.0], [0.24, 1.07, 0.0], [0.28, 0.99, 0.0]];
  for (let i = 0; i < hook.length; i++) {
    const h = hook[i];
    p.cyl(0.096, 0.096, 0.10, 7, i % 2 ? 0xff1f3f : 0xfffaf4, { pos: h, rot: [0, 0, -0.55 - i * 0.5] });
  }
  p.sph(0.092, 8, 6, 0xfffaf4, { pos: [0.29, 0.93, 0] });
}

function slingshot(p) {
  p.cyl(0.056, 0.066, 0.26, 7, 0xc07a2e, { pos: [0, 0.13, 0] });                   // warm wood
  p.box(0.115, 0.11, 0.08, 0xffc21f, { pos: [0, 0.17, 0], glow: 0.20 });           // grip tape
  for (const s of [-1, 1]) {
    p.cyl(0.038, 0.05, 0.30, 6, 0xc07a2e, { pos: [s * 0.085, 0.40, 0], rot: [0, 0, -s * 0.42] });
    p.sph(0.048, 7, 5, 0x9a5a20, { pos: [s * 0.16, 0.545, 0] });
    p.box(0.024, 0.21, 0.032, 0xff2d6f, { pos: [s * 0.115, 0.50, 0.0], rot: [0, 0, s * 0.62], glow: 0.30 }); // rubber
  }
  p.box(0.058, 0.095, 0.055, 0x7a3d18, { pos: [0, 0.415, 0.0] });                   // pouch
  p.sph(0.068, 7, 5, 0x2fe07a, { pos: [0, 0.425, 0.02], glow: 0.40 });              // loaded gumball
}

function spritzer(p) {
  p.sph(0.195, 10, 7, 0xffe81f, { pos: [0, 0.20, 0], scale: [1, 1.22, 1], glow: 0.18 });
  p.cone(0.05, 0.08, 6, 0xffb41f, { pos: [0, 0.40, 0] });
  p.cyl(0.10, 0.10, 0.07, 8, 0xfff6c8, { pos: [0, 0.42, 0] });
  p.cyl(0.04, 0.052, 0.13, 6, 0xfffdf0, { pos: [0, 0.50, 0.03], rot: [0.5, 0, 0] });
  p.box(0.058, 0.038, 0.10, 0x2fc8f0, { pos: [0, 0.44, 0.11] });                    // trigger
  p.sph(0.058, 7, 5, 0x3fd23a, { pos: [0.0, 0.055, 0], scale: [1.5, 0.5, 1.5] });   // leaf
}

function sprayBottle(p) {
  p.cyl(0.12, 0.14, 0.38, 10, 0x4fe4ff, { pos: [0, 0.20, 0], glow: 0.14 });         // cyan "glass"
  p.cyl(0.123, 0.123, 0.17, 10, 0x0fb8e8, { pos: [0, 0.155, 0], glow: 0.28 });      // water line
  p.cyl(0.078, 0.10, 0.07, 8, 0xf2fdff, { pos: [0, 0.42, 0] });
  p.box(0.135, 0.125, 0.24, 0xf2fdff, { pos: [0, 0.50, 0.04] });
  p.box(0.075, 0.105, 0.105, 0xff4fa0, { pos: [0, 0.44, 0.13], glow: 0.22 });       // pink trigger
  p.cyl(0.03, 0.04, 0.08, 6, 0xff4fa0, { pos: [0, 0.50, 0.20], rot: [Math.PI / 2, 0, 0] });
  p.box(0.125, 0.14, 0.02, 0xffffff, { pos: [0, 0.22, 0.14] });
  p.box(0.085, 0.024, 0.006, 0xff4fa0, { pos: [0, 0.25, 0.152], glow: 0.3 });
}

/**
 * Salt Gun — round-4 critique: "a mint block with a white hopper reads as a
 * meat grinder, and end-on it falls apart". Now a long, low SUPER-SOAKER:
 * one horizontal body, the salt tank lying ALONG the top (never a tower),
 * a long barrel ending in a flared white spreader nozzle. It reads as a gun
 * from every side a spinning pickup shows.
 */
function saltGun(p) {
  p.box(0.11, 0.22, 0.09, 0x0a5a6e, { pos: [0, 0.1, -0.06], rot: [-0.26, 0, 0] });  // deep teal pistol grip
  p.box(0.075, 0.06, 0.1, 0x0d6f82, { pos: [0, 0.2, 0.05] });                        // trigger guard
  p.box(0.15, 0.15, 0.5, 0x23e0c6, { pos: [0, 0.27, 0.06] });                        // long mint body
  p.box(0.155, 0.04, 0.5, 0x0a5a6e, { pos: [0, 0.205, 0.06] });                      // teal underline
  p.cyl(0.075, 0.075, 0.44, 10, 0xf6ffff, { pos: [0, 0.39, 0.02], rot: [Math.PI / 2, 0, 0], glow: 0.6 });   // salt tank, lying along the top
  p.cyl(0.08, 0.08, 0.04, 10, 0x1f7ad8, { pos: [0, 0.39, 0.24], rot: [Math.PI / 2, 0, 0], glow: 0.3 });     // tank cap
  p.cyl(0.08, 0.08, 0.04, 10, 0x1f7ad8, { pos: [0, 0.39, -0.2], rot: [Math.PI / 2, 0, 0] });
  p.cyl(0.055, 0.06, 0.3, 8, 0xeafffb, { pos: [0, 0.27, 0.46], rot: [Math.PI / 2, 0, 0] });                 // barrel
  p.cyl(0.13, 0.06, 0.12, 10, 0xffffff, { pos: [0, 0.27, 0.64], rot: [Math.PI / 2, 0, 0], glow: 0.35 });     // flared spreader
  p.cyl(0.1, 0.1, 0.02, 10, 0x00d9ff, { pos: [0, 0.27, 0.705], rot: [Math.PI / 2, 0, 0], glow: 0.9 });
  p.box(0.16, 0.1, 0.08, 0x0a5a6e, { pos: [0, 0.27, -0.21] });                        // butt pad
  p.box(0.05, 0.035, 0.05, 0x00d9ff, { pos: [0.08, 0.3, 0.16], glow: 0.9 });          // charge light
  for (let i = 0; i < 3; i++) p.tet(0.03, 0xffffff, { pos: [(i - 1) * 0.04, 0.47, 0.02 + (i - 1) * 0.1], rot: [i, i * 2, 0], glow: 1.0 });
}

function caramelizer(p) {
  p.box(0.12, 0.25, 0.105, 0x6b2f0e, { pos: [0, 0.12, -0.05], rot: [-0.20, 0, 0] });  // dark caramel grip
  p.box(0.08, 0.065, 0.075, 0x1f1a18, { pos: [0, 0.23, 0.02] });
  p.cyl(0.11, 0.12, 0.40, 10, 0xff8a14, { pos: [0, 0.31, 0.10], rot: [Math.PI / 2, 0, 0] }); // caramel-orange barrel
  p.cyl(0.128, 0.128, 0.06, 10, 0xffc21f, { pos: [0, 0.31, 0.02], rot: [Math.PI / 2, 0, 0], glow: 0.25 });
  p.cyl(0.132, 0.132, 0.05, 10, 0x8f3d0c, { pos: [0, 0.31, 0.26], rot: [Math.PI / 2, 0, 0] });
  p.cone(0.175, 0.22, 10, 0x2a1410, { pos: [0, 0.31, 0.40], rot: [Math.PI / 2, 0, 0] }); // scorched flare
  p.cyl(0.10, 0.095, 0.07, 10, 0xff4a08, { pos: [0, 0.31, 0.455], rot: [Math.PI / 2, 0, 0], glow: 0.85 });
  p.cyl(0.072, 0.072, 0.05, 8, 0xffe27a, { pos: [0, 0.31, 0.50], rot: [Math.PI / 2, 0, 0], glow: 1.0 });   // hot mouth
  p.cyl(0.088, 0.088, 0.26, 8, 0xff2d1f, { pos: [0, 0.28, -0.13], rot: [Math.PI / 2, 0, 0] });             // fuel bottle
  p.sph(0.09, 8, 6, 0xff2d1f, { pos: [0, 0.28, -0.26] });
  p.cyl(0.058, 0.058, 0.032, 8, 0xffe27a, { pos: [0.115, 0.36, 0.02], rot: [0, 0, Math.PI / 2], glow: 0.7 }); // gauge
  p.box(0.032, 0.095, 0.032, 0x1f1a18, { pos: [0, 0.42, 0.02] });
}

function fuelCan(p) {
  p.box(0.27, 0.33, 0.16, 0xff3b20, { pos: [0, 0.17, 0] });
  p.box(0.28, 0.055, 0.17, 0xb01e10, { pos: [0, 0.10, 0] });
  p.box(0.21, 0.04, 0.05, 0xb01e10, { pos: [0, 0.37, -0.04] });                      // handle
  p.cyl(0.058, 0.058, 0.065, 8, 0xffd21f, { pos: [0, 0.37, 0.045], glow: 0.55 });
  p.box(0.13, 0.11, 0.006, 0xfffaf0, { pos: [0, 0.20, 0.083] });
  p.box(0.095, 0.024, 0.008, 0xff8a14, { pos: [0, 0.22, 0.088], glow: 0.4 });
}

// ── item table ───────────────────────────────────────────────────────────────
// kind: 'weapon' | 'tool' | 'candy' | 'ammo'
// mode: how weapons.js uses it.  ammo: which counter it burns.
export const ITEMS = {
  candy: { id: 'candy', name: 'Candy', kind: 'candy', visual: 'gumdrop' },
  bat: {
    id: 'bat', name: 'Candy-Cane Bat', kind: 'weapon', mode: 'melee', power: 3,
    hint: 'swing', visual: 'bat',
  },
  salt: {
    id: 'salt', name: 'Salt Shaker', kind: 'weapon', mode: 'lob', power: 2, ammo: 'salt',
    hint: 'lob salt', visual: 'salt',
  },
  slingshot: {
    id: 'slingshot', name: 'Gumball Slingshot', kind: 'weapon', mode: 'shot', power: 2, ammo: 'gumballs',
    hint: 'fire a gumball', visual: 'slingshot',
  },
  spritzer: {
    id: 'spritzer', name: 'Lemon Spritzer', kind: 'weapon', mode: 'spray', power: 1.5,
    hint: 'spray', visual: 'spritzer',
  },
  spray: {
    id: 'spray', name: 'Spray Bottle', kind: 'tool', mode: 'spray', power: 1.2,
    hint: 'spray', visual: 'spray',
  },
  saltgun: {
    id: 'saltgun', name: 'Salt Gun', kind: 'weapon', mode: 'saltgun', power: 1, ammo: 'saltgun',
    hint: 'lay a salt line', visual: 'saltgun',
  },
  caramelizer: {
    id: 'caramelizer', name: 'The Caramelizer', kind: 'weapon', mode: 'fire', power: 3, ammo: 'fuel',
    hint: 'burn it', visual: 'caramelizer',
  },
  fuel: { id: 'fuel', name: 'Fuel Can', kind: 'ammo', visual: 'fuel', refills: { fuel: 10 } },

  // ── WAVE 3 (Contract C): canonical ids; `hit` is the name enemies receive ──
  jawbreaker_cannon: {
    id: 'jawbreaker_cannon', name: 'Jawbreaker Cannon', kind: 'weapon', mode: 'cannon', hit: 'cannon', power: 3.5,
    ammo: 'jawbreakers', hint: 'fire a jawbreaker', visual: 'cannon',
  },
  licorice_whip: {
    id: 'licorice_whip', name: 'Licorice Whip', kind: 'weapon', mode: 'whip', hit: 'whip', power: 2,
    hint: 'crack the whip', visual: 'whip',
  },
  poprocks: {
    id: 'poprocks', name: 'Pop Rocks', kind: 'weapon', mode: 'poprocks', hit: 'poprocks', power: 1.4,
    ammo: 'poprocks', hint: 'lob a fizz bomb', visual: 'poprocks', throwable: true,
  },
  bubblegum_blower: {
    id: 'bubblegum_blower', name: 'Bubblegum Blower', kind: 'weapon', mode: 'gum', hit: 'gum', power: 1,
    ammo: 'gum', hint: 'blow a sticky bubble', visual: 'gumblower',
  },
  marshmallow_launcher: {
    id: 'marshmallow_launcher', name: 'Marshmallow Launcher', kind: 'weapon', mode: 'marsh', hit: 'marshmallow', power: 1.6,
    ammo: 'marshmallows', hint: 'launch a marshmallow', visual: 'marsh',
  },
  peppermint_boomerang: {
    id: 'peppermint_boomerang', name: 'Peppermint Boomerang', kind: 'weapon', mode: 'boomerang', hit: 'boomerang', power: 2,
    hint: 'throw it (it comes back)', visual: 'boomerang',
  },
  water_balloon: {
    id: 'water_balloon', name: 'Water Balloons', kind: 'weapon', mode: 'balloon', hit: 'water', power: 1.2,
    ammo: 'balloons', hint: 'lob a water balloon', visual: 'balloon', pickupVisual: 'balloon_bucket', throwable: true,
  },

  // ammo: never sits in the bag, goes straight into the counter it `refills`
  ammo_jawbreakers: { id: 'ammo_jawbreakers', name: 'Jawbreakers', kind: 'ammo', visual: 'am_jaw', refills: { jawbreakers: 3 } },
  ammo_poprocks: { id: 'ammo_poprocks', name: 'Pop Rocks', kind: 'ammo', visual: 'am_pop', refills: { poprocks: 3 } },
  ammo_gum: { id: 'ammo_gum', name: 'Bubblegum', kind: 'ammo', visual: 'am_gum', refills: { gum: 5 } },
  ammo_marshmallows: { id: 'ammo_marshmallows', name: 'Marshmallows', kind: 'ammo', visual: 'am_marsh', refills: { marshmallows: 6 } },
  ammo_balloons: { id: 'ammo_balloons', name: 'Water Balloons', kind: 'ammo', visual: 'am_balloon', refills: { balloons: 3 } },
  ammo_gumballs: { id: 'ammo_gumballs', name: 'Gumballs', kind: 'ammo', visual: 'am_gumball', refills: { gumballs: 8 } },
  ammo_salt: { id: 'ammo_salt', name: 'Salt', kind: 'ammo', visual: 'am_salt', refills: { salt: 4, saltgun: 10 } },

  // key items other builders hand out (escape: winch + cave key). No `mode`,
  // so they sit in the bag and the hotbar but never in the F ring.
  winch: { id: 'winch', name: 'Catapult Winch', kind: 'tool', keyItem: true },
  cave_key: { id: 'cave_key', name: 'Cave Key', kind: 'tool', keyItem: true },
};

/** F-cycle / hotbar order: melee → shooters → throwables → salt → sprays → heat. */
export const ORDER = [
  'bat', 'licorice_whip', 'peppermint_boomerang',
  'slingshot', 'marshmallow_launcher', 'jawbreaker_cannon', 'bubblegum_blower',
  'poprocks', 'water_balloon', 'salt', 'saltgun',
  'spritzer', 'spray', 'caramelizer',
  'winch', 'cave_key',
];

/** Rounds a counter holds (roughly 2x wave 2) and what a freshly FOUND weapon comes loaded with. */
export const AMMO_CAP = { salt: 24, gumballs: 40, saltgun: 60, fuel: 40, jawbreakers: 12, poprocks: 12, gum: 20, marshmallows: 30, balloons: 12 };
export const AMMO_LOAD = { salt: 12, gumballs: 20, saltgun: 30, fuel: 20, jawbreakers: 6, poprocks: 6, gum: 10, marshmallows: 15, balloons: 6 };
/** Every sweet you pick up tops these counters up (wave 2 x2, plus the new ones). */
export const CANDY_REFILL = { salt: 4, gumballs: 4, saltgun: 10, jawbreakers: 1, poprocks: 1, gum: 2, marshmallows: 3, balloons: 1 };

// ── visual table: pool key → geometry + how it is worn / floats ──────────────
// `hue`  — the marker colour: the ground disc + light shaft that inventory.js
//          draws under this pickup. Sweets all share ONE hue (lavender) so the
//          marker vocabulary reads as "collectible" at a glance; every tool gets
//          its own so you can name it from across the island.
// `mark`  — radius of that ground disc.
// `lift`  — height of the item's GRIP above the ground: tuned so the visual mass
//          floats at chest height (1.2–1.6) with the halo clear of the grass.
// `hold`  — transform in the forearm (elbow group) frame. GUNS (wave 3) share a
//          forward HIP CARRY: rot 0.61 about X puts the barrel 35° below level
//          with the arm hanging and dead level at the hip-fire pose (forearm
//          raised 35°), grip in the fist, barrel beside the wrist.
// `gun`   — the muzzle point in item space: shots leave from there.
export const VISUALS = {
  gumdrop: { build: gumdrop, halo: 0.34, tint: true, gloss: true, pick: 2.0, tilt: [0.0, 0, 0.06], lift: 1.5, hue: 0xb388ff, mark: 0.88 },
  lollipop: { build: lollipop, halo: 0.30, tint: true, gloss: true, pick: 1.75, tilt: [0.09, 0, 0.12], lift: 1.5, hue: 0xb388ff, mark: 0.88 },
  wrapper: { build: wrapper, halo: 0.40, tint: true, gloss: true, pick: 1.95, tilt: [0.12, 0, 0.10], lift: 1.55, hue: 0xb388ff, mark: 0.88 },
  // hold scales (round 4): "held weapons are tiny at the gameplay camera" —
  // everything in the fist is ~1.4–1.6x its pickup-model size, cartoon-chunky
  salt: { build: saltShaker, halo: 0.34, gloss: true, pick: 2.3, tilt: [0.06, 0, 0.09], lift: 0.90, hue: 0x5fd8ff, mark: 1.25, hold: { pos: [0, -0.30, 0.04], rot: [2.55, 0, 0], scale: 1.4 } },
  bat: { build: candyBat, halo: 0.32, gloss: true, pick: 1.62, tilt: [0.0, 0, 0.62], lift: 0.78, hue: 0xff2d4a, mark: 1.25, hold: { pos: [0, -0.26, 0.05], rot: [2.35, 0, 0.12], scale: 1.3 } },
  slingshot: { build: slingshot, halo: 0.32, gloss: true, pick: 2.3, tilt: [0.08, 0, 0.09], lift: 0.89, hue: 0xffa22a, mark: 1.25, hold: { pos: [0, -0.28, 0.05], rot: [2.5, 0, 0], scale: 1.45 } },
  spritzer: { build: spritzer, halo: 0.34, gloss: true, pick: 2.35, tilt: [0.08, 0, 0.10], lift: 0.90, hue: 0xffe23a, mark: 1.25, hold: { pos: [0, -0.28, 0.04], rot: [2.55, 0, 0], scale: 1.45 } },
  spray: { build: sprayBottle, halo: 0.34, gloss: true, pick: 2.3, tilt: [0.06, 0, 0.09], lift: 0.89, hue: 0x3fe4ff, mark: 1.25, hold: { pos: [0, -0.28, 0.03], rot: [2.62, 0, 0], scale: 1.45 } },
  saltgun: { build: saltGun, halo: 0.36, gloss: true, pick: 2.2, tilt: [0.05, 0, 0.14], lift: 0.90, hue: 0x4fe8d8, mark: 1.25, gun: [0, 0.27, 0.72], hold: { pos: [0.13, -0.40, 0.02], rot: [0.61, 0, 0], scale: 1.4 } },
  caramelizer: { build: caramelizer, halo: 0.38, gloss: true, pick: 2.3, tilt: [0.05, 0, 0.20], lift: 0.89, hue: 0xff8a14, mark: 1.3, gun: [0, 0.31, 0.52], hold: { pos: [0.13, -0.40, 0.04], rot: [0.61, 0, 0], scale: 1.45 } },
  fuel: { build: fuelCan, halo: 0.34, gloss: true, pick: 2.15, tilt: [0.05, 0, 0.08], lift: 0.97, hue: 0xff5a28, mark: 1.2 },

  // ── wave 3 weapons ─────────────────────────────────────────────────────────
  cannon: { build: A.cannon, halo: 0.4, gloss: true, pick: 2.1, tilt: [0.05, 0, 0.16], lift: 0.92, hue: 0x4a72ff, mark: 1.35, gun: [0, 0.35, 0.55], hold: { pos: [0.15, -0.40, 0.04], rot: [0.61, 0, 0], scale: 1.5 } },
  whip: { build: A.whip, halo: 0.36, gloss: true, pick: 2.2, tilt: [0.1, 0, 0.22], lift: 0.9, hue: 0xff3b5c, mark: 1.3, hold: { pos: [0, -0.26, 0.04], rot: [2.6, 0, 0.1], scale: 1.45 } },
  poprocks: { build: A.poprocks, halo: 0.34, gloss: true, pick: 2.3, tilt: [0.08, 0, 0.12], lift: 0.9, hue: 0xc77dff, mark: 1.3, hold: { pos: [0, -0.3, 0.06], rot: [2.7, Math.PI / 2, 0], scale: 1.6 } },
  gumblower: { build: A.gumblower, halo: 0.38, gloss: true, pick: 2.2, tilt: [0.05, 0, 0.16], lift: 0.9, hue: 0xff7ac8, mark: 1.3, gun: [0, 0.31, 0.62], hold: { pos: [0.14, -0.40, 0.04], rot: [0.61, 0, 0], scale: 1.5 } },
  marsh: { build: A.marsh, halo: 0.4, gloss: true, pick: 2.0, tilt: [0.05, 0, 0.16], lift: 0.92, hue: 0x7fd0ff, mark: 1.3, gun: [0, 0.3, 0.6], hold: { pos: [0.15, -0.40, 0.04], rot: [0.61, 0, 0], scale: 1.45 } },
  boomerang: { build: A.boomerang, halo: 0.42, gloss: true, pick: 2.1, tilt: [0.3, 0, 0.1], lift: 1.0, hue: 0x6bff9a, mark: 1.3, hold: { pos: [0, -0.3, 0.05], rot: [2.5, 0, 0], scale: 1.5 } },
  balloon: { build: A.balloon, halo: 0.3, gloss: true, pick: 2.2, tilt: [0.05, 0, 0.1], lift: 0.95, hue: 0x2f9bff, mark: 1.25, hold: { pos: [0, -0.34, 0.06], rot: [2.9, 0, 0], scale: 1.65 } },
  balloon_bucket: { build: A.balloonBucket, halo: 0.4, gloss: true, pick: 2.0, tilt: [0.04, 0, 0.08], lift: 0.85, hue: 0x2f9bff, mark: 1.35 },

  // ── wave 3 ammo: smaller, lower, a quieter marker (`ammo` = culled closer) ──
  am_jaw: { build: A.amJaw, halo: 0.36, gloss: true, pick: 2.4, tilt: [0.05, 0, 0.06], lift: 0.8, hue: 0x4a72ff, mark: 1.0, ammo: true },
  am_pop: { build: A.amPop, halo: 0.34, gloss: true, pick: 2.4, tilt: [0.05, 0, 0.06], lift: 0.8, hue: 0xc77dff, mark: 1.0, ammo: true },
  am_gum: { build: A.amGum, halo: 0.34, gloss: true, pick: 2.4, tilt: [0.04, 0, 0.05], lift: 0.8, hue: 0xff7ac8, mark: 1.0, ammo: true },
  am_marsh: { build: A.amMarsh, halo: 0.34, gloss: true, pick: 2.4, tilt: [0.04, 0, 0.05], lift: 0.8, hue: 0x7fd0ff, mark: 1.0, ammo: true },
  am_balloon: { build: A.amBalloon, halo: 0.34, gloss: true, pick: 2.4, tilt: [0.04, 0, 0.05], lift: 0.8, hue: 0x2f9bff, mark: 1.0, ammo: true },
  am_gumball: { build: A.amGumball, halo: 0.3, gloss: true, pick: 2.4, tilt: [0.04, 0, 0.05], lift: 0.8, hue: 0xffa22a, mark: 1.0, ammo: true },
  am_salt: { build: A.amSalt, halo: 0.3, gloss: true, pick: 2.4, tilt: [0.04, 0, 0.06], lift: 0.8, hue: 0x5fd8ff, mark: 1.0, ammo: true },
};

/** What flies: projectile geometries for the wave-3 weapons (no halo, no hold). */
export const PROJECTILES = {
  jaw: A.projJaw, gum: A.projGum, marsh: A.projMarsh, pouch: A.projPouch, balloon: A.projBalloon, rang: A.projRang, lash: A.lash,
};
export function buildProjectile(key) {
  const p = part();
  PROJECTILES[key](p);
  return { geo: p.build(), tris: p.tris };
}

/**
 * Bake one visual → { geo, tris }.
 * `halo: true` adds the floating collectible's plate — a thin ring under the
 * item plus four little chevrons. It is what separates a gumdrop you can TAKE
 * from the nine hundred gumdrops growing out of the ground, and because it is
 * baked into the same geometry it costs no extra draw call.
 */
export function buildVisual(key, { halo = false } = {}) {
  const p = part();
  VISUALS[key].build(p);
  if (halo) {
    const V = VISUALS[key];
    const r = V.halo ?? 0.34;
    // Two CONCENTRIC rings, glowing in the item's own hue (tintable pools stay
    // white and take the sweet's flavour from instanceColor). Round 2's single
    // white ring was the same ring every interactable in the game uses; this one
    // belongs to the pickup and matches the disc on the ground below it.
    const hue = V.tint ? 0xfffdf2 : (V.hue ?? 0xfffdf2);
    p.add(new THREE.TorusGeometry(r, 0.034, 4, 18), hue, { pos: [0, -0.17, 0], rot: [Math.PI / 2, 0, 0], glow: 0.85 });
    p.add(new THREE.TorusGeometry(r * 0.60, 0.020, 4, 14), hue, { pos: [0, -0.17, 0], rot: [Math.PI / 2, 0, 0], glow: 0.6 });
    for (let i = 0; i < 3; i++) {                       // three crumbs of light on the rim
      const a = i * 2.094 + 0.4;
      p.add(new THREE.TetrahedronGeometry(0.062), hue, { pos: [Math.cos(a) * r, -0.17, Math.sin(a) * r], rot: [a, a, 0.4], glow: 1.0 });
    }
  }
  return { geo: p.build(), tris: p.tris };
}

/** Flat salt patch: a crusted disc of radius 1 (scaled per patch) + crystals. */
export function buildSaltPatch() {
  const p = part();
  p.add(new THREE.CircleGeometry(1, 16), 0xf6f8fb, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, 0] });
  p.add(new THREE.CircleGeometry(0.72, 12), 0xffffff, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0.012, 0] });
  for (let i = 0; i < 10; i++) {
    const a = i * 2.399, r = 0.28 + (i % 5) * 0.14;
    p.tet(0.055 + (i % 3) * 0.015, 0xffffff, { pos: [Math.cos(a) * r, 0.03, Math.sin(a) * r], rot: [i * 0.7, i, 0.3] });
  }
  return { geo: p.build(), tris: p.tris };
}

/** Projectile ball (gumball / salt bomb / heat bolt). */
export function buildPellet() {
  const p = part();
  p.sph(0.12, 8, 6, 0xffffff);
  return { geo: p.build(), tris: p.tris };
}
