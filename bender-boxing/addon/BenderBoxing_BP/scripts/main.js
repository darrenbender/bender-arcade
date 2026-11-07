// Bender Boxing: punching bags and boxing gloves.
//
// Put on boxing gloves (hold them, or wear them in the chestplate slot) and
// punch a bag. Every punch trains you, and each training level gives you 2
// extra hearts (a health boost that lasts forever). Each bag can only train
// you so far, so tougher bags are needed to reach the top. The training
// rules live in training.js; this file does the Minecraft side.

import { system, world, EntityDamageCause, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";
import {
  BAGS,
  BAG_ID,
  GLOVES,
  HEARTS_PER_LEVEL,
  MAX_LEVEL,
  PROGRESS_KEY,
  bagIndexOf,
  bestGloves,
  heartsFor,
  levelFor,
  nextBagFor,
  punch,
  punchMessage,
  statusMessage,
} from "./training.js";

const BOOST = "health_boost";
const BOOST_TICKS = 20000000; // about 11 days of play; topped up long before it runs out
const TOP_UP_BELOW = 20 * 60 * 60; // top up when less than an hour is left
const WELCOME_KEY = "bender:boxing_welcomed";
const DEG = Math.PI / 180;
// Things a bag can be put down on top of (grass, flowers, snow and so on).
const SOFT_BLOCKS = new Set([
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:snow_layer",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:deadbush",
]);

const sessions = new Map(); // player id -> { lastTick, combo }
const lastSwing = new Map(); // bag id -> tick
const packHits = new Map(); // bag id -> { count, tick, player }
const lastPlaced = new Map(); // player id -> tick
const lastPunch = new Map(); // player id -> tick (so the status line doesn't cover punch news)

// ------------------------------------------------------------ helpers

function actionBar(player, message) {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // Not important if this fails.
  }
}

