'use strict';

/* =====================================================================
   PUP PATROL: DOGS vs ALIENS
   2D top-down adventure tuned for Michael (6) first, James (9) second.

   STRUCTURE OF THIS FILE
   ----------------------
   1.  Player picker (STANDARDS §5)
   2.  Audio (Web Audio API beeps — no external sound files)
   3.  Data tables: AREAS, DOGS, ALIEN_TYPES, LEVELS
   4.  localStorage helpers (highest level, unlocked dogs, stats…)
   5.  Canvas + world state
   6.  Entity factories (dog, alien, cage, coin, particle, UFO)
   7.  World generation per level
   8.  Input (touch + mouse fallback)
   9.  Update functions (player, dogs, aliens, coins, …)
   10. Rendering (per-area background + entities)
   11. HUD updates
   12. Screen management (menu, level select, between-level, unlock, win)
   13. Nav bar + leave-game confirm
   14. Main loop + startup
   ===================================================================== */


/* ====================== 1. PLAYER PICKER ====================== */
const player_name = localStorage.getItem('arcade-current-player');
if (!player_name) {
  window.location.href = '/';
}


/* ====================== 2. AUDIO ====================== */
/* We lazy-create the AudioContext on first user gesture (iOS requires this).
   Each SFX is a tiny envelope on an oscillator — no audio files, no network. */
let actx = null;
function initAudio() {
  if (actx) return;
  const C = window.AudioContext || window.webkitAudioContext;
  actx = new C();
}
function beep(freq, dur, type = 'sine', vol = 0.15) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  bonk:   () => beep(220 + Math.random() * 40, 0.06, 'square', 0.08),
  pop:    () => { beep(660, 0.07, 'triangle', 0.12); setTimeout(() => beep(990, 0.12, 'triangle', 0.10), 50); },
  coin:   () => { beep(880, 0.07, 'square', 0.10); setTimeout(() => beep(1320, 0.10, 'square', 0.10), 60); },
  rescue: () => {
    beep(523, 0.12, 'triangle', 0.12);
    setTimeout(() => beep(659, 0.12, 'triangle', 0.12), 100);
    setTimeout(() => beep(784, 0.18, 'triangle', 0.14), 200);
  },
  upgrade: () => { beep(659, 0.08, 'sine', 0.12); setTimeout(() => beep(880, 0.12, 'sine', 0.12), 80); },
  win:    () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.15), i * 120)); },
  unlock: () => { [523, 659, 784, 988, 1175].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.16), i * 100)); },
  ufo:    () => beep(180, 0.5, 'sawtooth', 0.05),
};


/* ====================== 3. DATA TABLES ====================== */

/* ---- AREAS ----
   Each area is the visual + thematic backdrop for 4 levels.
   The render system reads these to paint the background, border, and
   to know which decoration kind to scatter around. */
const AREAS = [
  {
    id: 'backyard',
    name: 'Backyard',
    levels: [1, 2, 3, 4],
    ground: '#6fb86f',
    groundDot: 'rgba(70, 140, 70, 0.5)',
    border: '#3d7e3d',
    sky: '#b3e0ff',           // tint for menu / between-level
    decor: 'bush',
    decorCount: 28,
  },
  {
    id: 'beach',
    name: 'Beach',
    levels: [5, 6, 7, 8],
    ground: '#f5d99c',
    groundDot: 'rgba(200, 170, 110, 0.5)',
    border: '#5fc0d4',         // ocean blue edge
    sky: '#ffe9b3',
    decor: 'palm',
    decorCount: 14,
  },
  {
    id: 'moon',
    name: 'Moon',
    levels: [9, 10, 11, 12],
    ground: '#9aa0a8',
    groundDot: 'rgba(120, 125, 135, 0.6)',
    border: '#3a3148',         // dark space edge
    sky: '#2d2438',
    decor: 'crater',
    decorCount: 22,
  },
  {
    id: 'jungle',
    name: 'Jungle',
    levels: [13, 14, 15, 16],
    ground: '#3d8c4a',
    groundDot: 'rgba(30, 70, 40, 0.55)',
    border: '#1f5a2a',
    sky: '#6ab06a',
    decor: 'fern',
    decorCount: 36,
  },
  {
    id: 'lab',
    name: 'Mystery Lab',
    levels: [17, 18, 19, 20],
    ground: '#5a4a7e',
    groundDot: 'rgba(200, 140, 240, 0.35)',
    border: '#ff7be0',         // neon pink walls
    sky: '#3d2a5a',
    decor: 'beaker',
    decorCount: 18,
  },
];

/* Helper: which area does this level belong to? */
function areaForLevel(level) {
  return AREAS.find(a => a.levels.includes(level)) || AREAS[AREAS.length - 1];
}


/* ---- DOGS ----
   Each dog has a visual recipe. drawDog() reads coatStyle / earStyle /
   tailStyle / extras to paint the dog. Same recipe drives the menu
   portraits AND the in-game sprites, so what you see on the menu is
   exactly what you run with. */
const DOGS = [
  {
    id: 'biscuit', name: 'Biscuit', unlockLevel: 0,
    body: '#d49566', accent: '#a06f44', snout: '#f1d4ad', eye: '#2d2438',
    coat: 'solid', ears: 'floppy', tail: 'floppy',
  },
  {
    id: 'pepper', name: 'Pepper', unlockLevel: 2,
    body: '#2d2438', accent: '#ffffff', snout: '#f1d4ad', eye: '#2d2438',
    coat: 'patches', ears: 'floppy', tail: 'floppy',
  },
  {
    id: 'mochi', name: 'Mochi', unlockLevel: 4,
    body: '#fbf5ec', accent: '#e0d6c4', snout: '#f4c3c3', eye: '#2d2438',
    coat: 'fluff', ears: 'floppy', tail: 'fluff',
  },
  {
    id: 'cocoa', name: 'Cocoa', unlockLevel: 6,
    body: '#7a4a28', accent: '#5a3520', snout: '#d8a878', eye: '#2d2438',
    coat: 'long', ears: 'floppy', tail: 'straight',
  },
  {
    id: 'marble', name: 'Marble', unlockLevel: 8,
    body: '#f8f3ed', accent: '#2d2438', snout: '#f1d4ad', eye: '#2d2438',
    coat: 'spots', ears: 'perky', tail: 'straight',
  },
  {
    id: 'luna', name: 'Luna', unlockLevel: 12,
    body: '#c4cdd5', accent: '#5a6a7a', snout: '#f1d4ad', eye: '#4a90e2',
    coat: 'solid', ears: 'pointy', tail: 'fluff',
  },
  {
    id: 'comet', name: 'Comet', unlockLevel: 16,
    body: '#e8915c', accent: '#ffffff', snout: '#f1d4ad', eye: '#2d2438',
    coat: 'belly', ears: 'perky', tail: 'curl',
  },
  {
    id: 'pixel', name: 'Pixel', unlockLevel: 20,
    body: '#b89cf0', accent: '#7fc9d9', snout: '#e8c8ff', eye: '#2d2438',
    coat: 'fluff', ears: 'antenna', tail: 'curl',
  },
];
function dogById(id) {
  return DOGS.find(d => d.id === id) || DOGS[0];
}


/* ---- ALIEN TYPES ----
   Three archetypes introduced gradually:
   - wanderer: drifts randomly, easy
   - hopper:   flees from nearest dog when close, lighter HP
   - snoozer:  big and slow, takes more bonks
*/
const ALIEN_TYPES = {
  wanderer: { hp: 60,  radius: 18, color: '#a685e2', wanderSpeed: 30, flees: false, label: '' },
  hopper:   { hp: 50,  radius: 16, color: '#8de0a4', wanderSpeed: 50, flees: true,  label: '' },
  snoozer:  { hp: 130, radius: 24, color: '#e89cc7', wanderSpeed: 18, flees: false, label: 'z' },
};


