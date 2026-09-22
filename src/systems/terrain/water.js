// All water: the stylised sea, the syrup river (+ waterfall + delta) and
// Chocolate Lake. Surfaces are derived from world.height() so they always sit
// in the terrain the rest of the game walks on.
import * as THREE from 'three';
import { SEA, CANDY } from '../../core/palette.js';
import { rng, hash } from '../../core/util.js';
import { GLSL_NOISE, GLSL_FIELD, GLSL_WATER, GLSL_AO, patchMaterial, colorOf, smooth } from './common.js';

const TAU = Math.PI * 2;

const GLSL_WAVE = /* glsl */`
void tWave(vec2 p, vec2 dir, float len, float amp, float spd, float t, inout float h, inout vec2 g){
  float k = ${TAU.toFixed(7)} / len;
  float ph = dot(dir, p) * k + t * spd;
  h += amp * sin(ph);
  g += dir * (k * amp * cos(ph));
}
`;

// ─────────────────────────────────────────────────────────────── SEA ────────
export function buildSea(ctx, uniforms, field) {
  const { world } = ctx;
  const axis = (halfCore, step, growth, extra) => {
    const n = Math.round((halfCore * 2) / step);
    const s = (halfCore * 2) / n;
    const core = [];
    for (let i = 0; i <= n; i++) core.push(-halfCore + i * s);
    const pre = [], post = [];
    let d = s, lo = -halfCore, hi = halfCore;
    for (let i = 0; i < extra; i++) { d *= growth; lo -= d; hi += d; pre.unshift(lo); post.push(hi); }
    return pre.concat(core, post);
  };
  const xs = axis(312, 5.2, 1.62, 8);
  const zs = axis(174, 5.2, 1.62, 8);
  const nx = xs.length, nz = zs.length;

  const pos = new Float32Array(nx * nz * 3);
  const land = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = zs[j];
    const inside = Math.abs(xs[i]) < 320 && Math.abs(zs[j]) < 182;
    land[k] = inside && world.height(xs[i], zs[j]) > 1.5 ? 1 : 0;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (land[a] && land[b] && land[c] && land[d]) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * nz * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0.0, transparent: true, depthWrite: true,
  });
  // A graded version of palette.SEA. The palette hues are correct but their
  // VALUES are too high for water: SEA.shallow (#4fc3e8) over a pale sugar-sand
  // shelf rendered as a milky turquoise sheet that filled a whole frame with
  // one flat tone, and white foam had nothing to read against. These are the
  // same hues pushed down in value so the bay has a shore→deep gradient.
  const u = { ...uniforms, uField: { value: field.tex }, uFieldRect: { value: field.rect },
    // ONE base palette for the whole sea. The r3 critic measured three different
    // oceans across three frames (L39/S16, L45/S34, L78/S13) because the old
    // shader mixed up to 60% of the live horizon colour into the NEAR field at a
    // low sun, and took the far field almost entirely to the horizon by 78 u.
    // These three colours are now the sea at every hour; the sky only tints it
    // through the (angle-dependent, physical) Fresnel term and a small, capped
    // aerial share.
    uShoal: { value: colorOf(0x35c9c2) },     // the turquoise shallow band
    uShallow: { value: colorOf(0x1794c6) }, uDeep: { value: colorOf(0x123f78) },
    uShore: { value: colorOf(0x2a9d92) } };
  patchMaterial(mat, {
    key: 'terrain-sea', uniforms: u,
    vertexHead: GLSL_FIELD + GLSL_WAVE + /* glsl */`
      uniform float uTime;
      varying vec3 vWPos; varying vec2 vWaveG; varying float vWaveH;`,
    vertexBody: /* glsl */`
      {
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float dep = max(0.0, -tFieldH(wp0.xz));
        float damp = smoothstep(0.0, 3.4, dep);
        float hs = 0.0; vec2 g = vec2(0.0);
        tWave(wp0.xz, vec2(0.944, 0.330), 71.0, 0.46, 0.55, uTime, hs, g);
        tWave(wp0.xz, vec2(-0.410, 0.912), 43.0, 0.27, 0.78, uTime, hs, g);
        tWave(wp0.xz, vec2(0.800, -0.600), 24.0, 0.11, 1.20, uTime, hs, g);
        hs *= damp; g *= damp;
        transformed.y += hs;
        vWPos = wp0 + vec3(0.0, hs, 0.0);
        vWaveG = g; vWaveH = hs;
      }`,
    fragmentHead: GLSL_NOISE + GLSL_FIELD + GLSL_WATER + GLSL_AO + /* glsl */`
      uniform float uTime; uniform float uDaylight;
      uniform vec3 uShoal; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uShore;
      uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uZenith;
      uniform vec4 uFerry;
      varying vec3 vWPos; varying vec2 vWaveG; varying float vWaveH;
      float gFoam; vec3 gWNor; float gOpen; float gCrestHi; vec2 gRingG; float gFp; vec2 gCrestG;`,
    fragmentColor: /* glsl */`
      {
        vec2 w = vWPos.xz;
        vec3 f = tFieldAll(w);
        gFp = tFootprint(vWPos);
        // NO depth wobble. A ±0.45 noise on the depth used for the shallow/deep
        // ramp is what painted the whole bay in camouflage blotches — the
        // critic read it as "blurred lavender-brown". Depth is depth; the
        // surface interest comes from ripples and glints, not from mottling the
        // albedo.
        float dep = max(0.0, -f.z);
        // WIDE ramps on purpose. world.js gives the seabed a 0.8-unit fbm at
        // ~25 units, and a narrow shallow→deep ramp turns that into a field of
        // soft cyan/navy cloud blotches — the "blurred lavender-brown camouflage"
        // every critic has flagged on this bay. Over a 1.2→15 ramp the same
        // noise moves the mix by ~5%, which reads as depth, not as dirt.
        vec3 col = mix(uShallow, uDeep, smoothstep(1.2, 15.0, dep));
        col = mix(uShore, col, smoothstep(0.0, 3.0, dep));
        gOpen = smoothstep(0.4, 4.0, dep);

        // ── shore geometry: distance offshore + an ALONG-SHORE coordinate ─────
        // The along-shore axis is what lets the surf be cut into SCALLOPS that
        // follow the coast. An isotropic noise jitter (what this used to do)
        // can only ever produce a uniform airbrushed fringe.
        vec3 sdn = tShoreDN(w);
        float off = -sdn.x;                               // units offshore
        vec2 shoreT = vec2(-sdn.z, sdn.y);                // along the waterline
        float alongS = dot(w, shoreT);

        // ── LIGHT TURQUOISE SHALLOW BAND ─────────────────────────────────────
        // Every shoreline in the game gets a band of bright tropical turquoise
        // out to ~16 units, scalloped at its outer edge so it is a shelf, not a
        // stripe of paint. This is the single strongest "this is a sea" cue at
        // the iso camera and it was completely missing.
        float shelfW = 16.0 + sin(alongS * 0.21 + tFbm(w * 0.03) * 6.0) * 5.0;
        float shoal = (1.0 - smoothstep(2.0, shelfW, off)) * (1.0 - smoothstep(2.2, 7.5, dep));
        col = mix(col, uShoal, clamp(shoal, 0.0, 1.0) * 0.78);

        // ── surf ring ────────────────────────────────────────────────────────
        // Keyed off the WORLD-UNIT distance to the waterline, not off depth: a
        // depth band is 30 units wide on a shallow shelf and invisible on a
        // steep one, which is why the shore used to read as a cut edge in half
        // the frames. This is a genuine 2.5-unit foam ring everywhere.
        float scalA = sin(alongS * 0.60 + tFbm(w * 0.055) * 5.4 + uTime * 0.09);
        float scalB = sin(alongS * 1.52 - tFbm(w * 0.135) * 3.6 - uTime * 0.14);
        float jitter = scalA * 1.55 + scalB * 0.72
                     + (tFbm(w * 0.30 - vec2(uTime * 0.06, uTime * 0.03)) - 0.5) * 1.5;
        float d2 = max(off + jitter, -3.0);
        float lace = tFbm(w * 0.75 + vec2(-uTime * 0.13, uTime * 0.06));
        float roll = 0.5 + 0.5 * sin(uTime * 0.85 - d2 * 0.85 + lace * 3.2);
        float ring = 1.0 - smoothstep(0.0, 2.7, max(d2, 0.0));
        // sharper thresholds than r3: lacy scalloped edges, not an airbrush
        float surf = ring * smoothstep(0.34, 0.58, lace * 0.70 + roll * 0.46);
        float wetline = (1.0 - smoothstep(0.0, 1.0, max(d2, 0.0))) * (0.38 + 0.34 * roll);
        // an outer backwash line one lobe further out, so the surf has TWO edges
        float back = (1.0 - smoothstep(0.0, 1.5, abs(d2 - 4.2))) * smoothstep(0.52, 0.80, lace)
                   * (0.25 + 0.55 * roll) * (1.0 - smoothstep(3.0, 9.0, dep));

        // ── ripple rings at anything standing in the water ───────────────────
        // The contact-AO map already marks every registered prop base (pier
        // pilings, quay posts, bollards). Reading CONCENTRIC BANDS off its own
        // falloff gives expanding rings around each of them for free: as uTime
        // grows the bands slide toward lower occlusion, i.e. outward.
        float pil = 1.0 - tContactAO(w);
        float shelf = 1.0 - smoothstep(1.5, 7.0, dep);
        float collar = smoothstep(0.06, 0.40, pil) * gOpen * shelf
                     * (0.45 + 0.55 * smoothstep(0.35, 0.75, tFbm(w * 1.4 + vec2(uTime * 0.2, 0.0))));
        float ringAmp = smoothstep(0.035, 0.15, pil) * (1.0 - smoothstep(0.30, 0.58, pil)) * gOpen * shelf;
        float pilRings = pow(0.5 + 0.5 * sin(pil * 44.0 - uTime * 2.3), 2.2) * ringAmp;
        // ...and the same for the ferry, whose hull MOVES (so it cannot be baked)
        float fd = length(w - uFerry.xy);
        float fMask = uFerry.w * (1.0 - smoothstep(uFerry.z * 0.85, uFerry.z * 3.4, fd))
                    * smoothstep(uFerry.z * 0.80, uFerry.z * 1.05, fd);
        float fRings = pow(0.5 + 0.5 * sin(fd * 1.55 - uTime * 2.9), 2.2) * fMask;
        gRingG = normalize(w - uFerry.xy + vec2(1e-4)) * fRings * 0.32;

        // ── crest highlights ─────────────────────────────────────────────────
        // Crest LINES running across the wind (see tCrestLines). Unlike the r3
        // whitecap term these do NOT die with distance, they just get coarser —
        // so open water keeps visible, high-contrast wave tops all the way out,
        // which is exactly the detail the critic measured as missing.
        vec2 cg;
        float cl = tCrestLines(w, uTime, gFp, vec2(0.944, 0.330), cg);
        gCrestG = cg;
        // BREAK THE LINES. Unbroken crest ribbons running the width of the bay
        // read as marbled endpaper, not as water. Crests come in gusts: a broad
        // patch field decides where there are crests at all, and a finer field
        // cuts each one into segments. Both drift, so the sea keeps moving.
        float brk = smoothstep(0.32, 0.68, tFbm(w * 0.115 + vec2(uTime * 0.035, -uTime * 0.024)));
        float brkF = smoothstep(0.26, 0.64, tVNoise(w * 0.62 - vec2(uTime * 0.08, uTime * 0.05)));
        brk *= mix(1.0, brkF, tResolve(gFp, 0.62) * 0.85);
        gCrestHi = smoothstep(0.52, 0.86, cl) * smoothstep(0.8, 4.0, dep) * (0.18 + 0.82 * brk);
        float whiteCap = smoothstep(0.82, 0.99, cl) * smoothstep(0.20, 0.60, vWaveH + 0.30)
                       * smoothstep(1.6, 6.0, dep) * brk * 0.55;
        // a cool light turquoise on the crest face — NOT cream: a warm near-white
        // line at this density is what turned the bay into an oil slick
        col = mix(col, mix(uShoal, vec3(0.74, 0.89, 0.93), 0.45), gCrestHi * 0.40);
        // ...and the trough between two crests sits a shade deeper
        col *= 1.0 - smoothstep(0.36, 0.86, -cl) * 0.14 * gOpen;

        gFoam = clamp(surf * 0.88 + wetline * 0.85 + back * 0.55 + collar * 0.55
                      + pilRings * 0.75 + fRings * 0.85 + whiteCap, 0.0, 1.0);
        col = mix(col, vec3(1.0), gFoam);

        // ── FINE CHOP, IN THE ALBEDO ─────────────────────────────────────────
        // Ripple NORMALS cannot carry pixel-scale detail on a surface whose N*L
        // barely changes — which is why r3's sea measured 0.85 mean |Laplacian|
        // against 18 on the frosting beside it. A small direct value modulation
        // can, and it is the difference between textured water and an airbrushed
        // gradient. Three octaves, LOD-gated and renormalised so the visible
        // grain always sits at 2-3 screen pixels: never sub-pixel (that is the
        // moire camouflage the earlier rounds fought), never 30 units wide.
        float c0 = tResolve(gFp, 3.60), cA = tResolve(gFp, 1.55);
        float cB = tResolve(gFp, 0.62), cC = tResolve(gFp, 0.24);
        float chop = (tVNoise(w * 3.60 + vec2(uTime * 0.34, -uTime * 0.26)) - 0.5) * c0
                   + (tVNoise(w * 1.55 + vec2(-uTime * 0.22, uTime * 0.15)) - 0.5) * cA
                   + (tVNoise(w * 0.62 + vec2(uTime * 0.11, -uTime * 0.08)) - 0.5) * cB
                   + (tVNoise(w * 0.24 - vec2(uTime * 0.05, uTime * 0.03)) - 0.5) * cC;
        // QUADRATURE normalisation (independent octaves add in quadrature): a
        // plain sum-normalise silently halves the amplitude whenever more than
        // one octave is live, which is most of the frame.
        chop /= max(sqrt(c0 * c0 + cA * cA + cB * cB + cC * cC), 0.30);
        col *= 1.0 + chop * 0.34 * (0.30 + 0.70 * gOpen) * (1.0 - gFoam * 0.6);

        // ── the sea belongs to the sky (but stays ONE sea) ────────────────────
        // Capped hard. The r3 grade took the far field 80% to the horizon colour
        // by 78 u, which is why the aerial rendered a near-white V78/S13 ocean
        // while the pier rendered a V39/S16 one. Scene fog already supplies
        // aerial perspective; this is only the water's own sky share.
        float vd = length(vWPos - cameraPosition);
        float hz = smoothstep(150.0, 520.0, vd);
        float low = 1.0 - smoothstep(0.02, 0.55, uSunDir.y);        // 1 at sunrise/sunset
        col = mix(col, uHorizon * 0.88 + uSunCol * 0.20, (0.07 + 0.20 * low) * (0.40 + 0.60 * hz));
        col = mix(col, uHorizon, hz * 0.42);
        // Dark and glossy at NIGHT — keyed off the sun's ELEVATION, not off
        // daylight: at dawn the daylight ramp is still low while the sun is up
        // and the sea must already be lit.
        float night = 1.0 - smoothstep(-0.20, 0.03, uSunDir.y);
        col *= mix(1.0, 0.55, night);

        diffuseColor.rgb = col;
        diffuseColor.a = mix(0.80, 1.0, smoothstep(-0.05, 0.85, dep));
      }`,
    fragmentRough: /* glsl */`
      // NOT 0.13 — that bleached the whole bay. But 0.64 is a matte slab, which
      // is exactly what the last critic saw. 0.50 → 0.26 gives open water a
      // real (if broad) specular lobe that the ripple normals break into
      // streaks, and the art-directed glint below supplies the rest.
      roughnessFactor = mix(0.56, 0.34, gOpen);
      roughnessFactor = mix(roughnessFactor, 0.26, gCrestHi * 0.5);   // crests are the wet, shiny bit
      roughnessFactor = mix(roughnessFactor, 0.88, gFoam);`,
    fragmentNormal: /* glsl */`
      {
        // THE SWELL MUST NOT SHADE — but the RIPPLES MUST. MeshStandardMaterial
        // uses one normal for diffuse and specular alike, so the 71/43/24-unit
        // swell gradient modulates N*L over patches the size of the swell, which
        // reads as camouflage cloud. That term therefore stays tiny. What was
        // WRONG in r3 was fading the fine ripples out entirely by 82 u as well:
        // that left nothing at all at the distances the game shows water and the
        // sea measured 0.85 mean |Laplacian| — an airbrushed gradient.
        // tRippleLod keeps constant slope variance at every distance by trading
        // fine octaves for coarse ones (see common.js).
        vec2 g = vWaveG * 0.20;
        g += tRippleLod(vWPos.xz, uTime, gFp, 0.26);
        g += gCrestG * 0.013;      // the crest lines are real relief, not paint
        g += gRingG;
        // near sunrise/sunset even the fine ripples swing N*L hard, so they are
        // damped for shading and the glint band carries the surface instead
        g *= mix(1.0, 0.62, 1.0 - smoothstep(0.05, 0.34, uSunDir.y));
        vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
        gWNor = wn;
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`,
    fragmentEmissive: /* glsl */`
      {
        vec3 V = normalize(cameraPosition - vWPos);

        // 1. SKY-GRADIENT REFLECTION. Water at a grazing angle is mostly mirror,
        //    and reflecting the real sky GRADIENT (horizon→zenith along the
        //    mirror ray) rather than one flat horizon colour is what makes a
        //    wave face read as a different colour from the trough beside it.
        //    This is the term that stops the far sea being painted cardboard.
        totalEmissiveRadiance += tSkyGrad(gWNor, V, uHorizon, uZenith, 0.018, 0.40)
                                 * mix(0.26, 1.0, uDaylight) * (1.0 - gFoam * 0.55);

        // 2. SUN-GLINT BAND aimed at the light. A band along the camera→sun
        //    bearing, modulated by a real specular lobe and broken into
        //    thousands of points by a drifting LOD sparkle mask (so the glitter
        //    road survives to the horizon instead of dying at 40 u).
        totalEmissiveRadiance += tSunGlint(vWPos, gWNor, cameraPosition, uSunDir, uSunCol, uTime, 90.0,
                                           mix(0.55, 1.0, gOpen) * (1.0 - gFoam * 0.55) * 1.15);
        // 2b. crest specular: the lit face of every crest catches the sun even
        //     off the glitter road, which is what gives open water its texture.
        float ndl = max(dot(gWNor, normalize(uSunDir)), 0.0);
        totalEmissiveRadiance += uSunCol * gCrestHi * smoothstep(-0.02, 0.22, uSunDir.y)
                                 * (0.014 + 0.045 * ndl);

        // 3. Moon glint: the night sea keeps a cold, tight highlight so it
        //    stays glossy black instead of matte black.
        vec3 mdir = -uSunDir;
        totalEmissiveRadiance += tSunGlint(vWPos, gWNor, cameraPosition, mdir, vec3(0.42, 0.54, 0.86), uTime, 150.0,
                                           (1.0 - uDaylight) * 0.55 * gOpen);
      }
      {
        // Twinkle: sparse, small, and now on a rotated lattice so the pellets
        // never line up into rows on the bay. The lattice SCALE drops with the
        // pixel footprint so the pellets stay ~the same size on screen and the
        // twinkle reaches the far field instead of stopping at 80 u.
        // The lattice SCALE tracks the pixel footprint, so the pellets stay about
        // the same size on screen and the glitter reaches the far field instead
        // of stopping at 80 u. Two passes: sparse bright twinkles everywhere, and
        // a denser, dimmer sheet of sun sparkle inside the glitter road.
        float k = mix(0.62, 0.085, smoothstep(0.08, 0.58, gFp));
        vec2 rw = mat2(0.803, -0.596, 0.596, 0.803) * vWPos.xz;
        vec2 gid = floor(rw * k);
        float rr = tHash21(gid);
        float tw = sin(uTime * 2.0 + rr * 53.0) * 0.5 + 0.5;
        float spark = pow(tw, 12.0) * step(0.905, tHash21(gid + 5.1));
        vec2 fl = fract(rw * k) - 0.5;
        spark *= 1.0 - smoothstep(0.024, 0.070, length(fl));
        spark *= gOpen;
        totalEmissiveRadiance += mix(vec3(0.30, 0.44, 0.85), vec3(1.0, 0.97, 0.86) * 0.7, uDaylight) * spark * 0.9;
        // sun sparkle: dense, small, and confined to the camera→sun bearing
        vec2 gid2 = floor(rw * k * 2.15 + 17.3);
        float tw2 = sin(uTime * 3.1 + tHash21(gid2) * 71.0) * 0.5 + 0.5;
        float sp2 = pow(tw2, 6.0) * step(0.62, tHash21(gid2 + 9.7));
        vec2 fl2 = fract(rw * k * 2.15 + 17.3) - 0.5;
        sp2 *= 1.0 - smoothstep(0.030, 0.100, length(fl2));
        totalEmissiveRadiance += uSunCol * sp2 * gOpen * (1.0 - gFoam * 0.7)
                                 * tGlintBand(vWPos, cameraPosition, uSunDir)
                                 * smoothstep(-0.02, 0.18, uSunDir.y) * 0.55;
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_sea';
  mesh.receiveShadow = false; mesh.castShadow = false;
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.layers.enable(ctx.layers?.water ?? 1);
  return { mesh, tris: idx.length / 3 };
}

// ─────────────────────────────────────────────────── RIVER + WATERFALL ──────
function blur1(a, r) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const j = Math.min(a.length - 1, Math.max(0, i + k)); s += a[j]; n++; }
    out[i] = s / n;
  }
  return out;
}

export function riverProfile(world) {
  const pts3 = world.RIVER.points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'centripetal', 0.5);
  const len = curve.getLength();
  const n = Math.round(len / 1.05);
  const raw = curve.getSpacedPoints(n);
  const N = raw.length;
  const P = new Array(N);
  const terr = new Float32Array(N);
  let along = 0;
  for (let i = 0; i < N; i++) {
    if (i > 0) along += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    terr[i] = world.height(raw[i].x, raw[i].z);
    P[i] = { x: raw[i].x, z: raw[i].z, along, t: i / (N - 1) };
  }
  const total = along;
  let sm = blur1(terr, 5); sm = blur1(sm, 5); sm = blur1(sm, 3);
  const base = new Float32Array(N);
  for (let i = 0; i < N; i++) base[i] = sm[i] + 0.62;

  // steepest stretch in the upper third → waterfall ledge
  let k = -1, bestDrop = 0;
  for (let i = 6; i < N - 8; i++) {
    if (P[i].along < 14 || P[i].along > 52) continue;
    const d = sm[i - 4] - sm[i + 4];
    if (d > bestDrop) { bestDrop = d; k = i; }
  }
  if (k < 0) k = Math.round(N * 0.16);
  const LIFT = 1.55;
  const poolTop = sm[Math.max(0, k - 3)] + 0.62 + LIFT;

  const surf = new Float32Array(N);
  for (let i = 0; i < N; i++) surf[i] = i < k ? Math.max(base[i], poolTop) : base[i];
  // soften the couple of samples right after the lip so the curtain reads as a sheet
  for (let i = k; i < Math.min(N, k + 3); i++) surf[i] = Math.min(surf[i], poolTop - 0.55 - (i - k) * 0.45);

  // tangents + widths
  for (let i = 0; i < N; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1;
    P[i].tx = tx / L; P[i].tz = tz / L;
    P[i].nx = -P[i].tz; P[i].nz = P[i].tx;
    P[i].surf = surf[i]; P[i].terr = terr[i]; P[i].sm = sm[i];
    P[i].wmul = 1 + smooth(0.74, 1.0, P[i].t) * 1.7;
    P[i].pool = surf[i] > base[i] + 0.04 ? 1 : 0;
  }
  const lip = P[k];
  return { P, N, k, lip, poolTop, total, bottom: surf[Math.min(N - 1, k + 4)], width: world.RIVER.width };
}

function syrupMaterial(uniforms, prof, isFall = false) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.16, metalness: 0.0, transparent: true,
    emissive: new THREE.Color(0x5a0f30), emissiveIntensity: 0.05, side: THREE.DoubleSide,
  });
  const u = { ...uniforms, uFallV: { value: prof.lip.along }, uTotal: { value: prof.total },
    uFall: { value: isFall ? 1 : 0 } };
  return patchMaterial(mat, {
    // separate cache keys: the curtain and the ribbon share this source but need
    // their own program + uniform block (uFall switches the lip/spray branch)
    key: isFall ? 'terrain-syrup-fall' : 'terrain-syrup', uniforms: u,
    vertexHead: /* glsl */`
      attribute vec2 aEdge;
      varying vec3 vWPos; varying vec2 vUvR; varying vec2 vEdge;
      uniform float uTime;`,
    vertexBody: /* glsl */`
      vUvR = uv; vEdge = aEdge;
      float bob = sin(uv.y * 0.55 - uTime * 1.8) * 0.045 * aEdge.x;
      transformed.y += bob;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    fragmentHead: GLSL_NOISE + GLSL_WATER + /* glsl */`
      varying vec3 vWPos; varying vec2 vUvR; varying vec2 vEdge;
      uniform float uTime; uniform float uDaylight; uniform float uFallV; uniform float uTotal;
      uniform float uFall;
      uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uSunDir;
      float gSyrupFoam; float gSyrupGloss; vec3 gSyrupNor; vec2 gStreakG;`,
    fragmentColor: /* glsl */`
      {
        float across = vUvR.x;             // -1.25 .. 1.25
        float along  = vUvR.y;             // world units downstream
        float flow   = along - uTime * 3.2;
        float ax0 = abs(across);
        // A DEEP magenta body. r3 rendered this ribbon BRIGHTER than the
        // strawberry frosting it cuts through, so it read as a magenta decal
        // laid on the ground; the brief wants the syrup a stop DARKER than the
        // frosting. The body albedo is ~0.07 linear against the frosting's
        // ~0.30, and the highlight colour is a deep rose rather than hot pink.
        vec3 body = vec3(0.088, 0.0065, 0.045);
        vec3 hot  = vec3(0.430, 0.058, 0.215);
        float n = tFbm(vec2(across * 1.4, flow * 0.10));
        vec3 col = body * (0.84 + 0.32 * n);

        // ── FLOW STREAKS THAT RUN ALONG THE CHANNEL ──────────────────────────
        // r3's stripe phase was 0.95*along + 2.4*across, whose iso-lines cross
        // the channel — the river read as a ladder of bands lying across the
        // current. The phase is now dominated by the ACROSS term, so the streak lines
        // are PARALLEL to the banks; they meander and slide downstream because
        // the warp noise scrolls with the flow coordinate.
        float warp = tFbm(vec2(across * 1.9, flow * 0.055)) * 2.9
                   + tFbm(vec2(across * 0.7 + 9.0, flow * 0.021)) * 1.8;
        float lane = across * 5.1 + warp;
        float streak = sin(lane);
        gSyrupGloss = smoothstep(0.55, 0.98, streak);
        col = mix(col, hot, gSyrupGloss * 0.62);
        // a finer, faster set of filaments between the main lanes
        float lane2 = across * 12.4 + tFbm(vec2(across * 3.4, flow * 0.16)) * 4.4;
        col = mix(col, hot * 0.70, smoothstep(0.74, 1.0, sin(lane2)) * 0.32);
        gStreakG = vec2(cos(lane) * 5.1 * 0.06 + cos(lane2) * 12.4 * 0.012, 0.0);
        // slow transverse swell so the surface is not perfectly laminar
        col *= 1.0 + 0.13 * sin(flow * 0.9 + across * 1.3 + n * 4.0);
        // darker towards the banks — a channel has DEPTH
        col *= 1.0 - smoothstep(0.22, 1.10, ax0) * 0.56;

        // ── bank foam ring + waterfall splash ────────────────────────────────
        // A proper 2-unit froth collar where the syrup meets its banks: the
        // river used to end on a clean ribbon edge, which is what made it read
        // as a magenta decal laid on the frosting rather than as a channel cut
        // into it.
        float lace = tFbm(vec2(across * 2.6, flow * 0.30));
        float lace2 = tFbm(vec2(across * 6.1, flow * 0.9 + 4.0));
        float ax = ax0 + (lace2 - 0.5) * 0.16;
        float edgeFoam = smoothstep(0.86, 1.22, ax) * smoothstep(0.46, 0.86, lace * 0.7 + lace2 * 0.4);
        float wetEdge = smoothstep(0.96, 1.24, ax);
        // ── the SPLASH BASIN under the waterfall ─────────────────────────────
        // A wide churned pool with expanding rings, not the 1.4-unit gaussian
        // smudge r3 had. br is the distance from the point of impact.
        float br = length(vec2((along - uFallV - 4.6) * 0.55, across * 1.5));
        float basin = (1.0 - smoothstep(0.6, 4.2, br)) * (1.0 - uFall);
        float rings = pow(0.5 + 0.5 * sin(br * 3.4 - uTime * 4.2), 2.0);
        float splash = basin * (0.42 + 0.58 * rings) * smoothstep(0.22, 0.66, lace + 0.18);
        float mouth = smoothstep(0.88, 1.0, along / uTotal) * smoothstep(0.40, 0.80, lace) * 0.5;
        // ── the waterfall's own LIP and SPRAY BAND ───────────────────────────
        float fv = clamp((along - uFallV) / 6.0, 0.0, 1.0);       // 0 at the ledge, 1 at the foot
        float lip = uFall * (1.0 - smoothstep(0.02, 0.15, fv));   // thin glassy crest over the ledge
        float spray = uFall * smoothstep(0.66, 1.0, fv)
                    * smoothstep(0.24, 0.72, tFbm(vec2(across * 3.2, fv * 7.0 - uTime * 2.6)));
        // Froth is a CLOSE-RANGE detail. Left on at distance it turns the whole
        // ribbon pale and the river stops reading as deep syrup from the air.
        float ffade = 1.0 - smoothstep(26.0, 95.0, length(vWPos - cameraPosition));
        gSyrupFoam = clamp((edgeFoam * 0.46 + wetEdge * 0.14) * (0.22 + 0.78 * ffade)
                           + splash * 0.95 + mouth + spray * 0.85, 0.0, 1.0);
        col = mix(col, vec3(0.90, 0.66, 0.74), gSyrupFoam * 0.85);   // pink froth, not white water
        // the lip is thin syrup over a hard edge: brighter and glassier
        col = mix(col, hot * 1.35 + vec3(0.05, 0.02, 0.03), lip * 0.8);
        diffuseColor.rgb = col;
        diffuseColor.a = vEdge.x;
      }`,

    fragmentRough: /* glsl */`
      roughnessFactor = mix(0.13, 0.7, gSyrupFoam);`,
    fragmentNormal: /* glsl */`
      {
        float flow = vUvR.y - uTime * 3.2;
        // relief ON the streak lanes (so they catch the sun as raised ribs of
        // syrup running downstream) plus a slow transverse swell
        vec2 g = gStreakG * 0.55;
        g += vec2(0.0, cos(flow * 0.42) * 0.14);
        g += (vec2(tVNoise(vec2(vUvR.x * 3.0, flow * 0.25)), tVNoise(vec2(vUvR.x * 3.0 + 4.0, flow * 0.25 + 2.0))) - 0.5) * 0.30;
        // the family LOD ripple field the sea and the lake use, in WORLD space,
        // so the syrup keeps its texture at any distance instead of going glassy
        g += tRippleLod(vWPos.xz, uTime, tFootprint(vWPos), 0.22);
        vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
        gSyrupNor = wn;
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`,
    fragmentEmissive: /* glsl */`
      {
        // gloss: syrup is the shiniest surface in the game. A Fresnel sky sheen
        // keeps the ribbon from going matte at any angle, and a glint band
        // aimed at the sun rides the flow stripes so the motion reads even at
        // game distance.
        vec3 V = normalize(cameraPosition - vWPos);
        // keep the sheen PINK and modest: a near-white sky reflection at high
        // gain blotches the ribbon with pale mist wherever the ripple normals
        // swing toward grazing
        // EVERYTHING HERE FOLLOWS SUN ELEVATION, NOT uDaylight. The r3 sky critic
        // caught this ribbon rendering as a full-bright magenta slab at 19:12
        // while the whole valley around it was dark: the old code added a FLAT
        // vec3(0.55, 0.08, 0.28) self-glow keyed off (1 - daylight), which at
        // dusk is 2.4x the syrup's own albedo. The syrup is now lit; after dusk
        // it is dark glossy syrup with a cool moon glint and a faint candy glow.
        float sunUp = smoothstep(-0.05, 0.20, uSunDir.y);
        float night = 1.0 - smoothstep(-0.18, 0.05, uSunDir.y);
        vec3 sheen = tSkyFresnel(gSyrupNor, V, uHorizon * vec3(1.0, 0.68, 0.90), uSunCol, 0.024, 0.40);
        totalEmissiveRadiance += sheen * mix(0.12, 1.0, sunUp) * (1.0 - gSyrupFoam * 0.5);
        totalEmissiveRadiance += tSunGlint(vWPos, gSyrupNor, cameraPosition, uSunDir, uSunCol, uTime, 170.0,
                                           (0.30 + 0.70 * gSyrupGloss) * (1.0 - gSyrupFoam * 0.6) * 0.40);
        // moon glint band: the one bright thing on the river after dark
        totalEmissiveRadiance += tSunGlint(vWPos, gSyrupNor, cameraPosition, -uSunDir, vec3(0.46, 0.22, 0.44), uTime, 200.0,
                                           night * 0.60);
        // ...plus a faint candy self-glow, ~1/8 of the old one, so the syrup
        // never goes pure black (it is still magic syrup)
        totalEmissiveRadiance += vec3(0.085, 0.012, 0.046) * night * 0.60;
      }`,
  });
}

