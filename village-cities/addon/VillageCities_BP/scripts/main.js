// Village Cities: tap the City Charter and a whole city builds itself.
//
// 1st tap: we look at the land, pick a style, and outline the city with sparkles.
// 2nd tap: the city builds over a few seconds. Sneak + tap (twice) undoes it.
// The city layout itself comes from city.js.

import { system, world, BlockPermutation, BlockVolume, ItemStack, StructureSaveMode } from "@minecraft/server";
import { planCity, pickStyle, FOOTPRINT } from "./city.js";

const CHARTER_ID = "bender:city_charter";
const CLEAR_ABOVE = 48; // blocks cleared above the city floor (trees, hills)
const FOUNDATION = 12; // blocks filled in below the floor (holes, ponds)
const CONFIRM_TICKS = 20 * 20;

// Things that sit on top of the real ground, so we look underneath them.
const COVER =
  /(_leaves|_log|_wood|_stem|grass$|fern|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|bush|vine|snow_layer|sapling|mushroom|bamboo|reeds|sugar_cane|cactus|petals|leaf_litter|wildflowers|moss_carpet|azalea|propagule|cocoa|pumpkin|melon|torchflower|pitcher|dripleaf|hanging_moss|eyeblossom)/;

// Blocks the foundation is allowed to replace.
const LOOSE = ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];

const pendingBuild = new Map(); // playerId -> site waiting for the 2nd tap
const pendingUndo = new Map(); // playerId -> tick when the undo offer runs out
let building = false; // one city at a time keeps things smooth

// ------------------------------------------------------------ helpers

function actionBar(player, message) {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // Not important if this fails.
  }
}

function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    // Skip a sparkle that can't spawn.
  }
}

function addEffect(entity, effect, ticks, amplifier) {
  try {
    entity.addEffect(effect, ticks, { amplifier, showParticles: false });
  } catch {
    // Not every entity can have effects.
  }
}

function playersInside(site) {
  return world.getAllPlayers().filter((p) => {
    const { x, z } = p.location;
    return (
      p.dimension.id === site.dimension.id &&
      x >= site.x0 - 1 &&
      x <= site.x0 + FOOTPRINT + 1 &&
      z >= site.z0 - 1 &&
      z <= site.z0 + FOOTPRINT + 1
    );
  });
}

function sound(player, id, pitch = 1) {
  try {
    player.playSound(id, { pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

const permCache = new Map();
function perm(id, states) {
  const key = id + JSON.stringify(states);
  if (permCache.has(key)) return permCache.get(key);
  let p;
  try {
    p = BlockPermutation.resolve(id, states);
  } catch {
    try {
      p = BlockPermutation.resolve(id);
    } catch {
      p = undefined;
    }
  }
  permCache.set(key, p);
  return p;
}

// ------------------------------------------------------------ looking at the land

function surfaceAt(dimension, x, z) {
  const top = dimension.getTopmostBlock({ x, z });
  if (!top) return undefined;
  let ground = top;
  for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
  ground = ground ?? top;
  return { y: ground.y, ground: ground.typeId, top: top.typeId };
}

function survey(player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld") return { error: "Cities can only be built in the Overworld." };
  const half = Math.floor(FOOTPRINT / 2);
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - half;
  const z0 = cz - half;

  const heights = [];
  const counts = {};
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < FOOTPRINT; dx += 4) {
    for (let dz = 0; dz < FOOTPRINT; dz += 4) {
      let s;
      try {
        s = surfaceAt(dimension, x0 + dx, z0 + dz);
      } catch {
        s = undefined;
      }
      if (!s) return { error: "Stand in the middle of where you want the city, then try again." };
      samples++;
      counts[s.top] = (counts[s.top] ?? 0) + 1;
      if (s.ground !== s.top) counts[s.ground] = (counts[s.ground] ?? 0) + 1;
      if (s.ground.includes("water")) {
        water++;
        highestWater = Math.max(highestWater, s.y);
      } else {
        heights.push(s.y);
      }
    }
  }
  if (water / samples > 0.25 || heights.length === 0) return { error: "Too much water here! Find some drier land." };
  heights.sort((a, b) => a - b);
  let floorY = heights[Math.floor(heights.length / 2)];
  if (highestWater >= floorY) floorY = highestWater + 1; // build above ponds so nothing floods
  const range = dimension.heightRange;
  if (floorY - FOUNDATION < range.min || floorY + CLEAR_ABOVE >= range.max) {
    return { error: "Too high or too low to build a city here." };
  }
  return { dimension, x0, z0, floorY, cx, cz, style: pickStyle(counts) };
}

function showOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBuild.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    const y = site.floorY + 1.3;
    const last = FOOTPRINT - 1;
    for (let a = 0; a <= last; a += 2) {
      for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
        particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + x + 0.5, y, z: site.z0 + z + 0.5 });
      }
    }
  }, 10);
}

