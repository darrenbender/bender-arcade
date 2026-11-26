// Bender Safe Mansion: a Mansion Kit that builds a whole safe mansion, and the security
// gadgets that keep monsters out: cameras and monitors, laser posts, motion sensors,
// launch-pad traps, laser turrets, a secret bookshelf door, and police vehicles.
//
// Nothing here ever hurts players, pets or animals: only monsters and bosses.

import {
  system,
  world,
  BlockPermutation,
  BlockVolume,
  ButtonState,
  EasingType,
  EntityDamageCause,
  GameMode,
  InputButton,
  ItemStack,
  MolangVariableMap,
  StructureSaveMode,
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { CAMERA_ID, DOOR_ID, LASER_POST_ID, MONITOR_ID, SECRET_ID, SENSOR_ID, SIZE, TRAP_ID, planMansion } from "./mansion.js";
import {
  CAMERA_SECONDS,
  KIT_TO_VEHICLE,
  LASER_DAMAGE,
  LASER_REACH,
  PLAN,
  SECRET_OPEN_TICKS,
  TURRET_DAMAGE,
  TURRET_EVERY,
  TURRET_RANGE,
  VAULT_LOOT,
  VEHICLES,
  ZAP_DAMAGE,
  ZAP_RANGE,
  alarmOn,
  beamPush,
  cameraView,
  distToSegment,
  inGrounds,
  inHouse,
  inYard,
  launch,
  lookFor,
  lookVector,
  newAlarm,
  niceName,
  radarText,
  sensorSpots,
  sirenPitch,
  steer,
  toLocal,
  toWorld,
  tripAlarm,
  turretTarget,
  withArticle,
  yawTo,
} from "./security.js";

const PACK_VERSION = "1.0.1";
const KIT = "bender:mansion_kit";
const REMOTE = "bender:security_remote";
const TURRET = "bender:laser_turret";
const TURRET_KIT = "bender:laser_turret_kit";
const WELCOME_KEY = "bender:mansion_welcomed";
const LAST_KEY = "bender:last_mansion";
const ALARM_OFF_KEY = "bender:mansion_alarm_off";
const MANSIONS_KEY = "bender:mansions";
const CAMERAS_KEY = "bender:mansion_cameras";
const BOSSES = new Set(["bender:element_guardian", "bender:ender_dragon", "minecraft:ender_dragon"]);
const OURS = new Set([...Object.keys(VEHICLES), TURRET]);
const CLEAR = 28; // blocks cleared above the ground
const FOUNDATION = 8; // blocks of ground filled in below
const CONFIRM_TICKS = 20 * 20;
const RED = { red: 1, green: 0.15, blue: 0.15 };
const BLUE = { red: 0.3, green: 0.8, blue: 1 };
const YELLOW = { red: 1, green: 0.85, blue: 0.2 };

const ridingNow = new Map(); // player id -> vehicle id
const movers = new Map(); // flying vehicle id -> { vehicle, vel, drivenTick }
const packHits = new Map(); // entity id -> { count, tick }
const lastPlaced = new Map(); // player id -> tick (taps can arrive twice)
const lastRemote = new Map(); // player id -> tick
const lastZap = new Map(); // player id -> tick
const zapped = new Map(); // monster id -> tick it was last hit by a laser post or trap

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
    player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 15 });
  } catch {
    // Titles are a bonus.
  }
}

function sound(entity, id, volume = 1, pitch = 1) {
  try {
    entity.dimension.playSound(id, entity.location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function soundAt(dimension, location, id, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
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

function dot(dimension, location, color, size = 0.12) {
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", color);
  vars.setFloat("variable.size", size);
  particle(dimension, "bender:mansion_dot", location, vars);
}

function beam(dimension, from, to, color, step = 0.5, size = 0.12) {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    dot(dimension, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }, color, size);
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
    return entity.matches({ families: [family] });
  } catch {
    return false;
  }
}

function center(entity, up = 0.9) {
  return { x: entity.location.x, y: entity.location.y + up, z: entity.location.z };
}

function blockCenter(block) {
  return { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
}

/** Only monsters and bosses: never players, pets, animals or our own machines. */
function isFoe(entity) {
  if (!entity?.isValid || entity.typeId === "minecraft:player" || OURS.has(entity.typeId)) return false;
  return BOSSES.has(entity.typeId) || hasFamily(entity, "monster");
}

function nearby(dimension, location, radius) {
  try {
    return dimension.getEntities({ location, maxDistance: radius });
  } catch {
    return [];
  }
}

function foesNear(dimension, location, radius) {
  return nearby(dimension, location, radius).filter(isFoe);
}

function playersNear(dimension, location, radius) {
  try {
    return dimension.getPlayers({ location, maxDistance: radius });
  } catch {
    return [];
  }
}

/** Security zaps are "magic", so monsters don't get angry at a player. */
function hurt(target, amount) {
  if (!target.isValid) return;
  try {
    target.applyDamage(Math.max(1, Math.round(amount)), { cause: EntityDamageCause.magic });
  } catch {
    // Couldn't be hurt.
  }
}

function fling(target, x, z, up) {
  try {
    target.applyKnockback({ x, z }, up);
  } catch {
    // Some things can't be pushed.
  }
}

function giveOrDrop(player, item) {
  const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

function useUpHeld(player, typeId) {
  if (isCreative(player)) return;
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const slot = player.selectedSlotIndex;
  const held = container.getItem(slot);
  if (held?.typeId !== typeId) return;
  if (held.amount > 1) {
    held.amount -= 1;
    container.setItem(slot, held);
  } else {
    container.setItem(slot, undefined);
  }
}

function aboveFace(block, face) {
  const off = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  return { x: block.x + 0.5 + off[0], y: block.y + off[1] + (face === "Down" ? -1 : 0), z: block.z + 0.5 + off[2] };
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
    const v = player.getComponent("minecraft:riding")?.entityRidingOn;
    return v && VEHICLES[v.typeId] ? v : undefined;
  } catch {
    return undefined;
  }
}

function setProp(entity, name, value) {
  try {
    if (entity.getProperty(name) !== value) entity.setProperty(name, value);
  } catch {
    // Not this kind of entity.
  }
}

function alarmsOff(player) {
  return player.getDynamicProperty(ALARM_OFF_KEY) === true;
}

function dimensionOf(id) {
  try {
    return world.getDimension(id);
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------ the list of mansions

/** @type {{ id: string, tag: string, dim: string, x0: number, z0: number, floorY: number, owner: string }[]} */
let mansions = [];
let mansionsLoaded = false;
const alarms = new Map(); // mansion tag -> alarm

function loadMansions() {
  if (mansionsLoaded) return;
  mansionsLoaded = true;
  try {
    const raw = world.getDynamicProperty(MANSIONS_KEY);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(list)) mansions = list;
  } catch {
    mansions = [];
  }
}

function saveMansions() {
  try {
    world.setDynamicProperty(MANSIONS_KEY, JSON.stringify(mansions));
  } catch {
    // Try again next time something changes.
  }
}

function siteOf(m) {
  return { x0: m.x0, z0: m.z0, floorY: m.floorY };
}

function mansionMiddle(m) {
  return toWorld(siteOf(m), { x: SIZE / 2, y: 4, z: SIZE / 2 });
}

/** The mansion whose grounds hold this spot, if any. */
function mansionAt(dimId, pos) {
  loadMansions();
  return mansions.find((m) => m.dim === dimId && inGrounds(toLocal(siteOf(m), pos)));
}

function alarmOf(m) {
  let a = alarms.get(m.tag);
  if (!a) {
    a = newAlarm();
    alarms.set(m.tag, a);
  }
  return a;
}

// ------------------------------------------------------------ cameras players put up

/** @type {{ dim: string, x: number, y: number, z: number, dir: string }[]} */
let extraCameras = [];
let camerasLoaded = false;

function loadCameras() {
  if (camerasLoaded) return;
  camerasLoaded = true;
  try {
    const raw = world.getDynamicProperty(CAMERAS_KEY);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(list)) extraCameras = list;
  } catch {
    extraCameras = [];
  }
}

function saveCameras() {
  try {
    world.setDynamicProperty(CAMERAS_KEY, JSON.stringify(extraCameras));
  } catch {
    // Try again next time.
  }
}

world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  if (block.typeId !== CAMERA_ID) return;
  loadCameras();
  let dir = "south";
  try {
    const d = block.permutation.getState("minecraft:cardinal_direction");
    if (typeof d === "string") dir = d;
  } catch {
    // Keep the default.
  }
  extraCameras = extraCameras.filter((c) => !(c.dim === block.dimension.id && c.x === block.x && c.y === block.y && c.z === block.z));
  extraCameras.push({ dim: block.dimension.id, x: block.x, y: block.y, z: block.z, dir });
  if (extraCameras.length > 64) extraCameras.shift();
  saveCameras();
  actionBar(player, "§bCamera on!§r Watch it from a Security Monitor or the Security Remote.");
});

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation }) => {
  if (brokenBlockPermutation.type.id !== CAMERA_ID) return;
  loadCameras();
  const before = extraCameras.length;
  extraCameras = extraCameras.filter((c) => !(c.dim === block.dimension.id && c.x === block.x && c.y === block.y && c.z === block.z));
  if (extraCameras.length !== before) saveCameras();
});

