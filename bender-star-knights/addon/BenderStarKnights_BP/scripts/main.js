// Bender Star Knights: glowing Star Blades (rainbow ones too), Star Powers, Clank Trooper
// robots to train against, a Droid Buddy, the Star Dart starfighter, Duel Mode, and a
// Temple Kit that builds a Star Knight Temple with a crystal cave.
//
// Blades, powers, the droid and the Star Dart only ever hurt monsters and robots.
// In Duel Mode, knights hit each other for points: nobody really gets hurt.

import {
  system,
  world,
  BlockPermutation,
  BlockVolume,
  ButtonState,
  EntityDamageCause,
  GameMode,
  InputButton,
  ItemStack,
  MolangVariableMap,
  StructureSaveMode,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  BLADE_BONUS,
  BLADE_IDS,
  COLORS,
  CRYSTAL_REGROW,
  DROID_COLORS,
  DROID_NAMES,
  DROID_ZAP,
  FIGHTER,
  POWERS,
  WAVES,
  aimAt,
  bladeId,
  colorOf,
  colorful,
  cooldownLeft,
  crystalId,
  distToSegment,
  duelHit,
  duelText,
  inCone,
  lookVector,
  nearest,
  newDuel,
  newKnight,
  pickPower,
  pullStrength,
  shouldDeflect,
  shove,
  steer,
  usePower,
  waveSpawns,
  waveText,
} from "./knights.js";
import { CONSOLE_ID, CRYSTAL_ID, SIZE, WORKBENCH_ID, planTemple } from "./temple.js";

const PACK_VERSION = "1.0.0";
const COMM = "bender:knight_comm";
const TEMPLE_KIT = "bender:temple_kit";
const DROID_KIT = "bender:droid_buddy_kit";
const DART_KIT = "bender:star_dart_kit";
const TROOPER = "bender:clank_trooper";
const CAPTAIN = "bender:clank_captain";
const BOLT = "bender:blaster_bolt";
const DROID = "bender:droid_buddy";
const DART = "bender:star_dart";
const WELCOME_KEY = "bender:knights_welcomed";
const DUEL_KEY = "bender:knights_duel";
const LAST_KEY = "bender:last_temple";
const TEMPLES_KEY = "bender:temples";
const BOSSES = new Set(["bender:element_guardian", "bender:ender_dragon", "minecraft:ender_dragon"]);
const OURS = new Set([DROID, DART, BOLT]);
const CLEAR = 24;
const FOUNDATION = 8;
const CONFIRM_TICKS = 20 * 20;
const WHITE = { red: 1, green: 1, blue: 1 };
const LASER = { red: 1, green: 0.3, blue: 0.25 };
const DROID_BEAM = { red: 0.3, green: 0.8, blue: 1 };

const knights = new Map(); // player id -> { ready, duel }
const lastHeld = new Map(); // player id -> item id held last check
const lastTap = new Map(); // player id -> tick (taps can arrive twice)
const lastPlaced = new Map();
const lastLaser = new Map();
const packHits = new Map(); // entity id -> { count, tick }
const movers = new Map(); // Star Dart id -> { dart, vel, drivenTick }
const ridingNow = new Map(); // player id -> Star Dart id
const deflected = new Set(); // bolt ids already sent back
const crystalTaken = new Map(); // "dim x y z" -> tick it can be picked again
const duel = newDuel();

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

