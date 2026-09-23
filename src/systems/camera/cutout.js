// THE SEE-THROUGH WINDOW (CAMERA_SPEC §5.1, §5.4) — the camera's cutout.
//
// Big masses (merged districts, island-scale candy merges, anything over
// occFadeMaxDim across or named like architecture) and every instanced cloud
// get a small shader patch: a screen-space ELLIPSE centred on the visitor's
// chest in which fragments that sit IN FRONT of him (view depth under his
// chest depth − 1 u, world y over his feet + 0.35) are discarded through a 4×4
// ordered dither. The core (e < 0.55) is fully open, the feather band (0.55 ..
// 1.0) thins out and is rim-darkened so the hole reads as a window, not a
// rendering fault. A second term, the NEAR-LENS band, dithers anything patched
// within a few units of the lens (it replaces the old "ghost the district
// within 6 u of the lens" rule). Discarded fragments write no depth, so where
// the window is open the real body shows and the amber GreaterDepth silhouette
// (player/visitor.js) draws nothing there.
//
// Which meshes: sweepable-style meshes whose world bounding box is over
// `bigDim()` (12 u) on its longest side or whose name matches
// cat_<district>_ / candyArch_, plus every instanced cloud the sweep would
// test. Never: SkinnedMesh / Points / Sprite / Line, ShaderMaterial /
// RawShaderMaterial, transparent or non-depth-writing materials, terrain /
// water / sky, NEVER_FADE (sugarfin / whale / ferry), userData.noFade /
// noOcclude / noCut on the object or an ancestor, the player group and the
// silhouette meshes.
//
// Materials are shared (one material on 400 lollipops) but every exclusion is
// per OBJECT, so patchAll() collects P (materials of meshes to patch) and X
// (materials of excluded meshes); for every material in both, the excluded
// meshes get ONE cached unpatched copy (clone, same onBeforeCompile +
// customProgramCacheKey, userData pointing at the original's so shared
// {value} uniforms keep animating, and the original's Color objects, so a
// tint the owner animates follows too) and the original is patched. Later
// meshes are decided lazily from the camera's 4 Hz candidate traversal
// (visit()): a new excluded mesh on a patched material gets the clean copy; a
// new eligible mesh on a material excluded meshes already wear gets a PATCHED
// copy instead (the excluded meshes are never touched after the first pass).
//
// Chaining is exact (CAMERA_SPEC §5.1): the previous hook runs first and the
// program cache key extends the previous one (or a snapshot of the previous
// hook's source when the material has no key of its own — escape/cave.js's
// caustic floor), so vegetation sway, cat-nature tint, instance culling and
// the cave caustics all survive; injectCut() works on the POST-hook source
// and skips (logging once) any material whose anchors are missing.
//
// Uniforms are three shared {value} objects the camera writes once a frame
// (write()) after its final rotateX + updateMatrixWorld. Depth / shadow passes
// use their own materials, so a cut roof still casts its whole shadow.
//
// Public: uniforms · patchAll() · visit(o) · isPatched(o) · isPatchedHit(hit)
//         · classify(hit, cam) · why(hit, cam) · excused(reason) · write(...) · off() · stats
//         · adopt(clone, orig) · redecide(o) · unpatchedCopy(m)
import * as THREE from 'three';

export const NEVER_FADE = /^(sugarfin|whale|ferry)/i;
export const SKY_GROUND = /^(terrain_(ground|sea|path|river|lake)|sky|cloud|star|sun|moon|water|sea|river|lake|particles|fx_)/i;
const ARCH_NAME = /^(cat_[a-z0-9]+_|candyArch_)/i;
/** The cut never opens terrain (§4.7): cliffs, decor lumps and gumdrop fields are terrain_* merges. */
const TERRAIN = /^terrain/i;
const KEY = '|cut1';
/** The ordered dither's thresholds are (v + 0.5) / 16: a value above the top one discards every pixel. */
export const BAYER_MAX = 15.5 / 16;

