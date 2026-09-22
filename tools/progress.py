#!/usr/bin/env python3
"""Build progress/index.html from progress/status.json (+ thumbnails of renders)."""
import json, base64, io, os, sys, datetime, html
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
st = json.load(open(os.path.join(ROOT, 'progress/status.json')))
st['updated'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
json.dump(st, open(os.path.join(ROOT, 'progress/status.json'), 'w'), indent=2)

def thumb(path, w=560, q=72):
    p = os.path.join(ROOT, path) if not os.path.isabs(path) else path
    if not path or not os.path.exists(p): return ''
    im = Image.open(p).convert('RGB'); im.thumbnail((w, w)); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

STATUS = {'building': ('Building', 'building'), 'critique': ('In critique', 'critique'), 'fixing': ('Fixing gap', 'critique'), 'done': ('Critic prefers ours', 'done'), 'queued': ('Queued', 'queued')}
counts = {}
for s in st['systems']: counts[s['status']] = counts.get(s['status'], 0) + 1
e = html.escape
cards = []
for s in st['systems']:
    label, cls = STATUS.get(s['status'], (s['status'], 'queued'))
    img = thumb(s.get('render', ''))
    weak = ''.join(f'<li>{e(w)}</li>' for w in s.get('weaknesses', []))
    cards.append(f'''<article class="sys {cls}">
  <header><h3>{e(s['name'])}</h3><span class="pill {cls}">{label}</span>{('<span class="round">round ' + str(s['round']) + '</span>') if s.get('round') else ''}</header>
  {('<img src="' + img + '" alt="latest render of ' + e(s['name']) + '">') if img else '<div class="noimg">no render yet</div>'}
  <dl>
    {('<dt>Critic verdict</dt><dd>' + e(s['verdict']) + '</dd>') if s.get('verdict') else ''}
    {('<dt>Biggest gap</dt><dd>' + e(s['gap']) + '</dd>') if s.get('gap') else ''}
    {('<dt>Latest improvement</dt><dd>' + e(s['improvement']) + '</dd>') if s.get('improvement') else ''}
  </dl>
  {('<details><summary>Remaining weaknesses (' + str(len(s['weaknesses'])) + ')</summary><ul>' + weak + '</ul></details>') if weak else ''}
</article>''')
gallery = ''.join(f'<figure><img src="{thumb(g["path"], 720)}" alt="{e(g["caption"])}"><figcaption>{e(g["caption"])}</figcaption></figure>' for g in st.get('gallery', []) if thumb(g['path']))
log = ''.join(f'<li><time>{e(l["t"])}</time><span>{e(l["text"])}</span></li>' for l in reversed(st.get('log', [])))

page = f'''<title>Candyland &amp; Cat Island Build Board</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap">
<style>
:root {{ --bg:#fbf6ee; --ink:#2b2030; --muted:#6f6478; --line:#e6dccd; --card:#fffdf9; --candy:#e8457a; --cat:#2a8f8a; --ok:#3f9d5a; --okbg:#e3f5e8; --warn:#c98a1d; --warnbg:#fff1d6; --build:#4a6fd8; --buildbg:#e6ecfb; --q:#9a92a3; --qbg:#eee9f0; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#16121c; --ink:#f3ece2; --muted:#a79cb3; --line:#2c2537; --card:#1f1927; --candy:#ff6b9a; --cat:#4fc1bb; --ok:#6fd58b; --okbg:#1e3527; --warn:#f0b64a; --warnbg:#3a2d12; --build:#8aa8ff; --buildbg:#22294a; --q:#8d859a; --qbg:#26212e; }} }}
:root[data-theme="dark"] {{ --bg:#16121c; --ink:#f3ece2; --muted:#a79cb3; --line:#2c2537; --card:#1f1927; --candy:#ff6b9a; --cat:#4fc1bb; --ok:#6fd58b; --okbg:#1e3527; --warn:#f0b64a; --warnbg:#3a2d12; --build:#8aa8ff; --buildbg:#22294a; --q:#8d859a; --qbg:#26212e; }}
body {{ background:var(--bg); color:var(--ink); font-family:"Nunito", "Trebuchet MS", system-ui, sans-serif; padding-block:28px 60px; padding-inline:clamp(16px, 4vw, 48px); line-height:1.45; }}
h1,h2,h3 {{ font-family:"Fredoka", "Trebuchet MS", sans-serif; font-weight:600; text-wrap:balance; margin:0; }}
h1 {{ font-size:clamp(28px, 4vw, 40px); }} h1 span {{ color:var(--candy); }} h1 em {{ color:var(--cat); font-style:normal; }}
.top {{ display:flex; flex-wrap:wrap; align-items:end; justify-content:space-between; gap:12px 24px; border-bottom:3px solid var(--line); padding-bottom:16px; margin-bottom:22px; }}
.top p {{ margin:4px 0 0; color:var(--muted); }}
.stats {{ display:flex; gap:10px; flex-wrap:wrap; }}
.stat {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:8px 14px; min-width:96px; }}
.stat b {{ display:block; font-family:"Fredoka",sans-serif; font-size:24px; font-variant-numeric:tabular-nums; }} .stat small {{ color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:11px; }}
.wave {{ font-family:"JetBrains Mono", monospace; font-size:12px; color:var(--muted); }}
h2 {{ font-size:22px; margin:28px 0 12px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; }}
.sys {{ background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }}
.sys header {{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:12px 14px 8px; }} .sys h3 {{ font-size:17px; flex:1 1 auto; }}
.pill {{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; padding:3px 9px; border-radius:999px; }}
.pill.done {{ background:var(--okbg); color:var(--ok); }} .pill.critique {{ background:var(--warnbg); color:var(--warn); }} .pill.building {{ background:var(--buildbg); color:var(--build); }} .pill.queued {{ background:var(--qbg); color:var(--q); }}
.round {{ font-family:"JetBrains Mono", monospace; font-size:11px; color:var(--muted); }}
.sys img {{ width:100%; aspect-ratio:16/10; object-fit:cover; display:block; border-block:1px solid var(--line); }}
.noimg {{ aspect-ratio:16/10; display:grid; place-items:center; color:var(--q); background:repeating-linear-gradient(135deg, transparent 0 10px, rgba(127,127,127,.06) 10px 20px); border-block:1px solid var(--line); font-size:13px; }}
dl {{ margin:0; padding:10px 14px 4px; display:grid; grid-template-columns:auto 1fr; gap:4px 10px; font-size:13.5px; }} dt {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding-top:2px; }} dd {{ margin:0; }}
details {{ padding:6px 14px 12px; font-size:13px; }} summary {{ cursor:pointer; color:var(--muted); }} details ul {{ margin:6px 0 0; padding-left:18px; }}
.gallery {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }} figure {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }} figure img {{ width:100%; display:block; }} figcaption {{ padding:8px 12px; font-size:13px; color:var(--muted); }}
.log {{ list-style:none; padding:0; margin:0; max-width:70ch; }} .log li {{ display:grid; grid-template-columns:150px 1fr; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); font-size:14px; }} .log time {{ font-family:"JetBrains Mono", monospace; font-size:12px; color:var(--muted); }}
@media (max-width:520px) {{ .log li {{ grid-template-columns:1fr; gap:2px; }} }}
</style>
<div class="top">
  <div><h1><span>Candyland</span> &amp; <em>Cat Island</em> build board</h1><p>Builder → render → blind critic → fix loop, one card per system. Updated {st['updated']}.</p><p class="wave">{e(st['wave'])}</p></div>
  <div class="stats">
    <div class="stat"><b>{counts.get('building',0)}</b><small>building</small></div>
    <div class="stat"><b>{counts.get('critique',0)+counts.get('fixing',0)}</b><small>in critique</small></div>
    <div class="stat"><b>{counts.get('done',0)}</b><small>critic prefers ours</small></div>
    <div class="stat"><b>{counts.get('queued',0)}</b><small>queued</small></div>
  </div>
</div>
<h2>Systems</h2>
<div class="grid">{''.join(cards)}</div>
{('<h2>Latest renders</h2><div class="gallery">' + gallery + '</div>') if gallery else ''}
<h2>Log</h2>
<ul class="log">{log}</ul>
'''
open(os.path.join(ROOT, 'progress/index.html'), 'w').write(page)
print('wrote progress/index.html', len(page)//1024, 'KB')