function sound(entity, id, volume = 1, pitch = 1) {
  try {
    entity.dimension.playSound(id, entity.location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    // Skip a sparkle that can't spawn.
  }
}

function isCreative(player) {
  try {
    return player.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}

function hasFamily(entity, family) {
  try {
    return !!entity.getComponent("minecraft:type_family")?.hasTypeFamily(family);
  } catch {
    return false;
  }
}

function heldIds(player) {
  const equip = player.getComponent("minecraft:equippable");
  const id = (slot) => {
    try {
      return equip?.getEquipment(slot)?.typeId;
    } catch {
      return undefined;
    }
  };
  return { main: id(EquipmentSlot.Mainhand), off: id(EquipmentSlot.Offhand), chest: id(EquipmentSlot.Chest) };
}

/** The best gloves the player has on (held in either hand or worn), or -1. */
function glovesOn(player) {
  const h = heldIds(player);
  return bestGloves([h.main, h.off, h.chest]);
}

function useUpHeld(player, typeId) {
  if (isCreative(player)) return;
  const equip = player.getComponent("minecraft:equippable");
  const held = equip?.getEquipment(EquipmentSlot.Mainhand);
  if (!held || held.typeId !== typeId) return;
  if (held.amount > 1) {
    held.amount -= 1;
    equip.setEquipment(EquipmentSlot.Mainhand, held);
  } else {
    equip.setEquipment(EquipmentSlot.Mainhand, undefined);
  }
}

function giveOrDrop(player, item, location) {
  const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(item) : item;
  if (leftover) player.dimension.spawnItem(leftover, location ?? player.location);
}

// ------------------------------------------------------------ training points and hearts

function getPoints(player) {
  const value = player.getDynamicProperty(PROGRESS_KEY);
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function fillHealth(player) {
  try {
    const health = player.getComponent("minecraft:health");
    if (health) health.setCurrentValue(health.effectiveMax);
  } catch {
    // The player may have left.
  }
}

/**
 * Make sure the player's health boost matches their training level.
 * It's only added when it's missing, too weak or nearly run out, because
 * adding it again can knock the extra hearts down for a moment.
 */
function syncHearts(player, fill = false) {
  if (!player.isValid) return;
  const level = levelFor(getPoints(player));
  if (level <= 0) return;
  const amplifier = level - 1; // each step of health boost is 2 hearts
  let effect;
  try {
    effect = player.getEffect(BOOST);
  } catch {
    effect = undefined;
  }
  const needed = !effect || effect.amplifier < amplifier || (effect.amplifier === amplifier && effect.duration < TOP_UP_BELOW);
  if (!needed) {
    if (fill) fillHealth(player);
    return;
  }
  let before = 0;
  try {
    before = player.getComponent("minecraft:health")?.currentValue ?? 0;
  } catch {
    before = 0;
  }
  try {
    player.addEffect(BOOST, BOOST_TICKS, { amplifier, showParticles: false });
  } catch {
    return;
  }
  // Put the hearts back (or fill them all up after a level up or a respawn).
  system.runTimeout(() => {
    if (!player.isValid) return;
    if (fill) {
      fillHealth(player);
      return;
    }
    try {
      const health = player.getComponent("minecraft:health");
      if (health && before > health.currentValue) health.setCurrentValue(Math.min(before, health.effectiveMax));
    } catch {
      // Not important.
    }
  }, 2);
}

function levelUp(player, level, bagIndex) {
  syncHearts(player, true);
  try {
    player.onScreenDisplay.setTitle(`§6§lLevel ${level}!`, {
      subtitle: `§c+${HEARTS_PER_LEVEL} hearts!§r You have ${heartsFor(level)} hearts now`,
      fadeInDuration: 5,
      stayDuration: 50,
      fadeOutDuration: 15,
    });
  } catch {
    // Not important.
  }
  sound(player, "random.levelup", 1, 1);
  const top = level >= MAX_LEVEL;
  for (let i = 0; i < (top ? 30 : 14); i++) {
    const a = (i / 14) * Math.PI * 2;
    particle(player.dimension, top ? "minecraft:totem_particle" : "minecraft:villager_happy", {
      x: player.location.x + Math.cos(a) * 0.8,
      y: player.location.y + 0.3 + Math.random() * 1.6,
      z: player.location.z + Math.sin(a) * 0.8,
    });
  }
  if (top) {
    player.sendMessage(`§6§lYou're a Bender Boxing Champion!§r You have all §c${heartsFor(level)} hearts§r.`);
    return;
  }
  const bag = BAGS[bagIndex];
  if (bag.maxLevel <= level) {
    const next = BAGS[nextBagFor(level)];
    player.sendMessage(`§6Level ${level}!§r You have §c${heartsFor(level)} hearts§r. The ${bag.name} can't make you any stronger now. Train on the ${next.color}${next.name}§r next!`);
  } else {
    player.sendMessage(`§6Level ${level}!§r You have §c${heartsFor(level)} hearts§r. Keep punching!`);
  }
}

// ------------------------------------------------------------ the bags

/** Which way the bag swings: away from whoever punched it. */
function swingFrom(bag, player) {
  const yaw = bag.getRotation().y * DEG;
  const dx = player.location.x - bag.location.x;
  const dz = player.location.z - bag.location.z;
  const ahead = dx * -Math.sin(yaw) + dz * Math.cos(yaw);
  const right = dx * -Math.cos(yaw) + dz * -Math.sin(yaw);
  if (Math.abs(ahead) >= Math.abs(right)) return ahead >= 0 ? "front" : "back";
  return right >= 0 ? "right" : "left";
}

function swing(bag, player, tick) {
  if (tick - (lastSwing.get(bag.id) ?? -100) < 6) return;
  lastSwing.set(bag.id, tick);
  try {
    bag.playAnimation(`animation.bender_bag.punch_${swingFrom(bag, player)}`, { blendOutTime: 0.15 });
  } catch {
    // The bag still works without the swing.
  }
}

function punchBag(player, bag) {
  const tick = system.currentTick;
  let bagIndex = 0;
  try {
    bagIndex = bagIndexOf(bag.getProperty("bender:material"));
  } catch {
    bagIndex = 0;
  }
  const info = BAGS[bagIndex];
  swing(bag, player, tick);

  if (player.isSneaking) {
    packUpHit(player, bag, info);
    return;
  }
  const glove = glovesOn(player);
  if (glove < 0) {
    sound(bag, info.sound, 0.5, info.pitch);
    actionBar(player, "§ePut on your boxing gloves to train!§r Hold them, or wear them like a chestplate.");
    return;
  }
  const session = sessions.get(player.id) ?? { lastTick: -1000, combo: 0 };
  const result = punch({ points: getPoints(player), lastTick: session.lastTick, combo: session.combo }, bagIndex, glove, tick);
  if (!result.counted) return;
  sessions.set(player.id, { lastTick: result.lastTick, combo: result.combo });
  if (result.gained > 0) player.setDynamicProperty(PROGRESS_KEY, result.points);
  lastPunch.set(player.id, tick);

  sound(bag, info.sound, 0.9, info.pitch + Math.min(result.combo, 10) * 0.02);
  sound(bag, "game.player.attack.strong", 0.5, 1);
  const hit = {
    x: (bag.location.x + player.location.x) / 2,
    y: bag.location.y + 1.2,
    z: (bag.location.z + player.location.z) / 2,
  };
  particle(bag.dimension, "minecraft:critical_hit_emitter", hit);

  if (result.levelUp) levelUp(player, result.levelUp, bagIndex);
  else actionBar(player, punchMessage(result, bagIndex));
}

function packUpHit(player, bag, info) {
  const tick = system.currentTick;
  const last = packHits.get(bag.id);
  const count = last && last.player === player.id && tick - last.tick < 40 ? last.count + 1 : 1;
  packHits.set(bag.id, { count, tick, player: player.id });
  if (count < 3) {
    const left = 3 - count;
    actionBar(player, `Keep crouching and punch ${left} more time${left === 1 ? "" : "s"} to pack up the ${info.name}`);
    sound(bag, "random.click", 0.6, 1.2);
    return;
  }
  packHits.delete(bag.id);
  const location = bag.location;
  bag.remove();
  giveOrDrop(player, new ItemStack(info.kit, 1), location);
  sound(player, "random.pop", 1, 1);
  actionBar(player, `§aPacked up the ${info.name}!`);
}

/** Where a bag goes: on top of the tapped block, or on the ground next to it. */
function bagSpot(dimension, block, face) {
  let { x, y, z } = block;
  if (face === "Up") {
    y += 1;
  } else if (face === "Down") {
    return undefined;
  } else {
    const step = { North: [0, -1], South: [0, 1], East: [1, 0], West: [-1, 0] }[face] ?? [0, 0];
    x += step[0];
    z += step[1];
    for (let i = 0; i < 4; i++) {
      const below = dimension.getBlock({ x, y: y - 1, z });
      if (!below || !(below.isAir || below.isLiquid || SOFT_BLOCKS.has(below.typeId))) break;
      y -= 1;
    }
  }
  // A bag is 2 blocks tall.
  for (let dy = 0; dy < 2; dy++) {
    const b = dimension.getBlock({ x, y: y + dy, z });
    if (!b || !(b.isAir || SOFT_BLOCKS.has(b.typeId))) return undefined;
  }
  return { x: x + 0.5, y, z: z + 0.5 };
}

function placeBag(player, item, block, face) {
  const bagIndex = BAGS.findIndex((b) => b.kit === item.typeId);
  if (bagIndex < 0) return;
  const tick = system.currentTick;
  if (tick - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, tick);
  const info = BAGS[bagIndex];

  let spot;
  try {
    spot = bagSpot(player.dimension, block, face);
  } catch {
    spot = undefined;
  }
  if (!spot) {
    actionBar(player, "§eNo room here.§r A punching bag needs 2 blocks of space on top of the ground.");
    return;
  }
  let bag;
  try {
    bag = player.dimension.spawnEntity(BAG_ID, spot, { spawnEvent: `bender:make_${info.key}` });
  } catch {
    actionBar(player, "§eNo room here.§r Try somewhere else.");
    return;
  }
  try {
    bag.setRotation({ x: 0, y: player.getRotation().y + 180 }); // the bag faces you
  } catch {
    // Facing another way is fine too.
  }
  sound(bag, info.sound, 1, info.pitch);
  sound(bag, "random.anvil_use", 0.3, 1.6);
  const next = levelFor(getPoints(player)) >= info.maxLevel ? "" : " Put on your gloves and punch it!";
  actionBar(player, `§aYour ${info.color}${info.name}§a is ready!§r${next}`);
  useUpHeld(player, item.typeId);
}

// ------------------------------------------------------------ punching

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;
  if (hitEntity.typeId === BAG_ID) {
    punchBag(player, hitEntity);
    return;
  }
  // Boxing gloves pack a punch against monsters (only monsters, never pets or players).
  if (!hasFamily(hitEntity, "monster")) return;
  const glove = glovesOn(player);
  if (glove < 0) return;
  const held = heldIds(player).main;
  if (held && GLOVES.every((g) => g.id !== held)) return; // holding a sword or tool: that does the work
  const power = GLOVES[glove];
  const target = hitEntity;
  const dx = target.location.x - player.location.x;
  const dz = target.location.z - player.location.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    target.applyKnockback({ x: (dx / len) * (0.8 + glove * 0.4), z: (dz / len) * (0.8 + glove * 0.4) }, 0.35);
  } catch {
    // Some things can't be knocked back.
  }
  particle(target.dimension, "minecraft:critical_hit_emitter", { x: target.location.x, y: target.location.y + 1, z: target.location.z });
  sound(target, "game.player.attack.strong", 1, 0.9);
  // The extra damage lands once the first hit's protection wears off.
  system.runTimeout(() => {
    if (!target.isValid || !player.isValid) return;
    try {
      target.applyDamage(power.punch, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
    } catch {
      // Couldn't be hurt.
    }
  }, 10);
});

// ------------------------------------------------------------ custom item parts

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:bag_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const { itemStack, block, blockFace } = event;
      system.run(() => placeBag(player, itemStack, block, blockFace));
    },
  });
});

