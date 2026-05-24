'use strict';

/* ============================================================
   PLAYER CHECK — STANDARDS §5
   ============================================================ */
const player = localStorage.getItem('arcade-current-player');
if (!player) {
  window.location.href = '/';
}

const KEY = {
  instrument: `rainbow-sound-garden:${player}:instrument`,
  mood:       `rainbow-sound-garden:${player}:mood`,
  octave:     `rainbow-sound-garden:${player}:octave`,
  tempo:      `rainbow-sound-garden:${player}:tempo`,
};

document.getElementById('player-name').textContent = player || 'friend';

/* ============================================================
   CONSTANTS
   ============================================================ */
const MELODY_ROWS = 7;
const DRUM_ROW    = 7;
const ROWS        = 8;
const STEPS       = 8;

// Pentatonic scales — every combination sounds harmonious.
// Each array is descending so row 0 (red) is highest, row 6 (violet) is lowest.
const SCALES = {
  sunny:  ['C6', 'A5', 'G5', 'E5', 'D5', 'C5', 'A4'],
  dreamy: ['A5', 'G5', 'E5', 'D5', 'C5', 'A4', 'G4'],
};

const ROW_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];

const INSTRUMENTS  = ['bells', 'musicbox', 'marimba', 'harp', 'pad'];
const MOODS        = ['sunny', 'dreamy'];
const OCTAVES      = [-1, 0, 1];
const TEMPOS       = [70, 110, 160];

const ENCOURAGEMENTS = [
  "Beautiful colors! 🌈",
  "You're a music maker!",
  "I love what you're making!",
  "Wow, that sounds great!",
  "Try anything you want!",
  "There's no wrong way to play!",
  "Your brain is making music! 🧠",
  "Keep going, this is fun!",
  "Cool sound! ✨",
  "You have such good ideas!",
  "Music is for trying things!",
  "Every color is a friend!",
  "Make whatever you feel like!",
  "I like your style! 🎶",
];

/* ============================================================
   SETTINGS — load from localStorage with safe fallbacks
   ============================================================ */
let instrument  = localStorage.getItem(KEY.instrument) || 'bells';
let mood        = localStorage.getItem(KEY.mood)       || 'sunny';
let octaveShift = Number(localStorage.getItem(KEY.octave));
let bpm         = Number(localStorage.getItem(KEY.tempo));

if (!INSTRUMENTS.includes(instrument)) instrument = 'bells';
if (!MOODS.includes(mood))             mood       = 'sunny';
if (!OCTAVES.includes(octaveShift))    octaveShift = 0;
if (!TEMPOS.includes(bpm))             bpm        = 110;

/* ============================================================
   AUDIO ENGINE
   Web Audio synth chain — shared reverb + master gain. Per-voice
   functions push different timbres into the same chain.
   ============================================================ */
let audioCtx = null;
let masterGain = null;
let reverbNode = null;
let filterNode = null;
let extraReverbSend = null;  // heavier reverb path for the dream pad

function initAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.32;

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 2600;
  filterNode.Q.value = 0.6;

  reverbNode = audioCtx.createConvolver();
  reverbNode.buffer = makeReverbIR(audioCtx, 2.4, 2.5);

  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.28;

  extraReverbSend = audioCtx.createGain();
  extraReverbSend.gain.value = 0.55;
  extraReverbSend.connect(reverbNode);

  filterNode.connect(masterGain);
  filterNode.connect(reverbNode);
  reverbNode.connect(reverbGain);
  reverbGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  // iOS Safari silent-buffer trick: starting a one-sample source from the
  // initial user gesture fully unlocks the audio session. Without this,
  // some iOS versions keep audio inaudible even after resume().
  try {
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch (e) { /* ignore */ }
}

// Call before every note. If the context dropped back to 'suspended'
// (iOS does this when the page is backgrounded), kick it again. resume()
// is a no-op when already running, so this is cheap.
function ensureRunning() {
  if (!audioCtx) return;
  if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
  }
}

