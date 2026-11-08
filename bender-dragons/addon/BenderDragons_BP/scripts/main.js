// Bender Dragons: fight the Ender Dragon in the Overworld, then hatch, raise
// and ride a dragon of your own.
//
// The Dragon Arena Kit builds an End-style island with six crystal pillars
// and an altar. Tap the altar to call the dragon. Break the crystals (they
// heal it), hit it when it lands, and beat it to win an Ender Dragon Egg.
// The egg hatches into a baby dragon that follows you; feed it to grow it up,
// then ride it. The boss never breaks blocks. Flight rules live in dragon.js
// and the arena layout in arena.js; this file does the Minecraft side.

import {
  system,
  world,
  BlockPermutation,
  BlockVolume,
  ButtonState,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  InputButton,
  ItemStack,
  MolangVariableMap,
  StructureSaveMode,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { ARENA_SIZE, planArena } from "./arena.js";
import {
  BODY_UP,
  BOSS,
  BOSS_ID,
  COLORS,
  CRYSTAL_ID,
  DIFFICULTIES,
  EGG_ENTITY_ID,
  PET,
  PET_FOODS,
  PET_ID,
  PET_NAMES,
  bossStep,
  distance,
  feed,
  followVelocity,
  inBreath,
  launchFireball,
  mouthOf,
  newFight,
  rideVelocity,
  settleVelocity,
  stepFireball,
  yawOf,
} from "./dragon.js";

const KIT_ID = "bender:dragon_arena_kit";
const EGG_ITEM = "bender:dragon_egg";
const WHISTLE_ID = "bender:dragon_whistle";
const CLEAR_ABOVE = 26;
const FOUNDATION = 4;
const CONFIRM_TICKS = 20 * 20;
const ARENA_PREFIX = "bender:arena:";
const LOOSE = ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];
const COVER =
  /leaves|log|wood|grass$|short_grass|tall_grass|fern|flower|rose|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily|bush|vine|snow_layer|sapling|mushroom|sugar_cane|kelp|seagrass|bamboo|cactus|pumpkin|melon/;
const PET_FIREBALL_DAMAGE = 6;
const DIMENSIONS = ["overworld", "nether", "the_end"];

const pendingBuild = new Map();
const pendingUndo = new Map();
let building = false;
const fights = new Map(); // boss id -> { boss, fight, key, arena, vel, yaw, pose }
/** @type {{ dim: any, pos: any, vel: any, ttl: number, from: string, damage: number, source: any }[]} */
let fireballs = [];
const petMotion = new Map(); // pet id -> last velocity
const riding = new Map(); // player id -> pet id
const lastUse = new Map(); // player id + what -> tick
const eggHits = new Map(); // egg id -> { count, tick }

// ------------------------------------------------------------ helpers

function actionBar(player, message) {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // Not important if this fails.
  }
}

function title(player, main, sub) {
  try {
    player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 8, stayDuration: 60, fadeOutDuration: 20 });
  } catch {
    // Titles are a bonus.
  }
}