// ------------------------------------------------------------ hearts, status and descriptions

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    syncHearts(player);
    // Holding gloves shows how your training is going.
    const main = heldIds(player).main;
    if (main && GLOVES.some((g) => g.id === main) && tick - (lastPunch.get(player.id) ?? -1000) > 60) {
      actionBar(player, statusMessage(getPoints(player)));
    }
  }
}, 20);

const GLOVE_LORE = {
  "bender:training_gloves": ["§7Hold them or wear them, then punch a bag", "§7Training speed: §fnormal"],
  "bender:pro_gloves": ["§7Hold them or wear them, then punch a bag", "§7Training speed: §a1.5x faster", "§7Hits monsters harder"],
  "bender:champion_gloves": ["§7Hold them or wear them, then punch a bag", "§7Training speed: §a2x faster", "§7Hits monsters much harder"],
};

function loreFor(typeId) {
  if (GLOVE_LORE[typeId]) return GLOVE_LORE[typeId];
  const bag = BAGS.find((b) => b.kit === typeId);
  if (!bag) return undefined;
  return ["§7Tap the ground to set it up", `§7Trains you up to §6level ${bag.maxLevel}§7 (§c${heartsFor(bag.maxLevel)} hearts§7)`, "§7Crouch + punch it 3 times to pack it up"];
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.getLore().length > 0) continue;
      const lore = loreFor(item.typeId);
      if (!lore) continue;
      try {
        item.setLore(lore);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

// ------------------------------------------------------------ joining and respawning

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  // Coming back to life (or joining) puts your extra hearts back.
  system.runTimeout(() => syncHearts(player, !initialSpawn), 10);
  if (!initialSpawn) return;
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    for (const id of ["bender:training_gloves", BAGS[0].kit, BAGS[1].kit]) {
      const item = new ItemStack(id, 1);
      const lore = loreFor(id);
      if (lore) item.setLore(lore);
      giveOrDrop(player, item);
    }
    player.sendMessage("§aBender Boxing is on!§r You got §cTraining Gloves§r, a §eHay Bag§r and a §6Leather Bag§r.");
    player.sendMessage("§7Tap the ground with a bag to set it up. Hold your gloves and punch the bag to grow extra hearts!");
  }, 60);
});
