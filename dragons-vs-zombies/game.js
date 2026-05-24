'use strict';

/* ====================================================================
   DRAGONS VS. ZOMBIES — Round 2a
   Side-view Contra-style scroller. Dragon flies above; zombies shuffle
   along the ground. World scrolls right-to-left through 5 themed
   districts. Fire puffs cure zombies into villagers.
   No frameworks, no external assets — vanilla HTML/CSS/JS only.
   ==================================================================== */

/* ============================================================
   CONFIG — TWEAK THESE AFTER PLAYTESTING WITH THE KIDS
   ============================================================ */
const CONFIG = {
  /* ---- Growth ---- */
  // Cumulative cures to reach stages 2, 3, 4, 5.
  cureThresholds: [5, 10, 20, 35],
  stageNames: ['Hatchling', 'Kid', 'Teen', 'Adult', 'Elder'],
  // Visual scale per stage (1..5)
  stageScales:           [1.0, 1.2, 1.45, 1.7, 2.0],
  // Fireball strength scaling per stage
  stageFireballSizeMul:  [1.0, 1.10, 1.25, 1.40, 1.60],
  stageFireballSpeedMul: [1.0, 1.05, 1.10, 1.15, 1.20],

  /* ---- Sleepy meter ---- */
  sleepyMeterMax: 100,
  zombieTouchPenalty: 8,         // hop touch — the third pressure source
  touchCooldownSec: 1.0,
  passiveSleepyPerSec: 0.55,     // ≈3 min to nap doing nothing (100 / 180s)
  escapePenalty: 4,              // sleep added per zombie that reaches left edge
  cureSleepyRelief: 0.5,         // sleep subtracted per cure (rewards active play)

  /* ---- Wave timing ---- */
  waveDurationSec: 30,
  baseSpawnInterval: 1.5,   // sec between zombie spawns on wave 1
  minSpawnInterval: 0.40,
  spawnDecayPerWave: 0.82,

  /* ---- Zombie speed (along the ground, leftward) ---- */
  baseZombieSpeed: 22,
  maxZombieSpeed: 60,
  zombieSpeedGrowthPerWave: 1.08,

  /* ---- Zombie hop (lets them reach a low-flying dragon) ---- */
  hopIntervalMin: 2.2,        // sec between hops (random in range)
  hopIntervalMax: 4.5,
  hopHeight: 90,              // peak hop height in px above ground
  hopDurationSec: 0.9,        // total time in the air per hop

  /* ---- Zombie chatter ---- */
  chatterChancePerSec: 0.18,
  chatterDurationSec: 1.7,
  chatter: [
    "…sandwich?", "…cookies?", "…nap time?", "…blanket?", "zzz…",
    "…pillow?", "…snore…", "…pancakes?", "…teddy?", "…story?",
  ],

  /* ---- Cured villager exit ---- */
  curedExitDurationSec: 4.0,  // how long they linger walking off-screen
  curedWalkSpeed: 95,         // their leftward speed (faster than world)

  /* ---- Frost slow aura (around cured Frost-villagers briefly) ---- */
  frostSlowRadius: 90,
  frostSlowFactor: 0.35,
  frostSlowDurationSec: 2.0,

  /* ---- Fireball physics ---- */
  fireballLifespanSec: 2.5,
  fireballHitPadding: 6,
  fireballGravity: 380,        // px/sec² downward (gives the arc)
  fireballDefaultArc: 0.45,    // upward kick fraction of speed for default shots

  /* ---- World / scrolling ---- */
  scrollSpeed: 75,             // px/sec, the world flows left at this rate
  districtDurationSec: 45,     // each district lasts ~this long of scrolling
  // Computed: scrollSpeed * districtDurationSec ≈ 3375 px per district

  /* ---- Dragon flight area ---- */
  groundFraction: 0.72,        // ground line at 72% of screen height
  dragonHorizBandMin: 0.18,    // dragon can move left/right between these fractions
  dragonHorizBandMax: 0.55,    // of viewport width
  dragonTopMargin: 30,
  dragonBottomMargin: 20,      // gap above ground line

  /* ---- Dragon roster ---- */
  // Per-dragon stats. shootInterval = seconds between auto-fires.
  dragons: {
    ember:  { name: 'Ember',  color: '#e74c3c', wing: '#a93226', belly: '#fadbd8', tag: 'Fast fire',     shootInterval: 0.48, moveSpeed: 240, fireballSpeed: 440, fireballSize: 9 },
    frost:  { name: 'Frost',  color: '#3498db', wing: '#1f618d', belly: '#d6eaf8', tag: 'Chilly puffs',  shootInterval: 0.85, moveSpeed: 220, fireballSpeed: 400, fireballSize: 10, slowAura: true },
    sprout: { name: 'Sprout', color: '#27ae60', wing: '#196f3d', belly: '#d4efdf', tag: 'Double puff',   shootInterval: 0.85, moveSpeed: 220, fireballSpeed: 400, fireballSize: 7,  doublePuff: true },
    sunny:  { name: 'Sunny',  color: '#f1c40f', wing: '#b7950b', belly: '#fcf3cf', tag: 'Speedy & strong', shootInterval: 0.65, moveSpeed: 300, fireballSpeed: 470, fireballSize: 13 },
    prism:  { name: 'Prism',  color: 'rainbow', wing: '#7a4ab8', belly: '#fff8e8', tag: 'Rainbow magic',  shootInterval: 0.55, moveSpeed: 270, fireballSpeed: 450, fireballSize: 11, rainbow: true },
  },
  // Display order in the picker
  dragonOrder: ['ember', 'frost', 'sprout', 'sunny', 'prism'],

  /* ---- District spawn rates (multiplier applied per district) ---- */
  // Some districts feel a touch busier than others.
  districtSpawnMul: {
    village: 1.0,
    farm: 0.95,
    forest: 1.1,
    river: 0.9,
    castle: 1.15,
  },

  /* ---- Castle bedroom / hallway / weight room (Round 3a) ---- */
  castle: {
    // Rhythm mini-game
    rhythmTempoSec: 1.2,           // seconds between tap targets
    rhythmSessionSec: 30,          // total mini-game duration
    rhythmTargetTravelSec: 3.4,    // how long each target takes to cross the track
    rhythmPerfectWindowMs: 150,    // ms window for PERFECT timing
    rhythmGoodWindowMs: 400,       // ms window for GOOD timing
    perfectReps: 2,                // reps awarded per PERFECT hit
    goodReps: 1,                   // reps awarded per GOOD hit
    // Muscle tiers (lifetime reps for that dragon)
    muscleTier1: 30,
    muscleTier2: 80,
    muscleTier3: 200,
    tierNames: ['', 'Strong', 'Mighty', 'LEGENDARY'],
    // Room transitions
    transitionWalkSec: 0.55,       // dragon walk-to-door animation
    transitionFadeSec: 0.25,       // fade between rooms
  },
};

/* ============================================================
   PLAYER CHECK
   ============================================================ */
const player = localStorage.getItem('arcade-current-player');
if (!player) {
  window.location.href = '/';
  throw new Error('No player — redirecting');
}

/* ============================================================
   LOCAL STORAGE
   ============================================================ */
const KEYS = {
  highScore:      () => `dragons-vs-zombies:${player}:highScore`,
  totalCured:     () => `dragons-vs-zombies:${player}:totalCured`,
  biggestStage:   () => `dragons-vs-zombies:${player}:biggestStage`,
  controlMode:    () => `dragons-vs-zombies:${player}:controlMode`,
  favoriteDragon: () => `dragons-vs-zombies:${player}:favoriteDragon`,
  muted:          () => `dragons-vs-zombies:${player}:muted`,
  prismSeen:      () => `dragons-vs-zombies:${player}:prismSeen`,
  prismUnlocked:  () => `dragons-vs-zombies:prismUnlocked`,
  // Castle weight room — per-dragon lifetime reps for this player
  dragonReps:     (id) => `dragons-vs-zombies:${player}:reps:${id}`,
};
function readNum(k, def = 0) { const v = localStorage.getItem(k); return v == null ? def : (Number(v) || 0); }
function readStr(k, def = '') { const v = localStorage.getItem(k); return v == null ? def : v; }
function readBool(k, def = false) { const v = localStorage.getItem(k); return v == null ? def : v === 'true'; }
function writeStr(k, v) { localStorage.setItem(k, String(v)); }

/* ============================================================
   AUDIO — Web Audio API, mute toggle, default-off until tap
   ============================================================ */
let actx = null;
let audioUnlocked = false;
let muted = readBool(KEYS.muted(), true);
let bgHumOsc = null;
let bgHumGain = null;

function ensureAudio() {
  if (actx) return;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  actx = new C();
}
function unlockAudioOnGesture() {
  ensureAudio();
  if (!actx) return;
  if (actx.state === 'suspended') actx.resume();
  audioUnlocked = true;
  if (!muted) startBgHum();
}
function tone(freq, dur, type = 'sine', vol = 0.12, attack = 0.01) {
  if (muted || !actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function slide(f0, f1, dur, type = 'sine', vol = 0.12) {
  if (muted || !actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  puff:    () => tone(360 + Math.random() * 80, 0.14, 'triangle', 0.08, 0.005),
  cure:    () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.09), i * 40)); },
  levelUp: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.11), i * 90)); },
  yawn:    () => slide(420, 160, 0.9, 'sine', 0.16),
  thud:    () => tone(120, 0.10, 'sine', 0.06),
  district:() => { [659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'sine', 0.08), i * 80)); },
  uhOh:    () => { tone(330, 0.10, 'sine', 0.05); setTimeout(() => tone(247, 0.14, 'sine', 0.05), 110); },
};
function startBgHum() {
  if (muted || !actx || bgHumOsc) return;
  bgHumOsc = actx.createOscillator();
  bgHumGain = actx.createGain();
  bgHumOsc.type = 'sine';
  bgHumOsc.frequency.value = 110;
  bgHumGain.gain.value = 0.012;
  bgHumOsc.connect(bgHumGain); bgHumGain.connect(actx.destination);
  bgHumOsc.start();
}
function stopBgHum() {
  if (bgHumOsc) { try { bgHumOsc.stop(); } catch (e) {} bgHumOsc = null; bgHumGain = null; }
}

/* ============================================================
   CANVAS / RESIZE
   ============================================================ */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let cssW = 0, cssH = 0, dpr = 1;
