// Bender Robo Mobs rules: the 13 robots, their special attacks, Battle Mode, and how
// flying and swimming robots steer. No Minecraft imports, so all of this can be
// tested outside the game.
//
// Ride a robot, hold the Robo Remote and tap to use its special attack. Punch
// monsters for a robo punch. In Battle Mode (both pilots switch it on), attacks
// also hit the other robot's armor; a robot with no armor left is knocked out:
// its pilot pops out unhurt and it repairs itself.

export const REMOTE_ID = "bender:robo_remote";
export const KO_TICKS = 200; // a knocked-out robot repairs itself after 10 seconds
export const REGEN_DELAY = 100; // armor starts refilling 5 seconds after the last battle hit
export const REGEN_PER_SECOND = 2;
export const PUNCH_DAMAGE = 6; // extra damage when a pilot punches a monster
export const PUNCH_BATTLE = 5; // armor a punch takes off a robot in battle
export const BOUNCE_FALL = 3; // a Robo Slime landing from this high smashes the ground
export const DEG = Math.PI / 180;

const fx = (id, seconds, amp = 0) => ({ id, ticks: Math.round(seconds * 20), amp });

/** @type {any[]} */
export const ROBOTS = [
  {
    key: "creeper", name: "Robo Creeper", color: "§a", move: "walk", speed: 0.3, jump: 0.8, armor: 50,
    drop: "minecraft:gunpowder", about: "Boom! A shockwave that never breaks blocks",
    attack: { name: "Boom Wave", kind: "wave", radius: 7, damage: 9, knock: 1.8, lift: 0.4, cooldown: 60 },
  },
  {
    key: "skeleton", name: "Robo Skeleton", color: "§f", move: "walk", speed: 0.3, jump: 0.9, armor: 45,
    drop: "minecraft:arrow", about: "Fires a fan of 5 laser arrows",
    attack: { name: "Arrow Storm", kind: "volley", shot: "arrow", count: 5, spread: 7, damage: 4, speed: 2.0, gravity: 0.02, range: 40, cooldown: 30 },
  },
  {
    key: "spider", name: "Robo Spider", color: "§8", move: "walk", climb: true, speed: 0.36, jump: 0.9, armor: 45,
    drop: "minecraft:string", about: "Climbs walls! Web Shot slows monsters down",
    attack: { name: "Web Shot", kind: "volley", shot: "web", count: 1, spread: 0, damage: 4, speed: 1.4, gravity: 0.03, range: 30, blast: 2, effects: [fx("slowness", 5, 3)], cooldown: 30 },
  },
  {
    key: "zombie", name: "Robo Zombie", color: "§2", move: "walk", speed: 0.28, jump: 0.8, armor: 70,
    drop: "minecraft:rotten_flesh", about: "Tough as nails, with a Mega Punch",
    attack: { name: "Mega Punch", kind: "punch", reach: 7, damage: 12, knock: 2.6, cooldown: 20 },
  },
  {
    key: "enderman", name: "Robo Enderman", color: "§5", move: "walk", speed: 0.32, jump: 1.0, armor: 50,
    drop: "minecraft:ender_pearl", about: "Super tall. Warp Dash zooms you forward",
    attack: { name: "Warp Dash", kind: "dash", power: 2.6, up: 0.15, damage: 8, ticks: 12, cooldown: 60 },
  },
  {
    key: "blaze", name: "Robo Blaze", color: "§6", move: "fly", speed: 0.55, armor: 50,
    drop: "minecraft:blaze_rod", about: "Flies! Fire Burst shoots 3 fireballs",
    attack: { name: "Fire Burst", kind: "volley", shot: "fire", count: 3, spread: 5, damage: 5, fire: 4, speed: 1.6, gravity: 0, range: 40, cooldown: 30 },
  },
  {
    key: "ghast", name: "Robo Ghast", color: "§7", move: "fly", speed: 0.38, armor: 70,
    drop: "minecraft:ghast_tear", about: "A flying fortress with a Mega Fireball",
    attack: { name: "Mega Fireball", kind: "volley", shot: "big_fire", count: 1, spread: 0, damage: 12, blast: 4, fire: 5, speed: 1.0, gravity: 0, range: 48, cooldown: 60 },
  },
  {
    key: "golem", name: "Robo Golem", color: "§f", move: "walk", speed: 0.26, jump: 0.7, armor: 90,
    drop: "minecraft:iron_block", about: "The strongest. Ground Slam throws monsters up",
    attack: { name: "Ground Slam", kind: "wave", radius: 8, damage: 10, knock: 1.0, lift: 1.0, cooldown: 60 },
  },
  {
    key: "slime", name: "Robo Slime", color: "§a", move: "walk", bounce: true, speed: 0.3, jump: 1.4, armor: 55,
    drop: "minecraft:slime_ball", about: "Super bouncy! Land from high up to smash",
    attack: { name: "Slime Ball", kind: "volley", shot: "slime", count: 1, spread: 0, damage: 6, blast: 2.5, speed: 1.2, gravity: 0.05, range: 32, effects: [fx("slowness", 4, 2)], cooldown: 20 },
  },
  {
    key: "wither", name: "Robo Wither", color: "§0", move: "fly", speed: 0.48, armor: 80,
    drop: "minecraft:coal_block", about: "Three heads, flies, Skull Volley",
    attack: { name: "Skull Volley", kind: "volley", shot: "skull", count: 3, spread: 9, damage: 7, blast: 2.5, speed: 1.3, gravity: 0, range: 40, effects: [fx("wither", 4)], cooldown: 40 },
  },
  {
    key: "guardian", name: "Robo Guardian", color: "§3", move: "swim", speed: 0.4, swimSpeed: 0.65, armor: 70,
    drop: "minecraft:prismarine_shard", about: "Hovers! Its laser zaps through monsters",
    attack: { name: "Laser", kind: "laser", charge: 16, damage: 16, range: 32, cooldown: 40, pierce: true, width: 1.6 },
    shield: { name: "Spike Shield", radius: 6, damage: 4, every: 40 }, // blocks from the robot's middle
  },
  {
    key: "wolf", name: "Robo Wolf", color: "§7", move: "walk", speed: 0.4, jump: 1.0, armor: 50,
    drop: "minecraft:bone", about: "The fastest runner. Pounce leaps at monsters",
    attack: { name: "Pounce", kind: "dash", power: 1.8, up: 0.5, damage: 9, ticks: 14, cooldown: 40 },
  },
  {
    key: "warden", name: "Robo Warden", color: "§b", move: "walk", speed: 0.27, jump: 0.8, armor: 100,
    drop: "minecraft:echo_shard", about: "The biggest! Its Sonic Boom blasts through walls",
    attack: { name: "Sonic Boom", kind: "laser", style: "sonic", charge: 20, damage: 18, range: 24, cooldown: 80, pierce: true, width: 2 },
    sense: { name: "Monster Sense", radius: 24, every: 40 },
  },
];