function sound(where, id, volume = 1, pitch = 1) {
  try {
    where.dimension.playSound(id, where.location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function particle(dimension, id, location, vars) {
  try {
    dimension.spawnParticle(id, location, vars);
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

function cooled(player, what, ticks) {
  const key = player.id + what;
  const now = system.currentTick;
  if (now - (lastUse.get(key) ?? -1000) < ticks) return false;
  lastUse.set(key, now);
  return true;
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

function giveOrDrop(player, item) {
  const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
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

function hurt(target, amount, source) {
  try {
    target.applyDamage(amount, source?.isValid ? { cause: EntityDamageCause.magic, damagingEntity: source } : { cause: EntityDamageCause.magic });
  } catch {
    // Couldn't be hurt.
  }
}

function pushAway(target, from, strength, up) {
  const dx = target.location.x - from.x;
  const dz = target.location.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    target.applyKnockback({ x: (dx / len) * strength, z: (dz / len) * strength }, up);
  } catch {
    // Some things can't be pushed.
  }
}

function breathCloud(dimension, location, radius, seconds) {
  const vars = new MolangVariableMap();
  vars.setFloat("variable.cloud_radius", radius);
  vars.setFloat("variable.cloud_lifetime", seconds);
  vars.setFloat("variable.particle_multiplier", 3);
  particle(dimension, "minecraft:dragon_breath_lingering", location, vars);
}

function beam(dimension, from, to) {
  const d = distance(from, to);
  const steps = Math.min(40, Math.ceil(d / 0.8));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    particle(dimension, "bender:crystal_beam", { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f });
  }
}

// ------------------------------------------------------------ arenas (saved so altars know their pillars)

function arenaKey(dimensionId, b) {
  return `${ARENA_PREFIX}${dimensionId}:${b.x},${b.y},${b.z}`;
}

function readArena(key) {
  const raw = world.getDynamicProperty(key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function spawnCrystals(dimension, arena) {
  for (const p of arena.pillars) {
    const spot = { x: p.x + 0.5, y: p.y, z: p.z + 0.5 };
    let there = [];
    try {
      there = dimension.getEntities({ type: CRYSTAL_ID, location: spot, maxDistance: 1.5 });
    } catch {
      there = [];
    }
    if (there.length) continue;
    try {
      const c = dimension.spawnEntity(CRYSTAL_ID, spot);
      c.addTag(arena.tag);
    } catch {
      // A missing crystal just makes the fight easier.
    }
  }
}

function crystalsOf(dimension, arena) {
  try {
    return dimension.getEntities({ type: CRYSTAL_ID, location: arena.center, maxDistance: 32 });
  } catch {
    return [];
  }
}

function removeCrystals(dimension, arena) {
  for (const c of crystalsOf(dimension, arena)) {
    try {
      c.remove();
    } catch {
      // Already gone.
    }
  }
}

// ------------------------------------------------------------ building the arena

function survey(player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld") return { error: "Dragon arenas can only be built in the Overworld." };
  const half = Math.floor(ARENA_SIZE / 2);
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - half;
  const z0 = cz - half;
  const heights = [];
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < ARENA_SIZE; dx += 4) {
    for (let dz = 0; dz < ARENA_SIZE; dz += 4) {
      let ground;
      try {
        ground = dimension.getTopmostBlock({ x: x0 + dx, z: z0 + dz });
        for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
      } catch {
        ground = undefined;
      }
      if (!ground) return { error: "Stand in the middle of where you want the arena, then try again." };
      samples++;
      if (ground.typeId.includes("water")) {
        water++;
        highestWater = Math.max(highestWater, ground.y);
      } else {
        heights.push(ground.y);
      }
    }
  }
  if (water / samples > 0.3 || heights.length === 0) return { error: "Too much water here! Find some drier land." };
  heights.sort((a, b) => a - b);
  let floorY = heights[Math.floor(heights.length / 2)];
  if (highestWater >= floorY) floorY = highestWater + 1;
  const range = dimension.heightRange;
  if (floorY - FOUNDATION < range.min || floorY + CLEAR_ABOVE >= range.max) return { error: "Too high or too low to build an arena here." };
  return { dimension, x0, z0, floorY, cx, cz };
}

function playersInside(site) {
  return world.getAllPlayers().filter((p) => {
    const { x, z } = p.location;
    return p.dimension.id === site.dimension.id && x >= site.x0 - 1 && x <= site.x0 + ARENA_SIZE + 1 && z >= site.z0 - 1 && z <= site.z0 + ARENA_SIZE + 1;
  });
}

function showOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBuild.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    const r = ARENA_SIZE / 2 - 1;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + 20.5 + Math.cos(a) * r, y: site.floorY + 1.3, z: site.z0 + 20.5 + Math.sin(a) * r });
    }
  }, 10);
}

function* buildJob(player, site, plan, record) {
  try {
    yield* buildSteps(player, site, plan);
    finishArena(player, site, plan, record);
  } finally {
    building = false;
  }
}

function* buildSteps(player, site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });
  for (let tx = 0; tx < ARENA_SIZE; tx += 16) {
    for (let tz = 0; tz < ARENA_SIZE; tz += 16) {
      const x2 = Math.min(tx + 15, ARENA_SIZE - 1);
      const z2 = Math.min(tz + 15, ARENA_SIZE - 1);
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 1, tz), at(x2, CLEAR_ABOVE, z2)), "minecraft:air");
      } catch {
        // Keep going; a missed patch is better than no arena.
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
    if (i % 64 === 63) {
      if (i % 1280 === 1279 && player.isValid) actionBar(player, `§dBuilding the Dragon Arena... ${Math.floor((i / total) * 100)}%`);
      yield;
    }
  }
}

function finishArena(player, site, plan, record) {
  const { dimension, x0, z0, floorY: F } = site;
  const arena = {
    dim: dimension.id,
    tag: record.tag,
    center: { x: x0 + plan.perch.x, y: F + plan.perch.y, z: z0 + plan.perch.z },
    pillars: plan.pillars.map((p) => ({ x: x0 + p.x, y: F + p.y, z: z0 + p.z })),
  };
  const altar = { x: x0 + plan.altar.x, y: F + plan.altar.y, z: z0 + plan.altar.z };
  const key = arenaKey(dimension.id, altar);
  world.setDynamicProperty(key, JSON.stringify(arena));
  record.key = key;
  player.setDynamicProperty("bender:last_arena", JSON.stringify(record));
  system.runTimeout(() => spawnCrystals(dimension, arena), 5);
  if (player.isValid) {
    title(player, "§5Dragon Arena", "Tap the altar to call the Ender Dragon!");
    sound(player, "block.end_portal.spawn", 1, 1);
    player.sendMessage("§dYour Dragon Arena is ready!§r Tap the altar in the middle to call the Ender Dragon.");
    player.sendMessage("§7Tip: break the End crystals on top of the pillars first. They heal the dragon!");
  }
}

