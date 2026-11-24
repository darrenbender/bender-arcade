// Star Knights rules: the blade colors, which Star Power you get from where you look,
// who a power reaches, bouncing blaster bolts back, Duel Mode scores, training waves,
// the Droid Buddy's paint, and how the Star Dart flies.
// No Minecraft imports, so all of this can be tested outside the game.

export const DEG = Math.PI / 180;

// ------------------------------------------------------------ blades and crystals

/** The blade colors. Each has a Star Crystal and a Star Blade. */
export const COLORS = [
  { key: "blue", name: "Blue", text: "§9", hex: "#3d8bff" },
  { key: "green", name: "Green", text: "§a", hex: "#3dff5a" },
  { key: "red", name: "Red", text: "§c", hex: "#ff3535" },
  { key: "purple", name: "Purple", text: "§5", hex: "#b44dff" },
  { key: "yellow", name: "Yellow", text: "§e", hex: "#ffe23d" },
  { key: "orange", name: "Orange", text: "§6", hex: "#ff8a1a" },
  { key: "white", name: "White", text: "§f", hex: "#f2f6ff" },
  { key: "rainbow", name: "Rainbow", text: "", hex: "#ff3535", rainbow: "changing" },
  { key: "stripes", name: "Rainbow Stripes", text: "", hex: "#3dff5a", rainbow: "stripes" },
];
export const RAINBOW_HUES = 12; // the color-changing blade cycles through 12 colors

export const bladeId = (c) => `bender:star_blade_${c.key}`;
export const crystalId = (c) => `bender:star_crystal_${c.key}`;
export const BLADE_IDS = new Set(COLORS.map(bladeId));
export const CRYSTAL_IDS = new Set(COLORS.map(crystalId));

/** The color a blade or crystal item is, or undefined. */
export function colorOf(itemId) {
  return COLORS.find((c) => itemId === bladeId(c) || itemId === crystalId(c));
}

/** "Rainbow" in rainbow letters, or the color's own text color. */
export function colorful(c, text) {
  if (!c.rainbow) return `${c.text}${text}`;
  const hues = ["§c", "§6", "§e", "§a", "§9", "§5", "§d"];
  return [...text].map((ch, i) => (ch === " " ? ch : hues[i % hues.length] + ch)).join("") + "§r";
}

export const BLADE_BONUS = 7; // extra damage a blade does to monsters (a blade hit is like a diamond sword)
export const CRYSTAL_REGROW = 200; // ticks before a crystal in the cave can be picked again

// ------------------------------------------------------------ Star Powers

export const POWERS = {
  push: { name: "Star Push", cooldown: 40, range: 10, minDot: 0.5, damage: 3, strength: 2.6, up: 0.5, how: "look ahead and tap" },
  pull: { name: "Star Pull", cooldown: 40, range: 16, minDot: 0.5, damage: 0, strength: 1.6, up: 0.35, how: "sneak and tap" },
  lift: { name: "Star Lift", cooldown: 80, range: 12, minDot: 0.6, damage: 0, ticks: 50, how: "look up and tap" },
  leap: { name: "Star Leap", cooldown: 30, forward: 1.4, up: 1.15, how: "look down and tap" },
};

/** Which power a tap uses: sneak = pull, look up = lift, look down = leap, otherwise push. */
export function pickPower(pitch, sneaking) {
  if (sneaking) return "pull";
  if (pitch < -35) return "lift";
  if (pitch > 50) return "leap";
  return "push";
}

export function lookVector(yaw, pitch) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
}

/** Is `target` in front of `from` (within `range`, inside the cone around `dir`)? */
export function inCone(from, dir, target, range, minDot) {
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (len > range) return false;
  if (len < 1.5) return true; // right next to you always counts
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return (d.x * dir.x + d.y * dir.y + d.z * dir.z) / (len * dl) >= minDot;
}

/** Push (positive strength) away from `from`, or pull (negative) toward it. */
export function shove(from, target, strength, up) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: (dx / len) * strength, z: (dz / len) * strength, up };
}

/** A pull stops short of you: weaker when the monster is already close. */
export function pullStrength(distance, strength) {
  return -Math.min(strength, Math.max(0, (distance - 2) * 0.22));
}

export function newKnight() {
  return { ready: {}, duel: false };
}

/** Ticks until a power can be used again (0 = ready). */
export function cooldownLeft(knight, power, tick) {
  return Math.max(0, (knight.ready[power] ?? 0) - tick);
}

export function usePower(knight, power, tick) {
  if (cooldownLeft(knight, power, tick) > 0) return false;
  knight.ready[power] = tick + POWERS[power].cooldown;
  return true;
}

// ------------------------------------------------------------ bouncing blaster bolts back

export const DEFLECT_RANGE = 2.6;

/**
 * Should a knight holding a blade bounce this bolt back? It has to be close, coming
 * toward them, and in front of them (where they're looking, roughly).
 */