/** All the cameras someone at `pos` can watch: their mansion's, then the ones players put up. */
function cameraList(dimId, pos) {
  loadMansions();
  loadCameras();
  const list = [];
  const close = mansions.filter((m) => m.dim === dimId && Math.hypot(mansionMiddle(m).x - pos.x, mansionMiddle(m).z - pos.z) < 200);
  for (const m of close) {
    for (const c of PLAN.cameras) {
      const view = cameraView(siteOf(m), c);
      const name = close.length > 1 ? `${m.owner}: ${c.name}` : c.name;
      list.push({ name, dim: m.dim, block: toWorld(siteOf(m), c), ...view });
    }
  }
  let n = 0;
  for (const c of extraCameras) {
    n++;
    if (c.dim !== dimId || Math.hypot(c.x - pos.x, c.z - pos.z) > 200) continue;
    const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[c.dir] ?? [0, 1];
    list.push({
      name: `Camera ${n} (${c.x}, ${c.y}, ${c.z})`,
      dim: c.dim,
      block: { x: c.x, y: c.y, z: c.z },
      location: { x: c.x + 0.5 + out[0] * 0.6, y: c.y + 0.4, z: c.z + 0.5 + out[1] * 0.6 },
      facingLocation: lookFor(c),
    });
  }
  return list.slice(0, 30);
}

// ------------------------------------------------------------ watching a camera

const watching = new Map(); // player id -> { list, index, until, start, jumpHeld }

function cameraMenu(player, list) {
  if (!list.length) {
    actionBar(player, "§7No cameras close by. Build a Safe Mansion or put up a Security Camera.");
    return;
  }
  const form = new ActionFormData().title("§lSecurity Cameras").body("Pick a camera to watch. Jump for the next one, sneak to stop.");
  for (const c of list) {
    const foes = foesNear(player.dimension, c.facingLocation, 14).length;
    form.button(foes ? `§l${c.name}§r\n§c${foes} monster${foes === 1 ? "" : "s"}!` : `§l${c.name}§r\n§2All clear`);
  }
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined || !player.isValid) return;
    watch(player, list, res.selection, true);
  }).catch(() => {
    // The form couldn't open.
  });
}

function watch(player, list, index, first) {
  const cam = list[index];
  const dimension = dimensionOf(cam.dim);
  let there = false;
  try {
    there = player.dimension.id === cam.dim && dimension?.getBlock(cam.block)?.typeId === CAMERA_ID;
  } catch {
    there = false;
  }
  if (!there) {
    actionBar(player, `§c${cam.name}: no picture.§r The camera is gone or too far away.`);
    if (!first) stopWatching(player);
    return;
  }
  try {
    player.camera.setCamera("minecraft:free", {
      location: cam.location,
      facingLocation: cam.facingLocation,
      easeOptions: { easeTime: first ? 0.6 : 0.3, easeType: EasingType.InOutSine },
    });
  } catch {
    actionBar(player, "§cThe camera won't switch on right now.");
    return;
  }
  const old = watching.get(player.id);
  watching.set(player.id, {
    list,
    index,
    until: system.currentTick + CAMERA_SECONDS * 20,
    start: old?.start ?? { ...player.location },
    jumpHeld: true,
  });
  sound(player, "random.click", 0.6, 1.6);
  addEffect(player, "resistance", 40, 4);
}

function stopWatching(player) {
  if (!watching.has(player.id)) return;
  watching.delete(player.id);
  try {
    player.camera.clear();
  } catch {
    // Already back.
  }
  actionBar(player, "§7Camera off.");
}

