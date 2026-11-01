// Bender Forge: special powers for the custom weapons and tools.
// Each power is a "custom component" that the item JSON files switch on,
// for example "bender:fire_strike": { "seconds": 5 }.

import {
  system,
  world,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
} from "@minecraft/server";

// ------------------------------------------------------------ small helpers

function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    // Unknown particle or unloaded chunk: skip the sparkle, keep the power.
  }
}

function sound(dimension, id, location, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function blockCenter(loc) {
  return { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 };
}

function isCreative(player) {
  try {
    return player.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}

function actionBar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // Not important if this fails.
  }
}

// Own cooldown tracking, so a power can't be spammed even if the item's
// built-in cooldown bar behaves differently on some devices.
const lastUse = new Map();
function ready(player, key, seconds) {
  const id = `${player.id}:${key}`;
  const now = system.currentTick;
  const last = lastUse.get(id);
  if (last !== undefined && now - last < seconds * 20 - 2) return false;
  lastUse.set(id, now);
  return true;
}

function showCooldown(player, itemStack) {
  try {
    itemStack?.getComponent("minecraft:cooldown")?.startCooldown(player);
  } catch {
    // The visual cooldown is optional.
  }
}

// Wear down the item in the player's main hand, respecting Unbreaking.
function wearHeldItem(player, typeId, amount) {
  if (amount <= 0 || isCreative(player)) return;
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return;
  const item = equip.getEquipment(EquipmentSlot.Mainhand);
  if (!item || item.typeId !== typeId) return;
  const durability = item.getComponent("minecraft:durability");
  if (!durability) return;

  let unbreaking = 0;
  try {
    unbreaking = item.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
  } catch {
    unbreaking = 0;
  }
  let damage = 0;
  for (let i = 0; i < amount; i++) {
    if (Math.random() < 1 / (unbreaking + 1)) damage++;
  }
  if (damage === 0) return;

  if (durability.damage + damage >= durability.maxDurability) {
    equip.setEquipment(EquipmentSlot.Mainhand, undefined);
    sound(player.dimension, "random.break", player.location);
    return;
  }
  durability.damage += damage;
  equip.setEquipment(EquipmentSlot.Mainhand, item);
}

function getBlock(dimension, loc) {
  try {
    return dimension.getBlock(loc);
  } catch {
    return undefined;
  }
}

// Break blocks as if the player mined them with `tool`, dropping the loot at
// `dropAt`. Returns how many blocks were broken.
function breakBlocks(player, blocks, tool, dropAt) {
  const dimension = player.dimension;
  const creative = isCreative(player);
  const loot = world.getLootTableManager();
  let broken = 0;
  for (const block of blocks) {
    if (!block || !block.isValid) continue;
    let drops = [];
    if (!creative) {
      try {
        drops = loot.generateLootFromBlock(block, tool);
      } catch {
        drops = [];
      }
      // undefined means this tool isn't strong enough for that block.
      if (drops === undefined) continue;
    }
    try {
      block.setType("minecraft:air");
    } catch {
      continue;
    }
    broken++;
    for (const stack of drops) {
      try {
        dimension.spawnItem(stack, dropAt);
      } catch {
        // Ignore a drop that can't spawn.
      }
    }
  }
  return broken;
}

