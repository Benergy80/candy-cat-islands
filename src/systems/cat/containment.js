// ═════════════════════════════════════════════════════════════════════════════
// CAT ISLAND CONTAINMENT — the cats are delighted you came. You are not leaving.
//
// Beats, in escalating order:
//   1. Arrival      → banner + two greeter cats escort you to Welcome Plaza
//   2. Ferry office → the schedule board rots: 15:00 → soon™ → NEVER (typo?)
//                     the clerk is on break; the third attempt produces a contract
//   3. Physical     → a rolling wave of 12 cats sweeps you off the beach/pier
//                     a lifeguard "rescues" you out of ankle-deep water
//                     the raft on the east shore is reeled back in by rope
//   4. Environment  → a boom gate on the road to Not-An-Exit Beach, four EXIT
//                     arrows pointing in a circle, a bus stop to nowhere, a
//                     MISSING: HUMAN poster wall, your suitcase in a shop window
//   5. Night        → the lantern-cat curfew, which STANDS DOWN the moment the
//                     citizens turn into tigers (catCitizens.isTigerTime()): the
//                     tigers own the night shift and carry you home themselves.
//                     We keep the guest bed and the 06:00 wake-up.
//   6. The escape   → a tunnel under Muscle Beach Gym, one napping cat, one fish,
//                     a hidden cove, a real raft, and one very large paw.
//   7. Wave 2       → the real escape ROUTES (catapult / canoe / flyer / cave)
//                     belong to ctx.systems.escape. We react: the cats notice you
//                     going ('escape:start'), we count the ones that work
//                     ('escape:success') and, above all, we count you COMING
//                     BACK. Three successful escapes AND three returns earns
//                     honorary citizenship. Objective: "Enjoy your life."
//
// Owns: src/systems/cat/containment.js + src/systems/cat/containment/*.js
// API : { update, escapeAttempts, escapesMade, returns, state, spots,
//         triggerWave(x,z), sceneryTris }
// Consumes: ferry:arrive, ferry:board, day, world:ready, camera:update,
//   escape:start, escape:success · reads catCitizens.isTigerTime(),
//   ctx.state.vehicle / player.onVehicle
// Sets story flags: arrived_cat · ticket_attempts · signed_contract · has_fish
//   tunnel_open · escape_attempts · escapes_made · escape_returns
//   escape_card_shown_<route> · rescued_from_sea · poster_describes_you
//   honorary_citizen
// Every prop's position is negotiated at build time against ctx.colliders — see
// the PLACEMENT PASS in containment/scenery.js; read api.spots, never a literal.
// ═════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, damp, lerp, clamp } from '../../core/util.js';
import { CAT } from '../../core/palette.js';
import { paint, place, createCatPool, createLanternPool } from './containment/catmesh.js';
import { buildScenery, SPOTS, drawSchedule, drawPosters, paintSigns, EXIT_SIGNS } from './containment/scenery.js';
import { createCards } from './containment/cards.js';
import {
  createGreeters, createWave, createLifeguard, createRaft, createPaw,
  createCurfew, createResidents, createNoticers, inlandDir, safeBeachPoint,
} from './containment/gags.js';

// DUSK WATCH, not the night shift. The citizens grow stripes at 20:00
// (citizens/tiger.js TIGER_ON) and from then on the tigers walk you home
// themselves, so the lantern cats get the hour before that and then go indoors.
const CURFEW_HOUR = 19, CURFEW_END = 5.5;

// ── WAVE 2: what the cats shout when ctx.systems.escape fires 'escape:start' ──
const ROUTES = {
  catapult: { label: 'the catapult', toast: "Someone's on the catapult!", say: ['“That is a CATAPULT. That is not a ferry. That is a catapult.”', 'Neighbour Cat'] },
  canoe:    { label: 'a canoe',      toast: 'A canoe? Rude.',             say: ['“A canoe. After everything we have done for them. A canoe.”', 'Neighbour Cat'] },
  flyer:    { label: 'the flying machine', toast: 'She is FLYING. Nobody cleared any flying.', say: ['“Wings were not on the list of approved feelings.”', 'Neighbour Cat'] },
  cave:     { label: 'the cave',     toast: 'Somebody has found the hole again.', say: ['“The hole is not a hole. The hole is STORAGE.”', 'Neighbour Cat'] },
  palace:   { label: 'the palace door', toast: 'They went UNDER us. Under!', say: ['“Under. They went under. Nobody goes under.”', 'Neighbour Cat'] },
};
const ROUTE = (r) => ROUTES[r] || { label: 'some nonsense', toast: 'Somebody is LEAVING.', say: ['“Leaving? On a lovely day like this?”', 'Neighbour Cat'] };