// How big each robot is (from the models, in blocks): size = [width, height],
// mouth = how high attacks come out, front = how far in front of the middle.
const BODIES = {
  creeper: { size: [4.92, 8.12], mouth: 6.72, front: 1.41 },
  skeleton: { size: [5.47, 9.84], mouth: 8.75, front: 1.25 },
  spider: { size: [8.28, 4.69], mouth: 2.81, front: 2.19 },
  zombie: { size: [6.09, 10.31], mouth: 7.03, front: 1.41 },
  enderman: { size: [3.59, 10.94], mouth: 9.84, front: 1.41 },
  blaze: { size: [4.53, 8.12], mouth: 7.03, front: 1.56 },
  ghast: { size: [5.31, 7.19], mouth: 4.69, front: 2.5 },
  golem: { size: [7.34, 10.0], mouth: 6.88, front: 1.72 },
  slime: { size: [5.0, 5.16], mouth: 2.5, front: 2.34 },
  wither: { size: [8.12, 10.31], mouth: 9.06, front: 1.56 },
  guardian: { size: [10.59, 6.8], mouth: 3.12, front: 2.81 },
  wolf: { size: [9.45, 4.84], mouth: 3.44, front: 4.69 },
  warden: { size: [7.34, 14.06], mouth: 9.69, front: 1.72 },
};