function makeReverbIR(ctx, duration, decay) {
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const ir = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return ir;
}

const NOTE_FREQ = (() => {
  const A4 = 440;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const cache = {};
  return (name) => {
    if (cache[name]) return cache[name];
    const letter = name[0];
    const octave = parseInt(name.slice(1), 10);
    const semitone = semis[letter] + (octave - 4) * 12;
    const f = A4 * Math.pow(2, semitone / 12);
    cache[name] = f;
    return f;
  };
})();

function shiftedNote(noteName) {
  if (!octaveShift) return noteName;
  const letter = noteName[0];
  const oct = parseInt(noteName.slice(1), 10) + octaveShift;
  return letter + oct;
}

/* ---- Voice: Bells (warm, default) ---- */
function voiceBells(freq, t0, dur) {
  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  o1.type = 'sine';
  o2.type = 'triangle';
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.005;

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.7, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.1);
  g.gain.setValueAtTime(0.4, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  o1.connect(g);
  o2.connect(g);
  g.connect(filterNode);

  o1.start(t0); o2.start(t0);
  o1.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
}

/* ---- Voice: Music box (tinkly, short attack) ---- */
function voiceMusicBox(freq, t0, dur) {
  const fund = audioCtx.createOscillator();
  fund.type = 'triangle';
  fund.frequency.value = freq;

  // Slightly inharmonic partial gives a bell-ish ring.
  const partial = audioCtx.createOscillator();
  partial.type = 'sine';
  partial.frequency.value = freq * 3.02;

  const g = audioCtx.createGain();
  const noteLen = Math.min(dur, 0.7);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.55, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + noteLen);

  const partialG = audioCtx.createGain();
  partialG.gain.value = 0.22;

  fund.connect(g);
  partial.connect(partialG);
  partialG.connect(g);
  g.connect(filterNode);

  fund.start(t0); partial.start(t0);
  fund.stop(t0 + noteLen + 0.05); partial.stop(t0 + noteLen + 0.05);
}

/* ---- Voice: Marimba (wooden pluck) ---- */
function voiceMarimba(freq, t0, dur) {
  const fund = audioCtx.createOscillator();
  fund.type = 'triangle';
  fund.frequency.value = freq;

  const sub = audioCtx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = freq * 0.5;

  const g = audioCtx.createGain();
  const noteLen = Math.min(dur, 0.4);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.65, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + noteLen);

  const subG = audioCtx.createGain();
  subG.gain.value = 0.13;

  fund.connect(g);
  sub.connect(subG);
  subG.connect(g);
  g.connect(filterNode);

  fund.start(t0); sub.start(t0);
  fund.stop(t0 + noteLen + 0.05); sub.stop(t0 + noteLen + 0.05);
}

/* ---- Voice: Plucky harp (saw + filter sweep) ---- */
function voiceHarp(freq, t0, dur) {
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 4;
  // Sweep from bright to mellow — gives the "pluck" character.
  filt.frequency.setValueAtTime(Math.min(freq * 6, 6000), t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.2, 200), t0 + 0.4);

  const g = audioCtx.createGain();
  const noteLen = Math.min(dur, 0.8);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.4, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + noteLen);

  osc.connect(filt);
  filt.connect(g);
  g.connect(filterNode);

  osc.start(t0);
  osc.stop(t0 + noteLen + 0.05);
}

/* ---- Voice: Dream pad (slow attack, long release, extra reverb) ---- */
function voicePad(freq, t0, dur) {
  const padDur = Math.max(dur, 1.4);

  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  o1.type = 'sine';
  o2.type = 'triangle';
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.5;  // 5th above for shimmer

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.42, t0 + 0.35);
  g.gain.setValueAtTime(0.42, t0 + padDur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + padDur);

  const fifthG = audioCtx.createGain();
  fifthG.gain.value = 0.22;

  o1.connect(g);
  o2.connect(fifthG);
  fifthG.connect(g);

  g.connect(filterNode);
  g.connect(extraReverbSend);  // heavier reverb send

  o1.start(t0); o2.start(t0);
  o1.stop(t0 + padDur + 0.1); o2.stop(t0 + padDur + 0.1);
}