// GLSL. No backticks anywhere in here (these are template-free strings).
const VERT_HEAD = [
  'uniform vec4 uCutWY;',
  'varying float vCutV;',
  'varying float vCutY;',
  '',
].join('\n');
const VERT_BODY = '\n\tvCutV = -mvPosition.z;\n\tvCutY = dot( uCutWY, mvPosition );';
const FRAG_HEAD = [
  'uniform vec4 uCutC;',
  'uniform vec4 uCutR;',
  'uniform vec4 uCutP;',
  'varying float vCutV;',
  'varying float vCutY;',
  // 4x4 ordered dither, (v + 0.5) / 16 (a 2x2 Bayer nested in a 2x2 Bayer)
  'float cutB2( vec2 a ) { return fract( dot( a, vec2( 0.5, a.y * 0.75 ) ) ); }',
  'float cutBayer4( vec2 p ) { vec2 a = mod( floor( p ), 4.0 ); return cutB2( floor( a * 0.5 ) ) * 0.25 + cutB2( a ) + 0.03125; }',
  '',
].join('\n');
const FRAG_BODY = [
  '',
  '\tfloat cutRim = 0.0;',
  '\t{',
  '\t\tvec2 cutQ = ( gl_FragCoord.xy - uCutC.xy ) / uCutR.xy;',
  '\t\tfloat cutE = dot( cutQ, cutQ );',
  '\t\tfloat cutIn = step( vCutV, uCutP.x ) * step( uCutP.y, vCutY );',
  '\t\tfloat cutM = uCutR.z * cutIn * ( 1.0 - smoothstep( 0.55, 1.0, cutE ) );',
  '\t\tcutRim = uCutR.z * cutIn * smoothstep( 0.55, 1.0, cutE ) * ( 1.0 - step( 1.0, cutE ) );',
  '\t\tfloat cutNr = uCutP.z * ( 1.0 - smoothstep( 0.35 * uCutP.w, uCutP.w, vCutV ) );',
  '\t\tif ( max( cutM, cutNr ) > cutBayer4( gl_FragCoord.xy ) ) discard;',
  '\t}',
].join('\n');
const FRAG_RIM = 'gl_FragColor.rgb *= 1.0 - 0.2 * cutRim;\n';

/**
 * createCutout(ctx, opts)
 *   opts.bigDim()         the "prop-sized" limit (camera params.occFadeMaxDim, 12)
 *   opts.instanceable(o)  the camera's instanced-blocker test (the clouds the sweep checks), asked with
 *                         the cloud's count ignored: a creature cloud that is empty at world:ready is
 *                         the same kind of thing once it fills
 *   opts.ghostOf(o)       → the material the mesh wore before the camera ghosted it, or null
 *   opts.enabled          false (?cut=0): nothing is ever patched, today's ladder only
 */
