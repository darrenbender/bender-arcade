// Bender Mechs: a giant mech, a motorcycle, helper bots, sliding doors,
// and a Base Kit that builds a whole mech base.
//
// Walking and driving are done by Minecraft itself (like riding a horse).
// This script adds the extras: power punches, rocket-jump flames, the
// blaster and horn, the paint shop, packing vehicles away, the doors,
// and the base builder.

import {
  system,
  world,
  BlockPermutation,
  BlockVolume,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  ItemStack,
  MolangVariableMap,
  StructureSaveMode,
} from "@minecraft/server";
import { FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { BOT_ID, BOT_KIT, BOT_NAMES, COLORS, KIT_TO_VEHICLE, VEHICLES, cleanPaint, paintText } from "./vehicles.js";
import { BASE_SIZE, planBase } from "./base.js";

const TITAN = "bender:titan_mech";
const BIKE = "bender:motorcycle";
const CONTROLLER = "bender:mech_controller";
const BASE_KIT = "bender:base_kit";
const DOOR = "bender:sliding_door";
const PAINT_KEY = "bender:paint";
const DEG = Math.PI / 180;

const ridingNow = new Map(); // player id -> vehicle id
const rising = new Map(); // titan id -> was it rocketing up last check?
const packHits = new Map(); // entity id -> { count, tick }
const lastPlaced = new Map(); // player id -> tick
const lastShot = new Map(); // player id -> tick

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

function aboveFace(block, face) {
  const o = { Up: [0, 1, 0], Down: [0, -2, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  return { x: block.x + 0.5 + o[0], y: block.y + o[1], z: block.z + 0.5 + o[2] };
}

function ridersOf(vehicle) {
  try {
    return vehicle.getComponent("minecraft:rideable")?.getRiders() ?? [];
  } catch {
    return [];
  }
}

function pilotOf(vehicle) {
  return ridersOf(vehicle).find((r) => r.typeId === "minecraft:player");
}

function vehicleUnder(player) {
  try {
    const on = player.getComponent("minecraft:riding")?.entityRidingOn;
    return on && VEHICLES[on.typeId] ? on : undefined;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------ paint

function readPaint(vehicle) {
  const fallback = VEHICLES[vehicle.typeId].paint;
  try {
    return cleanPaint({ body: vehicle.getProperty("bender:body"), accent: vehicle.getProperty("bender:accent") }, fallback);
  } catch {
    return { ...fallback };
  }
}

function applyPaint(vehicle, paint) {
  try {
    vehicle.setProperty("bender:body", paint.body);
    vehicle.setProperty("bender:accent", paint.accent);
  } catch {
    // The vehicle may have just been packed up.
  }
}

function kitPaint(item, vehicleId) {
  const fallback = VEHICLES[vehicleId].paint;
  try {
    const raw = item.getDynamicProperty(PAINT_KEY);
    return typeof raw === "string" ? cleanPaint(JSON.parse(raw), fallback) : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function kitLore(paint) {
  return [`§7${paintText(paint)}`, "§eTap the ground to put it down"];
}

function makeKit(vehicleId, paint) {
  const kit = new ItemStack(VEHICLES[vehicleId].kit, 1);
  kit.setDynamicProperty(PAINT_KEY, JSON.stringify(paint));
  kit.setLore(kitLore(paint));
  return kit;
}

// ------------------------------------------------------------ getting in and out

function applyCamera(player) {
  try {
    if (player.getDynamicProperty("bender:cockpit") === true) player.camera.clear();
    else player.camera.setCamera("minecraft:third_person");
  } catch {
    // Camera control isn't available; normal view is fine.
  }
}

function boarded(player, vehicle) {
  applyCamera(player);
  const pilot = pilotOf(vehicle)?.id === player.id;
  if (vehicle.typeId === TITAN) {
    actionBar(player, pilot
      ? "§cTitan Mech!§r Hold Jump to rocket jump. Hit monsters to power punch. Controller = blaster!"
      : "§cTitan Mech!§r Sneak to get out.");
    sound(vehicle, "mob.irongolem.repair", 0.8, 0.7);
  } else {
    actionBar(player, pilot ? "§9Motorcycle!§r Hold Jump to hop. Tap the Controller to honk!" : "§9Hang on tight!§r Sneak to get off.");
    sound(vehicle, "random.door_close", 0.6, 1.4);
  }
}

function leftVehicle(player) {
  try {
    player.camera.clear();
  } catch {
    // Camera control isn't available.
  }
}

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const vehicle = vehicleUnder(player);
    const before = ridingNow.get(player.id);
    if (vehicle && before !== vehicle.id) {
      ridingNow.set(player.id, vehicle.id);
      boarded(player, vehicle);
    } else if (!vehicle && before) {
      ridingNow.delete(player.id);
      leftVehicle(player);
    }
    if (!vehicle || vehicle.typeId !== TITAN) continue;

    // The mech's armor protects its pilot.
    if (tick % 20 === 0) addEffect(player, "resistance", 40, 2);

    // Rocket flames while the mech is jumping up.
    if (tick % 2 === 0 && pilotOf(vehicle)?.id === player.id) {
      let up = 0;
      try {
        up = vehicle.getVelocity().y;
      } catch {
        up = 0;
      }
      const isRising = up > 0.12;
      if (isRising) {
        const yaw = vehicle.getRotation().y * DEG;
        const back = { x: Math.sin(yaw) * 0.7, z: -Math.cos(yaw) * 0.7 };
        const side = { x: -Math.cos(yaw) * 0.3, z: -Math.sin(yaw) * 0.3 };
        for (const s of [1, -1]) {
          particle(vehicle.dimension, "minecraft:basic_flame_particle", {
            x: vehicle.location.x + back.x + side.x * s,
            y: vehicle.location.y + 1.5,
            z: vehicle.location.z + back.z + side.z * s,
          });
        }
        if (!rising.get(vehicle.id)) sound(vehicle, "mob.blaze.shoot", 0.7, 0.6);
      }
      rising.set(vehicle.id, isRising);
    }
  }
}, 1);

// ------------------------------------------------------------ putting things down

function placeVehicle(player, item, block, face) {
  const vehicleId = KIT_TO_VEHICLE[item.typeId];
  if (!vehicleId) return;
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);
  let vehicle;
  try {
    vehicle = player.dimension.spawnEntity(vehicleId, aboveFace(block, face));
  } catch {
    actionBar(player, "There's no room for that here.");
    return;
  }
  vehicle.setRotation({ x: 0, y: player.getRotation().y });
  applyPaint(vehicle, kitPaint(item, vehicleId));
  sound(vehicle, "random.anvil_use", 0.4, 1.6);
  actionBar(player, `§aYour ${VEHICLES[vehicleId].name} is ready!§r Tap it to climb on.`);
  useUpHeld(player, item.typeId);
}

function spawnBot(player, location, tag) {
  let bot;
  try {
    bot = player.dimension.spawnEntity(BOT_ID, location);
  } catch {
    return undefined;
  }
  try {
    bot.getComponent("minecraft:tameable")?.tame(player);
  } catch {
    // An untamed bot still fights monsters.
  }
  bot.nameTag = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  if (tag) bot.addTag(tag);
  return bot;
}

function placeBot(player, block, face) {
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);
  const bot = spawnBot(player, aboveFace(block, face));
  if (!bot) {
    actionBar(player, "There's no room for a bot here.");
    return;
  }
  sound(bot, "random.orb", 0.8, 1.6);
  for (let i = 0; i < 8; i++) {
    particle(bot.dimension, "minecraft:villager_happy", {
      x: bot.location.x + (Math.random() - 0.5),
      y: bot.location.y + Math.random() * 1.5,
      z: bot.location.z + (Math.random() - 0.5),
    });
  }
  actionBar(player, `§a${bot.nameTag} is ready to help!§r It follows you and fights monsters.`);
  useUpHeld(player, BOT_KIT);
}

// ------------------------------------------------------------ hitting things

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;

  // Packing up: hit a vehicle three times, or sneak-hit a bot three times.
  const isVehicle = !!VEHICLES[hitEntity.typeId];
  const isBot = hitEntity.typeId === BOT_ID;
  if (isVehicle || isBot) {
    if (isVehicle && ridingNow.get(player.id) === hitEntity.id) return;
    if (isBot && !player.isSneaking) return;
    const now = system.currentTick;
    const last = packHits.get(hitEntity.id);
    const count = last && now - last.tick < 40 ? last.count + 1 : 1;
    packHits.set(hitEntity.id, { count, tick: now });
    if (count < 3) {
      const left = 3 - count;
      actionBar(player, `Hit it ${left} more time${left === 1 ? "" : "s"} to pack it up`);
      sound(hitEntity, "random.click", 0.6, 1.2);
      return;
    }
    packHits.delete(hitEntity.id);
    system.run(() => packUp(player, hitEntity));
    return;
  }

  // Power punch from inside the Titan Mech.
  const mechId = ridingNow.get(player.id);
  const mech = mechId ? world.getEntity(mechId) : undefined;
  if (mech?.typeId !== TITAN || hitEntity.typeId === "minecraft:player") return;
  const target = hitEntity;
  system.run(() => {
    if (!target.isValid) return;
    const dx = target.location.x - player.location.x;
    const dz = target.location.z - player.location.z;
    const len = Math.hypot(dx, dz) || 1;
    try {
      target.applyKnockback({ x: (dx / len) * 2.2, z: (dz / len) * 2.2 }, 0.6);
    } catch {
      // Some things can't be knocked back.
    }
    particle(target.dimension, "minecraft:critical_hit_emitter", target.location);
    sound(target, "mob.irongolem.throw", 1, 0.8);
  });
  // Extra damage lands once the first hit's protection wears off.
  system.runTimeout(() => {
    if (!target.isValid || !player.isValid) return;
    try {
      target.applyDamage(6, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
    } catch {
      // Couldn't be hurt.
    }
  }, 10);
});

function packUp(player, entity) {
  if (!entity.isValid) return;
  const location = entity.location;
  const dimension = entity.dimension;
  let item;
  if (entity.typeId === BOT_ID) {
    item = new ItemStack(BOT_KIT, 1);
  } else {
    item = makeKit(entity.typeId, readPaint(entity));
  }
  const name = entity.typeId === BOT_ID ? entity.nameTag || "your bot" : `the ${VEHICLES[entity.typeId].name}`;
  entity.remove();
  const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(item) : item;
  if (leftover) dimension.spawnItem(leftover, location);
  sound(player, "random.pop", 1, 1);
  actionBar(player, `§aPacked up ${name}!`);
}

// ------------------------------------------------------------ the controller

function fireBlaster(player, mech) {
  const now = system.currentTick;
  if (now - (lastShot.get(player.id) ?? -100) < 12) return;
  lastShot.set(player.id, now);

  const yaw = mech.getRotation().y * DEG;
  const right = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
  const from = { x: mech.location.x + right.x * 0.85, y: mech.location.y + 2.8, z: mech.location.z + right.z * 0.85 };
  const head = player.getHeadLocation();
  const dir = player.getViewDirection();

  let target;
  try {
    target = player
      .getEntitiesFromViewDirection({ maxDistance: 40 })
      .filter((h) => hasFamily(h.entity, "monster"))
      .sort((a, b) => a.distance - b.distance)[0]?.entity;
  } catch {
    target = undefined;
  }
  let to;
  if (target) {
    to = { x: target.location.x, y: target.location.y + 1, z: target.location.z };
    try {
      target.applyDamage(10, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
      target.applyKnockback({ x: dir.x * 1.2, z: dir.z * 1.2 }, 0.3);
    } catch {
      // Couldn't be hurt.
    }
    particle(target.dimension, "minecraft:critical_hit_emitter", to);
  } else {
    let dist = 40;
    try {
      const hit = player.getBlockFromViewDirection({ maxDistance: 40 });
      if (hit) dist = Math.hypot(hit.block.x + 0.5 - head.x, hit.block.y + 0.5 - head.y, hit.block.z + 0.5 - head.z);
    } catch {
      dist = 40;
    }
    to = { x: head.x + dir.x * dist, y: head.y + dir.y * dist, z: head.z + dir.z * dist };
  }

  // Draw the beam.
  const steps = Math.min(80, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(steps, 1);
    const vars = new MolangVariableMap();
    vars.setColorRGB("variable.color", { red: 0.35, green: 0.9, blue: 1 });
    vars.setFloat("variable.size", 0.25);
    particle(mech.dimension, "bender:mech_zap", {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    }, vars);
  }
  sound(mech, "mob.shulker.shoot", 1, 1.4);
  if (!target) actionBar(player, "§7Pew! (The blaster only hits monsters.)");
}

function honk(player, bike) {
  const now = system.currentTick;
  if (now - (lastShot.get(player.id) ?? -100) < 10) return;
  lastShot.set(player.id, now);
  sound(bike, "note.bit", 1, 1.2);
  system.runTimeout(() => {
    if (bike.isValid) sound(bike, "note.bit", 1, 1.2);
  }, 4);
  actionBar(player, "§eBeep beep!");
}

async function openPaintShop(player, retry = true) {
  let vehicle;
  try {
    vehicle = player.getEntitiesFromViewDirection({ maxDistance: 8 }).find((h) => VEHICLES[h.entity.typeId])?.entity;
  } catch {
    vehicle = undefined;
  }
  if (!vehicle) {
    actionBar(player, "Look at a mech or motorcycle, then tap Go! to paint it.");
    return;
  }
  const spec = VEHICLES[vehicle.typeId];
  const paint = readPaint(vehicle);
  const form = new ModalFormData()
    .title(`Paint Shop: ${spec.name}`)
    .dropdown("Main color", COLORS, { defaultValueIndex: paint.body })
    .dropdown("Trim color", COLORS, { defaultValueIndex: paint.accent })
    .toggle("Surprise me! (random colors)", { defaultValue: false })
    .toggle("Cockpit view when riding", { defaultValue: player.getDynamicProperty("bender:cockpit") === true })
    .submitButton("Paint it!");
  let response;
  try {
    response = await form.show(player);
  } catch {
    return;
  }
  if (response.canceled) {
    if (retry && response.cancelationReason === FormCancelationReason.UserBusy) {
      system.runTimeout(() => openPaintShop(player, false), 20);
    }
    return;
  }
  if (!vehicle.isValid || !response.formValues) return;
  const [body, accent, surprise, cockpit] = response.formValues;
  const next = surprise
    ? { body: Math.floor(Math.random() * 16), accent: Math.floor(Math.random() * 16) }
    : cleanPaint({ body, accent }, paint);
  applyPaint(vehicle, next);
  player.setDynamicProperty("bender:cockpit", cockpit === true);
  for (let i = 0; i < 10; i++) {
    particle(vehicle.dimension, "minecraft:villager_happy", {
      x: vehicle.location.x + (Math.random() - 0.5) * 2,
      y: vehicle.location.y + Math.random() * 2.5,
      z: vehicle.location.z + (Math.random() - 0.5) * 2,
    });
  }
  sound(vehicle, "random.levelup", 0.6, 1.4);
  actionBar(player, `§aFresh paint!§r ${paintText(next)}`);
}

function useController(player) {
  const vehicle = vehicleUnder(player);
  if (vehicle?.typeId === TITAN && pilotOf(vehicle)?.id === player.id) fireBlaster(player, vehicle);
  else if (vehicle?.typeId === BIKE) honk(player, vehicle);
  else openPaintShop(player);
}

// ------------------------------------------------------------ sliding doors

function doorOnTick(block) {
  let near = false;
  try {
    near = block.dimension.getPlayers({ location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, maxDistance: 3 }).length > 0;
  } catch {
    return;
  }
  /** @type {any} */
  const perm = block.permutation;
  const open = perm.getState("bender:open") === true;
  if (near === open) return;
  try {
    block.setPermutation(perm.withState("bender:open", near));
  } catch {
    return;
  }
  // only the bottom door of a stack makes the whoosh, so a tall door isn't noisy
  let below;
  try {
    below = block.below();
  } catch {
    below = undefined;
  }
  if (below?.typeId !== DOOR) {
    try {
      block.dimension.playSound(near ? "random.door_open" : "random.door_close", block.location, { volume: 0.6, pitch: 1.6 });
    } catch {
      // Missing sound.
    }
  }
}

// ------------------------------------------------------------ the base builder

const BASE_CLEAR = 32;
const BASE_FOUNDATION = 8;
const CONFIRM_TICKS = 20 * 20;
const LOOSE = ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];
const COVER =
  /(_leaves|_log|_wood|_stem|grass$|fern|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|bush|vine|snow_layer|sapling|mushroom|bamboo|reeds|sugar_cane|cactus|petals|leaf_litter|wildflowers|moss_carpet|azalea|propagule|cocoa|pumpkin|melon|torchflower|pitcher|dripleaf|hanging_moss|eyeblossom)/;

const pendingBase = new Map();
const pendingUndo = new Map();
let building = false;

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

function surveyBase(player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld") return { error: "Bases can only be built in the Overworld." };
  const half = Math.floor(BASE_SIZE / 2);
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - half;
  const z0 = cz - half;
  const heights = [];
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < BASE_SIZE; dx += 3) {
    for (let dz = 0; dz < BASE_SIZE; dz += 3) {
      let ground;
      try {
        const top = dimension.getTopmostBlock({ x: x0 + dx, z: z0 + dz });
        ground = top;
        for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
      } catch {
        ground = undefined;
      }
      if (!ground) return { error: "Stand in the middle of where you want the base, then try again." };
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
  if (floorY - BASE_FOUNDATION < range.min || floorY + BASE_CLEAR >= range.max) return { error: "Too high or too low to build here." };
  return { dimension, x0, z0, floorY, cx, cz };
}

function playersInside(site) {
  return world.getAllPlayers().filter((p) => {
    const { x, z } = p.location;
    return p.dimension.id === site.dimension.id && x >= site.x0 - 1 && x <= site.x0 + BASE_SIZE + 1 && z >= site.z0 - 1 && z <= site.z0 + BASE_SIZE + 1;
  });
}

function showBaseOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBase.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    const last = BASE_SIZE - 1;
    for (let a = 0; a <= last; a++) {
      for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
        particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + x + 0.5, y: site.floorY + 1.3, z: site.z0 + z + 0.5 });
      }
    }
  }, 10);
}