function soundAt(dimension, location, id, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function sound(entity, id, volume = 1, pitch = 1) {
  soundAt(entity.dimension, entity.location, id, volume, pitch);
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
  particle(dimension, "bender:knight_dot", location, vars);
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

/** Only monsters, robots and bosses: never players, pets, animals or our own droid. */
function isFoe(entity) {
  if (!entity?.isValid || entity.typeId === "minecraft:player" || OURS.has(entity.typeId)) return false;
  return BOSSES.has(entity.typeId) || hasFamily(entity, "monster");
}

function nearby(dimension, location, radius, extra = {}) {
  try {
    return dimension.getEntities({ location, maxDistance: radius, ...extra });
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

/** Star Knight hits are "magic", so monsters don't get angry at anyone else. */
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

function heldItem(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
  } catch {
    return undefined;
  }
}

function useUpHeld(player, typeId, amount = 1) {
  if (isCreative(player)) return true;
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return false;
  const slot = player.selectedSlotIndex;
  const held = container.getItem(slot);
  if (held?.typeId !== typeId || held.amount < amount) return false;
  if (held.amount > amount) {
    held.amount -= amount;
    container.setItem(slot, held);
  } else {
    container.setItem(slot, undefined);
  }
  return true;
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

function dartUnder(player) {
  try {
    const v = player.getComponent("minecraft:riding")?.entityRidingOn;
    return v?.typeId === DART ? v : undefined;
  } catch {
    return undefined;
  }
}

function knightOf(player) {
  let k = knights.get(player.id);
  if (!k) {
    k = newKnight();
    k.duel = player.getDynamicProperty(DUEL_KEY) === true;
    knights.set(player.id, k);
  }
  return k;
}

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

const RAINBOW = ["#ff3535", "#ff8a1a", "#ffe23d", "#3dff5a", "#3d8bff", "#6a4dff", "#c44dff"].map(rgbOf);

/** The glow color of a blade right now (rainbow blades cycle). */
function bladeGlow(color, i = 0) {
  if (!color?.rainbow) return color ? rgbOf(color.hex) : WHITE;
  return RAINBOW[(Math.floor(system.currentTick / 3) + i) % RAINBOW.length];
}

function dimensionOf(id) {
  try {
    return world.getDimension(id);
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------ Star Blades and Star Powers

function useBlade(player, item) {
  const now = system.currentTick;
  if (now - (lastTap.get(player.id) ?? -100) < 4) return;
  lastTap.set(player.id, now);
  const dart = dartUnder(player);
  if (dart) {
    fireLasers(player, dart);
    return;
  }
  const color = colorOf(item?.typeId ?? "");
  const rot = player.getRotation();
  const power = pickPower(rot.x, player.isSneaking);
  const k = knightOf(player);
  if (!usePower(k, power, now)) {
    const left = Math.ceil(cooldownLeft(k, power, now) / 20);
    actionBar(player, `§7${POWERS[power].name} is recharging... ${left}s`);
    return;
  }
  if (power === "push") starPush(player, color);
  else if (power === "pull") starPull(player, color);
  else if (power === "lift") starLift(player, color);
  else starLeap(player, color);
}

function starPush(player, color) {
  const p = POWERS.push;
  const eye = player.getHeadLocation();
  const dir = player.getViewDirection();
  let hits = 0;
  for (const foe of foesNear(player.dimension, eye, p.range)) {
    if (!inCone(eye, dir, center(foe), p.range, p.minDot)) continue;
    const v = shove(player.location, foe.location, p.strength, p.up);
    fling(foe, v.x, v.z, v.up);
    hurt(foe, p.damage);
    hits++;
  }
  // a wave of light rolling out in front
  for (let r = 1; r <= 6; r++) {
    for (let a = -2; a <= 2; a++) {
      const yaw = (player.getRotation().y + a * 14) * (Math.PI / 180);
      dot(player.dimension, { x: eye.x - Math.sin(yaw) * r, y: eye.y - 0.4 + dir.y * r, z: eye.z + Math.cos(yaw) * r }, bladeGlow(color, r), 0.18);
    }
  }
  soundAt(player.dimension, eye, "wind_charge.burst", 1, 1.1);
  actionBar(player, hits ? `§b${p.name}!§r ${hits} monster${hits === 1 ? "" : "s"} sent flying.` : `§b${p.name}!`);
}

function starPull(player, color) {
  const p = POWERS.pull;
  const eye = player.getHeadLocation();
  const dir = player.getViewDirection();
  let hits = 0;
  for (const foe of foesNear(player.dimension, eye, p.range)) {
    if (!inCone(eye, dir, center(foe), p.range, p.minDot)) continue;
    const d = Math.hypot(foe.location.x - player.location.x, foe.location.z - player.location.z);
    const v = shove(player.location, foe.location, pullStrength(d, p.strength), p.up);
    fling(foe, v.x, v.z, v.up);
    beam(player.dimension, center(foe), eye, bladeGlow(color), 1, 0.1);
    hits++;
  }
  // dropped things fly to you too
  let items = 0;
  for (const it of nearby(player.dimension, player.location, p.range, { type: "minecraft:item" })) {
    try {
      it.teleport({ x: player.location.x, y: player.location.y + 0.5, z: player.location.z });
      items++;
    } catch {
      // Unloaded.
    }
  }
  soundAt(player.dimension, eye, "mob.breeze.inhale", 1, 1.2);
  const what = [hits ? `${hits} monster${hits === 1 ? "" : "s"} pulled in` : "", items ? `${items} thing${items === 1 ? "" : "s"} grabbed` : ""].filter(Boolean).join(", ");
  actionBar(player, `§b${p.name}!§r ${what}`);
}

function starLift(player, color) {
  const p = POWERS.lift;
  const eye = player.getHeadLocation();
  const flat = lookVector(player.getRotation().y, 0); // lift what's in front, even when looking up
  let hits = 0;
  for (const foe of foesNear(player.dimension, eye, p.range)) {
    if (!inCone(player.location, flat, foe.location, p.range, p.minDot)) continue;
    addEffect(foe, "levitation", p.ticks, 1);
    for (let i = 0; i < 6; i++) dot(foe.dimension, { x: foe.location.x + (Math.random() - 0.5), y: foe.location.y + Math.random() * 2, z: foe.location.z + (Math.random() - 0.5) }, bladeGlow(color, i), 0.2);
    hits++;
  }
  soundAt(player.dimension, eye, "mob.evocation_illager.cast_spell", 0.8, 1.4);
  actionBar(player, hits ? `§b${p.name}!§r ${hits} monster${hits === 1 ? "" : "s"} floating up!` : `§b${p.name}!§r Look up at monsters in front of you.`);
}

function starLeap(player, color) {
  const p = POWERS.leap;
  const flat = lookVector(player.getRotation().y, 0);
  try {
    player.applyKnockback({ x: flat.x * p.forward, z: flat.z * p.forward }, p.up);
  } catch {
    return;
  }
  addEffect(player, "slow_falling", 70);
  for (let i = 0; i < 10; i++) dot(player.dimension, { x: player.location.x + (Math.random() - 0.5), y: player.location.y + Math.random() * 0.4, z: player.location.z + (Math.random() - 0.5) }, bladeGlow(color, i), 0.2);
  soundAt(player.dimension, player.location, "mob.breeze.jump", 1, 1);
  actionBar(player, `§b${p.name}!`);
}

/** Blades light up with a hum when you pick one up. */
function igniteCheck(player) {
  const held = heldItem(player)?.typeId;
  const before = lastHeld.get(player.id);
  if (held === before) return;
  lastHeld.set(player.id, held);
  if (held && BLADE_IDS.has(held)) {
    sound(player, "beacon.activate", 0.5, 1.8);
    const color = colorOf(held);
    const eye = player.getHeadLocation();
    for (let i = 0; i < 5; i++) dot(player.dimension, { x: eye.x + (Math.random() - 0.5) * 0.6, y: eye.y - 0.5 + Math.random() * 0.6, z: eye.z + (Math.random() - 0.5) * 0.6 }, bladeGlow(color, i), 0.15);
  } else if (before && BLADE_IDS.has(before)) {
    sound(player, "beacon.deactivate", 0.4, 1.8);
  }
}

/** Blaster bolts that fly at a knight holding a blade bounce back at whoever shot them. */
function deflectCheck(player) {
  const held = heldItem(player)?.typeId;
  if (!held || !BLADE_IDS.has(held)) return;
  const eye = player.getHeadLocation();
  const view = player.getViewDirection();
  for (const bolt of nearby(player.dimension, eye, 4, { type: BOLT })) {
    if (deflected.has(bolt.id)) continue;
    let vel;
    try {
      vel = bolt.getVelocity();
    } catch {
      continue;
    }
    const at = { x: bolt.location.x, y: bolt.location.y, z: bolt.location.z };
    if (!shouldDeflect(eye, view, at, vel)) continue;
    const projectile = bolt.getComponent("minecraft:projectile");
    const shooter = projectile?.owner;
    const target = shooter?.isValid ? center(shooter, 1.2) : { x: eye.x + view.x * 20, y: eye.y + view.y * 20, z: eye.z + view.z * 20 };
    try {
      if (projectile) projectile.owner = player;
      bolt.clearVelocity();
      bolt.applyImpulse(aimAt(at, target, 1.6));
    } catch {
      continue;
    }
    deflected.add(bolt.id);
    const color = colorOf(held);
    for (let i = 0; i < 6; i++) dot(player.dimension, { x: at.x + (Math.random() - 0.5) * 0.5, y: at.y + (Math.random() - 0.5) * 0.5, z: at.z + (Math.random() - 0.5) * 0.5 }, bladeGlow(color, i), 0.16);
    soundAt(player.dimension, at, "mob.breeze.deflect", 1, 1.4);
    actionBar(player, "§eDeflected!§r");
  }
}

// ------------------------------------------------------------ hitting things

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;
  const held = heldItem(player)?.typeId;
  const blade = !!held && BLADE_IDS.has(held);
  if (hitEntity.typeId === DART || (hitEntity.typeId === DROID && player.isSneaking)) {
    packHit(player, hitEntity);
    return;
  }
  if (hitEntity.typeId === "minecraft:player") {
    if (blade) duelStrike(player, hitEntity);
    return;
  }
  if (!blade || !isFoe(hitEntity)) return;
  const target = hitEntity;
  const color = colorOf(held);
  system.run(() => {
    if (!target.isValid) return;
    hurt(target, BLADE_BONUS);
    const c = center(target, 1);
    for (let i = 0; i < 5; i++) dot(target.dimension, { x: c.x + (Math.random() - 0.5) * 0.6, y: c.y + (Math.random() - 0.5) * 0.8, z: c.z + (Math.random() - 0.5) * 0.6 }, bladeGlow(color, i), 0.14);
    soundAt(target.dimension, c, "random.fizz", 0.5, 1.8);
  });
});

function duelStrike(attacker, defender) {
  const a = knightOf(attacker);
  const d = knightOf(defender);
  if (!a.duel || !d.duel) {
    actionBar(attacker, "§7To sword-fight, you both switch on §6Duel Mode§7 in the Knight Comm.");
    return;
  }
  const r = duelHit(duel, attacker.name, defender.name, system.currentTick);
  if (!r.counted) return;
  const v = shove(attacker.location, defender.location, 0.9, 0.3);
  system.run(() => {
    if (!defender.isValid) return;
    fling(defender, v.x, v.z, v.up);
    const c = center(defender, 1.2);
    for (let i = 0; i < 6; i++) dot(defender.dimension, { x: c.x + (Math.random() - 0.5), y: c.y + (Math.random() - 0.5), z: c.z + (Math.random() - 0.5) }, { red: 1, green: 0.85, blue: 0.3 }, 0.15);
    soundAt(defender.dimension, c, "random.anvil_land", 0.35, 2);
    const line = duelText(r.scores, attacker.name, defender.name);
    actionBar(attacker, line);
    actionBar(defender, line);
    if (r.winner) {
      for (const p of [attacker, defender]) {
        title(p, `§6${r.winner} wins!`, "§7The duel starts over at 0-0");
        sound(p, "random.levelup", 1, 1);
      }
      for (let i = 0; i < 20; i++) dot(attacker.dimension, { x: attacker.location.x + (Math.random() - 0.5) * 2, y: attacker.location.y + 1 + Math.random() * 2, z: attacker.location.z + (Math.random() - 0.5) * 2 }, RAINBOW[i % RAINBOW.length], 0.25);
    }
  });
}

/** While two duelists are close, nobody gets hurt. */
function duelShield() {
  const duelists = world.getAllPlayers().filter((p) => knightOf(p).duel);
  for (const p of duelists) {
    const close = duelists.some((o) => o.id !== p.id && o.dimension.id === p.dimension.id && Math.hypot(o.location.x - p.location.x, o.location.y - p.location.y, o.location.z - p.location.z) < 12);
    if (close) addEffect(p, "resistance", 40, 4);
  }
}

function packHit(player, entity) {
  if (ridersOf(entity).length) {
    actionBar(player, "§7Someone is flying that!");
    return;
  }
  const now = system.currentTick;
  const last = packHits.get(entity.id);
  const count = last && now - last.tick < 40 ? last.count + 1 : 1;
  packHits.set(entity.id, { count, tick: now });
  if (count < 3) {
    const left = 3 - count;
    actionBar(player, `Hit it ${left} more time${left === 1 ? "" : "s"} to pack it up${entity.typeId === DROID ? " (keep sneaking)" : ""}`);
    sound(entity, "random.click", 0.6, 1.2);
    return;
  }
  packHits.delete(entity.id);
  system.run(() => {
    if (!entity.isValid || ridersOf(entity).length) return;
    const kit = new ItemStack(entity.typeId === DART ? DART_KIT : DROID_KIT, 1);
    kit.setLore(LORE[kit.typeId]);
    const name = entity.typeId === DART ? "Star Dart" : "Droid Buddy";
    const location = entity.location;
    const dimension = entity.dimension;
    movers.delete(entity.id);
    entity.remove();
    const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(kit) : kit;
    if (leftover) dimension.spawnItem(leftover, location);
    sound(player, "random.pop", 1, 1);
    actionBar(player, `§aPacked up the ${name}!`);
  });
}

// ------------------------------------------------------------ robots

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== TROOPER && deadEntity.typeId !== CAPTAIN) return;
  // the robot falls apart in a shower of sparks
  let at;
  try {
    at = center(deadEntity, 1);
  } catch {
    return;
  }
  const dimension = deadEntity.dimension;
  for (let i = 0; i < 14; i++) dot(dimension, { x: at.x + (Math.random() - 0.5) * 1.4, y: at.y + (Math.random() - 0.5) * 1.6, z: at.z + (Math.random() - 0.5) * 1.4 }, i % 2 ? { red: 1, green: 0.6, blue: 0.1 } : { red: 0.8, green: 0.8, blue: 0.85 }, 0.18);
  soundAt(dimension, at, "random.break", 1, 0.8);
  soundAt(dimension, at, "mob.irongolem.hit", 0.8, 1.6);
});

// ------------------------------------------------------------ the temples

/** @type {{ id: string, tag: string, dim: string, x0: number, z0: number, floorY: number, owner: string }[]} */
let temples = [];
let templesLoaded = false;

function loadTemples() {
  if (templesLoaded) return;
  templesLoaded = true;
  try {
    const raw = world.getDynamicProperty(TEMPLES_KEY);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(list)) temples = list;
  } catch {
    temples = [];
  }
}

