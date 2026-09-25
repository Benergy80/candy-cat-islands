// ─────────────────────────────────────────────────────────────────────────────
// SOUR PATCH KID — voice. Cute on the surface, hungry underneath. Never graphic.
// Each kid gets a name + an archetype; archetypes own 7 day lines and share the
// night pool. ui.say(text, { speaker }) does the rest.
// ─────────────────────────────────────────────────────────────────────────────

export const NAMES = [
  'Zim', 'Pucker', 'Tartlet', 'Wince', 'Sourbelly', 'Gumbo', 'Smacks', 'Nubbin',
  'Citra', 'Grit', 'Twang', 'Vinnie', 'Sugarplum', 'Lemondrop', 'Bitsy', 'Chomp',
  'Rasp', 'Sherbet', 'Pip', 'Gristle', 'Jujube', 'Molar', 'Wedge', 'Violet',
];

export const DAY = {
  giggler: [
    'hehe. you smell like breakfast!',
    "you're SO tall. that's just MORE of you.",
    'tag! you\'re it! you\'re always it. forever.',
    'we counted your fingers. ten! for now.',
    'wanna race? loser gets eaten — up with envy! envy.',
    'i like your face. i want it near me. very near.',
    'smile! we\'re making memories. we keep them in a jar.',
  ],
  ominous: [
    'stay for dinner!',
    'we love visitors. all of them. every part.',
    'the village is lovely at night. you won\'t see it.',
    'don\'t go to the pier. it\'s boring there. very boring. please.',
    'you should sleep early. deeply. outdoors.',
    'nothing bad has ever happened here. we made sure nothing was left to say so.',
    'seven thirty. put that somewhere safe.',
  ],
  foodie: [
    'are you sweet or salty? asking for me.',
    "i've never had a human. i've had SEVERAL humans.",
    'do you marinate, or is that automatic?',
    'sugar is a preservative, you know. for later.',
    'you look chewy. where i\'m from that\'s romance.',
    'we\'re having something special tonight! it\'s a surprise. for you.',
    'lean in. i want to smell the salt on you.',
  ],
  philosopher: [
    'if you eat a gummy, and the gummy eats you, who had lunch?',
    'we were made in a factory. we made ourselves into something else.',
    'everything here is edible. everything. do the arithmetic.',
    'the sun is a big warm lie that ends.',
    'i remember being a flat sheet of syrup. simpler. hungrier.',
    'one day the sugar runs out. then it\'s protein.',
    'you are the only thing on this island with a heartbeat. isn\'t that loud?',
  ],
  liar: [
    "i'm a NORMAL child!",
    'i have a mother. she\'s at the factory. she\'s a machine, but still.',
    'we definitely do not hunt at night. definitely not.',
    'that wasn\'t a bone. that was a very long candy.',
    'the last visitor left! by boat! in pieces of— of LUGGAGE.',
    'nothing lives under the village. nothing that\'s hungry, anyway.',
    'i\'ve never bitten anyone. the mouth did that on its own.',
  ],
  smallest: [
    "i'm the littlest! i only get a little bit of you!",
    'i called the fingers. i CALLED it.',
    'up! up! let me see the top of you!',
    'they say i\'m too small to hunt. i bite ANKLES.',
    'carry me? i\'ll be good. i\'ll be good until seven thirty.',
    'i drew you! in sugar! on the ground! it\'s more of an outline.',
    'do you have a soft part? asking for no reason.',
  ],
  royal: [
    'you found the purple one. that is very unlucky for you.',
    'there is only one of me. there were three.',
    "i don't play tag. i play later.",
    'they eat when i say eat. i have said it.',
    'bow? no? that\'s fine. you\'ll be down here eventually.',
    'purple is the flavour of the end of the day.',
    'i was here before the village. i will be here after the visitor.',
  ],
};

export const NIGHT = [
  'you stayed.',
  'shhh. we\'re working.',
  'it\'s dinner time and you are extremely late. and also dinner.',
  'don\'t run, it makes you stringy.',
  'we can see the warm in you.',
  'hold still. it\'s worse if you wiggle.',
  'the pier is that way. you won\'t make it.',
  'we started a while ago. you just can\'t feel it yet.',
  'nothing personal. everything culinary.',
];

export const GIGGLE = [
  'you smell like breakfast!',
  'hehehehe.',
  'keep walking! we love the walking!',
  "he's leading us home. how polite.",
  'don\'t look back! we\'re shy!',
  'no reason. no reason at all.',
  '...',
];

export const HAT = [
  'HAT TAX!',
  'borrowed your hat! it\'s mine now. temporarily. like you.',
  'we\'re keeping the hat. the head comes later.',
];

