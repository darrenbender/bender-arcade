// Mini Cars rules: the 8 cars and what their special does, the 16 paints, and how a race
// works (the grid, the countdown, checkpoints in order, laps, places, times, trophies).
// No Minecraft imports, so all of this can be tested outside the game.

export const PAINTS = [
  { name: "Red", hex: "#d83a33", text: "§c" },
  { name: "Orange", hex: "#f08a24", text: "§6" },
  { name: "Yellow", hex: "#f5cf2b", text: "§e" },
  { name: "Lime", hex: "#7fd13b", text: "§a" },
  { name: "Green", hex: "#2f9e44", text: "§2" },
  { name: "Teal", hex: "#1fa3a0", text: "§3" },
  { name: "Sky Blue", hex: "#5ab8f0", text: "§b" },
  { name: "Blue", hex: "#2f5fd8", text: "§9" },
  { name: "Purple", hex: "#8a44d8", text: "§5" },
  { name: "Pink", hex: "#f07ab8", text: "§d" },
  { name: "White", hex: "#eef0f2", text: "§f" },
  { name: "Silver", hex: "#a9b0b8", text: "§7" },
  { name: "Gray", hex: "#5d636b", text: "§8" },
  { name: "Black", hex: "#25282d", text: "§0" },
  { name: "Brown", hex: "#8a5a34", text: "§6" },
  { name: "Gold", hex: "#e0b23a", text: "§g" },
];

/**
 * The cars. speed is Minecraft movement (like a horse), jump is the jump strength,
 * step is how high a block it drives up. paint is the color it starts in.
 */
export const CARS = [
  { key: "go_kart", name: "Go-Kart", speed: 0.4, jump: 0.5, step: 1.0625, seats: 1, special: "turbo", paint: 0, about: "Small and quick" },
  { key: "race_car", name: "Race Car", speed: 0.42, jump: 0.5, step: 1.0625, seats: 1, special: "turbo", paint: 7, about: "The fastest car" },
  { key: "monster_truck", name: "Monster Truck", speed: 0.32, jump: 1.0, step: 1.5625, seats: 2, special: "mega_jump", paint: 4, about: "Giant wheels, giant jumps" },
  { key: "jeep", name: "Jeep", speed: 0.34, jump: 0.7, step: 1.5625, seats: 2, special: "horn", paint: 14, about: "Climbs over anything" },
  { key: "police_car", name: "Police Car", speed: 0.38, jump: 0.5, step: 1.0625, seats: 2, special: "siren", paint: 13, about: "Quick, with a siren" },
  { key: "fire_truck", name: "Fire Truck", speed: 0.3, jump: 0.5, step: 1.0625, seats: 2, special: "water", paint: 0, about: "A big ladder on top" },
  { key: "ice_cream_truck", name: "Ice-Cream Truck", speed: 0.28, jump: 0.5, step: 1.0625, seats: 2, special: "jingle", paint: 9, about: "Plays a tune and hands out treats" },
  { key: "taxi", name: "Taxi", speed: 0.36, jump: 0.5, step: 1.0625, seats: 2, special: "horn", paint: 2, about: "Room for a friend" },
];
export const carId = (c) => `bender:mini_${c.key}`;
export const kitId = (c) => `bender:mini_${c.key}_kit`;
export const CAR_IDS = new Set(CARS.map(carId));
export function carOf(typeId) {
  return CARS.find((c) => carId(c) === typeId || kitId(c) === typeId);
}

export const SPECIALS = {
  turbo: { name: "Turbo", cooldown: 200, ticks: 60, how: "a burst of speed" },
  mega_jump: { name: "Mega Jump", cooldown: 40, up: 1.1, how: "a huge jump" },
  horn: { name: "Horn", cooldown: 10, how: "beep beep!" },
  siren: { name: "Siren", cooldown: 10, how: "siren and lights on or off" },
  water: { name: "Water Spray", cooldown: 20, range: 7, how: "sprays water and puts out fires" },
  jingle: { name: "Ice-Cream Jingle", cooldown: 600, range: 8, how: "a tune, and a treat for everyone close by" },
};

/** The ice-cream truck's tune: [note pitch, ticks after the start]. */
export const JINGLE = [[1.0, 0], [1.26, 4], [1.5, 8], [1.26, 12], [1.0, 16], [1.5, 22], [1.33, 26], [1.12, 30], [1.0, 36]];