function saveTemples() {
  try {
    world.setDynamicProperty(TEMPLES_KEY, JSON.stringify(temples));
  } catch {
    // Try again next time.
  }
}

function toWorld(t, p) {
  return { x: t.x0 + p.x, y: t.floorY + p.y, z: t.z0 + p.z };
}

function templeAt(dimId, pos) {
  loadTemples();
  return temples.find((t) => t.dim === dimId && pos.x >= t.x0 && pos.x < t.x0 + SIZE && pos.z >= t.z0 && pos.z < t.z0 + SIZE);
}

// ------------------------------------------------------------ the crystal cave and the workbench

function pickCrystal(block, player) {
  let index = 0;
  try {
    const v = block.permutation.getState("bender:color");
    if (typeof v === "number") index = v;
  } catch {
    index = 0;
  }
  const color = COLORS[index] ?? COLORS[0];
  const key = `${block.dimension.id} ${block.x} ${block.y} ${block.z}`;
  const now = system.currentTick;
  const readyAt = crystalTaken.get(key) ?? 0;
  if (now < readyAt) {
    actionBar(player, `§7This crystal is growing back... ${Math.ceil((readyAt - now) / 20)}s`);
    return;
  }
  crystalTaken.set(key, now + CRYSTAL_REGROW);
  const crystal = new ItemStack(crystalId(color), 1);
  crystal.setLore(LORE.crystal);
  giveOrDrop(player, crystal);
  const at = blockCenter(block);
  for (let i = 0; i < 8; i++) dot(block.dimension, { x: at.x + (Math.random() - 0.5) * 1.2, y: at.y + (Math.random() - 0.5) * 1.2, z: at.z + 0.6 }, bladeGlow(color, i), 0.18);
  soundAt(block.dimension, at, "chime.amethyst_block", 1, 1.2);
  actionBar(player, `You found a ${colorful(color, `${color.name} Star Crystal`)}§r! Take it to the §bBlade Workbench§r.`);
}

