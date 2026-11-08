// Dragon rules: how the boss dragon flies and attacks, fireballs, and how pet
// dragons fly, grow and get their colors. No Minecraft imports, so all of this
// can be tested outside the game.
//
// Positions are {x, y, z} in blocks; velocities are blocks per tick (20 ticks
// = 1 second). Yaw follows Minecraft: 0 faces south (+z), 90 faces west.

export const BOSS_ID = "bender:ender_dragon";
export const PET_ID = "bender:pet_dragon";
export const CRYSTAL_ID = "bender:dragon_crystal";
export const EGG_ENTITY_ID = "bender:dragon_egg";

export const DIFFICULTIES = [
  { key: "easy", name: "Easy", health: 120, fireball: 2, swoop: 2, breath: 1, fireEvery: 70, perchTicks: 220 },
  { key: "normal", name: "Normal", health: 200, fireball: 4, swoop: 4, breath: 2, fireEvery: 50, perchTicks: 170 },
  { key: "hard", name: "Hard", health: 300, fireball: 6, swoop: 6, breath: 3, fireEvery: 34, perchTicks: 130 },
];

export const BOSS = {
  size: 0.6, // the boss model's scale (Minecraft's own dragon is 1)
  circleRadius: 14,
  circleHeight: 12,
  cruise: 0.42, // blocks per tick while circling (about 8 blocks a second)
  swoopSpeed: 0.62,
  perchSpeed: 0.38,
  turn: 0.12, // how quickly it changes direction (0..1 per tick)
  leaveAfter: 20 * 25, // no players nearby for this long: it flies away
  arenaReach: 48, // players this close to the middle count as in the fight
  hitReach: 3, // a swoop hits players this close to its body
};
// From the dragon's feet to the middle of its body, and to its mouth.
export const BODY_UP = 4.3 * BOSS.size;
const MOUTH_UP = 4.85;
const MOUTH_AHEAD = 7;

export const PET = {
  stages: [
    { name: "Baby", feeds: 3, scale: 0.12 },
    { name: "Young", feeds: 3, scale: 0.19 },
    { name: "Grown-up", feeds: 0, scale: 0.3 },
  ],
  rideSpeed: 0.6,
  climb: 0.42,
  followSpeed: 0.55,
  followBehind: 3,
  followAbove: 2.5,
  teleportFrom: 28,
  hatchTicks: 20 * 20,
};

export const PET_FOODS = new Set([
  "minecraft:beef", "minecraft:cooked_beef", "minecraft:porkchop", "minecraft:cooked_porkchop",
  "minecraft:chicken", "minecraft:cooked_chicken", "minecraft:mutton", "minecraft:cooked_mutton",
  "minecraft:rabbit", "minecraft:cooked_rabbit", "minecraft:cod", "minecraft:cooked_cod",
  "minecraft:salmon", "minecraft:cooked_salmon", "minecraft:rotten_flesh",
]);

/** Pet colors: a tint laid over the dragon (r, g, b, strength). */
export const COLORS = [
  { name: "Ender black", tint: [0, 0, 0, 0] },
  { name: "Fire red", tint: [1, 0.18, 0.08, 0.45] },
  { name: "Ice blue", tint: [0.25, 0.65, 1, 0.45] },
  { name: "Emerald green", tint: [0.15, 0.9, 0.3, 0.42] },
  { name: "Royal gold", tint: [1, 0.8, 0.15, 0.48] },
  { name: "Galaxy purple", tint: [0.7, 0.25, 1, 0.45] },
];

export const PET_NAMES = ["Shadow", "Ember", "Comet", "Onyx", "Blaze", "Midnight", "Storm", "Nova", "Spike", "Ziggy"];

// ------------------------------------------------------------ small vector helpers

const len = (v) => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });

export function distance(a, b) {
  return len(sub(a, b));
}

/** Minecraft yaw (degrees) for travelling along v. */
export function yawOf(v, fallback = 0) {
  if (Math.hypot(v.x, v.z) < 1e-4) return fallback;
  return (Math.atan2(-v.x, v.z) * 180) / Math.PI;
}

