// Bender Elements rules: the ten elements, their 40 powers, energy and
// ultimate charge, armor set bonuses and the guardians. No Minecraft imports,
// so everything here can be tested outside the game.
//
// Each staff has 4 powers: 3 abilities and an ultimate. Tap to use the chosen
// power; sneak + tap to switch to the next one. Abilities cost energy, which
// refills by itself. The ultimate needs a full ultimate charge, which fills
// slowly over time and quickly when your powers hit monsters.
//
// Power "kinds" (what main.js does with them):
//   bolt    a flying blast that hits the first target (splash = hits around it)
//   burst   a ring around you
//   wave    a cone in front of you
//   beam    an instant ray
//   dash    throws you forward;      leap: up and forward
//   blink   jump a few blocks ahead in a flash
//   wall    a short-lived wall of blocks in front of you
//   heal    heals you and friends nearby;  shield: protects you for a while
//   aura    keeps working around you for a while
//   vortex  a whirl at the spot you look at that pulls monsters in
//   rain    strikes falling around the spot you look at
//   strikes strikes that pick out monsters near you
//   sweep   a wall of power that rolls forward

export const MAX_ENERGY = 100;
export const ENERGY_PER_SECOND = 5;
export const ULT_PER_SECOND = 1;
export const ULT_PER_DAMAGE = 1.5;
export const ULT_FULL = 100;
export const GUARDIAN_POWER = 0.4; // guardians' powers hurt players less than yours hurt them
export const PIECES = ["helmet", "chestplate", "leggings", "boots"];

const fx = (id, seconds, amp = 0) => ({ id, ticks: Math.round(seconds * 20), amp });