export function createCutout(ctx, opts = {}) {
  const bigDim = opts.bigDim || (() => 12);
  const instanceable = opts.instanceable || ((o) => !!o.isInstancedMesh);
  const ghostOf = opts.ghostOf || (() => null);
  const enabled = opts.enabled !== false;

  const uniforms = {
    uCutWY: { value: new THREE.Vector4(0, 1, 0, 0) },
    uCutC: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCutR: { value: new THREE.Vector4(64, 64, 0, 0) },      // rx, ry, k, –
    uCutP: { value: new THREE.Vector4(0, -1e9, 0, 6) },     // depth, feetY, nearK, near
  };
  const patchedMats = new WeakSet();     // materials carrying the hook (originals, patched copies, ghost clones of them)
  const anchorless = new WeakSet();      // patched materials whose compiled source lacked the anchors (not really cut)
  const patchedObj = new WeakSet();      // meshes decided "cut me"
  const decided = new WeakMap();         // mesh → the material it wore when decided (re-decided when that changes)
  const seenExcluded = new WeakSet();    // materials worn by excluded meshes
  const cleanCopy = new WeakMap();       // patched original → its unpatched copy (for excluded meshes)
  const cutCopy = new WeakMap();         // original worn by excluded meshes → its patched copy (for later eligible meshes)
  const prevOf = new WeakMap();          // patched material → { hook, key, custom } as it was before the patch
  const skipped = new Set();             // names logged as "anchors missing" (log once each)
  const stats = { materials: 0, copies: 0, excludedWithCopies: 0, cutCopies: 0, meshes: 0, lazy: 0, skipped: 0 };
  let ready = false;
  const plGroup = () => ctx.systems.player?.group || null;

  // ── eligibility (per OBJECT) ───────────────────────────────────────────────
  const tmpBox = new THREE.Box3();
  function worldMaxDim(o) {
    const g = o.geometry;
    if (!g) return 0;
    if (!g.boundingBox) { try { g.computeBoundingBox(); } catch { return 0; } }
    if (!g.boundingBox) return 0;
    tmpBox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    return Math.max(tmpBox.max.x - tmpBox.min.x, tmpBox.max.y - tmpBox.min.y, tmpBox.max.z - tmpBox.min.z);
  }
  /** Flags that exclude an object whatever its size: its own or any ancestor's. */
  function excludedByTree(o) {
    const pg = plGroup();
    for (let n = o; n; n = n.parent) {
      if (NEVER_FADE.test(n.name || '')) return true;
      const u = n.userData;
      if (u && (u.noCut || u.noFade || u.noOcclude || u.silhouette)) return true;
      if (pg && n === pg) return true;
      if (n.name === 'sky' || n.name === 'terrain') return true;
    }
    return false;
  }
  function matOk(m) {
    return !!m && !m.isShaderMaterial && !m.isRawShaderMaterial && !m.transparent && m.depthWrite !== false;
  }
  /** Should this mesh (wearing `mat`, its own material outside any camera ghost) be cut? */
  function eligible(o, mat) {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return false;
    if (SKY_GROUND.test(o.name || '') || TERRAIN.test(o.name || '')) return false;
    if (Array.isArray(mat)) { if (!mat.length || !mat.every(matOk)) return false; }
    else if (!matOk(mat)) return false;
    if (excludedByTree(o)) return false;
    if (o.isInstancedMesh) return instanceable(o, true);
    if (ARCH_NAME.test(o.name || '')) return true;
    return worldMaxDim(o) > bigDim();
  }

  // ── patching ───────────────────────────────────────────────────────────────
  function injectCut(sh, mat) {
    const vs = sh.vertexShader, fs = sh.fragmentShader;
    if (vs.indexOf('#include <project_vertex>') < 0 || fs.indexOf('#include <clipping_planes_fragment>') < 0) {
      anchorless.add(mat);
      const nm = mat.name || mat.type;
      if (!skipped.has(nm)) { skipped.add(nm); stats.skipped++; console.log(`[camera/cut] anchors missing, not cut: ${nm}`); }
      return;
    }
    sh.uniforms.uCutWY = uniforms.uCutWY;
    sh.uniforms.uCutC = uniforms.uCutC;
    sh.uniforms.uCutR = uniforms.uCutR;
    sh.uniforms.uCutP = uniforms.uCutP;
    sh.vertexShader = VERT_HEAD + vs.replace('#include <project_vertex>', '#include <project_vertex>' + VERT_BODY);
    let f = FRAG_HEAD + fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + FRAG_BODY);
    if (f.indexOf('#include <dithering_fragment>') >= 0) f = f.replace('#include <dithering_fragment>', FRAG_RIM + '#include <dithering_fragment>');
    sh.fragmentShader = f;
  }
  /** CAMERA_SPEC §5.1 "Chaining (exact)". */
  function patchMaterial(m) {
    if (patchedMats.has(m)) return;
    const prevHook = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    const custom = prevKey !== THREE.Material.prototype.customProgramCacheKey;
    const baseKey = custom ? null : (prevHook ? prevHook.toString() : 'none');   // snapshot BEFORE replacing the hook
    prevOf.set(m, { hook: prevHook, key: prevKey, custom });
    m.customProgramCacheKey = function () { return (custom ? prevKey.call(this) : baseKey) + KEY; };
    m.onBeforeCompile = function (sh, r) { if (prevHook) prevHook.call(this, sh, r); injectCut(sh, this); };
    m.userData.cut = true;
    m.needsUpdate = true;
    patchedMats.add(m);
    stats.materials++;
  }
  /** A copy of `m` made the fadeMat way, sharing the original's userData and Color objects. */
  function copyOf(m, hook, key) {
    const c = m.clone();
    c.userData = m.userData;
    c.onBeforeCompile = hook;
    c.customProgramCacheKey = key;
    // animated tints on the original (night glow, pulses) must reach the copy too
    for (const k of ['color', 'emissive', 'specular', 'sheenColor', 'attenuationColor', 'specularColor']) if (m[k] && m[k].isColor && c[k]) c[k] = m[k];
    if (typeof m.emissiveIntensity === 'number') Object.defineProperty(c, 'emissiveIntensity', { configurable: true, enumerable: true, get: () => m.emissiveIntensity, set: () => {} });
    return c;
  }
  /** The unpatched copy of a patched original (for excluded meshes). */
  function cleanFor(m) {
    let c = cleanCopy.get(m);
    if (!c) {
      const pv = prevOf.get(m);
      c = pv ? copyOf(m, pv.hook, pv.key) : copyOf(m, m.onBeforeCompile, m.customProgramCacheKey);
      c.userData = m.userData;
      cleanCopy.set(m, c); stats.copies++;
    }
    return c;
  }
  /** A patched copy of an original that excluded meshes keep wearing (for later eligible meshes). */
  function cutFor(m) {
    let c = cutCopy.get(m);
    if (!c) { c = copyOf(m, m.onBeforeCompile, m.customProgramCacheKey); patchMaterial(c); cutCopy.set(m, c); stats.cutCopies++; }
    return c;
  }
  const mapMat = (mat, fn) => (Array.isArray(mat) ? mat.map(fn) : fn(mat));
  const someMat = (mat, fn) => (Array.isArray(mat) ? mat.some(fn) : fn(mat));

  /**
   * The first pass (world:ready): the whole scene at once, originals patched,
   * clean copies for the excluded meshes that share them.
   */
  function patchAll() {
    if (!enabled) return;
    ready = true;
    const P = [], X = [];
    const pMats = new Set();
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (ghostOf(o)) return;                        // the camera clears its ghosts first; a stray one is decided later
      const mat = o.material;
      if (eligible(o, mat)) { P.push(o); if (Array.isArray(mat)) mat.forEach((m) => pMats.add(m)); else pMats.add(mat); }
      else X.push(o);
    });
    // snapshot the clean copies BEFORE the originals are patched; a material that refuses to clone
    // (Material.copy() JSON-copies userData) is left unpatched rather than cut under an excluded mesh
    for (const o of X) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!pMats.has(m)) continue;
        try { cleanCopyNow(m); } catch { pMats.delete(m); stats.skipped++; }
      }
    }
    let excl = 0;
    for (const o of X) {
      const mat = o.material;
      if (someMat(mat, (m) => pMats.has(m))) { o.material = mapMat(mat, (m) => (pMats.has(m) ? cleanCopy.get(m) : m)); excl++; }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) seenExcluded.add(m);
      decided.set(o, o.material);
    }
    for (const m of pMats) patchMaterial(m);
    let nP = 0;
    for (const o of P) {
      if (someMat(o.material, (m) => pMats.has(m))) { patchedObj.add(o); nP++; }
      decided.set(o, o.material);
    }
    stats.meshes = nP; stats.excludedWithCopies = excl;
    console.log(`[camera/cut] patched ${stats.materials} materials · ${stats.copies} copies for ${excl} excluded meshes · ${nP} meshes cut-able`);
  }
  /** cleanFor() before the original is patched: the copy keeps the hook and key as they are now. */
  function cleanCopyNow(m) {
    let c = cleanCopy.get(m);
    if (!c) { c = copyOf(m, m.onBeforeCompile, m.customProgramCacheKey); cleanCopy.set(m, c); stats.copies++; }
    return c;
  }

  /**
   * The lazy pass: called for every mesh the camera's 4 Hz traversal meets.
   * Cheap when nothing changed (one WeakMap read); a new mesh, or one whose
   * owner swapped its material, is decided now.
   */
  function visit(o) {
    if (!ready || !o.isMesh || !o.material) return;
    const mat = o.material;
    if (decided.get(o) === mat) return;
    if (ghostOf(o)) return;                          // wearing a camera ghost: decide once it is back
    // one of our own copies, handed out by us: nothing to decide
    if (patchedObj.has(o) && someMat(mat, (m) => patchedMats.has(m)) && decided.has(o)) { decided.set(o, mat); return; }
    stats.lazy++;
    try {
      if (eligible(o, mat)) {
        o.material = mapMat(mat, (m) => (patchedMats.has(m) ? m : seenExcluded.has(m) ? cutFor(m) : (patchMaterial(m), m)));
        patchedObj.add(o);
        stats.meshes++;
      } else {
        patchedObj.delete(o);
        o.material = mapMat(mat, (m) => (patchedMats.has(m) ? cleanFor(m) : m));
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) seenExcluded.add(m);
      }
    } catch { o.material = mat; patchedObj.delete(o); stats.skipped++; }   // a material that refuses to clone: left alone
    decided.set(o, o.material);
  }

  /** The camera's ghost clone of a patched material is patched too (same hook + key). */
  function adopt(clone, orig) { if (patchedMats.has(orig)) patchedMats.add(clone); if (anchorless.has(orig)) anchorless.add(clone); }

  const matCut = (m) => !!m && patchedMats.has(m) && !anchorless.has(m);
  /** Is this OBJECT cut by the window (§7 isPatched)? Its current material must carry a working hook. */
  function isPatched(o) {
    if (!o || !patchedObj.has(o)) return false;
    return someMat(o.material, matCut);
  }
  /** Is the face this ray hit cut-able (multi-material meshes: the face's own material)? */
  function isPatchedHit(h) {
    const o = h && h.object;
    if (!o || !patchedObj.has(o)) return false;
    const mat = o.material;
    if (!Array.isArray(mat)) return matCut(mat);
    const i = h.face && Number.isInteger(h.face.materialIndex) ? h.face.materialIndex : 0;
    return matCut(mat[i] || mat[0]);
  }

  // ── uniforms ───────────────────────────────────────────────────────────────
  const bufSize = new THREE.Vector2();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vF = new THREE.Vector3();
  const scr = { x: 0, y: 0, on: false, depth: 0 };
  /** Project a world point to drawing-buffer px (y up). Fills scr; on = in front of the lens and inside the frame. */
  function toPx(cam, x, y, z) {
    const e = cam.matrixWorld.elements;
    vF.set(-e[8], -e[9], -e[10]);                     // forward
    vA.set(x - e[12], y - e[13], z - e[14]);
    scr.depth = vA.dot(vF);
    vB.set(x, y, z).project(cam);
    ctx.renderer.getDrawingBufferSize(bufSize);
    scr.x = (vB.x * 0.5 + 0.5) * bufSize.x;
    scr.y = (vB.y * 0.5 + 0.5) * bufSize.y;
    scr.on = scr.depth > cam.near && vB.x >= -1 && vB.x <= 1 && vB.y >= -1 && vB.y <= 1;
    return scr;
  }
  /**
   * Write the frame's window. `P` = the visitor's feet; k = the window strength (0..1, already
   * scaled by holdAng); nearK = the near-lens band's strength; grow = the ellipse's growth factor;
   * o = { ry, rx, rMin, rMax } (px at pixel ratio 1; scaled by the renderer's pixel ratio).
   * Returns false when the visitor's chest is off screen (the window is then forced shut).
   */
  function write(cam, P, k, nearK, grow, o) {
    const e = cam.matrixWorld.elements;
    uniforms.uCutWY.value.set(e[1], e[5], e[9], e[13]);
    const pr = ctx.renderer.getPixelRatio ? ctx.renderer.getPixelRatio() : 1;
    const feetY = toPx(cam, P.x, P.y, P.z).y, feetOn = scr.on;
    const hatY = toPx(cam, P.x, P.y + 1.78, P.z).y;
    const c = toPx(cam, P.x, P.y + 1.05, P.z);
    const on = c.on || feetOn;
    const hpx = Math.abs(hatY - feetY);
    const ry = Math.min(Math.max(o.ry * hpx, o.rMin * pr), o.rMax * pr) * grow;
    uniforms.uCutC.value.set(c.x, c.y, 0, 0);
    uniforms.uCutR.value.set(Math.max(1, o.rx * ry), Math.max(1, ry), on ? k : 0, 0);
    const dist = Math.hypot(P.x - e[12], P.y + 1.05 - e[13], P.z - e[14]);
    uniforms.uCutP.value.set(c.depth - 1.0, P.y + 0.35, nearK, Math.min(Math.max(0.2 * dist, o.nearMin), o.nearMax));
    return on;
  }
  /** Everything off (free camera, ?cut=0): patched programs then render exactly as unpatched ones. */
  function off() { uniforms.uCutR.value.z = 0; uniforms.uCutP.value.z = 0; }

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /**
   * §5.4: how the window treats this hit with the uniforms as last written.
   *   'clear'   patched, in front of the chest (depth < uCutP.x), over the feet line, inside the fully
   *             open core (e < 0.55) with k ≥ 0.5 — or deep enough in the near-lens band that every
   *             dither cell discards it
   *   'feather' the same, but in the feather band 0.55 ≤ e < 0.8 (reported apart, never as clear)
   *   'block'   anything else
   */
  function classify(h, cam) {
    if (!isPatchedHit(h)) return 'block';
    const P = uniforms.uCutP.value, R = uniforms.uCutR.value, C = uniforms.uCutC.value;
    const s = toPx(cam, h.point.x, h.point.y, h.point.z);
    const nr = P.z * (1 - smooth(0.35 * P.w, P.w, s.depth));
    if (nr > BAYER_MAX) return 'clear';
    if (!(R.z >= 0.5)) return 'block';
    if (!(s.depth <= P.x && h.point.y >= P.y)) return 'block';
    const qx = (s.x - C.x) / R.x, qy = (s.y - C.y) / R.y, e2 = qx * qx + qy * qy;
    if (e2 < 0.55) return 'clear';
    if (e2 < 0.8) return 'feather';
    return 'block';
  }

  /**
   * QA (§5.3 / A15): WHY a hit that classify() does not call 'clear' stays in the picture, so an
   * amber-only ray can be sorted into the cases the spec accepts and the ones it does not.
   *   excused by §5.3 — 'terrain' (terrain / water / sky, never cut) · 'noCut' (noCut / noFade /
   *     noOcclude / NEVER_FADE on it or an ancestor) · 'unpatched' (prop-sized, or a material the
   *     patch may not touch) · 'nearBody' (in front of him by less than the 1 u the cut plane keeps,
   *     view depth ≥ uCutP.x) · 'feather' (0.55 ≤ e < 0.8)
   *   not excused — 'low' (under the feet line) · 'shut' (a patched blocker the window could open, in
   *     front of him, while k < 0.5) · 'outside' (beyond the feather band, e ≥ 0.8)
   * 'clear' when classify() says clear. Reads the uniforms as last written, like classify().
   */
  function why(h, cam) {
    const o = h && h.object;
    if (!o) return 'unpatched';
    if (!isPatchedHit(h)) {
      if (SKY_GROUND.test(o.name || '') || TERRAIN.test(o.name || '')) return 'terrain';
      for (let n = o; n; n = n.parent) if (n.name === 'terrain' || n.name === 'sky') return 'terrain';
      return excludedByTree(o) ? 'noCut' : 'unpatched';
    }
    const c = classify(h, cam);
    if (c !== 'block') return c;
    // the cut plane is written every frame, open or shut: a blocker it could never open is the geometry's
    // doing (§5.3), whatever the window's state; only then is a shut window the window's own miss
    const P = uniforms.uCutP.value, R = uniforms.uCutR.value;
    const s = toPx(cam, h.point.x, h.point.y, h.point.z);
    if (!(s.depth <= P.x)) return 'nearBody';
    if (!(h.point.y >= P.y)) return 'low';
    if (!(R.z >= 0.5)) return 'shut';
    return 'outside';
  }
  /** The reasons why() gives that CAMERA_SPEC §5.3 (and A15's amber list) accepts. */
  const EXCUSED = new Set(['terrain', 'noCut', 'unpatched', 'nearBody', 'feather']);

  /** Forget the decision for `o` (its owner changed its flags after world:ready): the camera's next
   *  4 Hz traversal decides it again with visit(). */
  function redecide(o) { if (o) decided.delete(o); }
  /** QA / A-B timing: the unpatched copy of a patched material (cached; null when `m` is not patched). */
  function unpatchedCopy(m) { return patchedMats.has(m) && prevOf.has(m) ? cleanFor(m) : null; }

  return { uniforms, patchAll, visit, isPatched, isPatchedHit, classify, why, excused: (r) => EXCUSED.has(r), write, off, adopt, redecide, unpatchedCopy, stats, get enabled() { return enabled; }, get ready() { return ready; } };
}
