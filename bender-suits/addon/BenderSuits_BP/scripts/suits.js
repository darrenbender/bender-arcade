// Bender Power Suits rules: the suits, their perks and powers, the gadgets,
// Suit Power (energy) and how flying works. No Minecraft imports, so all of
// this can be tested outside the game.
//
// Wear all 4 pieces of a suit to fly: hold jump to rocket up, push forward to
// boost, let go to glide down gently, sneak to dive. Flying uses Suit Power,
// which refills on the ground. The Power Glove uses your suit's special power.

export const PIECES = ["helmet", "chestplate", "leggings", "boots"];
export const MAX_POWER = 100;
export const RECHARGE_GROUND = 8; // per second
export const RECHARGE_AIR = 1.5; // per second while not thrusting
export const BOOST_EVERY = 6; // ticks between forward boosts
export const DRAIN_PER_SECOND = 6; // while climbing (times the suit's drain)
export const BOOST_COST = 0.5;

const fx = (id, seconds, amp = 0) => ({ id, ticks: Math.round(seconds * 20), amp });

/** @type {any[]} */
export const SUITS = [
  {
    key: "rocket", name: "Rocket Suit", color: "§c", rgb: [1, 0.35, 0.15], material: "minecraft:redstone",
    perk: { name: "the fastest flying", effects: [] },
    flight: { lift: 4, boost: 1.7, drain: 1.1 },
    power: { name: "Rocket Barrage", kind: "rockets", cost: 35, cooldown: 60, count: 6, damage: 6, radius: 2.5, range: 24 },
  },
  {
    key: "stealth", name: "Stealth Suit", color: "§3", rgb: [0.2, 0.85, 0.8], material: "minecraft:ink_sac",
    perk: { name: "night vision", effects: [fx("night_vision", 16)] },
    flight: { lift: 3, boost: 1.3, drain: 1 },
    power: { name: "Cloak", kind: "cloak", cost: 30, cooldown: 200, self: [fx("invisibility", 10), fx("speed", 10, 1)] },
  },
  {
    key: "titan", name: "Titan Suit", color: "§6", rgb: [1, 0.6, 0.15], material: "minecraft:copper_ingot",
    perk: { name: "toughness and strength", effects: [fx("resistance", 12), fx("strength", 12)] },
    flight: { lift: 2, boost: 1, drain: 1.4 },
    power: { name: "Ground Slam", kind: "slam", cost: 35, cooldown: 80, damage: 8, radius: 6, lift: 1 },
  },
  {
    key: "aqua", name: "Aqua Suit", color: "§9", rgb: [0.25, 0.6, 1], material: "minecraft:prismarine_shard",
    perk: { name: "breathing and fast mining underwater", effects: [fx("water_breathing", 12), fx("conduit_power", 12)] },
    flight: { lift: 3, boost: 1.2, drain: 1 },
    power: { name: "Bubble Jet", kind: "beam", cost: 25, cooldown: 30, damage: 4, knock: 2.5, range: 18 },
  },
  {
    key: "thunder", name: "Thunder Suit", color: "§e", rgb: [1, 0.92, 0.3], material: "minecraft:lightning_rod",
    perk: { name: "super speed", effects: [fx("speed", 12)] },
    flight: { lift: 3, boost: 1.5, drain: 1 },
    power: { name: "Arc Blast", kind: "chain", cost: 30, cooldown: 40, damage: 7, chain: 4, range: 16 },
  },
  {
    key: "frost", name: "Frost Suit", color: "§b", rgb: [0.65, 0.92, 1], material: "minecraft:packed_ice",
    perk: { name: "walking on water (it freezes)", effects: [], frostWalk: true },
    flight: { lift: 3, boost: 1.2, drain: 1 },
    power: { name: "Freeze Ray", kind: "beam", cost: 25, cooldown: 30, damage: 5, range: 20, effects: [fx("slowness", 5, 4)] },
  },
  {
    key: "nano", name: "Nano Suit", color: "§a", rgb: [0.35, 1, 0.45], material: "minecraft:emerald",
    perk: { name: "healing over time", effects: [fx("regeneration", 12)] },
    flight: { lift: 3, boost: 1.2, drain: 1 },
    power: { name: "Nano Repair", kind: "repair", cost: 40, cooldown: 200, heal: 10, radius: 6, effects: [fx("absorption", 20, 1), fx("regeneration", 6, 1)] },
  },
  {
    key: "solar", name: "Solar Suit", color: "§f", rgb: [1, 0.95, 0.6], material: "minecraft:glowstone_dust",
    perk: { name: "night vision, and recharging twice as fast in sunshine", effects: [fx("night_vision", 16)], solar: true },
    flight: { lift: 3, boost: 1.3, drain: 1 },
    power: { name: "Solar Laser", kind: "beam", cost: 30, cooldown: 30, damage: 10, range: 28, undead: 1.5 },
  },
];

for (const s of SUITS) s.armor = PIECES.map((p) => `bender:${s.key}_${p}`);

export const GLOVE_ID = "bender:power_glove";
export const DECOY_ID = "bender:hologram";

