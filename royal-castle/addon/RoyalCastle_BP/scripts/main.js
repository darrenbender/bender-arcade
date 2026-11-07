// Royal Castle: tap the Castle Kit and a whole castle builds itself.
// Sit on the throne to be crowned, wear the Royal Crown, and walk up to the
// portcullis to raise it. The castle layout comes from castle.js.

import { system, world, BlockPermutation, BlockVolume, EquipmentSlot, ItemStack, StructureSaveMode } from "@minecraft/server";
import { CASTLE_SIZE, planCastle } from "./castle.js";

const KIT_ID = "bender:castle_kit";
const CROWN_ID = "bender:royal_crown";
const SEAT_ID = "bender:throne_seat";
const GATE_ID = "bender:castle_gate";
const CLEAR_ABOVE = 34;
const FOUNDATION = 8;
const CONFIRM_TICKS = 20 * 20;
const LOOSE = ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];
const COVER =
  /(_leaves|_log|_wood|_stem|grass$|fern|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|bush|vine|snow_layer|sapling|mushroom|bamboo|reeds|sugar_cane|cactus|petals|leaf_litter|wildflowers|moss_carpet|azalea|propagule|cocoa|pumpkin|melon|torchflower|pitcher|dripleaf|hanging_moss|eyeblossom)/;

const pendingBuild = new Map();
const pendingUndo = new Map();
const seated = new Map(); // player id -> throne seat id
let building = false;

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

function addEffect(entity, effect, ticks, amplifier = 0) {
  try {
    entity.addEffect(effect, ticks, { amplifier, showParticles: false });
  } catch {
    // Not every entity can have effects.
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

function wearingCrown(player) {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head)?.typeId === CROWN_ID;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the throne

function crown(player, seat) {
  let castle = "your castle";
  try {
    const name = seat.getDynamicProperty("bender:castle");
    if (typeof name === "string") castle = name;
  } catch {
    // Use the plain name.
  }
  const crowned = wearingCrown(player);
  try {
    player.onScreenDisplay.setTitle(`§6Long live ${player.name}!`, {
      subtitle: `Ruler of ${castle}`,
      fadeInDuration: 10,
      stayDuration: 60,
      fadeOutDuration: 20,
    });
  } catch {
    // Titles are a bonus.
  }
  // a little royal fanfare
  [1, 1.26, 1.5, 2].forEach((pitch, i) => {
    system.runTimeout(() => {
      if (player.isValid) sound(player, "note.pling", 1, pitch);
    }, i * 5);
  });
  const burst = crowned ? 24 : 10;
  for (let i = 0; i < burst; i++) {
    particle(player.dimension, crowned ? "minecraft:totem_particle" : "minecraft:villager_happy", {
      x: player.location.x + (Math.random() - 0.5) * 2,
      y: player.location.y + 1 + Math.random() * 1.5,
      z: player.location.z + (Math.random() - 0.5) * 2,
    });
  }
  player.sendMessage(crowned
    ? `§6All hail ${player.name}, wearer of the Royal Crown!`
    : "§eTip:§r wear the §6Royal Crown§r when you sit on the throne!");
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    let on;
    try {
      on = player.getComponent("minecraft:riding")?.entityRidingOn;
    } catch {
      on = undefined;
    }
    const throne = on?.typeId === SEAT_ID ? on : undefined;
    const before = seated.get(player.id);
    if (throne && before !== throne.id) {
      seated.set(player.id, throne.id);
      crown(player, throne);
    } else if (!throne && before) {
      seated.delete(player.id);
    }
  }
}, 5);

// ------------------------------------------------------------ the portcullis

function gateOnTick(block) {
  let near = false;
  try {
    near = block.dimension.getPlayers({ location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, maxDistance: 4 }).length > 0;
  } catch {
    return;
  }
  /** @type {any} */
  const p = block.permutation;
  const open = p.getState("bender:open") === true;
  if (near === open) return;
  try {
    block.setPermutation(p.withState("bender:open", near));
  } catch {
    return;
  }
  let below;
  try {
    below = block.below();
  } catch {
    below = undefined;
  }
  if (below?.typeId !== GATE_ID) {
    try {
      block.dimension.playSound(near ? "random.door_open" : "random.door_close", block.location, { volume: 0.7, pitch: 0.6 });
    } catch {
      // Missing sound.
    }
  }
}

// ------------------------------------------------------------ looking at the land