function playNote(noteName, when = 0, dur = 0.6) {
  if (!audioCtx) return;
  ensureRunning();
  const t0 = audioCtx.currentTime + when;
  const freq = NOTE_FREQ(shiftedNote(noteName));
  switch (instrument) {
    case 'musicbox': voiceMusicBox(freq, t0, dur); break;
    case 'marimba':  voiceMarimba(freq, t0, dur);  break;
    case 'harp':     voiceHarp(freq, t0, dur);     break;
    case 'pad':      voicePad(freq, t0, dur);      break;
    default:         voiceBells(freq, t0, dur);
  }
}

/* ---- Drum: soft hand drum (sub sweep + noise thunk) ---- */
function playDrum(when = 0) {
  if (!audioCtx) return;
  ensureRunning();
  const t0 = audioCtx.currentTime + when;

  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, t0);
  sub.frequency.exponentialRampToValueAtTime(40, t0 + 0.18);

  const subG = audioCtx.createGain();
  subG.gain.setValueAtTime(0, t0);
  subG.gain.linearRampToValueAtTime(0.7, t0 + 0.005);
  subG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);

  sub.connect(subG);
  subG.connect(filterNode);

  sub.start(t0);
  sub.stop(t0 + 0.32);

  // Wood-thunk noise burst, filtered around 1.4 kHz.
  const noiseBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.05), audioCtx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  const noiseFilt = audioCtx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = 1400;
  noiseFilt.Q.value = 1.2;

  const noiseG = audioCtx.createGain();
  noiseG.gain.setValueAtTime(0.22, t0);
  noiseG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);

  noise.connect(noiseFilt);
  noiseFilt.connect(noiseG);
  noiseG.connect(filterNode);

  noise.start(t0);
  noise.stop(t0 + 0.06);
}

/* ============================================================
   GRID STATE
   ============================================================ */
const state = Array.from({ length: ROWS }, () => Array(STEPS).fill(false));

let playing = false;
let currentStep = 0;
let stepTimer = null;

const gridEl = document.getElementById('grid');

function buildGrid() {
  // Preserve the drum-label; clear only cells.
  gridEl.querySelectorAll('.cell').forEach(c => c.remove());

  for (let r = 0; r < ROWS; r++) {
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      const isDrum = (r === DRUM_ROW);
      cell.className = `cell row-${r}${isDrum ? ' drum-cell' : ''}`;
      cell.dataset.row = r;
      cell.dataset.step = s;
      cell.style.gridColumn = (s + 2).toString();
      cell.style.gridRow = (r + 1).toString();
      cell.setAttribute('role', 'button');
      const label = isDrum
        ? `Drum, beat ${s + 1}`
        : `${ROW_NAMES[r]}, beat ${s + 1}`;
      cell.setAttribute('aria-label', label);
      cell.addEventListener('click', onCellTap);
      gridEl.appendChild(cell);
    }
  }
}

function onCellTap(e) {
  const cell = e.currentTarget;
  const r = +cell.dataset.row;
  const s = +cell.dataset.step;
  const newOn = !state[r][s];
  state[r][s] = newOn;
  cell.classList.toggle('on', newOn);

  if (newOn) {
    if (r === DRUM_ROW) playDrum(0);
    else playNote(SCALES[mood][r], 0, 0.8);
    flashCell(cell);
    spawnSparkles(cell);
    speech.queueEncouragement();
  }
}

function flashCell(cell) {
  cell.classList.add('flash');
  setTimeout(() => cell.classList.remove('flash'), 200);
}

function spawnSparkles(cell) {
  const rect = cell.getBoundingClientRect();
  const gridRect = gridEl.getBoundingClientRect();
  const cx = rect.left - gridRect.left + rect.width / 2;
  const cy = rect.top - gridRect.top + rect.height / 2;
  for (let i = 0; i < 5; i++) {
    const sp = document.createElement('div');
    sp.className = 'sparkle';
    sp.style.left = (cx - 6) + 'px';
    sp.style.top = (cy - 6) + 'px';
    const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 28 + Math.random() * 16;
    sp.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    sp.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    gridEl.appendChild(sp);
    setTimeout(() => sp.remove(), 700);
  }
}