/** @type {any[]} */
export const ELEMENTS = [
  {
    key: "fire", name: "Fire", color: "§c", rgb: [1, 0.42, 0.08], material: "minecraft:blaze_powder",
    bonus: { name: "fire resistance and strength", effects: [fx("fire_resistance", 12), fx("strength", 12)] },
    powers: [
      { name: "Fireball", kind: "bolt", cost: 10, cooldown: 10, damage: 6, speed: 1.2, splash: 1.5, fire: 4 },
      { name: "Flame Ring", kind: "burst", cost: 25, cooldown: 40, damage: 5, radius: 5, fire: 5, knock: 0.8 },
      { name: "Fire Jet", kind: "dash", cost: 20, cooldown: 30, power: 2.4, lift: 0.45, damage: 4, fire: 3, self: [fx("fire_resistance", 4), fx("slow_falling", 3)] },
      { name: "Meteor Storm", kind: "rain", ult: true, count: 12, over: 60, damage: 8, radius: 3, fire: 5, from: "sky" },
    ],
  },
  {
    key: "water", name: "Water", color: "§9", rgb: [0.2, 0.55, 1], material: "minecraft:prismarine_shard",
    bonus: { name: "water breathing and healing", effects: [fx("water_breathing", 12), fx("regeneration", 12)] },
    powers: [
      { name: "Water Whip", kind: "bolt", cost: 10, cooldown: 10, damage: 5, speed: 1.4, knock: 1.6, self: [{ id: "extinguish" }] },
      { name: "Healing Waters", kind: "heal", cost: 30, cooldown: 100, radius: 6, heal: 6, effects: [fx("regeneration", 5)] },
      { name: "Tidal Wave", kind: "wave", cost: 25, cooldown: 50, damage: 4, range: 8, angle: 35, knock: 2.2 },
      { name: "Tsunami", kind: "sweep", ult: true, damage: 8, range: 20, width: 7, over: 40, knock: 2.5, self: [fx("water_breathing", 60)] },
    ],
  },
  {
    key: "earth", name: "Earth", color: "§6", rgb: [0.55, 0.38, 0.2], material: "minecraft:cobblestone",
    bonus: { name: "toughness and fast digging", effects: [fx("resistance", 12), fx("haste", 12)] },
    powers: [
      { name: "Rock Throw", kind: "bolt", cost: 12, cooldown: 14, damage: 8, speed: 1.0, knock: 0.6 },
      { name: "Stone Wall", kind: "wall", cost: 25, cooldown: 60, block: "minecraft:cobblestone", width: 5, height: 3, distance: 3, seconds: 10 },
      { name: "Earthquake", kind: "burst", cost: 25, cooldown: 50, damage: 5, radius: 6, lift: 0.9, effects: [fx("slowness", 3, 1)] },
      { name: "Rock Fissure", kind: "sweep", ult: true, damage: 10, range: 18, width: 3, over: 30, lift: 1.2, block: "minecraft:dripstone_block" },
    ],
  },
  {
    key: "air", name: "Air", color: "§f", rgb: [0.92, 0.95, 1], material: "minecraft:feather",
    bonus: { name: "super jumps and soft landings", effects: [fx("jump_boost", 12, 1), fx("slow_falling", 12)] },
    powers: [
      { name: "Air Blast", kind: "bolt", cost: 8, cooldown: 8, damage: 3, speed: 1.6, knock: 3 },
      { name: "Air Leap", kind: "leap", cost: 15, cooldown: 20, power: 1.2, lift: 1.4, self: [fx("slow_falling", 6)] },
      { name: "Wind Shield", kind: "aura", cost: 25, cooldown: 120, seconds: 6, radius: 4, knock: 1.4, damage: 0, self: [fx("resistance", 6)] },
      { name: "Tornado", kind: "vortex", ult: true, seconds: 6, radius: 8, damage: 2, lift: 2 },
    ],
  },
  {
    key: "lightning", name: "Lightning", color: "§e", rgb: [1, 0.95, 0.3], material: "minecraft:copper_ingot",
    bonus: { name: "super speed", effects: [fx("speed", 12, 1)] },
    powers: [
      { name: "Spark Bolt", kind: "bolt", cost: 10, cooldown: 10, damage: 6, speed: 2.4, chain: 2, chainDamage: 4 },
      { name: "Static Dash", kind: "dash", cost: 18, cooldown: 30, power: 2.8, lift: 0.3, damage: 3, self: [fx("speed", 4, 1)] },
      { name: "Thunder Clap", kind: "burst", cost: 25, cooldown: 50, damage: 5, radius: 6, effects: [fx("slowness", 4, 1), fx("weakness", 4)] },
      { name: "Thunderstorm", kind: "strikes", ult: true, count: 8, over: 80, damage: 8, radius: 2.5, reach: 16 },
    ],
  },
  {
    key: "ice", name: "Ice", color: "§b", rgb: [0.6, 0.9, 1], material: "minecraft:packed_ice",
    bonus: { name: "speed and walking on water (it freezes)", effects: [fx("speed", 12)], frostWalk: true },
    powers: [
      { name: "Ice Shard", kind: "bolt", cost: 10, cooldown: 10, damage: 5, speed: 1.5, effects: [fx("slowness", 3, 2)] },
      { name: "Ice Wall", kind: "wall", cost: 25, cooldown: 60, block: "minecraft:packed_ice", width: 5, height: 3, distance: 3, seconds: 10 },
      { name: "Frost Nova", kind: "burst", cost: 25, cooldown: 50, damage: 4, radius: 6, effects: [fx("slowness", 4, 4)] },
      { name: "Blizzard", kind: "aura", ult: true, seconds: 6, radius: 10, damage: 2, effects: [fx("slowness", 2, 2)], self: [fx("speed", 6)] },
    ],
  },
  {
    key: "nature", name: "Nature", color: "§a", rgb: [0.3, 0.85, 0.3], material: "minecraft:oak_sapling",
    bonus: { name: "healing over time", effects: [fx("regeneration", 12)] },
    powers: [
      { name: "Thorn Shot", kind: "bolt", cost: 10, cooldown: 10, damage: 4, speed: 1.4, effects: [fx("poison", 4)] },
      { name: "Healing Bloom", kind: "heal", cost: 30, cooldown: 100, radius: 6, heal: 4, effects: [fx("regeneration", 8, 1)] },
      { name: "Vine Snare", kind: "bolt", cost: 18, cooldown: 30, damage: 2, speed: 1.3, effects: [fx("slowness", 4, 6), fx("weakness", 4)] },
      { name: "Wild Grove", kind: "aura", ult: true, seconds: 8, radius: 10, damage: 1, effects: [fx("slowness", 2, 6), fx("poison", 2)], friends: [fx("regeneration", 3, 1)] },
    ],
  },
  {
    key: "lava", name: "Lava", color: "§6", rgb: [1, 0.3, 0.05], material: "minecraft:magma_cream",
    bonus: { name: "fire resistance and toughness", effects: [fx("fire_resistance", 12), fx("resistance", 12)] },
    powers: [
      { name: "Magma Ball", kind: "bolt", cost: 12, cooldown: 14, damage: 7, speed: 1.0, splash: 2, fire: 5 },
      { name: "Molten Skin", kind: "shield", cost: 25, cooldown: 120, self: [fx("fire_resistance", 10), fx("resistance", 10, 1)] },
      { name: "Eruption", kind: "burst", cost: 25, cooldown: 50, damage: 6, radius: 6, lift: 1.1, fire: 5 },
      { name: "Volcano", kind: "rain", ult: true, count: 14, over: 60, damage: 8, radius: 2.5, fire: 5, from: "center" },
    ],
  },
  {
    key: "light", name: "Light", color: "§e", rgb: [1, 0.97, 0.75], material: "minecraft:glowstone_dust",
    bonus: { name: "night vision and healing", effects: [fx("night_vision", 16), fx("regeneration", 12)] },
    powers: [
      { name: "Light Beam", kind: "beam", cost: 12, cooldown: 14, damage: 7, range: 24, undead: 2 },
      { name: "Radiant Heal", kind: "heal", cost: 30, cooldown: 100, radius: 8, heal: 6, effects: [fx("regeneration", 5)] },
      { name: "Flash", kind: "burst", cost: 20, cooldown: 40, damage: 3, radius: 7, effects: [fx("weakness", 4), fx("slowness", 4, 1)] },
      { name: "Sun Pillars", kind: "strikes", ult: true, count: 8, over: 60, damage: 9, radius: 2, reach: 16, undead: 1.5, heal: 8 },
    ],
  },
  {
    key: "shadow", name: "Shadow", color: "§5", rgb: [0.55, 0.25, 0.8], material: "minecraft:ink_sac",
    bonus: { name: "night vision and speed", effects: [fx("night_vision", 16), fx("speed", 12)] },
    powers: [
      { name: "Shadow Bolt", kind: "bolt", cost: 10, cooldown: 10, damage: 6, speed: 1.5, effects: [fx("wither", 3)] },
      { name: "Shadow Step", kind: "blink", cost: 15, cooldown: 25, distance: 8 },
      { name: "Cloak", kind: "shield", cost: 25, cooldown: 120, self: [fx("invisibility", 8), fx("speed", 8)] },
      { name: "Void Vortex", kind: "vortex", ult: true, seconds: 5, radius: 9, damage: 3, effects: [fx("wither", 2)], finale: 8 },
    ],
  },
];

