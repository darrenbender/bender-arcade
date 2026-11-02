// Bender Air: fly planes, paint them, pack them up again.
//
// Flying: the pilot looks where they want to go. Forward on the joystick
// speeds up, back slows down, and Jump does the plane's special move.
// The flight maths lives in planes.js; this file connects it to Minecraft.

import { system, world, ButtonState, EquipmentSlot, GameMode, InputButton, ItemStack, MolangVariableMap } from "@minecraft/server";
import { FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { COLORS, DECALS, KIT_TO_PLANE, PLANES, flyStep, newFlight, paintText } from "./planes.js";

const BRUSH_ID = "bender:paint_brush";
const PAINT_KEY = "bender:paint"; // where a kit remembers its plane's paint
const DEG = Math.PI / 180;

// Smoke colors to match each paint color (0..1).
const RGB = [
  [0.84, 0.23, 0.23], [0.94, 0.54, 0.17], [0.95, 0.82, 0.23], [0.49, 0.83, 0.25],
  [0.18, 0.62, 0.27], [0.12, 0.65, 0.63], [0.36, 0.78, 0.94], [0.18, 0.37, 0.82],
  [0.54, 0.27, 0.79], [0.94, 0.5, 0.72], [0.95, 0.95, 0.95], [0.72, 0.75, 0.78],
  [0.42, 0.45, 0.5], [0.16, 0.16, 0.18], [0.54, 0.35, 0.2], [0.88, 0.7, 0.23],
];

const flights = new Map(); // plane entity id -> flight record
const ridingNow = new Map(); // player id -> id of the plane they're in
const packHits = new Map(); // plane id -> { count, tick }
const lastPlaced = new Map(); // player id -> tick (stops double placing)

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
    // Skip a puff that can't spawn.
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

function signedYaw(yaw) {
  return yaw > 180 ? yaw - 360 : yaw;
}

function forward(yaw) {
  return { x: -Math.sin(yaw * DEG), z: Math.cos(yaw * DEG) };
}

// ------------------------------------------------------------ paint

function clampInt(v, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
}

function cleanPaint(p, fallback) {
  return {
    body: clampInt(p?.body, 15, fallback.body),
    wings: clampInt(p?.wings, 15, fallback.wings),
    decal: clampInt(p?.decal, 8, fallback.decal),
  };
}

function readPaint(plane) {
  const fallback = PLANES[plane.typeId].paint;
  try {
    return cleanPaint(
      { body: plane.getProperty("bender:body"), wings: plane.getProperty("bender:wings"), decal: plane.getProperty("bender:decal") },
      fallback
    );
  } catch {
    return { ...fallback };
  }
}

function applyPaint(plane, paint) {
  try {
    plane.setProperty("bender:body", paint.body);
    plane.setProperty("bender:wings", paint.wings);
    plane.setProperty("bender:decal", paint.decal);
  } catch {
    // The plane may have just been packed up.
  }
}

function randomPaint() {
  const body = Math.floor(Math.random() * 16);
  let wings = Math.floor(Math.random() * 16);
  if (wings === body) wings = (wings + 5) % 16;
  return { body, wings, decal: Math.floor(Math.random() * 9) };
}

function kitPaint(item, planeId) {
  const fallback = PLANES[planeId].paint;
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

function makeKit(planeId, paint) {
  const kit = new ItemStack(PLANES[planeId].kit, 1);
  kit.setDynamicProperty(PAINT_KEY, JSON.stringify(paint));
  kit.setLore(kitLore(paint));
  return kit;
}

// ------------------------------------------------------------ flying

function startFlight(plane) {
  let record = flights.get(plane.id);
  if (!record) {
    record = {
      plane,
      spec: PLANES[plane.typeId],
      state: newFlight((plane.getRotation().y + 360) % 360),
      lastPos: undefined,
      idleTicks: 0,
      wasOnGround: true,
      shown: { pitch: 0, roll: 0, throttle: 0 },
    };
    flights.set(plane.id, record);
  }
  return record;
}

function pilotInput(pilot) {
  let move = { x: 0, y: 0 };
  let jump = false;
  try {
    move = pilot.inputInfo.getMovementVector();
    jump = pilot.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // Controls unavailable this tick; keep flying straight.
  }
  const rot = pilot.getRotation();
  return { pilot: true, stickX: move.x, stickY: move.y, jump, lookYaw: rot.y, lookPitch: rot.x };
}

function flyPlane(record, pilot, riders, tick) {
  const { plane, spec, state } = record;
  const loc = plane.location;
  const moved = record.lastPos
    ? Math.hypot(loc.x - record.lastPos.x, loc.y - record.lastPos.y, loc.z - record.lastPos.z)
    : state.expected;
  record.lastPos = { x: loc.x, y: loc.y, z: loc.z };

  const onGround = plane.isOnGround;
  const env = { onGround, inWater: plane.isInWater, moved };
  const { vel, events } = flyStep(spec, state, pilot ? pilotInput(pilot) : { pilot: false }, env);
  try {
    plane.clearVelocity();
    plane.applyImpulse(vel);
    plane.setRotation({ x: 0, y: signedYaw(state.yaw) });
  } catch {
    return;
  }
  showAttitude(record);
  playEvents(record, events, riders);
  trails(record, tick);

  if (pilot && record.wasOnGround && !onGround && state.speed >= spec.takeoffSpeed) {
    sound(plane, "mob.enderdragon.flap", 0.6, 1.6);
    for (const r of riders) actionBar(r, "§bWheels up! You're flying!");
  }
  record.wasOnGround = onGround;
  if (pilot && tick % 5 === 0) cockpitDisplay(record, pilot, onGround);

  // Parked and nobody aboard: stop thinking about this plane.
  if (!pilot && state.speed === 0 && onGround) {
    if (++record.idleTicks > 40) {
      flights.delete(plane.id);
      try {
        plane.setProperty("bender:throttle", 0);
      } catch {
        // Already gone.
      }
    }
  } else {
    record.idleTicks = 0;
  }
}

// Send nose angle, banking and propeller speed to the model.
function showAttitude(record) {
  const { plane, spec, state, shown } = record;
  const pitch = Math.max(-50, Math.min(50, state.pitch));
  const roll = Math.max(-40, Math.min(40, state.roll));
  const throttle = Math.max(0, Math.min(1, state.speed / spec.maxSpeed));
  try {
    if (Math.abs(pitch - shown.pitch) > 0.4) plane.setProperty("bender:pitch", (shown.pitch = Math.round(pitch * 10) / 10));
    if (Math.abs(roll - shown.roll) > 0.4) plane.setProperty("bender:roll", (shown.roll = Math.round(roll * 10) / 10));
    if (Math.abs(throttle - shown.throttle) > 0.03) plane.setProperty("bender:throttle", (shown.throttle = Math.round(throttle * 100) / 100));
  } catch {
    // Plane may have been packed up this tick.
  }
}

function playEvents(record, events, riders) {
  const { plane } = record;
  for (const e of events) {
    if (e === "bonk") {
      sound(plane, "random.anvil_land", 0.35, 1.4);
      for (let i = 0; i < 6; i++) {
        particle(plane.dimension, "minecraft:basic_smoke_particle", {
          x: plane.location.x + (Math.random() - 0.5) * 2,
          y: plane.location.y + 0.5 + Math.random(),
          z: plane.location.z + (Math.random() - 0.5) * 2,
        });
      }
      for (const r of riders) actionBar(r, "§eBonk! Turn around and try again.");
    } else if (e === "smoke_on" || e === "smoke_off") {
      sound(plane, "random.pop", 0.8, e === "smoke_on" ? 1.4 : 0.8);
      for (const r of riders) actionBar(r, e === "smoke_on" ? "§aSmoke trail ON" : "§7Smoke trail off");
    } else if (e === "chime") {
      sound(plane, "random.orb", 0.8, 1.5);
      for (const r of riders) actionBar(r, "§bDing! Welcome aboard Bender Air.");
    } else if (e === "boost") {
      sound(plane, "mob.blaze.shoot", 0.7, 0.6);
      for (const r of riders) actionBar(r, "§6Afterburner!");
    }
  }
}

function trails(record, tick) {
  const { plane, state, spec } = record;
  const loc = plane.location;
  const f = forward(state.yaw);
  const right = { x: -f.z, z: f.x };
  const at = (back, side, up) => ({
    x: loc.x - f.x * back + right.x * side,
    y: loc.y + up,
    z: loc.z - f.z * back + right.z * side,
  });
  const puff = (pos, rgb, size) => {
    const vars = new MolangVariableMap();
    vars.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
    vars.setFloat("variable.size", size);
    particle(plane.dimension, "bender:plane_trail", pos, vars);
  };
  if (state.smoke && tick % 2 === 0) {
    puff(at(2.6, 0, 0.8), RGB[readPaint(plane).body], 0.8);
  }
  if (state.boost && tick % 2 === 0) {
    puff(at(2.8, 0, 0.7), [1, 0.6, 0.2], 0.6);
  }
  // wingtip contrails when going fast
  if (!plane.isOnGround && state.speed > spec.maxSpeed * 0.85 && tick % 3 === 0) {
    const span = spec.seats === 4 ? 3.4 : 2.5;
    puff(at(0.6, span, 0.6), [1, 1, 1], 0.35);
    puff(at(0.6, -span, 0.6), [1, 1, 1], 0.35);
  }
}

function cockpitDisplay(record, pilot, onGround) {
  const { state, spec, plane } = record;
  const mph = Math.round(state.speed * 20 * 2.237);
  const bars = Math.round((state.speed / spec.boostSpeed) * 10);
  const bar = "§a" + "|".repeat(Math.min(bars, 10)) + "§8" + "|".repeat(Math.max(0, 10 - bars));
  let tip = "";
  if (onGround && state.speed < spec.takeoffSpeed) {
    tip = state.usedStick ? "  §7Speed up, then look up to take off" : "  §7Push forward to go (or hold Jump)";
  }
  actionBar(pilot, `§l${spec.name}§r  ${bar} §f${mph} mph  §bHeight ${Math.round(plane.location.y)}${tip}`);
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

function boarded(player, plane) {
  applyCamera(player);
  const riders = plane.getComponent("minecraft:rideable")?.getRiders() ?? [];
  const pilot = riders.find((r) => r.typeId === "minecraft:player");
  if (pilot?.id === player.id) {
    actionBar(player, "§aYou're the pilot!§r Look where you want to fly. Forward = faster, back = slower.");
  } else {
    actionBar(player, "§aEnjoy the flight!§r Sneak to get out.");
  }
  sound(plane, "random.door_close", 0.6, 1.2);
}

function leftPlane(player, planeId) {
  try {
    player.camera.clear();
  } catch {
    // Camera control isn't available.
  }
  const plane = world.getEntity(planeId);
  if (plane && !plane.isOnGround && !plane.isInWater) {
    addEffect(player, "slow_falling", 300);
    actionBar(player, "§bParachute open!§r Floating down...");
    sound(player, "mob.phantom.flap", 0.8, 1.2);
  }
}

// ------------------------------------------------------------ the main loop

system.runInterval(() => {
  const tick = system.currentTick;

  for (const player of world.getAllPlayers()) {
    let on;
    try {
      on = player.getComponent("minecraft:riding")?.entityRidingOn;
    } catch {
      on = undefined;
    }
    const plane = on && PLANES[on.typeId] ? on : undefined;
    const before = ridingNow.get(player.id);
    if (plane && before !== plane.id) {
      ridingNow.set(player.id, plane.id);
      startFlight(plane);
      boarded(player, plane);
    } else if (!plane && before) {
      ridingNow.delete(player.id);
      leftPlane(player, before);
    }
  }

  for (const [id, record] of flights) {
    if (!record.plane.isValid) {
      flights.delete(id);
      continue;
    }
    let riders = [];
    try {
      riders = record.plane.getComponent("minecraft:rideable")?.getRiders() ?? [];
    } catch {
      riders = [];
    }
    const pilot = riders.find((r) => r.typeId === "minecraft:player");
    flyPlane(record, pilot, riders, tick);
  }
}, 1);

// Planes left in the air (after a reload, say) glide down safely.
system.runInterval(() => {
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    let planes = [];
    try {
      planes = world.getDimension(dimensionId).getEntities({ families: ["bender_plane"] });
    } catch {
      continue;
    }
    for (const plane of planes) {
      if (!flights.has(plane.id) && !plane.isOnGround) startFlight(plane);
    }
  }
}, 40);

// ------------------------------------------------------------ kits

function placePlane(player, item, block, face) {
  const planeId = KIT_TO_PLANE[item.typeId];
  if (!planeId) return;
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);

  const offset = { Up: [0, 1, 0], Down: [0, -2, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  const location = { x: block.x + 0.5 + offset[0], y: block.y + offset[1], z: block.z + 0.5 + offset[2] };
  let plane;
  try {
    plane = player.dimension.spawnEntity(planeId, location);
  } catch {
    actionBar(player, "There's no room for a plane here.");
    return;
  }
  plane.setRotation({ x: 0, y: player.getRotation().y });
  applyPaint(plane, kitPaint(item, planeId));
  startFlight(plane);
  sound(plane, "random.anvil_use", 0.4, 1.8);
  actionBar(player, `§aYour ${PLANES[planeId].name} is ready!§r Tap it to climb in.`);

  if (!isCreative(player)) {
    const equip = player.getComponent("minecraft:equippable");
    const held = equip?.getEquipment(EquipmentSlot.Mainhand);
    if (held && held.typeId === item.typeId) equip.setEquipment(EquipmentSlot.Mainhand, undefined);
  }
}

// Hit a plane three times (from outside it) to pack it back into a kit.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity || !PLANES[hitEntity.typeId]) return;
  const player = damagingEntity;
  const plane = hitEntity;
  if (ridingNow.get(player.id) === plane.id) return;
  const now = system.currentTick;
  const last = packHits.get(plane.id);
  const count = last && now - last.tick < 40 ? last.count + 1 : 1;
  packHits.set(plane.id, { count, tick: now });
  if (count < 3) {
    const left = 3 - count;
    actionBar(player, `Hit it ${left} more time${left === 1 ? "" : "s"} to pack up the plane`);
    sound(plane, "random.click", 0.6, 1.2);
    return;
  }
  packHits.delete(plane.id);
  system.run(() => packUp(player, plane));
});

function packUp(player, plane) {
  if (!plane.isValid) return;
  const planeId = plane.typeId;
  const paint = readPaint(plane);
  const airborne = !plane.isOnGround;
  const riders = plane.getComponent("minecraft:rideable")?.getRiders() ?? [];
  for (const r of riders) {
    if (airborne) addEffect(r, "slow_falling", 300);
  }
  flights.delete(plane.id);
  const location = plane.location;
  const dimension = plane.dimension;
  plane.remove();
  const kit = makeKit(planeId, paint);
  const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(kit) : kit;
  if (leftover) dimension.spawnItem(leftover, location);
  sound(player, "random.pop", 1, 1);
  actionBar(player, `§aPacked up the ${PLANES[planeId].name}!§r It keeps its paint.`);
}

// ------------------------------------------------------------ the paint shop

function targetPlane(player) {
  try {
    const on = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (on && PLANES[on.typeId]) return on;
    return player.getEntitiesFromViewDirection({ maxDistance: 10 }).find((h) => PLANES[h.entity.typeId])?.entity;
  } catch {
    return undefined;
  }
}

async function openPaintShop(player, retry = true) {
  const plane = targetPlane(player);
  if (!plane) {
    actionBar(player, "Look at a plane (or sit in one), then tap Paint!");
    return;
  }
  const spec = PLANES[plane.typeId];
  const paint = readPaint(plane);
  const cockpit = player.getDynamicProperty("bender:cockpit") === true;
  const form = new ModalFormData()
    .title(`Paint Shop: ${spec.name}`)
    .dropdown("Body color", COLORS, { defaultValueIndex: paint.body })
    .dropdown("Wing color", COLORS, { defaultValueIndex: paint.wings })
    .dropdown("Decals", DECALS, { defaultValueIndex: paint.decal })
    .toggle("Surprise me! (random paint job)", { defaultValue: false })
    .toggle("Cockpit view when flying", { defaultValue: cockpit })
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
  if (!plane.isValid || !response.formValues) return;
  const [body, wings, decal, surprise, cockpitView] = response.formValues;
  const next = surprise ? randomPaint() : cleanPaint({ body, wings, decal }, paint);
  applyPaint(plane, next);
  player.setDynamicProperty("bender:cockpit", cockpitView === true);
  if (ridingNow.get(player.id) === plane.id) applyCamera(player);
  for (let i = 0; i < 12; i++) {
    particle(plane.dimension, "minecraft:villager_happy", {
      x: plane.location.x + (Math.random() - 0.5) * 4,
      y: plane.location.y + Math.random() * 2,
      z: plane.location.z + (Math.random() - 0.5) * 4,
    });
  }
  sound(plane, "random.levelup", 0.6, 1.4);
  actionBar(player, `§aFresh paint!§r ${paintText(next)}`);
}

// ------------------------------------------------------------ items

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:plane_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const { itemStack, block, blockFace } = event;
      system.run(() => placePlane(player, itemStack, block, blockFace));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:paint_brush", {
    onUse(event) {
      const player = event.source;
      system.run(() => openPaintShop(player));
    },
  });
});

const BRUSH_LORE = ["§eLook at a plane and tap Paint!", "§7Pick colors and decals"];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.getLore().length > 0) continue;
      const planeId = KIT_TO_PLANE[item.typeId];
      if (!planeId && item.typeId !== BRUSH_ID) continue;
      try {
        item.setLore(planeId ? kitLore(kitPaint(item, planeId)) : BRUSH_LORE);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

// Every player gets the three planes and a paint brush the first time they join.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:air_welcomed")) return;
  player.setDynamicProperty("bender:air_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const container = player.getComponent("minecraft:inventory")?.container;
    const gifts = Object.keys(PLANES).map((id) => makeKit(id, PLANES[id].paint));
    const brush = new ItemStack(BRUSH_ID, 1);
    brush.setLore(BRUSH_LORE);
    gifts.push(brush);
    for (const gift of gifts) {
      const leftover = container?.addItem(gift);
      if (leftover) player.dimension.spawnItem(leftover, player.location);
    }
    player.sendMessage("§aBender Air is on!§r You got a §cStunt Plane§r, a §bJet§r, a §9Private Jet§r and a §dPaint Brush§r.");
    player.sendMessage("§7Tap the ground with a plane to put it down, then tap the plane to climb in.");
  }, 60);
});