function startBuilding(player, site) {
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const plan = planArena();
  const record = {
    id: `benderdragons:a${seed.toString(36)}`,
    tag: `bender_arena_${seed.toString(36)}`,
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
      { x: site.x0 + ARENA_SIZE - 1, y: site.floorY + CLEAR_ABOVE, z: site.z0 + ARENA_SIZE - 1 },
      { includeEntities: false, saveMode: StructureSaveMode.World }
    );
  } catch {
    actionBar(player, "Couldn't get the land ready. Move a little and try again.");
    return;
  }
  const old = player.getDynamicProperty("bender:last_arena");
  if (typeof old === "string") {
    try {
      world.structureManager.delete(JSON.parse(old).id);
    } catch {
      // Already gone.
    }
  }
  player.setDynamicProperty("bender:last_arena", JSON.stringify(record));
  for (const p of playersInside(site)) {
    addEffect(p, "resistance", 400, 4);
    addEffect(p, "slow_falling", 400);
  }
  building = true;
  sound(player, "beacon.activate", 1, 0.8);
  actionBar(player, "§dBuilding the Dragon Arena!");
  system.runJob(buildJob(player, site, plan, record));
}

function undoArena(player) {
  const raw = player.getDynamicProperty("bender:last_arena");
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built an arena to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = world.getDimension(record.dim);
  const cx = record.x + ARENA_SIZE / 2;
  const cz = record.z + ARENA_SIZE / 2;
  if (player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 40) {
    actionBar(player, "Go back to your arena to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the arena. Stand in the middle of it and try again.");
    return;
  }
  for (const e of dimension.getEntities({ tags: [record.tag] })) {
    fights.delete(e.id);
    try {
      e.remove();
    } catch {
      // Already gone.
    }
  }
  if (record.key) world.setDynamicProperty(record.key, undefined);
  try {
    world.structureManager.delete(record.id);
  } catch {
    // Already gone.
  }
  player.setDynamicProperty("bender:last_arena", undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe arena is gone and the land is back the way it was.");
}

function useKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undoArena(player);
    } else if (typeof player.getDynamicProperty("bender:last_arena") === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last arena?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built an arena to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, an arena is still being built!");
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
  player.sendMessage("§eThe arena will fill the sparkly circle§r (a square 41 blocks across). Everything inside gets replaced.");
  actionBar(player, "§aTap Build Arena! again to build here.");
}

// ------------------------------------------------------------ calling the dragon

function bossFor(key) {
  for (const b of fights.values()) if (b.key === key && b.boss.isValid) return b;
  return undefined;
}

function useAltar(player, block) {
  if (!cooled(player, "altar", 20)) return;
  const dimension = block.dimension;
  const key = arenaKey(dimension.id, block);
  if (bossFor(key)) {
    actionBar(player, "§5The Ender Dragon is already here!§r Fight it!");
    return;
  }
  const arena = readArena(key) ?? {
    dim: dimension.id,
    tag: `bender_altar_${block.x}_${block.y}_${block.z}`.replace(/-/g, "m"),
    center: { x: block.x + 0.5, y: block.y, z: block.z + 0.5 },
    pillars: [],
  };
  const form = new ActionFormData()
    .title("§5Call the Ender Dragon?")
    .body("Pick how tough the dragon is.\n\nBreak the §dEnd crystals§r on the pillars first: they heal the dragon. Hit it when it lands on the altar!")
    .button("§aEasy")
    .button("§eNormal")
    .button("§cHard");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    if (bossFor(key)) return;
    summonBoss(player, dimension, key, arena, res.selection);
  }).catch(() => {});
}

function summonBoss(player, dimension, key, arena, difficulty) {
  const diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES[1];
  spawnCrystals(dimension, arena);
  const c = arena.center;
  let boss;
  try {
    boss = dimension.spawnEntity(BOSS_ID, { x: c.x, y: c.y + 28, z: c.z - 26 }, { spawnEvent: `bender:difficulty_${diff.key}` });
  } catch {
    actionBar(player, "The dragon couldn't come. Try again in a moment.");
    return;
  }
  boss.addTag(arena.tag);
  boss.setDynamicProperty("bender:arena", key);
  boss.setDynamicProperty("bender:center", JSON.stringify(c));
  boss.setDynamicProperty("bender:difficulty", difficulty);
  adopt(boss, key, arena, newFight(c, difficulty, (system.currentTick * 2654435761) >>> 0));
  for (const p of dimension.getPlayers({ location: c, maxDistance: 64 })) {
    title(p, "§5The Ender Dragon is coming!", `${diff.name} dragon. Break the crystals!`);
  }
  sound({ dimension, location: c }, "mob.enderdragon.growl", 4, 0.9);
}

function adopt(boss, key, arena, fight) {
  fights.set(boss.id, { boss, fight, key, arena, vel: { x: 0, y: 0, z: 0 }, yaw: boss.getRotation().y, pose: -1 });
}

// After a reload the fight state is gone: pick the dragon back up where it is.
system.runInterval(() => {
  let found = [];
  try {
    found = world.getDimension("overworld").getEntities({ type: BOSS_ID });
  } catch {
    found = [];
  }
  for (const boss of found) {
    if (fights.has(boss.id)) continue;
    const key = boss.getDynamicProperty("bender:arena");
    let center;
    try {
      center = JSON.parse(String(boss.getDynamicProperty("bender:center")));
    } catch {
      center = undefined;
    }
    if (typeof key !== "string" || !center) {
      boss.remove();
      continue;
    }
    const arena = readArena(key) ?? { dim: "minecraft:overworld", tag: "", center, pillars: [] };
    const difficulty = Number(boss.getDynamicProperty("bender:difficulty") ?? 1);
    const fight = newFight(center, difficulty, 99);
    fight.phase = "circle";
    adopt(boss, key, arena, fight);
  }
}, 40);

