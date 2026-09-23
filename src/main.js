import * as THREE from 'three';
import * as world from './core/world.js';
import { Events } from './core/util.js';
import { createInput } from './core/input.js';
import { installDebug } from './core/debug.js';

// ── Systems (each file exports create(ctx) → { update(dt, ctx)?, ... }) ─────
// Loaded dynamically so one broken file cannot take the whole game down.
const SYSTEM_FILES = [
  ['sky', './systems/sky.js'], ['planes', './systems/planes.js'], ['terrain', './systems/terrain.js'],
  ['candyVegetation', './systems/candy/vegetation.js'], ['candyArchitecture', './systems/candy/architecture.js'],
  ['candyCreatures', './systems/candy/creatures.js'], ['sourPatch', './systems/candy/sourpatch.js'],
  ['catArchitecture', './systems/cat/architecture.js'], ['catNature', './systems/cat/nature.js'],
  ['catCitizens', './systems/cat/citizens.js'], ['catContainment', './systems/cat/containment.js'],
  ['ferry', './systems/ferry.js'], ['escape', './systems/escape.js'],
  ['touch', './systems/touch.js'], ['player', './systems/player.js'], ['camera', './systems/camera.js'],
  ['particles', './systems/particles.js'],
  ['inventory', './systems/inventory.js'], ['weapons', './systems/weapons.js'], ['powerups', './systems/powerups.js'],
  ['interaction', './systems/interaction.js'], ['story', './systems/story.js'],
  ['ui', './systems/ui.js'], ['audio', './systems/audio.js'],
];
const SYSTEMS = [];
for (const [name, file] of SYSTEM_FILES) {
  try { SYSTEMS.push([name, await import(file)]); }
  catch (err) { console.error(`[system ${name}] failed to load ${file}:`, err.message); SYSTEMS.push([name, { create: () => ({ update() {}, __loadError: String(err.message) }) }]); }
}

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') === '1';

const app = document.getElementById('app');
// QUALITY TIER. 'mobile' on phones (coarse pointer + a short side under 900 css px, or ?q=mobile):
// systems read ctx.state.quality at create() and trim instance counts, particles, shadows and post
// effects (see docs/BRIEF.md WAVE 3 → iPhone tier). ?q=high forces the desktop tier anywhere.
const IS_TOUCH = (() => { try { return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1; } catch (e) { return false; } })();
const QUALITY = params.get('q') || ((IS_TOUCH && Math.min(window.innerWidth, window.innerHeight) < 900) ? 'mobile' : 'high');
const MOBILE = QUALITY === 'mobile';
const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(SHOT ? 1 : Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 900);

const ctx = {
  THREE, scene, renderer, camera: cam, world, events: new Events(), input: createInput(renderer.domElement),
  uiRoot: document.getElementById('ui'), params, shot: SHOT,
  state: {
    time: params.has('time') ? parseFloat(params.get('time')) : 9.5, // hours 0..24
    timeFrozen: SHOT, daylight: 1, isNight: false, island: 'candy', ferry: null, paused: false, elapsed: 0,
    quality: QUALITY, mobile: MOBILE, touch: IS_TOUCH,
  },
  systems: {},
  layers: { water: 1 },
};

// Create systems in order; failures in one system must not kill the game.
for (const [name, mod] of SYSTEMS) {
  try { ctx.systems[name] = mod.create(ctx) || {}; ctx.systems[name].__name = name; }
  catch (err) { console.error(`[system ${name}] failed to create`, err); ctx.systems[name] = { update() {} , __error: err }; }
}
ctx.events.emit('world:ready', ctx);

// ── Loop ─────────────────────────────────────────────────────────────────────
const loop = { fps: 0, frameMs: 0, tick, last: performance.now(), acc: 0, frames: 0 };
function tick(dt, render = true) {
  const s = ctx.state;
  s.elapsed += dt;
  if (!s.timeFrozen && !s.paused) s.time = (s.time + dt * 24 / world.DAY_LENGTH_SEC) % 24;
  const wasNight = s.isNight;
  s.isNight = s.time < 5.5 || s.time > 19.5;
  if (s.isNight !== wasNight) ctx.events.emit(s.isNight ? 'night' : 'day', s.time);
  const p = ctx.systems.player;
  if (p?.position) s.island = world.islandAt(p.position.x, p.position.z) || (s.ferry ? 'sea' : s.island);
  for (const [name] of SYSTEMS) {
    const sys = ctx.systems[name];
    if (sys?.update) { try { sys.update(dt, ctx); } catch (err) { if (!sys.__warned) { console.error(`[system ${name}] update error`, err); sys.__warned = true; } } }
  }
  ctx.input.endFrame();
  if (!render) return;
  const t0 = performance.now();
  if (ctx.renderOverride) ctx.renderOverride(dt); else renderer.render(scene, cam);
  loop.frameMs = performance.now() - t0;
}
function raf(now) {
  requestAnimationFrame(raf);
  const dt = Math.min(0.05, (now - loop.last) / 1000); loop.last = now;
  loop.acc += dt; loop.frames++;
  if (loop.acc > 0.5) { loop.fps = loop.frames / loop.acc; loop.acc = 0; loop.frames = 0; }
  tick(dt);
}
window.addEventListener('resize', () => { cam.aspect = window.innerWidth / window.innerHeight; cam.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); ctx.events.emit('resize'); });

const api = installDebug(ctx, loop);
if (params.has('pos')) { const [x, z] = params.get('pos').split(',').map(Number); api.teleport(x, z); }
// warm-up frames so damped systems settle and shaders compile
for (let i = 0; i < 3; i++) tick(1 / 30);
document.getElementById('loading').classList.add('done');
api.ready = true;
if (!SHOT) requestAnimationFrame(raf);