function useWorkbench(block, player) {
  const held = heldItem(player);
  const color = held ? colorOf(held.typeId) : undefined;
  if (!held || !color) {
    actionBar(player, "§bBlade Workbench:§r hold a §dStar Crystal§r and tap here to build a Star Blade.");
    return;
  }
  if (held.typeId === bladeId(color)) {
    actionBar(player, `That's your ${colorful(color, color.name)}§r blade! Bring a §dStar Crystal§r to build another.`);
    return;
  }
  if (!useUpHeld(player, held.typeId, 1)) return;
  const blade = new ItemStack(bladeId(color), 1);
  blade.setLore(LORE.blade);
  giveOrDrop(player, blade);
  const at = { x: block.x + 0.5, y: block.y + 1.2, z: block.z + 0.5 };
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dot(block.dimension, { x: at.x + Math.cos(a) * 0.9, y: at.y + (i % 6) * 0.2, z: at.z + Math.sin(a) * 0.9 }, bladeGlow(color, i), 0.2);
  }
  soundAt(block.dimension, at, "beacon.power", 1, 1.4);
  sound(player, "random.levelup", 0.8, 1.2);
  title(player, colorful(color, `${color.name} Star Blade!`), "§7Hold it and tap for Star Powers");
}

// ------------------------------------------------------------ training waves

/** @type {Map<string, { key: string, dim: string, wave: number, ids: string[], playerId: string, nextAt: number, pads: { x: number, y: number, z: number }[], tag: string }>} */
const trainings = new Map();

function padsFor(block) {
  const t = templeAt(block.dimension.id, block);
  if (t) return planTemple().pads.map((p) => toWorld(t, { x: p.x + 0.5, y: 1, z: p.z + 0.5 }));
  // a console out in the world: robots come from four spots around it
  return [[8, 0], [-8, 0], [0, 8], [0, -8]].map(([dx, dz]) => ({ x: block.x + 0.5 + dx, y: block.y, z: block.z + 0.5 + dz }));
}

function useConsole(block, player) {
  const key = `${block.dimension.id} ${block.x} ${block.y} ${block.z}`;
  const running = trainings.get(key);
  if (running) {
    const form = new ActionFormData().title("§lTraining Console").body(`Wave ${running.wave + 1} of ${WAVES.length} is going. Robots left: ${aliveIds(running).length}`)
      .button("§lKeep going!").button("§cStop training");
    form.show(player).then((res) => {
      if (!res.canceled && res.selection === 1) endTraining(running, "§7Training stopped.");
    }).catch(() => {
      // The form couldn't open.
    });
    return;
  }
  const form = new ActionFormData().title("§lTraining Console")
    .body("Fight 3 waves of Clank Trooper robots! They shoot blaster bolts: hold your §bStar Blade§r and look at them to bounce the bolts back.\n\nThe last wave has a Clank Captain.")
    .button("§2§lStart training!").button("Not now");
  form.show(player).then((res) => {
    if (res.canceled || res.selection !== 0 || !player.isValid || trainings.has(key)) return;
    const t = { key, dim: block.dimension.id, wave: -1, ids: [], playerId: player.id, nextAt: system.currentTick + 40, pads: padsFor(block), tag: `bender_training_${system.currentTick}` };
    trainings.set(key, t);
    title(player, "§eTraining!", "§7Get ready, knight...");
    sound(player, "note.pling", 1, 1.2);
  }).catch(() => {
    // The form couldn't open.
  });
}