// ------------------------------------------------------------ the boss fight

function bossEvent(b, e, players) {
  const { boss } = b;
  const diff = DIFFICULTIES[b.fight.difficulty] ?? DIFFICULTIES[1];
  const byId = (id) => players.find((p) => p.id === id);
  switch (e.type) {
    case "roar":
      sound(boss, "mob.enderdragon.growl", 4, 1);
      try {
        boss.playAnimation("animation.bender_dragon.roar");
      } catch {
        // The roar sound is enough.
      }
      break;
    case "fireball": {
      const target = byId(e.target);
      if (!target) break;
      const from = mouthOf(boss.location, b.yaw);
      const to = { x: target.location.x, y: target.location.y + 1, z: target.location.z };
      fireballs.push({ dim: boss.dimension, ...launchFireball(from, to), from: "boss", damage: diff.fireball, source: boss });
      sound(boss, "mob.ghast.fireball", 2, 0.8);
      break;
    }
    case "hit": {
      const target = byId(e.target);
      if (!target) break;
      hurt(target, e.damage, boss);
      pushAway(target, boss.location, 1.6, 0.55);
      sound(target, "mob.enderdragon.hit", 1.5, 1.2);
      break;
    }
    case "breath": {
      const r = (e.yaw * Math.PI) / 180;
      const fx = -Math.sin(r);
      const fz = Math.cos(r);
      const mouth = mouthOf(boss.location, e.yaw);
      for (let d = 1; d <= 6; d += 1.5) breathCloud(boss.dimension, { x: mouth.x + fx * d, y: boss.location.y + 0.3, z: mouth.z + fz * d }, 0.6 + d * 0.15, 0.8);
      sound(boss, "mob.enderdragon.growl", 2, 1.4);
      for (const p of players) if (inBreath(boss.location, e.yaw, p.location, 6 + BOSS.size * 7)) hurt(p, e.damage, boss);
      break;
    }
    case "landed":
      sound(boss, "mob.enderdragon.flap", 3, 0.7);
      for (const p of players) actionBar(p, "§eThe dragon landed! Hit it now!");
      break;
    case "takeoff":
      sound(boss, "mob.enderdragon.flap", 3, 1);
      break;
    case "leaving":
      for (const p of players) p.sendMessage("§7The Ender Dragon got bored and is flying away...");
      break;
    case "gone":
      fights.delete(boss.id);
      removeCrystals(boss.dimension, b.arena);
      for (const p of boss.dimension.getPlayers()) p.sendMessage("§7The Ender Dragon flew away. Tap the altar to call it back.");
      try {
        boss.remove();
      } catch {
        // Already gone.
      }
      break;
  }
}

system.runInterval(() => {
  const tick = system.currentTick;
  for (const [id, b] of fights) {
    const { boss } = b;
    if (!boss.isValid) {
      fights.delete(id);
      continue;
    }
    let players = [];
    try {
      players = boss.dimension.getPlayers({ location: b.fight.center, maxDistance: 64 });
    } catch {
      players = [];
    }
    const health = boss.getComponent("minecraft:health");
    const me = {
      pos: boss.location,
      vel: b.vel,
      yaw: b.yaw,
      health: health?.currentValue ?? 1,
      maxHealth: health?.effectiveMax ?? 1,
    };
    const out = bossStep(b.fight, me, players.map((p) => ({ id: p.id, pos: p.location })));
    b.vel = out.vel;
    b.yaw = out.yaw;
    try {
      boss.clearVelocity();
      boss.applyImpulse(out.vel);
      boss.setRotation({ x: 0, y: out.yaw });
    } catch {
      // Try again next tick.
    }
    if (out.pose !== b.pose) {
      try {
        boss.setProperty("bender:pose", out.pose);
        b.pose = out.pose;
      } catch {
        // Try again next tick.
      }
    }
    for (const e of out.events) {
      bossEvent(b, e, players);
      if (!fights.has(id)) break;
    }
    if (!fights.has(id)) continue;
    if (out.pose === 0 && tick % 32 === 0) sound(boss, "mob.enderdragon.flap", 2.5, 0.9);
    // the crystals heal the dragon
    if (tick % 20 === 0) {
      const crystals = crystalsOf(boss.dimension, b.arena);
      if (crystals.length && health && health.currentValue < health.effectiveMax) {
        const diff = DIFFICULTIES[b.fight.difficulty] ?? DIFFICULTIES[1];
        try {
          health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + (diff.key === "hard" ? 2 : 1)));
        } catch {
          // Not important.
        }
        const body = { x: boss.location.x, y: boss.location.y + BODY_UP, z: boss.location.z };
        for (const c of crystals) beam(boss.dimension, { x: c.location.x, y: c.location.y + 1.4, z: c.location.z }, body);
      }
    }
  }
}, 1);

