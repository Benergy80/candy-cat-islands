// ─────────────────────────────────────────────────────────────────────────────
// NPC X-RAY — a citizen (or a tiger) standing between the lens and the visitor
// is dithered out where it covers him, the way the camera's see-through window
// opens a building (camera/cutout.js) — but for the NPC pools only, always on,
// under ANY camera (the game lens, a cinematic, a free/debug view).
//
// Every citizen material carries a tiny shader patch: a screen-space ELLIPSE
// round the visitor's chest in which fragments NEARER the lens than his chest
// (by more than X_DEPTH) are discarded through a 4×4 ordered dither. The core
// keeps ~3/16 of the pixels (a ghost of the tiger, so you still know it is
// there); the edge feathers out. A tiger beside him, or behind him, is never
// touched. A second term, the NEAR-LENS band, thins any citizen within NEAR u
// of the lens (a low debug camera standing in a pack, a cinematic swinging
// past a tiger's flank) instead of letting it fill half the frame.
// Discarded fragments write no depth, so the visitor's real body
// shows (and his GreaterDepth silhouette pass draws nothing there). Shadow
// and depth passes use their own materials: the ghosted tiger still casts.
//
// Chaining is exact, the camera's way: the material's previous hook runs
// first; the program cache key extends the previous one. The camera's own
// window patch (world:ready, later) chains onto this one the same way.
// Uniforms: two shared {value} objects written once a frame (update()).
// GLSL: no backticks anywhere in here.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const KEY = '|npcx1';
const X_DEPTH = 0.9;          // a fragment must be this much nearer than his chest
const X_CORE = 0.8;           // dither threshold in the core (13/16 discarded)
const RX = 1.0, RY = 1.3;     // world half-size of the window round his chest (u)
const NEAR = 3.2;             // bodies nearer the lens than this thin out (fully by 0.4 × NEAR)
const NEAR_K = 0.85;

const FRAG_HEAD = [
  'uniform vec4 uNpcC;',
  'uniform vec4 uNpcR;',
  'varying float vNpcV;',
  'float npcB2( vec2 a ) { return fract( dot( a, vec2( 0.5, a.y * 0.75 ) ) ); }',
  'float npcBayer4( vec2 p ) { vec2 a = mod( floor( p ), 4.0 ); return npcB2( floor( a * 0.5 ) ) * 0.25 + npcB2( a ) + 0.03125; }',
  '',
].join('\n');
const FRAG_BODY = [
  '',
  '\t{',
  '\t\tvec2 npcQ = ( gl_FragCoord.xy - uNpcC.xy ) / uNpcR.xy;',
  '\t\tfloat npcE = dot( npcQ, npcQ );',
  '\t\tfloat npcM = uNpcR.z * step( vNpcV, uNpcC.z ) * ( 1.0 - smoothstep( 0.45, 1.0, npcE ) );',
  // the near-lens band: a body right at the lens (a low debug camera in the
  // pack, a cinematic swinging past a tiger) thins out instead of filling half the frame
  '\t\tfloat npcN = uNpcR.w * ( 1.0 - smoothstep( 0.4 * uNpcC.w, uNpcC.w, vNpcV ) );',
  '\t\tif ( max( npcM, npcN ) > npcBayer4( gl_FragCoord.xy ) ) discard;',
  '\t}',
].join('\n');

export function createNpcXray(ctx) {
  const uniforms = {
    uNpcC: { value: new THREE.Vector4(-1e5, -1e5, -1, NEAR) },   // centre px x, y · depth limit · near band (u)
    uNpcR: { value: new THREE.Vector4(64, 64, 0, 0) },           // radius px x, y · strength · near strength
  };
  const patched = new WeakSet();
  const stats = { materials: 0, anchorless: 0, on: false };

  function inject(sh) {
    const vs = sh.vertexShader, fs = sh.fragmentShader;
    if (vs.indexOf('#include <project_vertex>') < 0 || fs.indexOf('#include <clipping_planes_fragment>') < 0) { stats.anchorless++; return; }
    sh.uniforms.uNpcC = uniforms.uNpcC;
    sh.uniforms.uNpcR = uniforms.uNpcR;
    sh.vertexShader = 'varying float vNpcV;\n' + vs.replace('#include <project_vertex>', '#include <project_vertex>\n\tvNpcV = -mvPosition.z;');
    sh.fragmentShader = FRAG_HEAD + fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + FRAG_BODY);
  }
  /** Give material m the x-ray (idempotent). */
  function patch(m) {
    if (!m || patched.has(m) || m.isShaderMaterial || m.isRawShaderMaterial) return;
    const prevHook = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    const custom = prevKey !== THREE.Material.prototype.customProgramCacheKey;
    const hasHook = prevHook && prevHook !== THREE.Material.prototype.onBeforeCompile;
    const baseKey = custom ? null : (hasHook ? prevHook.toString() : 'none');
    m.customProgramCacheKey = function () { return (custom ? prevKey.call(this) : baseKey) + KEY; };
    m.onBeforeCompile = function (sh, r) { if (hasHook) prevHook.call(this, sh, r); inject(sh); };
    m.needsUpdate = true;
    patched.add(m); stats.materials++;
  }

  const vF = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), buf = new THREE.Vector2();
  /** Screen position (drawing-buffer px, origin bottom-left) + view depth of a world point. */
  function toPx(cam, x, y, z, out) {
    const e = cam.matrixWorld.elements;
    vF.set(-e[8], -e[9], -e[10]);
    vA.set(x - e[12], y - e[13], z - e[14]);
    out.depth = vA.dot(vF);
    vB.set(x, y, z).project(cam);
    out.x = (vB.x * 0.5 + 0.5) * buf.x;
    out.y = (vB.y * 0.5 + 0.5) * buf.y;
    out.ndx = vB.x; out.ndy = vB.y;
    return out;
  }
  const sC = { x: 0, y: 0, depth: 0, ndx: 0, ndy: 0 }, sT = { x: 0, y: 0, depth: 0, ndx: 0, ndy: 0 }, sF = { x: 0, y: 0, depth: 0, ndx: 0, ndy: 0 };
  /**
   * Aim the window at the visitor for this camera (call once the camera has its
   * final matrices). k = strength 0..1 (0 = off: carried, off screen, no player).
   */
  function update(cam, P, k = 1) {
    const R = uniforms.uNpcR.value, Cc = uniforms.uNpcC.value;
    if (!cam || !P || !(k > 0) || !ctx.renderer) { R.z = 0; R.w = 0; stats.on = false; return; }
    R.w = NEAR_K * k;
    ctx.renderer.getDrawingBufferSize(buf);
    const cy = P.y + 0.95;
    toPx(cam, P.x, cy, P.z, sC);
    if (!(sC.depth > cam.near + 0.5) || Math.abs(sC.ndx) > 1.3 || Math.abs(sC.ndy) > 1.3) { R.z = 0; stats.on = false; return; }
    toPx(cam, P.x, cy + RY, P.z, sT); toPx(cam, P.x, cy - RY, P.z, sF);
    const ry = Math.max(8, Math.abs(sT.y - sF.y) * 0.5);
    // horizontal: the same world size at his depth, from the projection's scale
    const pxPerU = buf.y * (cam.zoom || 1) / (2 * sC.depth * Math.tan(THREE.MathUtils.degToRad(cam.fov || 40) * 0.5));
    const rx = Math.max(8, RX * pxPerU);
    Cc.set(sC.x, sC.y, sC.depth - X_DEPTH, NEAR);
    R.set(rx, ry, X_CORE * k, NEAR_K * k);
    stats.on = true;
  }
  return { patch, update, uniforms, stats };
}