function aliveIds(t) {
  return t.ids.filter((id) => {
    const e = world.getEntity(id);
    return !!e && e.isValid;
  });
}

function startWave(t, player) {
  t.wave++;
  const dimension = dimensionOf(t.dim);
  if (!dimension) return;
  t.ids = [];
  for (const s of waveSpawns(t.wave, t.pads)) {
    try {
      const e = dimension.spawnEntity(s.kind === "captain" ? CAPTAIN : TROOPER, { x: s.pad.x + (Math.random() - 0.5), y: s.pad.y, z: s.pad.z + (Math.random() - 0.5) });
      e.addTag(t.tag);
      t.ids.push(e.id);
      for (let i = 0; i < 6; i++) dot(dimension, { x: s.pad.x + (Math.random() - 0.5), y: s.pad.y + Math.random() * 2, z: s.pad.z + (Math.random() - 0.5) }, { red: 1, green: 0.4, blue: 0.2 }, 0.2);
    } catch {
      // The pad is blocked.
    }
  }
  player.sendMessage(waveText(t.wave));
  title(player, `§eWave ${t.wave + 1}!`, "§7Bounce their bolts back with your blade");
  sound(player, "note.pling", 1, 1.5);
}

function endTraining(t, message) {
  trainings.delete(t.key);
  const dimension = dimensionOf(t.dim);
  if (dimension) {
    for (const e of nearby(dimension, t.pads[0], 96, { tags: [t.tag] })) {
      try {
        e.remove();
      } catch {
        // Already gone.
      }
    }
  }
  const player = world.getAllPlayers().find((p) => p.id === t.playerId);
  if (player && message) player.sendMessage(message);
}

function stepTrainings(tick) {
  for (const t of [...trainings.values()]) {
    const player = world.getAllPlayers().find((p) => p.id === t.playerId);
    const far = !player || player.dimension.id !== t.dim || Math.hypot(player.location.x - t.pads[0].x, player.location.z - t.pads[0].z) > 80;
    if (far) {
      endTraining(t, "§7Training stopped: you went too far away.");
      continue;
    }
    if (t.wave < 0) {
      if (tick >= t.nextAt) {
        t.nextAt = 0;
        startWave(t, player);
      }
      continue;
    }
    if (aliveIds(t).length > 0) continue;
    if (t.wave + 1 >= WAVES.length) {
      // the last wave is beaten: training complete, with a crystal for a prize
      trainings.delete(t.key);
      title(player, "§6Training complete!", "§7You're a true Star Knight!");
      sound(player, "random.levelup", 1, 1);
      for (let i = 0; i < 30; i++) dot(player.dimension, { x: player.location.x + (Math.random() - 0.5) * 3, y: player.location.y + Math.random() * 3, z: player.location.z + (Math.random() - 0.5) * 3 }, RAINBOW[i % RAINBOW.length], 0.25);
      const prize = COLORS[Math.floor(Math.random() * COLORS.length)];
      const crystal = new ItemStack(crystalId(prize), 1);
      crystal.setLore(LORE.crystal);
      giveOrDrop(player, crystal);
      player.sendMessage(`§6Training complete!§r Your prize: a ${colorful(prize, `${prize.name} Star Crystal`)}§r. Build it into a blade at the §bBlade Workbench§r.`);
      continue;
    }
    if (!t.nextAt) {
      t.nextAt = tick + 100;
      player.sendMessage(`§aWave ${t.wave + 1} cleared!§r The next wave comes in 5 seconds...`);
      sound(player, "random.orb", 1, 1.2);
    } else if (tick >= t.nextAt) {
      t.nextAt = 0;
      startWave(t, player);
    }
  }
}

// ------------------------------------------------------------ the Droid Buddy

function ownerIdOf(droid) {
  try {
    return droid.getComponent("minecraft:tameable")?.tamedToPlayerId;
  } catch {
    return undefined;
  }
}

function spawnDroid(player, location, tag) {
  let droid;
  try {
    droid = player.dimension.spawnEntity(DROID, location);
  } catch {
    return undefined;
  }
  try {
    droid.getComponent("minecraft:tameable")?.tame(player);
  } catch {
    // An untamed droid still zaps monsters.
  }
  droid.nameTag = DROID_NAMES[Math.floor(Math.random() * DROID_NAMES.length)];
  if (tag) droid.addTag(tag);
  return droid;
}

function myDroids(player) {
  return nearby(player.dimension, player.location, 128, { type: DROID }).filter((d) => ownerIdOf(d) === player.id);
}

function droidZaps(tick) {
  const seen = new Set();
  for (const player of world.getAllPlayers()) {
    for (const droid of nearby(player.dimension, player.location, 64, { type: DROID })) {
      if (seen.has(droid.id)) continue;
      seen.add(droid.id);
      const eye = center(droid, 0.7);
      const foes = foesNear(droid.dimension, eye, DROID_ZAP.range).map((e) => ({ id: e.id, pos: center(e, 1), entity: e }));
      const target = nearest(eye, foes, DROID_ZAP.range);
      if (target) {
        beam(droid.dimension, eye, target.pos, DROID_BEAM, 0.4, 0.1);
        hurt(target.entity, DROID_ZAP.damage);
        soundAt(droid.dimension, eye, "mob.shulker.shoot", 0.5, 2);
      } else if ((tick / DROID_ZAP.every) % 4 === Math.floor(Math.random() * 4)) {
        soundAt(droid.dimension, eye, Math.random() < 0.5 ? "note.bit" : "note.chime", 0.4, 1 + Math.random());
      }
    }
  }
}