/* ---- LEVELS ----
   20 levels across 5 areas. Each row tunes one level.
   - puppies: how many cages to free (the win condition for the level)
   - maxAliens: cap on simultaneous aliens in the world
   - alienSpeed: multiplier on wander speed
   - types: which alien archetypes can spawn this level
   - coinsPerAlien: how many coins drop when shooed
   - isBoss: a UFO hovers and keeps dropping aliens until level is won
*/
const LEVELS = [
  null, // 1-indexed
  // Backyard
  { puppies: 4,  maxAliens: 3,  alienSpeed: 1.0, types: ['wanderer'],                       coinsPerAlien: 1, isBoss: false },
  { puppies: 5,  maxAliens: 4,  alienSpeed: 1.1, types: ['wanderer'],                       coinsPerAlien: 1, isBoss: false },
  { puppies: 6,  maxAliens: 5,  alienSpeed: 1.2, types: ['wanderer'],                       coinsPerAlien: 1, isBoss: false },
  { puppies: 7,  maxAliens: 6,  alienSpeed: 1.2, types: ['wanderer'],                       coinsPerAlien: 2, isBoss: true  },
  // Beach
  { puppies: 6,  maxAliens: 5,  alienSpeed: 1.2, types: ['wanderer', 'hopper'],             coinsPerAlien: 2, isBoss: false },
  { puppies: 7,  maxAliens: 6,  alienSpeed: 1.3, types: ['wanderer', 'hopper'],             coinsPerAlien: 2, isBoss: false },
  { puppies: 8,  maxAliens: 7,  alienSpeed: 1.4, types: ['wanderer', 'hopper'],             coinsPerAlien: 2, isBoss: false },
  { puppies: 10, maxAliens: 8,  alienSpeed: 1.4, types: ['wanderer', 'hopper'],             coinsPerAlien: 2, isBoss: true  },
  // Moon
  { puppies: 8,  maxAliens: 6,  alienSpeed: 1.3, types: ['wanderer', 'snoozer'],            coinsPerAlien: 2, isBoss: false },
  { puppies: 9,  maxAliens: 7,  alienSpeed: 1.4, types: ['wanderer', 'snoozer'],            coinsPerAlien: 2, isBoss: false },
  { puppies: 10, maxAliens: 8,  alienSpeed: 1.5, types: ['hopper',  'snoozer'],             coinsPerAlien: 3, isBoss: false },
  { puppies: 12, maxAliens: 10, alienSpeed: 1.5, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: true  },
  // Jungle
  { puppies: 10, maxAliens: 8,  alienSpeed: 1.5, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: false },
  { puppies: 11, maxAliens: 9,  alienSpeed: 1.6, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: false },
  { puppies: 12, maxAliens: 10, alienSpeed: 1.7, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: false },
  { puppies: 14, maxAliens: 12, alienSpeed: 1.7, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: true  },
  // Mystery Lab
  { puppies: 12, maxAliens: 10, alienSpeed: 1.6, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 3, isBoss: false },
  { puppies: 14, maxAliens: 11, alienSpeed: 1.7, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 4, isBoss: false },
  { puppies: 16, maxAliens: 13, alienSpeed: 1.9, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 4, isBoss: false },
  { puppies: 18, maxAliens: 14, alienSpeed: 2.0, types: ['wanderer', 'hopper', 'snoozer'],  coinsPerAlien: 4, isBoss: true  }, // final
];
const MAX_LEVEL = 20;

const ENCOURAGEMENTS = [
  "Thanks for saving me!",
  "I'll help shoo the aliens!",
  "Woof! Let's go!",
  "You're the best!",
  "Yay! I'm free!",
  "Adventure time!",
];

/* Random color/name pool for the per-run cage pups (NOT permanent collection). */
const RUN_PUP_COLORS = ['#d49566', '#f1d4ad', '#8b6f4a', '#c8a47a', '#e8b88a', '#a0734e'];
const RUN_PUP_NAMES = ['Buddy', 'Daisy', 'Rex', 'Penny', 'Scout', 'Lulu', 'Bandit'];


/* ====================== 4. LOCALSTORAGE HELPERS ====================== */
/* All keys are namespaced per STANDARDS §6: pup-patrol:<player>:<dataKey> */
const k = {
  highest:  `pup-patrol:${player_name}:highestLevel`,
  unlocked: `pup-patrol:${player_name}:unlockedDogs`,   // JSON array of dog ids
  selected: `pup-patrol:${player_name}:selectedDog`,    // dog id string
  shooed:   `pup-patrol:${player_name}:aliensShooed`,   // number
  runs:     `pup-patrol:${player_name}:runsPlayed`,     // number
};
function getHighestLevel() { return Number(localStorage.getItem(k.highest)) || 0; }
function saveHighestLevel(level) {
  const cur = getHighestLevel();
  if (level > cur) localStorage.setItem(k.highest, String(level));
}
function getUnlockedDogs() {
  /* Returns Set<dog id>. Always includes 'biscuit' (the starter). */
  const raw = localStorage.getItem(k.unlocked);
  let arr;
  try { arr = raw ? JSON.parse(raw) : []; } catch (_) { arr = []; }
  if (!arr.includes('biscuit')) arr.push('biscuit');
  return new Set(arr);
}
function saveUnlockedDogs(set) {
  localStorage.setItem(k.unlocked, JSON.stringify([...set]));
}
function getSelectedDog() {
  const id = localStorage.getItem(k.selected) || 'biscuit';
  /* Defensive: if their saved selection isn't unlocked, fall back to biscuit. */
  return getUnlockedDogs().has(id) ? id : 'biscuit';
}
function setSelectedDog(id) { localStorage.setItem(k.selected, id); }
function getAliensShooed() { return Number(localStorage.getItem(k.shooed)) || 0; }
function addAliensShooed(n) {
  localStorage.setItem(k.shooed, String(getAliensShooed() + n));
}
function getRunsPlayed() { return Number(localStorage.getItem(k.runs)) || 0; }
function bumpRunsPlayed() {
  localStorage.setItem(k.runs, String(getRunsPlayed() + 1));
}

/* When a level is completed, unlock any dog whose unlockLevel == that level.
   Returns the array of newly-unlocked dog ids (could be 0 or 1). */
function maybeUnlockDogs(completedLevel) {
  const unlocked = getUnlockedDogs();
  const newly = [];
  for (const d of DOGS) {
    if (d.unlockLevel === completedLevel && !unlocked.has(d.id)) {
      unlocked.add(d.id);
      newly.push(d.id);
    }
  }
  if (newly.length) saveUnlockedDogs(unlocked);
  return newly;
}


/* ====================== 5. CANVAS + WORLD STATE ====================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0, dpr = 1;
function resize() {
  /* devicePixelRatio matters on iPad — without this, the canvas looks blurry
     on Retina. We scale the backing store by dpr, then setTransform so we
     can draw in CSS pixels and the GPU handles the upscale. */
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width  = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const WORLD = { w: 1600, h: 1200 };
const camera = { x: WORLD.w / 2 - cssW / 2, y: WORLD.h / 2 - cssH / 2 };

const player = {
  x: WORLD.w / 2,
  y: WORLD.h / 2,
  baseSpeed: 200,
  speed: 200,
  radius: 16,
  facing: 1,
  walkPhase: 0,
};

/* All entity collections live at module scope. buildLevel() empties them. */
const dogs = [];        // companion dogs following the player
const aliens = [];      // active aliens
const cages = [];       // puppy carriers to free
const coins = [];       // collectible coins
const particles = [];   // visual effects (poofs, hearts, stars)
const decor = [];       // background decorations (bushes, palms, …)
const ufos = [];        // boss UFOs (only on isBoss levels)

let totalCages = 0;
let rescued = 0;
let coinsBank = 0;
let upgRange = 0;
let upgSpeed = 0;
let gameStarted = false;
let gameWon = false;
let currentLevel = 1;
let currentArea = AREAS[0];
let levelTransition = false;
let worldGeneration = 0;    // bumped on each buildLevel; invalidates stale timers
let pendingUnlocks = [];    // dog ids queued by maybeUnlockDogs; shown one by one


/* ====================== 6. ENTITY FACTORIES ====================== */
function spawnInitialDog() {
  /* The starter dog is whatever the player picked on the menu. */
  const recipe = dogById(getSelectedDog());
  dogs.push(makeDog(recipe, player.x + 30, player.y + 10));
}

function makeDog(recipe, x, y) {
  /* `recipe` is one of the DOGS table entries (drives appearance).
     We mix in gameplay stats (speed, range, damage) here. */
  return {
    x, y,
    speed: 240,
    radius: 14,
    baseRange: 110,
    range: 110 + upgRange * 30,
    damage: 22,
    attackCd: 0,
    bounce: 0,
    facing: 1,
    recipe,
  };
}

function makeRunPup(x, y, index) {
  /* Cage-freed pups: random color/name pool, NOT a real DOGS entry.
     They're only around for the rest of this run. */
  const recipe = {
    id: 'runpup',
    name: RUN_PUP_NAMES[index % RUN_PUP_NAMES.length],
    body: RUN_PUP_COLORS[index % RUN_PUP_COLORS.length],
    accent: shadeColor(RUN_PUP_COLORS[index % RUN_PUP_COLORS.length], -30),
    snout: '#f1d4ad',
    eye: '#2d2438',
    coat: 'solid', ears: 'floppy', tail: 'floppy',
  };
  return makeDog(recipe, x, y);
}

