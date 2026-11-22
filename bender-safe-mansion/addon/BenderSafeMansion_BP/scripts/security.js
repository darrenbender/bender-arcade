// Safe Mansion security rules: where the lasers and the yard are, which monster a turret
// aims at, where traps fling monsters, the alarm, camera views, and how the vehicles move.
// No Minecraft imports, so all of this can be tested outside the game.

import { SIZE, planMansion } from "./mansion.js";

export const PLAN = planMansion();
export const TURRET_RANGE = 20;
export const TURRET_DAMAGE = 5;
export const TURRET_EVERY = 20; // ticks between shots
export const LASER_DAMAGE = 4;
export const ZAP_DAMAGE = 6; // drone and helicopter laser
export const ZAP_RANGE = 32;
export const ALARM_TICKS = 200; // the alarm keeps going 10 seconds after the last monster
export const ANNOUNCE_EVERY = 400; // the same kind of monster is announced at most every 20 seconds
export const CAMERA_SECONDS = 30;
export const DEG = Math.PI / 180;

/** The vehicles: car on the ground, helicopter and drone in the air. */
export const VEHICLES = {
  "bender:police_car": { name: "Police Car", kit: "bender:police_car_kit", move: "drive", speed: 0.4, jump: 0.6, seats: 2, siren: true },
  "bender:police_helicopter": { name: "Police Helicopter", kit: "bender:police_helicopter_kit", move: "fly", speed: 0.55, seats: 2, siren: true, zap: true },
  "bender:security_drone": { name: "Security Drone", kit: "bender:security_drone_kit", move: "fly", speed: 0.65, seats: 1, zap: true },
};
export const KIT_TO_VEHICLE = Object.fromEntries(Object.entries(VEHICLES).map(([id, v]) => [v.kit, id]));

// ------------------------------------------------------------ where things are

/** A spot relative to a mansion's north-west corner (x0, z0) and ground level (floorY). */
export function toLocal(site, pos) {
  return { x: pos.x - site.x0, y: pos.y - site.floorY, z: pos.z - site.z0 };
}

export function toWorld(site, p) {
  return { x: site.x0 + p.x, y: site.floorY + p.y, z: site.z0 + p.z };
}

export function inGrounds(l) {
  return l.x >= 0 && l.x < SIZE && l.z >= 0 && l.z < SIZE && l.y >= -3 && l.y < 30;
}

export function inYard(l) {
  const y = PLAN.yard;
  return l.x >= y.x1 && l.x < y.x2 + 1 && l.z >= y.z1 && l.z < y.z2 + 1 && l.y >= -3 && l.y < 30;
}

export function inHouse(l) {
  const h = PLAN.house;
  return l.x >= h.x1 && l.x < h.x2 + 1 && l.z >= h.z1 && l.z < h.z2 + 1 && l.y >= 0 && l.y < h.roof + 1;
}

/** The motion sensors on the mansion wall (they blink red while the alarm is on). */
export function sensorSpots() {
  const last = SIZE - 1;
  const spots = [];
  for (let a = 0; a <= last; a += 10) {
    spots.push({ x: a, y: 3, z: 0 }, { x: a, y: 3, z: last });
    if (a > 0 && a < last) spots.push({ x: 0, y: 3, z: a }, { x: last, y: 3, z: a });
  }
  return spots;
}

// ------------------------------------------------------------ laser beams between laser posts

export const LASER_REACH = 8; // a laser post finds a partner up to 8 blocks away

/** How far p is from the beam between a and b. */
export function distToSegment(p, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / len2));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t), p.z - (a.z + ab.z * t));
}

/** Which way a laser pushes a monster: straight out from the beam, back the way it came. */
export function beamPush(p, a, b) {
  const along = { x: b.x - a.x, z: b.z - a.z };
  const len = Math.hypot(along.x, along.z) || 1;
  let side = { x: -along.z / len, z: along.x / len };
  if ((p.x - a.x) * side.x + (p.z - a.z) * side.z < 0) side = { x: -side.x, z: -side.z };
  return side;
}

// ------------------------------------------------------------ turrets and traps

/** The nearest monster a turret can reach. foes: [{ id, pos }]. */
export function turretTarget(turret, foes, range = TURRET_RANGE) {
  let best;
  let bestD = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.pos.x - turret.x, f.pos.y - turret.y, f.pos.z - turret.z);
    if (d <= range && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

/** Yaw (degrees) for something at `from` to face `to` (yaw 0 = south/+z, 90 = west/-x). */
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), to.z - from.z) / DEG;
}

/**
 * A trap flings a monster away from the house (or, for a trap that isn't in a mansion,
 * away from `from`, e.g. the nearest player), up into the air.
 */
export function launch(padLocal, from) {
  const h = PLAN.house;
  const cx = from ? from.x : (h.x1 + h.x2) / 2;
  const cz = from ? from.z : (h.z1 + h.z2) / 2;
  let dx = padLocal.x - cx;
  let dz = padLocal.z - cz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  return { x: dx * 2.6, z: dz * 2.6, up: 1.2 };
}