/* ============================================================
   PLAYBACK
   ============================================================ */
const playBtn = document.getElementById('play');

function stepInterval() {
  // Eighth notes: a full bar is 4 beats, we render 8 steps per bar.
  return 60000 / bpm / 2;
}

function startPlay() {
  if (playing) return;
  playing = true;
  currentStep = 0;
  playBtn.classList.add('playing');
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="white" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  playBtn.setAttribute('aria-label', 'Pause');
  tick();
  stepTimer = setInterval(tick, stepInterval());
  speech.show("Listen to your song! 🎵");
}

function stopPlay() {
  if (!playing) return;
  playing = false;
  clearInterval(stepTimer);
  stepTimer = null;
  playBtn.classList.remove('playing');
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="white" aria-hidden="true"><polygon points="6,4 20,12 6,20"/></svg>';
  playBtn.setAttribute('aria-label', 'Play');
  document.querySelectorAll('.cell.playhead-dim').forEach(c => c.classList.remove('playhead-dim'));
}

function tick() {
  document.querySelectorAll('.cell.playhead-dim').forEach(c => c.classList.remove('playhead-dim'));
  document.querySelectorAll('.cell').forEach(cell => {
    if (+cell.dataset.step !== currentStep) cell.classList.add('playhead-dim');
  });

  for (let r = 0; r < ROWS; r++) {
    if (state[r][currentStep]) {
      if (r === DRUM_ROW) playDrum(0);
      else playNote(SCALES[mood][r], 0, 0.6);
      const cell = gridEl.querySelector(`.cell[data-row="${r}"][data-step="${currentStep}"]`);
      if (cell) flashCell(cell);
    }
  }

  currentStep = (currentStep + 1) % STEPS;
}

playBtn.addEventListener('click', () => {
  if (playing) stopPlay();
  else startPlay();
});

/* ============================================================
   PICKER UI (instrument / mood / octave / tempo)
   Each picker is a row of buttons; one is .active. Selection
   persists per-player in localStorage.
   ============================================================ */
function setActivePill(rowSelector, matchFn) {
  document.querySelectorAll(`${rowSelector} .picker-btn, ${rowSelector} .tempo-btn`).forEach(btn => {
    btn.classList.toggle('active', matchFn(btn));
  });
}

function previewCurrentVoice() {
  if (!audioCtx) return;
  playNote(SCALES[mood][3], 0, 0.6);
}

// Instrument
setActivePill('#instrument-picker', btn => btn.dataset.instrument === instrument);
document.querySelectorAll('#instrument-picker .picker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    instrument = btn.dataset.instrument;
    localStorage.setItem(KEY.instrument, instrument);
    setActivePill('#instrument-picker', b => b.dataset.instrument === instrument);
    previewCurrentVoice();
  });
});

// Mood
setActivePill('#mood-picker', btn => btn.dataset.mood === mood);
document.querySelectorAll('#mood-picker .picker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    mood = btn.dataset.mood;
    localStorage.setItem(KEY.mood, mood);
    setActivePill('#mood-picker', b => b.dataset.mood === mood);
    previewCurrentVoice();
  });
});

// Octave
setActivePill('#octave-picker', btn => +btn.dataset.octave === octaveShift);
document.querySelectorAll('#octave-picker .picker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    octaveShift = +btn.dataset.octave;
    localStorage.setItem(KEY.octave, String(octaveShift));
    setActivePill('#octave-picker', b => +b.dataset.octave === octaveShift);
    previewCurrentVoice();
  });
});

// Tempo
setActivePill('#tempo', btn => +btn.dataset.bpm === bpm);
document.querySelectorAll('.tempo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    bpm = +btn.dataset.bpm;
    localStorage.setItem(KEY.tempo, String(bpm));
    setActivePill('#tempo', b => +b.dataset.bpm === bpm);
    if (playing) {
      clearInterval(stepTimer);
      stepTimer = setInterval(tick, stepInterval());
    }
  });
});