export function buildRiver(ctx, uniforms, prof) {
  const { P, N } = prof;
  const halfBase = prof.width * 0.5;
  const rows = [-1.25, -0.86, -0.45, 0.0, 0.45, 0.86, 1.25];
  const R = rows.length;
  const verts = [], uvs = [], edges = [], idx = [];
  const rowOf = new Int32Array(N).fill(-1);
  let vi = 0;
  for (let i = 0; i < N; i++) {
    const p = P[i];
    if (p.surf < -1.6) continue;
    rowOf[i] = vi;
    const hw = halfBase * p.wmul;
    const fade = 1 - smooth(0.90, 1.0, p.t) * 0.75;
    for (let r = 0; r < R; r++) {
      const f = rows[r];
      const x = p.x + p.nx * f * hw, z = p.z + p.nz * f * hw;
      const dip = Math.abs(f) > 1.0 ? 0.30 : 0;
      verts.push(x, p.surf - dip, z);
      uvs.push(f, p.along);
      edges.push(fade, Math.abs(f));
    }
    vi += R;
  }
  for (let i = 0; i < N - 1; i++) {
    const a = rowOf[i], b = rowOf[i + 1];
    if (a < 0 || b < 0) continue;
    // CCW from above (see paths.js) so the surface normals point at the sky
    for (let r = 0; r < R - 1; r++) idx.push(a + r, a + r + 1, b + r, a + r + 1, b + r + 1, b + r);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, syrupMaterial(uniforms, prof));
  mesh.name = 'terrain_river';
  mesh.receiveShadow = false; mesh.castShadow = false;
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.layers.enable(ctx.layers?.water ?? 1);
  return { mesh, tris: idx.length / 3 };
}