for (const r of ROBOTS) {
  r.id = `bender:robo_${r.key}`;
  r.body = BODIES[r.key];
  r.kit = `bender:robo_${r.key}_kit`;
}

export const ROBOT_IDS = new Set(ROBOTS.map((r) => r.id));

export function robotIndex(typeId) {
  return ROBOTS.findIndex((r) => r.id === typeId);
}

export function kitIndex(typeId) {
  return ROBOTS.findIndex((r) => r.kit === typeId);
}

// ------------------------------------------------------------ armor and Battle Mode

export function newRobotState(index) {
  return { armor: ROBOTS[index].armor, downUntil: 0, lastHit: -100000 };
}

export function isDown(state, tick) {
  return tick < state.downUntil;
}

/** Battle damage only happens when both pilots switched Battle Mode on. */
export function canBattle(attacker, target) {
  return !!attacker && !!target && attacker.robotId !== target.robotId && attacker.battle === true && target.battle === true;
}

/** A battle hit on a robot. Returns { ko, armor } (ko = it just got knocked out). */
export function battleHit(state, index, damage, tick) {
  if (isDown(state, tick) || !(damage > 0)) return { ko: false, armor: state.armor, ignored: true };
  state.armor = Math.max(0, state.armor - damage);
  state.lastHit = tick;
  if (state.armor > 0) return { ko: false, armor: state.armor };
  state.downUntil = tick + KO_TICKS;
  return { ko: true, armor: 0 };
}

/** Called once a second. Returns "repaired" when a knocked-out robot is back. */
export function robotSecond(state, index, tick) {
  const max = ROBOTS[index].armor;
  if (state.downUntil > 0 && tick >= state.downUntil) {
    state.downUntil = 0;
    state.armor = max;
    return "repaired";
  }
  if (state.downUntil === 0 && tick - state.lastHit >= REGEN_DELAY && state.armor < max) {
    state.armor = Math.min(max, state.armor + REGEN_PER_SECOND);
  }
  return undefined;
}

// ------------------------------------------------------------ special attacks

export function newPilot() {
  return { ready: {}, battle: false, kos: 0 };
}

/** Use the robot's special attack if it has cooled down. */
export function useAttack(pilot, index, tick) {
  const key = ROBOTS[index].key;
  const at = pilot.ready[key] ?? 0;
  if (tick < at) return { ok: false, wait: Math.ceil((at - tick) / 20) };
  pilot.ready[key] = tick + ROBOTS[index].attack.cooldown;
  return { ok: true };
}

export function secondsLeft(pilot, index, tick) {
  const at = pilot.ready[ROBOTS[index].key] ?? 0;
  return tick < at ? Math.ceil((at - tick) / 20) : 0;
}

/** Bedrock look direction from yaw/pitch in degrees (yaw 0 = south/+z, pitch + = down). */
export function lookVector(yaw, pitch) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
}

/** A fan of directions spread left to right around dir (turned about the up axis). */
export function fan(dir, count, spreadDeg) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * spreadDeg * DEG;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push({ x: dir.x * c - dir.z * s, y: dir.y, z: dir.x * s + dir.z * c });
  }
  return out;
}

/** A flying shot: { pos, vel, gravity, traveled, range }. Moves it one tick; true while it's still going. */
export function stepShot(shot) {
  shot.pos = { x: shot.pos.x + shot.vel.x, y: shot.pos.y + shot.vel.y, z: shot.pos.z + shot.vel.z };
  shot.traveled += Math.hypot(shot.vel.x, shot.vel.y, shot.vel.z);
  shot.vel = { x: shot.vel.x, y: shot.vel.y - (shot.gravity ?? 0), z: shot.vel.z };
  return shot.traveled < shot.range;
}