function hasInventory(block) {
  try {
    return !!block.getComponent("minecraft:inventory");
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ which blocks?

const NEVER_BREAK = new Set([
  "minecraft:bedrock",
  "minecraft:barrier",
  "minecraft:obsidian",
  "minecraft:crying_obsidian",
  "minecraft:reinforced_deepslate",
  "minecraft:end_portal_frame",
  "minecraft:mob_spawner",
  "minecraft:trial_spawner",
  "minecraft:vault",
  "minecraft:budding_amethyst",
  "minecraft:command_block",
  "minecraft:structure_block",
]);

function shortId(typeId) {
  return typeId.startsWith("minecraft:") ? typeId.slice(10) : typeId;
}

// Natural stone-like blocks only, so the hammer won't chew through builds
// made from bricks, planks, glass and so on.
const STONE_RE =
  /^(stone|cobblestone|mossy_cobblestone|deepslate|cobbled_deepslate|tuff|calcite|andesite|diorite|granite|netherrack|basalt|smooth_basalt|blackstone|end_stone|sandstone|red_sandstone|dripstone_block|magma|terracotta|[a-z_]+_terracotta|infested_[a-z_]+|[a-z_]*_ore)$/;

const SOIL_RE =
  /^(dirt|coarse_dirt|grass_block|grass|podzol|mycelium|sand|red_sand|gravel|clay|soul_sand|soul_soil|snow|snow_layer|mud|rooted_dirt|dirt_with_roots|farmland|grass_path|dirt_path)$/;

function areaMatches(mode, typeId) {
  if (NEVER_BREAK.has(typeId)) return false;
  const id = shortId(typeId);
  return mode === "soil" ? SOIL_RE.test(id) : STONE_RE.test(id) && id !== "ancient_debris";
}

// "deepslate_iron_ore" and "iron_ore" count as the same vein.
function oreFamily(typeId) {
  const id = shortId(typeId);
  if (id === "ancient_debris") return id;
  if (!id.endsWith("_ore")) return undefined;
  return id.replace(/^lit_/, "").replace(/^deepslate_/, "");
}

function isLog(typeId) {
  const id = shortId(typeId);
  return /(_log|_stem)$/.test(id) || id === "mangrove_roots";
}

function isLeaves(typeId) {
  const id = shortId(typeId);
  return /leaves$/.test(id) || id === "nether_wart_block" || id === "warped_wart_block" || id === "shroomlight";
}

// ------------------------------------------------------------ mining powers

function planeOffsets(player) {
  // Which way is the player looking? Mine a flat 3x3 square facing them.
  const d = player.getViewDirection();
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const az = Math.abs(d.z);
  const out = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      if (a === 0 && b === 0) continue;
      if (ay >= ax && ay >= az) out.push({ x: a, y: 0, z: b });
      else if (ax >= az) out.push({ x: 0, y: a, z: b });
      else out.push({ x: a, y: b, z: 0 });
    }
  }
  return out;
}

const NEIGHBORS = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      if (x || y || z) NEIGHBORS.push({ x, y, z });
    }
  }
}

function collectConnected(dimension, start, matches, limit, onNeighbor) {
  const key = (p) => `${p.x},${p.y},${p.z}`;
  const seen = new Set([key(start)]);
  const queue = [start];
  const found = [];
  while (queue.length && found.length < limit) {
    const p = queue.shift();
    for (const n of NEIGHBORS) {
      const q = { x: p.x + n.x, y: p.y + n.y, z: p.z + n.z };
      const k = key(q);
      if (seen.has(k)) continue;
      seen.add(k);
      const block = getBlock(dimension, q);
      if (!block) continue;
      if (onNeighbor) onNeighbor(block);
      if (matches(block.typeId) && found.length < limit) {
        found.push(block);
        queue.push(q);
      }
    }
  }
  return found;
}

function onAreaMine(event, params) {
  const player = event.source;
  if (player.typeId !== "minecraft:player") return;
  const tool = event.itemStack;
  if (!tool) return;
  const mode = params?.mode === "soil" ? "soil" : "stone";
  const minedId = event.minedBlockPermutation.type.id;
  const origin = { x: event.block.x, y: event.block.y, z: event.block.z };
  const sneaking = player.isSneaking;

  system.run(() => {
    let extra = 0;
    if (!sneaking && areaMatches(mode, minedId)) {
      const dimension = player.dimension;
      const targets = [];
      for (const o of planeOffsets(player)) {
        const block = getBlock(dimension, { x: origin.x + o.x, y: origin.y + o.y, z: origin.z + o.z });
        if (block && areaMatches(mode, block.typeId) && !hasInventory(block)) targets.push(block);
      }
      extra = breakBlocks(player, targets, tool, blockCenter(origin));
      if (extra > 0) {
        sound(dimension, mode === "soil" ? "dig.gravel" : "dig.stone", blockCenter(origin), 1, 0.8);
      }
    }
    wearHeldItem(player, tool.typeId, 1 + extra);
  });
}