function spawnAlien(x, y, typeKey) {
  const t = ALIEN_TYPES[typeKey];
  aliens.push({
    x, y,
    vx: 0, vy: 0,
    typeKey,
    radius: t.radius,
    color: t.color,
    hp: t.hp,
    maxHp: t.hp,
    wanderSpeed: t.wanderSpeed,
    flees: t.flees,
    wanderTimer: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    hitFlash: 0,
    bobPhase: Math.random() * Math.PI * 2,
    /* 'wander' = normal play; 'bonked' = flying home to UFO/sky. */
    state: 'wander',
    bonkT: 0,           // 0..1 progress through bonk animation
    bonkStart: null,    // {x, y} where bonk began
    bonkTarget: null,   // {x, y} where alien is flying to
  });
}

function spawnRandomAlien() {
  /* Pick a type from the current level's pool, place away from player. */
  const cfg = LEVELS[currentLevel];
  const typeKey = cfg.types[Math.floor(Math.random() * cfg.types.length)];
  let x, y, tries = 0;
  do {
    x = 120 + Math.random() * (WORLD.w - 240);
    y = 120 + Math.random() * (WORLD.h - 240);
    tries++;
  } while (Math.hypot(x - player.x, y - player.y) < 220 && tries < 12);
  spawnAlien(x, y, typeKey);
}

function spawnCage(x, y) {
  cages.push({
    x, y,
    radius: 32,
    freed: false,
    progress: 0,
    pupColor: RUN_PUP_COLORS[cages.length % RUN_PUP_COLORS.length],
  });
}

function spawnCoin(x, y) {
  const n = LEVELS[currentLevel].coinsPerAlien;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    coins.push({
      x: x + Math.cos(a) * 4,
      y: y + Math.sin(a) * 4,
      vx: Math.cos(a) * 80,
      vy: Math.sin(a) * 80 - 60,
      life: 0,
      settled: false,
      bob: Math.random() * Math.PI * 2,
    });
  }
}

function spawnPoof(x, y, color = '#a685e2') {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 100;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.7,
      size: 4 + Math.random() * 4,
      color,
      type: 'cloud',
    });
  }
}

function spawnHeart(x, y) {
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 30,
    vy: -50 - Math.random() * 30,
    life: 1.0,
    maxLife: 1.0,
    size: 14,
    color: '#ef6b80',
    type: 'heart',
  });
}

function spawnStar(x, y) {
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 60,
    vy: -40 - Math.random() * 40,
    life: 0.8,
    maxLife: 0.8,
    size: 10,
    color: '#ffd76b',
    type: 'star',
  });
}

function spawnUFO(x, y) {
  ufos.push({
    x, y,
    baseX: x, baseY: y,
    radius: 38,
    bob: Math.random() * Math.PI * 2,
    dropCd: 2.5 + Math.random(),
  });
}


/* ====================== 7. WORLD GENERATION ====================== */

function generateCagePositions(n, avoidX, avoidY) {
  /* Spread cages around a circle centered on the world. We use a random
     phase per level so two runs at the same level don't look identical. */
  const positions = [];
  const cx = WORLD.w / 2, cy = WORLD.h / 2;
  const r = Math.min(WORLD.w, WORLD.h) * 0.38;
  const phase = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const angle = phase + (i / n) * Math.PI * 2;
    let x = cx + Math.cos(angle) * r;
    let y = cy + Math.sin(angle) * r;
    if (Math.hypot(x - avoidX, y - avoidY) < 140) {
      const nx = (x - avoidX) / (Math.hypot(x - avoidX, y - avoidY) || 1);
      const ny = (y - avoidY) / (Math.hypot(x - avoidX, y - avoidY) || 1);
      x = avoidX + nx * 200;
      y = avoidY + ny * 200;
    }
    x = Math.max(120, Math.min(WORLD.w - 120, x));
    y = Math.max(120, Math.min(WORLD.h - 120, y));
    positions.push({ x, y });
  }
  return positions;
}

function generateDecor(area) {
  /* Scatter decorations across the world. Avoid the very center so the
     spawn area is uncluttered. Each item gets a stable random seed for
     its size/shade so it looks the same frame to frame. */
  for (let i = 0; i < area.decorCount; i++) {
    let x, y, tries = 0;
    do {
      x = 80 + Math.random() * (WORLD.w - 160);
      y = 80 + Math.random() * (WORLD.h - 160);
      tries++;
    } while (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 140 && tries < 10);
    decor.push({
      x, y,
      kind: area.decor,
      size: 16 + Math.random() * 16,
      seed: Math.random(),
    });
  }
}

function resetPlayerProgress() {
  /* Called when starting a fresh run from the menu — NOT between levels. */
  coinsBank = 0;
  upgRange = 0;
  upgSpeed = 0;
  player.speed = player.baseSpeed;
}

function buildLevel(level) {
  currentLevel = level;
  currentArea = areaForLevel(level);
  worldGeneration++;
  const cfg = LEVELS[level];

  dogs.length = 0;
  aliens.length = 0;
  cages.length = 0;
  coins.length = 0;
  particles.length = 0;
  decor.length = 0;
  ufos.length = 0;
  rescued = 0;
  gameWon = false;

  spawnInitialDog();
  dogs[0].range = dogs[0].baseRange + upgRange * 30;

  generateDecor(currentArea);

  const positions = generateCagePositions(cfg.puppies, player.x, player.y);
  positions.forEach(p => spawnCage(p.x, p.y));
  totalCages = cages.length;

  /* Boss levels: one UFO at L4/8/12/16, two at L20 (final). */
  if (cfg.isBoss) {
    spawnUFO(WORLD.w * 0.3, WORLD.h * 0.3);
    if (level === MAX_LEVEL) spawnUFO(WORLD.w * 0.7, WORLD.h * 0.7);
  }

  for (let i = 0; i < cfg.maxAliens; i++) spawnRandomAlien();

  updateHUD();
}

function startGameAtLevel(level) {
  resetPlayerProgress();
  player.x = WORLD.w / 2;
  player.y = WORLD.h / 2;
  bumpRunsPlayed();
  buildLevel(level);
}


/* ====================== 8. INPUT ====================== */
/* Single-pointer drag: wherever the finger is, the player walks there.
   Releasing the finger stops movement. Mouse works the same on desktop. */
const input = { active: false, screenX: 0, screenY: 0 };

function screenToWorld(sx, sy) {
  return { x: sx + camera.x, y: sy + camera.y };
}
function setTouch(x, y) { input.active = true; input.screenX = x; input.screenY = y; }
function endTouch()     { input.active = false; }

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  setTouch(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  setTouch(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchend',    (e) => { e.preventDefault(); endTouch(); }, { passive: false });
canvas.addEventListener('touchcancel', (e) => { e.preventDefault(); endTouch(); }, { passive: false });

canvas.addEventListener('mousedown', (e) => setTouch(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => { if (input.active) setTouch(e.clientX, e.clientY); });
canvas.addEventListener('mouseup', endTouch);
canvas.addEventListener('mouseleave', endTouch);


/* ====================== 9. UPDATE ====================== */
function updatePlayer(dt) {
  if (!input.active) { player.walkPhase *= 0.9; return; }
  const world = screenToWorld(input.screenX, input.screenY);
  const dx = world.x - player.x;
  const dy = world.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) { player.walkPhase *= 0.9; return; }
  const nx = dx / dist;
  const ny = dy / dist;
  player.x += nx * player.speed * dt;
  player.y += ny * player.speed * dt;
  player.x = Math.max(40, Math.min(WORLD.w - 40, player.x));
  player.y = Math.max(40, Math.min(WORLD.h - 40, player.y));
  player.walkPhase += dt * 10;
  if (nx > 0.1) player.facing = 1;
  else if (nx < -0.1) player.facing = -1;
}

function updateCamera() {
  /* Smooth (lerp) camera follow with bound clamping. The 0.15 is a
     proportional smoothing factor — bigger = snappier, smaller = floatier. */
  const targetX = player.x - cssW / 2;
  const targetY = player.y - cssH / 2;
  camera.x += (targetX - camera.x) * 0.15;
  camera.y += (targetY - camera.y) * 0.15;
  camera.x = Math.max(0, Math.min(WORLD.w - cssW, camera.x));
  camera.y = Math.max(0, Math.min(WORLD.h - cssH, camera.y));
}

function updateDogs(dt) {
  dogs.forEach((d, i) => {
    /* Orbit position: each dog gets a fixed slice of a slowly-rotating
       circle around the player, so pack stays tidy as it grows. */
    const angle = (i / Math.max(1, dogs.length)) * Math.PI * 2 + performance.now() * 0.0003;
    const orbit = 38 + Math.min(20, dogs.length * 3);
    const tx = player.x + Math.cos(angle) * orbit;
    const ty = player.y + Math.sin(angle) * orbit;

    /* Find nearest LIVE alien (not bonked) within attack range. */
    let nearest = null;
    let nearestDist = d.range;
    for (const a of aliens) {
      if (a.state !== 'wander') continue;
      const dist = Math.hypot(a.x - d.x, a.y - d.y);
      if (dist < nearestDist) { nearest = a; nearestDist = dist; }
    }

    if (nearest) {
      const dx = nearest.x - d.x;
      const dy = nearest.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > d.radius + nearest.radius - 4) {
        d.x += (dx / dist) * d.speed * dt;
        d.y += (dy / dist) * d.speed * dt;
        d.facing = dx > 0 ? 1 : -1;
      }
      d.attackCd -= dt;
      if (d.attackCd <= 0 && dist < d.radius + nearest.radius + 6) {
        nearest.hp -= d.damage;
        nearest.hitFlash = 0.15;
        d.bounce = 0.2;
        d.attackCd = 0.5;
        sfx.bonk();
      }
    } else {
      /* No target — orbit the player. */
      const dx = tx - d.x;
      const dy = ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        const sp = Math.min(d.speed, dist * 4);
        d.x += (dx / dist) * sp * dt;
        d.y += (dy / dist) * sp * dt;
        if (Math.abs(dx) > 2) d.facing = dx > 0 ? 1 : -1;
      }
    }
    d.bounce = Math.max(0, d.bounce - dt);
  });
}