function stepWatchers(tick) {
  for (const player of world.getAllPlayers()) {
    const w = watching.get(player.id);
    if (!w) continue;
    const moved = Math.hypot(player.location.x - w.start.x, player.location.z - w.start.z) > 1.5;
    if (player.isSneaking || moved || tick > w.until) {
      stopWatching(player);
      continue;
    }
    let jump = false;
    try {
      jump = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    } catch {
      jump = false;
    }
    if (jump && !w.jumpHeld) {
      watch(player, w.list, (w.index + 1) % w.list.length, false);
      continue;
    }
    w.jumpHeld = jump;
    if (tick % 10 === 0) {
      const cam = w.list[w.index];
      const foes = foesNear(player.dimension, cam.facingLocation, 14);
      const seen = foes.length ? `§c${foes.length} monster${foes.length === 1 ? "" : "s"}!§r` : "§2All clear§r";
      actionBar(player, `§b● ${cam.name}§r  ${seen}  §7Jump: next  Sneak: stop`);
      if (tick % 20 === 0) addEffect(player, "resistance", 40, 4);
    }
  }
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  // Something hurt you while you were watching: back to your own eyes right away.
  if (hurtEntity.typeId === "minecraft:player" && watching.has(hurtEntity.id)) stopWatching(hurtEntity);
});

// ------------------------------------------------------------ doors and the secret bookshelf

function setOpen(block, open) {
  try {
    block.setPermutation(block.permutation.withState("bender:open", open));
    return true;
  } catch {
    return false;
  }
}

function isOpen(block) {
  try {
    return block.permutation.getState("bender:open") === true;
  } catch {
    return false;
  }
}

/** Security doors slide open for players, never for monsters. */
function doorTick(block) {
  const near = playersNear(block.dimension, blockCenter(block), 3.5).length > 0;
  if (near === isOpen(block)) return;
  if (!setOpen(block, near)) return;
  let below;
  try {
    below = block.below();
  } catch {
    below = undefined;
  }
  // only the bottom row makes the whoosh, so a big door isn't noisy
  if (below?.typeId !== DOOR_ID) soundAt(block.dimension, blockCenter(block), near ? "random.door_open" : "random.door_close", 0.5, 1.6);
}

const secretClose = new Map(); // "dim x y z" -> tick to close

function secretKey(block) {
  return `${block.dimension.id} ${block.x} ${block.y} ${block.z}`;
}

/** The whole secret door: this bookshelf and the ones right above and below it. */
function secretColumn(block) {
  const out = [block];
  for (const step of ["above", "below"]) {
    let b = block;
    for (let i = 0; i < 3; i++) {
      try {
        b = step === "above" ? b.above() : b.below();
      } catch {
        b = undefined;
      }
      if (b?.typeId !== SECRET_ID) break;
      out.push(b);
    }
  }
  return out;
}

function openSecret(block, player) {
  const until = system.currentTick + SECRET_OPEN_TICKS;
  const wasOpen = isOpen(block);
  for (const b of secretColumn(block)) {
    setOpen(b, true);
    secretClose.set(secretKey(b), until);
  }
  if (wasOpen) return;
  soundAt(block.dimension, blockCenter(block), "random.door_open", 1, 0.5);
  for (let i = 0; i < 8; i++) {
    particle(block.dimension, "minecraft:villager_happy", { x: block.x + Math.random(), y: block.y + Math.random() * 2, z: block.z + Math.random() });
  }
  actionBar(player, "§6A secret door!§r It closes again in 5 seconds.");
}

function secretTick(block) {
  if (!isOpen(block)) return;
  const key = secretKey(block);
  const now = system.currentTick;
  const closeAt = secretClose.get(key);
  if (closeAt === undefined) {
    secretClose.set(key, now + SECRET_OPEN_TICKS);
    return;
  }
  if (now < closeAt) return;
  // never close on someone standing in the doorway
  const inside = playersNear(block.dimension, blockCenter(block), 1.3).length > 0 ||
    playersNear(block.dimension, { x: block.x + 0.5, y: block.y - 0.5, z: block.z + 0.5 }, 1.3).length > 0;
  if (inside) {
    secretClose.set(key, now + 20);
    return;
  }
  secretClose.delete(key);
  setOpen(block, false);
  let below;
  try {
    below = block.below();
  } catch {
    below = undefined;
  }
  if (below?.typeId !== SECRET_ID) soundAt(block.dimension, blockCenter(block), "random.door_close", 1, 0.5);
}

// ------------------------------------------------------------ laser posts, motion sensors and traps

/** Two laser posts up to 8 blocks apart (in a line, same height, nothing between) make a beam. */
function laserTick(block) {
  const dimension = block.dimension;
  for (const [dx, dz] of [[1, 0], [0, 1]]) {
    let partner;
    for (let i = 1; i <= LASER_REACH; i++) {
      let b;
      try {
        b = dimension.getBlock({ x: block.x + dx * i, y: block.y, z: block.z + dz * i });
      } catch {
        b = undefined;
      }
      if (!b) break;
      if (b.typeId === LASER_POST_ID) {
        if (i > 1) partner = b;
        break;
      }
      if (!b.isAir) break;
    }
    if (!partner) continue;
    const a = { x: block.x + 0.5 + dx * 0.5, y: block.y + 0.5, z: block.z + 0.5 + dz * 0.5 };
    const c = { x: partner.x + 0.5 - dx * 0.5, y: partner.y + 0.5, z: partner.z + 0.5 - dz * 0.5 };
    const mid = { x: (a.x + c.x) / 2, y: a.y, z: (a.z + c.z) / 2 };
    if (playersNear(dimension, mid, 40).length) beam(dimension, a, c, RED, 0.4, 0.1);
    const now = system.currentTick;
    for (const foe of foesNear(dimension, mid, LASER_REACH / 2 + 2)) {
      const l = foe.location;
      // the closest part of the monster's body to the beam
      const p = { x: l.x, y: Math.min(Math.max(a.y, l.y + 0.2), l.y + 1.6), z: l.z };
      if (distToSegment(p, a, c) > 0.8) continue;
      if (now - (zapped.get(foe.id) ?? -100) < 10) continue;
      zapped.set(foe.id, now);
      hurt(foe, LASER_DAMAGE);
      const push = beamPush(l, a, c);
      fling(foe, push.x * 0.9, push.z * 0.9, 0.25);
      for (let i = 0; i < 4; i++) dot(dimension, { x: l.x + (Math.random() - 0.5), y: l.y + 0.5 + Math.random(), z: l.z + (Math.random() - 0.5) }, YELLOW, 0.15);
      soundAt(dimension, l, "random.fizz", 0.6, 1.6);
      alertNear(dimension, l, foe, "hit a laser");
    }
  }
}

