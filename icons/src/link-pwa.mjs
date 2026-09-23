// Home-screen PWA wiring check (and one-shot fixer) for index.html + manifest.webmanifest + icons/.
//   node icons/src/link-pwa.mjs            # check only: prints PASS/WARN/FAIL lines, exit 1 on any FAIL (touches nothing)
//   node icons/src/link-pwa.mjs --apply    # for the index.html owner / orchestrator: adds the missing <link> lines right
//                                          # after </title> and the .webmanifest MIME type to tools/serve.mjs, then re-checks.
//                                          # Idempotent: a second --apply changes nothing.
//   node icons/src/link-pwa.mjs --root <dir>   # run against another copy of the tree (used to test --apply)
// The manifest's theme_color / short_name are kept equal to index.html's theme-color / apple-mobile-web-app-title,
// so the only index.html change the PWA needs is the <link> block below.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';

export const HEAD_LINES = [
  '<link rel="manifest" href="./manifest.webmanifest" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png" />',
];
const MIME_ENTRY = `'.webmanifest': 'application/manifest+json'`;

const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? (m[2] ?? m[3]) : null; };
const tags = (html, el) => html.match(new RegExp(`<${el}\\b[^>]*>`, 'gi')) || [];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const linkRel = (html, rel) => tags(html, 'link').filter((t) => (attr(t, 'rel') || '').toLowerCase().split(/\s+/).includes(rel));
const meta = (html, name) => { const t = tags(html, 'meta').find((x) => (attr(x, 'name') || '').toLowerCase() === name); return t ? attr(t, 'content') : null; };

// Pure transform (also used in flight by the bench): insert whichever HEAD_LINES are missing, right after </title>.
export function linkHead(html) {
  const have = new Set(tags(html, 'link').map((t) => `${(attr(t, 'rel') || '').toLowerCase()}|${(attr(t, 'href') || '').replace(/^\.\//, '')}`));
  const missing = HEAD_LINES.filter((l) => !have.has(`${attr(l, 'rel').toLowerCase()}|${attr(l, 'href').replace(/^\.\//, '')}`));
  if (!missing.length) return html;
  const at = html.search(/<\/title>/i);
  if (at < 0) throw new Error('index.html has no </title> to anchor the PWA links after');
  const eol = html.indexOf('\n', at); const cut = eol < 0 ? html.length : eol + 1;
  return html.slice(0, cut) + missing.join('\n') + '\n' + html.slice(cut);
}
export function addMime(src) {
  if (src.includes(`'.webmanifest'`)) return src;
  const out = src.replace(/(const MIME = \{[^}]*?)(\s*\})/, (m, a, b) => `${a}, ${MIME_ENTRY}${b}`);
  if (out === src) throw new Error('tools/serve.mjs: MIME map not found');
  return out;
}

