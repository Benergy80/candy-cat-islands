// ─────────────────────────────────────────────────────────────────────────────
// THE CAST — every cat on Cat Island, named, dressed, scheduled and scripted.
//
// pattern: tabby | grey | black | white | calico | tuxedo | siamese | ginger
// build:   normal | chonky | buff        sched: see brain.js SCHEDULES
// tags:    napper, promenade, sunbather, sprinter, nightwatch, curious, gymgoer
// kitten:  1 = big head, small body (the rig rebalances the proportions)
// Social staging (who stands with whom, and where) lives in citizens/staging.js
// lines:   said in order, cycling. `night` lines are mixed in after dark,
//          `after` lines unlock once a story flag is set. `sets` fires a flag.
// ─────────────────────────────────────────────────────────────────────────────
const GREEN = 0xb6de4a, AMBER = 0xf2b33c, BLUE = 0x74c9ea, JADE = 0x86d6ae, COPPER = 0xe08a4a;
const NAVY = 0x1d3557, TEAL = 0x2a8f8a, RED = 0xc94b3a, MDRED = 0xd52b1e, MDYEL = 0xffc72c;
const CREAM = 0xfaf0dc, GOLD = 0xf2c14e, PLUM = 0x6b4a7a, LIME = 0x8bc95a;