function resize() {
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

function groundLineY() { return cssH * CONFIG.groundFraction; }

/* ============================================================
   GAME STATE
   ============================================================ */
let screen = 'dragonPicker';
let selectedDragonId = readStr(KEYS.favoriteDragon(), 'ember');
// Migration: ignore old sunnyUnlocked. All 4 starters are always available.
if (!CONFIG.dragons[selectedDragonId]) selectedDragonId = 'ember';
let selectedMode = readStr(KEYS.controlMode(), 'auto');

const game = {
  dragon: null,
  zombies: [],
  fireballs: [],
  cured: [],
  particles: [],
  scenery: [],
  speeches: [], // {targetId, text, until}

  score: 0,
  stage: 1,
  meter: 0,

  spawnTimer: 0,
  shootTimer: 0,
  manualCooldown: 0,
  wave: 1,
  waveTimer: 0,
  elapsed: 0,

  napping: false,

  // World scrolling
  scrollX: 0,
  lastSceneryX: 0,            // rightmost end of last scenery placed
  lastDistrictIdx: -1,
  // Forced castle placements: one castle per Castle Approach pass.
  castlesPlacedThroughPass: -1,
};

let nextEntityId = 1;

/* ============================================================
   DISTRICTS
   ============================================================ */
const DISTRICTS = [
  {
    id: 'village',
    name: 'Village Square',
    emoji: '🏘️',
    skyTop: '#cfe8ff', skyBottom: '#ffe6c4',
    ground: '#9bc78a', groundDark: '#6fa55c',
    sceneryTypes: ['cottage', 'well', 'marketStall', 'sign', 'flowers'],
  },
  {
    id: 'farm',
    name: 'Farm',
    emoji: '🚜',
    skyTop: '#d0e8ff', skyBottom: '#fff0c0',
    ground: '#a8c878', groundDark: '#7ea052',
    sceneryTypes: ['barn', 'haystack', 'windmill', 'scarecrow', 'fence'],
  },
  {
    id: 'forest',
    name: 'Forest Path',
    emoji: '🌳',
    skyTop: '#b9d8e6', skyBottom: '#d8e8b8',
    ground: '#7a9c5a', groundDark: '#577a3c',
    sceneryTypes: ['tree', 'bigTree', 'mushroom', 'bridge', 'fern'],
  },
  {
    id: 'river',
    name: 'Riverside',
    emoji: '🌊',
    skyTop: '#bce0f0', skyBottom: '#dff0f8',
    ground: '#7eb4cc', groundDark: '#5a8aa4',
    sceneryTypes: ['dock', 'boat', 'watermill', 'reeds', 'lilypad'],
  },
  {
    id: 'castle',
    name: 'Castle Approach',
    emoji: '🏰',
    skyTop: '#f0c890', skyBottom: '#fde0c0',
    ground: '#a89888', groundDark: '#7a6c5c',
    sceneryTypes: ['stoneWall', 'banner', 'lantern', 'pavedSign', 'flagPole'],
  },
];
function districtPixels() { return CONFIG.scrollSpeed * CONFIG.districtDurationSec; }
function districtIndexAt(worldX) {
  const d = districtPixels();
  return Math.floor(worldX / d) % DISTRICTS.length;
}
function districtAt(worldX) { return DISTRICTS[districtIndexAt(worldX)]; }

/* ============================================================
   COLOR HELPERS
   ============================================================ */
function hexToRgb(h) {
  const c = h.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const t = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + t(r) + t(g) + t(b);
}
function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

// Returns interpolated district colors at a given worldX.
// Smoothly blends near district boundaries so transitions feel seamless.
function getDistrictColors(worldX) {
  const dp = districtPixels();
  const idx = districtIndexAt(worldX);
  const cur = DISTRICTS[idx];
  const nextIdx = (idx + 1) % DISTRICTS.length;
  const nxt = DISTRICTS[nextIdx];
  const localProgress = (worldX % dp) / dp;
  const blendStart = 0.85;
  let t = 0;
  if (localProgress > blendStart) t = smoothstep((localProgress - blendStart) / (1 - blendStart));
  return {
    skyTop:     lerpColor(cur.skyTop,     nxt.skyTop,     t),
    skyBottom:  lerpColor(cur.skyBottom,  nxt.skyBottom,  t),
    ground:     lerpColor(cur.ground,     nxt.ground,     t),
    groundDark: lerpColor(cur.groundDark, nxt.groundDark, t),
  };
}

/* ============================================================
   SCENERY DEFINITIONS
   For each type: draw fn, footprint width, optional zombie spawn anchor.
   ============================================================ */
const SCENERY = {
  /* ---------- Village ---------- */
  cottage: {
    width: 130,
    canSpawnZombie: true, spawnAnchorX: 50,
    draw: (sx, gy, time, props) => {
      const w = 100, h = 70;
      const x = sx, baseY = gy;
      // Wall
      ctx.fillStyle = props.wall || '#f4d8b8';
      ctx.fillRect(x, baseY - h, w, h);
      // Roof (thatched)
      ctx.fillStyle = '#b07b50';
      ctx.beginPath();
      ctx.moveTo(x - 12, baseY - h);
      ctx.lineTo(x + w / 2, baseY - h - 38);
      ctx.lineTo(x + w + 12, baseY - h);
      ctx.closePath();
      ctx.fill();
      // Thatch lines
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const yy = baseY - h - 10 - i * 7;
        ctx.beginPath();
        const span = (h + 38 - 10 - i * 7) / (h + 38) * (w + 24) / 2;
        ctx.moveTo(x + w / 2 - span, yy);
        ctx.lineTo(x + w / 2 + span, yy);
        ctx.stroke();
      }
      // Door
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x + w * 0.4, baseY - h * 0.6, w * 0.22, h * 0.6);
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(x + w * 0.4, baseY - 2, w * 0.22, 2);
      // Window
      ctx.fillStyle = '#fff5d0';
      ctx.fillRect(x + w * 0.12, baseY - h * 0.65, w * 0.2, h * 0.22);
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + w * 0.12, baseY - h * 0.65, w * 0.2, h * 0.22);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.22, baseY - h * 0.65);
      ctx.lineTo(x + w * 0.22, baseY - h * 0.43);
      ctx.moveTo(x + w * 0.12, baseY - h * 0.54);
      ctx.lineTo(x + w * 0.32, baseY - h * 0.54);
      ctx.stroke();
    },
    randomize: () => ({ wall: ['#f4d8b8', '#f0c8a0', '#e8d2a8', '#f5dcc0'][Math.floor(Math.random() * 4)] }),
  },
  well: {
    width: 60, canSpawnZombie: true, spawnAnchorX: 30,
    draw: (sx, gy, time) => {
      const x = sx + 30, baseY = gy;
      // Stones
      ctx.fillStyle = '#9a9088';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 8, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7e7468';
      ctx.fillRect(x - 22, baseY - 24, 44, 16);
      ctx.fillStyle = '#5a5448';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 24, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Roof posts
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x - 20, baseY - 60, 4, 36);
      ctx.fillRect(x + 16, baseY - 60, 4, 36);
      // Roof
      ctx.fillStyle = '#8a4f30';
      ctx.beginPath();
      ctx.moveTo(x - 28, baseY - 60);
      ctx.lineTo(x, baseY - 78);
      ctx.lineTo(x + 28, baseY - 60);
      ctx.closePath();
      ctx.fill();
    },
  },
  marketStall: {
    width: 110, canSpawnZombie: true, spawnAnchorX: 40,
    draw: (sx, gy, time, props) => {
      const x = sx, baseY = gy, w = 90;
      // Posts
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x, baseY - 60, 5, 60);
      ctx.fillRect(x + w - 5, baseY - 60, 5, 60);
      // Awning (striped)
      const stripes = props.stripes || ['#e74c3c', '#fff'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = stripes[i % 2];
        ctx.beginPath();
        ctx.moveTo(x - 6 + i * (w + 12) / 6, baseY - 60);
        ctx.lineTo(x - 6 + (i + 1) * (w + 12) / 6, baseY - 60);
        ctx.lineTo(x - 6 + (i + 1) * (w + 12) / 6 - 4, baseY - 52);
        ctx.lineTo(x - 6 + i * (w + 12) / 6 - 4, baseY - 52);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = stripes[0];
      ctx.fillRect(x - 6, baseY - 60, w + 12, 4);
      // Counter
      ctx.fillStyle = '#b89272';
      ctx.fillRect(x, baseY - 28, w, 8);
      ctx.fillStyle = '#8a6448';
      ctx.fillRect(x, baseY - 20, w, 20);
      // Fruit/produce on counter
      const fruits = props.fruits || ['#e74c3c', '#f39c12', '#27ae60'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = fruits[i % fruits.length];
        ctx.beginPath();
        ctx.arc(x + 14 + i * 20, baseY - 32, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    randomize: () => ({
      stripes: [['#e74c3c', '#fff'], ['#3498db', '#fff'], ['#27ae60', '#fff'], ['#9b59b6', '#fff']][Math.floor(Math.random() * 4)],
    }),
  },
  sign: {
    width: 50, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 25, baseY = gy;
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x - 2, baseY - 50, 4, 50);
      // Sign panel
      ctx.fillStyle = '#d8b288';
      ctx.fillRect(x - 18, baseY - 50, 36, 18);
      ctx.strokeStyle = '#6a4a30';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 18, baseY - 50, 36, 18);
      // Squiggle text
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 14, baseY - 44);
      ctx.lineTo(x + 14, baseY - 44);
      ctx.moveTo(x - 14, baseY - 40);
      ctx.lineTo(x + 10, baseY - 40);
      ctx.stroke();
    },
  },
  flowers: {
    width: 40, canSpawnZombie: false,
    draw: (sx, gy, time, props) => {
      const x = sx + 20, baseY = gy;
      const colors = props.colors || ['#e74c3c', '#f39c12', '#9b59b6'];
      for (let i = 0; i < 5; i++) {
        const fx = x - 14 + (i * 7) + (i % 2) * 2;
        const fy = baseY - 8 - (i % 3) * 3;
        // Stem
        ctx.strokeStyle = '#27ae60';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, baseY);
        ctx.lineTo(fx, fy + 2);
        ctx.stroke();
        // Petal
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        // Center
        ctx.fillStyle = '#fde66c';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    randomize: () => ({ colors: [['#e74c3c', '#fff'], ['#f39c12', '#fff'], ['#9b59b6', '#fff'], ['#3498db', '#fff']][Math.floor(Math.random() * 4)] }),
  },

  /* ---------- Farm ---------- */
  barn: {
    width: 160, canSpawnZombie: true, spawnAnchorX: 80,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy, w = 140, h = 90;
      // Walls
      ctx.fillStyle = '#c1392b';
      ctx.fillRect(x, baseY - h, w, h);
      // White trim along bottom
      ctx.fillStyle = '#f8f0e8';
      ctx.fillRect(x, baseY - 6, w, 6);
      // Roof
      ctx.fillStyle = '#5a3a22';
      ctx.beginPath();
      ctx.moveTo(x - 14, baseY - h);
      ctx.lineTo(x + w / 2, baseY - h - 36);
      ctx.lineTo(x + w + 14, baseY - h);
      ctx.closePath();
      ctx.fill();
      // Big doors (cross pattern)
      ctx.fillStyle = '#7a2418';
      ctx.fillRect(x + w * 0.32, baseY - h * 0.75, w * 0.36, h * 0.75);
      ctx.strokeStyle = '#f8f0e8';
      ctx.lineWidth = 3;
      const dx = x + w * 0.32, dy = baseY - h * 0.75, dw = w * 0.36, dh = h * 0.75;
      ctx.beginPath();
      ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy + dh);
      ctx.moveTo(dx + dw, dy); ctx.lineTo(dx, dy + dh);
      ctx.moveTo(dx + dw / 2, dy); ctx.lineTo(dx + dw / 2, dy + dh);
      ctx.moveTo(dx, dy + dh / 2); ctx.lineTo(dx + dw, dy + dh / 2);
      ctx.stroke();
      // Hayloft window
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(x + w * 0.45, baseY - h - 20, w * 0.1, 12);
    },
  },
  haystack: {
    width: 60, canSpawnZombie: true, spawnAnchorX: 30,
    draw: (sx, gy, time) => {
      const x = sx + 30, baseY = gy;
      ctx.fillStyle = '#dbb24a';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 8, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8c060';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 20, 22, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0d078';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 32, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Hay strands
      ctx.strokeStyle = '#a07b30';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const hx = x - 18 + i * 7;
        ctx.beginPath();
        ctx.moveTo(hx, baseY - 16);
        ctx.lineTo(hx + 3, baseY - 22);
        ctx.stroke();
      }
    },
  },
  windmill: {
    width: 90, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 45, baseY = gy;
      // Tower
      ctx.fillStyle = '#cabba0';
      ctx.beginPath();
      ctx.moveTo(x - 14, baseY);
      ctx.lineTo(x - 10, baseY - 90);
      ctx.lineTo(x + 10, baseY - 90);
      ctx.lineTo(x + 14, baseY);
      ctx.closePath();
      ctx.fill();
      // Roof
      ctx.fillStyle = '#7a4a30';
      ctx.beginPath();
      ctx.moveTo(x - 12, baseY - 90);
      ctx.lineTo(x, baseY - 102);
      ctx.lineTo(x + 12, baseY - 90);
      ctx.closePath();
      ctx.fill();
      // Door
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - 5, baseY - 20, 10, 20);
      // Blades (rotating)
      const cx = x, cy = baseY - 84;
      const rot = time * 0.8;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = '#f8f0e8';
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(30, -4);
        ctx.lineTo(30, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#7a4a30';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },
  scarecrow: {
    width: 50, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 25, baseY = gy;
      const sway = Math.sin(time * 1.2) * 2;
      // Pole
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x - 2, baseY - 60, 4, 60);
      // Arms (cross-pole)
      ctx.fillRect(x - 22, baseY - 48, 44, 4);
      // Body (shirt)
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(x - 12 + sway * 0.3, baseY - 50, 24, 24);
      // Head
      ctx.fillStyle = '#e8c060';
      ctx.beginPath();
      ctx.arc(x + sway, baseY - 60, 10, 0, Math.PI * 2);
      ctx.fill();
      // Hat
      ctx.fillStyle = '#8a4a20';
      ctx.beginPath();
      ctx.ellipse(x + sway, baseY - 68, 14, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a05a28';
      ctx.beginPath();
      ctx.ellipse(x + sway, baseY - 72, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Face
      ctx.fillStyle = '#3a2412';
      ctx.beginPath();
      ctx.arc(x - 3 + sway, baseY - 61, 1, 0, Math.PI * 2);
      ctx.arc(x + 3 + sway, baseY - 61, 1, 0, Math.PI * 2);
      ctx.fill();
      // Mouth (sewn smile)
      ctx.strokeStyle = '#3a2412';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + sway, baseY - 58, 3, 0.2, Math.PI - 0.2);
      ctx.stroke();
    },
  },
  fence: {
    width: 80, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy;
      ctx.fillStyle = '#d4b890';
      // Horizontal rails
      ctx.fillRect(x, baseY - 28, 80, 4);
      ctx.fillRect(x, baseY - 16, 80, 4);
      // Posts
      for (let i = 0; i <= 4; i++) {
        ctx.fillRect(x + i * 20 - 2, baseY - 36, 4, 36);
        // Pointy top
        ctx.beginPath();
        ctx.moveTo(x + i * 20 - 2, baseY - 36);
        ctx.lineTo(x + i * 20, baseY - 40);
        ctx.lineTo(x + i * 20 + 2, baseY - 36);
        ctx.closePath();
        ctx.fill();
      }
    },
  },

  /* ---------- Forest ---------- */
  tree: {
    width: 60, canSpawnZombie: true, spawnAnchorX: 30,
    draw: (sx, gy, time) => {
      const x = sx + 30, baseY = gy;
      // Trunk
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x - 4, baseY - 38, 8, 38);
      // Foliage (overlapping circles)
      ctx.fillStyle = '#3a7a3a';
      ctx.beginPath();
      ctx.arc(x - 10, baseY - 40, 14, 0, Math.PI * 2);
      ctx.arc(x + 10, baseY - 40, 14, 0, Math.PI * 2);
      ctx.arc(x, baseY - 52, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f9c4f';
      ctx.beginPath();
      ctx.arc(x - 5, baseY - 48, 10, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  bigTree: {
    width: 120, canSpawnZombie: true, spawnAnchorX: 60,
    draw: (sx, gy, time) => {
      const x = sx + 60, baseY = gy;
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - 8, baseY - 80, 16, 80);
      // Branch knot
      ctx.fillStyle = '#3a2412';
      ctx.beginPath();
      ctx.arc(x - 4, baseY - 50, 3, 0, Math.PI * 2);
      ctx.fill();
      // Foliage
      ctx.fillStyle = '#3a7a3a';
      ctx.beginPath();
      ctx.arc(x - 22, baseY - 80, 22, 0, Math.PI * 2);
      ctx.arc(x + 22, baseY - 80, 22, 0, Math.PI * 2);
      ctx.arc(x, baseY - 100, 26, 0, Math.PI * 2);
      ctx.arc(x - 14, baseY - 95, 18, 0, Math.PI * 2);
      ctx.arc(x + 14, baseY - 95, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f9c4f';
      ctx.beginPath();
      ctx.arc(x - 6, baseY - 100, 14, 0, Math.PI * 2);
      ctx.arc(x + 10, baseY - 92, 12, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  mushroom: {
    width: 40, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 20, baseY = gy;
      ctx.fillStyle = '#f0e8d0';
      ctx.fillRect(x - 3, baseY - 14, 6, 14);
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 16, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Spots
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 4, baseY - 18, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 3, baseY - 16, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 5, baseY - 20, 1, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  bridge: {
    width: 100, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy;
      // Bridge deck (arched)
      ctx.fillStyle = '#8a6448';
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + 50, baseY - 18, x + 100, baseY);
      ctx.lineTo(x + 100, baseY + 4);
      ctx.lineTo(x, baseY + 4);
      ctx.closePath();
      ctx.fill();
      // Plank lines
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 10; i++) {
        const px = x + i * 10 + 5;
        const py = baseY - 18 + Math.abs(i - 4.5) * 2;
        ctx.beginPath();
        ctx.moveTo(px, baseY);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      // Railings
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x, baseY - 26, 4, 26);
      ctx.fillRect(x + 96, baseY - 26, 4, 26);
      // Railing top
      ctx.beginPath();
      ctx.moveTo(x, baseY - 26);
      ctx.quadraticCurveTo(x + 50, baseY - 38, x + 100, baseY - 26);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6a4a30';
      ctx.stroke();
    },
  },
  fern: {
    width: 40, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 20, baseY = gy;
      ctx.strokeStyle = '#3a7a3a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        const ang = -Math.PI / 2 + i * 0.35;
        const tx = x + Math.cos(ang) * 18;
        const ty = baseY + Math.sin(ang) * 18;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + Math.cos(ang) * 8, baseY + Math.sin(ang) * 16, tx, ty);
        ctx.stroke();
      }
    },
  },

  /* ---------- Riverside ---------- */
  dock: {
    width: 100, canSpawnZombie: true, spawnAnchorX: 50,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy;
      // Posts (in the water)
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x + 10, baseY - 12, 5, 12);
      ctx.fillRect(x + 50, baseY - 12, 5, 12);
      ctx.fillRect(x + 90, baseY - 12, 5, 12);
      // Planking
      ctx.fillStyle = '#8a6448';
      ctx.fillRect(x, baseY - 16, 100, 6);
      // Plank lines
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 17 + 5, baseY - 16);
        ctx.lineTo(x + i * 17 + 5, baseY - 10);
        ctx.stroke();
      }
    },
  },
  boat: {
    width: 110, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 55, baseY = gy;
      const bob = Math.sin(time * 1.5 + sx * 0.01) * 2;
      // Hull
      ctx.fillStyle = '#a55a30';
      ctx.beginPath();
      ctx.moveTo(x - 40, baseY - 4 + bob);
      ctx.quadraticCurveTo(x - 50, baseY + 8 + bob, x - 30, baseY + 12 + bob);
      ctx.lineTo(x + 30, baseY + 12 + bob);
      ctx.quadraticCurveTo(x + 50, baseY + 8 + bob, x + 40, baseY - 4 + bob);
      ctx.closePath();
      ctx.fill();
      // Stripe
      ctx.fillStyle = '#f8f0e8';
      ctx.fillRect(x - 40, baseY - 2 + bob, 80, 3);
      // Mast
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(x - 2, baseY - 50 + bob, 4, 46);
      // Sail
      ctx.fillStyle = '#f8f0e8';
      ctx.beginPath();
      ctx.moveTo(x + 2, baseY - 48 + bob);
      ctx.quadraticCurveTo(x + 30, baseY - 30 + bob, x + 2, baseY - 8 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
  },
  watermill: {
    width: 120, canSpawnZombie: true, spawnAnchorX: 60,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy, w = 80, h = 70;
      // Building
      ctx.fillStyle = '#cabba0';
      ctx.fillRect(x, baseY - h, w, h);
      // Roof
      ctx.fillStyle = '#7a4a30';
      ctx.beginPath();
      ctx.moveTo(x - 10, baseY - h);
      ctx.lineTo(x + w / 2, baseY - h - 30);
      ctx.lineTo(x + w + 10, baseY - h);
      ctx.closePath();
      ctx.fill();
      // Door
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x + w * 0.15, baseY - h * 0.6, w * 0.22, h * 0.6);
      // Window
      ctx.fillStyle = '#fff5d0';
      ctx.fillRect(x + w * 0.55, baseY - h * 0.65, w * 0.25, h * 0.22);
      // Water wheel (right side, turning)
      const cx = x + w + 22, cy = baseY - 18;
      const r = 26;
      const rot = -time * 0.7;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = '#8a6448';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a22';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * Math.PI * 2);
        ctx.fillRect(-2, -r, 4, r * 2);
        ctx.fillRect(-r * 0.95, -3, 6, 6);
        ctx.restore();
      }
      ctx.fillStyle = '#3a2412';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },
  reeds: {
    width: 50, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 25, baseY = gy;
      ctx.strokeStyle = '#3a7a3a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {
        const rx = x + i * 4;
        const sway = Math.sin(time * 1.5 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(rx, baseY);
        ctx.quadraticCurveTo(rx + sway / 2, baseY - 15, rx + sway, baseY - 28);
        ctx.stroke();
      }
      // Tips
      ctx.fillStyle = '#7a5230';
      for (let i = -3; i <= 3; i++) {
        const rx = x + i * 4;
        const sway = Math.sin(time * 1.5 + i) * 3;
        ctx.beginPath();
        ctx.ellipse(rx + sway, baseY - 30, 1.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  lilypad: {
    width: 50, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 25, baseY = gy;
      ctx.fillStyle = '#4f9c4f';
      ctx.beginPath();
      ctx.ellipse(x, baseY - 4, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a7a3a';
      ctx.beginPath();
      ctx.moveTo(x, baseY - 4);
      ctx.lineTo(x + 4, baseY - 7);
      ctx.lineTo(x + 1, baseY - 4);
      ctx.closePath();
      ctx.fill();
      // Flower
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 6, baseY - 7, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde66c';
      ctx.beginPath();
      ctx.arc(x - 6, baseY - 7, 1, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  /* ---------- Castle Approach ---------- */
  stoneWall: {
    width: 80, canSpawnZombie: true, spawnAnchorX: 40,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy;
      ctx.fillStyle = '#a8a098';
      ctx.fillRect(x, baseY - 30, 80, 30);
      // Stone blocks
      ctx.strokeStyle = '#7a7268';
      ctx.lineWidth = 1;
      for (let row = 0; row < 3; row++) {
        const offset = row % 2 ? 10 : 0;
        const y = baseY - 30 + row * 10;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + 80, y);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + offset + i * 20, y);
          ctx.lineTo(x + offset + i * 20, y + 10);
          ctx.stroke();
        }
      }
      // Crenellations on top
      ctx.fillStyle = '#a8a098';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + 4 + i * 20, baseY - 38, 12, 8);
      }
    },
  },
  banner: {
    width: 36, canSpawnZombie: false,
    draw: (sx, gy, time, props) => {
      const x = sx + 18, baseY = gy;
      const wave = Math.sin(time * 2 + sx * 0.02) * 3;
      // Pole
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - 1.5, baseY - 80, 3, 80);
      // Flag
      ctx.fillStyle = props.color || '#9b59b6';
      ctx.beginPath();
      ctx.moveTo(x + 1, baseY - 78);
      ctx.lineTo(x + 22, baseY - 74 + wave);
      ctx.lineTo(x + 26, baseY - 64 + wave);
      ctx.lineTo(x + 22, baseY - 56 + wave);
      ctx.lineTo(x + 1, baseY - 54);
      ctx.closePath();
      ctx.fill();
    },
    randomize: () => ({ color: ['#9b59b6', '#e74c3c', '#3498db', '#27ae60', '#f1c40f'][Math.floor(Math.random() * 5)] }),
  },
  lantern: {
    width: 32, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 16, baseY = gy;
      const flick = 1 + Math.sin(time * 8 + sx) * 0.08;
      // Post
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(x - 1.5, baseY - 60, 3, 60);
      ctx.beginPath();
      ctx.moveTo(x, baseY - 60);
      ctx.lineTo(x + 8, baseY - 62);
      ctx.lineTo(x + 8, baseY - 64);
      ctx.lineTo(x, baseY - 62);
      ctx.closePath();
      ctx.fill();
      // Lantern body
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(x + 4, baseY - 58, 9, 12);
      // Glow
      ctx.fillStyle = `rgba(255, 220, 130, ${0.55 * flick})`;
      ctx.beginPath();
      ctx.arc(x + 8, baseY - 52, 14 * flick, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd76b';
      ctx.fillRect(x + 6, baseY - 56, 5, 8);
    },
  },
  pavedSign: {
    width: 50, canSpawnZombie: false,
    draw: (sx, gy, time) => {
      const x = sx + 25, baseY = gy;
      // Stone post
      ctx.fillStyle = '#9a9088';
      ctx.fillRect(x - 4, baseY - 36, 8, 36);
      // Arrow pointer
      ctx.fillStyle = '#cabba0';
      ctx.beginPath();
      ctx.moveTo(x - 18, baseY - 34);
      ctx.lineTo(x + 12, baseY - 34);
      ctx.lineTo(x + 16, baseY - 28);
      ctx.lineTo(x + 12, baseY - 22);
      ctx.lineTo(x - 18, baseY - 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a5448';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Tiny castle pictogram
      ctx.fillStyle = '#5a5448';
      ctx.fillRect(x - 8, baseY - 32, 12, 8);
      ctx.fillRect(x - 8, baseY - 33, 2, 2);
      ctx.fillRect(x - 4, baseY - 33, 2, 2);
      ctx.fillRect(x, baseY - 33, 2, 2);
    },
  },
  flagPole: {
    width: 30, canSpawnZombie: false,
    draw: (sx, gy, time, props) => {
      const x = sx + 15, baseY = gy;
      const wave = Math.sin(time * 2 + sx * 0.02) * 3;
      ctx.fillStyle = '#9a9088';
      ctx.fillRect(x - 1.5, baseY - 70, 3, 70);
      // Triangular pennant
      ctx.fillStyle = props.color || '#9b59b6';
      ctx.beginPath();
      ctx.moveTo(x + 1, baseY - 68);
      ctx.lineTo(x + 20, baseY - 60 + wave);
      ctx.lineTo(x + 1, baseY - 52);
      ctx.closePath();
      ctx.fill();
    },
    randomize: () => ({ color: ['#9b59b6', '#e74c3c', '#3498db', '#27ae60', '#f1c40f'][Math.floor(Math.random() * 5)] }),
  },

  /* ---------- The white castle (forced placement in Castle Approach) ---------- */
  whiteCastle: {
    width: 380, canSpawnZombie: true, spawnAnchorX: 190,
    draw: (sx, gy, time) => {
      const x = sx, baseY = gy;
      // Main keep body
      const keepW = 200, keepH = 200;
      const kx = x + 90;
      ctx.fillStyle = '#f5f1e8';
      ctx.fillRect(kx, baseY - keepH, keepW, keepH);
      // Shadow side (subtle)
      ctx.fillStyle = '#e6dfcf';
      ctx.fillRect(kx + keepW * 0.7, baseY - keepH, keepW * 0.3, keepH);
      // Stone seams (subtle)
      ctx.strokeStyle = 'rgba(120, 110, 95, 0.25)';
      ctx.lineWidth = 1;
      for (let row = 0; row < 8; row++) {
        const y = baseY - keepH + row * 25;
        ctx.beginPath();
        ctx.moveTo(kx, y); ctx.lineTo(kx + keepW, y);
        ctx.stroke();
      }
      // Crenellations atop keep
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = '#f5f1e8';
        ctx.fillRect(kx + 8 + i * 33, baseY - keepH - 12, 18, 12);
      }
      // Side towers
      const towerW = 60, towerH = 250;
      const drawTower = (tx) => {
        ctx.fillStyle = '#f5f1e8';
        ctx.fillRect(tx, baseY - towerH, towerW, towerH);
        ctx.fillStyle = '#e6dfcf';
        ctx.fillRect(tx + towerW * 0.7, baseY - towerH, towerW * 0.3, towerH);
        // Crenellations
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#f5f1e8';
          ctx.fillRect(tx + 4 + i * 19, baseY - towerH - 12, 14, 12);
        }
        // Conical cap (purple/blue)
        ctx.fillStyle = '#6d5fd6';
        ctx.beginPath();
        ctx.moveTo(tx - 6, baseY - towerH - 12);
        ctx.lineTo(tx + towerW / 2, baseY - towerH - 60);
        ctx.lineTo(tx + towerW + 6, baseY - towerH - 12);
        ctx.closePath();
        ctx.fill();
        // Tower window
        ctx.fillStyle = '#2a3050';
        ctx.fillRect(tx + towerW * 0.35, baseY - towerH * 0.7, towerW * 0.3, towerH * 0.12);
        ctx.fillRect(tx + towerW * 0.35, baseY - towerH * 0.45, towerW * 0.3, towerH * 0.12);
        // Flag on cap
        ctx.fillStyle = '#3a2412';
        ctx.fillRect(tx + towerW / 2 - 1, baseY - towerH - 90, 2, 30);
        ctx.fillStyle = '#e74c3c';
        const wave = Math.sin(time * 2.3 + tx * 0.05) * 2;
        ctx.beginPath();
        ctx.moveTo(tx + towerW / 2 + 1, baseY - towerH - 88);
        ctx.lineTo(tx + towerW / 2 + 16, baseY - towerH - 82 + wave);
        ctx.lineTo(tx + towerW / 2 + 1, baseY - towerH - 76);
        ctx.closePath();
        ctx.fill();
      };
      drawTower(x + 30);
      drawTower(x + 290);
      // Center spire (taller)
      const spX = kx + keepW / 2 - 30;
      const spW = 60, spH = 290;
      ctx.fillStyle = '#f5f1e8';
      ctx.fillRect(spX, baseY - spH, spW, spH);
      ctx.fillStyle = '#e6dfcf';
      ctx.fillRect(spX + spW * 0.7, baseY - spH, spW * 0.3, spH);
      // Spire crenellations
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#f5f1e8';
        ctx.fillRect(spX + 4 + i * 19, baseY - spH - 12, 14, 12);
      }
      // Center spire cap (big)
      ctx.fillStyle = '#6d5fd6';
      ctx.beginPath();
      ctx.moveTo(spX - 8, baseY - spH - 12);
      ctx.lineTo(spX + spW / 2, baseY - spH - 80);
      ctx.lineTo(spX + spW + 8, baseY - spH - 12);
      ctx.closePath();
      ctx.fill();
      // Big flag on top
      ctx.fillStyle = '#3a2412';
      ctx.fillRect(spX + spW / 2 - 1.5, baseY - spH - 130, 3, 50);
      ctx.fillStyle = '#e74c3c';
      const w2 = Math.sin(time * 2.3) * 3;
      ctx.beginPath();
      ctx.moveTo(spX + spW / 2 + 1.5, baseY - spH - 128);
      ctx.lineTo(spX + spW / 2 + 26, baseY - spH - 118 + w2);
      ctx.lineTo(spX + spW / 2 + 1.5, baseY - spH - 108);
      ctx.closePath();
      ctx.fill();

      // Portcullis (gate)
      const gx = kx + keepW / 2 - 30;
      const gW = 60, gH = 100;
      ctx.fillStyle = '#3a2412';
      ctx.beginPath();
      ctx.moveTo(gx, baseY);
      ctx.lineTo(gx, baseY - gH + 20);
      ctx.quadraticCurveTo(gx + gW / 2, baseY - gH - 8, gx + gW, baseY - gH + 20);
      ctx.lineTo(gx + gW, baseY);
      ctx.closePath();
      ctx.fill();
      // Portcullis bars
      ctx.strokeStyle = '#7a5530';
      ctx.lineWidth = 2;
      for (let i = 1; i < 6; i++) {
        const bx = gx + i * (gW / 6);
        ctx.beginPath();
        ctx.moveTo(bx, baseY);
        ctx.lineTo(bx, baseY - gH + 14);
        ctx.stroke();
      }
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(gx, baseY - i * 20);
        ctx.lineTo(gx + gW, baseY - i * 20);
        ctx.stroke();
      }
      // Keep windows
      ctx.fillStyle = '#2a3050';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(kx + 18 + i * 45, baseY - 160, 12, 22);
      }
      // Big shadow under the castle
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.ellipse(x + 190, baseY + 6, 200, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
};