export function create(ctx) {
  const { world } = ctx;
  ctx.colliders = ctx.colliders || [];

  // ── persistent state ───────────────────────────────────────────────────────
  const S = {
    arrived: false, escorted: false, ticketAttempts: 0, signed: false,
    escapeAttempts: 0, crateTaps: 0, hasFish: false, tunnelOpen: false, napperGone: false,
    waveTriggers: 0, rescues: 0,
    boardStage: 0, posterUpdated: false, nightsSlept: 0, medal: false,
    curfewNight: -1, phase: 'arriving', arrowsRead: [false, false, false, false, false, false],
    paperRead: 0, statueRead: false,
    // wave 2 — the routes that actually work, and the returns that undo them
    escapesMade: 0, returns: 0, lastRoute: null, noticed: 0, standDownSaid: false,
  };
  // one pending round trip: set by escape:success, cleared when you are back
  let away = { on: false, route: null, sawCandy: false, t: 0 };
  let cardCheck = null;                 // deferred 'For now.' card (see maybeForNowCard)

  // ── scene ──────────────────────────────────────────────────────────────────
  const scenery = buildScenery(ctx);
  paintSigns(scenery.atlas, ctx);
  for (const c of scenery.colliders) ctx.colliders.push(c);
  // 30 slots for the cast below + 5 for the wave-2 "neighbours notice" crowd
  const pool = createCatPool(ctx, 40);
  const lanterns = createLanternPool(ctx, 8);

  // a fish you can carry (one tiny mesh, hidden until earned)
  const fish = (() => {
    const parts = [
      place(paint(new THREE.SphereGeometry(0.2, 7, 5), 0xbcd4e0), 0, 0, 0, 0, 0, 0, 1, 0.75, 1.9),
      place(paint(new THREE.ConeGeometry(0.19, 0.3, 4), 0x9db9c8), 0, 0, -0.46, Math.PI / 2),
      place(paint(new THREE.SphereGeometry(0.05, 4, 3), 0x14141a), 0.09, 0.05, 0.26),
      place(paint(new THREE.SphereGeometry(0.05, 4, 3), 0x14141a), -0.09, 0.05, 0.26),
    ];
    const m = new THREE.Mesh(mergeGeometries(parts, false), mat(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.5 }));
    m.visible = false; m.castShadow = true; m.name = 'containment-fish'; ctx.scene.add(m);
    return m;
  })();

  // ── shared services for the gag modules ────────────────────────────────────
  const sayQueue = []; let sayTimer = 0;
  const shake = { a: 0, t: 0, d: 1 }; let useOwnShake = true;
  const tumble = { t: 0, d: 1 };

  const env = {
    ctx, world, pool, lanterns,
    get particles() { return ctx.systems.particles; },
    say(text, speaker, duration) { sayQueue.push({ text, speaker, duration }); if (sayQueue.length > 6) sayQueue.splice(0, sayQueue.length - 6); },
    toast(t) { ctx.systems.ui?.toast(t); },
    shake(a, d) { if (!useOwnShake) { ctx.systems.camera.shake(a, d); return; } shake.a = Math.max(shake.a, a); shake.t = Math.max(shake.t, d); shake.d = Math.max(shake.d, d); },
    tumble(d) { tumble.t = d; tumble.d = d; },
    onEscorted: () => onEscorted(),
    onRescued: () => { S.rescues++; ctx.systems.story?.set('rescued_from_sea', S.rescues); },
    onEscapeFailed: (kind) => onEscapeFailed(kind),
  };

  // ── actors ─────────────────────────────────────────────────────────────────
  const greeters = createGreeters(env);
  const wave = createWave(env, 12);
  const lifeguard = createLifeguard(env);
  const paw = createPaw(env);
  const raftA = createRaft(env, SPOTS.raftA, 'rope');
  const raftB = createRaft(env, SPOTS.raftB, 'paw', paw);
  const curfew = createCurfew(env, 6);
  const residents = createResidents(env);
  const noticers = createNoticers(env, 5);

  let cards = null;
  let ferryGrace = 0;                  // don't body-block the pier around a real ferry
  let bannerDelay = -1;
  let sleep = { on: false, stage: 0, t: 0 };
  let transit = { on: false, stage: 0, t: 0 };
  let pendingMedal = false;

  // ═══ story beats ═══════════════════════════════════════════════════════════
  const ui = () => ctx.systems.ui;
  const story = () => ctx.systems.story;

  function onArrive() {
    if (S.arrived) return;
    S.arrived = true; S.phase = 'greeting';
    story()?.set('arrived_cat');
    // let any location banner from the UI land first, then say the quiet part
    bannerDelay = 1.6;
    ui()?.setObjective('Find a way home');
    // the board still says 15:00 when you land — it only rots once you ask
    const p = ctx.systems.player?.position;
    if (p) {
      greeters.start(p.x, p.z);
      env.particles?.burst({ x: p.x, y: p.y + 1.8, z: p.z, count: 70, color: [0xffd86b, 0xff7aa2, 0x7fe3a8, 0x6fc7ff], speed: 6, life: 2.0, size: 0.28, gravity: -3.6, spread: 4 });
    }
  }

  function onEscorted() {
    if (S.escorted) return;
    S.escorted = true; S.phase = 'ferry';
    ui()?.setObjective('Ask about the ferry');
    ui()?.banner('Welcome Plaza', 'Please enjoy the plaza. Please enjoy it indefinitely.', 3.0);
  }

  const CLERK_LINES = [
    ["The window shutter is down. A note reads: BACK IN 5 MINUTES — signed, 1997.", 'Ferry Office'],
    ["A cat is visibly behind the glass. A cat is visibly on break.", 'Ferry Office'],
    ["“Fine. FINE. One ticket. It's… free! Just sign here.”", 'Deputy Clerk Whiskerby'],
  ];

  /** The SMALL PRINT rots: aspirational → soon™ → NEVER (typo?). The big line
   *  has said CANCELLED since before you were born. One notch per visit. */
  function rotBoard() {
    if (S.boardStage >= 2) return;
    S.boardStage++;
    drawSchedule(scenery.atlas, S.boardStage);
    env.toast(S.boardStage === 1
      ? 'The small print on the schedule board updates itself. Helpfully.'
      : 'The small print updates itself again. Less helpfully.');
  }

  function onTicketWindow() {
    if (cards?.open) return;
    S.ticketAttempts++;
    story()?.set('ticket_attempts', S.ticketAttempts);
    if (S.ticketAttempts <= 2) rotBoard();
    if (S.signed) {
      env.say('“Your ticket is in the post. The post is also on break.”', 'Deputy Clerk Whiskerby');
      return;
    }
    if (S.ticketAttempts === 1) {
      env.say(CLERK_LINES[0][0], CLERK_LINES[0][1]);
      env.say('You knock again. Somewhere inside, a cat pointedly stretches.', 'Ferry Office');
      ui()?.setObjective('Ask about the ferry (again)');
    } else if (S.ticketAttempts === 2) {
      env.say(CLERK_LINES[1][0], CLERK_LINES[1][1]);
      env.say('“We are extremely short-staffed,” says the cat, from a cushion.', 'Deputy Clerk Whiskerby');
      env.say('“Try Clerk Bartholomew, down at the pier. He has been on this since 1994.”', 'Deputy Clerk Whiskerby');
      ui()?.setObjective('Ask about the ferry (one more time)');
    } else {
      env.say(CLERK_LINES[2][0], CLERK_LINES[2][1]);
      showContract();
    }
  }

  function showContract() {
    if (!cards) return;
    cards.show({
      kicker: 'Ferry Office · Form 9-Lives',
      title: 'Passenger Agreement',
      quote: 'I agree to leave… <em>my heart</em> on Cat Island. Forever.',
      sub: 'One (1) ticket. Free! Just sign here. And here. And on the back of your hand.',
      signature: true,
      buttons: [
        { label: 'Read fine print', close: false, onClick: (c) => c.revealFinePrint() },
        { label: 'Put the pen down', onClick: () => env.say('The clerk does not blink. The clerk can wait. The clerk has time.', 'Deputy Clerk Whiskerby') },
        { label: 'Sign', primary: true, onClick: () => onSigned() },
      ],
    });
  }

  function onSigned() {
    if (S.signed) return;
    S.signed = true; S.phase = 'escape';
    story()?.set('signed_contract');
    ui()?.banner('WELCOME, PERMANENT GUEST', 'The cats are so happy. So, so happy.', 3.6);
    env.say('“CONGRATULATIONS! You are now a permanent guest of Cat Island!”', 'Deputy Clerk Whiskerby');
    env.say('“The heart clause is standard. Everyone signs it. Nobody reads it.”', 'Deputy Clerk Whiskerby');
    ui()?.setObjective('Find another way off Cat Island');
    const p = ctx.systems.player?.position;
    if (p) for (let i = 0; i < 3; i++) env.particles?.burst({
      x: p.x + (i - 1) * 2.2, y: p.y + 2.4, z: p.z + (i - 1) * 1.1, count: 60,
      color: [0xffd86b, 0xff7aa2, 0x7fe3a8, 0x6fc7ff, 0xffffff], speed: 8, life: 2.4, size: 0.3, gravity: -3.2, spread: 2.4,
    });
    env.shake(0.35, 0.5);
  }

  /** A containment gag beat you — the rafts, the paw. Never the medal on its own. */
  function onEscapeFailed(kind) {
    S.escapeAttempts++;
    story()?.set('escape_attempts', S.escapeAttempts);
    if (kind === 'paw') ui()?.banner('ESCAPE ATTEMPT ' + S.escapeAttempts, 'Score: ' + S.escapeAttempts + ' – 0 cats.', 3.0);
    ui()?.setObjective(S.escapeAttempts === 1 ? 'Find a better way off Cat Island' : 'Find a MUCH better way off Cat Island');
  }

  // ═══ WAVE 2: the escape routes ═════════════════════════════════════════════
  /** ctx.systems.escape says you are getting into something. The street reacts. */
  function onEscapeStart(e) {
    const route = e?.route || 'escape';
    if (e?.arrived === 'cat') return;                 // cave.js re-uses the event to come BACK
    if (e?.to === 'cat') return;                      // WAVE 4: heading TO Cat Island (the rainbow, the blimp, the biplane) is no escape
    if (!S.arrived) return;                           // you have not even landed here yet
    const R = ROUTE(route);
    S.noticed++; S.lastRoute = route;
    env.toast(R.toast);
    env.say(R.say[0], R.say[1]);
    const p = ctx.systems.player?.position;
    if (p) noticers.alert(p.x, p.z);
    story()?.set('cats_noticed_escape', S.noticed);
  }

  /** You made it to Candyland. The cats are not upset. The cats are patient. */
  function onEscapeSuccess(e) {
    // WAVE 4 (bridge builder): the two-way routes (the rainbow, the blimp, the
    // biplane) also fire a success when they land you ON Cat Island. That is the
    // way back, not an escape: the away/sawCandy watch below counts it as the
    // return (onReturned), so it must not open a new trip here — r2 counted every
    // rainbow crossing to Cat Island as an escape, lost the return, and set
    // "Enjoy…" while he stood on Cat Island.
    // r5: a ride's landing on Cat Island (the blimp's ladder foot, Wing Nut
    // Field) also closes an open round trip, in case the watch below missed it
    if (e?.to === 'cat') {
      if (away.on && away.sawCandy && ctx.state.island === 'cat') onReturned();
      return;
    }
    const route = e?.route || 'escape';
    if (away.on && away.route === route) return;      // one success per trip
    S.escapeAttempts++; S.escapesMade++; S.lastRoute = route;
    story()?.set('escape_attempts', S.escapeAttempts);
    story()?.set('escapes_made', S.escapesMade);
    away = { on: true, route, sawCandy: ctx.state.island === 'candy', t: 0 };
    noticers.stop();
    // the route module usually pops its own "For now." card; give it a beat and
    // only fill in if it didn't (flag: escape_card_shown_<route>)
    cardCheck = { route, t: 0.9 };
    // (post-medal the objective is the real way out — the boarding pass, the flare — and stays)
    if (!S.medal) ui()?.setObjective('Enjoy Candyland. The arrivals ferry runs every three hours.');
  }

  /**
   * Show the 'For now.' card only if nobody else did. The route modules call
   * ui.card() directly, so we check BOTH the shared flag and whether a UI card
   * is on screen before adding a second one.
   */
  function maybeForNowCard(route) {
    const flag = 'escape_card_shown_' + route;
    if (story()?.get(flag)) return;
    let open = false;
    try { open = !!document.querySelector('.cci-cardwrap.cci-hit'); } catch (err) { open = false; }
    if (open || cards?.open) { story()?.set(flag, true); return; }   // somebody got there first
    story()?.set(flag, true);
    const label = ROUTE(route).label;
    const left = Math.max(0, 3 - S.returns);
    const body = `You escaped Cat Island by ${label}. For now.`
      + (S.escapesMade < 3 ? ` Escape ${S.escapesMade} of 3 — they are already making the bed up.` : ' They have stopped pretending to be surprised.');
    const spec = {
      title: 'ESCAPED', body,
      buttons: [{ label: 'For now.' }],
    };
    if (ctx.systems.ui?.card) ctx.systems.ui.card(spec);
    else cards?.show({ kicker: 'Cat Island · Departures', title: 'ESCAPED', quote: body, sub: `${left} return(s) from honorary citizenship.`, buttons: [{ label: 'For now.', primary: true }] });
  }

  /**
   * …and back you come. A return by ferry (or through the cave, or on any other
   * system's ride) closes the round trip, and three closed round trips is what
   * the Mayor actually rewards: not the leaving, the coming back.
   */
  function onReturned() {
    if (!away.on) return;
    const route = away.route;
    away = { on: false, route: null, sawCandy: false, t: 0 };
    S.returns++;
    story()?.set('escape_returns', S.returns);
    // post-medal (WAVE 4): no more round-trip scoreboard — the goal is the real way out now
    if (S.medal) { env.toast('Welcome back, Citizen. Your room is exactly as you left it.'); return; }
    env.toast('Welcome back! Your room is exactly as you left it.');
    ui()?.banner('YOU CAME BACK', `Round trip ${S.returns} of 3 — out by ${ROUTE(route).label}, and back again.`, 3.4);
    if (S.returns >= 3 && !S.medal) {
      pendingMedal = true;
      const p = ctx.systems.player?.position;
      if (p) residents.summonMayor(p.x, p.z);
      ui()?.setObjective('A very official cat is walking towards you');
    } else {
      ui()?.setObjective(S.returns === 1 ? 'Find a better way off Cat Island' : 'Find a MUCH better way off Cat Island');
    }
  }

  function giveMedal() {
    // WAVE 4 (bridge builder): the rainbow's 25 s cinematic owns the screen —
    // the Mayor waits politely until it has finished (pendingMedal stays set)
    if (ctx.systems.escape?.routes?.bridge?.raising) return;
    // …and never mid-ride: the card waits until he is back on his own feet
    const pl = ctx.systems.player;
    if (pl?.onVehicle || pl?.onFerry || ctx.state.vehicle || ctx.state.flying) return;
    S.medal = true; pendingMedal = false;
    story()?.set('honorary_citizen');
    cards?.show({
      kicker: 'Office of the Mayor · Purrliament Square',
      title: 'Honorary Citizenship',
      medal: true,
      quote: 'For three (3) successful escapes, and three (3) entirely voluntary returns.',
      sub: 'You are hereby a Citizen of Cat Island, First Class, Very Soft. Your suitcase has been unpacked for you.',
      buttons: [{
        label: 'Accept (you have no choice)', primary: true, onClick: () => {
          // post-medal objective (WAVE 4): once the rainbow stands, the goal is the real way out
          const joined = !!story()?.get('rainbow_bridge');
          if (joined) ui()?.setObjective('The islands are joined. So are their problems.', 'The King’s half of the boarding pass is on the Candy Palace throne.');
          else ui()?.setObjective('Enjoy your life.');
          ui()?.banner('CITIZEN', 'Honestly? The weather is lovely.', 3.6);
          const p = ctx.systems.player?.position;
          if (p) env.particles?.burst({ x: p.x, y: p.y + 2.2, z: p.z, count: 150, color: [0xffd86b, 0xff7aa2, 0x7fe3a8, 0x6fc7ff, 0xffffff], speed: 9, life: 2.8, size: 0.32, gravity: -3, spread: 4 });
          // WAVE 4 — the boarding-pass hand-off (half of one; the King has the other)
          story()?.set('pass_cat', true);
          ui()?.say('Oh — and citizens receive HALF a MEOW AIR boarding pass. Seat 1A. Window. It is purely ceremonial.', { speaker: 'The Mayor' });
          ui()?.say('The other half is on the throne of the Candy Palace. The King and I are not on speaking terms. He is mostly a puddle.', { speaker: 'The Mayor' });
          ui()?.say('Please do not put the halves together. We would be SO sad. We would have to be sad AT you.', { speaker: 'The Mayor' });
          ui()?.toast('Got: the Mayor’s half of a boarding pass');
        },
      }],
    });
  }

  // ── sleeping ───────────────────────────────────────────────────────────────
  function startSleep() {
    if (!cards || sleep.on || cards.open) return;
    sleep = { on: true, stage: 0, t: 0 };
    if (ctx.systems.player) ctx.systems.player.locked = true;
    cards.fadeTo(1, 1.8);
    env.toast('You sleep like something that has given up.');
  }
  function updateSleep(dt) {
    if (!sleep.on || !cards) return;
    sleep.t += dt;
    if (sleep.stage === 0 && cards.fadeValue() > 0.985) {
      sleep.stage = 1; sleep.t = 0;
      ctx.state.time = 6;                       // timeFrozen is left exactly as it was
      ctx.events.emit('time:set', 6);
      S.nightsSlept++;
      curfew.end();
      if (!S.posterUpdated) updatePosters();
      const b = SPOTS.bed;
      ctx.systems.player?.teleport(b.x + 1.8, b.z + 1.8);
      cards.fadeTo(0, 1.2);
      ui()?.banner('Morning', 'You slept wonderfully. The door was locked from the outside.', 3.4);
    } else if (sleep.stage === 1 && cards.fadeValue() < 0.02) {
      sleep.on = false;
      if (ctx.systems.player) ctx.systems.player.locked = false;
    }
  }

  function updatePosters() {
    if (S.posterUpdated) return;
    S.posterUpdated = true;
    drawPosters(scenery.atlas, true, ctx);
    story()?.set('poster_describes_you');
    env.toast('Somebody has pinned a very detailed poster of you to the wall.');
  }

  // ── tunnel ─────────────────────────────────────────────────────────────────
  function onTunnel() {
    if (!cards || cards.open || transit.on) return;
    if (!S.tunnelOpen) {
      if (!S.hasFish) {
        env.say('A cat is asleep across the tunnel mouth. Completely across it.', 'Tunnel');
        env.say('His collar says MR. SARDINE. He has always been asleep. He will always be asleep.', 'Tunnel');
        env.toast('He would probably wake up for a fish.');
        ui()?.setObjective('Find something a sleeping cat cannot ignore');
        return;
      }
      S.hasFish = false; fish.visible = false;
      story()?.set('has_fish', false);
      S.tunnelOpen = true; S.napperGone = true; residents.napperAwake = true;
      story()?.set('tunnel_open');
      env.say('Mr. Sardine accepts your fish. Mr. Sardine suddenly has business elsewhere.', 'Mr. Sardine');
      env.toast('The tunnel is clear. Go now. Go quietly.');
      ui()?.setObjective('Crawl through the tunnel');
      return;
    }
    transit = { on: true, stage: 0, t: 0, to: 'cove' };
    if (ctx.systems.player) ctx.systems.player.locked = true;
    cards.fadeTo(1, 2.4);
  }
  function onCoveArch() {
    if (!cards || cards.open || transit.on) return;
    transit = { on: true, stage: 0, t: 0, to: 'gym' };
    if (ctx.systems.player) ctx.systems.player.locked = true;
    cards.fadeTo(1, 2.4);
  }
  function updateTransit(dt) {
    if (!transit.on || !cards) return;
    transit.t += dt;
    if (transit.stage === 0 && cards.fadeValue() > 0.985) {
      transit.stage = 1; transit.t = 0;
      if (transit.to === 'cove') {
        ctx.systems.player?.teleport(SPOTS.cove.x + 1.6, SPOTS.cove.z + 3.4);
        ui()?.banner('Hidden Cove', 'No signs. No arrows. No cats. Suspicious.', 3.4);
        ui()?.setObjective('Push off before anyone notices');
      } else {
        ctx.systems.player?.teleport(SPOTS.tunnel.x - 2.6, SPOTS.tunnel.z + 2.6);
        ui()?.banner('Muscle Beach Gym', 'You smell faintly of tunnel.', 2.6);
      }
      cards.fadeTo(0, 1.4);
    } else if (transit.stage === 1 && cards.fadeValue() < 0.02) {
      transit.on = false;
      if (ctx.systems.player) ctx.systems.player.locked = false;
    }
  }

  // ═══ interactables (registered once every other system exists) ═════════════
  function registerInteractions() {
    const I = ctx.systems.interaction; if (!I) return;
    const reg = (o) => I.register(o);

    reg({ id: 'cnt_ticket', x: SPOTS.window.x, z: SPOTS.window.z, r: 3.4, label: 'Ask about the ferry', onInteract: onTicketWindow });
    reg({
      id: 'cnt_board', x: SPOTS.board.x, z: SPOTS.board.z, r: 3.0, label: 'Read the schedule board',
      onInteract: () => {
        // the big line never changes — DEPARTURES — : — / CANCELLED, same as the
        // pier board. What rots is the small print underneath it.
        const L = [
          'The small print says the 15:00 is "aspirational". It has been aspirational since 1994.',
          'The small print now says "soon™". The ™ has been carved in very carefully.',
          'The small print now says NEVER. Someone has added "(typo?)" in a different colour.',
        ];
        env.say('DEPARTURES: — : —. CANCELLED, in letters you could read from the sea.', 'Schedule Board');
        env.say(L[Math.min(2, S.boardStage)], 'Schedule Board');
        env.say('Underneath, in green: ARRIVALS ONLY · ON TIME. Every three hours. Reliably. Forever.', 'Schedule Board');
      },
    });
    reg({
      id: 'cnt_bus', x: SPOTS.busStop.x, z: SPOTS.busStop.z, r: 3.2, label: 'Check the timetable',
      onInteract: () => {
        env.say('MON — . TUE — . WED — . THU — . FRI — . SAT — . SUN — .', 'Bus Timetable');
        env.say('A cat has been waiting at this stop for eleven years. She seems content.', 'Bus Stop');
      },
    });
    reg({
      id: 'cnt_posters', x: SPOTS.posters.x, z: SPOTS.posters.z, r: 3.6, label: 'Read the notice board',
      onInteract: () => {
        if (S.posterUpdated) {
          env.say('MISSING: HUMAN. Tall, soft, two legs, smells of boat. IF FOUND: keep it.', 'Notice Board');
          env.say('It is a very good likeness. Somebody has drawn you smiling.', 'Notice Board');
        } else {
          env.say('MISSING: one (1) tuna. MISSING: the 15:00 ferry. FOUND: a human!', 'Notice Board');
          env.say('The FOUND notice is dated today. It says "we are keeping it".', 'Notice Board');
        }
      },
    });
    reg({
      id: 'cnt_suitcase', x: SPOTS.shop.x, z: SPOTS.shop.z, r: 3.6, label: 'Look in the shop window',
      onInteract: () => {
        const name = (ctx.params?.get?.('name') || 'THE HUMAN').toUpperCase();
        env.say(`A suitcase on a little plinth. The tag reads: PACKED FOR: ${name}.`, 'Shop Window');
        env.say('It is your suitcase. It is already packed. It is not for sale.', 'Shop Window');
      },
    });
    for (let i = 0; i < scenery.arrowSpots.length; i++) {
      const a = scenery.arrowSpots[i];
      const sign = EXIT_SIGNS[i % EXIT_SIGNS.length];
      reg({
        id: 'cnt_arrow' + i, x: a.x, z: a.z, r: 2.4,
        label: sign.arrow ? 'Follow the EXIT sign' : 'Read the tidy sign',
        onInteract: () => {
          env.say(sign.line, 'Signpost');
          S.arrowsRead[i] = true;
          const n = S.arrowsRead.filter(Boolean).length;
          if (n === scenery.arrowSpots.length) {
            env.say('Six exit signs. Every arrow points at another arrow. The square is very well signposted.', 'Signpost');
            story()?.set('read_all_exit_signs');
          } else if (n === 2) env.toast('Two exit signs so far. Both point inward.');
        },
      });
    }
    // ── the square's south-east corner ───────────────────────────────────────
    reg({
      id: 'cnt_kiosk', x: SPOTS.kiosk.x, z: SPOTS.kiosk.z, r: 3.4, label: 'Buy THE DAILY NAP',
      onInteract: () => {
        const L = [
          ['THE DAILY NAP. Front page: "SUN OUT AGAIN". Page two: "SUN STILL OUT".', 'The Daily Nap'],
          ['The classifieds are one line long: "WANTED: nothing. We have everything."', 'The Daily Nap'],
          ['Weather: lovely. Tides: irrelevant. Departures: see page nine. There is no page nine.', 'The Daily Nap'],
          ['Today’s edition is yesterday’s edition. So was yesterday’s.', 'The Daily Nap'],
        ];
        const l = L[Math.min(L.length - 1, S.paperRead++)];
        env.say(l[0], l[1]);
        if (S.paperRead === 2) env.toast('The vendor is asleep. The papers are free. Nothing is free.');
      },
    });
    reg({
      id: 'cnt_statue', x: SPOTS.kiosk.x + 4.6, z: SPOTS.kiosk.z + 1.2, r: 3.0, label: 'Read the plaque',
      onInteract: () => {
        env.say('A bronze tourist asleep on a bench, suitcase packed, waiting for a ferry.', 'Statue');
        env.say('The plaque reads: OUR FIRST GUEST. HE SETTLED IN BEAUTIFULLY. 1931–', 'Statue');
        if (!S.statueRead) {
          S.statueRead = true;
          story()?.set('met_first_guest');
          env.toast('The second date has been left blank. Deliberately, you feel.');
        }
      },
    });
    reg({
      id: 'cnt_pillar', x: SPOTS.kiosk.x + 1.4, z: SPOTS.kiosk.z + 4.4, r: 2.8, label: 'Look at the pillar',
      onInteract: () => {
        env.say('The same MISSING poster, pasted around the pillar eight times. Same human. Same suitcase.', 'Wanted Pillar');
        env.say(S.posterUpdated
          ? 'It is you now. Somebody has been very thorough, and somebody has drawn you smiling.'
          : 'Under the top layer there is another layer. And another. It is posters all the way down.', 'Wanted Pillar');
      },
    });
    reg({
      id: 'cnt_bed', x: SPOTS.bed.x, z: SPOTS.bed.z, r: 2.8, label: 'Sleep in "your" bed',
      onInteract: () => {
        if (ctx.state.time > 7 && ctx.state.time < CURFEW_HOUR - 1) { env.say('The bed is extremely comfortable and it is extremely not bedtime.', 'Guest Room'); return; }
        startSleep();
      },
    });
    reg({
      id: 'cnt_crates', x: SPOTS.crates.x, z: SPOTS.crates.z, r: 3.2, label: 'Rummage in the fish crates',
      onInteract: () => {
        if (S.hasFish) { env.toast('You already have a suspiciously large fish. shhh.'); return; }
        S.crateTaps++;
        if (S.crateTaps === 1) { env.toast('shhh'); env.say('The crates are full of ice and rumour. A tail flicks out of one.', 'Fish Harbor'); }
        else if (S.crateTaps === 2) { env.toast('shhh'); env.say('Somewhere behind you, a dockworker cat very deliberately looks away.', 'Fish Harbor'); }
        else {
          S.hasFish = true; fish.visible = true;
          story()?.set('has_fish', true);
          env.toast('You pocket a suspiciously large fish. shhh.');
          env.say('Nobody saw that. Everybody saw that. Nobody is going to mention it.', 'Fish Harbor');
          if (S.tunnelOpen === false) ui()?.setObjective('Take the fish to the tunnel under the gym');
        }
      },
    });
    reg({
      id: 'cnt_tunnel', x: SPOTS.tunnel.x, z: SPOTS.tunnel.z, r: 3.4,
      label: 'Look behind the smoothie stand', onInteract: onTunnel,
    });
    reg({ id: 'cnt_cove', x: SPOTS.cove.x, z: SPOTS.cove.z, r: 3.0, label: 'Crawl back through the tunnel', onInteract: onCoveArch });
    reg({
      id: 'cnt_raftA', r: 3.4, label: 'Board the raft',
      getPos: () => raftA.pos(), x: SPOTS.raftA.x, z: SPOTS.raftA.z,
      onInteract: () => { if (!raftA.riding && !raftB.riding && !cards?.open) raftA.board(); },
    });
    reg({
      id: 'cnt_raftB', r: 3.4, label: 'Push off',
      getPos: () => raftB.pos(), x: SPOTS.raftB.x, z: SPOTS.raftB.z,
      onInteract: () => { if (!raftB.riding && !raftA.riding && !cards?.open) raftB.board(); },
    });
    reg({
      id: 'cnt_tower', x: SPOTS.tower.x, z: SPOTS.tower.z, r: 3.0, label: 'Talk to the lifeguard',
      onInteract: () => {
        env.say('“Lovely day. Lovely sea. Do not go in the lovely sea.”', 'Lifeguard Paws');
        env.say('“I am very fast. You would be amazed how fast I am.”', 'Lifeguard Paws');
      },
    });
  }

  // ═══ containment logic ═════════════════════════════════════════════════════
  const EXEMPT = [
    { x: SPOTS.raftA.x, z: SPOTS.raftA.z, r: 7 },   // small: the sun loungers sit
                                                    // just down the shore and the
                                                    // lifeguard still works there
    { x: SPOTS.raftB.x, z: SPOTS.raftB.z, r: 12 },
    { x: SPOTS.cove.x, z: SPOTS.cove.z, r: 12 },
  ];
  function exempt(x, z) { for (const e of EXEMPT) if (Math.hypot(x - e.x, z - e.z) < e.r) return true; return false; }

  /**
   * True when a ferry is genuinely here and genuinely willing. Docked-but-asleep
   * (the ferry system's own gag until you are an honorary citizen) does NOT
   * count: that is exactly when the cats should be shoving you off the pier.
   */
  function ferryAvailable() {
    if (ferryGrace > 0) return true;
    if (ctx.state.ferry) return true;                       // mid-crossing
    const f = ctx.systems.ferry?.state;
    if (!f) return false;                                   // no ferry system at all
    if (f.side !== 'cat') return false;                     // she is on the other island
    return f.phase !== 'idle' || !f.asleep;                 // boarding, or awake and waiting
  }

  function blockChecks(dt) {
    const pl = ctx.systems.player; const p = pl?.position;
    if (!p || pl.locked || pl.onFerry || cards?.open || sleep.on || transit.on) return;
    // WAVE 2: a catapult/canoe/flying machine owns the visitor — no wave of cats
    // sweeping a rider off a vehicle, and no lifeguard "rescuing" a canoe
    if (pl.onVehicle || ctx.state.vehicle) return;
    if (raftA.riding || raftB.riding || lifeguard.busy) return;
    if (ctx.state.island !== 'cat') return;
    if (exempt(p.x, p.z)) return;
    // WAVE 4 (bridge builder): up on the rainbow, or stepping onto its foot at the
    // pier head, the kitties cannot reach him (and must not bar the way onto it)
    const rb = ctx.systems.escape?.routes?.bridge;
    if (rb?.up && (rb.onDeck || Math.hypot(p.x - rb.ends.cat.x, p.z - rb.ends.cat.z) < 6)) return;

    const h = world.height(p.x, p.z);
    // (b) waded out past −0.3 → the lifeguard is on you in seconds.
    //     pl.wading is 0 on a walkable deck, so the pier never counts as swimming
    if (h < -0.3 && pl.wading && lifeguard.ready) { lifeguard.rescue(p.x, p.z); return; }

    // never body-block someone who has a real, awake ferry waiting at the pier
    const nearPier = p.x < 56 && Math.abs(p.z - 22) < 18;
    if (nearPier && ferryAvailable()) return;

    // (a) heading for the sea, or for the far end of the pier → wave of cats
    const d = inlandDir(p.x, p.z);
    const seaward = -(pl.velocity.x * d.x + pl.velocity.z * d.z);
    const onPierEnd = p.x < 37 && Math.abs(p.z - 22) < 9;
    if (wave.ready && seaward > 1.2 && (h < 2.6 || onPierEnd)) { if (wave.trigger(p.x, p.z)) S.waveTriggers++; }
  }

  function updateCurfew(dt) {
    const t = ctx.state.time;
    const isCurfew = (t >= CURFEW_HOUR || t < CURFEW_END);
    const onCat = ctx.state.island === 'cat';
    const night = Math.floor(ctx.state.elapsed / 300);
    // WAVE 2 — TIGER TIME: once the citizens are tigers (20:00–05:30) the lantern
    // watch stands down. You cannot be politely escorted home by six small cats
    // while something with stripes is already carrying you there, and two
    // "we walk you to bed" systems running at once is one too many.
    const tigers = !!ctx.systems.catCitizens?.isTigerTime?.();
    const riding = !!ctx.systems.player?.onVehicle || !!ctx.state.vehicle;
    if (tigers || riding) {
      if (curfew.active) curfew.end();
      if (tigers && isCurfew && onCat && S.arrived && !S.standDownSaid && !riding) {
        S.standDownSaid = true;
        env.toast('The lantern cats have gone indoors. Something larger has the night shift.');
      }
      return;
    }
    if (isCurfew && onCat && S.arrived && !sleep.on && !transit.on) {
      const p = ctx.systems.player?.position;
      if (!curfew.active && p) { curfew.begin(p.x, p.z); S.curfewNight = night; }
    } else if (curfew.active) curfew.end();
  }

  // ═══ wiring ════════════════════════════════════════════════════════════════
  ctx.events.on('ferry:arrive', (e) => {
    const to = (e && typeof e === 'object') ? (e.to ?? e.island ?? e.dock) : e;
    ferryGrace = 10;
    const here = (to === 'cat' || (to === undefined && ctx.state.island === 'cat'));
    if (here) onArrive();
    // coming home by ferry after an escape closes the round trip (the cats count
    // the return, not the escape — see onReturned)
    if (here && away.on && away.sawCandy) onReturned();
  });
  ctx.events.on('ferry:board', () => { ferryGrace = 25; });
  ctx.events.on('day', () => {
    S.standDownSaid = false;
    if (S.arrived && !S.posterUpdated && ctx.state.elapsed > 40) updatePosters();
  });

  // ── wave 2: the escape routes ──────────────────────────────────────────────
  ctx.events.on('escape:start', onEscapeStart);
  ctx.events.on('escape:success', onEscapeSuccess);

  ctx.events.on('world:ready', () => {
    cards = createCards(ctx);
    registerInteractions();
    useOwnShake = typeof ctx.systems.camera?.shake !== 'function';
    if (!useOwnShake) return;
  });
  // camera shake fallback (camera.js has no shake of its own)
  ctx.events.on('camera:update', (cam) => {
    if (!useOwnShake || shake.t <= 0) return;
    const k = shake.a * (shake.t / shake.d) * 0.55;
    const e = ctx.state.elapsed;
    cam.position.x += Math.sin(e * 47.3) * k;
    cam.position.y += Math.sin(e * 61.7 + 1.3) * k * 0.8;
    cam.position.z += Math.cos(e * 53.1 + 2.1) * k;
  });

  // ═══ update ════════════════════════════════════════════════════════════════
  function update(dt, ctx) {
    const e = ctx.state.elapsed;
    if (ferryGrace > 0) ferryGrace -= dt;

    // lazily build the UI if world:ready never fired (defensive)
    if (!cards && ctx.uiRoot && ctx.systems.ui) { cards = createCards(ctx); registerInteractions(); }

    // arrival by any means
    if (!S.arrived && ctx.state.island === 'cat') onArrive();
    if (bannerDelay > 0 && (bannerDelay -= dt) <= 0) ctx.systems.ui?.banner('Cat Island', 'Welcome! Stay as long as you like. Longer.', 4.2);

    // dialogue queue (ui.say overwrites itself, so we pace the lines)
    if (sayTimer > 0) sayTimer -= dt;
    if (sayTimer <= 0 && sayQueue.length) {
      const l = sayQueue.shift();
      ctx.systems.ui?.say(l.text, { speaker: l.speaker });
      sayTimer = l.duration ?? Math.min(6.5, 2.4 + l.text.length * 0.045);
    }

    // player tumble (own animation; camera.shake does not exist upstream)
    const g = ctx.systems.player?.group;
    if (g) {
      if (tumble.t > 0) {
        tumble.t -= dt;
        const k = clamp(tumble.t / tumble.d, 0, 1);
        g.rotation.x = Math.sin(e * 26) * 1.25 * k;
        g.rotation.z = Math.cos(e * 21 + 1) * 0.9 * k;
      } else if (g.rotation.x || g.rotation.z) {
        g.rotation.x = damp(g.rotation.x, 0, 9, dt); g.rotation.z = damp(g.rotation.z, 0, 9, dt);
        if (Math.abs(g.rotation.x) < 0.002 && Math.abs(g.rotation.z) < 0.002) { g.rotation.x = 0; g.rotation.z = 0; }
      }
    }
    if (shake.t > 0) { shake.t -= dt; if (shake.t <= 0) shake.a = 0; }

    // wave 2: the deferred 'For now.' card, and the round trip we are waiting on
    if (cardCheck && (cardCheck.t -= dt) <= 0) { maybeForNowCard(cardCheck.route); cardCheck = null; }
    if (away.on) {
      away.t += dt;
      if (ctx.state.island === 'candy') away.sawCandy = true;
      else if (away.sawCandy && away.t > 1.5 && ctx.state.island === 'cat'
               && !ctx.systems.player?.onFerry && !ctx.state.ferry
               // WAVE 4 r5 (bridge builder): not while he is still aboard the
               // blimp or the biplane over Cat Island; the return (and the
               // Mayor, and the rainbow) wait until he steps off
               && !ctx.systems.player?.onVehicle && !ctx.state.vehicle) onReturned();
    }

    // actors
    greeters.update(dt, ctx);
    noticers.update(dt, ctx);
    wave.update(dt, ctx);
    lifeguard.update(dt, ctx);
    raftA.update(dt, ctx);
    raftB.update(dt, ctx);
    paw.update(dt, ctx);
    curfew.update(dt, ctx);
    residents.update(dt, ctx);

    updateCurfew(dt);
    updateSleep(dt);
    updateTransit(dt);
    blockChecks(dt);
    cards?.update(dt);

    if (pendingMedal && residents.mayorArrived && !cards?.open) giveMedal();

    // carried fish bobs at your hip
    if (fish.visible) {
      const p = ctx.systems.player?.position;
      if (p) {
        const f = ctx.systems.player.facing;
        fish.position.set(p.x + Math.cos(f) * 0.55, p.y + 1.0 + Math.sin(e * 3) * 0.04, p.z - Math.sin(f) * 0.55);
        fish.rotation.set(0.25, f + 1.3, Math.sin(e * 2.4) * 0.18);
      }
    }

    // The EXIT signs turn slowly on their posts — a wide, lazy, three-quarter
    // sweep either side of the middle of the square. Big enough to read as
    // MOTION at the game camera, slow enough that they still look confident,
    // and never once far enough round to point out of town.
    for (let i = 0; i < scenery.arrows.length; i++) {
      const a = scenery.arrowSpots[i], m = scenery.arrows[i];
      m.position.y = a.y + Math.sin(e * 1.1 + a.phase) * 0.05;
      m.rotation.set(
        Math.sin(e * 0.8 + a.phase) * 0.04,
        a.base + Math.sin(e * a.rate + a.phase) * 0.62 + Math.sin(e * a.rate * 2.7 + a.phase) * 0.07,
        Math.sin(e * 1.5 + a.phase) * 0.03,
      );
    }

    // night: office window, lamps and the tunnel strip come up
    const dark = 1 - clamp(ctx.state.daylight ?? 1, 0, 1);
    if (scenery.glow) scenery.glow.material.emissiveIntensity = lerp(0.05, 1.5, dark);
    if (scenery.glowCold) scenery.glowCold.material.emissiveIntensity = lerp(0.08, 1.9, dark);
    // the tunnel lantern burns day and night — it is the only reason the mouth
    // reads as a passage instead of a black rectangle at noon
    if (scenery.glowWarm) scenery.glowWarm.material.emissiveIntensity = lerp(1.15, 1.75, dark);
    lanterns.material.emissiveIntensity = lerp(0.15, 3.2, dark);
  }

  return {
    update,
    get escapeAttempts() { return S.escapeAttempts; },
    get escapesMade() { return S.escapesMade; },
    get returns() { return S.returns; },
    get state() {
      return {
        ...S,
        away: away.on ? away.route : null,
        tigerTime: !!ctx.systems.catCitizens?.isTigerTime?.(),
        curfewActive: curfew.active,
        noticersActive: noticers.active,
        waveActive: wave.active,
        lifeguardBusy: lifeguard.busy,
        raftA: raftA.state, raftB: raftB.state,
        pawActive: paw.active,
        objectivePhase: S.phase,
      };
    },
    // handy for other systems / debugging
    spots: SPOTS,
    triggerWave: (x, z) => wave.trigger(x ?? ctx.systems.player.position.x, z ?? ctx.systems.player.position.z),
    sceneryTris: scenery.tris,
  };
}
