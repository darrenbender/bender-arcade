// Tiny Titans rules: the three suits and how big or small they make you, which size a tap
// picks, grabbing and throwing, stomps, tiny punches, the Firefly sting, Size Discs, ants,
// and the Micro Realm. No Minecraft imports, so all of this can be tested outside the game.

export const DEG = Math.PI / 180;

/**
 * The suits. tiny and giant are how much smaller or bigger you get (1 = normal).
 * Each size is a component group in the player file: bender:size_<name>.
 */
export const SUITS = [
  {
    key: "pocket", name: "Pocket Suit", color: "§9", hex: "#2f6bd8", trim: "#ff8a1a",
    tiny: 0.25, giant: 2.5, perk: "Tiny punch: hits like a giant",
    stomp: { radius: 5, damage: 6 }, throwStrength: 3, about: "Shrink and grow",
  },
  {
    key: "firefly", name: "Firefly Suit", color: "§a", hex: "#2fbf6a", trim: "#b44dff",
    tiny: 0.2, giant: 1.6, perk: "Flies when tiny; punches zap with a sting", flies: true,
    stomp: { radius: 3, damage: 4 }, throwStrength: 2, about: "Wings for tiny flying",
  },
  {
    key: "mega", name: "Mega Suit", color: "§c", hex: "#d8343a", trim: "#ffd23d",
    tiny: 0.5, giant: 4.0, perk: "The biggest giant: huge stomps and throws",
    stomp: { radius: 8, damage: 10 }, throwStrength: 4.5, about: "Grow the biggest",
  },
];
export const PIECES = ["helmet", "chestplate", "leggings", "boots"];
export const pieceId = (s, p) => `bender:${s.key}_${p}`;

/** All the sizes a player can be, as group names (bender:size_<name>) and scales. */
export const PLAYER_SIZES = Object.fromEntries([
  ["normal", 1],
  ...SUITS.flatMap((s) => [[`tiny_${s.key}`, s.tiny], [`giant_${s.key}`, s.giant]]),
]);

/** The suit a player has all 4 pieces of, or undefined. worn: the 4 item ids, head to feet. */
export function fullSuit(worn) {
  return SUITS.find((s) => PIECES.every((p, i) => worn[i] === pieceId(s, p)));
}

/** The size group for a suit and a size ("normal", "tiny" or "giant"). */
export function sizeGroup(suit, size) {
  return size === "normal" || !suit ? "normal" : `${size}_${suit.key}`;
}

export function scaleOf(suit, size) {
  return PLAYER_SIZES[sizeGroup(suit, size)];
}

/**
 * What a tap on the Size Switch does. Look ahead: tiny <-> normal. Look up: giant (or back
 * to normal from giant). Look down when tiny: dive into the Micro Realm. In the realm: go home.
 */
export function switchAction(size, pitch, inRealm) {
  if (inRealm) return "home";
  if (pitch < -45) return size === "giant" ? "normal" : "giant";
  if (pitch > 55) return size === "tiny" ? "realm" : "need_tiny";
  return size === "normal" ? "tiny" : "normal";
}

// ------------------------------------------------------------ giant moves

/** Throw a grabbed monster where you look: up and away, harder for bigger suits. */
export function throwVector(yaw, pitch, strength) {
  const y = yaw * DEG;
  const up = Math.max(0.6, Math.min(1.6, 0.8 - Math.sin(pitch * DEG)));
  return { x: -Math.sin(y) * strength, z: Math.cos(y) * strength, up };
}

/** A giant landed from a jump: did it fall far enough to stomp? */
export function isStomp(fallSpeed) {
  return fallSpeed <= -0.45;
}

/** Stomp damage fades with distance. */
export function stompDamage(stomp, distance) {
  if (distance > stomp.radius) return 0;
  return Math.max(1, Math.round(stomp.damage * (1 - (distance / stomp.radius) * 0.6)));
}

export const THROW_DAMAGE = 6;
export const TINY_PUNCH = 5; // extra damage from a tiny punch (Pocket and Mega suits)
export const STING = { damage: 6, chain: 2, range: 6 }; // Firefly: the hit monster plus up to 2 more