// ------------------------------------------------------------ races

export const LAPS = 3;
export const COUNTDOWN = [3, 2, 1]; // one second each, then GO
export const AFTER_FIRST = 20 * 45; // ticks the others get after the winner finishes
export const RACE_LIMIT = 20 * 60 * 5; // a race stops after 5 minutes
export const GOLD_TIME = 20 * 50; // racing alone: finish 3 laps this fast for gold
export const SILVER_TIME = 20 * 70; // ... this fast for silver (otherwise bronze)

/**
 * Start a race. Checkpoint 0 is the start/finish line; the cars start just behind it,
 * so the first one they have to reach is checkpoint 1.
 */
export function newRace(racers, checkpoints, tick) {
  const r = { checkpoints, startTick: tick, goTick: tick + 20 * COUNTDOWN.length, racers: {}, order: [] };
  for (const p of racers) r.racers[p.id] = { id: p.id, name: p.name, lap: 0, next: 1, done: false, time: 0, lapStart: 0, bestLap: 0, place: 0 };
  return r;
}

/** Which countdown light is on: 3, 2, 1, then 0 = GO (and racing). */
export function countdown(race, tick) {
  if (tick >= race.goTick) return 0;
  return COUNTDOWN[Math.min(COUNTDOWN.length - 1, Math.floor((tick - race.startTick) / 20))];
}

/**
 * A racer is in checkpoint `cp`. Only the next one in order counts. Returns what
 * happened: undefined, "checkpoint", "lap" (with lapTime) or "finish" (with place, time).
 */
export function reachCheckpoint(race, id, cp, tick) {
  const r = race.racers[id];
  if (!r || r.done || tick < race.goTick || cp !== r.next) return undefined;
  r.next = (r.next + 1) % race.checkpoints;
  if (cp !== 0) return { what: "checkpoint" };
  const lapTime = tick - (r.lapStart || race.goTick);
  r.lapStart = tick;
  r.bestLap = r.bestLap ? Math.min(r.bestLap, lapTime) : lapTime;
  r.lap++;
  if (r.lap < LAPS) return { what: "lap", lap: r.lap + 1, lapTime };
  r.done = true;
  r.time = tick - race.goTick;
  race.order.push(id);
  r.place = race.order.length;
  if (race.order.length === 1) race.firstDone = tick;
  return { what: "finish", place: r.place, time: r.time, lapTime };
}

/** How far along a racer is (for standings): laps, then checkpoints. */
export function progress(race, id) {
  const r = race.racers[id];
  if (r.done) return 1000 - r.place;
  const cps = r.next === 0 ? race.checkpoints - 1 : r.next - 1;
  return r.lap * race.checkpoints + cps;
}

/** Racers in order: finishers by place, then everyone else by how far they got. */
export function standings(race) {
  return Object.values(race.racers).sort((a, b) => progress(race, b.id) - progress(race, a.id));
}

/** Is the race over? Everyone finished, the others ran out of time, or it went too long. */
export function raceOver(race, tick) {
  const all = Object.values(race.racers);
  if (all.every((r) => r.done)) return true;
  if (race.firstDone && tick - race.firstDone >= AFTER_FIRST) return true;
  return tick - race.goTick >= RACE_LIMIT;
}

/** The trophy for a place: gold, silver, bronze. Racing alone, your time picks it. */
export function trophyFor(race, id) {
  const r = race.racers[id];
  if (!r?.done) return undefined;
  if (Object.keys(race.racers).length === 1) return r.time <= GOLD_TIME ? "gold" : r.time <= SILVER_TIME ? "silver" : "bronze";
  return ["gold", "silver", "bronze"][r.place - 1];
}

export function ordinal(n) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
}

/** 1234 ticks -> "1:01.7" */
export function formatTime(ticks) {
  const tenths = Math.round(ticks / 2);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${m}:${String(s).padStart(2, "0")}.${t}`;
}

/** Is a new time a track record? */
export function isRecord(record, time) {
  return !record || time < record.time;
}

/** The grid slot for each racer (round-robin if there are more racers than slots). */
export function gridSlots(count, slots) {
  return Array.from({ length: count }, (_, i) => slots[i % slots.length]);
}
