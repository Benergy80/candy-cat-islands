#!/usr/bin/env python3
"""Update progress/status.json. Usage:
  tools/status.py set <id> status=done round=2 render=renders/x.png verdict="..." gap="..." improvement="..."
  tools/status.py weak <id> "weakness 1" "weakness 2"        (replaces the weaknesses list)
  tools/status.py log "text"
  tools/status.py wave "Wave 2 — ..."
  tools/status.py gallery renders/x.png "caption"            (prepends; keeps 12)"""
import json, sys, os, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'progress/status.json')
st = json.load(open(P))
cmd = sys.argv[1]
if cmd == 'set':
    s = next(s for s in st['systems'] if s['id'] == sys.argv[2])
    for kv in sys.argv[3:]:
        k, v = kv.split('=', 1)
        s[k] = int(v) if k == 'round' else v
elif cmd == 'weak':
    s = next(s for s in st['systems'] if s['id'] == sys.argv[2]); s['weaknesses'] = sys.argv[3:]
elif cmd == 'log':
    st['log'].append({'t': datetime.datetime.now().strftime('%b %d %H:%M'), 'text': sys.argv[2]})
elif cmd == 'wave':
    st['wave'] = sys.argv[2]
elif cmd == 'gallery':
    st['gallery'] = [{'path': sys.argv[2], 'caption': sys.argv[3]}] + [g for g in st['gallery'] if g['path'] != sys.argv[2]][:11]
json.dump(st, open(P, 'w'), indent=2)
print('ok', cmd)