const sensorAlarms = new Map(); // "dim x y z" -> alarm

/** A motion sensor outside a mansion warns players close by when a monster comes near. */
function sensorTick(block) {
  const dimension = block.dimension;
  const at = blockCenter(block);
  if (mansionAt(dimension.id, at)) return; // the mansion's own alarm covers its sensors
  const foes = foesNear(dimension, at, 8);
  if (!foes.length) return;
  const key = `${dimension.id} ${block.x} ${block.y} ${block.z}`;
  let alarm = sensorAlarms.get(key);
  if (!alarm) {
    alarm = newAlarm();
    sensorAlarms.set(key, alarm);
  }
  const now = system.currentTick;
  const foe = foes[0];
  const message = tripAlarm(alarm, niceName(foe.typeId, foe.nameTag), `is near your motion sensor at ${block.x}, ${block.z}!`, now);
  for (let i = 0; i < 3; i++) dot(dimension, { x: at.x, y: at.y + 0.6 + i * 0.2, z: at.z }, RED, 0.25);
  for (const p of playersNear(dimension, at, 48)) {
    if (alarmsOff(p)) continue;
    try {
      p.playSound("note.pling", { pitch: 1.8, volume: 0.7 });
    } catch {
      // Missing sound.
    }
    if (message) p.sendMessage(message);
  }
}

/** Launch pads fling monsters away (out of the mansion, or away from players). */
function trapTick(block) {
  const dimension = block.dimension;
  const top = { x: block.x + 0.5, y: block.y + 1.2, z: block.z + 0.5 };
  const now = system.currentTick;
  for (const foe of foesNear(dimension, top, 1.6)) {
    const l = foe.location;
    if (Math.abs(l.x - top.x) > 0.8 || Math.abs(l.z - top.z) > 0.8 || l.y < block.y + 0.8 || l.y > block.y + 1.7) continue;
    if (now - (zapped.get(foe.id) ?? -100) < 20) continue;
    zapped.set(foe.id, now);
    const m = mansionAt(dimension.id, top);
    let v;
    if (m) {
      v = launch(toLocal(siteOf(m), l));
    } else {
      const nearest = playersNear(dimension, top, 32)[0];
      v = launch(l, nearest ? nearest.location : { x: top.x + Math.random() - 0.5, z: top.z + Math.random() - 0.5 });
    }
    fling(foe, v.x, v.z, v.up);
    soundAt(dimension, top, "mob.slime.big", 1, 0.8);
    for (let i = 0; i < 10; i++) dot(dimension, { x: top.x + (Math.random() - 0.5) * 1.2, y: top.y - 0.1, z: top.z + (Math.random() - 0.5) * 1.2 }, YELLOW, 0.2);
  }
}

/** Something tripped a laser in a mansion: tell the family (the mansion alarm decides how often). */
function alertNear(dimension, location, foe, what) {
  const m = mansionAt(dimension.id, location);
  if (!m) return;
  const message = tripAlarm(alarmOf(m), niceName(foe.typeId, foe.nameTag), `${what}!`, system.currentTick);
  if (message) tellFamily(m, message);
}

function tellFamily(m, message) {
  const dimension = dimensionOf(m.dim);
  if (!dimension) return;
  for (const p of playersNear(dimension, mansionMiddle(m), 96)) if (!alarmsOff(p)) p.sendMessage(message);
}

// ------------------------------------------------------------ the mansion's yard alarm

/** Every half second: is there a monster in a mansion's yard or house? */
function mansionWatch(tick) {
  loadMansions();
  for (const m of mansions) {
    const dimension = dimensionOf(m.dim);
    if (!dimension) continue;
    const middle = mansionMiddle(m);
    if (!playersNear(dimension, middle, 96).length) continue;
    const alarm = alarmOf(m);
    for (const foe of foesNear(dimension, middle, 34)) {
      const l = toLocal(siteOf(m), foe.location);
      if (!inYard(l)) continue;
      const where = inHouse(l) ? (l.y >= 6 ? "is upstairs in the mansion!" : "is inside the mansion!") : "is in the yard!";
      const message = tripAlarm(alarm, niceName(foe.typeId, foe.nameTag), where, tick);
      if (message) tellFamily(m, message);
    }
  }
}

/** Every 8 ticks while an alarm is going: the wee-woo, and the sensors flash red. */
function sirens(tick) {
  for (const m of mansions) {
    const alarm = alarms.get(m.tag);
    if (!alarm || !alarmOn(alarm, tick)) continue;
    const dimension = dimensionOf(m.dim);
    if (!dimension) continue;
    const pitch = sirenPitch(Math.floor(tick / 8) * 8);
    for (const p of playersNear(dimension, mansionMiddle(m), 64)) {
      if (alarmsOff(p)) continue;
      try {
        p.playSound("note.bit", { pitch, volume: 0.5 });
      } catch {
        // Missing sound.
      }
    }
    if (pitch > 1) {
      for (const s of sensorSpots()) {
        const at = toWorld(siteOf(m), { x: s.x + 0.5, y: s.y + 1.2, z: s.z + 0.5 });
        dot(dimension, at, RED, 0.35);
      }
    }
  }
}

// ------------------------------------------------------------ laser turrets

function turretTick(turret) {
  const head = center(turret, 0.75);
  const foes = foesNear(turret.dimension, head, TURRET_RANGE).map((e) => ({ id: e.id, pos: center(e, 0.9), entity: e }));
  const target = turretTarget(head, foes);
  if (!target) {
    // nothing to shoot: keep looking around
    try {
      turret.setRotation({ x: 0, y: turret.getRotation().y + 25 });
    } catch {
      // Unloaded.
    }
    return;
  }
  const yaw = yawTo(head, target.pos);
  try {
    turret.setRotation({ x: 0, y: yaw });
  } catch {
    // Unloaded.
  }
  const look = lookVector(yaw, 0);
  const muzzle = { x: head.x + look.x * 1.1, y: head.y, z: head.z + look.z * 1.1 };
  beam(turret.dimension, muzzle, target.pos, RED, 0.5, 0.12);
  hurt(target.entity, TURRET_DAMAGE);
  soundAt(turret.dimension, muzzle, "mob.shulker.shoot", 0.7, 1.7);
}

// ------------------------------------------------------------ vehicles