function* buildBase(player, site, plan, record) {
  try {
    yield* baseSteps(site, plan);
    finishBase(player, site, plan, record);
  } finally {
    building = false;
  }
}

function* baseSteps(site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });
  for (let tx = 0; tx < BASE_SIZE; tx += 16) {
    for (let tz = 0; tz < BASE_SIZE; tz += 16) {
      const x2 = Math.min(tx + 15, BASE_SIZE - 1);
      const z2 = Math.min(tz + 15, BASE_SIZE - 1);
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 1, tz), at(x2, BASE_CLEAR, z2)), "minecraft:air");
      } catch {
        // Keep going.
      }
      yield;
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, -BASE_FOUNDATION, tz), at(x2, -1, z2)), "minecraft:dirt", { blockFilter: { includeTypes: LOOSE } });
        dimension.fillBlocks(new BlockVolume(at(tx, 0, tz), at(x2, 0, z2)), "minecraft:smooth_stone");
      } catch {
        // Keep going.
      }
      yield;
    }
  }
  const v = plan.viewpoint;
  for (const p of playersInside(site)) {
    try {
      p.teleport({ x: x0 + v.x + 0.5, y: F + v.y, z: z0 + v.z + 0.5 }, { rotation: { x: 0, y: 180 } });
    } catch {
      // They'll be fine where they are.
    }
  }
  for (let i = 0; i < plan.ops.length; i++) {
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
    if (!firstHalf && i % 48 === 47) yield;
  }
}