// ------------------------------------------------------------ fireballs

function enemiesNear(dimension, location, radius) {
  let found = [];
  try {
    found = dimension.getEntities({ location, maxDistance: radius });
  } catch {
    found = [];
  }
  return found.filter((e) => e.typeId === BOSS_ID || hasFamily(e, "monster"));
}

function explode(fb) {
  const { dim, pos } = fb;
  breathCloud(dim, pos, 1.8, 1);
  particle(dim, "bender:ender_fireball", pos);
  sound({ dimension: dim, location: pos }, "random.explode", 0.7, 1.5);
  if (fb.from === "boss") {
    let near = [];
    try {
      near = dim.getPlayers({ location: pos, maxDistance: 2.8 });
    } catch {
      near = [];
    }
    for (const p of near) {
      hurt(p, fb.damage, fb.source);
      pushAway(p, pos, 0.9, 0.35);
    }
  } else {
    for (const e of enemiesNear(dim, pos, 3)) {
      hurt(e, fb.damage, fb.source);
      if (e.typeId !== BOSS_ID) pushAway(e, pos, 0.8, 0.3);
    }
  }
}

system.runInterval(() => {
  const keep = [];
  for (const fb of fireballs) {
    const next = stepFireball(fb);
    Object.assign(fb, next);
    particle(fb.dim, "bender:ender_fireball", fb.pos);
    let boom = fb.ttl <= 0;
    if (!boom) {
      try {
        const block = fb.dim.getBlock(fb.pos);
        boom = !!block && !block.isAir && !block.isLiquid;
      } catch {
        boom = true; // left the loaded world
      }
    }
    if (!boom) {
      if (fb.from === "boss") {
        try {
          boom = fb.dim.getPlayers({ location: fb.pos, maxDistance: 1.4 }).length > 0;
        } catch {
          boom = false;
        }
      } else {
        boom = enemiesNear(fb.dim, fb.pos, 1.8).length > 0;
      }
    }
    if (boom) explode(fb);
    else keep.push(fb);
  }
  fireballs = keep;
}, 1);

// ------------------------------------------------------------ crystals breaking and winning

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  let location;
  let dimension;
  try {
    location = deadEntity.location;
    dimension = deadEntity.dimension;
  } catch {
    return;
  }
  if (deadEntity.typeId === CRYSTAL_ID) {
    particle(dimension, "minecraft:huge_explosion_emitter", location);
    sound({ dimension, location }, "random.glass", 2, 0.8);
    sound({ dimension, location }, "random.explode", 0.6, 1.6);
    for (const p of dimension.getPlayers({ location, maxDistance: 64 })) actionBar(p, "§dA crystal broke!§r The dragon can't heal from it any more.");
    return;
  }
  if (deadEntity.typeId !== BOSS_ID) return;
  const b = fights.get(deadEntity.id);
  fights.delete(deadEntity.id);
  const center = b?.fight.center ?? location;
  if (b) removeCrystals(dimension, b.arena);
  victory(dimension, location, center);
}, { entityTypes: [CRYSTAL_ID, BOSS_ID] });

world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  sound(hurtEntity, "mob.enderdragon.hit", 2, 1);
}, { entityTypes: [BOSS_ID] });

function victory(dimension, location, center) {
  const body = { x: location.x, y: location.y + BODY_UP, z: location.z };
  sound({ dimension, location: body }, "mob.enderdragon.death", 4, 1);
  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => {
      particle(dimension, "minecraft:dragon_death_explosion_emitter", body);
      particle(dimension, "minecraft:totem_particle", { x: body.x + (Math.random() - 0.5) * 4, y: body.y, z: body.z + (Math.random() - 0.5) * 4 });
    }, i * 8);
  }
  for (let i = 0; i < 20; i++) {
    try {
      dimension.spawnEntity("minecraft:xp_orb", { x: center.x + (Math.random() - 0.5) * 6, y: center.y + 1, z: center.z + (Math.random() - 0.5) * 6 });
    } catch {
      break;
    }
  }
  for (const p of dimension.getPlayers({ location: center, maxDistance: 64 })) {
    title(p, "§5§lVictory!", "You beat the Ender Dragon!");
    sound(p, "random.levelup", 1, 1);
    const egg = new ItemStack(EGG_ITEM, 1);
    egg.setLore(LORE[EGG_ITEM]);
    giveOrDrop(p, egg);
    p.sendMessage("§d§lYou beat the Ender Dragon!§r You got an §dEnder Dragon Egg§r. Tap the ground to put it down and watch it hatch!");
  }
}

// ------------------------------------------------------------ eggs

function placeEgg(player, block, face) {
  if (!cooled(player, "egg", 10)) return;
  const o = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  const at = { x: block.x + 0.5 + o[0], y: block.y + o[1], z: block.z + 0.5 + o[2] };
  let egg;
  try {
    egg = player.dimension.spawnEntity(EGG_ENTITY_ID, at);
  } catch {
    actionBar(player, "There's no room for the egg here.");
    return;
  }
  egg.setDynamicProperty("bender:owner", player.id);
  egg.setDynamicProperty("bender:owner_name", player.name);
  egg.setDynamicProperty("bender:hatch_left", PET.hatchTicks);
  sound(egg, "block.end_portal_frame.fill", 1, 1);
  actionBar(player, "§dYour egg will hatch in about 20 seconds!§r Stay close.");
  useUpHeld(player, EGG_ITEM);
}