function boarded(player, vehicle) {
  const v = VEHICLES[vehicle.typeId];
  const how = v.move === "fly"
    ? `Look where to go and push forward. Hold jump to climb. Tap the Security Remote to zap monsters.${v.siren ? " Look straight up and tap it for the siren!" : ""}`
    : "Drive like a horse. Hold jump to hop. Tap the Security Remote for the siren!";
  title(player, `§9§l${v.name}`, `§7${v.move === "fly" ? "Look and push forward to fly" : "Tap the remote for the siren"}`);
  player.sendMessage(`§9${v.name}§r: ${how} Sneak to get out.`);
  sound(vehicle, v.move === "fly" ? "mob.bee.loop" : "random.click", 0.8, 0.8);
}

function leftVehicle(player, vehicleId) {
  actionBar(player, "");
  const vehicle = world.getEntity(vehicleId);
  if (!vehicle?.isValid) return;
  const v = VEHICLES[vehicle.typeId];
  if (v?.move === "fly") addEffect(player, "slow_falling", 200);
  if (!pilotOf(vehicle)) {
    sirenSound.delete(vehicle.id);
    if (vehicle.typeId === "bender:police_helicopter" || vehicle.typeId === "bender:police_car") setProp(vehicle, "bender:siren", false);
    if (vehicle.typeId === "bender:security_drone") setProp(vehicle, "bender:active", false);
  }
}

function readInput(player) {
  let forward = 0;
  let jump = false;
  try {
    forward = player.inputInfo.getMovementVector().y;
    jump = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // Controls unavailable this tick.
  }
  const rot = player.getRotation();
  return { forward, jump, yaw: rot.y, pitch: rot.x };
}

function fly(vehicle, player, tick) {
  const spec = VEHICLES[vehicle.typeId];
  let m = movers.get(vehicle.id);
  if (!m) {
    m = { vehicle, vel: { x: 0, y: 0, z: 0 }, drivenTick: tick };
    movers.set(vehicle.id, m);
  }
  m.drivenTick = tick;
  const input = readInput(player);
  try {
    m.vel = steer(spec.speed, m.vel, input, { onGround: vehicle.isOnGround });
    vehicle.clearVelocity();
    vehicle.applyImpulse(m.vel);
    vehicle.setRotation({ x: 0, y: input.yaw });
  } catch {
    // Unloaded this tick.
  }
}

/** Parked flying vehicles drift gently down to the ground. */
function settle(m, tick) {
  const { vehicle } = m;
  if (!vehicle.isValid) {
    movers.delete(m.vehicle.id);
    return;
  }
  try {
    m.vel = steer(VEHICLES[vehicle.typeId].speed, m.vel, undefined, { onGround: vehicle.isOnGround });
    vehicle.clearVelocity();
    vehicle.applyImpulse(m.vel);
    if (vehicle.isOnGround && Math.hypot(m.vel.x, m.vel.z) < 0.01) movers.delete(vehicle.id);
  } catch {
    movers.delete(vehicle.id);
  }
  if (tick - m.drivenTick > 20 * 60) movers.delete(vehicle.id);
}

/** The drone and helicopter laser: zaps every monster along where the pilot looks. */
function zap(player, vehicle) {
  const now = system.currentTick;
  if (now - (lastZap.get(player.id) ?? -100) < 10) {
    actionBar(player, "§7Laser recharging...");
    return;
  }
  lastZap.set(player.id, now);
  const rot = player.getRotation();
  const look = lookVector(rot.y, rot.x);
  const head = player.getHeadLocation();
  const from = { x: head.x + look.x * 2.5, y: head.y + look.y * 2.5 - 0.3, z: head.z + look.z * 2.5 };
  let reach = ZAP_RANGE;
  try {
    const hit = vehicle.dimension.getBlockFromRay(from, look, { maxDistance: ZAP_RANGE, includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) reach = Math.hypot(hit.block.x + hit.faceLocation.x - from.x, hit.block.y + hit.faceLocation.y - from.y, hit.block.z + hit.faceLocation.z - from.z);
  } catch {
    reach = ZAP_RANGE;
  }
  const to = { x: from.x + look.x * reach, y: from.y + look.y * reach, z: from.z + look.z * reach };
  beam(vehicle.dimension, from, to, BLUE, 0.6, 0.15);
  soundAt(vehicle.dimension, from, "mob.shulker.shoot", 1, 1.4);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  let hits = 0;
  for (const foe of foesNear(vehicle.dimension, mid, reach / 2 + 2)) {
    if (distToSegment(center(foe, 0.9), from, to) > 1.6) continue;
    hits++;
    hurt(foe, ZAP_DAMAGE);
    for (let i = 0; i < 5; i++) dot(vehicle.dimension, { x: foe.location.x + (Math.random() - 0.5), y: foe.location.y + 0.4 + Math.random(), z: foe.location.z + (Math.random() - 0.5) }, BLUE, 0.2);
  }
  actionBar(player, hits ? `§bZap!§r Hit ${hits} monster${hits === 1 ? "" : "s"}.` : "§bZap!");
}

const sirenSound = new Map(); // vehicle id -> beat, for police vehicles with the siren sound on

/**
 * The police car's siren: lights and sound. The helicopter's lights flash whenever it flies,
 * and its sound goes on and off when the pilot looks up and taps the remote.
 */
function toggleSiren(player, vehicle) {
  const on = !sirenSound.has(vehicle.id);
  if (on) sirenSound.set(vehicle.id, 0);
  else sirenSound.delete(vehicle.id);
  if (vehicle.typeId === "bender:police_car") setProp(vehicle, "bender:siren", on);
  actionBar(player, on ? "§c● §9● §rSiren ON! Tap again to switch it off." : "Siren off.");
}

/** Wee-woo every 8 ticks while the siren sound is on. */
function vehicleSiren(vehicle, tick) {
  const beat = sirenSound.get(vehicle.id);
  if (beat === undefined || tick % 8 !== 0) return;
  sirenSound.set(vehicle.id, beat + 1);
  soundAt(vehicle.dimension, vehicle.location, "note.bit", 0.6, beat % 2 ? 1.5 : 1.1);
}

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const vehicle = vehicleUnder(player);
    const before = ridingNow.get(player.id);
    if (vehicle && before !== vehicle.id) {
      if (before) leftVehicle(player, before);
      ridingNow.set(player.id, vehicle.id);
      boarded(player, vehicle);
    } else if (!vehicle && before) {
      ridingNow.delete(player.id);
      leftVehicle(player, before);
    }
    if (!vehicle) continue;
    const spec = VEHICLES[vehicle.typeId];
    if (tick % 20 === 0) addEffect(player, "resistance", 40, 2);
    if (pilotOf(vehicle)?.id !== player.id) continue;
    if (vehicle.typeId === "bender:police_helicopter") setProp(vehicle, "bender:siren", true);
    if (vehicle.typeId === "bender:security_drone") setProp(vehicle, "bender:active", true);
    if (spec.move === "fly") {
      fly(vehicle, player, tick);
      if (tick % 10 === 0) {
        const foes = foesNear(vehicle.dimension, vehicle.location, 48).map((e) => e.location);
        actionBar(player, radarText(vehicle.location, player.getRotation().y, foes));
      }
    }
    if (spec.siren) vehicleSiren(vehicle, tick);
  }
  for (const m of movers.values()) if (m.drivenTick !== tick) settle(m, tick);
  if (watching.size) stepWatchers(tick);
  if (tick % 10 === 0) mansionWatch(tick);
  if (tick % 8 === 0) sirens(tick);
  if (tick % 100 === 0) {
    for (const [id, t] of zapped) if (tick - t > 100) zapped.delete(id);
  }
}, 1);