/* ============================================================
   SCENERY PLACEMENT
   ============================================================ */
function maybeSpawnScenery() {
  const rightEdge = game.scrollX + cssW + 200;
  let safety = 200; // guard against runaway loop
  while (game.lastSceneryX < rightEdge && safety-- > 0) {
    spawnNextScenery();
  }
  // Despawn off-screen-left
  for (let i = game.scenery.length - 1; i >= 0; i--) {
    if (game.scenery[i].worldX + (SCENERY[game.scenery[i].type].width || 100) < game.scrollX - 50) {
      game.scenery.splice(i, 1);
    }
  }
}

function spawnNextScenery() {
  const d = districtPixels();
  // Check whether we should force-place a castle for the Castle Approach district pass
  const pass = Math.floor(game.lastSceneryX / (d * DISTRICTS.length));
  if (pass > game.castlesPlacedThroughPass) {
    // The castle for this pass should land near the middle of Castle Approach (district idx 4)
    const targetX = pass * d * DISTRICTS.length + 4 * d + d * 0.45;
    if (game.lastSceneryX >= targetX - 40 && game.lastSceneryX <= targetX + 200) {
      placeScenery('whiteCastle', Math.max(game.lastSceneryX + 40, targetX));
      game.castlesPlacedThroughPass = pass;
      return;
    } else if (game.lastSceneryX > targetX + 200) {
      // Missed window — place anyway
      placeScenery('whiteCastle', game.lastSceneryX + 40);
      game.castlesPlacedThroughPass = pass;
      return;
    }
  }
  // Normal scenery: pick from current district
  const district = districtAt(game.lastSceneryX);
  const type = district.sceneryTypes[Math.floor(Math.random() * district.sceneryTypes.length)];
  // Variable spacing between items
  const spacing = 30 + Math.random() * 80;
  placeScenery(type, game.lastSceneryX + spacing);
}

function placeScenery(type, worldX) {
  const def = SCENERY[type];
  const props = def.randomize ? def.randomize() : {};
  game.scenery.push({
    id: nextEntityId++,
    type, worldX, props,
    emergeT: 0, // can be used for an emerge animation hook
  });
  game.lastSceneryX = worldX + def.width;
}

/* ============================================================
   ENTITY FACTORIES
   ============================================================ */
function makeDragon() {
  const cfg = CONFIG.dragons[selectedDragonId];
  return {
    id: nextEntityId++,
    x: cssW * 0.30,
    y: cssH * 0.35,
    radius: 24,
    wingPhase: 0,
    config: cfg,
    flyUpProgress: 0,
  };
}
function makeZombie() {
  // Try to emerge from a scenery item that's off-screen-right and can spawn zombies
  const candidates = game.scenery.filter(s =>
    SCENERY[s.type].canSpawnZombie &&
    s.worldX > game.scrollX + cssW - 10 &&
    s.worldX < game.scrollX + cssW + 600
  );
  let spawnWorldX;
  let emergeFromX = null;
  if (candidates.length > 0) {
    const s = candidates[Math.floor(Math.random() * candidates.length)];
    const anchor = SCENERY[s.type].spawnAnchorX || 0;
    spawnWorldX = s.worldX + anchor;
    emergeFromX = s.worldX + anchor;
    // brief emerge animation: zombie starts a bit forward, with a fade in
  } else {
    spawnWorldX = game.scrollX + cssW + 60 + Math.random() * 140;
  }
  return {
    id: nextEntityId++,
    worldX: spawnWorldX,
    y: 0,                          // height above ground; >0 means hopping
    radius: 18,
    speed: zombieSpeedForWave(game.wave),
    walkPhase: Math.random() * Math.PI * 2,
    color: '#5cae5c',
    chatterCooldown: 1 + Math.random() * 3,
    touchCooldown: 0,
    nextHopAt: 0.8 + Math.random() * (CONFIG.hopIntervalMax - CONFIG.hopIntervalMin) + CONFIG.hopIntervalMin,
    hopT: 0,                       // 0..hopDurationSec if hopping, else 0
    hopFromY: 0,
    emergeAlpha: emergeFromX != null ? 0 : 1,
  };
}
function makeFireball(x, y, vx, vy, size, color, rainbow = false) {
  return {
    id: nextEntityId++,
    x, y, vx, vy,
    radius: size,
    color,
    life: 0,
    maxLife: CONFIG.fireballLifespanSec,
    rainbow,
    hue: Math.random() * 360,
    trail: [],
    age: 0,
  };
}
function makeCured(x, y, stage, color, slowAura = false) {
  return {
    id: nextEntityId++,
    x, y,
    stage,
    color,
    walkPhase: 0,
    age: 0,
    maxAge: CONFIG.curedExitDurationSec,
    slowAura,
    slowAuraUntil: slowAura ? (game.elapsed + CONFIG.frostSlowDurationSec) : 0,
  };
}
function makeSparkle(x, y, color = '#ffd76b', n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 80;
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
      life: 0.6 + Math.random() * 0.3,
      maxLife: 0.6 + Math.random() * 0.3,
      size: 4 + Math.random() * 3,
      color, type: 'sparkle',
    });
  }
}
function makePuff(x, y, color = '#fff') {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 40;
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.2,
      maxLife: 0.4 + Math.random() * 0.2,
      size: 5 + Math.random() * 4,
      color, type: 'cloud',
    });
  }
}
function makeRainbowTrail(x, y, hue) {
  game.particles.push({
    x, y, vx: 0, vy: 0,
    life: 0.35, maxLife: 0.35,
    size: 4,
    color: `hsl(${hue}, 80%, 60%)`,
    type: 'sparkle',
  });
}

function zombieSpeedForWave(w) {
  const s = CONFIG.baseZombieSpeed * Math.pow(CONFIG.zombieSpeedGrowthPerWave, w - 1);
  return Math.min(CONFIG.maxZombieSpeed, s);
}
function spawnIntervalForWave(w) {
  const v = CONFIG.baseSpawnInterval * Math.pow(CONFIG.spawnDecayPerWave, w - 1);
  return Math.max(CONFIG.minSpawnInterval, v);
}

/* ============================================================
   INPUT
   ============================================================ */
const heldKeys = new Set();
const pointer = {
  active: false,
  x: 0, y: 0,
  hadPointerEvent: false,
};

window.addEventListener('keydown', (e) => {
  if (screen !== 'playing') return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' '].includes(e.key)) {
    e.preventDefault();
  }
  heldKeys.add(e.key);
  if (e.key === ' ' && selectedMode === 'aim') shootTowardPointer();
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.key));

canvas.addEventListener('mousemove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.hadPointerEvent = true;
});
canvas.addEventListener('mousedown', (e) => {
  if (screen !== 'playing') return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.hadPointerEvent = true;
  if (selectedMode === 'aim') shootTowardPointer();
});
canvas.addEventListener('touchstart', (e) => {
  if (screen !== 'playing') return;
  e.preventDefault();
  const t = e.touches[0];
  pointer.active = true;
  pointer.x = t.clientX; pointer.y = t.clientY; pointer.hadPointerEvent = true;
  if (selectedMode === 'aim') shootTowardPointer();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  if (screen !== 'playing') return;
  e.preventDefault();
  const t = e.touches[0];
  pointer.x = t.clientX; pointer.y = t.clientY;
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  if (screen !== 'playing') return;
  e.preventDefault();
  pointer.active = false;
}, { passive: false });
canvas.addEventListener('touchcancel', (e) => {
  if (screen !== 'playing') return;
  e.preventDefault();
  pointer.active = false;
}, { passive: false });

function shootTowardPointer() {
  if (!game.dragon || game.napping) return;
  if (game.manualCooldown > 0) return;
  fireFromDragon(pointer.x, pointer.y);
  game.manualCooldown = game.dragon.config.shootInterval * 0.6;
}

/* ============================================================
   FIRING / TRAJECTORY
   ============================================================ */
