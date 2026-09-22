import * as w from '../src/core/world.js';
console.log('LANDMARKS');
for (const [id, l] of Object.entries(w.LANDMARKS)) console.log(id.padEnd(16), l.x, l.z, 'h=' + w.height(l.x, l.z).toFixed(2), 'mask=' + w.islandMask(l.x, l.z, l.island).toFixed(2));
console.log('PATH POINTS below 0.8:');
for (const p of w.PATHS) for (const [x, z] of p.points) { const h = w.height(x, z); if (h < 0.8) console.log(' ', p.id, x, z, h.toFixed(2)); }
console.log('RIVER:'); for (const [x, z] of w.RIVER.points) console.log(' ', x, z, w.height(x, z).toFixed(2));
console.log('start', w.height(w.PLAYER_START.x, w.PLAYER_START.z).toFixed(2));
// ASCII map
let s = '';
for (let z = -130; z <= 130; z += 8) { let row = ''; for (let x = -280; x <= 280; x += 4) { const h = w.height(x, z); row += h < 0 ? (x === 0 ? '|' : '~') : h < 1 ? '.' : h < 4 ? ':' : h < 8 ? '=' : h < 12 ? '#' : '@'; } s += row + '\n'; }
console.log(s);