/** The Firefly sting: the nearest other monsters within range, up to `chain` of them. */
export function stingTargets(from, foes, chain = STING.chain, range = STING.range) {
  return foes
    .map((f) => ({ f, d: Math.hypot(f.pos.x - from.x, f.pos.y - from.y, f.pos.z - from.z) }))
    .filter((x) => x.d <= range)
    .sort((a, b) => a.d - b.d)
    .slice(0, chain)
    .map((x) => x.f);
}

// ------------------------------------------------------------ Firefly wings

/** Firefly wings (tiny only): hold jump to fly up, push forward to zoom, sneak to dive. */
export const WINGS = { lift: 2, boost: 0.55, boostEvery: 8 };

/**
 * One wing tick. w = { flying, lastBoost }; input = { onGround, inWater, jump, sneak, forward, tick }.
 * Returns what to do: levitate (effect level), glide (slow falling), boost (a push), dive.
 */
export function wingStep(w, input) {
  const out = { levitate: 0, glide: false, boost: 0, dive: false };
  if (input.onGround || input.inWater) {
    w.flying = false;
    return out;
  }
  if (input.sneak) {
    out.dive = true;
    return out;
  }
  if (input.jump) {
    w.flying = true;
    out.levitate = WINGS.lift;
  } else if (w.flying) {
    out.glide = true;
  }
  if (w.flying && input.forward > 0.3 && input.tick - (w.lastBoost ?? -100) >= WINGS.boostEvery) {
    out.boost = WINGS.boost;
    w.lastBoost = input.tick;
  }
  return out;
}

// ------------------------------------------------------------ Size Discs

/** Mobs Size Discs work on (their files carry the size groups). */
export const DISC_MOBS = ["zombie", "skeleton", "creeper", "spider", "pig", "cow", "sheep", "chicken"].map((m) => `minecraft:${m}`);
export const MOB_SCALES = { tiny: 0.35, normal: 1, giant: 2.5 };
export const ORDER = ["tiny", "normal", "giant"];

/** A shrink disc makes something one size smaller; a grow disc one size bigger. */
export function discStep(size, disc) {
  const i = ORDER.indexOf(size);
  const j = Math.max(0, Math.min(ORDER.length - 1, (i < 0 ? 1 : i) + (disc === "grow" ? 1 : -1)));
  return ORDER[j];
}

// ------------------------------------------------------------ ants

export const ANTS = {
  "bender:worker_ant": { name: "Worker Ant", speed: 0.36, flies: false },
  "bender:flying_ant": { name: "Flying Ant", speed: 0.6, flies: true },
};
export const COLONY = { workers: 2, flyers: 1, cooldown: 20 * 60, maxAnts: 6 };

/** Can a rider fit on an ant? Tiny riders always; anyone on a giant ant. */
export function canRide(riderSize, antSize) {
  return riderSize === "tiny" || antSize === "giant";
}

/** Velocity for a flying ant this tick (look where to go, push forward, hold jump to climb). */
export function steer(speed, vel, input, env) {
  if (!input) return { x: vel.x * 0.7, y: env.onGround ? 0 : Math.max(vel.y - 0.03, -0.3), z: vel.z * 0.7 };
  const y = input.yaw * DEG;
  const p = input.pitch * DEG;
  const look = { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
  const f = Math.max(-0.5, Math.min(1, input.forward));
  const target = { x: look.x * f * speed, y: look.y * f * speed, z: look.z * f * speed };
  if (input.jump) target.y = Math.max(target.y, speed * 0.7);
  const k = 0.22;
  const out = { x: vel.x + (target.x - vel.x) * k, y: vel.y + (target.y - vel.y) * k, z: vel.z + (target.z - vel.z) * k };
  if (env.onGround && out.y < 0) out.y = 0;
  return out;
}

// ------------------------------------------------------------ the Micro Realm

/** Where the Micro Realm is: far away and up in the sky, the same place in every world. */
export const REALM = { x: 30000, y: 200, z: 30000, size: 96 };
export const REALM_CRYSTAL_REGROW = 200;

export function inRealm(pos) {
  const h = REALM.size / 2;
  return Math.abs(pos.x - REALM.x) <= h + 16 && Math.abs(pos.z - REALM.z) <= h + 16 && pos.y > REALM.y - 60 && pos.y < REALM.y + 80;
}
