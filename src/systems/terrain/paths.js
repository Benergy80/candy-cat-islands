// Path ribbons: licorice twists on Candyland, pawprint cobbles on Cat Island.
// Each ribbon is a 7-row strip that follows world.height(), crowned in the
// middle and feathered into the ground colour at the shoulders.
import * as THREE from 'three';
import { CANDY, CAT } from '../../core/palette.js';
import { GLSL_NOISE, GLSL_AO, patchMaterial, smooth, colorOf } from './common.js';

// offset fraction of half-width, core blend, height offset
const ROWS = [
  [-1.28, 0.00, -0.04],
  [-1.02, 0.82, 0.075],
  [-0.66, 1.00, 0.140],
  [0.00, 1.00, 0.175],
  [0.66, 1.00, 0.140],
  [1.02, 0.82, 0.075],
  [1.28, 0.00, -0.04],
];

// Shoulder colours: an approximation of the new ground albedo either side of
// the ribbon, so the edge of the path melts into the terrain instead of
// floating on a pale halo. Keep these in step with ground.js.
const GROUND_CANDY = colorOf(0x5e3c40);
const GROUND_CAT = colorOf(0x6f6d52);

export function buildPaths(ctx, island, uniforms, helpers) {
  const { world } = ctx;
  const paths = world.PATHS.filter((p) => p.island === island);
  // The ground is a ~1.34-unit grid, so its rendered surface is the linear
  // interpolation of nearby grid nodes — which on any convex ground sits ABOVE
  // world.height() at the path vertex. Sampling only the vertex left 360 of
  // 640 core verts buried (worst −0.128) and the ribbon z-fought or vanished.
  // Taking the local MAX over a grid-diagonal disc bounds the mesh surface.
  const GSTEP = (world.ISLANDS[island].radius * 2.36) / 208;
  const RING = [];
  for (let a = 0; a < 8; a++) RING.push([Math.cos((a / 8) * Math.PI * 2) * GSTEP * 1.05, Math.sin((a / 8) * Math.PI * 2) * GSTEP * 1.05]);
  const groundTop = (x, z) => {
    let m = world.height(x, z);
    for (const [dx, dz] of RING) { const h = world.height(x + dx, z + dz); if (h > m) m = h; }
    return m;
  };
  const verts = [], uvs = [], edges = [], cols = [], idx = [];
  const groundCol = island === 'candy' ? GROUND_CANDY : GROUND_CAT;
  const tmp = new THREE.Color();
  let vbase = 0;

  for (const path of paths) {
    const curve = new THREE.CatmullRomCurve3(path.points.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal', 0.5);
    const len = curve.getLength();
    const n = Math.max(10, Math.round(len / 1.15));
    const pts = curve.getSpacedPoints(n);
    const hw = path.width * 0.5;
    let along = 0;
    const cols0 = [];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1;
      const nx = -tz / L, nz = tx / L;
      cols0.push({ x: pts[i].x, z: pts[i].z, nx, nz, along });
    }
    const start = vbase;
    for (const c of cols0) {
      for (const [f, core, dy] of ROWS) {
        const x = c.x + c.nx * f * hw, z = c.z + c.nz * f * hw;
        // core rows ride the grid maximum (never buried); shoulders stay on the
        // true surface so the ribbon edge still feathers into the ground
        const gh = world.height(x, z);
        let y = gh + (groundTop(x, z) - gh) * core + dy;
        const deck = helpers.deckLevel(x, z);
        let onDeck = 0;
        if (deck !== null && deck + 0.2 > y) { y = deck + 0.2; onDeck = 1; }
        verts.push(x, y, z);
        uvs.push(f * hw, c.along);
        edges.push(core, f, onDeck);
        // shoulders inherit an approximation of the ground colour so the edge melts
        tmp.copy(groundCol);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
      vbase += ROWS.length;
    }
    for (let i = 0; i < cols0.length - 1; i++) {
      const a = start + i * ROWS.length, b = a + ROWS.length;
      // winding must be CCW seen from above (across × along = +Y), otherwise the
      // whole ribbon is back-face culled and the path silently disappears.
      for (let r = 0; r < ROWS.length - 1; r++) idx.push(a + r, a + r + 1, b + r, a + r + 1, b + r + 1, b + r);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = island === 'candy' ? licoriceMaterial(uniforms) : cobbleMaterial(uniforms);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain_paths_' + island;
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return { mesh, tris: idx.length / 3 };
}

function licoriceMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return patchMaterial(mat, {
    key: 'terrain-path-licorice', uniforms: { ...uniforms },
    vertexHead: /* glsl */`
      attribute vec3 aEdge;
      varying vec2 vUvP; varying vec3 vEdge; varying vec3 vWPos;`,
    vertexBody: /* glsl */`
      vUvP = uv; vEdge = aEdge;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    fragmentHead: GLSL_NOISE + GLSL_AO + /* glsl */`
      varying vec2 vUvP; varying vec3 vEdge; varying vec3 vWPos;
      uniform float uTime; uniform float uDaylight;
      float gCore; float gDark;`,
    fragmentColor: /* glsl */`
      {
        float core = vEdge.x;
        float f = vEdge.y;                      // -1.28 .. 1.28 (fraction of half-width)
        float along = vUvP.y;
        float deck = clamp(vEdge.z, 0.0, 1.0);

        // ── ribbon profile ───────────────────────────────────────────────────
        // The walkable width stays PATHS.width — the geometry is untouched — but
        // the DARK licorice core is now half as wide as the strip, and the rest
        // of the strip is a soft sugar-dust verge. A 3.2-unit black ribbon
        // through a pastel village reads as a canal; a 1.6-unit one with dusty
        // shoulders reads as a road.
        float nb = (tVNoise(vWPos.xz * 1.35) - 0.5) * 0.26 + (tVNoise(vWPos.xz * 4.1) - 0.5) * 0.10;
        float af = abs(f) + nb;
        float ribbon = 1.0 - smoothstep(0.82, 1.20, af);
        float dark = 1.0 - smoothstep(0.30, 0.62, af);
        dark = max(dark, deck);                 // the boardwalk keeps its full width

        // ── twisted licorice rope ────────────────────────────────────────────
        // Warm dark brown-RED, not near-black: at 4% linear this path measured
        // 12% value on screen and swallowed the light out of every scene it
        // crossed. ~30% is dark enough to read as licorice and light enough to
        // keep its own hue at dusk.
        float s = along * 0.42 + f * 1.22 + tFbm2(vec2(along * 0.12, f * 0.5)) * 0.35;
        float sw = fwidth(s);
        float tri = abs(fract(s) - 0.5) * 2.0;
        // MIP-SAFE: widen the stripe edge to at least one pixel, then fade the
        // stripe out entirely once a whole band is narrower than ~2 px. Without
        // this the spiral turned into crawling white scratch lines at night and
        // at any distance — pure temporal aliasing on a 1-pixel feature.
        float aa = clamp(sw * 2.4, 0.035, 0.42);
        float vis = 1.0 - smoothstep(0.20, 0.46, sw);
        float red = smoothstep(0.80 - aa, min(0.985, 0.80 + aa + 0.12), tri) * vis * (1.0 - deck * 0.85);
        vec3 lic = vec3(0.086, 0.033, 0.031);
        vec3 rd  = vec3(0.190, 0.028, 0.046);
        // as the stripe dissolves, fold its average back into the body so the
        // path keeps the same VALUE at every distance
        vec3 c = mix(lic, rd, red * 0.96 + (1.0 - vis) * 0.17);
        // crown sheen: the middle of the rope catches the light
        c *= 1.0 + 0.20 * (1.0 - smoothstep(0.0, 0.70, af));
        c *= 0.88 + 0.22 * tVNoise(vWPos.xz * 3.0);
        // scuffed sugar dust trodden into the licorice
        c += vec3(0.040, 0.034, 0.030) * smoothstep(0.72, 1.0, tVNoise(vWPos.xz * 1.3)) * (1.0 - red);

        // ── sugar-dust shoulder ──────────────────────────────────────────────
        // Warm pale grit half-way between the path and the frosting, broken up
        // by noise so the ribbon never ends on a clean cut.
        vec3 dust = mix(diffuseColor.rgb * 1.10, vec3(0.360, 0.295, 0.243), 0.50);
        dust *= 0.88 + 0.26 * tVNoise(vWPos.xz * 2.2 + 5.0);
        dust += vec3(0.040, 0.035, 0.029) * smoothstep(0.58, 1.0, tVNoise(vWPos.xz * 5.5));

        // over water the road becomes a chocolate-plank boardwalk (softer than a
        // candy-striped ribbon floating on the lake)
        if (deck > 0.01) {
          float pl = fract(along * 0.62);
          float seam = smoothstep(0.0, 0.07, pl) * (1.0 - smoothstep(0.93, 1.0, pl));
          vec3 wood = vec3(0.145, 0.078, 0.044) * (0.82 + 0.34 * tHash21(floor(vec2(along * 0.62, f * 1.6))));
          wood *= 0.62 + 0.38 * seam;
          wood *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.9, abs(f)));
          c = mix(c, wood, deck * 0.92);
        }

        vec3 surf = mix(dust, c, dark);
        gCore = core; gDark = dark * ribbon;
        diffuseColor.rgb = mix(diffuseColor.rgb, surf, ribbon);
        // contact occlusion + a soft trough where the verge meets the frosting
        diffuseColor.rgb *= mix(1.0, tContactAO(vWPos.xz), 0.85);
        diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.30, abs(af - 0.62))) * 0.16 * (1.0 - deck);
      }`,
    fragmentRough: /* glsl */`
      roughnessFactor = mix(roughnessFactor, 0.30, gDark);
      roughnessFactor = mix(roughnessFactor, 0.94, (1.0 - gDark) * gCore * 0.8);`,
  });
}

function cobbleMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return patchMaterial(mat, {
    key: 'terrain-path-cobble', uniforms: { ...uniforms },
    vertexHead: /* glsl */`
      attribute vec3 aEdge;
      varying vec2 vUvP; varying vec3 vEdge; varying vec3 vWPos;`,
    vertexBody: /* glsl */`
      vUvP = uv; vEdge = aEdge;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    fragmentHead: GLSL_NOISE + GLSL_AO + /* glsl */`
      varying vec2 vUvP; varying vec3 vEdge; varying vec3 vWPos;
      uniform float uTime;
      float gCore;
      float pawSDF(vec2 p){
        vec2 q = p - vec2(0.0, -0.085); q.x /= 1.18; q.y /= 0.92;
        float d = length(q) - 0.150;
        for (int i = 0; i < 4; i++) {
          float a = (float(i) - 1.5) * 0.62;
          vec2 t = vec2(sin(a) * 0.235, 0.135 + cos(a) * 0.085);
          d = min(d, length(p - t) - 0.066);
        }
        return d;
      }`,
    fragmentColor: /* glsl */`
      {
        float core = vEdge.x;
        gCore = core;
        vec2 w = vUvP;                        // (across, along) in world units
        // jittered cobbles
        vec2 cp = w / 0.72;
        vec2 id = floor(cp), fp = fract(cp) - 0.5;
        float d1 = 9.0, d2 = 9.0; vec2 bid = id;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 cc = o + (vec2(tHash21(id + o), tHash21(id + o + 7.3)) - 0.5) * 0.78;
          float d = length(fp - cc);
          if (d < d1) { d2 = d1; d1 = d; bid = id + o; } else if (d < d2) { d2 = d; }
        }
        float grout = smoothstep(0.012, 0.100, d2 - d1);
        float rk = tHash21(bid + 2.9);
        vec3 cream = vec3(0.76, 0.68, 0.53);
        vec3 tan_  = vec3(0.50, 0.40, 0.28);
        vec3 c = mix(cream, tan_, rk * 0.95);
        c *= 0.88 + 0.26 * tHash21(bid + 13.1);
        // domed stones: each cobble brightens toward its own middle
        c *= 0.88 + 0.30 * smoothstep(0.34, 0.02, d1);
        c = mix(c * 0.40, c, grout);          // dark grout between stones
        // pawprint decals stamped down the middle
        vec2 pp = vec2(w.x / 2.05, w.y / 2.45);
        vec2 pid = floor(pp), pf = fract(pp) - 0.5;
        float present = step(0.44, tHash21(pid + 3.7));
        float ang = (tHash21(pid + 9.1) - 0.5) * 1.1;
        vec2 q = pf - (vec2(tHash21(pid + 2.2), tHash21(pid + 4.4)) - 0.5) * 0.30;
        q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
        float pd = pawSDF(q);
        // CRISP prints. r3 (containment) read these as blurry brown smudges: the
        // old 0.024-wide SDF ramp is ~4 screen pixels of feather at the game
        // camera, and a near-black fill made the toes merge with the grout into
        // one mud blob. The edge is now one pixel wide (fwidth on the SDF, floored
        // so it still anti-aliases at distance) and the print is LIGHTER and
        // WARMER than the stone, like sugar-dust tracked across the cobbles.
        float paa = max(fwidth(pd) * 0.9, 0.0016);
        float pawBody = 1.0 - smoothstep(-paa, paa, pd);
        float pawRim = (1.0 - smoothstep(0.010, 0.010 + paa * 2.0, abs(pd + 0.006)));
        float edgeMask = 1.0 - smoothstep(0.55, 0.95, abs(vEdge.y));
        float paw = present * pawBody * edgeMask;
        // A warm SANDY TAN print: clearly lighter and warmer than the dark grout
        // (the critic's "mud"), clearly darker than the cream cobble, so the pad
        // and four toes actually separate. A thin darker contact line inside the
        // edge keeps it reading as a pressed depression, not a sticker.
        vec3 pawCol = c * vec3(0.60, 0.485, 0.385) + vec3(0.052, 0.034, 0.017);
        c = mix(c, pawCol, paw * 0.92);
        c = mix(c, c * vec3(0.70, 0.64, 0.60), present * pawRim * edgeMask * 0.55);
        // a dusty verge instead of a cut edge: the outer rows fade to trodden
        // grit rather than to raw cobble
        float nb = (tVNoise(vWPos.xz * 1.4) - 0.5) * 0.24;
        float stone = 1.0 - smoothstep(0.62, 1.02, abs(vEdge.y) + nb);
        vec3 dust = mix(diffuseColor.rgb * 1.05, vec3(0.34, 0.28, 0.20), 0.52);
        dust *= 0.88 + 0.26 * tVNoise(vWPos.xz * 2.4 + 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(dust, c, stone), core);
        diffuseColor.rgb *= mix(1.0, tContactAO(vWPos.xz), 0.85);
        diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.34, abs(abs(vEdge.y) + nb - 1.05))) * 0.13;
      }`,
    fragmentRough: /* glsl */`
      roughnessFactor = mix(roughnessFactor, 0.62, gCore);`,
  });
}