function finishBase(player, site, plan, record) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (p) => ({ x: x0 + p.x, y: F + p.y, z: z0 + p.z });
  try {
    const mech = dimension.spawnEntity(TITAN, at(plan.spawns.mech));
    mech.setRotation({ x: 0, y: 0 });
    mech.addTag(record.tag);
    const bike = dimension.spawnEntity(BIKE, at(plan.spawns.bike));
    bike.setRotation({ x: 0, y: 0 });
    bike.addTag(record.tag);
  } catch {
    // The base still works without them.
  }
  if (player.isValid) spawnBot(player, at(plan.spawns.bot), record.tag);
  system.runTimeout(() => {
    try {
      dimension.getBlock(at(plan.sign))?.getComponent("minecraft:sign")?.setText("Bender\nMech Base\n\nAuthorized\npilots only!");
    } catch {
      // A blank sign is fine.
    }
  }, 10);
  if (player.isValid) {
    try {
      player.onScreenDisplay.setTitle("§bMech Base", { subtitle: "Your base is ready!", fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 20 });
    } catch {
      // Titles are a bonus.
    }
    sound(player, "random.levelup", 1, 1);
    player.sendMessage("§aYour mech base is ready!§r The doors slide open when you walk up. Sneak and tap the Base Kit twice to undo it.");
  }
}