/**
 * A raised SUGAR-CRUST LIP along both banks of the syrup river.
 *
 * The r3 critics read the river as "a flat decal": the ground mesh is a 1.34-unit
 * grid, so no amount of vertex painting can put a 1-unit ridge at the waterline —
 * the channel needs real geometry at its edge. This is one four-row ribbon per
 * bank: a foot at the water, a crest ~0.35 up, a shoulder, and an outer row
 * buried just under the terrain so the crust ends in the ground and never shows
 * a polygon edge. Crystalline white on top, syrup-stained at the foot.
 */
export function buildRiverLip(ctx, uniforms, prof) {
  const { world } = ctx;
  const { P, N, k } = prof;
  const halfBase = prof.width * 0.5;
  const rand = rng(hash('terrain-river-lip'));
  const white = colorOf(0xf3e9da), stain = colorOf(0x7e3049), shade = colorOf(0xc8a98c);
  const ROWSF = [1.05, 1.27, 1.54, 1.92];
  const verts = [], cols = [], idx = [];
  const c = new THREE.Color();
  let vi = 0;
  for (const sgn of [-1, 1]) {
    const rowOf = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p.surf < -1.0) continue;                       // out at sea: the surf owns the edge
      if (i > k - 3 && i < k + 6) continue;              // the whipped-cream ledge owns the falls
      if (p.t > 0.93) continue;                          // the delta fans out; no crust there
      const hw = halfBase * p.wmul;
      const wob = 1 + (rand() - 0.5) * 0.14 + Math.sin(p.along * 0.31 + (sgn > 0 ? 1.7 : 0)) * 0.06;
      const gx = p.x + p.nx * sgn * 1.27 * hw * wob, gz = p.z + p.nz * sgn * 1.27 * hw * wob;
      const base = Math.max(p.surf, world.height(gx, gz));
      const crest = base + 0.30 + rand() * 0.16 + Math.sin(p.along * 0.77) * 0.05;
      rowOf[i] = vi;
      for (let r = 0; r < ROWSF.length; r++) {
        const f = ROWSF[r] * wob;
        const x = p.x + p.nx * sgn * f * hw, z = p.z + p.nz * sgn * f * hw;
        const g = world.height(x, z);
        let y;
        if (r === 0) y = Math.max(p.surf + 0.04, g - 0.10);
        else if (r === 1) y = crest;
        else if (r === 2) y = Math.max(g + 0.06, crest - 0.16);
        else y = g - 0.12;
        verts.push(x, y, z);
        c.copy(white);
        if (r === 0) c.lerp(stain, 0.62);
        else if (r === 1) c.multiplyScalar(0.97 + rand() * 0.08);
        else if (r === 2) c.lerp(shade, 0.30);
        else c.lerp(shade, 0.70).multiplyScalar(0.8);
        cols.push(c.r, c.g, c.b);
      }
      vi += ROWSF.length;
    }
    for (let i = 0; i < N - 1; i++) {
      const a = rowOf[i], b = rowOf[i + 1];
      if (a < 0 || b < 0) continue;
      for (let r = 0; r < ROWSF.length - 1; r++) {
        // winding flips with the side so both crusts face the sky
        if (sgn > 0) idx.push(a + r, a + r + 1, b + r, a + r + 1, b + r + 1, b + r);
        else idx.push(a + r, b + r, a + r + 1, a + r + 1, b + r, b + r + 1);
      }
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0, flatShading: true });
  patchMaterial(mat, {
    key: 'terrain-river-lip', uniforms: { ...uniforms },
    vertexHead: 'varying vec3 vWPos;',
    vertexBody: 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragmentHead: GLSL_NOISE + 'varying vec3 vWPos;',
    fragmentColor: /* glsl */`
      {
        // crystalline sugar: coarse grain plus a sparse hard sparkle
        vec2 sg = mat2(0.803, -0.596, 0.596, 0.803) * vWPos.xz;
        diffuseColor.rgb *= 0.90 + 0.22 * tVNoise(sg * 2.6);
        float spk = smoothstep(0.955, 1.0, tHash21(floor(sg * 13.0)));
        spk = max(spk, smoothstep(0.975, 1.0, tHash21(floor(sg * 31.0 + 4.1))));
        diffuseColor.rgb *= 1.0 + spk * 0.55;
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_river_lip';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return { mesh, tris: idx.length / 3 };
}

/** The falling sheet at the ledge. */
export function buildWaterfall(ctx, uniforms, prof) {
  const { world } = ctx;
  const k = prof.k, P = prof.P;
  const lip = P[k];
  const hw = prof.width * 0.5 * 1.02;
  const COLS = 17, ROWS = 11;
  const top = prof.poolTop - 0.02;
  const footIdx = Math.min(P.length - 1, k + 4);
  const foot = P[footIdx];
  const verts = [], uvs = [], edges = [], idx = [];
  for (let r = 0; r < ROWS; r++) {
    const v = r / (ROWS - 1);
    // the sheet leans downstream as it falls
    const lean = v * v * 3.1;
    for (let c = 0; c < COLS; c++) {
      const f = (c / (COLS - 1)) * 2 - 1;
      // The curtain narrows as it falls and its edges wander, so the sheet does
      // not read as a rectangular billboard pinned in front of the ledge.
      const taper = 1 - 0.22 * v * v;
      const wander = Math.sin(v * 5.1 + f * 2.3) * 0.055 * v;
      const bulge = (1 - 0.12 * f * f) * taper + wander;
      const x = lip.x + lip.tx * lean + lip.nx * f * hw * bulge;
      const z = lip.z + lip.tz * lean + lip.nz * f * hw * bulge;
      const ground = world.height(x, z);
      const y = top - (top - Math.max(ground + 0.15, foot.surf)) * (v * v * 0.82 + v * 0.18);
      verts.push(x, y, z);
      uvs.push(f * 1.25, v * 6.0 + lip.along);
      // alpha feathers at the two vertical edges (aEdge.x is the syrup's alpha)
      edges.push((1 - v * 0.10) * (1 - smooth(0.70, 1.0, Math.abs(f))), Math.abs(f));
    }
  }
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
    const a = r * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = syrupMaterial(uniforms, prof, true);
  mat.userData.fall = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_waterfall';
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return { mesh, tris: idx.length / 3 };
}

// ────────────────────────────────────────────────────────── CHOCOLATE LAKE ──
export function lakeSurfaceLevel(world) {
  const L = world.LAKE;
  // world.js carves an explicit bowl (floor L.floor) so LAKE.surface is the
  // real water level; only fall back to a measured level if the basin is
  // somehow shallower than declared.
  let mn = Infinity;
  for (let z = L.z - 18; z <= L.z + 18; z += 0.75) for (let x = L.x - 18; x <= L.x + 18; x += 0.75) {
    const h = world.height(x, z);
    if (h < mn) mn = h;
  }
  if (mn > L.surface - 0.25) return mn + 1.0;      // basin too shallow: lift
  return L.surface;
}

export function buildLake(ctx, uniforms, surface, deckAt = null) {
  const { world } = ctx;
  const L = world.LAKE;
  const R = 23, step = 0.5;
  const n = Math.round((R * 2) / step), V = n + 1;
  const Hh = new Float32Array(V * V);
  const pos = new Float32Array(V * V * 3), edg = new Float32Array(V * V * 3);
  // Per-vertex "there is a boardwalk over me" mask. The r3 critic could not tell
  // the piers from the pool because both rendered as the same mid-brown; a deck
  // has to sit on a DARKER value than the water it crosses.
  const dck = new Float32Array(V * V);
  // The basin world.js carves is SHALLOW (floor 0.8 under a 2.0 surface ⇒ 1.2
  // units at most), so the depth masks must be normalised against the real
  // bowl. Dividing by fixed 1.1 / 2.6 — as this did — capped the "open water"
  // mask at 0.46 and silently disabled every gloss term in the shader.
  let maxDepth = 0;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const h = world.height(L.x - R + i * step, L.z - R + j * step);
    Hh[j * V + i] = h;
    if (surface - h > maxDepth) maxDepth = surface - h;
  }
  const dRim = Math.max(0.22, maxDepth * 0.30);   // caramel rim: the shore band only
  const dOpen = Math.max(0.45, maxDepth * 0.62);  // open water: full gloss inside this
  const hAt = (i, j) => Hh[Math.min(V - 1, Math.max(0, j)) * V + Math.min(V - 1, Math.max(0, i))];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = L.x - R + i * step, z = L.z - R + j * step, k = j * V + i;
    const depth = surface - Hh[k];
    pos[k * 3] = x; pos[k * 3 + 1] = surface; pos[k * 3 + 2] = z;
    edg[k * 3] = Math.min(1, Math.max(0, depth / dRim));
    edg[k * 3 + 1] = Math.min(1, Math.max(0, depth / dOpen));
    // Distance (WORLD UNITS) from this point to the bank. The old rim ran on
    // DEPTH alone: with a 1.4-unit-deep basin and a steep bank that made the
    // whole shore transition 0.7 units wide, which is why the lake ended on a
    // hard straight cut instead of a shore.
    const gx = (hAt(i + 2, j) - hAt(i - 2, j)) / (4 * step);
    const gz = (hAt(i, j + 2) - hAt(i, j - 2)) / (4 * step);
    const g = Math.max(0.06, Math.hypot(gx, gz));
    edg[k * 3 + 2] = Math.min(12, Math.max(-4, depth / g));
    // under-deck shadow: the licorice boardwalk crosses the lake on the
    // candy_main path, and its ribbon is 1.28 half-widths wide
    if (depth > -0.4) {
      const np = world.nearestPath(x, z, 'candy');
      if (np.path) {
        const hw = np.path.width * 0.5;
        dck[k] = 1 - smooth(hw * 1.24, hw * 1.24 + 2.6, np.d);
        if (deckAt && deckAt(x, z) === null) dck[k] *= 0.25;
      }
    }
  }
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    // keep a ring of quads ONTO the bank (they alpha out to nothing there) so
    // the polygon boundary is never the thing that ends the water
    const keep = surface + 0.9;
    if (Hh[a] > keep && Hh[b] > keep && Hh[c] > keep && Hh[d] > keep) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edg, 3));
  geo.setAttribute('aDeck', new THREE.BufferAttribute(dck, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.06, metalness: 0.0, transparent: true,
    emissive: new THREE.Color(0x120802), emissiveIntensity: 0.5,
  });
  const LC = `vec2(${L.x.toFixed(1)}, ${L.z.toFixed(1)})`;
  patchMaterial(mat, {
    key: 'terrain-lake', uniforms: { ...uniforms },
    vertexHead: /* glsl */`
      attribute vec3 aEdge; attribute float aDeck;
      varying vec3 vWPos; varying vec3 vEdge; varying vec2 vRipG; varying float vRipH; varying float vDeck;
      uniform float uTime;
      // Three slow, viscous wave trains + two expanding drip rings. Crossing
      // trains keep the surface from reading as concentric target stripes.
      void tChoc(vec2 w, float t, out float h, out vec2 g){
        h = 0.0; g = vec2(0.0);
        const vec2 d1 = vec2(0.93, 0.37), d2 = vec2(-0.44, 0.90), d3 = vec2(0.62, -0.78);
        float k1 = 0.255, k2 = 0.415, k3 = 0.72;
        h += 0.052 * sin(dot(w, d1) * k1 - t * 0.46);  g += d1 * (0.052 * k1 * cos(dot(w, d1) * k1 - t * 0.46));
        h += 0.034 * sin(dot(w, d2) * k2 + t * 0.61);  g += d2 * (0.034 * k2 * cos(dot(w, d2) * k2 + t * 0.61));
        h += 0.017 * sin(dot(w, d3) * k3 - t * 0.83);  g += d3 * (0.017 * k3 * cos(dot(w, d3) * k3 - t * 0.83));
        vec2 c1 = ${LC} + vec2(-4.5, 3.0), c2 = ${LC} + vec2(6.0, -5.5);
        float r1 = length(w - c1) + 1e-4, r2 = length(w - c2) + 1e-4;
        float a1 = 0.030 / (1.0 + r1 * 0.10), a2 = 0.022 / (1.0 + r2 * 0.12);
        h += a1 * sin(r1 * 0.70 - t * 0.95);  g += ((w - c1) / r1) * (a1 * 0.70 * cos(r1 * 0.70 - t * 0.95));
        h += a2 * sin(r2 * 0.92 - t * 1.25);  g += ((w - c2) / r2) * (a2 * 0.92 * cos(r2 * 0.92 - t * 1.25));
      }`,
    vertexBody: /* glsl */`
      vEdge = aEdge; vDeck = aDeck;
      vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
      float rh; vec2 rg; tChoc(wp.xz, uTime, rh, rg);
      rh *= aEdge.y; rg *= aEdge.y;
      transformed.y += rh;
      vRipG = rg; vRipH = rh;
      vWPos = wp + vec3(0.0, rh, 0.0);`,
    fragmentHead: GLSL_NOISE + GLSL_WATER + GLSL_AO + /* glsl */`
      varying vec3 vWPos; varying vec3 vEdge; varying vec2 vRipG; varying float vRipH; varying float vDeck;
      uniform float uTime; uniform float uDaylight;
      uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uHorizon; uniform vec3 uZenith;
      float gCrest; float gGloss; vec3 gWNor; float gLakeFoam; float gDeck;`,
    fragmentColor: /* glsl */`
      {
        vec2 w = vWPos.xz;
        // Molten DARK chocolate. These albedos are about half of what "looks
        // right" in isolation: the sun is 3.4 + hemi 0.8 through ACES, so a
        // 0.20 linear albedo renders as milky tan. The pool has to be dark for
        // the highlights below to read as gloss rather than as wet sand.
        vec3 dark = vec3(0.0175, 0.0072, 0.0036);
        vec3 milk = vec3(0.0520, 0.0215, 0.0100);
        // VISCOUS SWIRL. A domain-warped fbm that turns very slowly, but with a
        // hard threshold so the marbling reads as thick folded chocolate rather
        // than as soft mud (r3: "fully matte, blends into the ground"). The
        // second warp term shears the pattern so the folds have direction.
        vec2 q = w * 0.085;
        q += vec2(tFbm(q * 1.7 + vec2(uTime * 0.013, 0.0)), tFbm(q * 1.7 + vec2(5.3, -uTime * 0.011))) * 1.9;
        float swirl = tFbm(q);
        vec3 col = mix(dark, milk, smoothstep(0.40, 0.74, swirl));
        // thin pale cocoa-butter filaments riding the fold lines
        float fold = 1.0 - smoothstep(0.0, 0.055, abs(swirl - 0.585));
        col = mix(col, milk * 1.85, fold * 0.55);
        // a lighter skin of cocoa butter in the slack water between ripples
        col *= 1.0 + smoothstep(0.55, 0.95, tFbm(w * 0.33 + vec2(-uTime * 0.02, uTime * 0.015))) * 0.10;
        // ripple crests brighten slightly (the wave height comes from the vertex)
        gCrest = smoothstep(0.056, 0.104, vRipH);
        col *= 1.0 + gCrest * 0.22;
        // Structured gloss mask. A physically-aligned mirror highlight only
        // fires when the camera happens to sit in the sun's reflection, so the
        // pool read matte from most angles. Driving the specular through a
        // high-contrast drifting mask instead gives bright streaks of gloss
        // that are always somewhere on the surface — without the uniform lift
        // that a broad specular lobe produces.
        gGloss = smoothstep(0.50, 0.90, tFbm(w * 0.55 + vec2(-uTime * 0.05, uTime * 0.035)));

        // ── shore ring ───────────────────────────────────────────────────────
        // Keyed off the WORLD-UNIT distance to the bank (aEdge.z), not off
        // depth. This basin is only 1.4 units deep with a steep rim, so the old
        // depth-normalised rim was 0.7 units wide — a hard cut where the
        // chocolate met the caramel instead of a shore.
        float sdn = vEdge.z + (tFbm(w * 0.55 + vec2(uTime * 0.04, -uTime * 0.03)) - 0.5) * 1.5
                            + (tFbm(w * 0.17 - vec2(0.0, uTime * 0.015)) - 0.5) * 1.9;
        // A DEFINED caramel rim: a bright band ~1.4 units wide with a crisp
        // inner edge, then a hard step back into dark chocolate. r3's 3.2-unit
        // linear ramp dissolved the whole shore into the tan ground.
        float rim = 1.0 - smoothstep(0.35, 1.9, max(sdn, 0.0));
        col = mix(col, vec3(0.205, 0.098, 0.030), smoothstep(0.30, 0.72, rim) * 0.95);
        // a thin hot-caramel line exactly on the waterline
        col = mix(col, vec3(0.340, 0.176, 0.056), (1.0 - smoothstep(0.0, 0.55, abs(sdn - 0.25))) * 0.65);
        float lace = tFbm(w * 1.15 + vec2(uTime * 0.05, -uTime * 0.04));
        float lick = 0.45 + 0.55 * sin(uTime * 0.55 - sdn * 1.1 + lace * 3.0);
        gLakeFoam = (1.0 - smoothstep(0.0, 1.9, max(sdn, 0.0))) * smoothstep(0.34, 0.72, lace * 0.7 + lick * 0.4);
        // foam collars + expanding ripple rings around the boardwalk pilings
        // (the AO map marks every one of them; concentric bands read off its own
        // falloff travel outward as uTime grows — see the sea shader)
        float pil = 1.0 - tContactAO(w);
        gLakeFoam = max(gLakeFoam, smoothstep(0.08, 0.42, pil) * smoothstep(0.0, 2.0, sdn)
                        * (0.45 + 0.55 * smoothstep(0.35, 0.75, tFbm(w * 1.6 + vec2(uTime * 0.25, 0.0)))) * 0.8);
        float lRing = smoothstep(0.03, 0.14, pil) * (1.0 - smoothstep(0.28, 0.55, pil))
                    * smoothstep(0.4, 2.2, sdn) * pow(0.5 + 0.5 * sin(pil * 48.0 - uTime * 2.1), 2.2);
        gLakeFoam = max(gLakeFoam, lRing * 0.7);
        col = mix(col, vec3(0.245, 0.150, 0.072), gLakeFoam * 0.9);

        // ── under the boardwalk ──────────────────────────────────────────────
        // Chocolate in the shade of a deck, so the planks read as a structure
        // ON the lake rather than as another brown surface beside it.
        gDeck = clamp(vDeck, 0.0, 1.0);
        col *= mix(1.0, 0.30, gDeck);
        col = mix(col, col * vec3(0.80, 0.86, 1.05), gDeck * 0.6);
        diffuseColor.rgb = col;
        // fade out over a couple of units at the waterline so the polygon edge
        // never shows as a hard rim (the ground under it is chocolate-stained)
        diffuseColor.a = smoothstep(-0.6, 1.1, vEdge.z) * 0.96;
      }`,
    fragmentRough: /* glsl */`
      roughnessFactor = mix(0.22, 0.028, vEdge.y);       // melted chocolate is a MIRROR
      roughnessFactor = mix(roughnessFactor, 0.70, gLakeFoam);
      roughnessFactor = mix(roughnessFactor, 0.34, gDeck * 0.8);`,
    fragmentNormal: /* glsl */`
      {
        vec2 w = vWPos.xz;
        vec2 g = vRipG;
        // the family LOD ripple field (shared with the sea and the river): fine
        // octaves near the bank, coarse ones across the pool, constant slope
        // variance, so the gloss breaks into glints at every distance
        g += tRippleLod(w, uTime, tFootprint(vWPos), 0.115) * vEdge.y;
        vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
        gWNor = wn;
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`,
    fragmentEmissive: /* glsl */`
      {
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 L = normalize(uSunDir);
        float sunUp = smoothstep(-0.05, 0.20, L.y);
        float open = vEdge.y;

        // 1. GLOSS — a Fresnel sheen of real sky colour. Chocolate is a shiny
        //    dielectric: the far half of the pool, seen at a grazing angle,
        //    mirrors the sky and that is what sells "glossy" at game distance.
        float ndv = max(dot(gWNor, V), 0.0);
        // Tinted WARM and kept modest. A strong near-neutral sky reflection is
        // what kept dragging this pool back to tan: +0.044 linear of white on a
        // 0.035 linear chocolate albedo halves its saturation and pushes the
        // green/red ratio from 0.65 (chocolate) to 0.87 (wet sand). Now it
        // reflects the sky GRADIENT (a wave face and its trough get different
        // sky), which reads as gloss without lifting the average value.
        vec3 skyRefl = tSkyGrad(gWNor, V, uHorizon, uZenith, 0.020, 0.58) * vec3(1.0, 0.78, 0.60);
        totalEmissiveRadiance += skyRefl * mix(0.15, 0.85, uDaylight) * (0.35 + 0.65 * open)
                                 * (0.32 + 0.68 * gGloss) * (1.0 - gDeck * 0.8);

        // 2. SUN-GLINT BAND along the camera→sun bearing (shared with the sea
        //    and the river) instead of the old camera-independent "ridge" term.
        //    That term lit whichever face of each SINUSOIDAL wave train tilted
        //    sunward — and since those trains are 25-unit straight sinusoids, it
        //    drew long straight bright bars across the pool. Those were the
        //    "painted stripes".
        totalEmissiveRadiance += tSunGlint(vWPos, gWNor, cameraPosition, uSunDir, uSunCol, uTime, 220.0,
                                           mix(0.4, 1.0, open) * (0.25 + 0.75 * gGloss) * 1.15
                                           * (1.0 - gLakeFoam * 0.6) * (1.0 - gDeck * 0.85));
        // moonlit chocolate: glossy black, never matte black
        totalEmissiveRadiance += tSunGlint(vWPos, gWNor, cameraPosition, -uSunDir, vec3(0.44, 0.40, 0.62), uTime, 260.0,
                                           (1.0 - uDaylight) * 0.7 * open);

        // 3. ripple crests catch a thin warm line of light
        totalEmissiveRadiance += uSunCol * gCrest * open * (0.030 + 0.075 * sunUp);

        // 4. never a black hole: a faint cocoa self-glow floors the surface, and
        //    at night the lake still shows the moonlit sky it reflects
        totalEmissiveRadiance += vec3(0.0085, 0.0040, 0.0020) + mix(vec3(0.016, 0.017, 0.026), vec3(0.0), uDaylight);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_lake';
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.layers.enable(ctx.layers?.water ?? 1);
  return { mesh, tris: idx.length / 3 };
}
