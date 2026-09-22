import { Simplex2 } from '../../src/core/noise.js';
const zoneN = new Simplex2(7711), swirlN = new Simplex2(3137), patchN = new Simplex2(4242);
const smooth = (a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp01=(x)=>x<0?0:x>1?1:x;
const pts = { village:[-140,40], plaza:[-137,50], meadow:[-110,-45], forest:[-200,-20], peak:[-175,-62], lakeshore:[-200,48], river:[-120,30] };
// grid stats over each zone
for (const [name,[cx,cz]] of Object.entries(pts)) {
  let n=0, sZt=0, sVan=0, sSeam=0, sLobe=0, hist=[0,0,0,0,0];
  for (let dz=-20; dz<=20; dz+=1.5) for (let dx=-20; dx<=20; dx+=1.5) {
    const x=cx+dx, z=cz+dz;
    const wx = x + swirlN.fbm(x*0.0082, z*0.0082, 2)*30;
    const wz = z + swirlN.fbm(x*0.0082+21.7, z*0.0082-9.3, 2)*30;
    const nz = zoneN.fbm(wx*0.0125, wz*0.0125, 3);
    const zt = smooth(-0.05,0.05,nz);
    const rib = patchN.fbm(wx*0.024+5.5, wz*0.024-3.2, 2);
    const seam = 1 - smooth(0.005,0.024,Math.abs(nz));
    const lobe = 1 - smooth(0.006,0.026,Math.abs(rib));
    const van = clamp01(seam*0.88 + lobe*0.34);
    n++; sZt+=zt; sVan+=van; sSeam+=seam; sLobe+=lobe;
    hist[Math.min(4,Math.floor(zt*5))]++;
  }
  console.log(name.padEnd(10), 'zt=', (sZt/n).toFixed(3), 'van=', (sVan/n).toFixed(3), 'seam=',(sSeam/n).toFixed(3),'lobe=',(sLobe/n).toFixed(3), 'ztHist=', hist.map(v=>Math.round(100*v/n)).join('/'));
}