function updateAliens(dt) {
  for (let i = aliens.length - 1; i >= 0; i--) {
    const a = aliens[i];
    a.bobPhase += dt * 2.5;
    a.hitFlash = Math.max(0, a.hitFlash - dt);

    if (a.state === 'bonked') {
      /* Animated arc to UFO (or sky). Lerp + a parabolic arch via -sin(pi*t). */
      a.bonkT += dt / 0.9;
      const t = Math.min(1, a.bonkT);
      const sx = a.bonkStart.x, sy = a.bonkStart.y;
      const tx = a.bonkTarget.x, ty = a.bonkTarget.y;
      a.x = sx + (tx - sx) * t;
      a.y = sy + (ty - sy) * t - Math.sin(Math.PI * t) * 120;
      if (t >= 1) {
        spawnPoof(a.x, a.y, a.color);
        sfx.pop();
        aliens.splice(i, 1);
        addAliensShooed(1);
        /* Non-boss levels: replace after a delay so the world stays lively.
           Boss levels handle spawning via the UFO drop timer instead. */
        if (!LEVELS[currentLevel].isBoss) {
          const myGen = worldGeneration;
          setTimeout(() => {
            if (gameWon || levelTransition) return;
            if (myGen !== worldGeneration) return;
            if (aliens.length >= LEVELS[currentLevel].maxAliens) return;
            spawnRandomAlien();
          }, 4000 + Math.random() * 3000);
        }
      }
      continue;
    }

    /* Wander */
    a.wanderTimer -= dt;
    if (a.wanderTimer <= 0) {
      a.wanderTimer = 1.5 + Math.random() * 2;
      a.wanderAngle = Math.random() * Math.PI * 2;
    }

    /* Hoppers flee from the nearest dog if it gets close. */
    if (a.flees) {
      let closestDog = null, closestD = 140;
      for (const d of dogs) {
        const dd = Math.hypot(d.x - a.x, d.y - a.y);
        if (dd < closestD) { closestD = dd; closestDog = d; }
      }
      if (closestDog) {
        a.wanderAngle = Math.atan2(a.y - closestDog.y, a.x - closestDog.x);
        a.wanderTimer = 0.3; // re-evaluate quickly
      }
    }

    const speed = a.wanderSpeed * LEVELS[currentLevel].alienSpeed;
    a.x += Math.cos(a.wanderAngle) * speed * dt;
    a.y += Math.sin(a.wanderAngle) * speed * dt;
    a.x = Math.max(60, Math.min(WORLD.w - 60, a.x));
    a.y = Math.max(60, Math.min(WORLD.h - 60, a.y));

    if (a.hp <= 0) {
      /* Begin the "bounce home" animation. Target: nearest UFO, or off the
         top of the world if there's none. */
      a.state = 'bonked';
      a.bonkT = 0;
      a.bonkStart = { x: a.x, y: a.y };
      if (ufos.length) {
        let best = ufos[0], bestD = Infinity;
        for (const u of ufos) {
          const dd = Math.hypot(u.x - a.x, u.y - a.y);
          if (dd < bestD) { bestD = dd; best = u; }
        }
        a.bonkTarget = { x: best.x, y: best.y - 18 };
      } else {
        a.bonkTarget = { x: a.x + (Math.random() - 0.5) * 200, y: -80 };
      }
      spawnCoin(a.x, a.y);
      spawnStar(a.x, a.y - 20);
    }
  }
}

function updateUFOs(dt) {
  for (const u of ufos) {
    u.bob += dt;
    u.x = u.baseX + Math.cos(u.bob * 0.6) * 30;
    u.y = u.baseY + Math.sin(u.bob * 0.9) * 18;
    u.dropCd -= dt;
    if (u.dropCd <= 0) {
      u.dropCd = 2.5 + Math.random() * 1.5;
      if (aliens.filter(a => a.state === 'wander').length < LEVELS[currentLevel].maxAliens) {
        const cfg = LEVELS[currentLevel];
        const typeKey = cfg.types[Math.floor(Math.random() * cfg.types.length)];
        spawnAlien(u.x, u.y + 30, typeKey);
        sfx.ufo();
      }
    }
  }
}

function updateCages(dt) {
  for (const c of cages) {
    if (c.freed) continue;
    const dist = Math.hypot(c.x - player.x, c.y - player.y);
    if (dist < c.radius + player.radius + 8) {
      c.progress = Math.min(1, c.progress + dt * 0.9);
      if (c.progress >= 1) {
        c.freed = true;
        rescued++;
        /* Add a per-run pup to the pack. Use cages count as index so each
           pup gets a different color/name pulled from the run-pool. */
        dogs.push(makeRunPup(c.x, c.y, dogs.length));
        spawnHeart(c.x, c.y - 20);
        spawnHeart(c.x - 12, c.y - 14);
        spawnHeart(c.x + 12, c.y - 14);
        sfx.rescue();
        showToast(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
        updateHUD();
        if (rescued >= totalCages) {
          gameWon = true;
          saveHighestLevel(currentLevel);
          pendingUnlocks = maybeUnlockDogs(currentLevel);
          if (currentLevel >= MAX_LEVEL) {
            setTimeout(triggerFinalWin, 800);
          } else {
            setTimeout(showLevelComplete, 800);
          }
        }
      }
    } else {
      c.progress = Math.max(0, c.progress - dt * 1.5);
    }
  }
}

function updateCoins(dt) {
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.life += dt;
    if (!c.settled) {
      c.vy += 200 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.92;
      if (c.life > 0.5) {
        c.settled = true;
        c.vx = 0; c.vy = 0;
      }
    } else {
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 90) {
        const sp = 300 * (1 - dist / 90) + 60;
        c.x += (dx / dist) * sp * dt;
        c.y += (dy / dist) * sp * dt;
      }
      if (dist < player.radius + 8) {
        coinsBank++;
        sfx.coin();
        updateHUD();
        coins.splice(i, 1);
        continue;
      }
      c.bob += dt * 4;
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    if (p.type === 'heart' || p.type === 'star') p.vy -= 30 * dt;
  }
}


/* ====================== 10. RENDERING ====================== */