/** @type {any[]} */
export const GADGETS = [
  { key: "grapple_hook", name: "Grapple Hook", color: "§7", cooldown: 20, range: 30, about: "Zip to where you aim, or pull a monster to you" },
  { key: "nova_charge", name: "Nova Charge", color: "§d", cooldown: 100, damage: 10, radius: 4, fuse: 30, speed: 0.9, about: "Throw it: it bursts and blasts monsters (never blocks)" },
  { key: "energy_shield", name: "Energy Shield", color: "§b", cooldown: 300, seconds: 10, radius: 4, self: [fx("resistance", 10, 1)], about: "A bubble that pushes monsters away and protects you" },
  { key: "phase_beacon", name: "Phase Beacon", color: "§5", cooldown: 20, about: "Tap to mark a spot, tap again to warp back to it" },
  { key: "seismic_charge", name: "Seismic Charge", color: "§6", cooldown: 120, damage: 6, radius: 8, lift: 0.9, effects: [fx("slowness", 3, 1)], about: "A shockwave that throws monsters up" },
  { key: "hologram_decoy", name: "Hologram Decoy", color: "§3", cooldown: 300, seconds: 15, about: "A copy of you that monsters chase instead" },
];
for (const g of GADGETS) g.id = `bender:${g.key}`;

// ------------------------------------------------------------ lookups

export function suitOfItem(typeId) {
  return SUITS.findIndex((s) => s.armor.includes(typeId));
}

/** Which suit is worn in full (all 4 pieces), or -1. worn = [head, chest, legs, feet] item ids. */
export function fullSuit(worn) {
  if (worn.length !== 4) return -1;
  const i = SUITS.findIndex((s) => s.armor.every((id, k) => worn[k] === id));
  return i;
}

export function gadgetIndex(typeId) {
  return GADGETS.findIndex((g) => g.id === typeId);
}

// ------------------------------------------------------------ Suit Power and flying

export function newPilot() {
  return { power: MAX_POWER, flying: false, lastBoost: -100, ready: {} };
}

/**
 * One flight step (called every 2 ticks).
 * @param {any} pilot  { power, flying, lastBoost }
 * @param {number} suit  index of the worn suit
 * @param {{ onGround: boolean, inWater: boolean, jump: boolean, sneak: boolean, forward: number, sunny: boolean, tick: number }} input
 * @returns {{ levitate: number, glide: boolean, boost: number, dive: boolean }}  levitate = effect level to use (0 = none)
 */
export function flightStep(pilot, suit, input) {
  const s = SUITS[suit];
  const dt = 2 / 20;
  const solar = s.perk.solar && input.sunny ? 2 : 1;
  const out = { levitate: 0, glide: false, boost: 0, dive: false };
  if (input.onGround || input.inWater) {
    pilot.flying = false;
    pilot.power = Math.min(MAX_POWER, pilot.power + RECHARGE_GROUND * solar * dt);
    return out;
  }
  if (input.sneak) {
    out.dive = true;
    return out;
  }
  const thrust = input.jump && pilot.power > 0;
  if (thrust) {
    pilot.flying = true;
    out.levitate = s.flight.lift;
    pilot.power = Math.max(0, pilot.power - s.flight.drain * DRAIN_PER_SECOND * dt);
  } else if (pilot.flying) {
    out.glide = true;
    pilot.power = Math.min(MAX_POWER, pilot.power + RECHARGE_AIR * solar * dt);
  }
  if (pilot.flying && input.forward > 0.3 && pilot.power > 0 && input.tick - pilot.lastBoost >= BOOST_EVERY) {
    out.boost = s.flight.boost;
    pilot.lastBoost = input.tick;
    pilot.power = Math.max(0, pilot.power - BOOST_COST);
  }
  return out;
}

/** Can a power or gadget be used now? key = "power:3" or "gadget:1". */
export function ready(pilot, key, tick) {
  return tick >= (pilot.ready[key] ?? 0);
}

export function usePower(pilot, suit, tick) {
  const p = SUITS[suit].power;
  if (!ready(pilot, `power:${suit}`, tick)) return { ok: false, why: "cooldown" };
  if (pilot.power < p.cost) return { ok: false, why: "power" };
  pilot.power -= p.cost;
  pilot.ready[`power:${suit}`] = tick + p.cooldown;
  return { ok: true };
}

export function useGadget(pilot, gadget, tick) {
  const g = GADGETS[gadget];
  if (!ready(pilot, `gadget:${gadget}`, tick)) return { ok: false, why: "cooldown", wait: Math.ceil((pilot.ready[`gadget:${gadget}`] - tick) / 20) };
  pilot.ready[`gadget:${gadget}`] = tick + g.cooldown;
  return { ok: true };
}

// ------------------------------------------------------------ the status line

function bar(fraction, size = 10) {
  const full = Math.max(0, Math.min(size, Math.round(fraction * size)));
  const on = fraction > 0.5 ? "§a" : fraction > 0.2 ? "§e" : "§c";
  return on + "|".repeat(full) + "§8" + "|".repeat(size - full);
}

export function hud(pilot, suit) {
  const s = SUITS[suit];
  const tip = pilot.flying ? "§7Push forward to boost, sneak to dive" : "§7Hold jump to fly";
  return `${s.color}§l${s.name}§r  §bPower ${bar(pilot.power / MAX_POWER)}  ${tip}`;
}

export function pieceLore(suit) {
  const s = SUITS[suit];
  return [`§7Wear all 4 ${s.name} pieces to fly`, `${s.color}Perk: ${s.perk.name}`, `§7Power Glove power: ${s.power.name}`];
}