function onVeinMine(event, params) {
  const player = event.source;
  if (player.typeId !== "minecraft:player") return;
  const tool = event.itemStack;
  if (!tool) return;
  const mode = params?.mode === "log" ? "log" : "ore";
  const limit = Math.min(Number(params?.limit) || 64, 200);
  const minedId = event.minedBlockPermutation.type.id;
  const origin = { x: event.block.x, y: event.block.y, z: event.block.z };
  const sneaking = player.isSneaking;

  system.run(() => {
    let extra = 0;
    const dimension = player.dimension;
    if (!sneaking && mode === "ore" && oreFamily(minedId)) {
      const family = oreFamily(minedId);
      const vein = collectConnected(dimension, origin, (id) => oreFamily(id) === family, limit);
      extra = breakBlocks(player, vein, tool, blockCenter(origin));
      if (extra > 0) {
        sound(dimension, "random.orb", blockCenter(origin), 0.6, 1.2);
        particle(dimension, "minecraft:villager_happy", blockCenter(origin));
      }
    } else if (!sneaking && mode === "log" && isLog(minedId)) {
      // Only fell real trees: the logs must touch leaves somewhere.
      let leaves = false;
      const tree = collectConnected(dimension, origin, (id) => id === minedId, limit, (b) => {
        if (!leaves && isLeaves(b.typeId)) leaves = true;
      });
      if (leaves) {
        extra = breakBlocks(player, tree, tool, blockCenter(origin));
        if (extra > 0) sound(dimension, "dig.wood", blockCenter(origin), 1, 0.7);
      }
    }
    wearHeldItem(player, tool.typeId, 1 + extra);
  });
}

// ------------------------------------------------------------ weapon powers

function hitLanded(event) {
  return event.hadEffect && event.hitEntity?.isValid;
}

// A "use" power fires from the touch-screen Use Item button (onUse) and
// also when the player taps a block while holding the item (onUseOn).
function usePower(fn) {
  return {
    onUse(event, { params }) {
      fn(event.source, event.itemStack, params);
    },
    onUseOn(event, { params }) {
      if (event.source.typeId === "minecraft:player") fn(event.source, event.itemStack, params);
    },
  };
}