// Turrets fire, and parked flying vehicles left in the air drift down.
system.runInterval(() => {
  const seen = new Set();
  for (const player of world.getAllPlayers()) {
    let ours = [];
    try {
      ours = player.dimension.getEntities({ location: player.location, maxDistance: 80, families: ["bender_mansion"] });
    } catch {
      ours = [];
    }
    for (const e of ours) {
      if (seen.has(e.id) || !OURS.has(e.typeId)) continue;
      seen.add(e.id);
      if (e.typeId === TURRET) turretTick(e);
      else if (VEHICLES[e.typeId].move === "fly" && !movers.has(e.id) && !e.isOnGround && !ridersOf(e).length) {
        movers.set(e.id, { vehicle: e, vel: { x: 0, y: 0, z: 0 }, drivenTick: system.currentTick });
      }
    }
  }
}, TURRET_EVERY);

// Packing up: hit an empty vehicle or turret three times.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid || !OURS.has(hitEntity.typeId)) return;
  const player = damagingEntity;
  if (ridersOf(hitEntity).length) {
    actionBar(player, "§7Someone is in that!");
    return;
  }
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
  const target = hitEntity;
  system.run(() => packUp(player, target));
});

function kitFor(typeId) {
  return typeId === TURRET ? TURRET_KIT : VEHICLES[typeId]?.kit;
}

function packUp(player, entity) {
  if (!entity.isValid || ridersOf(entity).length) return;
  const kitId = kitFor(entity.typeId);
  if (!kitId) return;
  const location = entity.location;
  const dimension = entity.dimension;
  const kit = new ItemStack(kitId, 1);
  kit.setLore(LORE[kitId]);
  const name = entity.typeId === TURRET ? "Laser Turret" : VEHICLES[entity.typeId].name;
  movers.delete(entity.id);
  entity.remove();
  const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(kit) : kit;
  if (leftover) dimension.spawnItem(leftover, location);
  sound(player, "random.pop", 1, 1);
  actionBar(player, `§aPacked up the ${name}!`);
}

function placeKit(player, item, block, face) {
  const typeId = item.typeId === TURRET_KIT ? TURRET : KIT_TO_VEHICLE[item.typeId];
  if (!typeId) return;
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);
  let entity;
  try {
    entity = player.dimension.spawnEntity(typeId, aboveFace(block, face));
  } catch {
    actionBar(player, "There's no room for that here.");
    return;
  }
  try {
    entity.setRotation({ x: 0, y: player.getRotation().y });
  } catch {
    // It's there either way.
  }
  sound(entity, "random.anvil_use", 0.5, 1.5);
  for (let i = 0; i < 8; i++) {
    particle(entity.dimension, "minecraft:villager_happy", { x: entity.location.x + (Math.random() - 0.5) * 2, y: entity.location.y + Math.random() * 2, z: entity.location.z + (Math.random() - 0.5) * 2 });
  }
  actionBar(player, typeId === TURRET ? "§cLaser Turret ready!§r It zaps monsters up to 20 blocks away." : `§9${VEHICLES[typeId].name} ready!§r Tap it to get in.`);
  useUpHeld(player, item.typeId);
}

// ------------------------------------------------------------ the mansion builder

const LOOSE = ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];
const COVER =
  /(_leaves|_log|_wood|_stem|grass$|fern|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|bush|vine|snow_layer|sapling|mushroom|bamboo|reeds|sugar_cane|cactus|petals|leaf_litter|wildflowers|moss_carpet|azalea|propagule|cocoa|pumpkin|melon|torchflower|pitcher|dripleaf|hanging_moss|eyeblossom)/;

const pendingBuild = new Map();
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

function survey(player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld") return { error: "Mansions can only be built in the Overworld." };
  const half = Math.floor(SIZE / 2);
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - half;
  const z0 = cz - half;
  const heights = [];
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < SIZE; dx += 4) {
    for (let dz = 0; dz < SIZE; dz += 4) {
      let ground;
      try {
        ground = dimension.getTopmostBlock({ x: x0 + dx, z: z0 + dz });
        for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
      } catch {
        ground = undefined;
      }
      if (!ground) return { error: "Stand in the middle of where you want the mansion, then try again." };
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
  if (floorY - FOUNDATION < range.min || floorY + CLEAR >= range.max) return { error: "Too high or too low to build here." };
  return { dimension, x0, z0, floorY, cx, cz };
}

function playersInside(site) {
  return world.getAllPlayers().filter((p) => {
    const { x, z } = p.location;
    return p.dimension.id === site.dimension.id && x >= site.x0 - 1 && x <= site.x0 + SIZE + 1 && z >= site.z0 - 1 && z <= site.z0 + SIZE + 1;
  });
}

function showOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBuild.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    const last = SIZE - 1;
    for (let a = 0; a <= last; a++) {
      for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
        particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + x + 0.5, y: site.floorY + 1.3, z: site.z0 + z + 0.5 });
      }
    }
  }, 10);
}

function* buildJob(player, site, plan, record) {
  try {
    yield* buildSteps(site, plan);
    finish(player, site, plan, record);
  } finally {
    building = false;
  }
}