function hatch(egg) {
  const dimension = egg.dimension;
  const location = egg.location;
  const ownerId = egg.getDynamicProperty("bender:owner");
  const ownerName = egg.getDynamicProperty("bender:owner_name");
  egg.remove();
  let pet;
  try {
    pet = dimension.spawnEntity(PET_ID, location, { spawnEvent: "bender:hatch" });
  } catch {
    return;
  }
  const name = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
  const color = Math.floor(Math.random() * COLORS.length);
  pet.nameTag = name;
  pet.setProperty("bender:color", color);
  pet.setDynamicProperty("bender:owner", typeof ownerId === "string" ? ownerId : "");
  pet.setDynamicProperty("bender:owner_name", typeof ownerName === "string" ? ownerName : "");
  pet.setDynamicProperty("bender:mode", "follow");
  pet.setDynamicProperty("bender:feeds", 0);
  particle(dimension, "minecraft:dragon_death_explosion_emitter", { x: location.x, y: location.y + 0.5, z: location.z });
  sound(pet, "mob.enderdragon.growl", 1, 2);
  sound(pet, "random.pop", 1, 0.8);
  const owner = world.getAllPlayers().find((p) => p.id === ownerId);
  if (owner && owner.dimension.id === dimension.id && distance(owner.location, location) < 40) {
    title(owner, "§dIt hatched!", "Meet your baby dragon!");
    nameForm(owner, pet, name, color, 0);
  }
}

function nameForm(player, pet, name, color, tries) {
  const form = new ModalFormData()
    .title("§dYour dragon hatched!")
    .textField("Give your dragon a name", "Shadow", { defaultValue: name })
    .dropdown("Pick a color", COLORS.map((c) => c.name), { defaultValueIndex: color });
  form.show(player).then((res) => {
    if (!pet.isValid) return;
    if (res.canceled) {
      if (res.cancelationReason === FormCancelationReason.UserBusy && tries < 5) system.runTimeout(() => nameForm(player, pet, name, color, tries + 1), 40);
      return;
    }
    const [typed, picked] = res.formValues ?? [];
    const clean = String(typed ?? "").replace(/§./g, "").trim().slice(0, 20);
    if (clean) pet.nameTag = clean;
    if (typeof picked === "number") pet.setProperty("bender:color", picked);
    player.sendMessage(`§d${pet.nameTag}§r follows you everywhere. Feed it meat or fish to help it grow up, then ride it!`);
    player.sendMessage("§7Tap the Dragon Whistle to call your dragon. Sneak and tap to make it stay.");
  }).catch(() => {});
}

system.runInterval(() => {
  for (const dimensionId of DIMENSIONS) {
    let eggs = [];
    try {
      eggs = world.getDimension(dimensionId).getEntities({ type: EGG_ENTITY_ID });
    } catch {
      eggs = [];
    }
    for (const egg of eggs) {
      const left = Number(egg.getDynamicProperty("bender:hatch_left") ?? PET.hatchTicks) - 10;
      if (left <= 0) {
        hatch(egg);
        continue;
      }
      egg.setDynamicProperty("bender:hatch_left", left);
      if (left <= 100) {
        try {
          if (egg.getProperty("bender:hatching") !== 1) egg.setProperty("bender:hatching", 1);
        } catch {
          // The wobble is a bonus.
        }
        particle(egg.dimension, "bender:crystal_beam", { x: egg.location.x, y: egg.location.y + 0.6, z: egg.location.z });
        if (left % 40 === 0) sound(egg, "random.pop", 0.6, 0.6);
      }
    }
  }
}, 10);

// ------------------------------------------------------------ pet dragons

function petsOf(player) {
  const out = [];
  for (const dimensionId of DIMENSIONS) {
    try {
      for (const pet of world.getDimension(dimensionId).getEntities({ type: PET_ID })) {
        if (pet.getDynamicProperty("bender:owner") === player.id) out.push(pet);
      }
    } catch {
      // Skip that dimension.
    }
  }
  return out;
}

function stageOf(pet) {
  try {
    return Number(pet.getProperty("bender:stage")) || 0;
  } catch {
    return 0;
  }
}

function petSize(pet) {
  return PET.stages[stageOf(pet)]?.scale ?? PET.stages[0].scale;
}

function bringNear(pet, owner) {
  const r = (owner.getRotation().y * Math.PI) / 180;
  const spot = { x: owner.location.x + Math.sin(r) * 2.5, y: owner.location.y + 1.5, z: owner.location.z - Math.cos(r) * 2.5 };
  try {
    pet.teleport(spot, { dimension: owner.dimension, keepVelocity: false });
  } catch {
    // It'll catch up.
  }
}

function petFireball(pet, from, to) {
  fireballs.push({ dim: pet.dimension, ...launchFireball(from, to, 0.9), from: "pet", damage: PET_FIREBALL_DAMAGE, source: pet });
  sound(pet, "mob.blaze.shoot", 1, 1.3);
}