// PNG header: width, height, colour type (2 = RGB, 6 = RGBA)
function png(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

export function check(root) {
  const R = []; const ok = (m) => R.push(['PASS', m]); const warn = (m) => R.push(['WARN', m]); const fail = (m) => R.push(['FAIL', m]);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const local = (href) => path.join(root, decodeURI(href.replace(/^\.\//, '').split(/[?#]/)[0]));

  // manifest file itself
  let man = null;
  try { man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8')); ok('manifest.webmanifest parses'); } catch (e) { fail('manifest.webmanifest: ' + e.message); }
  if (man) {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) if (!man[k]) fail(`manifest: missing ${k}`);
    if (man.display !== 'standalone' && man.display !== 'fullscreen') warn(`manifest: display "${man.display}" keeps the browser bar`);
    if (/^\//.test(man.start_url || '') || /^\//.test(man.scope || '')) fail('manifest: start_url/scope must be relative (GitHub Pages serves under /candy-cat-islands/)');
    const got = new Set();
    for (const ic of man.icons || []) {
      try {
        const p = png(path.join(root, ic.src)); const [w, h] = String(ic.sizes).split('x').map(Number);
        if (p.w !== w || p.h !== h) fail(`manifest icon ${ic.src}: declared ${ic.sizes}, file is ${p.w}x${p.h}`);
        else got.add(`${ic.purpose || 'any'}:${w}`);
      } catch (e) { fail(`manifest icon ${ic.src}: ${e.message}`); }
    }
    for (const need of ['any:192', 'any:512', 'maskable:192', 'maskable:512']) if (!got.has(need)) fail(`manifest: no valid ${need.replace(':', ' ')} icon`);
    if (got.size >= 4) ok(`manifest: ${got.size} icons, sizes match their files`);
  }

  // index.html wiring
  const ml = linkRel(html, 'manifest')[0];
  if (!ml) fail('index.html: no <link rel="manifest"> (the PWA is not live)');
  else if (!fs.existsSync(local(attr(ml, 'href') || ''))) fail(`index.html: manifest link points at missing ${attr(ml, 'href')}`);
  else ok(`index.html links ${attr(ml, 'href')}`);
  const al = linkRel(html, 'apple-touch-icon')[0];
  if (!al) fail('index.html: no <link rel="apple-touch-icon"> (iOS home screen would show a page screenshot)');
  else {
    try {
      const p = png(local(attr(al, 'href') || ''));
      if (p.w !== 180 || p.h !== 180) fail(`apple-touch-icon is ${p.w}x${p.h}, iOS wants 180x180`);
      else if (p.colorType !== 2) warn('apple-touch-icon has an alpha channel (iOS renders transparency black)');
      else ok(`index.html links ${attr(al, 'href')} (180x180, opaque)`);
    } catch (e) { fail(`apple-touch-icon ${attr(al, 'href')}: ${e.message}`); }
  }
  const icons = linkRel(html, 'icon');
  if (!icons.length) warn('index.html: no <link rel="icon"> (browser tab falls back to /favicon.ico, a 404)');
  for (const t of icons) { if (!fs.existsSync(local(attr(t, 'href') || ''))) fail(`index.html: icon link points at missing ${attr(t, 'href')}`); }
  if (icons.length) ok(`index.html: ${icons.length} favicon link(s) resolve`);

  const tc = meta(html, 'theme-color');
  if (man && tc && tc.toLowerCase() !== String(man.theme_color).toLowerCase()) fail(`theme-color mismatch: index.html ${tc} vs manifest ${man.theme_color}`);
  else if (!tc) warn('index.html: no <meta name="theme-color">');
  else ok(`theme-color ${tc} matches the manifest`);
  const at = meta(html, 'apple-mobile-web-app-title');
  if (man && at && decode(at) !== man.short_name) warn(`home-screen label: iOS shows "${decode(at)}", Android shows "${man.short_name}"`);
  else if (at) ok(`home-screen label "${decode(at)}" on iOS and Android`);
  for (const n of ['apple-mobile-web-app-capable', 'mobile-web-app-capable']) if (meta(html, n) !== 'yes') warn(`index.html: <meta name="${n}" content="yes"> missing`);
  if (!/viewport-fit=cover/.test(meta(html, 'viewport') || '')) warn('index.html: viewport lacks viewport-fit=cover');

  // dev server content type (GitHub Pages already sends application/manifest+json)
  try {
    const srv = fs.readFileSync(path.join(root, 'tools/serve.mjs'), 'utf8');
    if (!srv.includes(`'.webmanifest'`)) warn('tools/serve.mjs sends the manifest as application/octet-stream (dev server only; restart it after --apply)');
    else ok('tools/serve.mjs maps .webmanifest to application/manifest+json');
  } catch { /* no dev server in this tree */ }
  return R;
}

// ── CLI ──
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const ri = argv.indexOf('--root');
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : fileURLToPath(new URL('../..', import.meta.url)));
  if (argv.includes('--apply')) {
    const ih = path.join(root, 'index.html'); const before = fs.readFileSync(ih, 'utf8'); const after = linkHead(before);
    if (after !== before) { fs.writeFileSync(ih, after); console.log('index.html: added', after.split('\n').length - before.split('\n').length, 'PWA <link> line(s) after </title>'); }
    else console.log('index.html: PWA links already present');
    const sv = path.join(root, 'tools/serve.mjs');
    if (fs.existsSync(sv)) { const s0 = fs.readFileSync(sv, 'utf8'); const s1 = addMime(s0); if (s1 !== s0) { fs.writeFileSync(sv, s1); console.log('tools/serve.mjs: added', MIME_ENTRY, '(restart the dev server to pick it up)'); } else console.log('tools/serve.mjs: .webmanifest MIME already present'); }
  }
  const res = check(root);
  for (const [lvl, m] of res) console.log(lvl.padEnd(4), m);
  const nf = res.filter((r) => r[0] === 'FAIL').length;
  console.log(nf ? `\n${nf} FAIL — run with --apply (index.html owner) to link the PWA` : '\nPWA wiring OK');
  process.exitCode = nf ? 1 : 0;
}