function* buildSteps(site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });
  for (let tx = 0; tx < SIZE; tx += 16) {
    for (let tz = 0; tz < SIZE; tz += 16) {
      const x2 = Math.min(tx + 15, SIZE - 1);
      const z2 = Math.min(tz + 15, SIZE - 1);
      try {
        dimension.fillBlocks(new BlockVolume(at(tx, 1, tz), at(x2, CLEAR, z2)), "minecraft:air");
      } catch {
        // Keep going.
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

function finish(player, site, plan, record) {
  const { dimension } = site;
  const s = { x0: site.x0, z0: site.z0, floorY: site.floorY };
  const spawn = (typeId, pos, yaw) => {
    try {
      const e = dimension.spawnEntity(typeId, toWorld(s, pos));
      e.setRotation({ x: 0, y: yaw });
      e.addTag(record.tag);
    } catch {
      // The mansion still works without it.
    }
  };
  spawn("bender:police_car", { x: plan.spawns.car.x + 0.5, y: plan.spawns.car.y, z: plan.spawns.car.z + 0.5 }, 0);
  spawn("bender:police_helicopter", plan.spawns.helicopter, 0);
  spawn("bender:security_drone", plan.spawns.drone, 0);
  for (const t of plan.turrets) spawn(TURRET, t, 0);
  // treasure in the vault
  plan.chests.forEach((c, i) => {
    try {
      const container = dimension.getBlock(toWorld(s, c))?.getComponent("minecraft:inventory")?.container;
      VAULT_LOOT.forEach((loot, j) => {
        if (j % plan.chests.length === i) container?.addItem(new ItemStack(loot.id, loot.amount));
      });
    } catch {
      // An empty vault is still a vault.
    }
  });
  system.runTimeout(() => {
    try {
      dimension.getBlock(toWorld(s, plan.sign))?.getComponent("minecraft:sign")?.setText(`${record.owner}'s\nSafe Mansion\n\nKeep out,\nmonsters!`);
    } catch {
      // A blank sign is fine.
    }
  }, 10);
  // remember it, so its alarm and cameras work (forget any mansion it was built over)
  loadMansions();
  mansions = mansions.filter((m) => m.dim !== record.dim || Math.abs(m.x0 - s.x0) >= SIZE || Math.abs(m.z0 - s.z0) >= SIZE);
  mansions.push({ id: record.id, tag: record.tag, dim: record.dim, x0: s.x0, z0: s.z0, floorY: s.floorY, owner: record.owner });
  if (mansions.length > 40) mansions.shift();
  saveMansions();
  if (player.isValid) {
    title(player, "§bSafe Mansion", "Your mansion is ready!");
    sound(player, "random.levelup", 1, 1);
    player.sendMessage("§aYour Safe Mansion is ready!§r Tap a monitor in the security room to watch the cameras. Can you find the secret door upstairs? §7(Sneak and tap the Mansion Kit twice to undo it.)");
  }
}

function startBuild(player, site) {
  const plan = planMansion();
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const record = {
    id: `bendermansion:m${seed.toString(36)}`,
    tag: `bender_mansion_${seed.toString(36)}`,
    dim: site.dimension.id,
    x: site.x0,
    y: site.floorY - FOUNDATION,
    z: site.z0,
    owner: player.name,
  };
  try {
    world.structureManager.createFromWorld(
      record.id,
      site.dimension,
      { x: record.x, y: record.y, z: record.z },
      { x: site.x0 + SIZE - 1, y: site.floorY + CLEAR, z: site.z0 + SIZE - 1 },
      { includeEntities: false, saveMode: StructureSaveMode.World }
    );
  } catch {
    actionBar(player, "Couldn't get the land ready. Move a little and try again.");
    return;
  }
  const old = player.getDynamicProperty(LAST_KEY);
  if (typeof old === "string") {
    try {
      world.structureManager.delete(JSON.parse(old).id);
    } catch {
      // Already gone.
    }
  }
  player.setDynamicProperty(LAST_KEY, JSON.stringify(record));
  for (const p of playersInside(site)) {
    addEffect(p, "resistance", 300, 4);
    addEffect(p, "slow_falling", 300);
  }
  building = true;
  actionBar(player, "§eBuilding your Safe Mansion...");
  system.runJob(buildJob(player, site, plan, record));
}

function undo(player) {
  const raw = player.getDynamicProperty(LAST_KEY);
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a mansion to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = dimensionOf(record.dim);
  const cx = record.x + SIZE / 2;
  const cz = record.z + SIZE / 2;
  if (!dimension || player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 48) {
    actionBar(player, "Go back to your mansion to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the mansion. Stand in the middle of it and try again.");
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
  loadMansions();
  mansions = mansions.filter((m) => m.tag !== record.tag);
  alarms.delete(record.tag);
  saveMansions();
  player.setDynamicProperty(LAST_KEY, undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe mansion is gone and the land is back the way it was.");
}

function useKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undo(player);
    } else if (typeof player.getDynamicProperty(LAST_KEY) === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last mansion?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a mansion to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, a mansion is still being built!");
    return;
  }
  const waiting = pendingBuild.get(player.id);
  if (waiting && now <= waiting.expires && now - waiting.tick > 10 && Math.hypot(player.location.x - waiting.cx, player.location.z - waiting.cz) <= 8) {
    pendingBuild.delete(player.id);
    startBuild(player, waiting);
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
  player.sendMessage("§eYour Safe Mansion will fill the sparkly square.§r Everything inside gets replaced.");
  actionBar(player, "§aTap Build Mansion! again to build here.");
}

// ------------------------------------------------------------ the Security Remote

function useRemote(player) {
  const now = system.currentTick;
  if (now - (lastRemote.get(player.id) ?? -100) < 4) return;
  lastRemote.set(player.id, now);
  const vehicle = vehicleUnder(player);
  if (vehicle && pilotOf(vehicle)?.id === player.id) {
    const spec = VEHICLES[vehicle.typeId];
    const lookingUp = player.getRotation().x < -50;
    if (spec.siren && (!spec.zap || lookingUp)) toggleSiren(player, vehicle);
    else if (spec.zap) zap(player, vehicle);
    return;
  }
  remoteMenu(player);
}

function mansionStatus(player) {
  loadMansions();
  const mine = mansions.filter((m) => m.dim === player.dimension.id)
    .sort((a, b) => Math.hypot(mansionMiddle(a).x - player.location.x, mansionMiddle(a).z - player.location.z) -
      Math.hypot(mansionMiddle(b).x - player.location.x, mansionMiddle(b).z - player.location.z))[0];
  if (!mine) return "You don't have a Safe Mansion yet. Tap the Mansion Kit on open land to build one!";
  const dimension = player.dimension;
  const foes = foesNear(dimension, mansionMiddle(mine), 34).filter((f) => inYard(toLocal(siteOf(mine), f.location)));
  if (!foes.length) return `§2${mine.owner}'s mansion: all quiet.§r No monsters inside the walls.`;
  const names = foes.slice(0, 4).map((f) => withArticle(niceName(f.typeId, f.nameTag)).toLowerCase());
  return `§c${mine.owner}'s mansion: ${foes.length} monster${foes.length === 1 ? "" : "s"} inside the walls!§r ${names.join(", ")}${foes.length > 4 ? "..." : ""}`;
}

function remoteMenu(player) {
  const off = alarmsOff(player);
  const form = new ActionFormData()
    .title("§lSecurity Remote")
    .body(mansionStatus(player))
    .button("§lWatch the cameras")
    .button(off ? "§7Alarm sounds are OFF§r\n§8Tap to switch them on" : "§c Alarm sounds are ON§r\n§8Tap to switch them off")
    .button("§lHow to play");
  form.show(player).then((res) => {
    if (res.canceled || !player.isValid) return;
    if (res.selection === 0) cameraMenu(player, cameraList(player.dimension.id, player.location));
    else if (res.selection === 1) {
      player.setDynamicProperty(ALARM_OFF_KEY, !off);
      actionBar(player, off ? "§cAlarm sounds on.§r You'll hear the siren when monsters get in." : "Alarm sounds off. The lasers and turrets still work.");
    } else if (res.selection === 2) howToPlay(player);
  }).catch(() => {
    // The form couldn't open.
  });
}

function howToPlay(player) {
  const text = [
    "§lBuild:§r stand on open land and tap the §bMansion Kit§r, then tap again to build. Sneak and tap twice to undo it.",
    "§lCameras:§r tap a §lmonitor§r in the security room, or use this remote. Jump for the next camera, sneak to stop.",
    "§lLasers:§r monsters that walk into the red lasers at the gate get zapped and pushed back. Two Laser Posts up to 8 blocks apart make a laser anywhere.",
    "§lTurrets§r on the roof zap monsters up to 20 blocks away. §lLaunch pads§r fling monsters out of the yard.",
    "§lAlarm:§r when a monster gets inside the walls, the siren goes off and you get a message.",
    "§lSecret door:§r one bookshelf upstairs has a §cred book§r. Tap it!",
    "§lVehicles:§r tap to get in. In the §9drone§r or §9helicopter§r, look and push forward to fly, hold jump to climb, and tap this remote to zap monsters. The radar shows where monsters are. In the §9police car§r, tap the remote for the siren. In the helicopter, look straight up and tap it.",
    "§lPack up§r a vehicle or turret by hitting it 3 times.",
    "Lasers, turrets and traps never hurt players, pets or animals: only monsters.",
  ].join("\n\n");
  new ActionFormData().title("§lHow to play").body(text).button("Got it!").show(player).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ registering items and blocks

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:mansion_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useKit(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:mansion_remote", {
    onUse(event) {
      const player = event.source;
      system.run(() => useRemote(player));
    },
    onUseOn(event) {
      const player = event.source;
      if (player?.typeId !== "minecraft:player") return;
      system.run(() => useRemote(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:mansion_vehicle_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player?.typeId !== "minecraft:player") return;
      const { itemStack, block, blockFace } = event;
      system.run(() => placeKit(player, itemStack, block, blockFace));
    },
    onUse(event) {
      const player = event.source;
      system.run(() => actionBar(player, "Tap the ground to put it down."));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_door", {
    onTick(event) {
      doorTick(event.block);
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_secret", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => openSecret(block, player));
    },
    onTick(event) {
      secretTick(event.block);
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_monitor", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => cameraMenu(player, cameraList(block.dimension.id, blockCenter(block))));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_laser", {
    onTick(event) {
      laserTick(event.block);
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_sensor", {
    onTick(event) {
      sensorTick(event.block);
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:mansion_trap", {
    onTick(event) {
      trapTick(event.block);
    },
  });
});

// ------------------------------------------------------------ descriptions and the welcome gift

const LORE = {
  [KIT]: ["§eTap on open land to build a mansion", "§7Sneak + tap twice to undo it"],
  [REMOTE]: ["§eTap: cameras, alarm, how to play", "§7Drone or helicopter: laser zap", "§7Police car: siren on and off"],
  "bender:police_car_kit": ["§eTap the ground to park it", "§7Security Remote: siren on and off"],
  "bender:police_helicopter_kit": ["§eTap the ground to land it", "§7Look and push forward to fly", "§7Security Remote: laser zap", "§7Look up and tap the remote: siren"],
  "bender:security_drone_kit": ["§eTap the ground to put it down", "§7Look and push forward to fly", "§7Security Remote: laser zap"],
  [TURRET_KIT]: ["§eTap the ground to set it up", "§7Zaps monsters up to 20 blocks away"],
  [CAMERA_ID]: ["§7Watch it on a monitor or the remote"],
  [MONITOR_ID]: ["§7Tap it to watch your cameras"],
  [LASER_POST_ID]: ["§7Two posts up to 8 apart make a laser"],
  [SENSOR_ID]: ["§7Warns you when monsters come near"],
  [TRAP_ID]: ["§7Launches monsters that step on it"],
  [DOOR_ID]: ["§7Opens for players, never for monsters"],
  [SECRET_ID]: ["§7Tap to open, closes after 5 seconds"],
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
  // Say which version is running, so an old copy of the add-on is easy to spot.
  system.runTimeout(() => {
    if (player.isValid) player.sendMessage(`§7Bender Safe Mansion §fv${PACK_VERSION}§7 is on.`);
  }, 40);
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    for (const { id, count } of [{ id: KIT, count: 1 }, { id: REMOTE, count: 1 }, { id: CAMERA_ID, count: 4 }, { id: MONITOR_ID, count: 1 }]) {
      const item = new ItemStack(id, count);
      item.setLore(LORE[id]);
      giveOrDrop(player, item);
    }
    title(player, "§bSafe Mansion!", "§7Tap the Mansion Kit on open land");
    player.sendMessage("§aBender Safe Mansion is on!§r You got a §bMansion Kit§r, a §bSecurity Remote§r, 4 cameras and a monitor. Find some open land and tap the kit to build your mansion!");
  }, 60);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  ridingNow.delete(playerId);
  watching.delete(playerId);
  lastRemote.delete(playerId);
  lastZap.delete(playerId);
});
