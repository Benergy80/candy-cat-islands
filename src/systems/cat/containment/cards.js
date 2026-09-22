// ── Containment DOM: the contract card, the fine print, the citizenship medal,
// and the screen fade used for sleeping and for crawling through the tunnel.
// Built lazily (ui.js rewrites uiRoot.innerHTML at startup) and self-contained.

const FINE_PRINT = [
  'CLAUSE 1. "Leave" shall be interpreted in its warmest, most figurative sense.',
  'CLAUSE 2. The Guest agrees that the ferry exists. The ferry does not agree.',
  'CLAUSE 3. Departure requests must be submitted in triplicate to a cat who is asleep.',
  'CLAUSE 4. The Guest may look at the sea. The Guest may not approach the sea.',
  'CLAUSE 5. Approaching the sea will be treated as an enthusiastic request for a rescue.',
  'CLAUSE 6. Rescues are free, mandatory, and slightly humiliating.',
  'CLAUSE 7. The Guest waives all rights to dry socks.',
  'CLAUSE 8. Rafts are decorative. Rafts that float are a manufacturing defect.',
  'CLAUSE 9. Any raft found floating will be reeled in "as a favour".',
  'CLAUSE 10. The Guest will be described as "settling in nicely" in all official communications.',
  'CLAUSE 11. The 15:00 ferry is a folk tradition, not a schedule.',
  'CLAUSE 12. Signage pointing to an EXIT points to the nearest other sign.',
  'CLAUSE 13. This is a feature of the signage, not an error in the signage.',
  'CLAUSE 14. The Guest agrees to be photographed looking happy at least once per day.',
  'CLAUSE 15. Sadness must be performed indoors, quietly, with the curtains open.',
  'CLAUSE 16. The Guest is allocated one (1) guest room in perpetuity plus one (1) afterlife.',
  'CLAUSE 17. The bed is extremely comfortable. This is not a coincidence.',
  'CLAUSE 18. Curfew is 19:00, and is enforced by small cats holding small lanterns.',
  'CLAUSE 19. The lanterns are for the cats. The cats can see perfectly well in the dark.',
  'CLAUSE 19a. At 20:00 the lantern cats go indoors and the night shift takes over.',
  'CLAUSE 19b. The Guest agrees not to ask what the night shift is. The Guest will find out.',
  'CLAUSE 20. The Guest shall not tunnel. If the Guest tunnels, the Guest shall not mention it.',
  'CLAUSE 21. Tunnels under the gym are load-bearing storage and also full of one asleep cat.',
  'CLAUSE 22. Fish may not be used to bribe a sleeping cat. (Fish work very well.)',
  'CLAUSE 23. In the event of a successful escape, the sea will handle it.',
  'CLAUSE 24. The sea is on retainer.',
  'CLAUSE 25. The Guest agrees not to ask how big the paw is.',
  'CLAUSE 26. It is that big.',
  'CLAUSE 27. Escape attempts are scored. The Guest is currently losing.',
  'CLAUSE 27a. Successful escapes are also scored, and are worth more to us than to you.',
  'CLAUSE 28. Three (3) successful escapes, each followed by a return, entitles the Guest to honorary citizenship.',
  'CLAUSE 28a. The Guest will return. Everybody returns. The ferry only goes one way and it goes here.',
  'CLAUSE 29. Honorary citizenship is non-refundable, non-transferable, and load-bearing.',
  'CLAUSE 30. The Guest agrees that the cats are, on balance, very soft.',
  'CLAUSE 31. This clause is here to make the scrollbar smaller.',
  'CLAUSE 32. So is this one.',
  'CLAUSE 33. And this one. You are doing great. Keep scrolling.',
  'CLAUSE 34. Statistically, nobody has ever reached CLAUSE 35.',
  'CLAUSE 35. Congratulations! You are now legally a cat person.',
  'CLAUSE 36. That was not a joke and it is not reversible.',
  'CLAUSE 37. The Guest may keep their own name for sentimental purposes.',
  'CLAUSE 38. All other possessions are now communal, i.e. the cats will sit on them.',
  'CLAUSE 39. The Guest agrees to be loved aggressively and without consent.',
  'CLAUSE 40. Thank you for choosing Cat Island. You did not choose Cat Island.',
];