const POWERS = {
  // Blaze Sword: sets the target on fire.
  "bender:fire_strike": {
    onHitEntity(event, { params }) {
      if (!hitLanded(event)) return;
      const target = event.hitEntity;
      const seconds = Number(params?.seconds) || 5;
      system.run(() => {
        if (!target.isValid) return;
        target.setOnFire(seconds, true);
        const loc = target.location;
        for (let i = 0; i < 4; i++) {
          particle(target.dimension, "minecraft:basic_flame_particle", {
            x: loc.x + (Math.random() - 0.5),
            y: loc.y + 0.5 + Math.random(),
            z: loc.z + (Math.random() - 0.5),
          });
        }
      });
    },
  },

  // Frost Blade: slows the target down.
  "bender:frost_strike": {
    onHitEntity(event, { params }) {
      if (!hitLanded(event)) return;
      const target = event.hitEntity;
      const seconds = Number(params?.seconds) || 4;
      system.run(() => {
        if (!target.isValid) return;
        target.addEffect("slowness", seconds * 20, { amplifier: 2 });
        const loc = target.location;
        for (let i = 0; i < 6; i++) {
          particle(target.dimension, "minecraft:snowflake_particle", {
            x: loc.x + (Math.random() - 0.5) * 1.2,
            y: loc.y + Math.random() * 2,
            z: loc.z + (Math.random() - 0.5) * 1.2,
          });
        }
        sound(target.dimension, "random.glass", loc, 0.4, 1.8);
      });
    },
  },

  // Thunder Hammer hit: big knockback.
  "bender:smash_strike": {
    onHitEntity(event, { params }) {
      if (!hitLanded(event)) return;
      const target = event.hitEntity;
      const attacker = event.attackingEntity;
      const power = Number(params?.power) || 1.6;
      system.run(() => {
        if (!target.isValid || !attacker.isValid) return;
        const dx = target.location.x - attacker.location.x;
        const dz = target.location.z - attacker.location.z;
        const len = Math.hypot(dx, dz) || 1;
        try {
          target.applyKnockback({ x: (dx / len) * power, z: (dz / len) * power }, 0.5);
        } catch {
          // Some entities can't be knocked back.
        }
        particle(target.dimension, "minecraft:critical_hit_emitter", target.location);
      });
    },
  },

  // Thunder Hammer use: call lightning where you point.
  "bender:call_lightning": usePower((player, itemStack, params) => {
    const cooldown = Number(params?.cooldown) || 5;
    system.run(() => {
      const hit = player.getBlockFromViewDirection({ maxDistance: 40 });
      if (!hit) {
        actionBar(player, "Point at the ground to call lightning!");
        return;
      }
      const target = { x: hit.block.x + 0.5, y: hit.block.y + 1, z: hit.block.z + 0.5 };
      const p = player.location;
      if (Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) < 5) {
        actionBar(player, "Too close! Point further away.");
        return;
      }
      if (!ready(player, "lightning", cooldown)) return;
      showCooldown(player, itemStack);
      player.dimension.spawnEntity("minecraft:lightning_bolt", target);
      wearHeldItem(player, itemStack?.typeId, 2);
    });
  }),

  // Ender Dagger use: teleport forward.
  "bender:ender_blink": usePower((player, itemStack, params) => {
    const range = Math.min(Number(params?.range) || 12, 24);
    const cooldown = Number(params?.cooldown) || 2;
    system.run(() => {
      if (!ready(player, "blink", cooldown)) return;
      const dir = player.getViewDirection();
      const head = player.getHeadLocation();
      const hit = player.getBlockFromViewDirection({ maxDistance: range });
      let dist = range;
      if (hit) {
        const b = hit.block;
        const hx = b.x + hit.faceLocation.x - head.x;
        const hy = b.y + hit.faceLocation.y - head.y;
        const hz = b.z + hit.faceLocation.z - head.z;
        dist = Math.hypot(hx, hy, hz) - 1;
      }
      const start = player.location;
      for (let d = Math.floor(dist); d >= 2; d--) {
        const feet = {
          x: head.x + dir.x * d,
          y: head.y + dir.y * d - 1.62,
          z: head.z + dir.z * d,
        };
        if (player.tryTeleport(feet, { checkForBlocks: true, keepVelocity: false })) {
          for (const loc of [start, feet]) {
            for (let i = 0; i < 5; i++) {
              particle(player.dimension, "minecraft:endrod", {
                x: loc.x + (Math.random() - 0.5),
                y: loc.y + Math.random() * 2,
                z: loc.z + (Math.random() - 0.5),
              });
            }
          }
          sound(player.dimension, "mob.endermen.portal", feet);
          showCooldown(player, itemStack);
          wearHeldItem(player, itemStack?.typeId, 1);
          return;
        }
      }
      actionBar(player, "No room to teleport there!");
      lastUse.delete(`${player.id}:blink`);
    });
  }),

  // Sky Glaive hit: pop the target up into the air.
  "bender:gust_strike": {
    onHitEntity(event) {
      if (!hitLanded(event)) return;
      const target = event.hitEntity;
      system.run(() => {
        if (!target.isValid) return;
        try {
          target.applyKnockback({ x: 0, z: 0 }, 0.9);
        } catch {
          // Some entities can't be knocked up.
        }
      });
    },
  },

  // Sky Glaive use: leap forward and float down gently.
  "bender:sky_leap": usePower((player, itemStack, params) => {
    const cooldown = Number(params?.cooldown) || 3;
    system.run(() => {
      if (!ready(player, "leap", cooldown)) return;
      const d = player.getViewDirection();
      const len = Math.hypot(d.x, d.z) || 1;
      player.applyKnockback({ x: (d.x / len) * 1.4, z: (d.z / len) * 1.4 }, 1.1);
      player.addEffect("slow_falling", 120, { amplifier: 0, showParticles: false });
      particle(player.dimension, "minecraft:wind_explosion_emitter", player.location);
      sound(player.dimension, "mob.enderdragon.flap", player.location, 0.8, 1.4);
      showCooldown(player, itemStack);
      wearHeldItem(player, itemStack?.typeId, 1);
    });
  }),

  // Amethyst Scythe hit: heal the wielder a little.
  "bender:crystal_heal": {
    onHitEntity(event, { params }) {
      if (!hitLanded(event)) return;
      const player = event.attackingEntity;
      if (player.typeId !== "minecraft:player") return;
      const amount = Number(params?.amount) || 2;
      system.run(() => {
        const health = player.getComponent("minecraft:health");
        if (!health) return;
        if (health.currentValue < health.effectiveMax) {
          health.setCurrentValue(Math.min(health.currentValue + amount, health.effectiveMax));
          particle(player.dimension, "minecraft:heart_particle", player.getHeadLocation());
        }
      });
    },
  },

  // Amethyst Scythe use: spin attack that hits nearby monsters only.
  "bender:spin_sweep": usePower((player, itemStack, params) => {
    const radius = Math.min(Number(params?.radius) || 5, 8);
    const damage = Number(params?.damage) || 7;
    const cooldown = Number(params?.cooldown) || 4;
    system.run(() => {
      if (!ready(player, "sweep", cooldown)) return;
      const dimension = player.dimension;
      const center = player.location;
      const monsters = dimension.getEntities({ location: center, maxDistance: radius, families: ["monster"] });
      for (const mob of monsters) {
        try {
          mob.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
          particle(dimension, "minecraft:critical_hit_emitter", mob.location);
        } catch {
          // Skip anything that can't be hurt.
        }
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        particle(dimension, "minecraft:endrod", {
          x: center.x + Math.cos(a) * 2.5,
          y: center.y + 1,
          z: center.z + Math.sin(a) * 2.5,
        });
      }
      sound(dimension, "game.player.attack.strong", center, 1, 0.8);
      showCooldown(player, itemStack);
      wearHeldItem(player, itemStack?.typeId, 2);
    });
  }),

  // Quarry Hammer / Mega Shovel: mine 3x3.
  "bender:area_mine": {
    onMineBlock(event, { params }) {
      onAreaMine(event, params);
    },
  },

  // Ore Seeker / Timber Axe: mine a whole vein or tree.
  "bender:vein_mine": {
    onMineBlock(event, { params }) {
      onVeinMine(event, params);
    },
  },
};

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  for (const [name, component] of Object.entries(POWERS)) {
    itemComponentRegistry.registerCustomComponent(name, component);
  }
});