export function newShot(index, from, dir) {
  const a = ROBOTS[index].attack;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return {
    robot: index,
    pos: { ...from },
    vel: { x: (dir.x / len) * a.speed, y: (dir.y / len) * a.speed, z: (dir.z / len) * a.speed },
    gravity: a.gravity ?? 0,
    traveled: 0,
    range: a.range,
  };
}

/** How far a wave hits, weaker at the edge: full damage up close, half at the edge. */
export function waveDamage(index, distance) {
  const a = ROBOTS[index].attack;
  const r = a.radius ?? a.blast ?? 0;
  if (!(distance <= r)) return 0;
  return Math.max(1, Math.round(a.damage * (1 - 0.5 * (distance / r))));
}

/** Robo Slime: did it just land from high enough to smash? */
export function bounceSmash(fallStart, y) {
  return fallStart !== undefined && fallStart - y >= BOUNCE_FALL;
}

// ------------------------------------------------------------ flying and swimming

/**
 * Velocity for a flying (or swimming) robot this tick. Steer by looking; push
 * forward to go, back to slow down and reverse; hold jump to climb.
 * @param {number} speed  top speed in blocks per tick
 * @param {{x:number,y:number,z:number}} vel  current velocity
 * @param {{ forward: number, jump: boolean, yaw: number, pitch: number } | undefined} input  undefined = nobody aboard
 * @param {{ onGround: boolean }} env
 */
export function steer(speed, vel, input, env) {
  if (!input) {
    // Parked: slow down and settle gently to the ground.
    return { x: vel.x * 0.7, y: env.onGround ? 0 : Math.max(vel.y - 0.03, -0.35), z: vel.z * 0.7 };
  }
  const look = lookVector(input.yaw, input.pitch);
  const f = Math.max(-0.5, Math.min(1, input.forward));
  const target = { x: look.x * f * speed, y: look.y * f * speed, z: look.z * f * speed };
  if (input.jump) target.y = Math.max(target.y, speed * 0.7);
  // Ease toward the target so it feels smooth, not twitchy.
  const k = 0.22;
  const out = { x: vel.x + (target.x - vel.x) * k, y: vel.y + (target.y - vel.y) * k, z: vel.z + (target.z - vel.z) * k };
  if (env.onGround && out.y < 0) out.y = 0;
  return out;
}

/** Is a point inside a beam from "from" along unit vector "dir", "range" long and "width" wide? */
export function inBeam(from, dir, p, range, width) {
  const c = { x: p.x - from.x, y: p.y - from.y, z: p.z - from.z };
  const along = c.x * dir.x + c.y * dir.y + c.z * dir.z;
  if (along < 0 || along > range) return false;
  return Math.hypot(c.x - dir.x * along, c.y - dir.y * along, c.z - dir.z * along) <= width;
}

// ------------------------------------------------------------ what the pilot sees

function bar(fraction, size = 10) {
  const full = Math.max(0, Math.min(size, Math.round(fraction * size)));
  const on = fraction > 0.5 ? "§a" : fraction > 0.2 ? "§e" : "§c";
  return on + "|".repeat(full) + "§8" + "|".repeat(size - full);
}

export function hud(index, state, pilot, tick) {
  const r = ROBOTS[index];
  const wait = secondsLeft(pilot, index, tick);
  const attack = wait > 0 ? `§7${r.attack.name}: ${wait}s` : `§b${r.attack.name}: ready`;
  const battle = pilot.battle ? "  §c⚔ Battle ON" : "";
  const sense = r.sense && pilot.sensed !== undefined ? `  §3Senses ${pilot.sensed} monster${pilot.sensed === 1 ? "" : "s"}` : "";
  return `${r.color}§l${r.name}§r  §fArmor ${bar(state.armor / r.armor)}  ${attack}${sense}${battle}`;
}

export function kitLore(index) {
  const r = ROBOTS[index];
  const moves = { walk: "Walks", fly: "Flies: look where to go, hold jump to climb", swim: "Hovers on land, zooms underwater" }[r.move];
  return [`§7${r.about}`, `§7${moves}`, `§bRemote attack: ${r.attack.name}`, "§8Place it, then tap it to ride"];
}