function droidMenu(player) {
  const droids = myDroids(player);
  if (!droids.length) {
    actionBar(player, "§7You don't have a Droid Buddy close by. Tap the ground with a §bDroid Buddy§7 kit.");
    return;
  }
  const form = new ActionFormData().title("§lDroid Buddy").body(`${droids.map((d) => d.nameTag || "Droid").join(", ")}: pick a paint, or call it to you.`)
    .button("§lCome here!");
  for (const c of DROID_COLORS) form.button(`Paint: ${c.name}`);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined || !player.isValid) return;
    for (const d of droids) {
      if (!d.isValid) continue;
      try {
        if (res.selection === 0) d.teleport({ x: player.location.x + 1, y: player.location.y, z: player.location.z + 1 });
        else d.setProperty("bender:color", res.selection - 1);
      } catch {
        // Unloaded.
      }
    }
    sound(player, "note.chime", 0.8, 1.6);
    actionBar(player, res.selection === 0 ? "§bBeep boop!§r Your droid is here." : `§bFresh paint!§r ${DROID_COLORS[res.selection - 1].name}`);
  }).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ the Star Dart

function boardedDart(player) {
  title(player, "§b§lStar Dart", "§7Look where to go and push forward");
  player.sendMessage("§bStar Dart§r: look where you want to go and push forward. Hold jump to climb. Tap your §bStar Blade§r or §bKnight Comm§r to fire lasers. Sneak to get out.");
  sound(player, "beacon.activate", 0.6, 0.8);
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

function flyDart(dart, player, tick) {
  let m = movers.get(dart.id);
  if (!m) {
    m = { dart, vel: { x: 0, y: 0, z: 0 }, drivenTick: tick };
    movers.set(dart.id, m);
  }
  m.drivenTick = tick;
  const input = readInput(player);
  try {
    m.vel = steer(FIGHTER.speed, m.vel, input, { onGround: dart.isOnGround });
    dart.clearVelocity();
    dart.applyImpulse(m.vel);
    dart.setRotation({ x: 0, y: input.yaw });
  } catch {
    // Unloaded this tick.
  }
  if (tick % 4 === 0 && Math.hypot(m.vel.x, m.vel.z) > 0.2) {
    const back = lookVector(input.yaw, 0);
    for (const side of [1, -1]) {
      dot(dart.dimension, { x: dart.location.x - back.x * 1.5 + back.z * 0.4 * side, y: dart.location.y + 0.45, z: dart.location.z - back.z * 1.5 - back.x * 0.4 * side }, { red: 0.35, green: 0.85, blue: 1 }, 0.2);
    }
  }
}

function settleDart(m, tick) {
  const { dart } = m;
  if (!dart.isValid) {
    movers.delete(m.dart.id);
    return;
  }
  try {
    m.vel = steer(FIGHTER.speed, m.vel, undefined, { onGround: dart.isOnGround });
    dart.clearVelocity();
    dart.applyImpulse(m.vel);
    if (dart.isOnGround && Math.hypot(m.vel.x, m.vel.z) < 0.01) movers.delete(dart.id);
  } catch {
    movers.delete(dart.id);
  }
  if (tick - m.drivenTick > 20 * 60) movers.delete(dart.id);
}

/** Twin lasers from the wingtips, straight where you look: they zap every monster on the line. */
function fireLasers(player, dart) {
  const now = system.currentTick;
  if (now - (lastLaser.get(player.id) ?? -100) < FIGHTER.laserEvery) return;
  lastLaser.set(player.id, now);
  const rot = player.getRotation();
  const look = lookVector(rot.y, rot.x);
  const side = lookVector(rot.y + 90, 0);
  const hit = new Set();
  for (const s of [1, -1]) {
    const from = { x: dart.location.x + side.x * 1.3 * s + look.x * 1.5, y: dart.location.y + 0.5, z: dart.location.z + side.z * 1.3 * s + look.z * 1.5 };
    let reach = FIGHTER.laserRange;
    try {
      const block = dart.dimension.getBlockFromRay(from, look, { maxDistance: FIGHTER.laserRange, includeLiquidBlocks: false, includePassableBlocks: false });
      if (block) reach = Math.hypot(block.block.x + block.faceLocation.x - from.x, block.block.y + block.faceLocation.y - from.y, block.block.z + block.faceLocation.z - from.z);
    } catch {
      reach = FIGHTER.laserRange;
    }
    const to = { x: from.x + look.x * reach, y: from.y + look.y * reach, z: from.z + look.z * reach };
    beam(dart.dimension, from, to, LASER, 0.7, 0.14);
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    for (const foe of foesNear(dart.dimension, mid, reach / 2 + 2)) {
      if (hit.has(foe.id) || distToSegment(center(foe, 0.9), from, to) > 1.6) continue;
      hit.add(foe.id);
      hurt(foe, FIGHTER.laserDamage);
    }
  }
  soundAt(dart.dimension, dart.location, "mob.shulker.shoot", 0.8, 1.6);
  actionBar(player, hit.size ? `§cPew pew!§r Hit ${hit.size} monster${hit.size === 1 ? "" : "s"}.` : "§cPew pew!");
}

// ------------------------------------------------------------ the main loop

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if (tick % 2 === 0) igniteCheck(player);
    deflectCheck(player);
    const dart = dartUnder(player);
    const before = ridingNow.get(player.id);
    if (dart && before !== dart.id) {
      ridingNow.set(player.id, dart.id);
      boardedDart(player);
    } else if (!dart && before) {
      ridingNow.delete(player.id);
      addEffect(player, "slow_falling", 200);
      actionBar(player, "");
    }
    if (dart && ridersOf(dart)[0]?.id === player.id) {
      flyDart(dart, player, tick);
      if (tick % 20 === 0) addEffect(player, "resistance", 40, 2);
    }
  }
  for (const m of movers.values()) if (m.drivenTick !== tick) settleDart(m, tick);
  if (tick % 20 === 0) {
    stepTrainings(tick);
    duelShield();
  }
  if (tick % DROID_ZAP.every === 0) droidZaps(tick);
  if (tick % 200 === 0) {
    for (const id of deflected) if (!world.getEntity(id)) deflected.delete(id);
  }
}, 1);

