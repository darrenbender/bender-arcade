// Bender Boxing training rules. No Minecraft imports, so this file can be
// run and tested outside the game.
//
// Every punch on a bag earns training points. Points add up to levels, and
// each level gives 2 extra hearts. A bag can only train you up to its own
// level: the Hay Bag gets you to level 1, the Netherite Bag all the way to 5.

export const BAG_ID = "bender:punching_bag";
export const PROGRESS_KEY = "bender:boxing_points";

/** The bags, softest first. Each one trains you up to its maxLevel. */
export const BAGS = [
  { key: "hay", name: "Hay Bag", kit: "bender:hay_bag_kit", points: 1, maxLevel: 1, color: "§e", sound: "dig.grass", pitch: 0.9 },
  { key: "leather", name: "Leather Bag", kit: "bender:leather_bag_kit", points: 2, maxLevel: 2, color: "§6", sound: "armor.equip_leather", pitch: 0.8 },
  { key: "iron", name: "Iron Bag", kit: "bender:iron_bag_kit", points: 3, maxLevel: 3, color: "§f", sound: "armor.equip_iron", pitch: 0.9 },
  { key: "diamond", name: "Diamond Bag", kit: "bender:diamond_bag_kit", points: 4, maxLevel: 4, color: "§b", sound: "armor.equip_diamond", pitch: 1 },
  { key: "netherite", name: "Netherite Bag", kit: "bender:netherite_bag_kit", points: 5, maxLevel: 5, color: "§d", sound: "armor.equip_netherite", pitch: 0.8 },
];

/** The gloves. `power` speeds up training; `punch` is extra damage on monsters. */
export const GLOVES = [
  { id: "bender:training_gloves", name: "Training Gloves", color: "§c", power: 1, punch: 2 },
  { id: "bender:pro_gloves", name: "Pro Gloves", color: "§9", power: 1.5, punch: 4 },
  { id: "bender:champion_gloves", name: "Champion Gloves", color: "§6", power: 2, punch: 6 },
];

/** Points you need in total to reach each level (index = level). */
export const LEVEL_POINTS = [0, 100, 400, 1000, 2000, 3500];
export const MAX_LEVEL = LEVEL_POINTS.length - 1;
export const BASE_HEARTS = 10;
export const HEARTS_PER_LEVEL = 2;

/** Punches closer together than this (in ticks) don't count. 20 ticks = 1 second. */
export const PUNCH_GAP = 5;
/** Keep punching at least this often (in ticks) to build a combo. */
export const COMBO_GAP = 30;

export function bagIndexOf(materialNumber) {
  const i = Math.round(Number(materialNumber) || 0);
  return Math.min(BAGS.length - 1, Math.max(0, i));
}

export function gloveIndexOf(typeId) {
  return GLOVES.findIndex((g) => g.id === typeId);
}

/** The best gloves among the given item ids, or -1 if none are gloves. */
export function bestGloves(typeIds) {
  let best = -1;
  for (const id of typeIds) best = Math.max(best, gloveIndexOf(id));
  return best;
}

export function levelFor(points) {
  let level = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) if (points >= LEVEL_POINTS[l]) level = l;
  return level;
}

export function heartsFor(level) {
  return BASE_HEARTS + HEARTS_PER_LEVEL * level;
}

/** How far you are through your current level, from 0 to 1. */
export function progressFor(points) {
  const level = levelFor(points);
  if (level >= MAX_LEVEL) return { level, fraction: 1, toGo: 0 };
  const from = LEVEL_POINTS[level];
  const to = LEVEL_POINTS[level + 1];
  return { level, fraction: Math.min(1, Math.max(0, (points - from) / (to - from))), toGo: Math.ceil(to - points) };
}

/** Combos make training faster: x1.5 from 5 punches in a row, x2 from 10. */
export function comboBoost(combo) {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1.5;
  return 1;
}

/** The softest bag that can still make you stronger, or -1 at the top level. */
export function nextBagFor(level) {
  return BAGS.findIndex((b) => b.maxLevel > level);
}

/**
 * One punch on a bag.
 * @param {{ points: number, lastTick: number, combo: number }} state
 * @param {number} bagIndex
 * @param {number} gloveIndex
 * @param {number} tick
 */
export function punch(state, bagIndex, gloveIndex, tick) {
  const bag = BAGS[bagIndex];
  const glove = GLOVES[gloveIndex];
  const points = Math.max(0, Number(state.points) || 0);
  const level = levelFor(points);
  const result = {
    points,
    lastTick: state.lastTick,
    combo: state.combo,
    counted: false,
    gained: 0,
    level,
    levelUp: 0,
    tooSoft: false,
    maxed: false,
  };
  if (!bag || !glove) return result;
  if (tick - state.lastTick < PUNCH_GAP) return result;

  result.counted = true;
  result.combo = tick - state.lastTick <= COMBO_GAP ? state.combo + 1 : 1;
  result.lastTick = tick;
  if (level >= MAX_LEVEL) {
    result.maxed = true;
    return result;
  }
  if (level >= bag.maxLevel) {
    result.tooSoft = true;
    return result;
  }
  const cap = LEVEL_POINTS[bag.maxLevel];
  const earned = bag.points * glove.power * comboBoost(result.combo);
  result.points = Math.min(cap, points + earned);
  result.gained = result.points - points;
  result.level = levelFor(result.points);
  if (result.level > level) result.levelUp = result.level;
  return result;
}

function bar(fraction, size = 10) {
  const full = Math.round(fraction * size);
  return "§a" + "|".repeat(full) + "§8" + "|".repeat(size - full);
}

/** The line shown above the hotbar after a punch. */
export function punchMessage(result, bagIndex) {
  const bag = BAGS[bagIndex];
  if (result.maxed) return `§6§lChampion!§r You have all ${heartsFor(MAX_LEVEL)} hearts. §bCombo x${result.combo}`;
  if (result.tooSoft) {
    const next = BAGS[nextBagFor(result.level)];
    return `§eToo easy!§r The ${bag.name} can't make you stronger. Try the ${next.color}${next.name}§r!`;
  }
  const p = progressFor(result.points);
  const combo = result.combo >= 5 ? ` §b§lCombo x${result.combo}!` : ` §7Combo x${result.combo}`;
  return `§lLevel ${p.level}§r ${bar(p.fraction)} §f${Math.floor(p.fraction * 100)}%${combo}`;
}

/** The line shown while you hold your gloves. */
export function statusMessage(points) {
  const p = progressFor(points);
  const hearts = `§c${heartsFor(p.level)} hearts§r`;
  if (p.level >= MAX_LEVEL) return `§6§lChampion!§r Level ${p.level}, ${hearts}`;
  const next = BAGS[nextBagFor(p.level)];
  return `§lLevel ${p.level}§r, ${hearts} ${bar(p.fraction)} §7Train on: ${next.color}${next.name}`;
}