/** Steer from velocity v toward point `to` at `speed`, turning gently (and slowing to arrive, unless told not to). */
export function steer(pos, v, to, speed, turn, arrive = true) {
  const d = sub(to, pos);
  const dist = len(d);
  const s = arrive ? Math.min(speed, dist * 0.25 + 0.02) : speed;
  const want = dist < 1e-6 ? { x: 0, y: 0, z: 0 } : scale(d, s / dist);
  return add(v, scale(sub(want, v), turn));
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------ the boss

/**
 * A fresh boss fight. `center` is where the dragon lands (the altar base);
 * it circles above it.
 */
export function newFight(center, difficulty, seed = 1) {
  return {
    center: { ...center },
    difficulty,
    phase: "arrive",
    t: 0,
    angle: 0,
    dir: 1,
    cycle: 0,
    target: undefined,
    hits: [],
    lonely: 0,
    seed,
    roll: seed,
  };
}

function circlePoint(fight, angle, t) {
  const c = fight.center;
  return {
    x: c.x + Math.cos(angle) * BOSS.circleRadius,
    y: c.y + BOSS.circleHeight + Math.sin(t / 25) * 2,
    z: c.z + Math.sin(angle) * BOSS.circleRadius,
  };
}

function pick(fight, list) {
  const r = rng(fight.roll);
  const v = r();
  fight.roll = Math.floor(v * 4294967296) || 7;
  return list[Math.floor(v * list.length)];
}

/**
 * One tick of the boss.
 * @param {any} fight  the fight state (changed in place and returned)
 * @param {{ pos: {x:number,y:number,z:number}, vel: {x:number,y:number,z:number}, yaw: number, health: number, maxHealth: number }} me
 * @param {{ id: string, pos: {x:number,y:number,z:number} }[]} players  players near the arena
 * @returns {{ vel: {x:number,y:number,z:number}, yaw: number, pose: number, events: any[] }}
 */
export function bossStep(fight, me, players) {
  const diff = DIFFICULTIES[fight.difficulty] ?? DIFFICULTIES[1];
  const events = [];
  const c = fight.center;
  const nearby = players.filter((p) => Math.hypot(p.pos.x - c.x, p.pos.z - c.z) <= BOSS.arenaReach);
  fight.t++;
  let vel = me.vel;
  let yaw = me.yaw;
  let pose = 0;
  const go = (phase) => {
    fight.phase = phase;
    fight.t = 0;
  };
  const angry = me.health < me.maxHealth / 2;

  if (fight.phase !== "leave") {
    fight.lonely = nearby.length ? 0 : fight.lonely + 1;
    if (fight.lonely > BOSS.leaveAfter) {
      go("leave");
      events.push({ type: "leaving" });
    }
  }

  switch (fight.phase) {
    case "arrive": {
      if (fight.t === 1) events.push({ type: "roar" });
      // come down from high above to the start of the circle
      fight.angle = Math.atan2(me.pos.z - c.z, me.pos.x - c.x);
      const to = circlePoint(fight, fight.angle, fight.t);
      vel = steer(me.pos, vel, to, BOSS.swoopSpeed, BOSS.turn);
      if (distance(me.pos, to) < 3 || fight.t > 200) go("circle");
      break;
    }
    case "circle": {
      fight.angle += (fight.dir * BOSS.cruise) / BOSS.circleRadius;
      const to = circlePoint(fight, fight.angle + fight.dir * 0.35, fight.t);
      vel = steer(me.pos, vel, to, BOSS.cruise * 1.15, BOSS.turn);
      const every = Math.round(diff.fireEvery * (angry ? 0.75 : 1));
      if (nearby.length && fight.t % every === every - 1) {
        const target = pick(fight, nearby);
        events.push({ type: "fireball", target: target.id, at: { ...target.pos } });
      }
      if (fight.t > 180) {
        fight.cycle++;
        if (!nearby.length) {
          fight.t = 0;
        } else if (fight.cycle % 2 === 0) {
          go("perch");
        } else {
          const target = pick(fight, nearby);
          fight.target = target.id;
          fight.hits = [];
          go("swoop");
          events.push({ type: "roar" });
        }
      }
      break;
    }
    case "swoop": {
      const target = nearby.find((p) => p.id === fight.target);
      if (!target) {
        go("climb");
        break;
      }
      // dive at the target's chest, then keep going straight through and past them
      const toT = sub(target.pos, me.pos);
      const flat = Math.hypot(toT.x, toT.z) || 1;
      if (!fight.swoopDir || flat > 5) fight.swoopDir = { x: toT.x / flat, z: toT.z / flat };
      const dir = fight.swoopDir;
      const aimY = Math.max(c.y - 1.2, target.pos.y + 1 - BODY_UP);
      const through = flat > 5 ? 0 : 10;
      const aim = { x: target.pos.x + dir.x * through, y: aimY, z: target.pos.z + dir.z * through };
      vel = steer(me.pos, vel, aim, BOSS.swoopSpeed, BOSS.turn * 1.8, false);
      // hit anyone it flies through (once each per swoop)
      const body = { x: me.pos.x, y: me.pos.y + BODY_UP, z: me.pos.z };
      for (const p of nearby) {
        if (fight.hits.includes(p.id)) continue;
        if (distance(body, { x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z }) <= BOSS.hitReach) {
          fight.hits.push(p.id);
          events.push({ type: "hit", target: p.id, damage: diff.swoop, from: { ...me.pos } });
        }
      }
      const passed = toT.x * dir.x + toT.z * dir.z < -4;
      if (passed || fight.t > 110) {
        fight.swoopDir = undefined;
        go("climb");
      }
      break;
    }
    case "climb": {
      // pull up and away, back to the circle
      fight.angle = Math.atan2(me.pos.z - c.z, me.pos.x - c.x);
      const to = circlePoint(fight, fight.angle + fight.dir * 0.6, fight.t);
      vel = steer(me.pos, vel, to, BOSS.cruise * 1.3, BOSS.turn);
      if (distance(me.pos, to) < 4 || fight.t > 100) {
        fight.dir = pick(fight, [1, -1]);
        go("circle");
      }
      break;
    }
    case "perch": {
      const spot = c;
      const d = distance(me.pos, spot);
      if (fight.landed === undefined && d > 0.6) {
        // glide in: first above the altar, then straight down onto it
        const over = Math.hypot(me.pos.x - spot.x, me.pos.z - spot.z) > 2;
        const to = over ? { x: spot.x, y: spot.y + 6, z: spot.z } : spot;
        vel = steer(me.pos, vel, to, BOSS.perchSpeed, BOSS.turn * 1.4);
        if (fight.t > 260) fight.landed = fight.t; // give up gliding and land
        break;
      }
      if (fight.landed === undefined) {
        fight.landed = fight.t;
        events.push({ type: "landed" });
        events.push({ type: "roar" });
      }
      vel = { x: 0, y: 0, z: 0 };
      pose = 1;
      // turn slowly to face the nearest player and breathe at them now and then
      const near = nearby.slice().sort((a, b) => distance(a.pos, me.pos) - distance(b.pos, me.pos))[0];
      if (near) {
        const want = yawOf(sub(near.pos, me.pos), yaw);
        let delta = ((want - yaw + 540) % 360) - 180;
        yaw += Math.max(-4, Math.min(4, delta));
        const since = fight.t - fight.landed;
        if (since > 30 && since % 60 === 0) events.push({ type: "breath", damage: diff.breath, yaw });
      }
      if (fight.t - fight.landed > diff.perchTicks) {
        fight.landed = undefined;
        events.push({ type: "takeoff" });
        go("climb");
      }
      return { vel, yaw, pose, events };
    }
    case "leave": {
      vel = steer(me.pos, vel, { x: c.x + 60, y: c.y + 60, z: c.z + 60 }, BOSS.swoopSpeed, BOSS.turn);
      if (fight.t > 90) events.push({ type: "gone" });
      break;
    }
  }
  yaw = yawOf(vel, yaw);
  return { vel, yaw, pose, events };
}

/** Where a dragon's mouth is, for fireballs (size = its scale). */
export function mouthOf(pos, yaw, size = BOSS.size) {
  const r = (yaw * Math.PI) / 180;
  return { x: pos.x - Math.sin(r) * MOUTH_AHEAD * size, y: pos.y + MOUTH_UP * size, z: pos.z + Math.cos(r) * MOUTH_AHEAD * size };
}

// ------------------------------------------------------------ fireballs

export function launchFireball(from, to, speed = 0.75) {
  const d = sub(to, from);
  const dist = len(d) || 1;
  return { pos: { ...from }, vel: scale(d, speed / dist), ttl: Math.ceil(dist / speed) + 6 };
}

export function stepFireball(fb) {
  return { pos: add(fb.pos, fb.vel), vel: fb.vel, ttl: fb.ttl - 1 };
}

/** Is a point inside a breath cone (in front of the dragon, within reach)? */
export function inBreath(dragonPos, yaw, point, reach = 7, halfAngle = 40) {
  const d = sub(point, dragonPos);
  const flat = Math.hypot(d.x, d.z);
  if (flat > reach || flat < 0.5) return false;
  const want = yawOf(d, yaw);
  const delta = Math.abs(((want - yaw + 540) % 360) - 180);
  return delta <= halfAngle;
}

// ------------------------------------------------------------ pets

/** Riding: fly where the rider looks while they push forward; jump to climb. */
export function rideVelocity(move, jump, sneakDown, view, onGround) {
  const f = Math.max(-0.4, Math.min(1, move.y)) * PET.rideSpeed;
  const v = { x: view.x * f, y: view.y * f, z: view.z * f };
  // sideways steps
  const side = Math.max(-1, Math.min(1, move.x)) * PET.rideSpeed * 0.5;
  const flat = Math.hypot(view.x, view.z) || 1;
  v.x += (view.z / flat) * side;
  v.z += (-view.x / flat) * side;
  if (jump) v.y = Math.max(v.y, PET.climb);
  if (sneakDown) v.y = Math.min(v.y, -PET.climb);
  if (onGround && v.y < 0) v.y = 0;
  return v;
}

/** Following: fly to a spot just behind and above the owner. */
export function followVelocity(petPos, petVel, ownerPos, ownerYaw) {
  const r = (ownerYaw * Math.PI) / 180;
  const spot = {
    x: ownerPos.x + Math.sin(r) * PET.followBehind,
    y: ownerPos.y + PET.followAbove,
    z: ownerPos.z - Math.cos(r) * PET.followBehind,
  };
  const d = distance(petPos, spot);
  if (d < 1.2) return scale(petVel, 0.6);
  return steer(petPos, petVel, spot, PET.followSpeed, 0.18);
}

/** Staying: drift gently down until it lands. */
export function settleVelocity(onGround) {
  return onGround ? { x: 0, y: 0, z: 0 } : { x: 0, y: -0.18, z: 0 };
}

/** After a feeding: the new feed count, stage, and whether it grew. */
export function feed(stage, feeds) {
  const s = PET.stages[stage];
  if (!s || stage >= PET.stages.length - 1) return { stage, feeds, grew: false, full: true };
  const n = feeds + 1;
  if (n >= s.feeds) return { stage: stage + 1, feeds: 0, grew: true, full: false };
  return { stage, feeds: n, grew: false, full: false };
}

/** Molang for the color tint channels (used in the client entity script). */
export function tintMolang(channel) {
  let expr = "0.0";
  for (let i = COLORS.length - 1; i >= 1; i--) {
    expr = `q.property('bender:color') == ${i} ? ${COLORS[i].tint[channel]} : (${expr})`;
  }
  return expr;
}