for (const e of ELEMENTS) {
  e.staff = `bender:${e.key}_staff`;
  e.orb = `bender:${e.key}_orb`;
  e.shard = `bender:${e.key}_shard`;
  e.armor = PIECES.map((p) => `bender:${e.key}_${p}`);
}

export const GUARDIAN_ID = "bender:element_guardian";
export const GUARDIAN = {
  health: 150,
  melee: 4,
  castEvery: 80,
  burstEvery: 140,
  burstReach: 6,
  ultAt: 0.5,
  reach: 48,
  leaveAfter: 20 * 60,
  reward: { shards: 6 },
};

// ------------------------------------------------------------ lookups

export function elementOfItem(typeId) {
  if (typeof typeId !== "string") return -1;
  return ELEMENTS.findIndex((e) => e.staff === typeId || e.orb === typeId || e.shard === typeId || e.armor.includes(typeId));
}

export function staffElement(typeId) {
  return ELEMENTS.findIndex((e) => e.staff === typeId);
}

/** Which element's full armor set is worn (all 4 pieces), or -1. */
export function fullSet(worn) {
  const idx = worn.map((id) => ELEMENTS.findIndex((e) => e.armor.includes(id)));
  if (idx.length !== 4 || idx[0] < 0) return -1;
  return idx.every((i) => i === idx[0]) && new Set(worn).size === 4 ? idx[0] : -1;
}

// ------------------------------------------------------------ energy, charge, cooldowns

export function newCaster() {
  return { energy: MAX_ENERGY, ult: 0, ready: {} };
}

/** One second passes. A full matching armor set refills energy faster. */
export function regen(c, matchingSet = false) {
  c.energy = Math.min(MAX_ENERGY, c.energy + ENERGY_PER_SECOND * (matchingSet ? 1.75 : 1));
  c.ult = Math.min(ULT_FULL, c.ult + ULT_PER_SECOND);
  return c;
}

export function addCharge(c, damage) {
  c.ult = Math.min(ULT_FULL, c.ult + damage * ULT_PER_DAMAGE);
  return c;
}

/**
 * Can this power be used now? Returns { ok, why }.
 * @param {any} c caster state
 * @param {number} element
 * @param {number} slot 0..3
 * @param {number} tick
 */
export function canCast(c, element, slot, tick) {
  const p = ELEMENTS[element]?.powers[slot];
  if (!p) return { ok: false, why: "none" };
  const key = `${element}:${slot}`;
  if (tick < (c.ready[key] ?? 0)) return { ok: false, why: "cooldown", wait: c.ready[key] - tick };
  if (p.ult) return c.ult >= ULT_FULL ? { ok: true } : { ok: false, why: "charging", charge: Math.floor(c.ult) };
  return c.energy >= p.cost ? { ok: true } : { ok: false, why: "energy" };
}