function steerPet(pet, tick) {
  const stage = stageOf(pet);
  let rider;
  if (stage >= 2) {
    try {
      rider = pet.getComponent("minecraft:rideable")?.getRiders().find((r) => r.typeId === "minecraft:player");
    } catch {
      rider = undefined;
    }
  }
  let vel;
  let yaw = pet.getRotation().y;
  const prev = petMotion.get(pet.id) ?? { x: 0, y: 0, z: 0 };
  let onGround = false;
  try {
    onGround = pet.isOnGround;
  } catch {
    onGround = false;
  }
  if (rider) {
    riding.set(rider.id, pet.id);
    let move = { x: 0, y: 0 };
    let jump = false;
    try {
      move = rider.inputInfo.getMovementVector();
      jump = rider.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    } catch {
      // Controls unavailable this tick.
    }
    vel = rideVelocity(move, jump, false, rider.getViewDirection(), onGround);
    yaw = rider.getRotation().y;
    if (tick % 100 === 50) actionBar(rider, "§7Look where you want to go and walk forward. Jump to fly up. Sneak to get off.");
  } else {
    const mode = pet.getDynamicProperty("bender:mode");
    const ownerId = pet.getDynamicProperty("bender:owner");
    const owner = mode === "follow" ? world.getAllPlayers().find((p) => p.id === ownerId) : undefined;
    if (owner && owner.dimension.id === pet.dimension.id) {
      if (distance(owner.location, pet.location) > PET.teleportFrom) {
        bringNear(pet, owner);
        vel = { x: 0, y: 0, z: 0 };
      } else {
        vel = followVelocity(pet.location, prev, owner.location, owner.getRotation().y);
        yaw = Math.hypot(vel.x, vel.z) > 0.04 ? yawOf(vel, yaw) : owner.getRotation().y;
      }
      // grown dragons help fight monsters near their owner
      if (stage >= 1 && tick % 60 === 0) {
        const foe = enemiesNear(owner.dimension, owner.location, 12).sort((a, b) => distance(a.location, pet.location) - distance(b.location, pet.location))[0];
        if (foe) {
          const from = mouthOf(pet.location, yawOf({ x: foe.location.x - pet.location.x, y: 0, z: foe.location.z - pet.location.z }, yaw), petSize(pet));
          petFireball(pet, from, { x: foe.location.x, y: foe.location.y + 1, z: foe.location.z });
        }
      }
    } else {
      vel = settleVelocity(onGround);
    }
  }
  petMotion.set(pet.id, vel);
  try {
    pet.clearVelocity();
    pet.applyImpulse(vel);
    pet.setRotation({ x: 0, y: yaw });
  } catch {
    // Try again next tick.
  }
  const pose = onGround && Math.hypot(vel.x, vel.y, vel.z) < 0.05 ? 1 : 0;
  try {
    if (pet.getProperty("bender:pose") !== pose) pet.setProperty("bender:pose", pose);
  } catch {
    // Not important.
  }
  if (pose === 0 && tick % 40 === 0) sound(pet, "mob.enderdragon.flap", 0.4 + stage * 0.2, 1.6 - stage * 0.2);
}

system.runInterval(() => {
  const tick = system.currentTick;
  const before = new Map(riding);
  riding.clear();
  for (const dimensionId of DIMENSIONS) {
    let pets = [];
    try {
      pets = world.getDimension(dimensionId).getEntities({ type: PET_ID });
    } catch {
      pets = [];
    }
    for (const pet of pets) steerPet(pet, tick);
  }
  // float down gently after hopping off in the sky
  for (const playerId of before.keys()) {
    if (riding.has(playerId)) continue;
    const p = world.getAllPlayers().find((q) => q.id === playerId);
    if (p) addEffect(p, "slow_falling", 160);
  }
}, 1);

function feedPet(player, pet, food) {
  if (!cooled(player, "feed", 8)) return;
  const stage = stageOf(pet);
  const feeds = Number(pet.getDynamicProperty("bender:feeds") ?? 0);
  const r = feed(stage, feeds);
  for (let i = 0; i < 5; i++) {
    particle(pet.dimension, "minecraft:heart_particle", {
      x: pet.location.x + (Math.random() - 0.5),
      y: pet.location.y + 0.5 + Math.random() * (stage + 1) * 0.4,
      z: pet.location.z + (Math.random() - 0.5),
    });
  }
  sound(pet, "random.burp", 1, 1.4 - stage * 0.2);
  if (r.full) {
    actionBar(player, `§d${pet.nameTag || "Your dragon"}§r is full and happy!`);
    return;
  }
  useUpHeld(player, food);
  pet.setDynamicProperty("bender:feeds", r.feeds);
  if (!r.grew) {
    const left = PET.stages[stage].feeds - r.feeds;
    actionBar(player, `§aYum!§r ${left} more to grow bigger.`);
    return;
  }
  try {
    pet.triggerEvent(r.stage === 1 ? "bender:grow_young" : "bender:grow_adult");
  } catch {
    // Try again next feeding.
  }
  particle(pet.dimension, "minecraft:totem_particle", { x: pet.location.x, y: pet.location.y + 1, z: pet.location.z });
  sound(pet, "mob.enderdragon.growl", 1, 1.6 - r.stage * 0.3);
  if (r.stage === 2) {
    title(player, `§d${pet.nameTag || "Your dragon"} is all grown up!`, "Tap it to climb on and fly!");
  } else {
    title(player, `§d${pet.nameTag || "Your dragon"} grew bigger!`, "Feed it a few more times to grow it up.");
  }
}