function fireFromDragon(targetX, targetY) {
  const d = game.dragon;
  const cfg = d.config;
  const sizeMul = CONFIG.stageFireballSizeMul[game.stage - 1];
  const speedMul = CONFIG.stageFireballSpeedMul[game.stage - 1];
  const size  = cfg.fireballSize * sizeMul;
  const speed = cfg.fireballSpeed * speedMul;
  const color = cfg.rainbow ? '#ff5566' : cfg.color;
  // Default target if pointer is on or above the dragon: arc forward and down
  let tx = targetX, ty = targetY;
  if (tx - d.x < 30) {
    tx = d.x + 360;
    ty = groundLineY() - 20;
  }
  if (cfg.doublePuff) {
    const spread = 60;
    [-spread, spread].forEach(off => {
      const v = arcVelocity(d.x, d.y, tx, ty + off, speed);
      game.fireballs.push(makeFireball(d.x + 14, d.y + 8, v.vx, v.vy, size * 0.85, color, cfg.rainbow));
    });
  } else {
    const v = arcVelocity(d.x, d.y, tx, ty, speed);
    game.fireballs.push(makeFireball(d.x + 14, d.y + 8, v.vx, v.vy, size, color, cfg.rainbow));
  }
  makePuff(d.x + 18, d.y + 8);
  sfx.puff();
}
function arcVelocity(x0, y0, x1, y1, speed) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  // Estimate flight time at given speed
  const t = Math.max(0.18, dist / speed);
  const g = CONFIG.fireballGravity;
  // Solve for initial vy that hits target with gravity
  const vx = dx / t;
  let vy = (dy - 0.5 * g * t * t) / t;
  // Cap upward arc so it doesn't loop crazily for very close shots
  vy = Math.max(vy, -speed * 0.9);
  return { vx, vy };
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt) {
  game.elapsed += dt;
  game.manualCooldown = Math.max(0, game.manualCooldown - dt);

  if (game.napping) {
    updateScroll(dt);
    updateNapFlyUp(dt);
    updateParticles(dt);
    updateCured(dt);
    return;
  }

  // Passive sleepy drain — meter always ticks up so runs can't go forever
  game.meter = Math.min(CONFIG.sleepyMeterMax, game.meter + CONFIG.passiveSleepyPerSec * dt);
  updateMeterUI();
  if (game.meter >= CONFIG.sleepyMeterMax) { triggerNap(); return; }

  updateScroll(dt);
  updateDragon(dt);
  updateSpawning(dt);
  updateZombies(dt);
  updateFireballs(dt);
  updateCollisions(dt);
  updateCured(dt);
  updateParticles(dt);
  updateChatter(dt);
  updateWaves(dt);
  updateShooting(dt);
  checkDistrictTransition();
}

function updateScroll(dt) {
  game.scrollX += CONFIG.scrollSpeed * dt;
  maybeSpawnScenery();
}

function checkDistrictTransition() {
  const idx = districtIndexAt(game.scrollX + cssW * 0.5);
  if (idx !== game.lastDistrictIdx) {
    game.lastDistrictIdx = idx;
    if (game.elapsed > 0.5) showDistrictBanner(DISTRICTS[idx]);
  }
}

function updateDragon(dt) {
  const d = game.dragon;
  if (!d) return;
  let dx = 0, dy = 0;
  if (heldKeys.has('ArrowLeft')  || heldKeys.has('a') || heldKeys.has('A')) dx -= 1;
  if (heldKeys.has('ArrowRight') || heldKeys.has('d') || heldKeys.has('D')) dx += 1;
  if (heldKeys.has('ArrowUp')    || heldKeys.has('w') || heldKeys.has('W')) dy -= 1;
  if (heldKeys.has('ArrowDown')  || heldKeys.has('s') || heldKeys.has('S')) dy += 1;

  if (pointer.active) {
    const tx = pointer.x, ty = pointer.y;
    const ddx = tx - d.x, ddy = ty - d.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist > 8) { dx = ddx / dist; dy = ddy / dist; }
    else { dx = 0; dy = 0; }
  } else if (dx !== 0 || dy !== 0) {
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
  }
  const speed = d.config.moveSpeed;
  d.x += dx * speed * dt;
  d.y += dy * speed * dt;

  // Constrain to flight area
  const minX = cssW * CONFIG.dragonHorizBandMin;
  const maxX = cssW * CONFIG.dragonHorizBandMax;
  const minY = CONFIG.dragonTopMargin + d.radius;
  const maxY = groundLineY() - CONFIG.dragonBottomMargin - d.radius;
  d.x = Math.max(minX, Math.min(maxX, d.x));
  d.y = Math.max(minY, Math.min(maxY, d.y));
  d.wingPhase += dt * 9;
  d.radius = 24 * CONFIG.stageScales[game.stage - 1];
}

function updateSpawning(dt) {
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.zombies.push(makeZombie());
    const districtMul = CONFIG.districtSpawnMul[districtAt(game.scrollX + cssW / 2).id] || 1;
    game.spawnTimer = spawnIntervalForWave(game.wave) * districtMul;
  }
}

function updateZombies(dt) {
  const groundY = groundLineY();
  for (let i = game.zombies.length - 1; i >= 0; i--) {
    const z = game.zombies[i];
    z.touchCooldown = Math.max(0, z.touchCooldown - dt);
    z.chatterCooldown -= dt;
    z.emergeAlpha = Math.min(1, z.emergeAlpha + dt * 1.5);

    // Zombie walks leftward in world coords. Also subject to world scrolling.
    let speedMul = 1;
    for (const c of game.cured) {
      if (!c.slowAura) continue;
      if (game.elapsed > c.slowAuraUntil) continue;
      const sx = c.x;
      const zx = z.worldX - game.scrollX;
      if (Math.hypot(sx - zx, 0) < CONFIG.frostSlowRadius) {
        speedMul *= CONFIG.frostSlowFactor;
        break;
      }
    }
    z.worldX -= z.speed * speedMul * dt;
    z.walkPhase += dt * 4.5 * speedMul;

    // Hop logic
    if (z.hopT > 0) {
      z.hopT += dt;
      const tNorm = z.hopT / CONFIG.hopDurationSec;
      if (tNorm >= 1) {
        z.hopT = 0;
        z.y = 0;
        z.nextHopAt = CONFIG.hopIntervalMin + Math.random() * (CONFIG.hopIntervalMax - CONFIG.hopIntervalMin);
      } else {
        // Parabola: y peaks at center of hop
        z.y = Math.sin(tNorm * Math.PI) * CONFIG.hopHeight;
      }
    } else {
      z.nextHopAt -= dt;
      if (z.nextHopAt <= 0) {
        z.hopT = 0.001;
        z.hopFromY = 0;
      }
    }

    // Remove zombies that walked off the left — they "escaped" the puff.
    if (z.worldX - game.scrollX < -60) {
      game.zombies.splice(i, 1);
      game.speeches = game.speeches.filter(s => s.targetId !== z.id);
      game.meter = Math.min(CONFIG.sleepyMeterMax, game.meter + CONFIG.escapePenalty);
      updateMeterUI();
      sfx.uhOh();
      if (game.meter >= CONFIG.sleepyMeterMax) { triggerNap(); return; }
    }
  }
}

function updateFireballs(dt) {
  for (let i = game.fireballs.length - 1; i >= 0; i--) {
    const f = game.fireballs[i];
    f.life += dt;
    f.age += dt;
    // Gravity
    f.vy += CONFIG.fireballGravity * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    // Rainbow trail
    if (f.rainbow) {
      f.hue = (f.hue + dt * 360) % 360;
      makeRainbowTrail(f.x, f.y, f.hue);
    }
    // Despawn
    if (f.life > f.maxLife ||
        f.x < -50 || f.x > cssW + 50 ||
        f.y > groundLineY() + 8) {
      // Small poof when hitting the ground
      if (f.y > groundLineY() - 2) makePuff(f.x, groundLineY() - 4, '#fff5d0');
      game.fireballs.splice(i, 1);
    }
  }
}

function updateCollisions(dt) {
  const d = game.dragon;
  if (!d) return;
  const groundY = groundLineY();

  // Fireball ↔ zombie
  for (let i = game.fireballs.length - 1; i >= 0; i--) {
    const f = game.fireballs[i];
    let consumed = false;
    for (let j = game.zombies.length - 1; j >= 0; j--) {
      const z = game.zombies[j];
      const zx = z.worldX - game.scrollX;
      const zy = groundY - 20 - z.y;
      if (Math.hypot(f.x - zx, f.y - zy) < f.radius + z.radius + CONFIG.fireballHitPadding) {
        cureZombie(z, j);
        consumed = true;
        break;
      }
    }
    if (consumed) game.fireballs.splice(i, 1);
  }

  // Zombie ↔ dragon (only if zombie is hopping high enough to reach)
  for (const z of game.zombies) {
    if (z.touchCooldown > 0) continue;
    const zx = z.worldX - game.scrollX;
    const zy = groundY - 20 - z.y;
    if (Math.hypot(zx - d.x, zy - d.y) < z.radius + d.radius - 6) {
      game.meter = Math.min(CONFIG.sleepyMeterMax, game.meter + CONFIG.zombieTouchPenalty);
      updateMeterUI();
      z.touchCooldown = CONFIG.touchCooldownSec;
      // Pop a small shock effect
      makePuff(d.x, d.y, '#cfd8e8');
      sfx.thud();
      if (game.meter >= CONFIG.sleepyMeterMax) {
        triggerNap();
        return;
      }
    }
  }
}