// ------------------------------------------------------------ building

function* buildJob(player, site, plan, record) {
  try {
    yield* buildSteps(player, site, plan);
    finishCity(player, site, plan, record);
  } finally {
    // Even if something goes wrong, let the next city be built.
    building = false;
  }
}

function* buildSteps(player, site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });

  // Clear the land, fill holes, and lay the ground, 16x16 columns at a time.
  for (let tx = 0; tx < FOOTPRINT; tx += 16) {
    for (let tz = 0; tz < FOOTPRINT; tz += 16) {
      const x2 = Math.min(tx + 15, FOOTPRINT - 1);
      const z2 = Math.min(tz + 15, FOOTPRINT - 1);
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 1, tz), at(x2, CLEAR_ABOVE, z2)), "minecraft:air");
      } catch {
        // Keep going; a missed patch is better than no city.
      }
      yield;
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, -FOUNDATION, tz), at(x2, -1, z2)), "minecraft:dirt", {
          blockFilter: { includeTypes: LOOSE },
        });
      } catch {
        // Same as above.
      }
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 0, tz), at(x2, 0, z2)), plan.style.ground);
      } catch {
        // Same as above.
      }
      yield;
    }
  }

  // Bring everyone in the area up onto the new ground to watch it build.
  const view = plan.viewpoint;
  for (const p of playersInside(site)) {
    try {
      p.teleport({ x: x0 + view.x + 0.5, y: F + view.y, z: z0 + view.z + 0.5 }, { rotation: { x: 10, y: 180 } });
    } catch {
      // They'll be fine where they are.
    }
  }

  // Place every block of the city.
  const total = plan.ops.length;
  for (let i = 0; i < total; i++) {
    const op = plan.ops[i];
    const p = perm(op.id, op.states);
    if (p) {
      try {
        dimension.getBlock(at(op.x, op.y, op.z))?.setPermutation(p);
      } catch {
        // Skip a block that can't be placed.
      }
    }
    // Never pause between the two halves of a door or a bed.
    const firstHalf = op.states.upper_block_bit === false || op.states.head_piece_bit === false;
    if (!firstHalf && i % 48 === 47) {
      if (i % 960 === 959 && player.isValid) {
        actionBar(player, `§eBuilding ${plan.name}... ${Math.floor((i / total) * 100)}%`);
      }
      yield;
    }
  }
}

function finishCity(player, site, plan, record) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (p) => ({ x: x0 + p.x + 0.5, y: F + p.y, z: z0 + p.z + 0.5 });

  // New townsfolk: one villager per bed, plus guards and cats.
  const spawn = (type, location) => {
    try {
      dimension.spawnEntity(type, location).addTag(record.tag);
    } catch {
      // Skip one that can't spawn.
    }
  };
  const villagers = Math.max(4, Math.min(plan.beds, 10));
  for (let i = 0; i < villagers; i++) spawn("minecraft:villager_v2", at(plan.spawns[i % plan.spawns.length]));
  spawn("minecraft:iron_golem", at(plan.spawns[0]));
  spawn("minecraft:iron_golem", at(plan.spawns[3]));
  spawn("minecraft:cat", at(plan.spawns[1]));
  spawn("minecraft:cat", at(plan.spawns[2]));

  // Welcome sign (the sign needs a moment before it can take text).
  system.runTimeout(() => {
    try {
      const block = dimension.getBlock({ x: x0 + plan.sign.x, y: F + plan.sign.y, z: z0 + plan.sign.z });
      block?.getComponent("minecraft:sign")?.setText(`Welcome to\n${plan.name}\n\nPop. ${villagers}`);
    } catch {
      // A blank sign is fine.
    }
  }, 10);

  if (player.isValid) {
    try {
      player.onScreenDisplay.setTitle(`§6${plan.name}`, {
        subtitle: "Your city is ready!",
        fadeInDuration: 10,
        stayDuration: 70,
        fadeOutDuration: 20,
      });
    } catch {
      // Titles are a bonus.
    }
    sound(player, "random.levelup");
    player.sendMessage(`§aWelcome to ${plan.name}!§r Changed your mind? Sneak and tap the Charter twice to undo it.`);
  }
}