// ------------------------------------------------------------ the alarm

export function newAlarm() {
  return { until: 0, told: {} };
}

/**
 * Something set the alarm off. Returns the message to tell the family, or undefined if they
 * were told very recently.
 */
export function tripAlarm(alarm, what, where, tick) {
  alarm.until = tick + ALARM_TICKS;
  const last = alarm.told[what];
  if (last !== undefined && tick - last < ANNOUNCE_EVERY) return undefined;
  alarm.told[what] = tick;
  return `§c⚠ Intruder alert!§r ${withArticle(what)} ${where}`;
}

/** "a zombie", "an enderman". */
export function withArticle(what) {
  const w = String(what);
  return `${/^[aeiou]/i.test(w) ? "An" : "A"} ${w}`;
}

/** A monster's name for messages: its name tag, or its kind ("zombie villager"). */
export function niceName(typeId, nameTag) {
  if (nameTag) return nameTag;
  return String(typeId).replace(/^[^:]*:/, "").replace(/_v\d+$/, "").replace(/_/g, " ");
}

export function alarmOn(alarm, tick) {
  return tick < alarm.until;
}

/** The wee-woo: which pitch to play this beat (every 8 ticks), or 0 for no sound. */
export function sirenPitch(tick) {
  if (tick % 8 !== 0) return 0;
  return (tick / 8) % 2 === 0 ? 1.4 : 1.0;
}

// ------------------------------------------------------------ cameras

/** Where a camera a player put up looks: 10 blocks out the way it faces, a little down. */
export function lookFor(cam) {
  const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[cam.dir] ?? [0, 1];
  return { x: cam.x + 0.5 + out[0] * 10, y: cam.y - 2, z: cam.z + 0.5 + out[1] * 10 };
}

/** Where the camera view sits (just in front of the camera) and where it looks. */
export function cameraView(site, cam) {
  const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[cam.dir];
  return {
    location: toWorld(site, { x: cam.x + 0.5 + out[0] * 0.6, y: cam.y + 0.4, z: cam.z + 0.5 + out[1] * 0.6 }),
    facingLocation: toWorld(site, cam.look),
  };
}

// ------------------------------------------------------------ monster radar (drone and helicopter)

/** Where something is from a pilot looking along `yaw`: ahead, behind, left or right. */
export function directionWord(yaw, dx, dz) {
  const y = yaw * DEG;
  const ahead = -Math.sin(y) * dx + Math.cos(y) * dz;
  const right = -Math.cos(y) * dx - Math.sin(y) * dz;
  if (Math.abs(ahead) >= Math.abs(right)) return ahead >= 0 ? "ahead" : "behind you";
  return right >= 0 ? "to your right" : "to your left";
}

/** The radar line: how many monsters are close, and where the nearest one is. */
export function radarText(from, yaw, foes) {
  if (!foes.length) return "§a📡 No monsters nearby";
  let best = foes[0];
  for (const f of foes) if (Math.hypot(f.x - from.x, f.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z)) best = f;
  const d = Math.round(Math.hypot(best.x - from.x, best.z - from.z));
  const below = from.y - best.y > 4 ? " (below)" : "";
  return `§c📡 ${foes.length} monster${foes.length === 1 ? "" : "s"}§r: nearest ${d} blocks ${directionWord(yaw, best.x - from.x, best.z - from.z)}${below}`;
}

// ------------------------------------------------------------ flying the helicopter and drone

export function lookVector(yaw, pitch) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
}

/** Velocity for a flying vehicle this tick: look where to go, push forward, hold jump to climb. */
export function steer(speed, vel, input, env) {
  if (!input) return { x: vel.x * 0.7, y: env.onGround ? 0 : Math.max(vel.y - 0.03, -0.35), z: vel.z * 0.7 };
  const look = lookVector(input.yaw, input.pitch);
  const f = Math.max(-0.5, Math.min(1, input.forward));
  const target = { x: look.x * f * speed, y: look.y * f * speed, z: look.z * f * speed };
  if (input.jump) target.y = Math.max(target.y, speed * 0.7);
  const k = 0.22;
  const out = { x: vel.x + (target.x - vel.x) * k, y: vel.y + (target.y - vel.y) * k, z: vel.z + (target.z - vel.z) * k };
  if (env.onGround && out.y < 0) out.y = 0;
  return out;
}

// ------------------------------------------------------------ the secret door and the vault

export const SECRET_OPEN_TICKS = 100; // the bookshelf stays open 5 seconds (longer while someone is in it)

export const VAULT_LOOT = [
  { id: "minecraft:diamond", amount: 5 },
  { id: "minecraft:gold_ingot", amount: 12 },
  { id: "minecraft:emerald", amount: 8 },
  { id: "minecraft:golden_apple", amount: 2 },
  { id: "minecraft:cookie", amount: 16 },
];