export const PHOTOBOMB = [
  'HI! read it out loud, we love a document!',
  'is it about us? it\'s about us.',
  'that sign is a lie. all signs here are lies.',
  'put me in the picture. i want proof you were here.',
];

export const SALTY = [
  'ugh. too... salty here.',
  'we don\'t cross the salt. it dries us out.',
  'the pier tastes wrong. you still taste right.',
  'we\'ll wait. we\'re very good at waiting.',
];

export const DUSK = [
  'oh. it\'s that time.',
  'go inside, sweet thing.',
  'see you at seven thirty!',
  'don\'t be where we can find you. we will find you.',
];

// ── WAVE 2: you brought something to hit us with ─────────────────────────────
// Armed taunts (day, while the player holds a weapon), then one pool per
// reaction. Still cute. Still hungry. Nothing here is ever gory.

export const ARMED = [
  'ooh! a stick! is that for us? it\'s for us.',
  'you can\'t swing that at ALL of us. we counted. you counted too. we saw.',
  'careful! you might hurt someone small. and delicious. and behind you.',
  'hehe. he brought a TOOL. to a village. of children.',
  'that thing doesn\'t work after seven thirty.',
  'swing it! swing it! i want to watch you get tired.',
  'we have twenty-three more of us. you have one of those.',
  'hold it tighter. it\'s cuter when you\'re nervous.',
];

export const SHRIEK = [
  'AAA! SALT! SALT! SAAAALT—',
  'no no no not the shaker not the shak—',
  'that\'s SEASONING! i\'m not FOOD! i\'m the EATING one!',
  'i\'m DISSOLVING. this is so undignified.',
];

export const MELT = [
  'TOO SOUR! TOO SOUR!',
  'it\'s in my SUGAR— it\'s IN my SUGAR—',
  'that is a LEMON CRIME and you KNOW it—',
  'i\'m going runny! tell the others i went runny!',
];

export const BONK = [
  'ow. rude.',
  'i FELT that. in my gummy.',
  'you hit a CHILD. a hungry one. worse.',
  'WHEEEE— no. no, this is bad.',
];

export const DIZZY = [
  'how many of you are there... four? four is fine. four is lunch.',
  'the ground is doing a thing.',
  'birdies. we don\'t have birdies here. we ate the birdies.',
];

export const STUN = [
  'OW! my FACE button!',
  'a GUMBALL? that\'s cannibalism. sort of. legally.',
  'blrgh— hold on— blrgh—',
];

export const FLINCH = [
  'hey!',
  'what even IS that.',
  'do it again, i wasn\'t scared the first time.',
];

export const GIVEUP = [
  'fine! FINE. i\'m going home. you\'re not even that tasty.',
  'i\'m telling the purple one about this.',
  'twice! you hit me TWICE. i\'m off. dinner\'s ruined.',
];

export const REFORM = [
  'i\'m back. i tasted the ground. the ground tasted like me.',
  'twenty-five seconds. i counted. i counted all of them. at you.',
  'that hardly hurt at all and i thought about you the whole time.',
];

export const SALT_PATCH = [
  'salty. so salty.',
  'you PUT that there. on purpose. that\'s WORSE.',
  'we\'ll wait outside the line. we\'re very good at waiting.',
  'enjoy your little circle. it gets light in nine hours.',
];

// What the gang is called where the player can read it (critic: the old name
// is somebody's trademark). One word, so a later rename is one line.
export const GANG = 'Sourlings';
export const GANG_ONE = 'Sourling';

export const EATEN_TOAST = [
  'Reviews: 5 stars, would eat again.',
  'Gumdrop Village rates you: chewy, slightly salty, 8/10.',
  'You have been recycled into local charm.',
];

export const ARCHETYPES = ['giggler', 'ominous', 'foodie', 'philosopher', 'liar', 'smallest'];

// ── WAVE 3: the new arsenal (Contract C) and the invincibility star (B) ──────
export const CANNON = [
  'JAWBREAKER! i\'m SEEING SOUNDS—',
  'that was a WHOLE jawbreaker. at a CHILD. out of a CANNON.',
  'i went so far. i saw the sea. i saw my HOUSE.',
];

export const WHIP = [
  'OW! licorice! the RED kind! the WORST kind!',
  'hey! that\'s a snack, not a WHIP—',
  'you whipped me with CANDY. that\'s just seasoning with extra steps.',
];

export const POPROCKS = [
  'IT\'S IN MY FEET IT\'S IN MY FEET IT\'S IN MY—',
  'POP! POP! why is everything POP—',
  'i\'m FIZZING! is this puberty?!',
];

export const GUM = [
  'i\'m STUCK! i\'m stuck in a GUM!',
  'this is chewed. somebody CHEWED this.',
  'my foot. my good foot. it\'s in the gum.',
];