function useWhistle(player) {
  if (!cooled(player, "whistle", 10)) return;
  let mount;
  try {
    mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  } catch {
    mount = undefined;
  }
  if (mount?.typeId === PET_ID) {
    const dir = player.getViewDirection();
    const head = player.getHeadLocation();
    let to = { x: head.x + dir.x * 40, y: head.y + dir.y * 40, z: head.z + dir.z * 40 };
    try {
      const hit = player.getEntitiesFromViewDirection({ maxDistance: 40 }).find((h) => h.entity.id !== mount.id && h.entity.typeId !== "minecraft:player");
      if (hit) to = { x: hit.entity.location.x, y: hit.entity.location.y + 1, z: hit.entity.location.z };
    } catch {
      // Fire straight ahead.
    }
    petFireball(mount, mouthOf(mount.location, player.getRotation().y, petSize(mount)), to);
    return;
  }
  const pets = petsOf(player);
  if (!pets.length) {
    actionBar(player, "You don't have a dragon yet. Beat the Ender Dragon to win an egg!");
    return;
  }
  sound(player, "note.flute", 1, 1.4);
  if (player.isSneaking) {
    for (const pet of pets) pet.setDynamicProperty("bender:mode", "stay");
    actionBar(player, `§e${pets.length === 1 ? pets[0].nameTag : "Your dragons"} will stay here.`);
    return;
  }
  for (const pet of pets) {
    pet.setDynamicProperty("bender:mode", "follow");
    if (pet.dimension.id !== player.dimension.id || distance(pet.location, player.location) > PET.teleportFrom) bringNear(pet, player);
  }
  actionBar(player, `§d${pets.length === 1 ? pets[0].nameTag : "Your dragons"} ${pets.length === 1 ? "is" : "are"} coming!`);
}

// ------------------------------------------------------------ hitting things

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;
  if (hitEntity.typeId === PET_ID) {
    const held = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (held && PET_FOODS.has(held.typeId)) system.run(() => feedPet(player, hitEntity, held.typeId));
    else if (stageOf(hitEntity) < 2) actionBar(player, `Feed §d${hitEntity.nameTag || "your dragon"}§r meat or fish to help it grow!`);
    return;
  }
  if (hitEntity.typeId === EGG_ENTITY_ID && player.isSneaking) {
    // crouch and hit an egg 3 times to pick it back up
    const now = system.currentTick;
    const last = eggHits.get(hitEntity.id);
    const count = last && now - last.tick < 40 ? last.count + 1 : 1;
    eggHits.set(hitEntity.id, { count, tick: now });
    if (count < 3) {
      actionBar(player, `Keep crouching and hit it ${3 - count} more time${count === 2 ? "" : "s"} to pick the egg up`);
      return;
    }
    eggHits.delete(hitEntity.id);
    const egg = hitEntity;
    system.run(() => {
      if (!egg.isValid) return;
      egg.remove();
      giveOrDrop(player, new ItemStack(EGG_ITEM, 1));
      sound(player, "random.pop", 1, 1);
    });
  }
});

// ------------------------------------------------------------ custom item and block parts

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:arena_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useKit(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:egg", {
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const { block, blockFace } = event;
      system.run(() => placeEgg(player, block, blockFace));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:whistle", {
    onUse(event) {
      const player = event.source;
      system.run(() => useWhistle(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:altar", {
    onPlayerInteract(event) {
      const { player, block } = event;
      if (!player) return;
      system.run(() => useAltar(player, block));
    },
  });
});

// ------------------------------------------------------------ descriptions and gifts

const LORE = {
  [KIT_ID]: ["§eTap Build Arena! on open land", "§7Then tap the altar to call the Ender Dragon", "§7Sneak + tap to undo your last arena"],
  [EGG_ITEM]: ["§eTap the ground to put it down", "§7It hatches into a baby dragon!"],
  [WHISTLE_ID]: ["§eTap: call your dragons", "§7Sneak + tap: tell them to stay", "§7While riding: shoot a fireball"],
};

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.getLore().length > 0) continue;
      const lore = LORE[item.typeId];
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

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:dragons_welcomed")) return;
  player.setDynamicProperty("bender:dragons_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    for (const id of [KIT_ID, WHISTLE_ID]) {
      const item = new ItemStack(id, 1);
      item.setLore(LORE[id]);
      giveOrDrop(player, item);
    }
    player.sendMessage("§dBender Dragons is on!§r You got a §5Dragon Arena Kit§r and a §6Dragon Whistle§r.");
    player.sendMessage("§7Build the arena on open land, tap the altar, and fight the Ender Dragon to win a dragon egg!");
  }, 60);
});