function survey(player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld") return { error: "Castles can only be built in the Overworld." };
  const half = Math.floor(CASTLE_SIZE / 2);
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - half;
  const z0 = cz - half;
  const heights = [];
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < CASTLE_SIZE; dx += 4) {
    for (let dz = 0; dz < CASTLE_SIZE; dz += 4) {
      let ground;
      try {
        ground = dimension.getTopmostBlock({ x: x0 + dx, z: z0 + dz });
        for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
      } catch {
        ground = undefined;
      }
      if (!ground) return { error: "Stand in the middle of where you want the castle, then try again." };
      samples++;
      if (ground.typeId.includes("water")) {
        water++;
        highestWater = Math.max(highestWater, ground.y);
      } else {
        heights.push(ground.y);
      }
    }
  }
  if (water / samples > 0.25 || heights.length === 0) return { error: "Too much water here! Find some drier land." };
  heights.sort((a, b) => a - b);
  let floorY = heights[Math.floor(heights.length / 2)];
  if (highestWater >= floorY) floorY = highestWater + 1;
  const range = dimension.heightRange;
  if (floorY - FOUNDATION < range.min || floorY + CLEAR_ABOVE >= range.max) return { error: "Too high or too low to build a castle here." };
  return { dimension, x0, z0, floorY, cx, cz };
}

function playersInside(site) {
  return world.getAllPlayers().filter((p) => {
    const { x, z } = p.location;
    return p.dimension.id === site.dimension.id && x >= site.x0 - 1 && x <= site.x0 + CASTLE_SIZE + 1 && z >= site.z0 - 1 && z <= site.z0 + CASTLE_SIZE + 1;
  });
}

function showOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBuild.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    const last = CASTLE_SIZE - 1;
    for (let a = 0; a <= last; a += 2) {
      for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
        particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + x + 0.5, y: site.floorY + 1.3, z: site.z0 + z + 0.5 });
      }
    }
  }, 10);
}

// ------------------------------------------------------------ building

function* buildJob(player, site, plan, record) {
  try {
    yield* buildSteps(player, site, plan);
    finishCastle(player, site, plan, record);
  } finally {
    building = false;
  }
}

function* buildSteps(player, site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });
  for (let tx = 0; tx < CASTLE_SIZE; tx += 16) {
    for (let tz = 0; tz < CASTLE_SIZE; tz += 16) {
      const x2 = Math.min(tx + 15, CASTLE_SIZE - 1);
      const z2 = Math.min(tz + 15, CASTLE_SIZE - 1);
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 1, tz), at(x2, CLEAR_ABOVE, z2)), "minecraft:air");
      } catch {
        // Keep going; a missed patch is better than no castle.
      }
      yield;
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, -FOUNDATION, tz), at(x2, -1, z2)), "minecraft:dirt", { blockFilter: { includeTypes: LOOSE } });
        dimension.fillBlocks(new BlockVolume(at(tx, 0, tz), at(x2, 0, z2)), "minecraft:grass_block");
      } catch {
        // Keep going.
      }
      yield;
    }
  }
  const v = plan.viewpoint;
  for (const p of playersInside(site)) {
    try {
      p.teleport({ x: x0 + v.x + 0.5, y: F + v.y, z: z0 + v.z + 0.5 }, { rotation: { x: -10, y: 180 } });
    } catch {
      // They'll be fine where they are.
    }
  }
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
    const firstHalf = op.states.head_piece_bit === false;
    if (!firstHalf && i % 48 === 47) {
      if (i % 1920 === 1919 && player.isValid) actionBar(player, `§eBuilding ${plan.name}... ${Math.floor((i / total) * 100)}%`);
      yield;
    }
  }
}

/** @type {[string, number][][]} */
const TREASURE = [
  [["minecraft:gold_ingot", 12], ["minecraft:emerald", 8]],
  [["minecraft:diamond", 3], ["minecraft:golden_apple", 2], [CROWN_ID, 1]],
  [["minecraft:saddle", 2], ["minecraft:name_tag", 2], ["minecraft:iron_ingot", 16]],
  [["minecraft:cookie", 16], ["minecraft:bread", 8], ["minecraft:golden_carrot", 6]],
];

function finishCastle(player, site, plan, record) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (p) => ({ x: x0 + p.x, y: F + p.y, z: z0 + p.z });
  const spawn = (type, p) => {
    try {
      const e = dimension.spawnEntity(type, at(p));
      e.addTag(record.tag);
      return e;
    } catch {
      return undefined;
    }
  };
  const villagers = Math.max(4, Math.min(plan.beds, 8));
  for (let i = 0; i < villagers; i++) spawn("minecraft:villager_v2", plan.spawns.villagers[i % plan.spawns.villagers.length]);
  for (const g of plan.spawns.guards) spawn("minecraft:iron_golem", g);
  for (const h of plan.spawns.horses) spawn("minecraft:horse", h);
  for (const c of plan.spawns.cats) spawn("minecraft:cat", c);
  const seat = spawn(SEAT_ID, plan.throne);
  if (seat) {
    seat.setRotation({ x: 0, y: 0 });
    seat.setDynamicProperty("bender:castle", plan.name);
  }

  // Fill the treasure vault and write the sign once the blocks have settled.
  system.runTimeout(() => {
    plan.vault.forEach((c, i) => {
      try {
        const container = dimension.getBlock({ x: x0 + c.x, y: F + c.y, z: z0 + c.z })?.getComponent("minecraft:inventory")?.container;
        for (const [id, n] of TREASURE[i % TREASURE.length]) container?.addItem(new ItemStack(id, n));
      } catch {
        // An empty chest is still a chest.
      }
    });
    try {
      dimension.getBlock(at(plan.sign))?.getComponent("minecraft:sign")?.setText(`Welcome to\n${plan.name}\n\nAll are welcome!`);
    } catch {
      // A blank sign is fine.
    }
  }, 10);

  if (player.isValid) {
    try {
      player.onScreenDisplay.setTitle(`§6${plan.name}`, { subtitle: "Your kingdom awaits!", fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 });
    } catch {
      // Titles are a bonus.
    }
    sound(player, "random.levelup", 1, 0.8);
    player.sendMessage(`§aWelcome to ${plan.name}!§r Sit on the throne in the great hall, and look for the secret treasure vault...`);
    player.sendMessage("§7Changed your mind? Sneak and tap the Castle Kit twice to undo it.");
  }
}