export const MARSH = [
  'boing. BOING. boi— that was soft. i\'m still mad.',
  'you hit me with a PILLOW. a candy pillow. rude AND cosy.',
  'marshmallow? i\'d eat it if i weren\'t so INSULTED.',
];

export const SPIN = [
  'wheeeeeeeee— no. no. NO. WHEEEE—',
  'the world is a peppermint. it\'s going round.',
  'i can see the back of my own head. it\'s cute.',
];

export const WATER = [
  'eek! WET! i\'m SHRINKING! i\'m fun-size!',
  'nooo i\'m gonna be a MINI now—',
  'you watered me. do you know what water DOES to gummies?!',
];

export const STAR = [
  'HE\'S SHINY! SHINY IS BAD! RUN!',
  'he ate a STAR. you can\'t EAT a star. that\'s OUR thing—',
  'not the sparkly one! NOT THE SPARKLY ONE!',
  'we\'re sorry about the hat! WE\'RE SORRY ABOUT THE HAT!',
  'the tourist is GLOWING! mom! MOM!',
];

// ── 2026-09-23: dawn, water, and the ten-at-a-time rule ─────────────────────
// the sun comes up on a hunter: it yawns, stretches and is a child again
export const DAWN = [
  'oh! is it morning? i had the WEIRDEST dream.',
  'good morning! why am i standing here?',
  'mmmh— *yaaawn*. who wants to play tag?',
  'morning! we missed you! not in a hungry way!',
  'sorry about... whatever that was. can\'t remember. you look tasty— TASTEFUL. tasteful.',
  'is that the sun? i LOVE the sun. the sun is my best friend.',
];
// you are standing in the water and they cannot follow
export const SHORE = [
  'hsssssss.',
  'come OUT. the water\'s for SOUP.',
  'that\'s cheating. water is CHEATING.',
  'you\'ll catch cold in there. come here. we\'re warm.',
  'hsss. we can wait. we\'re very good at the edge.',
  'you have to come out eventually. you have LEGS. legs get TIRED.',
];
// one of them decides it can swim
export const LUNGE = [
  'i can SWIM. i can totally sw—',
  'how deep can it BE—',
  'MINE! mine mine mi—',
  'watch this! watch this!! wa—',
];
// …it cannot
export const SWIM = [
  'it\'s WET! it\'s so WE—',
  'i\'m going RUNNY—',
  'tell my house i was brave. and sticky.',
  'blub.',
  'oh no. oh no no. i\'m SOUP—',
];
export const REFORM_WET = [
  'i was a PUDDLE. do you know how many fish i met?',
  'back. still damp. still hungry.',
  'note to self: water is not a floor.',
];
// the ones who have to wait their turn, at the edge of the light
export const WATCH = [
  'we\'re next.',
  'save some for us.',
  'only ten at a time. it\'s polite.',
  'we\'re just watching. watching is free.',
  'take your time. we have all night. literally.',
];
// a watcher gets its turn
export const STEPIN = [
  'my turn.',
  'budge up. i\'m in.',
  'tag. tag me in.',
];
// ── WAVE 4: the raid over the rainbow (sourpatch/raid.js) ────────────────────
// the column passes a visitor standing on the deck (the bridge is a truce)
export const BRIDGE = [
  'not yet.',
  'excuse us! excuse US.',
  'we\'re just walking. just walking.',
  'pretty bridge. pretty snack.',
  'save you for later!',
  'don\'t mind us. we\'re a parade.',
];
// hunting on Cat Island (their night lines when you plead with them there)
export const RAID = [
  'new island. new menu.',
  'we followed the rainbow. look what was at the end.',
  'the cats said you were staying. so are we.',
  'no salt out here. we checked. mostly.',
  'the tigers get the leftovers. there won\'t be leftovers.',
];
// pacing the cats' salt line round Welcome Plaza
export const CATSALT = [
  'the CATS did this. cats are so rude.',
  'salt is for fries. not for WALLS.',
  'come out and look at the rainbow! it\'s so pretty out here!',
  'the tigers don\'t care about salt. just saying.',
  'we\'ll wait. cats can\'t stay up all night. oh. oh wait.',
];
// the small hours: slinking back to the rainbow before the sun can catch them
// on the wrong island (still night kids — grinning, not hunting)
export const RETREAT = [
  'sun\'s coming. we have a curfew.',
  'save our seats. we\'ll be back tonight.',
  'you were lucky. tell the cats.',
  'we\'re not leaving. we\'re pausing.',
  'same time tomorrow?',
];
// the morning walk home over the rainbow
export const HOMEWARD = [
  'morning! we were never here.',
  'long walk. worth it.',
  'tell the cats thank you for having us.',
  'the rainbow is much steeper going home.',
  'see you tonight! same time!',
];