export function spend(c, element, slot, tick) {
  const p = ELEMENTS[element].powers[slot];
  if (p.ult) c.ult = 0;
  else c.energy -= p.cost;
  c.ready[`${element}:${slot}`] = tick + (p.ult ? 40 : p.cooldown);
  return c;
}

export function nextSlot(slot) {
  return (slot + 1) % 4;
}

// ------------------------------------------------------------ shapes

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** Forward direction on the ground for a Minecraft yaw (degrees). */
export function forward(yaw) {
  const r = (yaw * Math.PI) / 180;
  return { x: -Math.sin(r), z: Math.cos(r) };
}

/** Is `point` inside a cone in front of `from` (looking along yaw)? */
export function inCone(from, yaw, point, range, halfAngle) {
  const d = sub(point, from);
  const flat = Math.hypot(d.x, d.z);
  if (flat > range || flat < 0.3) return false;
  const f = forward(yaw);
  const cos = (d.x * f.x + d.z * f.z) / flat;
  return cos >= Math.cos((halfAngle * Math.PI) / 180);
}

/** Is `point` inside a strip starting at `from` along yaw, `along` blocks out, `width` wide? */
export function inStrip(from, yaw, point, along, width) {
  const f = forward(yaw);
  const d = sub(point, from);
  const ahead = d.x * f.x + d.z * f.z;
  const side = Math.abs(d.x * -f.z + d.z * f.x);
  return ahead >= along - 1 && ahead <= along + 1 && side <= width / 2;
}

/** Blocks for a wall: `width` wide, `height` tall, `distance` in front, square to your view. */
export function wallBlocks(origin, yaw, width, height, distance) {
  const f = forward(yaw);
  const snap = Math.abs(f.x) > Math.abs(f.z) ? { x: Math.sign(f.x), z: 0 } : { x: 0, z: Math.sign(f.z) };
  const cx = Math.floor(origin.x) + snap.x * distance;
  const cz = Math.floor(origin.z) + snap.z * distance;
  const out = [];
  const half = Math.floor(width / 2);
  for (let s = -half; s <= half; s++) {
    for (let h = 0; h < height; h++) {
      out.push({ x: cx + (snap.z !== 0 ? s : 0), y: Math.floor(origin.y) + h, z: cz + (snap.x !== 0 ? s : 0) });
    }
  }
  return out;
}

/** A pull toward the middle of a vortex (blocks per tick), stronger near the edge. */
export function pullToward(center, pos, strength = 0.35) {
  const d = sub(center, pos);
  const flat = Math.hypot(d.x, d.z) || 1;
  const k = Math.min(1, flat / 3) * strength;
  // a little sideways too, so things spin round
  return { x: (d.x / flat) * k + (-d.z / flat) * k * 0.6, y: 0.08, z: (d.z / flat) * k + (d.x / flat) * k * 0.6 };
}

/** Where meteors / bombs land (same every time for the same seed). */
export function rainPlan(center, count, over, radius, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    out.push({ at: Math.round((i * over) / count), x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
  }
  return out;
}

// ------------------------------------------------------------ the status line

function bar(fraction, size = 10, on = "§a", off = "§8") {
  const full = Math.max(0, Math.min(size, Math.round(fraction * size)));
  return on + "|".repeat(full) + off + "|".repeat(size - full);
}

export function hud(c, element, slot) {
  const e = ELEMENTS[element];
  const p = e.powers[slot];
  const what = p.ult ? `§6§l${p.name}§r` : `§f${p.name}§7 (${p.cost})`;
  const ult = c.ult >= ULT_FULL ? "§6§lULTIMATE READY!" : `§6Ult ${Math.floor(c.ult)}%`;
  return `${e.color}§l${e.name}§r ${what} §7[${slot + 1}/4]  §bEnergy ${bar(c.energy / MAX_ENERGY)}  ${ult}`;
}

export function whyNot(result, element, slot) {
  const p = ELEMENTS[element].powers[slot];
  if (result.why === "cooldown") return `§7${p.name} is getting ready...`;
  if (result.why === "charging") return `§6${p.name} is charging: ${result.charge}%.§r Hit monsters with your powers to charge it faster!`;
  if (result.why === "energy") return `§eNot enough energy for ${p.name}.§r Wait a moment!`;
  return "";
}

export function staffLore(element) {
  const e = ELEMENTS[element];
  return [
    "§7Tap: use your power. Sneak + tap: switch power",
    ...e.powers.map((p, i) => `${p.ult ? "§6" : "§f"}${i + 1}. ${p.name}${p.ult ? " (ultimate)" : ""}`),
  ];
}