export const CAST = [
  // ── Arrivals Pier ──────────────────────────────────────────────────────────
  {
    key: 'bartholomew', name: 'Clerk Bartholomew', role: 'Ferry Clerk', home: [45, 25.5], face: 3.6,
    pattern: 'tuxedo', build: 'normal', size: 1.0, eye: AMBER, sched: 'clerk',
    clothes: { cap: NAVY, tie: RED }, acc: 'clipboard', tags: { napper: 1 }, mood: 'officially cheerful',
    sets: 'met_clerk',
    lines: [
      'Welcome to Cat Island! Your return ticket is… being processed.',
      'The ferry? Oh it runs. Just not… away.',
      'Everyone asks about the schedule. Nobody asks about the destination.',
      "I've stamped nine hundred and four arrivals. The departures column is a bit lonely.",
      "Please enjoy your stay. That's not a suggestion, it's the town motto.",
    ],
    night: ['The last boat left at six. And at five. And at four. All of them came back.'],
    after: { knows_ferry_truth: ["You've been talking to Salty Rick, haven't you. Little gossip."] },
  },

  // ── Welcome Plaza: the gossip bench ────────────────────────────────────────
  {
    key: 'pemberpurr', name: 'Mrs. Pemberpurr', role: 'Gossip Laureate', home: [72.4, 21.6], face: -0.873,
    pattern: 'calico', build: 'chonky', size: 1.02, eye: AMBER, sched: 'gossip', head: 'round',
    clothes: { sunHat: 0xf6e2b0 }, acc: 'umbrella', accColor: 0xe98aa8, tags: { napper: 1, promenade: 1 },
    mood: 'delighted', sets: 'heard_gossip',
    lines: [
      'Oh! A human! Doris — DORIS — the human is HERE, act natural—',
      "We're not gossiping, dear. We're maintaining an oral archive.",
      'Winnifred says the Mayor\'s hat is getting taller. Winnifred measures.',
      'The last visitor was lovely. Settled right in. Third house from the top. Still there.',
    ],
    night: ['We sit out later than we should. Something about the dark makes us honest.'],
  },
  {
    key: 'doris', name: 'Doris Clawson', role: 'Gossip', home: [72.9, 22.2], face: -0.873,
    pattern: 'grey', build: 'normal', size: 0.98, eye: GREEN, sched: 'gossip',
    clothes: { glasses: 0x2a2a32 }, tags: { napper: 1, promenade: 1 }, mood: 'relishing it',
    lines: [
      'I heard Ms. Velvet turned the Sergeant down. Again. Delicious.',
      'I heard the lighthouse keeper talks to the water. I heard the water answers.',
      "I don't gossip, dear. I simply remember loudly.",
      'You came on the ferry? How brave. How very one-way of you.',
    ],
  },
  {
    key: 'winnifred', name: 'Winnifred Tufts', role: 'Hat Statistician', home: [73.5, 22.9], face: -0.873,
    pattern: 'white', build: 'chonky', size: 1.04, eye: BLUE, sched: 'gossip',
    clothes: { sunHat: 0xd9e8f0 }, tags: { napper: 1, promenade: 1 }, mood: 'precise',
    lines: [
      'Eleven centimetres. The hat. Eleven. I have a chart.',
      "Bramble's going to run against him. Bramble has been going to run since the war.",
      'What war? Lovely weather, isn\'t it.',
      'I knit the arrival scarves with Skein. Yours is already halfway done.',
    ],
    after: {
      arrived_cat: ['You came off the ferry at ten past. I logged it. We all log it.'],
      met_mayor: ['Twelve centimetres now. THE HAT. It grows when he wins.'],
    },
  },

  // ── Main Street ────────────────────────────────────────────────────────────
  {
    key: 'mocha', name: 'Barista Mocha', role: 'Purrbucks Barista', home: [112, -4], face: 2.4,
    pattern: 'calico', build: 'normal', size: 1.0, eye: AMBER, sched: 'shopkeep', head: 'bigear',
    clothes: { visor: 0x2f6f52, apron: 0x2f6f52 }, acc: 'cup', accColor: 0xf0ece2,
    tags: { napper: 1, promenade: 1 }, mood: 'caffeinated', sets: 'met_mocha',
    lines: [
      "Welcome to Purrbucks! Can I get a name for the cup? We'll be using it for a while.",
      "Small, medium, or 'you live here now'?",
      'Oat milk, soy milk, or the milk. We recommend the milk.',
      "I know everyone's order on this island. Everyone's. Forever.",
      'Postcat Dash comes in eleven times a day. He does not drink coffee.',
    ],
    night: ["We never actually close. I just dim the lights and keep pouring."],
    after: {
      met_mittens: ['Officer Mittens takes it black, no sugar, by the pier. Every night. Same cup. Same stare.'],
      knows_lighthouse: ['Lumen orders a large before every climb. Says the tower gets chatty.'],
    },
  },
  {
    key: 'brioche', name: 'Baker Brioche', role: 'Baker', home: [123.5, 3.6], face: 3.2,
    pattern: 'ginger', build: 'chonky', size: 1.05, eye: COPPER, sched: 'shopkeep',
    clothes: { cap: 0xfbf6ea, apron: 0xfbf6ea }, tags: { napper: 1, promenade: 1 }, mood: 'floury',
    lines: [
      'Fish bread. Fish croissant. Fish éclair. We have a theme.',
      'I bake fresh every morning. Same loaves. Same morning. Lovely.',
      'Mocha says my sourdough tastes like the harbour. Mocha is correct and cruel.',
      'Take a bun for the road. There is no road. Take two.',
    ],
  },
  {
    key: 'persimmon', name: 'Shopkeep Persimmon', role: 'Souvenirs', home: [124.5, -3.6], face: 2.9,
    pattern: 'ginger', build: 'normal', size: 1.0, eye: GREEN, sched: 'shopkeep',
    clothes: { apron: TEAL, glasses: 0x2a2a32 }, tags: { napper: 1 }, mood: 'mercantile',
    lines: [
      'Souvenirs! Postcards! The postcards don\'t post, but they\'re very pretty.',
      "Everything's half price for new arrivals. You'll be an old arrival soon enough.",
      'We sell suitcases. Nobody\'s bought one in years. They photograph beautifully.',
      'Snow globe of the island? Shake it. See? Nothing gets out.',
    ],
  },
  {
    key: 'pip', name: 'Fiddler Pip', role: 'Street Musician', home: [116.5, 2.6], face: 3.4,
    pattern: 'grey', build: 'normal', size: 0.96, eye: JADE, sched: 'musician',
    clothes: { cap: PLUM, collar: 0xc94b3a }, acc: 'fiddle', accColor: 0xc98a52, tags: { promenade: 1 }, mood: 'sunny in a minor key',
    lines: [
      'Every song on this island is in a major key. The Mayor insists.',
      'I wrote a sad one once. It got… discouraged.',
      'I busk for tuna. The tuna is excellent. The freedom situation less so.',
      "Sing along! The chorus goes 'we're so glad you're staying, staying, staying.'",
      'Requests? I know one song. It has four hundred verses.',
    ],
  },
  {
    key: 'velvet', name: 'Ms. Velvet', role: 'Local Celebrity', home: [120.5, 2.4], face: 3.0,
    pattern: 'siamese', build: 'normal', size: 1.01, eye: BLUE, sched: 'wander', head: 'long',
    clothes: { glasses: 0xd8b0c0, collar: 0xc0407a }, tags: { napper: 1, promenade: 1, sunbather: 1 },
    mood: 'unimpressed', lines: [
      "Darling. You're the new one. Everyone's talking. Everyone's always talking.",
      'Sgt. Biceps dropped a dumbbell on his own tail when I walked past. I pretended not to notice.',
      'The Mayor asked me to smile for the arrivals photograph. I charge extra for that.',
      'Nobody leaves, nobody ages, and nobody mentions either. Very restful.',
    ],
    after: {
      met_gym: ['You met the Sergeant. Of course you did. He is very… structural.'],
      heard_gossip: ['The bench ladies have been busy. Whatever they said, halve it. Then believe it.'],
    },
  },
  {
    key: 'pawline', name: 'Dr. Pawline Grey', role: 'Island Physician', home: [114.5, -1.8], face: 2.7,
    pattern: 'grey', build: 'normal', size: 1.0, eye: GREEN, sched: 'shopkeep',
    clothes: { apron: 0xfbf8f0, glasses: 0x2a2a32 }, acc: 'clipboard', tags: { napper: 1 },
    mood: 'clinically upbeat', lines: [
      'You look healthy. Alarmingly healthy. Nobody gets ill here. Nobody gets anything here.',
      'Say aah. Lovely. You have at least sixty good years on this island.',
      'I trained on the mainland. I think. The certificate is old and the ink moved.',
      'Your heart rate spikes when you look at the water. Interesting. Common, actually.',
    ],
  },
  {
    key: 'dash', name: 'Postcat Dash', role: 'Postal Service', home: [108, 1], face: 3.1,
    pattern: 'tabby', build: 'normal', size: 0.97, eye: AMBER, sched: 'postcat',
    clothes: { cap: NAVY, collar: 0x3e6ea8 }, acc: 'briefcase', accColor: 0x3e6ea8, tags: { promenade: 1 },
    mood: 'briskly cheerful', lines: [
      "Mail's in! It's all local. It's ALWAYS all local.",
      "Nothing goes off-island. Not since the postbox got… tired.",
      "Eleven coffees today. I'm not thirsty. I'm in love. Don't tell Mocha.",
      'Letter for you! From the Mayor. It just says "WELCOME" nine times.',
    ],
  },
  {
    key: 'reginald', name: 'Reginald Tabbington', role: 'Commuter', home: [104, 4], face: 3.1,
    pattern: 'grey', build: 'chonky', size: 1.04, eye: AMBER, sched: 'commuter',
    clothes: { tie: 0x8a2b3a }, acc: 'briefcase', accColor: 0x4a3324, tags: { napper: 1, promenade: 1 },
    mood: 'aggressively fine', lines: [
      'Morning! Work! Same desk! Same island! Marvellous!',
      'I commute forty minutes. The office is a nine minute walk. I take the long way. I need the long way.',
      "Someday I'll retire. To… here. Which is where I am. Yes.",
      'Do you have a briefcase? You should get a briefcase. It helps.',
    ],
  },
  {
    key: 'mittens', name: 'Officer Mittens', role: 'Constabulary', home: [100, 6], face: 3.1,
    pattern: 'tuxedo', build: 'normal', size: 1.03, eye: GREEN, sched: 'officer', head: 'flat',
    clothes: { copCap: NAVY, tie: NAVY }, tags: {}, mood: 'watchful', sets: 'met_mittens',
    lines: [
      'Move along. Lovely day. Move along.',
      'Nothing to see at the pier. Especially at night. Especially at the pier.',
      "I'm not following you. I'm walking the same route. Coincidentally. Continuously.",
      'Crime rate: zero. Escape rate: also zero. We are very proud of both.',
    ],
    night: [
      'Evening. Just admiring the water. All night. Every night.',
      "You're a long way from your house. You have a house now. Third from the top.",
    ],
  },

  // ── Meow Donald's ──────────────────────────────────────────────────────────
  {
    key: 'patty', name: 'Manager Patty McFluff', role: "Meow Donald's Manager", home: [126, -21.5], face: 3.4,
    pattern: 'calico', build: 'chonky', size: 1.05, eye: AMBER, sched: 'shopkeep',
    clothes: { cap: MDYEL, apron: MDRED }, acc: 'clipboard', tags: { napper: 1 }, mood: 'managerial',
    lines: [
      "Welcome to Meow Donald's! May I take your order and, eventually, your forwarding address?",
      "Our Happy Meal comes with a toy boat. It doesn't float. Management decision.",
      'Nugget dropped the fries again. Nugget IS the fries at this point.',
      "We're open twenty-four hours. Twenty-four. Every single one of them.",
    ],
  },
  {
    key: 'nugget', name: 'Fry-cat Nugget', role: 'Fry Station', home: [129.2, -25], face: 2.8,
    pattern: 'ginger', build: 'normal', size: 0.95, eye: COPPER, sched: 'work',
    clothes: { cap: MDYEL, apron: MDRED }, tags: { napper: 1 }, mood: 'greasy and content',
    lines: [
      "Fry station is my whole personality. I'm at peace with that.",
      'Patty says I dropped the fries. The fries dropped themselves. I was a bystander.',
      'Do humans eat fish nuggets? We only have the one recipe.',
      'Ketchup gets the drive-thru because Ketchup can smile through anything.',
    ],
  },
  {
    key: 'ketchup', name: 'Fry-cat Ketchup', role: 'Drive-Thru', home: [132.5, -27.5], face: 2.4,
    pattern: 'tabby', build: 'normal', size: 0.96, eye: GREEN, sched: 'work',
    clothes: { cap: MDRED, apron: MDYEL }, tags: {}, mood: 'relentlessly pleasant',
    lines: [
      "Welcome to Meow Donald's, please drive through. There's nowhere to drive to, but please.",
      'Nobody has a car. We built the drive-thru first. It\'s a whole thing.',
      'Order when you\'re ready. Take your time. Take YEARS.',
      'Would you like to make that a stay? I mean a STACK. A stack.',
    ],
    night: ['Graveyard shift. Nothing comes through the window. Something always comes past it.'],
  },

  // ── Purrliament Square ─────────────────────────────────────────────────────
  {
    key: 'mayor', name: 'Mayor Whiskerton', role: 'Mayor (4th term, unopposed)', home: [155.4, 12.6], face: 0.85,
    pattern: 'tabby', build: 'chonky', size: 1.12, eye: AMBER, sched: 'mayor', head: 'round',
    clothes: { topHat: 0x2b2b34, sash: 0xb8431e }, tags: { promenade: 1 }, mood: 'radiant',
    sets: 'met_mayor', lines: [
      'Mayor Whiskerton! Fourth term! Unopposed! Wonderful turnout!',
      "You're going to LOVE it here. Everyone does. Eventually.",
      "Councilcat Bramble says I've never once held an election. Bramble says a lot of things.",
      'Every visitor gets a house, a name in the ledger, and a very long stay.',
      "We removed the word 'leave' from the town charter. Purely for space reasons.",
      'Wave to the nice human, everyone! WAVE.',
    ],
    night: ['A mayor never sleeps. A mayor merely closes one eye at a time.'],
    after: {
      knows_ferry_truth: ["Rick's been talking. Rick swims. Rick is FINE. Rick is absolutely fine."],
      met_gym: ['You met the Sergeant! Magnificent animal. Completely unbribable. We tried.'],
      met_clerk: ['Bartholomew! Finest clerk on the island. Hasn\'t left that pier in thirty years. Can\'t, really.'],
    },
  },
  {
    key: 'bramble', name: 'Councilcat Bramble', role: 'Opposition (perpetual)', home: [152.6, 15.0], face: 2.28,
    pattern: 'grey', build: 'normal', size: 1.02, eye: GREEN, sched: 'pace', head: 'long',
    clothes: { glasses: 0x2a2a32, tie: TEAL }, acc: 'clipboard', tags: { napper: 1, promenade: 1 },
    mood: 'thwarted', lines: [
      'I intend to run against Whiskerton. I have intended this for eleven years.',
      'Ask him where the ferry logbook is. Go on. Watch his tail.',
      "I'm not saying the Mayor is hiding something. I'm saying his hat is very tall.",
      'Our visitor retention rate is one hundred percent. That is apparently GOOD.',
    ],
  },
  {
    key: 'quillby', name: 'Librarian Quillby', role: 'Archivist', home: [158.2, 11.4], face: -0.35,
    pattern: 'black', build: 'normal', size: 1.0, eye: GOLD, sched: 'shopkeep', head: 'bigear',
    clothes: { glasses: 0x2a2a32, tie: PLUM }, acc: 'clipboard', accColor: 0x6b4a7a,
    tags: { napper: 1 }, mood: 'hushed', sets: 'knows_maps', lines: [
      'Shh. The archive is sleeping. It does that when you ask about departures.',
      'Every map of this island is beautifully drawn. None of them show the sea.',
      'We have one book about boats. It is shelved under fiction.',
      "Borrow anything you like. Just bring it back. You'll be here.",
    ],
    after: {
      arrived_cat: ['I have already filed you. Shelf C. Visitors, Permanent.'],
      knows_boats: ['Gus told you about the Captain. The Captain has his own shelf. It is empty.'],
    },
  },

  // ── Muscle Beach Gym ───────────────────────────────────────────────────────
  {
    key: 'biceps', name: 'Sgt. Biceps', role: 'Gym Sergeant', home: [195.2, -13.6], face: 0.95,
    pattern: 'tabby', build: 'buff', size: 1.44, eye: AMBER, sched: 'gym', head: 'flat',
    clothes: { tank: 0xffd23a }, acc: 'dumbbell', tags: { sprinter: 1, gymgoer: 1 },
    mood: 'ENORMOUS', sets: 'met_gym', lines: [
      'WELCOME TO MUSCLE BEACH. You look like you skip leg day. I forgive you.',
      'Do you even LOAF, bro?',
      "Chad's protein is warm milk. I have SEEN the tin. I say NOTHING.",
      'Ms. Velvet walked past once. I dropped a dumbbell on my own tail. Worth it.',
      "You can't swim off the island, but you CAN swim AT the island. Cardio!",
      'FORM. IS. EVERYTHING. Also napping. Napping is everything too.',
    ],
    night: ['Night lift. Nobody watches the beach at night except the ones who watch the beach at night.'],
    after: {
      met_mayor: ["The Mayor asked me to 'discourage' swimmers. I said I'd think about it. I'm still thinking. FLEX."],
      knows_ferry_truth: ['Rick swam for it? Respect. Terrible technique. Enormous respect.'],
    },
  },
  {
    key: 'chad', name: 'Chad Furrison', role: 'Gym Bro', home: [202.2, -13.6], face: 0.85,
    pattern: 'ginger', build: 'buff', size: 1.34, eye: GREEN, sched: 'gym',
    clothes: { tank: 0x3aa8ff }, acc: 'dumbbell', tags: { sprinter: 1, gymgoer: 1 },
    mood: 'pumped', lines: [
      'Bro. BRO. My protein is imported. From the harbour. It is fish.',
      "Sarge says my form is a cry for help. That's jealousy with extra syllables.",
      "One more set. One more set. That's been my whole decade.",
      'Spot me? You? Sure. Stand there. Radiate encouragement.',
    ],
  },
  {
    key: 'brick', name: "Brick 'Quads' McPaw", role: 'Gym Bro', home: [205.6, -15.0], face: 0.60,
    pattern: 'grey', build: 'buff', size: 1.38, eye: AMBER, sched: 'gym',
    clothes: { tank: 0xff5f7a }, acc: 'dumbbell', tags: { sprinter: 1, gymgoer: 1 }, mood: 'load-bearing',
    lines: [
      'Legs are just tall arms, bro.',
      'I spot Chad. Chad spots me. Nobody spots Sarge. Sarge is unspottable.',
      'I lifted a fishing boat once. Small boat. Big moment.',
      'They asked me to help push the ferry off. I said no. Everyone got very quiet.',
    ],
  },
  {
    key: 'tank', name: 'Tank Meowsley', role: 'Gym Bro', home: [191.6, -14.2], face: 0.55,
    pattern: 'white', build: 'buff', size: 1.36, eye: GOLD, sched: 'gym',
    clothes: { tank: 0x2fc96a }, acc: 'dumbbell', tags: { sprinter: 1, gymgoer: 1 }, mood: 'swole and serene',
    lines: [
      "I don't chase mice. Mice chase ME. In my dreams. Constantly.",
      'Sarge says the beach sprint builds character. I had character. Now I have shins.',
      'Tiny Gerald benched the bar. Just the bar. We APPLAUDED.',
      'Seven a.m. sprint. Every morning. Same beach. Same distance. Same beach.',
    ],
  },
  {
    key: 'gerald', name: 'Tiny Gerald', role: 'Aspiring Gym Bro', home: [198.6, -12.8], face: 0.70,
    pattern: 'grey', build: 'normal', size: 0.80, eye: LIME, sched: 'gym',
    clothes: { tank: 0xffa63a }, acc: 'dumbbell', tags: { sprinter: 1, gymgoer: 1, curious: 1 },
    mood: 'bulking', lines: [
      "I'm on a bulk. I've been on a bulk since I was a kitten.",
      "Sarge says I've got the biggest heart in the gym. I wanted him to say 'lats'.",
      "One day I'll lift the ferry. Then we'll see who's leaving.",
      'You look strong. For a tall soft cat with no tail. No offence.',
    ],
    after: {
      met_gym: ['Sarge TALKED to you? What did he say? Did he mention my lats? He mentioned my lats, didn\'t he.'],
    },
  },

  // ── Fish Harbor ────────────────────────────────────────────────────────────
  {
    key: 'gus', name: 'Fishmonger Gus', role: 'Fishmonger', home: [99, 56], face: 0.3,
    pattern: 'grey', build: 'chonky', size: 1.06, eye: AMBER, sched: 'shopkeep', head: 'long',
    clothes: { sunHat: 0xe8d8a8, apron: 0x5f93b8 }, acc: 'fish', tags: { napper: 1 },
    mood: 'salted', sets: 'knows_boats', lines: [
      'Fresh off the boats! The boats that go out and come back. Always back.',
      'Best cod on the island. Only cod on the island. Same thing really.',
      'Captain took a boat past the buoys once. Boat came back. Captain came back. Something didn\'t.',
      'Buy a fish. Name it. Everything gets a name here. Everything stays.',
    ],
  },
  {
    key: 'nets', name: 'Harbour Cat Nets', role: 'Net Mender', home: [102, 59.5], face: 2.9,
    pattern: 'tuxedo', build: 'normal', size: 0.99, eye: GREEN, sched: 'work',
    clothes: { sunHat: 0xd8c898 }, tags: { napper: 1, sunbather: 1 }, mood: 'tangled',
    lines: [
      "Mind the nets. They're not for fish. Well. Not only.",
      'Tide comes in, tide goes out. Ferry comes in. Ferry… comes in.',
      'Gus says I talk too much. Gus talks to a cod.',
      'I mend the same three holes every day. They reopen. I have theories.',
    ],
  },
  {
    key: 'flopsworth', name: 'Lord Flopsworth', role: 'Professional Sunbather', home: [96.5, 53.5], face: 0.8,
    pattern: 'white', build: 'chonky', size: 1.08, eye: BLUE, sched: 'wander', head: 'round',
    clothes: { collar: 0x7a2b4a }, tags: { napper: 1, sunbather: 1 }, mood: 'horizontal',
    lines: [
      'One does not sunbathe. One holds a position against the cold.',
      'I have not stood up since the spring. I regret nothing.',
      'You may step around me. Everyone does. It is a small island.',
    ],
  },

  // ── The Watchtower ─────────────────────────────────────────────────────────
  {
    key: 'lumen', name: 'Keeper Lumen', role: 'Lighthouse Keeper', home: [176, 44], face: 1.4,
    pattern: 'white', build: 'normal', size: 1.02, eye: 0xdce85a, sched: 'keeper',
    clothes: { cap: 0x2f4858 }, acc: 'lantern', tags: {}, mood: 'quietly honest',
    sets: 'knows_lighthouse', lines: [
      "The light isn't for ships coming in. Think about it.",
      'I climb at dusk, every dusk. The tower likes company.',
      'Some nights I sweep the beam over the water and something out there sweeps back.',
      'The Mayor calls it a navigation aid. I call it a fence you can see from far away.',
    ],
    night: ['Stay inside the beam and nothing happens. That is the whole arrangement.'],
  },

  // ── Whisker Heights ────────────────────────────────────────────────────────
  {
    key: 'sunny', name: 'Sunny Beans', role: 'Rooftop Sunbather', home: [174.5, 44.5], face: 2.2,
    pattern: 'ginger', build: 'normal', size: 1.0, eye: COPPER, sched: 'wander',
    tags: { napper: 1, sunbather: 1 }, mood: 'warm', clothes: { collar: 0x3aa8ff },
    lines: [
      'Noon is the law round here. Everything stops. Everything warms.',
      'They gave me a windowsill and a lifetime. Generous, when you think about it.',
      'Don\'t think about it.',
    ],
  },
  {
    key: 'marmalade', name: 'Marmalade Puddle', role: 'Puddle', home: [181, 50.5], face: 4.2,
    pattern: 'tabby', build: 'chonky', size: 1.03, eye: AMBER, sched: 'wander',
    tags: { napper: 1, sunbather: 1 }, mood: 'molten', lines: [
      'I am a puddle. I have always been a puddle. Please step around me.',
      'Movement is for cats with somewhere to be.',
      'There is nowhere to be. Isn\'t that relaxing? Say yes.',
    ],
  },
  {
    key: 'skein', name: 'Auntie Skein', role: 'Knitter of Arrival Scarves', home: [186.5, -61], face: 0.9,
    pattern: 'calico', build: 'chonky', size: 1.06, eye: JADE, sched: 'wander',
    clothes: { glasses: 0x2a2a32, apron: 0xc47aa0 }, tags: { napper: 1 }, mood: 'grandmotherly',
    lines: [
      'Sit. Have some yarn. Everyone ends up here eventually, dear.',
      "I've knitted a scarf for every arrival since I was a kitten. You're number three hundred and four.",
      "No, I've never needed to knit a goodbye present. Isn't that nice?",
      'Yarn Hill is all wound wool underneath. Dig anywhere. Don\'t dig anywhere.',
    ],
  },

  // ── Catnip Commons ─────────────────────────────────────────────────────────
  {
    key: 'fennel', name: 'Gardener Fennel', role: 'Parks & Catnip', home: [137, -54.5], face: 2.4,
    pattern: 'tabby', build: 'normal', size: 1.0, eye: LIME, sched: 'work',
    clothes: { sunHat: 0xd8c898, apron: 0x5f9a3a }, tags: { napper: 1 }, mood: 'earthy',
    sets: 'knows_catnip', lines: [
      "Catnip's coming in strong. Keeps everyone agreeable. That's the point.",
      'I plant it round the edges. Thickest near the beaches. Purely decorative.',
      'The kittens roll in it and forget what they were asking. Very convenient.',
      'Mayor\'s orders: no bare ground within fifty paces of the water.',
    ],
  },
  {
    key: 'biscuit', name: 'Biscuit', role: 'Kitten', home: [139, -57], face: 1.8,
    pattern: 'ginger', build: 'normal', size: 0.64, kitten: 1, eye: COPPER, sched: 'kitten',
    clothes: { collar: 0xffc72c }, tags: { napper: 1, curious: 1 }, mood: 'feral joy', lines: [
      'I\'m gonna be BUFF like Sergeant Biceps! I can lift a leaf!',
      'Are you a big hairless cat? Mum says don\'t ask. I\'m asking.',
      'Watch this! Watch! …I fell over. Watch again!',
    ],
  },
  {
    key: 'pickle', name: 'Pickle', role: 'Kitten', home: [142, -59], face: 4.4,
    pattern: 'grey', build: 'normal', size: 0.62, kitten: 1, eye: GREEN, sched: 'kitten',
    tags: { napper: 1, curious: 1 }, mood: 'chaotic', lines: [
      "Tag! You're it! You're it FOREVER!",
      "Grown-ups say 'eventually' a lot. What's eventually?",
      'Tuna says you came on the boat. Boats are pretend. Everyone knows that.',
    ],
  },
  {
    key: 'tuna', name: 'Tuna', role: 'Kitten', home: [143.5, -55.5], face: 3.5,
    pattern: 'tabby', build: 'normal', size: 0.66, kitten: 1, eye: AMBER, sched: 'kitten',
    clothes: { collar: 0x2a8f8a }, tags: { napper: 1, curious: 1 }, mood: 'blissfully incurious', lines: [
      "I'm not allowed past the yellow flowers. Nobody says why. I like not knowing!",
      'Wanna see me loaf? I\'m the best loafer in my year.',
      'When I grow up I\'m gonna stay RIGHT HERE. That\'s the plan everybody has!',
    ],
  },
  {
    key: 'mochi', name: 'Mochi', role: 'Kitten', home: [137.5, -60], face: 0.6,
    pattern: 'white', build: 'normal', size: 0.63, kitten: 1, eye: BLUE, sched: 'kitten',
    tags: { napper: 1, curious: 1 }, mood: 'earnest', lines: [
      'Did you come on the boat? Can I come on the boat?',
      '…why is everyone looking at me.',
      'Auntie Skein says asking about boats makes the grown-ups sad. Are you sad?',
    ],
    after: {
      knows_ferry_truth: ['The beach man told you the thing. Now YOUR ears go flat too. I noticed.'],
    },
  },
  {
    key: 'jogger', name: 'Sprint Whiskerby', role: 'Jogger', home: [130, -2], face: 3.1,
    pattern: 'tabby', build: 'normal', size: 1.0, eye: LIME, sched: 'jog',
    clothes: { tank: 0xff7a3a }, tags: { sprinter: 1 }, mood: 'never stopping',
    lines: [
      "Morning! Can't stop! Never stop! That's the trick!",
      'Ten laps of Main Street. Same distance as swimming to the mainland. I checked. I CHECKED.',
      'If you keep moving they can\'t fit you for a house.',
      'Twelve years of laps. Legs of a god. Still on the island.',
    ],
  },

  // ── Not-An-Exit Beach ──────────────────────────────────────────────────────
  {
    key: 'rick', name: 'Salty Rick', role: 'Beachcomber', home: [226.5, -7], face: 1.6,
    pattern: 'grey', build: 'normal', size: 1.01, eye: 0xc8d84a, sched: 'beach',
    clothes: { sunHat: 0xd8c088 }, acc: 'umbrella', accColor: 0x3a6ea5, tags: {},
    mood: 'unwell about it', sets: 'knows_ferry_truth', lines: [
      'They call it Not-An-Exit Beach. Guess why. Go on. GUESS.',
      'I swam for it. Got two hundred metres. Then the water went… polite. Turned me round.',
      'Look at the lighthouse. Now look where the beam points. Not out. In.',
      "You didn't hear it from me. You heard it from the sea, and the sea's a liar.",
      'Nice cats. Lovely cats. Count the boats, though. Just count them.',
    ],
    night: ['At night you can hear the ferry engine. There is no ferry at night.'],
    after: {
      knows_lighthouse: ['Lumen told you about the beam? Good cat. Honest cat. Won\'t last.'],
      met_watch: ['You\'ve seen the sitters. Count them tomorrow night. There\'ll be one more.'],
    },
  },

  // ── Under the Quay ─────────────────────────────────────────────────────────
  // Rusty takes candy and gives directions. His actual dialogue is in
  // citizens/rusty.js — these are the lines he falls back to.
  {
    key: 'rusty', name: 'Rusty', role: 'Smuggler (one eye, no boat)', home: [93.0, 44.5], face: 0.60,
    pattern: 'tabby', build: 'normal', size: 0.97, eye: AMBER, sched: 'rusty',
    clothes: { collar: 0x3e6ea8 }, eyepatch: 1, noTiger: 1, fixed: 1,
    tags: {}, mood: 'honest, which is illegal here', sets: 'met_rusty',
    lines: [
      'Down here. Mind the boards, they know your weight already.',
      "I'm not a citizen, I'm a resident. There's a difference and it's mostly the eye.",
      'Everything I know costs candy. Everything I feel is free and not worth having.',
    ],
    night: ["I don't turn. Long story. Bad deal. Lovely stripes on them though, isn't it."],
  },

  // ── The night watch ────────────────────────────────────────────────────────
  {
    key: 'silas', name: 'Silas Nine', role: 'Night Watch', home: [110, -6], face: 3.14,
    pattern: 'black', build: 'normal', size: 1.04, eye: GOLD, sched: 'watch',
    acc: 'lantern', tags: { nightwatch: 1 }, mood: 'counting', sets: 'met_watch', lines: [
      "Don't mind me. I'm just counting.",
      'Nine what? Nine lives, nine years, nine of us. Take your pick.',
      'You walk very quickly for someone with nowhere to go.',
    ],
    night: ['Three hundred and four. That includes you now. Sleep well.'],
  },
  {
    key: 'umbra', name: 'Mrs. Umbra', role: 'Night Watch', home: [86, 16], face: 3.9,
    pattern: 'black', build: 'chonky', size: 1.03, eye: AMBER, sched: 'watch',
    tags: { nightwatch: 1 }, mood: 'maternal and wrong', lines: [
      'Go home. Not your home. A home. Pick one, they\'re all yours now.',
      'I sat with the last visitor too. Lovely conversationalist. Right to the end of it.',
      "It's late. It's always late somewhere on this island.",
    ],
  },
  {
    key: 'oldtom', name: 'Old Tom Midnight', role: 'Night Watch', home: [146, 12], face: 3.4,
    pattern: 'grey', build: 'chonky', size: 1.07, eye: 0xf2e04a, sched: 'watch', head: 'flat',
    tags: { nightwatch: 1 }, mood: 'patient', lines: [
      'I watched the last one too. Right up until he stopped needing watching.',
      'Thirty years on this bench. The bench came after me.',
      'Sit. No? Fine. I have time. I have all of it.',
    ],
  },
  {
    key: 'agatha', name: 'Pale Agatha', role: 'Night Watch', home: [122, -14], face: 2.2,
    pattern: 'white', build: 'normal', size: 1.02, eye: 0xbfe8f2, sched: 'watch',
    acc: 'lantern', tags: { nightwatch: 1 }, mood: 'lullaby', lines: [
      "It isn't a curfew. It's a lullaby with an audience.",
      'Your eyes don\'t shine. How do you see us coming?',
      'We only sit. Sitting has never hurt anyone.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// THE CROWD — twenty-three background citizens.
//
// Purrliament Square is the biggest paved space on the island and it was empty:
// a mayor, a councilcat, a clerk and two cats on a bench, adrift on eighteen
// metres of flagstone. A town needs extras. These share the same instanced rig
// (so they cost NO extra draw calls), carry a lean build (three tail segments,
// no whiskers or fangs), and have exactly one joke each.
//
// They do NOT turn into tigers. At curfew they go indoors — which is both a
// triangle saving and the correct behaviour: the reason Main Street is empty at
// 22:00 is that everybody who could has locked the door.
//
// tuple: key, name, role, [x,z], face, pattern, build, size, eye, head, clothes, line(s)
// ─────────────────────────────────────────────────────────────────────────────
const CROWD = [
  // — the queue up the Purrliament steps (Licences, Permits & Regrets) —
  ['bobbin', 'Bobbin', 'In the Queue', [158.6, 5.2], 2.4, 'tabby', 'normal', 0.99, GREEN, 'normal', { collar: 0x6aa8d8 },
    ["I'm renewing my licence. It expired. So did the cat in front of me."]],
  ['tilly', 'Tilly Sixpence', 'In the Queue', [157.3, 4.0], 2.4, 'calico', 'normal', 0.97, AMBER, 'bigear', { sunHat: 0xf2d9a8 },
    ['Form 9. Application to Leave. It has one box and the box is painted on.']],
  ['barnaby', 'Barnaby Tufts', 'In the Queue', [156.0, 2.7], 2.4, 'grey', 'chonky', 1.05, AMBER, 'flat', { tie: 0x8a2b3a },
    ["Forty years in this queue. I've made friends. I've buried two of them."]],
  ['oats', 'Oats', 'In the Queue', [154.9, 1.3], 2.4, 'ginger', 'normal', 0.95, COPPER, 'normal', { cap: 0x4a7a5a },
    ['Do you have an appointment? Nobody has an appointment. That IS the appointment.']],
  ['maribel', 'Maribel Cloud', 'In the Queue', [153.8, -0.2], 2.4, 'white', 'normal', 1.0, BLUE, 'round', { glasses: 0x2a2a32 },
    ['I only came in to ask a question. That was a season ago. Lovely steps though.']],
  ['hugo', 'Hugo Front-of-Queue', 'Nearly There', [152.6, -1.6], 3.1, 'tuxedo', 'normal', 1.02, GOLD, 'long', { tie: NAVY },
    ["I'm next. I've been next since March. Being next is a whole career."]],

  // — the knot arguing about the statue —
  ['clementine', 'Clementine Fig', 'Statue Enthusiast', [157.0, 15.1], 0, 'calico', 'normal', 1.0, JADE, 'round', { collar: 0xc0407a },
    ['That paw is pointing AT something. Nobody will tell me what.']],
  ['dexter', 'Dexter Boot', 'Statue Sceptic', [157.2, 10.3], 0, 'black', 'normal', 1.01, GOLD, 'long', { tie: TEAL },
    ["It's a monument to Our Beloved Guests. Plural. We've only ever had the one at a time."]],
  ['peony', 'Peony', 'Pigeon Correspondent', [152.9, 7.6], 0, 'siamese', 'normal', 0.98, BLUE, 'bigear', { collar: 0x8bc95a },
    ['There used to be a little bronze suitcase by his feet. There is not now.']],
  ['wallace', 'Wallace Grump', 'Statue Sceptic', [147.2, 10.6], 0, 'grey', 'chonky', 1.06, AMBER, 'flat', { cap: 0x5a4a68 },
    ["I helped cast it. I don't remember who the human was. Nobody does. That's the trick."]],

  // — the argument under the signpost —
  ['horace', 'Horace Pinch', 'Arguing', [160.5, 2.0], 0, 'ginger', 'chonky', 1.04, COPPER, 'flat', { glasses: 0x2a2a32 },
    ['It says YOU ARE HERE. I KNOW I am here. That is not the useful half of a map!']],
  ['edna', 'Edna Pinch', 'Winning', [161.8, 3.2], 0, 'tabby', 'normal', 1.0, GREEN, 'bigear', { sunHat: 0xe8c0d0 },
    ['Forty-one years, Horace. You have never once been anywhere else.']],

  // — three loaves cooking on the flagstones —
  ['pudding', 'Pudding', 'Paving Loaf', [145.2, 8.8], 1.1, 'ginger', 'chonky', 1.06, COPPER, 'round', null,
    ['The stones hold the sun till four. After that I relocate. Slowly.']],
  ['crumpet', 'Crumpet', 'Paving Loaf', [147.4, 7.6], 2.0, 'white', 'chonky', 1.03, BLUE, 'round', { collar: 0xf2c14e },
    ['Mm? No. Warm. Later.']],
  ['dumpling', 'Dumpling', 'Paving Loaf', [143.6, 6.6], 0.4, 'grey', 'chonky', 1.08, AMBER, 'flat', null,
    ['I am not asleep. I am conserving the afternoon.']],

  // — the bakery awning, on the western edge of the square —
  ['florentine', 'Florentine', 'Pastry Cart', [142.6, -0.9], 1.0, 'calico', 'normal', 1.0, AMBER, 'normal', { apron: 0xfbf6ea, cap: 0xfbf6ea },
    ['Croissants! Fish croissants. There is one kind of croissant.']],
  ['bertie', 'Bertie Crumb', 'Customer', [143.5, 0.7], 3.4, 'tabby', 'chonky', 1.04, GREEN, 'round', { tie: 0x8a6238 },
    ['Same as yesterday please, Florentine. Same as every day. Same as always.']],

  // — Main Street: the second bench pair —
  ['nutmeg', 'Nutmeg Ash', 'Bench Occupant', [122.32, -5.05], 0, 'black', 'normal', 1.0, GOLD, 'bigear', { collar: 0xc94b3a },
    ["We're watching the street. There's one street. We're very committed."]],
  ['olive', 'Olive Ash', 'Bench Occupant', [123.68, -5.05], 0, 'white', 'chonky', 1.03, GREEN, 'round', { glasses: 0xd8b0c0 },
    ['He watches east. I watch west. Between us, nobody has ever left.']],

  // — Main Street: two cats stopped mid-street to talk about nothing —
  ['gilbert', 'Gilbert Nine', 'Passer-by', [109.6, 6.7], 0.9, 'tuxedo', 'normal', 1.01, AMBER, 'long', { cap: 0x3e6ea8 },
    ["Morning! Lovely one. Same as the last one. Same as the next one."]],
  ['june', 'June Marmalade', 'Passer-by', [110.7, 7.3], 3.9, 'ginger', 'normal', 0.98, LIME, 'normal', { collar: 0x2fc96a },
    ["I'd stop and chat but I'm on my way somewhere. I'm not. But I'd like the practice."]],

  // — Muscle Beach: the two regulars who hold the deck stations —
  ['moose', 'Moose Barbell', 'Gym Regular', [195.23, -28.54], 0.74, 'tabby', 'buff', 1.3, AMBER, 'flat', { tank: 0xff9a3a },
    ['Bench day. Every day is bench day. There are no other days.'], 'dumbbell'],
  ['pebble', 'Pebble', 'Gym Regular', [195.13, -30.54], 0.62, 'white', 'buff', 1.26, LIME, 'bigear', { tank: 0x9a6ad8 },
    ["I rack my weights. I'm not an animal. Well. Not till eight."], 'dumbbell'],

  // — Welcome Plaza: a pair sizing you up —
  ['rosalind', 'Rosalind Vell', 'Welcoming Committee', [81.5, 15.4], 0.9, 'siamese', 'normal', 1.0, BLUE, 'long', { collar: 0x6b4a7a },
    ['A new one! Clive, look — it has a BAG. They always bring a bag.']],
  ['clive', 'Clive', 'Welcoming Committee', [82.6, 16.2], 3.9, 'grey', 'chonky', 1.05, AMBER, 'flat', { tie: 0x4a7a5a },
    ["Give it a week. The bag goes in a cupboard and the cupboard is very deep."]],
];

for (const [key, name, role, home, face, pattern, build, size, eye, head, clothes, lines, acc] of CROWD) {
  CAST.push({
    key, name, role, home, face, pattern, build, size, eye, head, acc,
    clothes: clothes || undefined, sched: build === 'buff' ? 'gym' : 'wander', mood: 'a citizen',
    crowd: 1, noTiger: 1, tags: {}, lines,
  });
}

export default CAST;