function clear() {
  ctx.fillStyle = currentArea.ground;
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawGround() {
  /* Subtle texture dots that scroll with the camera so the world feels solid. */
  const grid = 80;
  const startX = Math.floor(camera.x / grid) * grid;
  const startY = Math.floor(camera.y / grid) * grid;
  ctx.fillStyle = currentArea.groundDot;
  for (let x = startX; x < camera.x + cssW + grid; x += grid) {
    for (let y = startY; y < camera.y + cssH + grid; y += grid) {
      const wx = x - camera.x;
      const wy = y - camera.y;
      /* moveTo before each arc starts a fresh subpath — without it, canvas
         draws connecting lines between the circles, filling a triangular
         region. (Same fix applies in any "multiple disconnected circles
         in one fill" pattern.) */
      ctx.beginPath();
      ctx.moveTo(wx + 22, wy + 30); ctx.arc(wx + 20, wy + 30, 2, 0, Math.PI * 2);
      ctx.moveTo(wx + 52, wy + 60); ctx.arc(wx + 50, wy + 60, 2, 0, Math.PI * 2);
      ctx.moveTo(wx + 66.5, wy + 15); ctx.arc(wx + 65, wy + 15, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Mystery Lab: overlay glowing tile lines for that neon-floor look. */
  if (currentArea.id === 'lab') {
    ctx.strokeStyle = 'rgba(255, 123, 224, 0.25)';
    ctx.lineWidth = 1.5;
    for (let x = startX; x < camera.x + cssW + grid; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x - camera.x, 0);
      ctx.lineTo(x - camera.x, cssH);
      ctx.stroke();
    }
    for (let y = startY; y < camera.y + cssH + grid; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y - camera.y);
      ctx.lineTo(cssW, y - camera.y);
      ctx.stroke();
    }
  }

  /* World boundary. Style differs by area. */
  ctx.strokeStyle = currentArea.border;
  ctx.lineWidth = 8;
  ctx.strokeRect(8 - camera.x, 8 - camera.y, WORLD.w - 16, WORLD.h - 16);

  /* Moon: starfield outside the playable area. */
  if (currentArea.id === 'moon') {
    /* Draw a few stars beyond the world edge so the dark border feels like space.
       Stable pseudo-random by index. */
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137) % WORLD.w) - camera.x;
      const sy = ((i * 89) % WORLD.h) - camera.y;
      if (sx > -10 && sx < cssW + 10 && sy > -10 && sy < cssH + 10) {
        if (sx < 20 || sx > cssW - 20 || sy < 20 || sy > cssH - 20) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawDecor() {
  for (const b of decor) {
    const sx = b.x - camera.x;
    const sy = b.y - camera.y;
    if (sx < -60 || sx > cssW + 60 || sy < -60 || sy > cssH + 60) continue;
    drawDecorKind(b, sx, sy);
  }
}

function drawDecorKind(d, sx, sy) {
  /* Shadow */
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + d.size * 0.7, d.size * 0.9, d.size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (d.kind === 'bush') {
    const shade = d.seed < 0.5 ? '#4f9c4f' : '#5cae5c';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(sx - d.size * 0.4, sy, d.size * 0.7, 0, Math.PI * 2);
    ctx.arc(sx + d.size * 0.4, sy, d.size * 0.7, 0, Math.PI * 2);
    ctx.arc(sx, sy - d.size * 0.4, d.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(sx - d.size * 0.2, sy - d.size * 0.4, d.size * 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'palm') {
    /* Trunk */
    ctx.fillStyle = '#8b6537';
    ctx.fillRect(sx - 4, sy - d.size * 0.4, 8, d.size * 1.2);
    /* Fronds — three blobs arranged like a starburst */
    ctx.fillStyle = '#3aa450';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      const fx = sx + Math.cos(a) * d.size * 0.9;
      const fy = sy - d.size * 0.4 + Math.sin(a) * d.size * 0.4;
      ctx.beginPath();
      ctx.ellipse(fx, fy, d.size * 0.5, d.size * 0.2, a, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Coconut */
    ctx.fillStyle = '#5a3520';
    ctx.beginPath();
    ctx.arc(sx + 3, sy - d.size * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'crater') {
    /* Crater rim + dark inner */
    ctx.fillStyle = '#7a808a';
    ctx.beginPath();
    ctx.arc(sx, sy, d.size * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5e6470';
    ctx.beginPath();
    ctx.arc(sx, sy, d.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'fern') {
    /* Three drooping fronds */
    ctx.strokeStyle = '#2f7a3a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(sx, sy + d.size * 0.3);
      ctx.quadraticCurveTo(
        sx + i * d.size * 0.5, sy - d.size * 0.4,
        sx + i * d.size * 0.9, sy - d.size * 0.1
      );
      ctx.stroke();
    }
    /* Yellow flower in the middle */
    if (d.seed > 0.6) {
      ctx.fillStyle = '#ffd76b';
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'beaker') {
    /* Beaker outline */
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(sx - d.size * 0.5, sy - d.size * 0.6);
    ctx.lineTo(sx - d.size * 0.5, sy + d.size * 0.4);
    ctx.lineTo(sx + d.size * 0.5, sy + d.size * 0.4);
    ctx.lineTo(sx + d.size * 0.5, sy - d.size * 0.6);
    ctx.lineTo(sx + d.size * 0.3, sy - d.size * 0.6);
    ctx.lineTo(sx + d.size * 0.3, sy - d.size * 0.8);
    ctx.lineTo(sx - d.size * 0.3, sy - d.size * 0.8);
    ctx.lineTo(sx - d.size * 0.3, sy - d.size * 0.6);
    ctx.closePath();
    ctx.fill();
    /* Glowing liquid */
    const liqColor = d.seed < 0.5 ? '#7be0ff' : '#ff7be0';
    ctx.fillStyle = liqColor;
    ctx.beginPath();
    ctx.moveTo(sx - d.size * 0.45, sy + d.size * 0.4);
    ctx.lineTo(sx + d.size * 0.45, sy + d.size * 0.4);
    ctx.lineTo(sx + d.size * 0.45, sy - d.size * 0.1);
    ctx.lineTo(sx - d.size * 0.45, sy - d.size * 0.1);
    ctx.closePath();
    ctx.fill();
    /* Bubble */
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(sx - d.size * 0.2, sy - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShadow(x, y, r) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.7, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const sx = player.x - camera.x;
  const sy = player.y - camera.y;
  const wobble = Math.sin(player.walkPhase) * 3;
  drawShadow(sx, sy + 4, 18);

  ctx.fillStyle = '#4ea8e3';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, 13, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1d4ad';
  ctx.beginPath();
  ctx.arc(sx, sy - 12 + wobble * 0.3, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3d1f';
  ctx.beginPath();
  ctx.arc(sx, sy - 16 + wobble * 0.3, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#2d2438';
  const eyeOffset = player.facing * 1.5;
  ctx.beginPath();
  ctx.arc(sx - 3 + eyeOffset, sy - 12 + wobble * 0.3, 1.5, 0, Math.PI * 2);
  ctx.arc(sx + 3 + eyeOffset, sy - 12 + wobble * 0.3, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2d2438';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx + eyeOffset * 0.5, sy - 8 + wobble * 0.3, 2.5, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = '#2d4a6e';
  ctx.fillRect(sx - 6, sy + 12 + Math.abs(wobble) * 0.5, 4, 6);
  ctx.fillRect(sx + 2, sy + 12 - Math.abs(wobble) * 0.5, 4, 6);
}

/* Draws a dog at world position (or, in portrait mode, at canvas position).
   If `ctxOverride` is passed we draw to that 2D context instead of the
   main game one — that lets the menu reuse drawDog for dog-picker tiles.
   `mode` is 'world' (camera-relative) or 'portrait' (centered at x,y). */
function drawDog(d, ctxOverride, mode, posX, posY) {
  const c = ctxOverride || ctx;
  const sx = mode === 'portrait' ? posX : (d.x - camera.x);
  const sy = mode === 'portrait' ? posY : (d.y - camera.y);
  const b = (d.bounce && d.bounce > 0) ? Math.sin(d.bounce * 30) * 2 : 0;
  const facing = d.facing || 1;
  const r = d.recipe;

  /* Only draw a shadow in world mode — portrait mode is on its own canvas. */
  if (mode === 'world') drawShadow(sx, sy + 6, 14);

  /* Body — coatStyle determines silhouette */
  c.fillStyle = r.body;
  if (r.coat === 'long') {
    /* Dachshund: extra-wide body, lower */
    c.beginPath();
    c.ellipse(sx, sy + 4 - b, 20, 8, 0, 0, Math.PI * 2);
    c.fill();
  } else if (r.coat === 'fluff') {
    /* Fluffy: rounder body with extra puff outline */
    c.fillStyle = r.accent;
    c.beginPath();
    c.ellipse(sx, sy + 2 - b, 17, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = r.body;
    c.beginPath();
    c.ellipse(sx, sy + 2 - b, 14, 9, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    c.ellipse(sx, sy + 2 - b, 14, 9, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* Coat pattern overlays */
  if (r.coat === 'patches') {
    c.fillStyle = r.accent;
    c.beginPath();
    c.arc(sx - 5, sy + 1 - b, 4, 0, Math.PI * 2);
    c.arc(sx + 4, sy + 4 - b, 5, 0, Math.PI * 2);
    c.fill();
  } else if (r.coat === 'spots') {
    c.fillStyle = r.accent;
    c.beginPath();
    c.arc(sx - 5, sy - 1 - b, 2, 0, Math.PI * 2);
    c.arc(sx + 4, sy + 3 - b, 2, 0, Math.PI * 2);
    c.arc(sx + 8, sy - 2 - b, 1.5, 0, Math.PI * 2);
    c.arc(sx - 9, sy + 4 - b, 1.5, 0, Math.PI * 2);
    c.fill();
  } else if (r.coat === 'belly') {
    /* Shiba-style cream belly */
    c.fillStyle = r.accent;
    c.beginPath();
    c.ellipse(sx, sy + 5 - b, 9, 4, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* Head */
  c.fillStyle = r.body;
  c.beginPath();
  c.arc(sx + facing * 8, sy - 4 - b, 9, 0, Math.PI * 2);
  c.fill();
  if (r.coat === 'patches') {
    c.fillStyle = r.accent;
    c.beginPath();
    c.arc(sx + facing * 11, sy - 7 - b, 4, 0, Math.PI * 2);
    c.fill();
  } else if (r.coat === 'spots') {
    c.fillStyle = r.accent;
    c.beginPath();
    c.arc(sx + facing * 10, sy - 7 - b, 1.6, 0, Math.PI * 2);
    c.arc(sx + facing * 6,  sy - 2 - b, 1.6, 0, Math.PI * 2);
    c.fill();
  }

  /* Ears */
  const earColor = shadeColor(r.body, -30);
  if (r.ears === 'floppy') {
    c.fillStyle = earColor;
    c.save();
    c.translate(sx + facing * 3, sy - 10 - b);
    c.rotate(-0.3 * facing);
    c.beginPath();
    c.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.save();
    c.translate(sx + facing * 12, sy - 9 - b);
    c.rotate(0.3 * facing);
    c.beginPath();
    c.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  } else if (r.ears === 'perky') {
    c.fillStyle = earColor;
    c.beginPath();
    c.moveTo(sx + facing * 3,  sy - 11 - b);
    c.lineTo(sx + facing * 6,  sy - 18 - b);
    c.lineTo(sx + facing * 8,  sy - 11 - b);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(sx + facing * 10, sy - 11 - b);
    c.lineTo(sx + facing * 13, sy - 18 - b);
    c.lineTo(sx + facing * 15, sy - 11 - b);
    c.closePath();
    c.fill();
  } else if (r.ears === 'pointy') {
    /* Husky: tall pointy ears with pink inner */
    c.fillStyle = earColor;
    c.beginPath();
    c.moveTo(sx + facing * 2,  sy - 11 - b);
    c.lineTo(sx + facing * 5,  sy - 20 - b);
    c.lineTo(sx + facing * 8,  sy - 11 - b);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(sx + facing * 10, sy - 11 - b);
    c.lineTo(sx + facing * 13, sy - 20 - b);
    c.lineTo(sx + facing * 16, sy - 11 - b);
    c.closePath();
    c.fill();
    c.fillStyle = '#f4c3c3';
    c.beginPath();
    c.moveTo(sx + facing * 4,  sy - 12 - b);
    c.lineTo(sx + facing * 5,  sy - 17 - b);
    c.lineTo(sx + facing * 7,  sy - 12 - b);
    c.closePath();
    c.fill();
  } else if (r.ears === 'antenna') {
    /* Alien-puppy: two wobbly antennae with glowing bulbs */
    c.strokeStyle = earColor;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sx + facing * 5,  sy - 11 - b);
    c.lineTo(sx + facing * 4,  sy - 20 - b);
    c.stroke();
    c.beginPath();
    c.moveTo(sx + facing * 12, sy - 11 - b);
    c.lineTo(sx + facing * 14, sy - 20 - b);
    c.stroke();
    c.fillStyle = r.accent;
    c.beginPath();
    c.arc(sx + facing * 4,  sy - 21 - b, 2.5, 0, Math.PI * 2);
    c.arc(sx + facing * 14, sy - 21 - b, 2.5, 0, Math.PI * 2);
    c.fill();
  }

  /* Snout */
  c.fillStyle = r.snout;
  c.beginPath();
  c.ellipse(sx + facing * 13, sy - 2 - b, 4, 3, 0, 0, Math.PI * 2);
  c.fill();

  /* Eye */
  c.fillStyle = r.eye;
  c.beginPath();
  c.arc(sx + facing * 10, sy - 5 - b, 1.6, 0, Math.PI * 2);
  c.fill();
  /* Eye highlight */
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(sx + facing * 10.5, sy - 5.5 - b, 0.5, 0, Math.PI * 2);
  c.fill();

  /* Nose */
  c.fillStyle = '#2d2438';
  c.beginPath();
  c.arc(sx + facing * 15, sy - 3 - b, 1.5, 0, Math.PI * 2);
  c.fill();

  /* Tail */
  c.strokeStyle = r.body;
  c.lineWidth = 4;
  c.lineCap = 'round';
  const tailWag = Math.sin(performance.now() * 0.015 + sx) * 0.5;
  if (r.tail === 'curl') {
    /* Shiba/Pixel: tight tail curl over the back */
    c.beginPath();
    c.arc(sx - facing * 11, sy - 6 - b, 5, 0.4, Math.PI * 1.8);
    c.stroke();
  } else if (r.tail === 'fluff') {
    /* Husky/Mochi: thick fluffy tail */
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(sx - facing * 10, sy - b);
    c.quadraticCurveTo(
      sx - facing * 18, sy - 8 + tailWag * 4 - b,
      sx - facing * 20, sy - 12 - b
    );
    c.stroke();
    c.lineWidth = 4;
  } else if (r.tail === 'straight') {
    c.beginPath();
    c.moveTo(sx - facing * 10, sy - b);
    c.lineTo(sx - facing * 20, sy - 4 - b);
    c.stroke();
  } else {
    /* default floppy wagging tail */
    c.beginPath();
    c.moveTo(sx - facing * 10, sy - b);
    c.quadraticCurveTo(
      sx - facing * 16, sy - 6 + tailWag * 4 - b,
      sx - facing * 18, sy - 8 - b
    );
    c.stroke();
  }
}

function drawAlien(a) {
  const sx = a.x - camera.x;
  const sy = a.y - camera.y;
  const bob = Math.sin(a.bobPhase) * 3;

  /* Bonked aliens get a happy face and shrink as they fly home. */
  const isBonked = a.state === 'bonked';
  const scale = isBonked ? (1 - a.bonkT * 0.5) : 1;

  drawShadow(sx, sy + 12 * scale, 22 * scale);
  const flash = a.hitFlash > 0;

  /* Body */
  ctx.save();
  ctx.translate(sx, sy + bob);
  ctx.scale(scale, scale);

  ctx.fillStyle = flash ? '#ffffff' : a.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, a.radius, a.radius * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = flash ? '#ffffff' : shadeColor(a.color, 30);
  ctx.beginPath();
  ctx.ellipse(0, -2, a.radius * 0.65, a.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  /* Antennae */
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -a.radius * 0.7);
  ctx.lineTo(-12, -a.radius * 1.3);
  ctx.moveTo(8, -a.radius * 0.7);
  ctx.lineTo(12, -a.radius * 1.3);
  ctx.stroke();
  ctx.fillStyle = '#ffd76b';
  ctx.beginPath();
  ctx.arc(-12, -a.radius * 1.3, 3, 0, Math.PI * 2);
  ctx.arc(12, -a.radius * 1.3, 3, 0, Math.PI * 2);
  ctx.fill();

  /* Eye — bonked aliens get a smile, live ones get the big single eye */
  if (isBonked) {
    /* Closed-eye happy face: two arcs + smile */
    ctx.strokeStyle = '#2d2438';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-4, -4, 3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.arc(4, -4, 3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(0, -4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d2438';
    ctx.beginPath();
    ctx.arc(0, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(1.5, -5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Type-specific accent: Snoozer gets a "z" floating above */
  if (a.typeKey === 'snoozer' && !isBonked) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const zb = Math.sin(performance.now() * 0.003) * 2;
    ctx.fillText('z', 14, -a.radius - 6 + zb);
  }

  ctx.restore();

  /* HP bar — only on wandering, hurt aliens */
  if (!isBonked && a.hp < a.maxHp) {
    const w = 32;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(sx - w / 2, sy - a.radius - 10 + bob, w, 4);
    ctx.fillStyle = '#ff7b7b';
    ctx.fillRect(sx - w / 2, sy - a.radius - 10 + bob, w * (a.hp / a.maxHp), 4);
  }
}

function drawUFO(u) {
  const sx = u.x - camera.x;
  const sy = u.y - camera.y;
  /* Beam underneath */
  ctx.fillStyle = 'rgba(255, 250, 180, 0.25)';
  ctx.beginPath();
  ctx.moveTo(sx - 20, sy + 18);
  ctx.lineTo(sx + 20, sy + 18);
  ctx.lineTo(sx + 50, sy + 90);
  ctx.lineTo(sx - 50, sy + 90);
  ctx.closePath();
  ctx.fill();

  /* Saucer body */
  ctx.fillStyle = '#7a8aa0';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 6, 40, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  /* Dome */
  ctx.fillStyle = '#7be0ff';
  ctx.beginPath();
  ctx.arc(sx, sy + 4, 22, Math.PI, 0);
  ctx.fill();
  /* Lights */
  for (let i = -2; i <= 2; i++) {
    const lit = (Math.floor(performance.now() / 200) + i) % 2 === 0;
    ctx.fillStyle = lit ? '#ffd76b' : '#5a4a6e';
    ctx.beginPath();
    ctx.arc(sx + i * 12, sy + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCage(c) {
  const sx = c.x - camera.x;
  const sy = c.y - camera.y;
  if (sx < -80 || sx > cssW + 80 || sy < -80 || sy > cssH + 80) return;
  drawShadow(sx, sy + 10, 36);

  if (c.freed) {
    ctx.fillStyle = '#999';
    ctx.fillRect(sx - 30, sy + 16, 60, 4);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const x = sx - 28 + i * 14;
      const angle = -0.3 + i * 0.15;
      ctx.save();
      ctx.translate(x, sy + 16);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -24);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  /* Base */
  ctx.fillStyle = '#7a6452';
  ctx.fillRect(sx - 30, sy + 18, 60, 6);
  /* Bars */
  ctx.strokeStyle = '#3a2d22';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(sx - 30, sy - 18);
  ctx.lineTo(sx + 30, sy - 18);
  ctx.stroke();
  for (let i = 0; i <= 5; i++) {
    const x = sx - 30 + i * 12;
    ctx.beginPath();
    ctx.moveTo(x, sy - 18);
    ctx.lineTo(x, sy + 18);
    ctx.stroke();
  }
  /* Sad puppy inside */
  ctx.fillStyle = c.pupColor;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 4, sy - 4, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2d2438';
  ctx.beginPath();
  ctx.arc(sx + 6, sy - 5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1d4ad';
  ctx.beginPath();
  ctx.ellipse(sx + 10, sy - 1, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (c.progress > 0) {
    ctx.strokeStyle = '#ffd76b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx, sy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.progress);
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Stay close!', sx, sy - 30);
  } else {
    const float = Math.sin(performance.now() * 0.004) * 2;
    ctx.fillStyle = '#ffd76b';
    ctx.beginPath();
    ctx.arc(sx + 22, sy - 28 + float, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d2438';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', sx + 22, sy - 28 + float);
  }
}

function drawCoin(c) {
  const sx = c.x - camera.x;
  const sy = c.y - camera.y;
  if (sx < -20 || sx > cssW + 20 || sy < -20 || sy > cssH + 20) return;
  const bob = c.settled ? Math.sin(c.bob) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 6, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4b53a';
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76b';
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4b53a';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', sx, sy + bob);
}

function drawParticle(p) {
  const sx = p.x - camera.x;
  const sy = p.y - camera.y;
  const alpha = p.life / p.maxLife;
  if (p.type === 'cloud') {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * (2 - alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (p.type === 'heart') {
    ctx.globalAlpha = alpha;
    drawHeart(sx, sy, p.size, p.color);
    ctx.globalAlpha = 1;
  } else if (p.type === 'star') {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.font = `bold ${p.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', sx, sy);
    ctx.globalAlpha = 1;
  }
}

function drawHeart(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x, y, x - size, y, x - size, y - size * 0.3);
  ctx.bezierCurveTo(x - size, y - size, x, y - size * 0.8, x, y - size * 0.4);
  ctx.bezierCurveTo(x, y - size * 0.8, x + size, y - size, x + size, y - size * 0.3);
  ctx.bezierCurveTo(x + size, y, x, y, x, y + size * 0.3);
  ctx.fill();
}

function shadeColor(hex, amt) {
  /* Lighten (+) or darken (-) a hex color. Used for ear shadows etc. */
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(c.substr(0, 2), 16) + amt));
  const g = Math.max(0, Math.min(255, parseInt(c.substr(2, 2), 16) + amt));
  const b = Math.max(0, Math.min(255, parseInt(c.substr(4, 2), 16) + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}


/* ====================== 11. HUD ====================== */
const elCoins      = document.getElementById('coins');
const elDogs       = document.getElementById('dogs');
const elRescued    = document.getElementById('rescued');
const elTotal      = document.getElementById('total');
const elLevelNum   = document.getElementById('level-num');
const elQuestArea  = document.getElementById('quest-area');
const elCostRange  = document.getElementById('cost-range');
const elCostSpeed  = document.getElementById('cost-speed');
const elUpRange    = document.getElementById('up-range');
const elUpSpeed    = document.getElementById('up-speed');
const elToast      = document.getElementById('toast');

function rangeCost() { return 5 + upgRange * 3; }
function speedCost() { return 5 + upgSpeed * 3; }

function updateHUD() {
  elCoins.textContent = coinsBank;
  elDogs.textContent = dogs.length;
  elRescued.textContent = rescued;
  elTotal.textContent = totalCages;
  elLevelNum.textContent = currentLevel;
  elQuestArea.textContent = currentArea.name;
  elCostRange.textContent = rangeCost();
  elCostSpeed.textContent = speedCost();
  elUpRange.classList.toggle('disabled', coinsBank < rangeCost());
  elUpSpeed.classList.toggle('disabled', coinsBank < speedCost());
}

elUpRange.addEventListener('click', () => {
  const cost = rangeCost();
  if (coinsBank < cost) return;
  coinsBank -= cost;
  upgRange++;
  dogs.forEach(d => d.range = d.baseRange + upgRange * 30);
  sfx.upgrade();
  showToast('Longer leash! 🎯');
  updateHUD();
});

elUpSpeed.addEventListener('click', () => {
  const cost = speedCost();
  if (coinsBank < cost) return;
  coinsBank -= cost;
  upgSpeed++;
  player.speed = player.baseSpeed * (1 + upgSpeed * 0.2);
  sfx.upgrade();
  showToast('Faster paws! ⚡');
  updateHUD();
});

let toastTimer = null;
function showToast(text) {
  elToast.textContent = text;
  elToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.remove('show'), 1600);
}


/* ====================== 12. SCREEN MANAGEMENT ====================== */

const startScreen   = document.getElementById('start-screen');
const levelSelScreen = document.getElementById('level-select-screen');
const levelScreen   = document.getElementById('level-screen');
const unlockScreen  = document.getElementById('unlock-screen');
const winScreen     = document.getElementById('win-screen');

/* ---- Dog picker on the start screen ---- */
function renderDogPicker() {
  const grid = document.getElementById('dog-picker');
  const unlocked = getUnlockedDogs();
  const selected = getSelectedDog();
  grid.innerHTML = '';
  for (const d of DOGS) {
    const slot = document.createElement('div');
    slot.className = 'dog-slot';
    if (selected === d.id) slot.classList.add('selected');

    /* Tiny canvas portrait for this dog. Reuses drawDog with mode='portrait'. */
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const pctx = cv.getContext('2d');
    /* Scale up: drawDog assumes ~16px-tall dogs at scale 1, so scale ~2.6 fits. */
    pctx.scale(2.6, 2.6);
    drawDog({ recipe: d, facing: 1 }, pctx, 'portrait', 18, 24);
    slot.appendChild(cv);

    if (!unlocked.has(d.id)) {
      slot.classList.add('locked');
      const lock = document.createElement('div');
      lock.className = 'lock';
      lock.innerHTML = `<div class="lock-icon">🔒</div><div>L${d.unlockLevel}</div>`;
      slot.appendChild(lock);
      slot.addEventListener('click', () => {
        showToast(`Beat Level ${d.unlockLevel} to unlock ${d.name}!`);
      });
    } else {
      slot.addEventListener('click', () => {
        setSelectedDog(d.id);
        renderDogPicker();           // refresh selection ring
        updateSelectedDogName();
      });
    }
    grid.appendChild(slot);
  }
}

function updateSelectedDogName() {
  document.getElementById('dog-selected-name').textContent =
    dogById(getSelectedDog()).name;
}

/* ---- Start-screen action buttons (depends on save state) ---- */
function renderStartActions() {
  const highest = getHighestLevel();
  const container = document.getElementById('start-actions');
  container.innerHTML = '';

  function addBtn(label, handler, className = 'big-btn') {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', handler);
    container.appendChild(b);
  }

  if (highest === 0) {
    addBtn("Let's Go!", () => beginPlay(1));
  } else if (highest >= MAX_LEVEL) {
    addBtn('Pick a Level', () => openLevelSelect());
    addBtn('Start from Level 1', () => beginPlay(1));
  } else {
    const next = Math.min(highest + 1, MAX_LEVEL);
    addBtn(`Continue (Level ${next})`, () => beginPlay(next));
    if (highest >= 2) addBtn('Pick a Level', () => openLevelSelect(), 'btn-secondary');
  }
}

function renderStats() {
  const el = document.getElementById('stats');
  const shooed = getAliensShooed();
  const runs = getRunsPlayed();
  const highest = getHighestLevel();
  const lines = [];
  if (highest > 0) lines.push(`Highest level: <span class="stat-num">${highest}</span>`);
  if (shooed > 0)  lines.push(`Aliens shooed home: <span class="stat-num">${shooed}</span>`);
  if (runs > 0)    lines.push(`Runs played: <span class="stat-num">${runs}</span>`);
  el.innerHTML = lines.join(' · ');
}

/* ---- Level select grid ---- */
function openLevelSelect() {
  renderLevelSelect();
  startScreen.classList.add('hidden');
  levelSelScreen.classList.add('show');
}
function closeLevelSelect() {
  levelSelScreen.classList.remove('show');
  startScreen.classList.remove('hidden');
}
function renderLevelSelect() {
  const root = document.getElementById('level-select');
  const highest = getHighestLevel();
  root.innerHTML = '';
  for (const area of AREAS) {
    const areaUnlocked = area.levels[0] <= highest + 1;
    const block = document.createElement('div');
    block.className = 'area-block' + (areaUnlocked ? '' : ' locked');

    const name = document.createElement('div');
    name.className = 'area-name';
    name.innerHTML = `<span class="area-color-dot" style="background:${area.ground}"></span>${area.name}`;
    block.appendChild(name);

    const row = document.createElement('div');
    row.className = 'level-row';
    for (const lv of area.levels) {
      const btn = document.createElement('button');
      const isBoss = LEVELS[lv].isBoss;
      btn.className = 'level-btn' + (isBoss ? ' boss' : '');
      btn.textContent = lv;
      if (lv > highest + 1) {           // not yet reachable
        btn.classList.add('locked');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          levelSelScreen.classList.remove('show');
          beginPlay(lv);
        });
      }
      row.appendChild(btn);
    }
    block.appendChild(row);
    root.appendChild(block);
  }
}

/* ---- Between-level + unlock chain ---- */
function showLevelComplete() {
  levelTransition = true;
  sfx.win();
  document.getElementById('level-heading').textContent = `Level ${currentLevel} complete!`;
  document.getElementById('level-sub').textContent =
    `Coins: ${coinsBank} — keep your upgrades for next level!`;
  /* If a dog was unlocked, show the unlock screen first; the Continue button
     on the unlock screen will then advance to the next level. */
  if (pendingUnlocks.length) {
    showNextUnlock();
  } else {
    levelScreen.classList.add('show');
  }
}

function showNextUnlock() {
  const id = pendingUnlocks.shift();
  if (!id) {
    /* All unlocks shown — fall through to the regular level-complete card. */
    levelScreen.classList.add('show');
    return;
  }
  const d = dogById(id);
  document.getElementById('unlock-name').textContent = d.name;
  document.getElementById('unlock-sub').textContent =
    `${d.name} joins your collection!`;
  /* Render the portrait into the unlock canvas. */
  const pcv = document.getElementById('unlock-portrait');
  const pctx = pcv.getContext('2d');
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, pcv.width, pcv.height);
  pctx.scale(4.5, 4.5);
  drawDog({ recipe: d, facing: 1 }, pctx, 'portrait', 20, 24);

  unlockScreen.classList.add('show');
  sfx.unlock();
  /* Pre-select the newly-unlocked dog so it shows up next time they open the menu. */
  setSelectedDog(id);
}

document.getElementById('unlock-continue').addEventListener('click', () => {
  unlockScreen.classList.remove('show');
  if (pendingUnlocks.length) {
    showNextUnlock();          // chain to the next unlock (rare but possible)
  } else if (currentLevel >= MAX_LEVEL) {
    triggerFinalWin();         // we deferred final win until unlocks were shown
  } else {
    levelScreen.classList.add('show');
  }
});

function advanceToNextLevel() {
  levelScreen.classList.remove('show');
  levelTransition = false;
  buildLevel(currentLevel + 1);
}
document.getElementById('next-level-btn').addEventListener('click', advanceToNextLevel);
document.getElementById('level-menu-btn').addEventListener('click', () => {
  levelScreen.classList.remove('show');
  returnToMenu();
});

/* ---- Final win ---- */
function triggerFinalWin() {
  /* If there are still unlocks pending (e.g. Pixel at L20), show them first. */
  if (pendingUnlocks.length) {
    showNextUnlock();
    return;
  }
  gameWon = true;
  hideNavBar();
  sfx.win();
  for (let i = 0; i < 20; i++) {
    setTimeout(() => spawnHeart(
      player.x + (Math.random() - 0.5) * 60,
      player.y + (Math.random() - 0.5) * 40
    ), i * 60);
  }
  /* Pixel portrait on the win screen. */
  const pcv = document.getElementById('win-portrait');
  const pctx = pcv.getContext('2d');
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, pcv.width, pcv.height);
  pctx.scale(4.5, 4.5);
  drawDog({ recipe: dogById('pixel'), facing: 1 }, pctx, 'portrait', 20, 24);
  setTimeout(() => winScreen.classList.add('show'), 600);
}

document.getElementById('play-again').addEventListener('click', () => {
  winScreen.classList.remove('show');
  startGameAtLevel(1);
  showNavBar();
});

document.getElementById('level-select-back').addEventListener('click', closeLevelSelect);


/* ====================== 13. NAV BAR + LEAVE-GAME CONFIRM ====================== */
const navBar = document.getElementById('nav-bar');
const confirmBackdrop = document.getElementById('confirm-backdrop');

let pendingLeaveAction = null;

function showNavBar() { navBar.classList.remove('hidden'); }
function hideNavBar() { navBar.classList.add('hidden'); }

function isActivePlay() {
  return gameStarted && !gameWon && !levelTransition && !unlockScreen.classList.contains('show');
}

function showConfirm(action) {
  pendingLeaveAction = action;
  confirmBackdrop.classList.add('show');
}
function hideConfirm() {
  confirmBackdrop.classList.remove('show');
  pendingLeaveAction = null;
}

function returnToMenu() {
  gameStarted = false;
  levelTransition = false;
  gameWon = false;
  hideNavBar();
  levelScreen.classList.remove('show');
  unlockScreen.classList.remove('show');
  winScreen.classList.remove('show');
  levelSelScreen.classList.remove('show');
  renderDogPicker();
  updateSelectedDogName();
  renderStartActions();
  renderStats();
  /* Force a fade-in by toggling .hidden — same trick the old version used. */
  startScreen.classList.add('hidden');
  startScreen.style.display = 'flex';
  void startScreen.offsetHeight;
  startScreen.classList.remove('hidden');
}

function goToArcade() { window.location.href = '/'; }

document.getElementById('nav-menu').addEventListener('click', () => {
  if (isActivePlay()) showConfirm(returnToMenu); else returnToMenu();
});
document.getElementById('nav-arcade').addEventListener('click', () => {
  if (isActivePlay()) showConfirm(goToArcade); else goToArcade();
});
document.getElementById('confirm-stay').addEventListener('click', hideConfirm);
document.getElementById('confirm-leave').addEventListener('click', () => {
  const action = pendingLeaveAction;
  hideConfirm();
  if (action) action();
});
document.getElementById('start-back').addEventListener('click', goToArcade);
document.getElementById('win-back').addEventListener('click', goToArcade);


/* ====================== 14. MAIN LOOP + STARTUP ====================== */

function beginPlay(level) {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  startGameAtLevel(level);
  startScreen.classList.add('hidden');
  levelSelScreen.classList.remove('show');
  setTimeout(() => { startScreen.style.display = 'none'; }, 400);
  gameStarted = true;
  showNavBar();
}

let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;   // cap big spikes (tab switch)

  if (gameStarted && !gameWon && !levelTransition) {
    updatePlayer(dt);
    updateDogs(dt);
    updateAliens(dt);
    updateUFOs(dt);
    updateCages(dt);
    updateCoins(dt);
    updateParticles(dt);
    updateCamera();
  } else if (gameStarted) {
    /* Still update camera + particles during the level-complete card so
       hearts keep floating up. Aliens/dogs freeze in place. */
    updateCamera();
    updateAliens(dt);   // lets in-flight bonk animations finish
    updateParticles(dt);
  }

  clear();
  drawGround();
  drawDecor();

  /* Y-sorted renderables so far things draw behind near things. */
  const renderables = [];
  for (const c of cages)  renderables.push({ y: c.y,       fn: () => drawCage(c) });
  for (const u of ufos)   renderables.push({ y: u.y - 100, fn: () => drawUFO(u) });
  for (const a of aliens) renderables.push({ y: a.y,       fn: () => drawAlien(a) });
  for (const d of dogs)   renderables.push({ y: d.y,       fn: () => drawDog(d, null, 'world') });
  renderables.push({ y: player.y, fn: drawPlayer });
  for (const c of coins)  renderables.push({ y: c.y + 100, fn: () => drawCoin(c) });
  renderables.sort((a, b) => a.y - b.y);
  for (const r of renderables) r.fn();

  for (const p of particles) drawParticle(p);

  requestAnimationFrame(loop);
}

/* ---- Boot ---- */
renderDogPicker();
updateSelectedDogName();
renderStartActions();
renderStats();
buildLevel(1);              // initial world so canvas isn't blank under the menu
requestAnimationFrame(loop);