function startBuilding(player, site) {
  const seed = (site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick;
  const plan = planCity(site.style, seed);
  const id = `bendercity:c${(seed >>> 0).toString(36)}`;
  const record = { id, tag: `bender_city_${(seed >>> 0).toString(36)}`, dim: site.dimension.id, x: site.x0, y: site.floorY - FOUNDATION, z: site.z0 };

  // Save what's here now so the city can be undone.
  try {
    world.structureManager.createFromWorld(
      id,
      site.dimension,
      { x: record.x, y: record.y, z: record.z },
      { x: site.x0 + FOOTPRINT - 1, y: site.floorY + CLEAR_ABOVE, z: site.z0 + FOOTPRINT - 1 },
      { includeEntities: false, saveMode: StructureSaveMode.World }
    );
  } catch {
    actionBar(player, "Couldn't get the land ready. Move a little and try again.");
    return;
  }
  // Only the newest city can be undone, so free the old snapshot.
  const old = player.getDynamicProperty("bender:last_city");
  if (typeof old === "string") {
    try {
      world.structureManager.delete(JSON.parse(old).id);
    } catch {
      // Already gone.
    }
  }
  player.setDynamicProperty("bender:last_city", JSON.stringify(record));

  // Nobody standing here gets hurt while the land moves around them.
  for (const p of playersInside(site)) {
    addEffect(p, "resistance", 400, 4);
    addEffect(p, "slow_falling", 400, 0);
  }

  building = true;
  sound(player, "block.bell.hit");
  actionBar(player, `§eBuilding a ${plan.style.label} city: ${plan.name}!`);
  system.runJob(buildJob(player, site, plan, record));
}

// ------------------------------------------------------------ undo

function undoCity(player) {
  const raw = player.getDynamicProperty("bender:last_city");
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a city to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = world.getDimension(record.dim);
  const centre = { x: record.x + FOOTPRINT / 2, z: record.z + FOOTPRINT / 2 };
  if (player.dimension.id !== record.dim || Math.hypot(player.location.x - centre.x, player.location.z - centre.z) > 48) {
    actionBar(player, "Go back to your city to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the city. Stand in the middle of it and try again.");
    return;
  }
  for (const entity of dimension.getEntities({ tags: [record.tag] })) {
    try {
      entity.remove();
    } catch {
      // Already gone.
    }
  }
  try {
    world.structureManager.delete(record.id);
  } catch {
    // Already gone.
  }
  player.setDynamicProperty("bender:last_city", undefined);
  sound(player, "random.pop");
  actionBar(player, "§aThe city is gone and the land is back the way it was.");
}

// ------------------------------------------------------------ the charter

function onCharterUse(player) {
  const now = system.currentTick;

  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undoCity(player);
    } else if (typeof player.getDynamicProperty("bender:last_city") === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last city?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a city to undo.");
    }
    return;
  }

  if (building) {
    actionBar(player, "Hold on, a city is still being built!");
    return;
  }

  const waiting = pendingBuild.get(player.id);
  if (waiting && now <= waiting.expires && now - waiting.tick > 10) {
    const moved = Math.hypot(player.location.x - waiting.cx, player.location.z - waiting.cz);
    if (moved <= 10) {
      pendingBuild.delete(player.id);
      startBuilding(player, waiting);
      return;
    }
  }

  const site = survey(player);
  if (site.error) {
    actionBar(player, site.error);
    return;
  }
  site.tick = now;
  site.expires = now + CONFIRM_TICKS;
  pendingBuild.set(player.id, site);
  showOutline(player, site);
  sound(player, "random.orb");
  const label = { desert: "desert", taiga: "snowy pine", forest: "forest", jungle: "jungle", savanna: "savanna", dark: "dark forest", cherry: "cherry blossom" }[site.style] ?? "meadow";
  player.sendMessage(`§eA ${label} city will fill the sparkly square.§r Everything inside gets replaced.`);
  actionBar(player, "§aTap Build City! again to build here.");
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:city_charter", {
    onUse(event) {
      const player = event.source;
      system.run(() => onCharterUse(player));
    },
  });
});

// ------------------------------------------------------------ welcome

const CHARTER_LORE = ["§eTap Build City! on open land", "§7Sneak + tap to undo your last city"];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.typeId !== CHARTER_ID || item.getLore().length > 0) continue;
      try {
        item.setLore(CHARTER_LORE);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:city_welcomed")) return;
  player.setDynamicProperty("bender:city_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const charter = new ItemStack(CHARTER_ID, 1);
    charter.setLore(CHARTER_LORE);
    const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(charter);
    if (leftover) player.dimension.spawnItem(leftover, player.location);
    player.sendMessage("§aVillage Cities is on!§r Here's a §6City Charter§r. Find some open land and tap §eBuild City!§r");
  }, 60);
});