// Hover text that explains each item's powers. Item files can't hold lore,
// so it gets added the first time the item lands in a player's inventory.
const LORE = {
  "bender:blaze_sword": ["§cSets mobs on fire"],
  "bender:frost_blade": ["§bFreezes mobs so they move slowly"],
  "bender:thunder_hammer": ["§eHit: mighty knockback", "§eUse Item: call lightning"],
  "bender:ender_dagger": ["§dUse Item: teleport forward"],
  "bender:sky_glaive": ["§fHit: pops mobs into the air", "§fUse Item: sky jump"],
  "bender:amethyst_scythe": ["§dHit: heals you a little", "§dUse Item: spin attack on monsters"],
  "bender:quarry_hammer": ["§7Mines a 3x3 square of stone", "§7Sneak to mine one block"],
  "bender:timber_axe": ["§7Chops down a whole tree", "§7Sneak to chop one log"],
  "bender:ore_seeker": ["§7Mines a whole ore vein", "§7Sneak to mine one block"],
  "bender:mega_shovel": ["§7Digs a 3x3 square of dirt, sand or gravel", "§7Sneak to dig one block"],
};

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      const lore = item && LORE[item.typeId];
      if (!lore || item.getLore().length > 0) continue;
      try {
        item.setLore(lore);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

// Say hello once per player so the kids know where to look.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:welcomed")) return;
  player.setDynamicProperty("bender:welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    player.sendMessage("§6Bender Forge is on!§r Open the §eRecipe Book§r to find 10 new weapons and tools.");
    player.sendMessage("§7Tap §fUse Item§7 to fire a weapon's power. Sneak to mine just one block.");
  }, 60);
});
