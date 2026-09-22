#!/usr/bin/env python3
"""Assemble a critique set: critiques/<name>-r<N>/ with ours shuffled as letters + refs labeled.
usage: tools/critique_set.py <system> <round> renders/a.png renders/b.png ... [--refs farmville_wiki.png,pikmin3_wiki.jpg]
Prints the folder. key.json maps letters → source paths (critic must not open it)."""
import sys, os, json, random, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
refs = []
if '--refs' in args:
    i = args.index('--refs'); refs = args[i+1].split(','); del args[i:i+2]
system, rnd, ours = args[0], int(args[1]), args[2:]
out = os.path.join(ROOT, 'critiques', f'{system}-r{rnd}')
if os.path.exists(out): shutil.rmtree(out)
os.makedirs(out)
random.seed(f'{system}{rnd}')
letters = list('ABCDEFGHJKLMNP')[:len(ours)]
random.shuffle(letters)
key = {}
for L, src in zip(letters, ours):
    ext = os.path.splitext(src)[1]
    shutil.copy(os.path.join(ROOT, src) if not os.path.isabs(src) else src, os.path.join(out, f'{L}{ext}'))
    key[L] = src
for r in refs:
    shutil.copy(os.path.join(ROOT, 'critiques/refs', r), os.path.join(out, 'REF_' + r))
json.dump(key, open(os.path.join(out, 'key.json'), 'w'), indent=1)
print(out)
for L in sorted(key): print(' ', L, '←', key[L])