function startBase(player, site) {
  const plan = planBase();
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const record = {
    id: `benderbase:b${seed.toString(36)}`,
    tag: `bender_base_${seed.toString(36)}`,
    dim: site.dimension.id,
    x: site.x0,
    y: site.floorY - BASE_FOUNDATION,
    z: site.z0,
  };
  try {
    world.structureManager.createFromWorld(
      record.id,
      site.dimension,
      { x: record.x, y: record.y, z: record.z },
      { x: site.x0 + BASE_SIZE - 1, y: site.floorY + BASE_CLEAR, z: site.z0 + BASE_SIZE - 1 },
      { includeEntities: false, saveMode: StructureSaveMode.World }
    );
  } catch {
    actionBar(player, "Couldn't get the land ready. Move a little and try again.");
    return;
  }
  const old = player.getDynamicProperty("bender:last_base");
  if (typeof old === "string") {
    try {
      world.structureManager.delete(JSON.parse(old).id);
    } catch {
      // Already gone.
    }
  }
  player.setDynamicProperty("bender:last_base", JSON.stringify(record));
  for (const p of playersInside(site)) {
    addEffect(p, "resistance", 300, 4);
    addEffect(p, "slow_falling", 300);
  }
  building = true;
  actionBar(player, "§eBuilding your mech base...");
  system.runJob(buildBase(player, site, plan, record));
}