export function shouldDeflect(eye, view, boltPos, boltVel) {
  const to = { x: eye.x - boltPos.x, y: eye.y - boltPos.y, z: eye.z - boltPos.z };
  const dist = Math.hypot(to.x, to.y, to.z);
  if (dist > DEFLECT_RANGE) return false;
  const speed = Math.hypot(boltVel.x, boltVel.y, boltVel.z);
  if (speed < 0.05) return false;
  const coming = (to.x * boltVel.x + to.y * boltVel.y + to.z * boltVel.z) / ((dist || 1) * speed);
  if (coming < 0.2) return false;
  const facing = -(to.x * view.x + to.y * view.y + to.z * view.z) / (dist || 1);
  return dist < 0.8 || facing > 0.1;
}

/** The velocity that sends a bolt back to `target` at `speed`. */
export function aimAt(from, target, speed) {
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: (d.x / len) * speed, y: (d.y / len) * speed, z: (d.z / len) * speed };
}

// ------------------------------------------------------------ Duel Mode

export const DUEL_TO = 5;
export const DUEL_GAP = 10; // ticks: one hit counts once, however many taps arrive

export function newDuel() {
  return { scores: {}, last: {} };
}

/**
 * A duel hit. Both players must have Duel Mode on. Returns { counted, scores, winner }.
 * The winner's duel starts over at 0-0.
 */
export function duelHit(duel, attacker, defender, tick) {
  const key = `${attacker}>${defender}`;
  if (tick - (duel.last[key] ?? -100) < DUEL_GAP) return { counted: false, scores: { ...duel.scores } };
  duel.last[key] = tick;
  duel.scores[attacker] = (duel.scores[attacker] ?? 0) + 1;
  duel.scores[defender] = duel.scores[defender] ?? 0;
  const scores = { ...duel.scores };
  if (duel.scores[attacker] >= DUEL_TO) {
    duel.scores[attacker] = 0;
    duel.scores[defender] = 0;
    return { counted: true, scores, winner: attacker };
  }
  return { counted: true, scores };
}

export function duelText(scores, a, b) {
  return `§6⚔ Duel§r  ${a} §e${scores[a] ?? 0}§r - §e${scores[b] ?? 0}§r ${b}  §7(first to ${DUEL_TO})`;
}

// ------------------------------------------------------------ training waves

export const WAVES = [
  { troopers: 3, captains: 0 },
  { troopers: 5, captains: 0 },
  { troopers: 5, captains: 1 },
];

export function waveText(i) {
  const w = WAVES[i];
  const parts = [`${w.troopers} Clank Troopers`];
  if (w.captains) parts.push(`${w.captains} Clank Captain`);
  return `§eWave ${i + 1} of ${WAVES.length}:§r ${parts.join(" and ")}!`;
}

/** Spread the robots of a wave over the spawn pads (round-robin). */
export function waveSpawns(i, pads) {
  const w = WAVES[i];
  const out = [];
  for (let n = 0; n < w.captains; n++) out.push({ kind: "captain", pad: pads[n % pads.length] });
  for (let n = 0; n < w.troopers; n++) out.push({ kind: "trooper", pad: pads[(n + w.captains) % pads.length] });
  return out;
}

// ------------------------------------------------------------ the Droid Buddy

export const DROID_COLORS = [
  { name: "White", hex: "#eef1f5" },
  { name: "Blue", hex: "#3d7bff" },
  { name: "Red", hex: "#ff4040" },
  { name: "Green", hex: "#38d45a" },
  { name: "Orange", hex: "#ff8a1a" },
  { name: "Purple", hex: "#9b4dff" },
  { name: "Yellow", hex: "#ffd23d" },
  { name: "Black", hex: "#30343c" },
];
export const DROID_NAMES = ["Bleep", "Bloop", "Zip", "Beep-Beep", "Sprocket", "Widget", "Pixel", "Bolt"];
export const DROID_ZAP = { range: 10, damage: 4, every: 40 };

/** The nearest monster in range, or undefined. foes: [{ id, pos }]. */
export function nearest(from, foes, range) {
  let best;
  let bestD = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.pos.x - from.x, f.pos.y - from.y, f.pos.z - from.z);
    if (d <= range && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

// ------------------------------------------------------------ the Star Dart

export const FIGHTER = { speed: 0.8, laserRange: 40, laserDamage: 6, laserEvery: 8 };

/** Velocity for the Star Dart this tick: look where to go, push forward, hold jump to climb. */
export function steer(speed, vel, input, env) {
  if (!input) return { x: vel.x * 0.7, y: env.onGround ? 0 : Math.max(vel.y - 0.03, -0.35), z: vel.z * 0.7 };
  const look = lookVector(input.yaw, input.pitch);
  const f = Math.max(-0.5, Math.min(1, input.forward));
  const target = { x: look.x * f * speed, y: look.y * f * speed, z: look.z * f * speed };
  if (input.jump) target.y = Math.max(target.y, speed * 0.7);
  const k = 0.2;
  const out = { x: vel.x + (target.x - vel.x) * k, y: vel.y + (target.y - vel.y) * k, z: vel.z + (target.z - vel.z) * k };
  if (env.onGround && out.y < 0) out.y = 0;
  return out;
}

/** How far a point is from the line segment a-b. */
export function distToSegment(p, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / len2));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t), p.z - (a.z + ab.z * t));
}
