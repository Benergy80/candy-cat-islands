import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

/** Seeded RNG with helpers. */
export function rng(seed) {
  const r = mulberry32(seed);
  const f = () => r();
  f.range = (a, b) => a + (b - a) * r();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  f.pick = (arr) => arr[Math.floor(r() * arr.length)];
  f.chance = (p) => r() < p;
  f.sign = () => (r() < 0.5 ? -1 : 1);
  return f;
}

/** Cheap toon-ish standard material factory with consistent settings. */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.0, ...opts });
}

/** Set castShadow/receiveShadow on a whole subtree. */
export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

/** Hash a string → 32-bit int, for stable per-name seeds. */
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Simple event bus. */
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, new Set()); this.map.get(name).add(fn); return () => this.map.get(name).delete(fn); }
  emit(name, payload) { const s = this.map.get(name); if (s) for (const fn of s) fn(payload); }
}