function cureZombie(z, idx) {
  const palette = ['#ff9ec4', '#7fc9d9', '#ffd76b', '#a78bfa', '#8de0a4', '#f29849', '#e89cc7', '#ffb3a3'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const slowAura = !!game.dragon.config.slowAura;
  const groundY = groundLineY();
  const zx = z.worldX - game.scrollX;
  game.cured.push(makeCured(zx, groundY - 14, game.stage, color, slowAura));
  game.zombies.splice(idx, 1);
  game.speeches = game.speeches.filter(s => s.targetId !== z.id);

  game.score++;
  // Cures reward active play by trimming a little sleep
  game.meter = Math.max(0, game.meter - CONFIG.cureSleepyRelief);
  updateMeterUI();
  updateScoreUI();
  sfx.cure();
  makeSparkle(zx, groundY - 28, '#ffd76b');
  writeStr(KEYS.totalCured(), readNum(KEYS.totalCured(), 0) + 1);

  const nextThreshold = CONFIG.cureThresholds[game.stage - 1];
  if (nextThreshold != null && game.score >= nextThreshold) advanceStage();
}

function advanceStage() {
  game.stage++;
  if (game.stage > 5) game.stage = 5;
  updateStageUI();
  showGrewBanner();
  sfx.levelUp();
  const d = game.dragon;
  for (let i = 0; i < 4; i++) {
    setTimeout(() => makeSparkle(d.x + (Math.random() - 0.5) * 50, d.y + (Math.random() - 0.5) * 50, '#ffd76b'), i * 80);
  }
  const best = readNum(KEYS.biggestStage(), 1);
  if (game.stage > best) writeStr(KEYS.biggestStage(), game.stage);
  // First time hitting stage 5 on this device unlocks Prism
  if (game.stage === 5 && !readBool(KEYS.prismUnlocked(), false)) {
    writeStr(KEYS.prismUnlocked(), 'true');
  }
}

function updateCured(dt) {
  for (let i = game.cured.length - 1; i >= 0; i--) {
    const c = game.cured[i];
    c.age += dt;
    c.walkPhase += dt * 6;
    let speedMul = 1;
    if (c.stage === 1) speedMul = 0.55;
    else if (c.stage === 2) speedMul = 1.2;
    else if (c.stage === 3) speedMul = 1.4;
    else if (c.stage === 4) speedMul = 1.0;
    else speedMul = 0.45;
    c.x -= CONFIG.curedWalkSpeed * speedMul * dt;
    if (c.age >= c.maxAge || c.x < -60) {
      game.cured.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.life -= dt;
    if (p.life <= 0) { game.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    if (p.type === 'sparkle') p.vy += 80 * dt;
  }
}

function updateChatter(dt) {
  for (const z of game.zombies) {
    if (z.chatterCooldown > 0) continue;
    if (Math.random() < CONFIG.chatterChancePerSec * dt * 12) {
      const text = CONFIG.chatter[Math.floor(Math.random() * CONFIG.chatter.length)];
      game.speeches.push({
        targetId: z.id, text, until: game.elapsed + CONFIG.chatterDurationSec,
      });
      z.chatterCooldown = 4 + Math.random() * 5;
    }
  }
  game.speeches = game.speeches.filter(s => s.until > game.elapsed);
}

function updateWaves(dt) {
  game.waveTimer += dt;
  if (game.waveTimer >= CONFIG.waveDurationSec) {
    game.waveTimer = 0;
    game.wave++;
    const ns = zombieSpeedForWave(game.wave);
    for (const z of game.zombies) z.speed = ns;
    showWaveBanner();
  }
}

function updateShooting(dt) {
  if (selectedMode !== 'auto' || !game.dragon) return;
  const d = game.dragon;
  game.shootTimer -= dt;
  if (game.shootTimer > 0) return;
  // Find nearest zombie ahead of the dragon (to the right or near)
  const groundY = groundLineY();
  let target = null;
  let bestScore = Infinity;
  for (const z of game.zombies) {
    const zx = z.worldX - game.scrollX;
    if (zx < d.x - 20) continue; // ignore zombies behind
    const zy = groundY - 20 - z.y;
    const score = Math.hypot(zx - d.x, zy - d.y);
    if (score < bestScore) { target = { x: zx, y: zy }; bestScore = score; }
  }
  if (!target) {
    game.shootTimer = 0.18;
    return;
  }
  fireFromDragon(target.x, target.y);
  game.shootTimer = d.config.shootInterval;
}

function updateNapFlyUp(dt) {
  if (screen !== 'playing') return;
  const d = game.dragon;
  if (!d) return;
  d.flyUpProgress += dt;
  if (d.flyUpProgress > 0.7) {
    const t = d.flyUpProgress - 0.7;
    d.y -= (60 + t * 220) * dt;
  }
  d.wingPhase += dt * 12;
  if (d.y < -140) showNapScreen();
}

/* ============================================================
   DRAGON DRAWING (HtTYD-inspired)
   ============================================================ */
function dragonPaint(cfg, x0, y0, x1, y1) {
  // Returns the fill style for a dragon's body — solid color, or rainbow gradient
  // when cfg.rainbow is true. Coordinates define the gradient axis (nose→tail).
  if (cfg.rainbow) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0,    '#ff4d4d');
    g.addColorStop(0.16, '#ff8c30');
    g.addColorStop(0.33, '#ffd200');
    g.addColorStop(0.5,  '#3ed03e');
    g.addColorStop(0.66, '#3aa7f0');
    g.addColorStop(0.83, '#6c5cd9');
    g.addColorStop(1,    '#a23ec6');
    return g;
  }
  return cfg.color;
}

function drawDragon(d) {
  const cfg = d.config;
  const scale = CONFIG.stageScales[game.stage - 1];
  const x = d.x;
  const y = d.y;
  const flap = Math.sin(d.wingPhase);
  const bob = Math.sin(d.wingPhase * 0.5) * 2;

  // Shadow on the ground
  const groundY = groundLineY();
  const shadowAlpha = Math.max(0.05, 0.3 - (groundY - y) / 800);
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 2, 30 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);

  // === Paint setup ===
  // Body axis from nose (+50) to tail tip (-55) — gradient goes nose→tail (so red at nose for Prism)
  const bodyFill = dragonPaint(cfg, 52, 0, -55, 0);
  const bellyFill = cfg.rainbow ? '#fff8e8' : cfg.belly;
  const wingFill = cfg.rainbow ? '#5a4998' : cfg.wing;

  // === Back wing (drawn first, behind body) ===
  drawWing(-8 + flap * 4, -10, flap, wingFill, true);

  // === Tail ===
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ctx.moveTo(-18, -3);
  ctx.bezierCurveTo(-32, -2, -45, 3, -52, 1);
  ctx.bezierCurveTo(-48, 5, -32, 8, -18, 7);
  ctx.closePath();
  ctx.fill();
  // Tail fin
  ctx.beginPath();
  ctx.moveTo(-50, -1);
  ctx.lineTo(-62, -8);
  ctx.lineTo(-58, 0);
  ctx.lineTo(-62, 8);
  ctx.lineTo(-50, 3);
  ctx.closePath();
  ctx.fill();
  // Tail fin inner accent
  ctx.fillStyle = wingFill;
  ctx.beginPath();
  ctx.moveTo(-54, -4);
  ctx.lineTo(-60, -7);
  ctx.lineTo(-56, 0);
  ctx.lineTo(-60, 7);
  ctx.lineTo(-54, 4);
  ctx.closePath();
  ctx.fill();

  // === Back spines (along the back) ===
  ctx.fillStyle = wingFill;
  const spines = [
    { x: -10, h: 7 },
    { x: -4,  h: 8 },
    { x: 2,   h: 9 },
    { x: 8,   h: 8 },
    { x: 14,  h: 6 },
  ];
  for (const sp of spines) {
    ctx.beginPath();
    ctx.moveTo(sp.x - 2.5, -10);
    ctx.lineTo(sp.x, -10 - sp.h);
    ctx.lineTo(sp.x + 2.5, -10);
    ctx.closePath();
    ctx.fill();
  }

  // === Body ===
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belly
  ctx.fillStyle = bellyFill;
  ctx.beginPath();
  ctx.ellipse(2, 6, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Scale texture suggestion
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 6, -3, 2.2, 0, Math.PI);
    ctx.fill();
  }

  // === Legs (tucked) ===
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ctx.ellipse(-4, 11, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, 11, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Toe claws
  ctx.fillStyle = '#2d2438';
  for (const lx of [-5, -3, 7, 9]) {
    ctx.beginPath();
    ctx.moveTo(lx - 0.7, 15.5);
    ctx.lineTo(lx, 17);
    ctx.lineTo(lx + 0.7, 15.5);
    ctx.closePath();
    ctx.fill();
  }

  // === Neck + Head ===
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ctx.moveTo(18, -3);
  ctx.bezierCurveTo(26, -9, 32, -10, 36, -8);
  ctx.lineTo(36, -3);
  ctx.lineTo(22, 5);
  ctx.closePath();
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(38, -10, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Snout
  ctx.beginPath();
  ctx.moveTo(45, -11);
  ctx.lineTo(53, -9);
  ctx.quadraticCurveTo(56, -7, 53, -5);
  ctx.lineTo(45, -5);
  ctx.closePath();
  ctx.fill();
  // Nostril
  ctx.fillStyle = 'rgba(45, 36, 56, 0.5)';
  ctx.beginPath();
  ctx.arc(52, -7, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // === Horns ===
  ctx.fillStyle = wingFill;
  ctx.beginPath();
  ctx.moveTo(32, -17);
  ctx.lineTo(31, -25);
  ctx.lineTo(35, -17);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(37, -18);
  ctx.lineTo(38, -26);
  ctx.lineTo(41, -18);
  ctx.closePath();
  ctx.fill();

  // === Eye (large, expressive, cat-like) ===
  const yawning = d.flyUpProgress > 0 && d.flyUpProgress < 0.7;
  if (yawning) {
    ctx.strokeStyle = '#2d2438';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(39, -10, 3.5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = '#2d2438';
    ctx.beginPath();
    ctx.ellipse(50, -4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Eye white (almond shape)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(38, -11, 5.2, 4.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Iris color
    const irisColor = cfg.rainbow ? '#a23ec6' : cfg.wing;
    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.arc(39, -10.5, 3, 0, Math.PI * 2);
    ctx.fill();
    // Cat-like pupil
    ctx.fillStyle = '#2d2438';
    ctx.beginPath();
    ctx.ellipse(39.4, -10.5, 0.9, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(40, -11.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle for Prism
    if (cfg.rainbow) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(37.5, -9.5, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Eyelid line
    ctx.strokeStyle = '#2d2438';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(34, -13);
    ctx.quadraticCurveTo(38, -15, 42, -13);
    ctx.stroke();
    // Subtle mouth line
    ctx.beginPath();
    ctx.moveTo(46, -5);
    ctx.lineTo(51, -5);
    ctx.stroke();
  }

  // === Front wing (drawn last, on top) ===
  drawWing(8, -10 + flap * 2, flap, wingFill, false);

  ctx.restore();
}

function drawWing(rootX, rootY, flap, color, behind) {
  // A bat-style wing with three "finger" bones meeting a curved membrane.
  // The wing flaps via the `flap` value (-1..1).
  ctx.save();
  ctx.translate(rootX, rootY);
  const lift = flap * 6;
  const shoulder = { x: 0, y: 0 };
  const elbow    = { x: -8, y: -18 - lift * 0.5 };
  const tip      = { x: -22 + lift * 0.5, y: -28 - lift };
  const finger1  = { x: -16, y: -10 + lift * 0.3 };
  const finger2  = { x: -4,  y: -5 + lift * 0.4 };

  // Membrane
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.quadraticCurveTo(elbow.x - 6, elbow.y - 6, tip.x, tip.y);
  ctx.quadraticCurveTo(finger1.x + 2, finger1.y - 4, finger1.x, finger1.y);
  ctx.quadraticCurveTo(finger2.x + 2, finger2.y - 1, finger2.x, finger2.y);
  ctx.closePath();
  ctx.fill();

  // Bone lines
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.moveTo(elbow.x, elbow.y);
  ctx.lineTo(finger1.x, finger1.y);
  ctx.moveTo(elbow.x, elbow.y);
  ctx.lineTo(finger2.x, finger2.y);
  ctx.stroke();

  // Tip claw
  ctx.fillStyle = '#2d2438';
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ============================================================
   ZOMBIE / CURED / FIREBALL DRAWING
   ============================================================ */
function drawZombie(z) {
  const groundY = groundLineY();
  const x = z.worldX - game.scrollX;
  const y = groundY - 20 - z.y;
  const sway = Math.sin(z.walkPhase) * 1.5;
  const legLift = Math.sin(z.walkPhase) * 2.5;

  ctx.globalAlpha = z.emergeAlpha;

  // Shadow
  ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * Math.max(0.3, 1 - z.y / 80)})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = z.color;
  ctx.beginPath();
  ctx.ellipse(x + sway * 0.3, y + 2, 12, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#4a8a4a';
  ctx.fillRect(x - 5, y + 12 + Math.max(0, legLift), 4, 8);
  ctx.fillRect(x + 1, y + 12 + Math.max(0, -legLift), 4, 8);

  // Arms out front
  ctx.fillStyle = z.color;
  ctx.fillRect(x - 14, y - 3, 6, 4);
  ctx.fillRect(x + 8, y - 3, 6, 4);
  ctx.fillStyle = '#7ac27a';
  ctx.beginPath();
  ctx.arc(x - 16, y - 1, 3, 0, Math.PI * 2);
  ctx.arc(x + 16, y - 1, 3, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = z.color;
  ctx.beginPath();
  ctx.arc(x + sway * 0.3, y - 11, 9, 0, Math.PI * 2);
  ctx.fill();

  // Half-closed eyes
  ctx.strokeStyle = '#2d2438';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x - 3 + sway * 0.3, y - 11, 2.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 3 + sway * 0.3, y - 11, 2.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // Sleepy smile
  ctx.beginPath();
  ctx.arc(x + sway * 0.3, y - 8, 2.2, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawCured(c) {
  const x = c.x;
  const y = c.y;
  const ageT = c.age / c.maxAge;
  const alpha = ageT < 0.85 ? 1 : Math.max(0, 1 - (ageT - 0.85) / 0.15);
  ctx.globalAlpha = alpha;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const phase = c.walkPhase;
  const bounce = Math.abs(Math.sin(phase)) * (c.stage === 2 ? 5 : c.stage === 3 ? 4 : 1.5);
  const bodyY = y - bounce;

  if (c.stage === 1) {
    // Baby crawl
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(x, bodyY + 6, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 5, bodyY + 2, 6, 0, Math.PI * 2); ctx.fill();
    drawSmiley(x - 5, bodyY + 2, 4);
  } else if (c.stage === 2) {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(x, bodyY + 6, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, bodyY - 4, 7, 0, Math.PI * 2); ctx.fill();
    drawSmiley(x, bodyY - 4, 5);
    ctx.fillStyle = '#5a3d1f';
    ctx.fillRect(x - 4, bodyY + 14, 3, 5 - bounce * 0.3);
    ctx.fillRect(x + 1, bodyY + 14, 3, 5 + bounce * 0.3);
  } else if (c.stage === 3) {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(x, bodyY + 8, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, bodyY - 5, 8, 0, Math.PI * 2); ctx.fill();
    drawSmiley(x, bodyY - 5, 6);
    ctx.fillStyle = c.color;
    ctx.fillRect(x - 11, bodyY + 4 + bounce * 0.4, 4, 8);
    ctx.fillRect(x + 7, bodyY + 4 - bounce * 0.4, 4, 8);
    ctx.fillStyle = '#5a3d1f';
    ctx.fillRect(x - 5, bodyY + 18, 3, 6);
    ctx.fillRect(x + 2, bodyY + 18, 3, 6);
  } else if (c.stage === 4) {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(x, bodyY + 10, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, bodyY - 6, 9, 0, Math.PI * 2); ctx.fill();
    drawSmiley(x, bodyY - 6, 7);
    const wave = Math.sin(phase * 2);
    ctx.save();
    ctx.translate(x + 9, bodyY + 4);
    ctx.rotate(-0.8 + wave * 0.4);
    ctx.fillRect(0, -2, 10, 4);
    ctx.restore();
    ctx.fillRect(x - 13, bodyY + 4, 4, 9);
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(x - 5, bodyY + 22, 4, 7);
    ctx.fillRect(x + 1, bodyY + 22, 4, 7);
  } else {
    // Elder shuffle with cane
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(x, bodyY + 10, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, bodyY - 6, 9, 0, Math.PI * 2); ctx.fill();
    drawSmiley(x, bodyY - 6, 7);
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath(); ctx.arc(x, bodyY - 12, 6, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8b6f4a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 12, bodyY + 6);
    ctx.lineTo(x - 14, bodyY + 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 12, bodyY + 6);
    ctx.quadraticCurveTo(x - 9, bodyY + 4, x - 9, bodyY + 8);
    ctx.stroke();
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(x - 5, bodyY + 22, 4, 7);
    ctx.fillRect(x + 1, bodyY + 22, 4, 7);
  }

  // Frost slow aura
  if (c.slowAura && game.elapsed < c.slowAuraUntil) {
    const t = (c.slowAuraUntil - game.elapsed) / CONFIG.frostSlowDurationSec;
    ctx.globalAlpha = alpha * 0.35 * t;
    ctx.strokeStyle = '#7fc9d9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 4, CONFIG.frostSlowRadius * (1 - t * 0.2), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSmiley(cx, cy, r) {
  ctx.fillStyle = '#2d2438';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.15, 0.9, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.35, cy - r * 0.15, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2d2438';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, r * 0.45, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

function drawFireball(f) {
  const x = f.x, y = f.y;
  let core = f.color;
  if (f.rainbow) core = `hsl(${f.hue}, 85%, 60%)`;
  // Outer glow
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, f.radius * 2.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Body
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, f.radius, 0, Math.PI * 2);
  ctx.fill();
  // Hot center
  ctx.fillStyle = '#fff5d0';
  ctx.beginPath();
  ctx.arc(x - f.radius * 0.3, y - f.radius * 0.3, f.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticle(p) {
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = alpha;
  if (p.type === 'sparkle') {
    ctx.fillStyle = p.color;
    drawStar(p.x, p.y, p.size * (0.7 + alpha * 0.6));
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (2 - alpha), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawStar(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    else ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSpeechBubble(x, y, text) {
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif';
  const padX = 8;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = 22;
  const bx = x - bw / 2;
  const by = y - bh;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 4, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 4, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2d2438';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + bh / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ============================================================
   BACKGROUND / GROUND
   ============================================================ */
function drawBackground() {
  const colors = getDistrictColors(game.scrollX + cssW * 0.5);
  const groundY = groundLineY();
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0,    colors.skyTop);
  sky.addColorStop(1,    colors.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, groundY);
  // Sun
  ctx.fillStyle = 'rgba(255, 230, 140, 0.45)';
  ctx.beginPath();
  ctx.arc(cssW * 0.78, groundY * 0.25, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76b';
  ctx.beginPath();
  ctx.arc(cssW * 0.78, groundY * 0.25, 38, 0, Math.PI * 2);
  ctx.fill();

  // Far parallax silhouettes (very faint, behind everything)
  ctx.fillStyle = `rgba(80, 100, 120, 0.18)`;
  const farScroll = game.scrollX * 0.3;
  for (let i = -2; i < 6; i++) {
    const fx = i * 220 - (farScroll % 220);
    const hh = 70 + Math.sin(i * 1.7) * 18;
    ctx.beginPath();
    ctx.moveTo(fx, groundY);
    ctx.quadraticCurveTo(fx + 60, groundY - hh, fx + 110, groundY - hh * 0.6);
    ctx.quadraticCurveTo(fx + 160, groundY - hh * 1.2, fx + 220, groundY);
    ctx.closePath();
    ctx.fill();
  }

  // Ground (the strip where everything walks)
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, groundY, cssW, cssH - groundY);
  // Darker stripe at the top of the ground (the "line")
  ctx.fillStyle = colors.groundDark;
  ctx.fillRect(0, groundY - 3, cssW, 4);
  // Repeating ground texture dots (scroll with world).
  // Each arc needs its own subpath so they render as separate circles.
  ctx.fillStyle = `rgba(0, 0, 0, 0.10)`;
  const tex = 36;
  const off = -((game.scrollX) % tex);
  ctx.beginPath();
  for (let i = 0; i < Math.ceil(cssW / tex) + 2; i++) {
    const x = off + i * tex;
    ctx.moveTo(x + 6 + 2.2, groundY + 12);
    ctx.arc(x + 6,  groundY + 12, 2.2, 0, Math.PI * 2);
    ctx.moveTo(x + 22 + 1.6, groundY + 28);
    ctx.arc(x + 22, groundY + 28, 1.6, 0, Math.PI * 2);
    ctx.moveTo(x + 14 + 1.4, groundY + 44);
    ctx.arc(x + 14, groundY + 44, 1.4, 0, Math.PI * 2);
  }
  ctx.fill();
}

/* ============================================================
   RENDER LOOP
   ============================================================ */
function render() {
  drawBackground();
  if (screen !== 'playing' && screen !== 'nap') return;

  const groundY = groundLineY();

  // Scenery first (after background, before entities)
  // Sort by worldX so distant items render behind closer ones (simple)
  // Actually since they're all at ground depth, draw in spawn order.
  for (const s of game.scenery) {
    const sx = s.worldX - game.scrollX;
    if (sx > cssW + 40 || sx + SCENERY[s.type].width < -40) continue;
    SCENERY[s.type].draw(sx, groundY, game.elapsed, s.props || {});
  }

  // Cured villagers (behind dragon, in front of scenery)
  for (const c of game.cured) drawCured(c);

  // Zombies
  for (const z of game.zombies) drawZombie(z);

  // Dragon
  if (game.dragon) drawDragon(game.dragon);

  // Fireballs (above everything)
  for (const f of game.fireballs) drawFireball(f);

  // Particles
  for (const p of game.particles) drawParticle(p);

  // Speech bubbles
  for (const s of game.speeches) {
    const z = game.zombies.find(zz => zz.id === s.targetId);
    if (!z) continue;
    const zx = z.worldX - game.scrollX;
    const zy = groundY - 20 - z.y;
    drawSpeechBubble(zx, zy - z.radius - 14, s.text);
  }
}

/* ============================================================
   HUD / UI
   ============================================================ */
const ui = {
  hud:        document.getElementById('hud'),
  score:      document.getElementById('scoreCount'),
  stage:      document.getElementById('hudStage'),
  meter:      document.getElementById('meterFill'),
  muteBtn:    document.getElementById('muteBtn'),
  waveBanner: document.getElementById('waveBanner'),
  districtBanner: document.getElementById('districtBanner'),
  grewBanner: document.getElementById('grewBanner'),

  dragonPicker: document.getElementById('dragonPickerScreen'),
  dpPlayerName: document.getElementById('dpPlayerName'),
  dragonGrid:   document.getElementById('dragonGrid'),
  dpSwitch:     document.getElementById('dpSwitchPlayer'),

  controlPicker: document.getElementById('controlPickerScreen'),
  cpPlayerName:  document.getElementById('cpPlayerName'),
  cpDragonName:  document.getElementById('cpDragonName'),
  modeAuto:      document.getElementById('modeAuto'),
  modeAim:       document.getElementById('modeAim'),
  cpBack:        document.getElementById('cpBack'),

  napScreen:     document.getElementById('napScreen'),
  napCount:      document.getElementById('napCount'),
  napHighWrap:   document.getElementById('napHighWrap'),
  napStage:      document.getElementById('napStage'),
  napPlayAgain:  document.getElementById('napPlayAgain'),
  napPickDragon: document.getElementById('napPickDragon'),

  // Castle bedroom
  visitCastleBtn:      document.getElementById('visitCastleBtn'),
  castleScreen:        document.getElementById('castleScreen'),
  castleDoorBtn:       document.getElementById('castleDoorBtn'),
  castleHallDoorBtn:   document.getElementById('castleHallDoorBtn'),
  castleDragon:        document.getElementById('castleDragon'),
  castleBlanket:       document.getElementById('castleBlanket'),
  castleRug:           document.getElementById('castleRug'),
  castlePictureDragon: document.getElementById('castlePictureDragon'),
  castleFade:          document.getElementById('castleFade'),

  // Hallway
  castleHallScreen:    document.getElementById('castleHallScreen'),
  hallBedroomDoorBtn:  document.getElementById('hallBedroomDoorBtn'),
  hallWeightDoorBtn:   document.getElementById('hallWeightDoorBtn'),
  hallDragon:          document.getElementById('hallDragon'),

  // Weight room
  castleGymScreen:     document.getElementById('castleGymScreen'),
  gymHallDoorBtn:      document.getElementById('gymHallDoorBtn'),
  gymDragon:           document.getElementById('gymDragon'),
  mirrorDragon:        document.getElementById('mirrorDragon'),
  liftBtn:             document.getElementById('liftBtn'),
  strengthPlaque:      document.getElementById('strengthPlaque'),
  plaqueName:          document.getElementById('plaqueName'),
  plaqueReps:          document.getElementById('plaqueReps'),
  plaqueTier:          document.getElementById('plaqueTier'),

  // Rhythm game
  rhythmScreen:        document.getElementById('rhythmScreen'),
  rhythmTrack:         document.getElementById('rhythmTrack'),
  rhythmZone:          document.getElementById('rhythmZone'),
  rhythmTime:          document.getElementById('rhythmTime'),
  rhythmReps:          document.getElementById('rhythmReps'),
  rhythmFeedback:      document.getElementById('rhythmFeedback'),
  rhythmDragon:        document.getElementById('rhythmDragon'),
  rhythmTapShield:     document.getElementById('rhythmTapShield'),
  rhythmTapButton:     document.getElementById('rhythmTapButton'),
  rhythmReady:         document.getElementById('rhythmReady'),
  rhythmCountoff:      document.getElementById('rhythmCountoff'),
  rhythmInstructions:  document.getElementById('rhythmInstructions'),
  rhythmGoBtn:         document.getElementById('rhythmGoBtn'),
  rhythmResultsScreen: document.getElementById('rhythmResultsScreen'),
  resultsReps:         document.getElementById('resultsReps'),
  resultsLifetime:     document.getElementById('resultsLifetime'),
  resultsTierBanner:   document.getElementById('resultsTierBanner'),
  resultsLiftAgain:    document.getElementById('resultsLiftAgain'),
  resultsDone:         document.getElementById('resultsDone'),
};

function updateScoreUI() { ui.score.textContent = game.score; }
function updateStageUI() { ui.stage.textContent = '🐉 ' + CONFIG.stageNames[game.stage - 1]; }
function updateMeterUI() {
  ui.meter.style.width = (game.meter / CONFIG.sleepyMeterMax) * 100 + '%';
}
function updateMuteUI() { ui.muteBtn.textContent = muted ? '🔇' : '🔊'; }

let waveBannerTimer = null;
function showWaveBanner() {
  ui.waveBanner.textContent = 'Wave ' + game.wave + ' …';
  ui.waveBanner.classList.add('show');
  clearTimeout(waveBannerTimer);
  waveBannerTimer = setTimeout(() => ui.waveBanner.classList.remove('show'), 1400);
}
let grewBannerTimer = null;
function showGrewBanner() {
  ui.grewBanner.classList.add('show');
  clearTimeout(grewBannerTimer);
  grewBannerTimer = setTimeout(() => ui.grewBanner.classList.remove('show'), 1500);
}
let districtBannerTimer = null;
function showDistrictBanner(d) {
  ui.districtBanner.textContent = d.emoji + ' ' + d.name + '!';
  ui.districtBanner.classList.add('show');
  clearTimeout(districtBannerTimer);
  districtBannerTimer = setTimeout(() => ui.districtBanner.classList.remove('show'), 1800);
  sfx.district();
}

/* ============================================================
   SCREENS
   ============================================================ */
function showScreen(name) {
  screen = name;
  ui.dragonPicker.classList.toggle('hidden',      name !== 'dragonPicker');
  ui.controlPicker.classList.toggle('hidden',     name !== 'controlPicker');
  ui.napScreen.classList.toggle('hidden',         name !== 'nap');
  ui.castleScreen.classList.toggle('hidden',      name !== 'castle');
  ui.castleHallScreen.classList.toggle('hidden',  name !== 'castleHall');
  ui.castleGymScreen.classList.toggle('hidden',   name !== 'castleGym');
  ui.rhythmScreen.classList.toggle('hidden',      name !== 'rhythm');
  ui.rhythmResultsScreen.classList.toggle('hidden', name !== 'rhythmResults');
  ui.hud.classList.toggle('hidden',               name !== 'playing');
}
function inCastle() {
  return screen === 'castle' || screen === 'castleHall' ||
         screen === 'castleGym' || screen === 'rhythm' || screen === 'rhythmResults';
}

function renderDragonPicker() {
  ui.dpPlayerName.textContent = player;
  ui.dragonGrid.innerHTML = '';
  const prismUnlocked = readBool(KEYS.prismUnlocked(), false);
  const prismSeen     = readBool(KEYS.prismSeen(), false);
  const favorite      = readStr(KEYS.favoriteDragon(), '');
  for (const id of CONFIG.dragonOrder) {
    const cfg = CONFIG.dragons[id];
    const card = document.createElement('button');
    card.className = 'dragon-card';
    if (id === favorite) card.classList.add('favorite');
    const locked = (id === 'prism' && !prismUnlocked);
    if (locked) card.classList.add('locked');
    const tier = locked ? 0 : muscleTierFor(id);
    card.innerHTML = `
      ${dragonPickerSVG(cfg, id, tier)}
      <div class="name">${locked ? '???' : cfg.name}</div>
      <div class="tag">${locked ? 'Locked' : cfg.tag}</div>
    `;
    if (locked) {
      const lk = document.createElement('div');
      lk.className = 'lock-overlay';
      lk.textContent = '🔒';
      card.appendChild(lk);
    } else if (id === 'prism' && !prismSeen) {
      const nb = document.createElement('div');
      nb.className = 'new-badge';
      nb.textContent = '✨ NEW!';
      card.appendChild(nb);
    }
    // Muscle badge (only at tier ≥ 1) — small "💪 ×N" pill in corner
    if (!locked && tier >= 1) {
      const mb = document.createElement('div');
      mb.className = 'muscle-badge';
      mb.textContent = '💪 ×' + tier;
      card.appendChild(mb);
    }
    card.addEventListener('click', () => {
      if (locked) return;
      onAnyTap();
      selectedDragonId = id;
      writeStr(KEYS.favoriteDragon(), id);
      if (id === 'prism') writeStr(KEYS.prismSeen(), 'true');
      showControlPicker();
    });
    ui.dragonGrid.appendChild(card);
  }
}

function dragonPickerSVG(cfg, id, tier = 0) {
  // Mirror of in-canvas dragon, suitable for picker preview.
  // `tier` adds optional muscle overlays (visible only in social contexts).
  const isRainbow = !!cfg.rainbow;
  const bodyFill = isRainbow ? `url(#g_${id})` : cfg.color;
  const bellyFill = isRainbow ? '#fff8e8' : cfg.belly;
  const wingFill  = isRainbow ? '#5a4998' : cfg.wing;
  const irisColor = isRainbow ? '#a23ec6' : cfg.wing;
  const gradient = isRainbow ? `
    <defs>
      <linearGradient id="g_${id}" x1="60" y1="0" x2="-60" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%"    stop-color="#ff4d4d"/>
        <stop offset="16%"   stop-color="#ff8c30"/>
        <stop offset="33%"   stop-color="#ffd200"/>
        <stop offset="50%"   stop-color="#3ed03e"/>
        <stop offset="66%"   stop-color="#3aa7f0"/>
        <stop offset="83%"   stop-color="#6c5cd9"/>
        <stop offset="100%"  stop-color="#a23ec6"/>
      </linearGradient>
    </defs>
  ` : '';
  const tierClass = tier >= 3 ? 'muscle-t3' : tier === 2 ? 'muscle-t2' : tier === 1 ? 'muscle-t1' : '';
  return `<svg class="${tierClass}" viewBox="-70 -40 140 80" xmlns="http://www.w3.org/2000/svg">
    ${gradient}
    <ellipse cx="0" cy="32" rx="36" ry="5" fill="rgba(0,0,0,0.12)"/>
    <!-- Back wing -->
    <path d="M -8 -10 Q -22 -34 -32 -28 Q -22 -14 -10 -8 Z" fill="${wingFill}"/>
    <!-- Tail -->
    <path d="M -18 -3 Q -32 -2 -52 1 Q -48 5 -18 7 Z" fill="${bodyFill}"/>
    <path d="M -50 -1 L -62 -8 L -58 0 L -62 8 L -50 3 Z" fill="${bodyFill}"/>
    <!-- Body -->
    <ellipse cx="0" cy="0" rx="22" ry="12" fill="${bodyFill}"/>
    <ellipse cx="2" cy="6" rx="17" ry="6" fill="${bellyFill}"/>
    <!-- Muscle overlays (smaller scale to match this viewBox) -->
    <g class="muscle-t1-only">
      <ellipse cx="-15" cy="-6" rx="4" ry="5" fill="${bodyFill}"/>
      <ellipse cx="15"  cy="-5" rx="4" ry="5" fill="${bodyFill}"/>
      <path d="M -5 1 Q 0 4 5 1" stroke="rgba(0,0,0,0.12)" stroke-width="1" fill="none" stroke-linecap="round"/>
    </g>
    <g class="muscle-t2-only">
      <ellipse cx="-18" cy="0" rx="6" ry="9" fill="${bodyFill}"/>
      <ellipse cx="18"  cy="1" rx="6" ry="9" fill="${bodyFill}"/>
      <ellipse cx="-7"  cy="2" rx="6" ry="5" fill="${bodyFill}"/>
      <ellipse cx="7"   cy="2" rx="6" ry="5" fill="${bodyFill}"/>
      <path d="M 0 0 L 0 8" stroke="rgba(0,0,0,0.15)" stroke-width="1.2" stroke-linecap="round"/>
    </g>
    <g class="muscle-t3-only muscle-flex">
      <ellipse cx="-20" cy="1" rx="8" ry="11" fill="${bodyFill}"/>
      <ellipse cx="20"  cy="2" rx="8" ry="11" fill="${bodyFill}"/>
      <ellipse cx="-8"  cy="2" rx="7" ry="6" fill="${bodyFill}"/>
      <ellipse cx="8"   cy="2" rx="7" ry="6" fill="${bodyFill}"/>
      <path d="M 0 -1 L 0 9" stroke="rgba(0,0,0,0.2)" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <!-- Back spines -->
    <path d="M -12.5 -10 L -10 -17 L -7.5 -10 Z M -6.5 -10 L -4 -18 L -1.5 -10 Z M -0.5 -10 L 2 -19 L 4.5 -10 Z M 5.5 -10 L 8 -18 L 10.5 -10 Z" fill="${wingFill}"/>
    <!-- Legs -->
    <ellipse cx="-4" cy="11" rx="4" ry="5" fill="${bodyFill}"/>
    <ellipse cx="8"  cy="11" rx="4" ry="5" fill="${bodyFill}"/>
    <!-- Neck + head -->
    <path d="M 18 -3 Q 30 -10 36 -8 L 36 -3 L 22 5 Z" fill="${bodyFill}"/>
    <ellipse cx="38" cy="-10" rx="10" ry="8" fill="${bodyFill}"/>
    <!-- Snout -->
    <path d="M 45 -11 L 53 -9 Q 56 -7 53 -5 L 45 -5 Z" fill="${bodyFill}"/>
    <!-- Horns -->
    <path d="M 32 -17 L 31 -25 L 35 -17 Z" fill="${wingFill}"/>
    <path d="M 37 -18 L 38 -26 L 41 -18 Z" fill="${wingFill}"/>
    <!-- Eye -->
    <ellipse cx="38" cy="-11" rx="5.2" ry="4.3" fill="#fff"/>
    <circle cx="39" cy="-10.5" r="3" fill="${irisColor}"/>
    <ellipse cx="39.4" cy="-10.5" rx="0.9" ry="2.6" fill="#2d2438"/>
    <circle cx="40" cy="-11.5" r="0.8" fill="#fff"/>
    <!-- Front wing on top -->
    <path d="M 8 -10 Q -6 -30 -16 -22 Q -4 -12 8 -8 Z" fill="${wingFill}"/>
  </svg>`;
}

function showControlPicker() {
  showScreen('controlPicker');
  ui.cpPlayerName.textContent = player;
  ui.cpDragonName.textContent = CONFIG.dragons[selectedDragonId].name;
  const fav = readStr(KEYS.controlMode(), 'auto');
  ui.modeAuto.classList.toggle('favorite', fav === 'auto');
  ui.modeAim.classList.toggle('favorite', fav === 'aim');
}

/* ============================================================
   CASTLE BEDROOM
   A peaceful, optional scene reached from the dragon picker.
   Pure CSS animations + a static SVG dragon with class-based
   blink and yawn hooks. No game loop runs while we're in here.
   ============================================================ */
function dragonRestingSVG(cfg, id, tier = 0) {
  // The dragon sits peacefully facing right. Body group carries the
  // breathing animation; eye and mouth subgroups carry blink/yawn.
  // `tier` is the muscle tier (0..3); higher tiers add overlay shapes.
  const isRainbow = !!cfg.rainbow;
  const bodyFill  = isRainbow ? `url(#gr_${id})` : cfg.color;
  const bellyFill = isRainbow ? '#fff8e8' : cfg.belly;
  const wingFill  = isRainbow ? '#5a4998' : cfg.wing;
  const irisColor = isRainbow ? '#a23ec6' : cfg.wing;
  const lidFill   = isRainbow ? cfg.wing  : cfg.color;
  const gradient  = isRainbow ? `
    <defs>
      <linearGradient id="gr_${id}" x1="80" y1="0" x2="-60" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%"    stop-color="#ff4d4d"/>
        <stop offset="16%"   stop-color="#ff8c30"/>
        <stop offset="33%"   stop-color="#ffd200"/>
        <stop offset="50%"   stop-color="#3ed03e"/>
        <stop offset="66%"   stop-color="#3aa7f0"/>
        <stop offset="83%"   stop-color="#6c5cd9"/>
        <stop offset="100%"  stop-color="#a23ec6"/>
      </linearGradient>
    </defs>
  ` : '';
  const tierClass = tier >= 3 ? 'muscle-t3' : tier === 2 ? 'muscle-t2' : tier === 1 ? 'muscle-t1' : '';
  return `<svg class="${tierClass}" viewBox="-90 -90 180 180" xmlns="http://www.w3.org/2000/svg">
    ${gradient}
    <!-- ground shadow -->
    <ellipse cx="0" cy="60" rx="62" ry="7" fill="rgba(0,0,0,0.18)"/>

    <!-- tail wrapping around to the front -->
    <g class="dragon-tail">
      <path d="M -38 4 Q -64 24 -46 50 Q -14 64 24 54"
            stroke="${bodyFill}" stroke-width="14" stroke-linecap="round" fill="none"/>
      <path d="M 22 50 L 38 60 L 32 50 L 38 40 Z" fill="${bodyFill}"/>
    </g>

    <!-- folded wings (peeking up behind body) -->
    <path d="M -16 -20 Q -34 -52 -38 -36 Q -22 -18 -14 -20 Z" fill="${wingFill}"/>
    <path d="M -2 -24 Q -10 -58 -22 -42 Q -10 -22 -2 -22 Z" fill="${wingFill}"/>

    <!-- breathing group: scales the whole body subtly -->
    <g class="dragon-breathe">

      <!-- back spines (visible above body line) -->
      <path d="M -20 -20 L -16 -32 L -12 -20 Z
               M -8 -26  L -3 -38  L 2  -26 Z
               M 6  -28  L 11 -42  L 16 -28 Z
               M 20 -24  L 24 -36  L 28 -24 Z" fill="${wingFill}"/>

      <!-- main body -->
      <ellipse cx="0" cy="10" rx="44" ry="32" fill="${bodyFill}"/>
      <ellipse cx="2" cy="22" rx="32" ry="20" fill="${bellyFill}"/>

      <!-- subtle scale texture -->
      <ellipse cx="-14" cy="4" rx="3.5" ry="2" fill="rgba(0,0,0,0.07)"/>
      <ellipse cx="0"   cy="0" rx="3.5" ry="2" fill="rgba(0,0,0,0.07)"/>
      <ellipse cx="14"  cy="4" rx="3.5" ry="2" fill="rgba(0,0,0,0.07)"/>

      <!-- ======== MUSCLE OVERLAYS (visibility controlled by .muscle-tN class on <svg>) ======== -->
      <!-- Tier 1 — subtle shoulder bumps + faint chest line -->
      <g class="muscle-t1-only">
        <ellipse cx="-28" cy="-4" rx="7" ry="9" fill="${bodyFill}"/>
        <ellipse cx="28"  cy="-2" rx="7" ry="9" fill="${bodyFill}"/>
        <path d="M -10 6 Q 0 12 10 6" stroke="rgba(0,0,0,0.12)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      </g>
      <!-- Tier 2 — bigger arms, chest plates, thicker neck -->
      <g class="muscle-t2-only">
        <!-- Upper arm bulges -->
        <ellipse cx="-34" cy="6" rx="11" ry="16" fill="${bodyFill}"/>
        <ellipse cx="34"  cy="8" rx="11" ry="16" fill="${bodyFill}"/>
        <!-- Pec plates -->
        <ellipse cx="-12" cy="10" rx="11" ry="9" fill="${bodyFill}"/>
        <ellipse cx="12"  cy="10" rx="11" ry="9" fill="${bodyFill}"/>
        <!-- Pec line -->
        <path d="M 0 4 L 0 20" stroke="rgba(0,0,0,0.16)" stroke-width="2" stroke-linecap="round"/>
        <!-- Thicker neck base -->
        <ellipse cx="32" cy="-14" rx="10" ry="8" fill="${bodyFill}"/>
      </g>
      <!-- Tier 3 — comically buff (wrapped in muscle-flex for occasional pulse) -->
      <g class="muscle-t3-only muscle-flex">
        <!-- Huge bicep bulges -->
        <ellipse cx="-38" cy="8" rx="16" ry="21" fill="${bodyFill}"/>
        <ellipse cx="38"  cy="10" rx="16" ry="21" fill="${bodyFill}"/>
        <!-- Big pec shapes -->
        <ellipse cx="-14" cy="8" rx="14" ry="12" fill="${bodyFill}"/>
        <ellipse cx="14"  cy="8" rx="14" ry="12" fill="${bodyFill}"/>
        <!-- Deep pec line -->
        <path d="M 0 -2 L 0 22" stroke="rgba(0,0,0,0.22)" stroke-width="2.4" stroke-linecap="round"/>
        <!-- Thicker neck still -->
        <ellipse cx="34" cy="-16" rx="13" ry="10" fill="${bodyFill}"/>
        <!-- Bicep peak highlights -->
        <path d="M -42 4 Q -38 8 -42 14" stroke="rgba(255,255,255,0.25)" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M 42 6 Q 38 10 42 16"   stroke="rgba(255,255,255,0.25)" stroke-width="2" fill="none" stroke-linecap="round"/>
      </g>

      <!-- front paws -->
      <ellipse cx="-22" cy="40" rx="9"  ry="7" fill="${bodyFill}"/>
      <ellipse cx="14"  cy="42" rx="9"  ry="7" fill="${bodyFill}"/>
      <path d="M -27 44 L -25 47 L -23 44 M -23 44 L -21 47 L -19 44" stroke="#2d2438" stroke-width="1" fill="none"/>
      <path d="M  10 46 L  12 49 L  14 46 M  14 46 L  16 49 L  18 46" stroke="#2d2438" stroke-width="1" fill="none"/>

      <!-- neck -->
      <path d="M 26 -6 Q 46 -32 58 -38 L 52 -22 L 36 -6 Z" fill="${bodyFill}"/>

      <!-- head -->
      <ellipse cx="58" cy="-42" rx="18" ry="15" fill="${bodyFill}"/>

      <!-- snout -->
      <path d="M 70 -44 L 84 -40 Q 88 -36 84 -32 L 70 -32 Z" fill="${bodyFill}"/>
      <circle cx="82" cy="-37" r="1.2" fill="rgba(45,36,56,0.55)"/>

      <!-- horns -->
      <path d="M 48 -55 L 46 -70 L 53 -55 Z" fill="${wingFill}"/>
      <path d="M 58 -57 L 60 -74 L 66 -57 Z" fill="${wingFill}"/>

      <!-- eye (peaceful, with a lid that scales for blinking) -->
      <g class="dragon-eye">
        <ellipse cx="60" cy="-44" rx="8" ry="7" fill="#fff"/>
        <circle  cx="62" cy="-43" r="4.4" fill="${irisColor}"/>
        <ellipse cx="62.6" cy="-43" rx="1.2" ry="3.8" fill="#2d2438"/>
        <circle  cx="64" cy="-45" r="1.4" fill="#fff"/>
        ${isRainbow ? `<circle cx="59.5" cy="-42" r="0.9" fill="#fff"/>` : ``}
        <ellipse class="dragon-eye-lid" cx="60" cy="-44" rx="8.5" ry="7.5" fill="${lidFill}"/>
      </g>

      <!-- mouth (closed by default, opens on yawn) -->
      <g class="dragon-mouth">
        <path class="dragon-mouth-closed"
              d="M 70 -32 Q 76 -28 82 -32"
              stroke="#2d2438" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <g class="dragon-mouth-open">
          <ellipse cx="76" cy="-32" rx="5" ry="6" fill="#2d2438"/>
          <ellipse cx="76" cy="-29" rx="3" ry="2" fill="#d04860"/>
        </g>
      </g>

      <!-- 'z' puff during yawn -->
      <g class="dragon-zzz">
        <text x="78" y="-60" font-size="16" font-weight="800"
              fill="${irisColor}" text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, sans-serif">z</text>
      </g>
    </g>
  </svg>`;
}

// Tints used to color the blanket and rug per dragon. These are picked
// to match the dragon's wing/accent color so the room feels coordinated.
const CASTLE_TINTS = {
  ember:  { blanket: '#d9342a', trim: '#7c1d16', rug: '#e74c3c', rugTrim: '#7c1d16' },
  frost:  { blanket: '#3173b8', trim: '#1f4f80', rug: '#5fa3e0', rugTrim: '#1f4f80' },
  sprout: { blanket: '#27ae60', trim: '#196f3d', rug: '#52c47e', rugTrim: '#196f3d' },
  sunny:  { blanket: '#e8b620', trim: '#a07a10', rug: '#f1c44c', rugTrim: '#a07a10' },
  prism:  { blanket: 'rainbow', trim: '#5a4998', rug: 'rainbow', rugTrim: '#5a4998' },
};

/* ----- Muscle tier helpers ----- */
function getDragonReps(id) { return readNum(KEYS.dragonReps(id), 0); }
function addDragonReps(id, n) {
  const v = getDragonReps(id) + n;
  writeStr(KEYS.dragonReps(id), v);
  return v;
}
function muscleTierFor(id) {
  const reps = getDragonReps(id);
  if (reps >= CONFIG.castle.muscleTier3) return 3;
  if (reps >= CONFIG.castle.muscleTier2) return 2;
  if (reps >= CONFIG.castle.muscleTier1) return 1;
  return 0;
}

/* ----- Helpers for rendering the dragon in each room ----- */
function currentRoomDragonEl() {
  if (screen === 'castle')     return ui.castleDragon;
  if (screen === 'castleHall') return ui.hallDragon;
  if (screen === 'castleGym')  return ui.gymDragon;
  return null;
}
function injectDragonInto(containerEl, svg) {
  const facing = containerEl.querySelector('.dragon-facing');
  if (facing) facing.innerHTML = svg;
}
function activeDragonCfg() {
  const id = CONFIG.dragons[selectedDragonId] ? selectedDragonId : 'ember';
  return { id, cfg: CONFIG.dragons[id] };
}

/* ----- Ambient timers (cleared on castle exit) ----- */
let castleBlinkTimer = null;
let castleYawnTimer  = null;

function scheduleCastleBlink() {
  const delay = 4000 + Math.random() * 3000;
  castleBlinkTimer = setTimeout(() => {
    if (!inCastle()) return;
    const dragonEl = currentRoomDragonEl();
    if (!dragonEl) { scheduleCastleBlink(); return; }
    const eye = dragonEl.querySelector('.dragon-eye');
    if (eye) {
      eye.classList.add('blink');
      setTimeout(() => {
        eye.classList.remove('blink');
        scheduleCastleBlink();
      }, 160);
    } else {
      scheduleCastleBlink();
    }
  }, delay);
}
function scheduleCastleYawn() {
  const delay = 15000 + Math.random() * 10000;
  castleYawnTimer = setTimeout(() => {
    if (screen !== 'castle') { scheduleCastleYawn(); return; } // yawns only in the bedroom
    const dragonEl = ui.castleDragon;
    const mouth = dragonEl.querySelector('.dragon-mouth');
    const zzz   = dragonEl.querySelector('.dragon-zzz');
    if (mouth) {
      mouth.classList.add('yawn');
      if (zzz) zzz.classList.add('show');
      setTimeout(() => mouth.classList.remove('yawn'), 900);
      setTimeout(() => {
        if (zzz) zzz.classList.remove('show');
        scheduleCastleYawn();
      }, 1700);
    } else {
      scheduleCastleYawn();
    }
  }, delay);
}
function clearAmbientTimers() {
  if (castleBlinkTimer) { clearTimeout(castleBlinkTimer); castleBlinkTimer = null; }
  if (castleYawnTimer)  { clearTimeout(castleYawnTimer);  castleYawnTimer  = null; }
}

/* ----- Entry into the castle (from picker) ----- */
function openCastle() {
  const { id, cfg } = activeDragonCfg();
  const tints = CASTLE_TINTS[id] || CASTLE_TINTS.ember;
  const tier = muscleTierFor(id);

  // Inject bedroom dragons (room + framed picture)
  injectDragonInto(ui.castleDragon, dragonRestingSVG(cfg, 'big', tier));
  // The picture-frame dragon is a smaller inline SVG (uses picker style)
  ui.castlePictureDragon.innerHTML = dragonPickerSVG(cfg, 'pic', tier);

  applyCastleTint(tints);
  warmChord();

  ui.castleFade.classList.add('show');
  showScreen('castle');
  setTimeout(() => ui.castleFade.classList.remove('show'), 30);

  scheduleCastleBlink();
  scheduleCastleYawn();
}

function applyCastleTint(t) {
  const rainbowGradient = 'linear-gradient(90deg, #ff4d4d 0%, #ff8c30 16%, #ffd200 33%, #3ed03e 50%, #3aa7f0 66%, #6c5cd9 83%, #a23ec6 100%)';
  if (t.blanket === 'rainbow') {
    ui.castleBlanket.style.background = rainbowGradient;
    ui.castleBlanket.style.setProperty('--blanket-color', '#7a6fd0');
  } else {
    ui.castleBlanket.style.background = '';
    ui.castleBlanket.style.setProperty('--blanket-color', t.blanket);
  }
  if (t.rug === 'rainbow') {
    ui.castleRug.style.background = rainbowGradient;
    ui.castleRug.style.setProperty('--rug-color', '#7a6fd0');
  } else {
    ui.castleRug.style.background = '';
    ui.castleRug.style.setProperty('--rug-color', t.rug);
  }
  ui.castleRug.style.setProperty('--rug-trim', t.rugTrim);
}

/* ----- Exit the castle entirely (called by bedroom "← Back" door) ----- */
function closeCastle() {
  clearAmbientTimers();
  ui.castleFade.classList.add('show');
  setTimeout(() => {
    showScreen('dragonPicker');
    renderDragonPicker();
    ui.castleFade.classList.remove('show');
  }, 200);
}

/* ============================================================
   ROOM TRANSITIONS — walk to door, fade, walk in from other side
   ============================================================ */
// Each room knows where its dragon "rests" by default.
const ROOM_DEFAULT_LEFT = {
  castle:     '50%',
  castleHall: '30%',  // leave the center placeholder door visible
  castleGym:  '26%',  // stand to the left of the central barbell
};

function transitionRoom(fromScreen, toScreen, exitDoor /* 'left'|'right' */, enterDoor /* 'left'|'right' */) {
  const fromDragon = currentRoomDragonEl();
  if (!fromDragon) return;
  const fromFacing = fromDragon.querySelector('.dragon-facing');

  // 1. Walk current dragon toward exit door
  fromFacing.classList.toggle('face-left', exitDoor === 'left');
  fromDragon.classList.add('sliding', 'walking');
  fromDragon.style.left = exitDoor === 'left' ? '8%' : '92%';

  setTimeout(() => {
    // 2. Fade
    ui.castleFade.classList.add('show');

    setTimeout(() => {
      // 3. Switch screen + reset old dragon's inline styles for next visit
      fromDragon.classList.remove('walking', 'sliding');
      fromDragon.style.left = '';
      fromFacing.classList.remove('face-left');

      enterRoom(toScreen, enterDoor);

      // 4. Hide fade
      setTimeout(() => ui.castleFade.classList.remove('show'), 30);
    }, CONFIG.castle.transitionFadeSec * 1000);
  }, CONFIG.castle.transitionWalkSec * 1000);
}

// Place the dragon at the entry door of the target room and walk it to its default spot.
function enterRoom(toScreen, enterDoor) {
  const { id, cfg } = activeDragonCfg();
  const tier = muscleTierFor(id);

  showScreen(toScreen);

  // Inject the appropriate dragon SVG into the destination room
  if (toScreen === 'castle') {
    injectDragonInto(ui.castleDragon, dragonRestingSVG(cfg, 'big', tier));
    ui.castlePictureDragon.innerHTML = dragonPickerSVG(cfg, 'pic', tier);
    applyCastleTint(CASTLE_TINTS[id] || CASTLE_TINTS.ember);
  } else if (toScreen === 'castleHall') {
    injectDragonInto(ui.hallDragon, dragonRestingSVG(cfg, 'hall', tier));
  } else if (toScreen === 'castleGym') {
    injectDragonInto(ui.gymDragon, dragonRestingSVG(cfg, 'gym', tier));
    ui.mirrorDragon.innerHTML = dragonRestingSVG(cfg, 'mir', tier);
    updateStrengthPlaque(id);
  }

  const dragonEl = currentRoomDragonEl();
  if (!dragonEl) return;
  const facingEl = dragonEl.querySelector('.dragon-facing');

  // Position at entry door (no transition during placement)
  dragonEl.classList.remove('sliding');
  dragonEl.style.left = enterDoor === 'left' ? '8%' : '92%';
  // Face the direction we'll walk: from left door → walk right (face right)
  facingEl.classList.toggle('face-left', enterDoor === 'right');
  // Force layout so the new position commits before transition is re-enabled
  void dragonEl.offsetWidth;
  // Walk to default position
  dragonEl.classList.add('sliding', 'walking');
  dragonEl.style.left = ROOM_DEFAULT_LEFT[toScreen] || '50%';

  setTimeout(() => {
    dragonEl.classList.remove('walking');
    facingEl.classList.remove('face-left');
    // Make sure mirror reflection always faces left (toward camera)
  }, CONFIG.castle.transitionWalkSec * 1000);
}

function updateStrengthPlaque(id) {
  const cfg = CONFIG.dragons[id];
  const reps = getDragonReps(id);
  const tier = muscleTierFor(id);
  ui.plaqueName.textContent = cfg.name;
  ui.plaqueReps.textContent = reps;
  ui.plaqueTier.textContent = tier === 0 ? 'Tier 0' :
    `Tier ${tier}: ${CONFIG.castle.tierNames[tier]}`;
}

/* ============================================================
   RHYTHM MINI-GAME — v2
   Beat-driven: a steady drum plays on a constant tempo (scheduled
   via Web Audio's AudioContext.currentTime for sample-accuracy).
   Targets arrive in the tap zone EXACTLY on a beat. A 4-beat
   countoff lets the player find the tempo before targets start.
   ============================================================ */

// Constants for the look-ahead scheduler
const SCHED_LOOKAHEAD_SEC = 0.10;   // schedule audio 100ms ahead
const SCHED_INTERVAL_MS   = 25;     // check every 25ms
const COUNTOFF_BEATS      = 4;      // beats 0,1,2,3 = "1","2","3","4"
const TARGET_FIRST_BEAT   = COUNTOFF_BEATS; // first target arrives on beat 4

const rhythm = {
  active: false,        // true between beginRhythmGame() and finishRhythm()
  // Time anchors, set once at game start
  startPerf: 0,         // performance.now() when beat 0 plays
  startAudio: 0,        // actx.currentTime  when beat 0 plays
  lastBeatNumber: 0,    // highest beat we'll schedule (computed from session length)

  // Scheduling pointers (incremented as we handle each beat)
  nextScheduledBeat: 0, // next beat to schedule audio for
  nextVisualBeat: 0,    // next beat to trigger visual pulse for
  nextTargetBeat: TARGET_FIRST_BEAT, // next beat that needs a target spawned

  schedulerHandle: 0,   // setInterval id for the audio look-ahead scheduler
  rafId: 0,             // requestAnimationFrame id for the visual loop

  targets: [],          // live { id, el, spawnPerf, expectedHitPerf, hit, missed }
  nextId: 1,

  sessionReps: 0,
  sessionStartReps: 0,
  sessionStartTier: 0,

  // Cached track geometry (recomputed at game start)
  trackWidth: 0,
  zoneCenterX: 0,
  spawnX: 0,
};

function rhythmZoneCenterPx() {
  // CSS: zone left 6%, width 110px → center = 6% + 55px
  return ui.rhythmTrack.clientWidth * 0.06 + 55;
}
function rhythmSpawnX() {
  return ui.rhythmTrack.clientWidth + 60;
}

/* ----- Entry point: tap on the central barbell calls this ----- */
function startRhythm() {
  // Stop ambient timers so they don't fire mid-game
  clearAmbientTimers();
  // Make sure audio is unlocked — the player has tapped already, but be safe
  if (!audioUnlocked) unlockAudioOnGesture();

  const { id, cfg } = activeDragonCfg();
  const tier = muscleTierFor(id);

  // Inject the dragon performing lifts
  const dragonSvgHost = ui.rhythmDragon.querySelector('.rhythm-dragon-svg');
  if (dragonSvgHost) dragonSvgHost.innerHTML = dragonRestingSVG(cfg, 'rhy', tier);

  // Color targets to match the dragon (rainbow → use gold for visibility)
  const targetColor = cfg.rainbow ? '#ffd76b' : cfg.color;
  ui.rhythmScreen.style.setProperty('--target-color', targetColor);

  // Reset display
  ui.rhythmTime.textContent = CONFIG.castle.rhythmSessionSec;
  ui.rhythmReps.textContent = 0;
  ui.rhythmTrack.querySelectorAll('.rhythm-target').forEach(n => n.remove());
  ui.rhythmFeedback.innerHTML = '';
  ui.rhythmCountoff.textContent = '';
  ui.rhythmCountoff.classList.remove('show');
  ui.rhythmReady.classList.remove('show');
  ui.rhythmInstructions.classList.remove('hide');
  ui.rhythmInstructions.style.display = '';

  showScreen('rhythm');

  // Auto-dismiss the instructions after 5s if the player hasn't tapped GO
  if (rhythmIntroTimeout) clearTimeout(rhythmIntroTimeout);
  rhythmIntroTimeout = setTimeout(dismissRhythmIntro, 5000);
}

/* ----- After "GO!" tap (or auto-timeout), show "GET READY!" then start ----- */
let rhythmIntroTimeout = null;
let rhythmReadyTimeout = null;
function dismissRhythmIntro() {
  if (rhythmIntroTimeout) { clearTimeout(rhythmIntroTimeout); rhythmIntroTimeout = null; }
  ui.rhythmInstructions.classList.add('hide');
  setTimeout(() => {
    ui.rhythmInstructions.style.display = 'none';
  }, 300);
  beginRhythmReady();
}

function beginRhythmReady() {
  // "GET READY!" banner for ~1 second, then start the game
  ui.rhythmReady.classList.remove('show');
  void ui.rhythmReady.offsetWidth;
  ui.rhythmReady.classList.add('show');
  if (rhythmReadyTimeout) clearTimeout(rhythmReadyTimeout);
  rhythmReadyTimeout = setTimeout(() => {
    ui.rhythmReady.classList.remove('show');
    beginRhythmGame();
  }, 1100);
}

/* ----- The actual game starts here: anchor clocks, kick off scheduler + rAF ----- */
function beginRhythmGame() {
  const { id } = activeDragonCfg();
  // Cache track geometry
  rhythm.trackWidth  = ui.rhythmTrack.clientWidth;
  rhythm.zoneCenterX = rhythmZoneCenterPx();
  rhythm.spawnX      = rhythmSpawnX();

  // Compute how many beats we need (countoff + target phase + a little tail).
  // We want roughly CONFIG.castle.rhythmSessionSec of target phase, so:
  const tempoSec = CONFIG.castle.rhythmTempoSec;
  const sessionTargets = Math.floor(CONFIG.castle.rhythmSessionSec / tempoSec);
  rhythm.lastBeatNumber = TARGET_FIRST_BEAT + sessionTargets - 1;

  // Anchor clocks. Give the audio scheduler a small buffer so the first drum
  // hit is comfortably ahead of "now".
  const audioBuffer = 0.18; // seconds
  rhythm.startAudio = (actx ? actx.currentTime : 0) + audioBuffer;
  rhythm.startPerf  = performance.now() + audioBuffer * 1000;

  rhythm.nextScheduledBeat = 0;
  rhythm.nextVisualBeat    = 0;
  rhythm.nextTargetBeat    = TARGET_FIRST_BEAT;
  rhythm.targets = [];
  rhythm.nextId = 1;
  rhythm.sessionReps = 0;
  rhythm.sessionStartReps = getDragonReps(id);
  rhythm.sessionStartTier = muscleTierFor(id);

  rhythm.active = true;

  // Kick off the audio look-ahead scheduler (sample-accurate)
  rhythm.schedulerHandle = setInterval(beatScheduler, SCHED_INTERVAL_MS);
  // Kick off the visual loop
  rhythm.rafId = requestAnimationFrame(rhythmTick);
}

/* ----- Audio look-ahead scheduler — runs on setInterval, schedules with currentTime ----- */
function beatScheduler() {
  if (!rhythm.active || !actx) return;
  const lookEnd = actx.currentTime + SCHED_LOOKAHEAD_SEC;
  while (rhythm.nextScheduledBeat <= rhythm.lastBeatNumber) {
    const beatAudioTime = rhythm.startAudio + rhythm.nextScheduledBeat * CONFIG.castle.rhythmTempoSec;
    if (beatAudioTime > lookEnd) break;
    scheduleDrumAt(beatAudioTime);
    rhythm.nextScheduledBeat++;
  }
}

/* ----- Soft low drum (sine pulse with fast decay) — scheduled at exact AudioContext time ----- */
function scheduleDrumAt(audioTime) {
  if (muted || !actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  // Pitch sweep from ~95Hz down to ~42Hz gives a soft "thump"
  o.frequency.setValueAtTime(95, audioTime);
  o.frequency.exponentialRampToValueAtTime(42, audioTime + 0.10);
  // Fast attack, fast decay — soft heartbeat feel
  g.gain.setValueAtTime(0, audioTime);
  g.gain.linearRampToValueAtTime(0.11, audioTime + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, audioTime + 0.20);
  o.connect(g); g.connect(actx.destination);
  o.start(audioTime);
  o.stop(audioTime + 0.22);
}

/* ----- Visual loop: positions, pulses, target lifecycle, end check ----- */
function rhythmTick(now) {
  if (!rhythm.active) return;

  const tempoMs       = CONFIG.castle.rhythmTempoSec * 1000;
  const targetTravelMs = CONFIG.castle.rhythmTargetTravelSec * 1000;
  const elapsed       = now - rhythm.startPerf;
  const targetPhaseStart = TARGET_FIRST_BEAT * tempoMs;
  const sessionMs     = CONFIG.castle.rhythmSessionSec * 1000;

  // Timer display — counts down once the target phase begins. Before that,
  // show the full session length so the player sees what's coming.
  if (elapsed >= targetPhaseStart) {
    const gameMs = elapsed - targetPhaseStart;
    const remaining = Math.max(0, sessionMs - gameMs);
    ui.rhythmTime.textContent = Math.ceil(remaining / 1000);
  } else {
    ui.rhythmTime.textContent = CONFIG.castle.rhythmSessionSec;
  }

  // Trigger visual beats whose perf time has passed
  while (rhythm.nextVisualBeat <= rhythm.lastBeatNumber) {
    const beatPerf = rhythm.startPerf + rhythm.nextVisualBeat * tempoMs;
    if (now < beatPerf) break;
    triggerVisualBeat(rhythm.nextVisualBeat);
    rhythm.nextVisualBeat++;
  }

  // Spawn targets so they arrive in the tap zone EXACTLY on their beat
  while (rhythm.nextTargetBeat <= rhythm.lastBeatNumber) {
    const arrivePerf = rhythm.startPerf + rhythm.nextTargetBeat * tempoMs;
    const spawnPerf = arrivePerf - targetTravelMs;
    if (now < spawnPerf) break;
    spawnRhythmTarget(rhythm.nextTargetBeat, spawnPerf, arrivePerf);
    rhythm.nextTargetBeat++;
  }

  // Update target positions + miss detection
  const zoneX  = rhythm.zoneCenterX;
  const spawnX = rhythm.spawnX;
  for (let i = rhythm.targets.length - 1; i >= 0; i--) {
    const t = rhythm.targets[i];
    if (t.hit || t.missed) {
      if (now - t.removedAtPerf > 600) {
        t.el.remove();
        rhythm.targets.splice(i, 1);
      }
      continue;
    }
    const age = now - t.spawnPerf;
    const progress = age / targetTravelMs;
    const x = spawnX - (spawnX - zoneX) * progress;
    t.el.style.left = (x - 46) + 'px'; // 46 = half of 92px target

    if (now > t.expectedHitPerf + CONFIG.castle.rhythmGoodWindowMs) {
      t.missed = true;
      t.removedAtPerf = now;
      t.el.classList.add('missed');
      showRhythmFeedback('miss');
    }
  }

  // End the session once we've passed the last target's grace window
  const lastBeatPerf = rhythm.startPerf + rhythm.lastBeatNumber * tempoMs;
  if (now > lastBeatPerf + CONFIG.castle.rhythmGoodWindowMs + 200) {
    finishRhythm();
    return;
  }

  rhythm.rafId = requestAnimationFrame(rhythmTick);
}

/* ----- Visual pulse on every beat: zone, tap button, dragon, countoff number ----- */
function triggerVisualBeat(beatNumber) {
  pulseClass(ui.rhythmZone,      'beat-pulse', 320);
  pulseClass(ui.rhythmTapButton, 'beat-pulse', 320);
  pulseClass(ui.rhythmDragon,    'beat-bob',   360);

  if (beatNumber < COUNTOFF_BEATS) {
    showCountoffNumber(beatNumber + 1);
  }
}

function pulseClass(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;       // force reflow so the animation restarts
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function showCountoffNumber(n) {
  ui.rhythmCountoff.textContent = String(n);
  ui.rhythmCountoff.classList.remove('show');
  void ui.rhythmCountoff.offsetWidth;
  ui.rhythmCountoff.classList.add('show');
}

function spawnRhythmTarget(beatNumber, spawnPerf, arrivePerf) {
  const id = rhythm.nextId++;
  const el = document.createElement('div');
  el.className = 'rhythm-target';
  el.dataset.id = String(id);
  el.style.left = (rhythm.spawnX - 46) + 'px';
  el.textContent = '★';
  ui.rhythmTrack.appendChild(el);
  rhythm.targets.push({
    id, el,
    beatNumber,
    spawnPerf,
    expectedHitPerf: arrivePerf,
    hit: false,
    missed: false,
    removedAtPerf: 0,
  });
}

/* ----- Tap handling: spacebar or any tap on the tap button / shield ----- */
function onRhythmTap() {
  if (!rhythm.active) return;
  // Always give visual tap feedback so the player sees their tap registered
  pulseClass(ui.rhythmTapButton, 'tap-pressed', 180);
  const now = performance.now();
  // Find target whose expected hit time is closest to now
  let best = null;
  let bestDelta = Infinity;
  for (const t of rhythm.targets) {
    if (t.hit || t.missed) continue;
    const d = Math.abs(now - t.expectedHitPerf);
    if (d < bestDelta) { best = t; bestDelta = d; }
  }
  if (!best) return; // tap with no target nearby — silent

  const perfectMs = CONFIG.castle.rhythmPerfectWindowMs;
  const goodMs    = CONFIG.castle.rhythmGoodWindowMs;
  if (bestDelta <= perfectMs) {
    best.hit = true;
    best.removedAtPerf = now;
    best.el.classList.add('hit');
    best.el.textContent = '✨';
    awardRhythm(CONFIG.castle.perfectReps, 'perfect');
  } else if (bestDelta <= goodMs) {
    best.hit = true;
    best.removedAtPerf = now;
    best.el.classList.add('hit');
    awardRhythm(CONFIG.castle.goodReps, 'good');
  } else {
    showRhythmFeedback('miss');
  }
}

function awardRhythm(reps, kind) {
  rhythm.sessionReps += reps;
  ui.rhythmReps.textContent = rhythm.sessionReps;
  showRhythmFeedback(kind);
  ui.rhythmDragon.classList.remove('lifting');
  void ui.rhythmDragon.offsetWidth;
  ui.rhythmDragon.classList.add('lifting');
  setTimeout(() => ui.rhythmDragon.classList.remove('lifting'), 400);
  if (kind === 'perfect') liftClang(true);
  else liftClang(false);
}

function showRhythmFeedback(kind) {
  const el = document.createElement('div');
  el.className = 'rhythm-fb-text ' + kind;
  el.textContent = kind === 'perfect' ? 'PERFECT!' :
                   kind === 'good'    ? 'GOOD!'    :
                                        'miss';
  ui.rhythmFeedback.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function finishRhythm() {
  rhythm.active = false;
  if (rhythm.rafId) cancelAnimationFrame(rhythm.rafId);
  rhythm.rafId = 0;
  if (rhythm.schedulerHandle) clearInterval(rhythm.schedulerHandle);
  rhythm.schedulerHandle = 0;

  const { id } = activeDragonCfg();
  const lifetimeAfter = addDragonReps(id, rhythm.sessionReps);
  const tierAfter = muscleTierFor(id);

  ui.resultsReps.textContent = rhythm.sessionReps;
  ui.resultsLifetime.textContent = lifetimeAfter;
  if (tierAfter > rhythm.sessionStartTier) {
    const cfg = CONFIG.dragons[id];
    ui.resultsTierBanner.innerHTML = `<div class="tier-banner">🎉 ${cfg.name} reached Tier ${tierAfter}: ${CONFIG.castle.tierNames[tierAfter]}! 🎉</div>`;
    tierUpChord();
  } else {
    ui.resultsTierBanner.innerHTML = '';
  }

  showScreen('rhythmResults');
}

function liftClang(perfect) {
  if (muted || !actx) return;
  const f = perfect ? 660 : 440;
  tone(f, 0.10, 'square', 0.04, 0.005);
  setTimeout(() => tone(f * 0.5, 0.14, 'sine', 0.05, 0.005), 30);
}
function tierUpChord() {
  if (muted || !actx) return;
  [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.30, 'triangle', 0.10, 0.01), i * 80));
}
function warmChord() {
  if (muted || !actx) return;
  [392, 494, 587].forEach((f, i) => setTimeout(() => tone(f, 0.55, 'sine', 0.04, 0.08), i * 60));
}

ui.modeAuto.addEventListener('click', () => { onAnyTap(); pickMode('auto'); });
ui.modeAim .addEventListener('click', () => { onAnyTap(); pickMode('aim'); });
function pickMode(m) {
  selectedMode = m;
  writeStr(KEYS.controlMode(), m);
  startNewRun();
}
ui.cpBack.addEventListener('click', () => { onAnyTap(); showScreen('dragonPicker'); renderDragonPicker(); });
ui.dpSwitch.addEventListener('click', () => {
  onAnyTap();
  localStorage.removeItem('arcade-current-player');
  window.location.href = '/';
});
ui.napPlayAgain.addEventListener('click', () => { onAnyTap(); startNewRun(); });
ui.napPickDragon.addEventListener('click', () => { onAnyTap(); showScreen('dragonPicker'); renderDragonPicker(); });

// Castle bedroom — entry from dragon picker, exit via the door
ui.visitCastleBtn.addEventListener('click', () => { onAnyTap(); openCastle(); });
ui.castleDoorBtn .addEventListener('click', () => { onAnyTap(); closeCastle(); });

// Bedroom → Hallway
ui.castleHallDoorBtn.addEventListener('click', () => {
  onAnyTap();
  transitionRoom('castle', 'castleHall', 'right', 'left');
});
// Hallway → Bedroom
ui.hallBedroomDoorBtn.addEventListener('click', () => {
  onAnyTap();
  transitionRoom('castleHall', 'castle', 'left', 'right');
});
// Hallway → Weight Room
ui.hallWeightDoorBtn.addEventListener('click', () => {
  onAnyTap();
  transitionRoom('castleHall', 'castleGym', 'right', 'left');
});
// Weight Room → Hallway
ui.gymHallDoorBtn.addEventListener('click', () => {
  onAnyTap();
  transitionRoom('castleGym', 'castleHall', 'left', 'right');
});

// Tap the central barbell to start the rhythm mini-game
ui.liftBtn.addEventListener('click', () => { onAnyTap(); startRhythm(); });

// Rhythm input: TAP button, tap-shield, and spacebar all score taps.
// During the instruction overlay phase, the GO button dismisses it instead.
ui.rhythmTapShield .addEventListener('click', () => { onAnyTap(); onRhythmTap(); });
ui.rhythmTapButton .addEventListener('click', (e) => { e.stopPropagation(); onAnyTap(); onRhythmTap(); });
ui.rhythmGoBtn     .addEventListener('click', (e) => { e.stopPropagation(); onAnyTap(); dismissRhythmIntro(); });
window.addEventListener('keydown', (e) => {
  if (screen !== 'rhythm') return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    // If the instruction overlay is still up, treat key as the GO button
    if (!ui.rhythmInstructions.classList.contains('hide') &&
        ui.rhythmInstructions.style.display !== 'none') {
      dismissRhythmIntro();
    } else {
      onRhythmTap();
    }
  }
});

// Rhythm results buttons
ui.resultsLiftAgain.addEventListener('click', () => { onAnyTap(); startRhythm(); });
ui.resultsDone.addEventListener('click', () => {
  onAnyTap();
  // Return to weight room. Re-render strength plaque + mirror dragon to reflect new reps.
  const { id, cfg } = activeDragonCfg();
  const tier = muscleTierFor(id);
  injectDragonInto(ui.gymDragon, dragonRestingSVG(cfg, 'gym', tier));
  ui.mirrorDragon.innerHTML = dragonRestingSVG(cfg, 'mir', tier);
  updateStrengthPlaque(id);
  showScreen('castleGym');
  scheduleCastleBlink();
});

ui.muteBtn.addEventListener('click', () => {
  onAnyTap();
  muted = !muted;
  writeStr(KEYS.muted(), muted);
  updateMuteUI();
  if (muted) stopBgHum();
  else startBgHum();
});

function onAnyTap() {
  if (!audioUnlocked) unlockAudioOnGesture();
}
window.addEventListener('pointerdown', onAnyTap);
window.addEventListener('touchstart',  onAnyTap, { passive: true });
window.addEventListener('keydown',     onAnyTap);

/* ============================================================
   RUN LIFECYCLE
   ============================================================ */
function startNewRun() {
  game.dragon = makeDragon();
  game.zombies = [];
  game.fireballs = [];
  game.cured = [];
  game.particles = [];
  game.speeches = [];
  game.scenery = [];
  game.score = 0;
  game.stage = 1;
  game.meter = 0;
  game.wave = 1;
  game.waveTimer = 0;
  game.spawnTimer = spawnIntervalForWave(1);
  game.shootTimer = 0;
  game.manualCooldown = 0;
  game.napping = false;
  game.scrollX = 0;
  game.lastSceneryX = 0;
  game.lastDistrictIdx = -1;
  game.castlesPlacedThroughPass = -1;

  // Pre-seed scenery to fill the first screen
  maybeSpawnScenery();

  showScreen('playing');
  updateScoreUI();
  updateStageUI();
  updateMeterUI();

  // Show the starting district banner after a beat
  setTimeout(() => {
    const d = districtAt(game.scrollX + cssW * 0.5);
    showDistrictBanner(d);
  }, 600);
}

function triggerNap() {
  if (game.napping) return;
  game.napping = true;
  game.dragon.flyUpProgress = 0.001;
  sfx.yawn();
  const prev = readNum(KEYS.highScore(), 0);
  if (game.score > prev) writeStr(KEYS.highScore(), game.score);
}

function showNapScreen() {
  showScreen('nap');
  ui.napCount.textContent = game.score;
  const prev = readNum(KEYS.highScore(), 0);
  if (game.score >= prev && game.score > 0) {
    ui.napHighWrap.innerHTML = `<div class="new-high">🏆 New high score!</div>`;
  } else {
    ui.napHighWrap.innerHTML = `<div class="best">Best: ${prev}</div>`;
  }
  const biggest = readNum(KEYS.biggestStage(), game.stage);
  ui.napStage.textContent = '🐉 ' + CONFIG.stageNames[(biggest || 1) - 1];
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;

  if (screen === 'playing' || screen === 'nap') {
    update(dt);
    render();
  } else if (inCastle()) {
    // All castle rooms are pure CSS/SVG — no canvas work needed
  } else {
    // Idle background so the canvas doesn't look blank on overlays
    drawBackground();
  }
  requestAnimationFrame(loop);
}

/* ============================================================
   BOOT
   ============================================================ */
renderDragonPicker();
updateMuteUI();
showScreen('dragonPicker');
requestAnimationFrame(loop);