function undoBase(player) {
  const raw = player.getDynamicProperty("bender:last_base");
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a base to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = world.getDimension(record.dim);
  const cx = record.x + BASE_SIZE / 2;
  const cz = record.z + BASE_SIZE / 2;
  if (player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 40) {
    actionBar(player, "Go back to your base to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the base. Stand in the middle of it and try again.");
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
  player.setDynamicProperty("bender:last_base", undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe base is gone and the land is back the way it was.");
}

function useBaseKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBase.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undoBase(player);
    } else if (typeof player.getDynamicProperty("bender:last_base") === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last base?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a base to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, a base is still being built!");
    return;
  }
  const waiting = pendingBase.get(player.id);
  if (waiting && now <= waiting.expires && now - waiting.tick > 10 && Math.hypot(player.location.x - waiting.cx, player.location.z - waiting.cz) <= 8) {
    pendingBase.delete(player.id);
    startBase(player, waiting);
    return;
  }
  const site = surveyBase(player);
  if (site.error) {
    actionBar(player, site.error);
    return;
  }
  site.tick = now;
  site.expires = now + CONFIRM_TICKS;
  pendingBase.set(player.id, site);
  showBaseOutline(player, site);
  sound(player, "random.orb", 1, 1);
  player.sendMessage("§eYour mech base will fill the sparkly square.§r Everything inside gets replaced.");
  actionBar(player, "§aTap Build Base! again to build here.");
}