// Star Darts left in the air drift down.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    for (const dart of nearby(player.dimension, player.location, 96, { type: DART })) {
      if (!movers.has(dart.id) && !dart.isOnGround && !ridersOf(dart).length) movers.set(dart.id, { dart, vel: { x: 0, y: 0, z: 0 }, drivenTick: system.currentTick });
    }
  }
}, 40);

// ------------------------------------------------------------ kits and the Knight Comm

function placeKit(player, item, block, face) {
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);
  const at = aboveFace(block, face);
  let entity;
  if (item.typeId === DROID_KIT) {
    entity = spawnDroid(player, at);
  } else {
    try {
      entity = player.dimension.spawnEntity(DART, at);
      entity.setRotation({ x: 0, y: player.getRotation().y });
    } catch {
      entity = undefined;
    }
  }
  if (!entity) {
    actionBar(player, "There's no room for that here.");
    return;
  }
  sound(entity, item.typeId === DROID_KIT ? "note.chime" : "random.anvil_use", 0.7, 1.6);
  for (let i = 0; i < 8; i++) particle(entity.dimension, "minecraft:villager_happy", { x: entity.location.x + (Math.random() - 0.5) * 2, y: entity.location.y + Math.random() * 1.5, z: entity.location.z + (Math.random() - 0.5) * 2 });
  actionBar(player, item.typeId === DROID_KIT ? `§b${entity.nameTag} is here!§r It follows you and zaps monsters. Paint it with the Knight Comm.` : "§bStar Dart ready!§r Tap it to climb in.");
  useUpHeld(player, item.typeId);
}

function useComm(player) {
  const now = system.currentTick;
  if (now - (lastTap.get(player.id) ?? -100) < 4) return;
  lastTap.set(player.id, now);
  const dart = dartUnder(player);
  if (dart) {
    fireLasers(player, dart);
    return;
  }
  const k = knightOf(player);
  const form = new ActionFormData().title("§lKnight Comm")
    .body("Hold your §bStar Blade§r and tap for Star Powers:\n§eahead§r Push, §eup§r Lift, §edown§r Leap, §esneak§r Pull.")
    .button(k.duel ? "§6⚔ Duel Mode is ON§r\n§8Tap to switch it off" : "§2Duel Mode is off§r\n§8Tap to switch it on")
    .button("§lDroid Buddy§r\n§8Paint it or call it")
    .button("§lHow to play");
  form.show(player).then((res) => {
    if (res.canceled || !player.isValid) return;
    if (res.selection === 0) {
      k.duel = !k.duel;
      player.setDynamicProperty(DUEL_KEY, k.duel);
      if (k.duel) {
        title(player, "§6⚔ Duel Mode ON", "§7Hit another dueling knight with your blade to score");
        player.sendMessage("§6⚔ Duel Mode ON.§r When you and another knight both have it on, blade hits score points (first to 5 wins). Nobody gets hurt while you duel.");
      } else {
        title(player, "§2Duel Mode off", "§7Your blade only fights monsters and robots");
      }
    } else if (res.selection === 1) droidMenu(player);
    else if (res.selection === 2) howToPlay(player);
  }).catch(() => {
    // The form couldn't open.
  });
}

function howToPlay(player) {
  const text = [
    "§lStar Blades:§r hold one to light it up. Hit monsters and robots with it. Each crystal color makes its own blade, and there are two rainbow ones!",
    "§lStar Powers:§r hold your blade and tap. Look §eahead§r for Star Push, look §eup§r for Star Lift, look §edown§r for Star Leap, §esneak§r for Star Pull (it grabs dropped things too).",
    "§lBlaster bolts:§r hold your blade and look at a Clank Trooper: its bolts bounce back at it!",
    "§lThe temple:§r tap the §eTemple Kit§r on open land (tap twice to build, sneak and tap twice to undo). Tap crystals in the crystal cave, then tap the §bBlade Workbench§r with a crystal to build a blade. Tap the §cTraining Console§r for 3 waves of robots.",
    "§lDroid Buddy:§r it follows you and zaps monsters. Paint it or call it with this Knight Comm. Sneak and hit it 3 times to pack it up.",
    "§lStar Dart:§r tap it to climb in, look and push forward to fly, hold jump to climb, tap your blade or this comm to fire lasers. Hit it 3 times to pack it up.",
    "§lDuel Mode:§r both knights switch it on here, then blade hits score points. First to 5 wins. Nobody gets hurt.",
  ].join("\n\n");
  new ActionFormData().title("§lHow to play").body(text).button("Got it!").show(player).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ the temple builder

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
  if (dimension.id !== "minecraft:overworld") return { error: "Temples can only be built in the Overworld." };
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
      if (!ground) return { error: "Stand in the middle of where you want the temple, then try again." };
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
    if (i % 48 === 47) yield;
  }
}

function finish(player, site, plan, record) {
  const { dimension } = site;
  const t = { x0: site.x0, z0: site.z0, floorY: site.floorY };
  try {
    const dart = dimension.spawnEntity(DART, toWorld(t, plan.spawns.fighter));
    dart.setRotation({ x: 0, y: 180 });
    dart.addTag(record.tag);
  } catch {
    // The temple still works without it.
  }
  if (player.isValid) spawnDroid(player, toWorld(t, plan.spawns.droid), record.tag);
  system.runTimeout(() => {
    try {
      dimension.getBlock(toWorld(t, plan.sign))?.getComponent("minecraft:sign")?.setText(`${record.owner}'s\nStar Knight\nTemple\n\nKnights welcome!`);
    } catch {
      // A blank sign is fine.
    }
  }, 10);
  loadTemples();
  temples = temples.filter((x) => x.dim !== record.dim || Math.abs(x.x0 - t.x0) >= SIZE || Math.abs(x.z0 - t.z0) >= SIZE);
  temples.push({ id: record.id, tag: record.tag, dim: record.dim, x0: t.x0, z0: t.z0, floorY: t.floorY, owner: record.owner });
  if (temples.length > 40) temples.shift();
  saveTemples();
  if (player.isValid) {
    title(player, "§eStar Knight Temple", "Your temple is ready!");
    sound(player, "random.levelup", 1, 1);
    player.sendMessage("§aYour Star Knight Temple is ready!§r Find the §dcrystal cave§r at the back, build blades at the §bBlade Workbench§r, and tap the §cTraining Console§r to fight robots. §7(Sneak and tap the Temple Kit twice to undo it.)");
  }
}