export function createCards(ctx) {
  const host = document.createElement('div');
  host.id = 'cnt-ui';
  host.innerHTML = `
  <style>
    #cnt-ui { position: fixed; inset: 0; pointer-events: none; font-family: "Trebuchet MS","Segoe UI",system-ui,sans-serif; }
    #cnt-fade { position: fixed; inset: 0; background: #06040a; opacity: 0; pointer-events: none; }
    #cnt-fade.pale { background: #fff6e2; }
    #cnt-scrim { position: fixed; inset: 0; background: rgba(8,5,14,.55); display:none; pointer-events: auto; }
    .cnt-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.96); width: min(620px, 86vw);
      background: linear-gradient(#fffdf6,#f4e6cd); color:#2a1f16; border-radius: 18px; padding: 22px 26px 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,.55), 0 0 0 6px rgba(255,216,107,.25); display:none; pointer-events:auto; }
    .cnt-card.on { display:block; }
    .cnt-card h2 { margin: 0 0 2px; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: #a8763a; }
    .cnt-card h1 { margin: 0 0 10px; font-size: 27px; line-height: 1.15; color:#3a2a1c; }
    .cnt-quote { font-size: 21px; line-height: 1.4; background: #fffdf6; border-left: 5px solid #d9694a;
      padding: 12px 14px; border-radius: 6px; margin: 0 0 14px; }
    .cnt-quote em { color:#c94b3a; font-style: normal; font-weight: bold; }
    .cnt-sub { font-size: 14px; opacity:.72; margin: 0 0 14px; }
    .cnt-scroll { max-height: 34vh; overflow-y: auto; background:#fffdf6; border:1px solid #e0cfae; border-radius:8px;
      padding: 10px 12px; margin: 0 0 14px; font-size: 12.5px; line-height: 1.55; color:#5a4633; display:none; }
    .cnt-scroll.on { display:block; }
    .cnt-scroll p { margin: 0 0 7px; }
    .cnt-row { display:flex; gap:10px; flex-wrap: wrap; }
    .cnt-btn { flex: 1 1 auto; border:none; cursor:pointer; font: inherit; font-size: 16px; font-weight: bold;
      padding: 11px 16px; border-radius: 11px; background: #e6d6b6; color:#4a3620; }
    .cnt-btn:hover { filter: brightness(1.06); }
    .cnt-btn.primary { background: linear-gradient(#ff8f5a,#d9694a); color:#fff; box-shadow: 0 4px 0 #a8452f; }
    .cnt-btn.primary:active { transform: translateY(2px); box-shadow: 0 2px 0 #a8452f; }
    .cnt-sig { display:flex; align-items:center; gap:10px; margin: 0 0 14px; }
    .cnt-sig .line { flex:1; border-bottom: 2px dashed #b99a6a; height: 26px; }
    .cnt-sig .x { font-size: 26px; color:#c94b3a; font-weight:bold; }
    .cnt-medal { width: 104px; height: 104px; margin: 2px auto 10px; display:block; }
    .cnt-paws { text-align:center; font-size: 20px; letter-spacing: 6px; color:#c9a86a; margin-top: 8px; }
  </style>
  <div id="cnt-fade"></div>
  <div id="cnt-scrim"></div>
  <div class="cnt-card" id="cnt-card">
    <h2 id="cnt-kicker">notice</h2>
    <h1 id="cnt-title">Title</h1>
    <div id="cnt-medalwrap"></div>
    <div class="cnt-quote" id="cnt-quote"></div>
    <p class="cnt-sub" id="cnt-sub"></p>
    <div class="cnt-sig" id="cnt-sigrow"><span class="x">✗</span><span class="line"></span></div>
    <div class="cnt-scroll" id="cnt-fine"></div>
    <div class="cnt-row" id="cnt-buttons"></div>
    <div class="cnt-paws">🐾 🐾 🐾</div>
  </div>`;
  ctx.uiRoot.appendChild(host);

  const $ = (s) => host.querySelector(s);
  const fadeEl = $('#cnt-fade'), scrim = $('#cnt-scrim'), card = $('#cnt-card');
  let fade = { v: 0, target: 0, rate: 2.0 };
  let open = false, wasLocked = false;

  function lock(on) {
    const pl = ctx.systems.player;
    if (on) { wasLocked = !!pl?.locked; if (pl) pl.locked = true; }
    else if (pl) pl.locked = wasLocked;
  }

  const api = {
    get open() { return open; },
    /** Show a modal card. buttons: [{label, primary, close, onClick}] */
    show(o) {
      $('#cnt-kicker').textContent = o.kicker || '';
      $('#cnt-title').textContent = o.title || '';
      $('#cnt-quote').innerHTML = o.quote || '';
      $('#cnt-quote').style.display = o.quote ? 'block' : 'none';
      $('#cnt-sub').textContent = o.sub || '';
      $('#cnt-sigrow').style.display = o.signature ? 'flex' : 'none';
      $('#cnt-medalwrap').innerHTML = o.medal ? MEDAL_SVG : '';
      const fine = $('#cnt-fine'); fine.classList.remove('on'); fine.innerHTML = '';
      const row = $('#cnt-buttons'); row.innerHTML = '';
      for (const b of (o.buttons || [])) {
        const el = document.createElement('button');
        el.className = 'cnt-btn' + (b.primary ? ' primary' : '');
        el.textContent = b.label;
        el.onclick = () => { if (b.close !== false) api.hide(); b.onClick?.(api); };
        row.appendChild(el);
      }
      scrim.style.display = 'block'; card.classList.add('on');
      requestAnimationFrame(() => { card.style.transform = 'translate(-50%,-50%) scale(1)'; });
      card.style.transform = 'translate(-50%,-50%) scale(1)';
      if (!open) { open = true; lock(true); }
      return api;
    },
    /** Reveal the absurd fine print inside the open card. */
    revealFinePrint() {
      const fine = $('#cnt-fine');
      fine.innerHTML = `<p><b>PASSENGER AGREEMENT — SCHEDULE A (abridged)</b></p>` +
        FINE_PRINT.map((c) => `<p>${c}</p>`).join('') +
        `<p style="opacity:.6">…continued on Schedule B, held at the ferry office, which is closed.</p>`;
      fine.classList.add('on'); fine.scrollTop = 0;
    },
    hide() { if (!open) return; open = false; card.classList.remove('on'); scrim.style.display = 'none'; lock(false); },
    /** Fade the screen. to = 0..1, pale = white flash instead of black. */
    fadeTo(to, rate = 2.0, pale = false) { fade.target = to; fade.rate = rate; fadeEl.classList.toggle('pale', !!pale); },
    fadeValue() { return fade.v; },
    update(dt) {
      // the UI system owns uiRoot.innerHTML; if it ever rebuilds, re-attach.
      if (!host.isConnected) ctx.uiRoot.appendChild(host);
      if (fade.v !== fade.target) {
        const step = fade.rate * dt;
        fade.v += Math.sign(fade.target - fade.v) * Math.min(step, Math.abs(fade.target - fade.v));
        fadeEl.style.opacity = fade.v.toFixed(3);
      }
    },
    dispose() { host.remove(); },
  };
  return api;
}

const MEDAL_SVG = `<svg class="cnt-medal" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M30 4h40l-8 26H38z" fill="#c94b3a"/><path d="M38 4h24l-4 26h-16z" fill="#f2c14e"/>
  <circle cx="50" cy="60" r="30" fill="#e0a92e"/><circle cx="50" cy="60" r="24" fill="#f2c14e"/>
  <g fill="#8a5a15">
    <ellipse cx="50" cy="66" rx="11" ry="9"/>
    <ellipse cx="38" cy="52" rx="4.2" ry="5.4"/><ellipse cx="45" cy="47" rx="4.2" ry="5.4"/>
    <ellipse cx="55" cy="47" rx="4.2" ry="5.4"/><ellipse cx="62" cy="52" rx="4.2" ry="5.4"/>
  </g></svg>`;