/* ============================================================
   FRESH START
   ============================================================ */
const modal = document.getElementById('modal');

function songIsEmpty() {
  return !state.some(row => row.some(v => v));
}

function clearSong() {
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < STEPS; s++) state[r][s] = false;
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('on'));
}

document.getElementById('clear').addEventListener('click', () => {
  if (songIsEmpty()) {
    speech.show("Your garden is already empty! Plant some colors. 🌱");
    return;
  }
  modal.classList.add('show');
});
document.getElementById('modal-cancel').addEventListener('click', () => {
  modal.classList.remove('show');
});
document.getElementById('modal-confirm').addEventListener('click', () => {
  modal.classList.remove('show');
  clearSong();
  speech.show("Fresh start! What will you make next? 🌈");
});

/* ============================================================
   BUMBLE'S ENCOURAGEMENT
   ============================================================ */
const speechEl = document.getElementById('speech');

const speech = (() => {
  let queueTimer = null;
  let lastShownAt = 0;
  let lastIndex = -1;

  function show(text) {
    speechEl.classList.add('fade');
    setTimeout(() => {
      speechEl.textContent = text;
      speechEl.classList.remove('fade');
      lastShownAt = Date.now();
    }, 180);
  }

  function queueEncouragement() {
    if (Date.now() - lastShownAt < 6000) return;
    clearTimeout(queueTimer);
    queueTimer = setTimeout(() => {
      let i;
      do { i = Math.floor(Math.random() * ENCOURAGEMENTS.length); }
      while (i === lastIndex && ENCOURAGEMENTS.length > 1);
      lastIndex = i;
      show(ENCOURAGEMENTS[i]);
    }, 600);
  }

  return { show, queueEncouragement };
})();

/* ============================================================
   STARTUP
   ============================================================ */
buildGrid();

document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const startScreen = document.getElementById('start-screen');
  startScreen.classList.add('hidden');
  setTimeout(() => { startScreen.style.display = 'none'; }, 500);
  showNavBar();
});

/* ============================================================
   NAV BAR — STANDARDS §8
   ============================================================ */
const navBar = document.getElementById('nav-bar');
const navModal = document.getElementById('nav-modal');
let pendingLeaveAction = null;

function showNavBar() { navBar.classList.remove('hidden'); }
function hideNavBar() { navBar.classList.add('hidden'); }

function hasUnsavedSong() {
  return !songIsEmpty();
}

function showLeaveConfirm(action) {
  pendingLeaveAction = action;
  navModal.classList.add('show');
}
function hideLeaveConfirm() {
  navModal.classList.remove('show');
  pendingLeaveAction = null;
}

function returnToStartScreen() {
  if (playing) stopPlay();
  clearSong();
  hideNavBar();
  const startScreen = document.getElementById('start-screen');
  startScreen.classList.add('hidden');
  startScreen.style.display = 'flex';
  void startScreen.offsetHeight;       // force reflow so the fade-in runs
  startScreen.classList.remove('hidden');
}

function goToArcade() {
  window.location.href = '/';
}

document.getElementById('nav-menu').addEventListener('click', () => {
  if (hasUnsavedSong()) showLeaveConfirm(returnToStartScreen);
  else returnToStartScreen();
});
document.getElementById('nav-arcade').addEventListener('click', () => {
  if (hasUnsavedSong()) showLeaveConfirm(goToArcade);
  else goToArcade();
});
document.getElementById('nav-modal-cancel').addEventListener('click', hideLeaveConfirm);
document.getElementById('nav-modal-confirm').addEventListener('click', () => {
  const action = pendingLeaveAction;
  hideLeaveConfirm();
  if (action) action();
});
document.getElementById('start-back').addEventListener('click', goToArcade);

/* ============================================================
   iOS gesture niceties
   ============================================================ */
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