function startBuild(player, site) {
  const plan = planTemple();
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const record = {
    id: `bendertemple:t${seed.toString(36)}`,
    tag: `bender_temple_${seed.toString(36)}`,
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
  actionBar(player, "§eBuilding your Star Knight Temple...");
  system.runJob(buildJob(player, site, plan, record));
}

function undo(player) {
  const raw = player.getDynamicProperty(LAST_KEY);
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a temple to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = dimensionOf(record.dim);
  const cx = record.x + SIZE / 2;
  const cz = record.z + SIZE / 2;
  if (!dimension || player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 48) {
    actionBar(player, "Go back to your temple to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the temple. Stand in the middle of it and try again.");
    return;
  }
  for (const e of dimension.getEntities({ tags: [record.tag] })) {
    try {
      e.remove();
    } catch {
      // Already gone.
    }
  }
  for (const t of [...trainings.values()]) if (t.dim === record.dim && Math.hypot(t.pads[0].x - cx, t.pads[0].z - cz) < 40) endTraining(t, "");
  try {
    world.structureManager.delete(record.id);
  } catch {
    // Already gone.
  }
  loadTemples();
  temples = temples.filter((x) => x.tag !== record.tag);
  saveTemples();
  player.setDynamicProperty(LAST_KEY, undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe temple is gone and the land is back the way it was.");
}

function useTempleKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undo(player);
    } else if (typeof player.getDynamicProperty(LAST_KEY) === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last temple?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a temple to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, a temple is still being built!");
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
  player.sendMessage("§eYour Star Knight Temple will fill the sparkly square.§r Everything inside gets replaced.");
  actionBar(player, "§aTap Build Temple! again to build here.");
}

// ------------------------------------------------------------ registering items and blocks

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:star_blade", {
    onUse(event) {
      const { source: player, itemStack } = event;
      system.run(() => useBlade(player, itemStack));
    },
    onUseOn(event) {
      const player = event.source;
      if (player?.typeId !== "minecraft:player") return;
      const item = event.itemStack;
      system.run(() => useBlade(player, item));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:knight_comm", {
    onUse(event) {
      const player = event.source;
      system.run(() => useComm(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:knights_temple_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useTempleKit(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:knights_kit", {
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
  blockComponentRegistry.registerCustomComponent("bender:knights_crystal", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => pickCrystal(block, player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:knights_workbench", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => useWorkbench(block, player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:knights_console", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => useConsole(block, player));
    },
  });
});

// ------------------------------------------------------------ descriptions and the welcome gift

const LORE = {
  blade: ["§eTap: Star Power (look ahead, up, down)", "§eSneak + tap: Star Pull", "§7Bounces blaster bolts back"],
  crystal: ["§7Tap the Blade Workbench with it", "§7to build a Star Blade this color"],
  [COMM]: ["§eTap: Duel Mode, droid, how to play", "§7In the Star Dart: fire lasers"],
  [TEMPLE_KIT]: ["§eTap on open land to build a temple", "§7Sneak + tap twice to undo it"],
  [DROID_KIT]: ["§eTap the ground: a droid that follows you", "§7It zaps monsters. Paint it with the comm"],
  [DART_KIT]: ["§eTap the ground to land it here", "§7Look and push forward to fly", "§7Tap your blade or comm: lasers"],
  [WORKBENCH_ID]: ["§7Tap it with a Star Crystal"],
  [CONSOLE_ID]: ["§7Tap it to fight robot waves"],
  [CRYSTAL_ID]: ["§7Tap it to pick a Star Crystal"],
};

function loreFor(typeId) {
  if (BLADE_IDS.has(typeId)) return LORE.blade;
  if (colorOf(typeId)) return LORE.crystal;
  return LORE[typeId];
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item) continue;
      const lore = loreFor(item.typeId);
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

function giveStarter(player, index) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  const color = COLORS[index] ?? COLORS[0];
  const blade = new ItemStack(bladeId(color), 1);
  blade.setLore(LORE.blade);
  giveOrDrop(player, blade);
  for (const id of [COMM, TEMPLE_KIT, DROID_KIT, DART_KIT]) {
    const item = new ItemStack(id, 1);
    item.setLore(LORE[id]);
    giveOrDrop(player, item);
  }
  title(player, colorful(color, `${color.name} Star Blade!`), "§7Hold it and tap for Star Powers");
  player.sendMessage(`Welcome, Star Knight! You got a ${colorful(color, `${color.name} Star Blade`)}§r, a §bKnight Comm§r, a §eTemple Kit§r, a §bDroid Buddy§r and a §bStar Dart§r. Hold your blade and tap: look §eahead§r to Push, §eup§r to Lift, §edown§r to Leap, §esneak§r to Pull.`);
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lPick your first Star Blade!").body("You can build the others later with Star Crystals.");
  for (const c of COLORS) form.button(colorful(c, `§l${c.name}`), `textures/items/star_knights/blade_${c.key}`);
  form.show(player).then((res) => {
    if (res.canceled) {
      if (res.cancelationReason === FormCancelationReason.UserBusy && tries < 15) {
        system.runTimeout(() => starterForm(player, tries + 1), 40);
        return;
      }
      giveStarter(player, 0);
      return;
    }
    giveStarter(player, res.selection ?? 0);
  }).catch(() => giveStarter(player, 0));
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  // Say which version is running, so an old copy of the add-on is easy to spot.
  system.runTimeout(() => {
    if (player.isValid) player.sendMessage(`§7Bender Star Knights §fv${PACK_VERSION}§7 is on.`);
  }, 40);
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  system.runTimeout(() => starterForm(player, 0), 80);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  knights.delete(playerId);
  lastHeld.delete(playerId);
  lastTap.delete(playerId);
  ridingNow.delete(playerId);
  for (const t of [...trainings.values()]) if (t.playerId === playerId) endTraining(t, "");
});
