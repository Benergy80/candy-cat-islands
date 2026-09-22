// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — the salt field.
//
// Wave 2: the player can put salt ON THE GROUND (spray/shaker patches published
// by the weapons system as ctx.systems.weapons.saltPatches = [{x,z,r}]). To a
// Sour Patch Kid a salt patch is a WALL: they will not put a foot inside r+0.4,
// they slide around it, and if you have ringed yourself in salt they stand at
// the edge all night and complain about it.
//
// Everything here is allocation-free and analytic (ray/segment vs circle), so
// 24 kids can test the field every frame for nothing. Patches are read live
// from the weapons system each frame — this module owns no state but a cached
// array reference, so a patch that is removed stops blocking immediately.
// ─────────────────────────────────────────────────────────────────────────────

export const SALT_PAD = 0.4;            // kids never step inside r + this

const EMPTY = [];
const RAYS = 12;                        // escape directions tested around the player
const REACH = 20;                       // how far an escape route has to run to count

export function createSaltField(ctx) {
  let patches = EMPTY;
  const dirs = new Float32Array(RAYS * 2);
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    dirs[i * 2] = Math.cos(a); dirs[i * 2 + 1] = Math.sin(a);
  }

  const api = {
    get count() { return patches.length; },
    get list() { return patches; },

    /** Pull the live list from whoever owns salt this session. Call once a frame. */
    sync() {
      const w = ctx.systems.weapons;
      const src = w?.saltPatches ?? w?.salt ?? ctx.state?.saltPatches;
      patches = Array.isArray(src) ? src : EMPTY;
      return patches.length;
    },

    /** The patch containing (x,z), or null. `pad` grows the no-go radius further. */
    blocked(x, z, pad = 0) {
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        const r = (p.r ?? 1.5) + SALT_PAD + pad;
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < r * r) return p;
      }
      return null;
    },

    /** First patch whose disc crosses the segment a→b (i.e. "the line is walled"). */
    segment(ax, az, bx, bz) {
      const sx = bx - ax, sz = bz - az;
      const len2 = sx * sx + sz * sz;
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        const r = (p.r ?? 1.5) + SALT_PAD;
        const fx = p.x - ax, fz = p.z - az;
        let t = len2 > 1e-6 ? (fx * sx + fz * sz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + sx * t - p.x, cz = az + sz * t - p.z;
        if (cx * cx + cz * cz < r * r) return p;
      }
      return null;
    },

    /** Patch nearest to (x,z) (by edge distance), or null. */
    nearest(x, z) {
      let best = null, bd = 1e9;
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        const d = Math.hypot(x - p.x, z - p.z) - (p.r ?? 1.5);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },

    /**
     * True when every direction out of (px,pz) crosses salt inside REACH — i.e.
     * the player has walled themselves in and no kid can physically get there.
     * Analytic ray/circle: RAYS × patches tests, no marching.
     */
    walled(px, pz) {
      if (!patches.length) return false;
      for (let i = 0; i < RAYS; i++) {
        const dx = dirs[i * 2], dz = dirs[i * 2 + 1];
        let hit = false;
        for (let j = 0; j < patches.length && !hit; j++) {
          const p = patches[j];
          const r = (p.r ?? 1.5) + SALT_PAD;
          const fx = p.x - px, fz = p.z - pz;
          const along = fx * dx + fz * dz;
          const d2 = fx * fx + fz * fz;
          if (d2 < r * r) { hit = true; break; }          // standing in it
          if (along < 0 || along > REACH + r) continue;    // behind, or too far out
          if (d2 - along * along < r * r) hit = true;
        }
        if (!hit) return false;                            // one way out is enough
      }
      return true;
    },

    /** Shove a point out of any patch it is standing in. Returns true if moved. */
    push(k, extra = 0.15) {
      let moved = false;
      for (let pass = 0; pass < 2; pass++) {
        const p = api.blocked(k.x, k.z);
        if (!p) break;
        const r = (p.r ?? 1.5) + SALT_PAD + extra;
        const dx = k.x - p.x, dz = k.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) { k.x = p.x + dx / d * r; k.z = p.z + dz / d * r; }
        else { k.x = p.x + r; }
        moved = true;
      }
      return moved;
    },
  };
  return api;
}