// ------------------------------------------------------------ registering items and blocks

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:vehicle_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const { itemStack, block, blockFace } = event;
      system.run(() => placeVehicle(player, itemStack, block, blockFace));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:bot_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const { block, blockFace } = event;
      system.run(() => placeBot(player, block, blockFace));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:mech_controller", {
    onUse(event) {
      const player = event.source;
      system.run(() => useController(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:base_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useBaseKit(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:auto_door", {
    onTick(event) {
      doorOnTick(event.block);
    },
  });
});

// ------------------------------------------------------------ descriptions and gifts

const LORE = {
  [BOT_KIT]: ["§eTap the ground to switch on your bot", "§7It follows you and fights monsters"],
  [CONTROLLER]: ["§eIn the mech: fire the blaster", "§eOn the motorcycle: honk", "§7Otherwise: look at one to paint it"],
  [BASE_KIT]: ["§eTap Build Base! on open land", "§7Sneak + tap to undo your last base"],
};

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.getLore().length > 0) continue;
      const vehicleId = KIT_TO_VEHICLE[item.typeId];
      const lore = vehicleId ? kitLore(kitPaint(item, vehicleId)) : LORE[item.typeId];
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
  if (player.getDynamicProperty("bender:mechs_welcomed")) return;
  player.setDynamicProperty("bender:mechs_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const container = player.getComponent("minecraft:inventory")?.container;
    const gifts = [makeKit(TITAN, VEHICLES[TITAN].paint), makeKit(BIKE, VEHICLES[BIKE].paint)];
    for (const id of [BOT_KIT, CONTROLLER, BASE_KIT]) {
      const item = new ItemStack(id, 1);
      item.setLore(LORE[id]);
      gifts.push(item);
    }
    gifts.push(new ItemStack(DOOR, 8));
    for (const gift of gifts) {
      const leftover = container?.addItem(gift);
      if (leftover) player.dimension.spawnItem(leftover, player.location);
    }
    player.sendMessage("§aBender Mechs is on!§r You got a §cTitan Mech§r, a §9Motorcycle§r, a §fHelper Bot§r, a §eController§r, a §bBase Kit§r and 8 Sliding Doors.");
    player.sendMessage("§7Tap the ground with a kit to put it down. Try the Base Kit on open land!");
  }, 60);
});