function startBuilding(player, site) {
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const plan = planCastle(seed);
  const record = {
    id: `bendercastle:c${seed.toString(36)}`,
    tag: `bender_castle_${seed.toString(36)}`,
    dim: site.dimension.id,
    x: site.x0,
    y: site.floorY - FOUNDATION,
    z: site.z0,
  };
  try {
    world.structureManager.createFromWorld(
      record.id,
      site.dimension,
      { x: record.x, y: record.y, z: record.z },
      { x: site.x0 + CASTLE_SIZE - 1, y: site.floorY + CLEAR_ABOVE, z: site.z0 + CASTLE_SIZE - 1 },
      { includeEntities: false, saveMode: StructureSaveMode.World }
    );
  } catch {
    actionBar(player, "Couldn't get the land ready. Move a little and try again.");
    return;
  }
  const old = player.getDynamicProperty("bender:last_castle");
  if (typeof old === "string") {
    try {
      world.structureManager.delete(JSON.parse(old).id);
    } catch {
      // Already gone.
    }
  }
  player.setDynamicProperty("bender:last_castle", JSON.stringify(record));
  for (const p of playersInside(site)) {
    addEffect(p, "resistance", 400, 4);
    addEffect(p, "slow_falling", 400);
  }
  building = true;
  sound(player, "block.bell.hit", 1, 0.8);
  actionBar(player, `§eBuilding ${plan.name}!`);
  system.runJob(buildJob(player, site, plan, record));
}

function undoCastle(player) {
  const raw = player.getDynamicProperty("bender:last_castle");
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a castle to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = world.getDimension(record.dim);
  const cx = record.x + CASTLE_SIZE / 2;
  const cz = record.z + CASTLE_SIZE / 2;
  if (player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 48) {
    actionBar(player, "Go back to your castle to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the castle. Stand in the middle of it and try again.");
    return;
  }
  for (const e of dimension.getEntities({ tags: [record.tag] })) {
    try {
      e.remove();
    } catch {
      // Already gone.
    }
  }
  try {
    world.structureManager.delete(record.id);
  } catch {
    // Already gone.
  }
  player.setDynamicProperty("bender:last_castle", undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe castle is gone and the land is back the way it was.");
}

function useKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undoCastle(player);
    } else if (typeof player.getDynamicProperty("bender:last_castle") === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last castle?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a castle to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, a castle is still being built!");
    return;
  }
  const waiting = pendingBuild.get(player.id);
  if (waiting && now <= waiting.expires && now - waiting.tick > 10 && Math.hypot(player.location.x - waiting.cx, player.location.z - waiting.cz) <= 10) {
    pendingBuild.delete(player.id);
    startBuilding(player, waiting);
    return;
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
  sound(player, "random.orb", 1, 1);
  player.sendMessage("§eYour castle will fill the sparkly square.§r Everything inside gets replaced.");
  actionBar(player, "§aTap Build Castle! again to build here.");
}

// ------------------------------------------------------------ registering, descriptions and gifts

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:castle_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useKit(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:portcullis", {
    onTick(event) {
      gateOnTick(event.block);
    },
  });
});

const LORE = {
  [KIT_ID]: ["§eTap Build Castle! on open land", "§7Sneak + tap to undo your last castle"],
  [CROWN_ID]: ["§eWear it on your head", "§7Then sit on your castle's throne!"],
};

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || !LORE[item.typeId] || item.getLore().length > 0) continue;
      try {
        item.setLore(LORE[item.typeId]);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:castle_welcomed")) return;
  player.setDynamicProperty("bender:castle_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const container = player.getComponent("minecraft:inventory")?.container;
    for (const id of [KIT_ID, CROWN_ID]) {
      const item = new ItemStack(id, 1);
      item.setLore(LORE[id]);
      const leftover = container?.addItem(item);
      if (leftover) player.dimension.spawnItem(leftover, player.location);
    }
    player.sendMessage("§6Royal Castle is on!§r Here's a §6Castle Kit§r and a §6Royal Crown§r. Find some open land and tap §eBuild Castle!§r");
  }, 60);
});
