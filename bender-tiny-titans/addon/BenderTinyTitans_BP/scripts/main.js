// Bender Tiny Titans: three size suits. Shrink tiny, grow giant, grab and throw monsters,
// stomp, fly on Firefly wings, ride ants, throw Size Discs at mobs, and dive into the
// Micro Realm.
//
// Powers only ever hurt monsters and bosses: never players, pets or animals.
// Size Discs never work on players (or babies).

import {
  system,
  world,
  BlockPermutation,
  ButtonState,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  InputButton,
  ItemStack,
  MolangVariableMap,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  ANTS,
  COLONY,
  DISC_MOBS,
  PIECES,
  REALM,
  REALM_CRYSTAL_REGROW,
  STING,
  SUITS,
  THROW_DAMAGE,
  TINY_PUNCH,
  canRide,
  discStep,
  fullSuit,
  inRealm,
  isStomp,
  pieceId,
  sizeGroup,
  steer,
  stingTargets,
  stompDamage,
  switchAction,
  throwVector,
  wingStep,
} from "./sizes.js";
import { CRYSTAL_ID, PORTAL_ID, planRealm } from "./realm.js";

const PACK_VERSION = "1.0.0";
const SWITCH = "bender:size_switch";
const COLONY_ITEM = "bender:ant_colony";
const CRYSTAL_ITEM = "bender:micro_crystal";
const SHRINK_DISC = "bender:shrink_disc";
const GROW_DISC = "bender:grow_disc";
const SHOTS = { "bender:shrink_disc_shot": "shrink", "bender:grow_disc_shot": "grow" };
const WORKER = "bender:worker_ant";
const FLYER = "bender:flying_ant";
const WELCOME_KEY = "bender:titans_welcomed";
const SIZE_KEY = "bender:titans_size"; // a player's size ("normal", "tiny", "giant"), and a mob's or ant's
const SUIT_KEY = "bender:titans_suit"; // the suit a player's size came from
const EYES_KEY = "bender:titans_own_eyes"; // true: keep your own camera when tiny or giant
const HOME_KEY = "bender:titans_home"; // where to go back to from the Micro Realm
const REALM_KEY = "bender:titans_realm_built";
const BOSSES = new Set(["bender:element_guardian", "bender:ender_dragon", "minecraft:ender_dragon"]);
const OURS = new Set([WORKER, FLYER, ...Object.keys(SHOTS)]);
const DISCABLE = new Set([...DISC_MOBS, WORKER, FLYER]);
const SLOTS = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
const WHITE = { red: 1, green: 1, blue: 1 };
const SHRINK_COLOR = { red: 0.3, green: 0.6, blue: 1 };
const GROW_COLOR = { red: 1, green: 0.3, blue: 0.3 };
const STING_COLOR = { red: 0.8, green: 1, blue: 0.3 };
const REALM_COLORS = [
  { red: 0.6, green: 0.3, blue: 1 },
  { red: 0.3, green: 0.9, blue: 1 },
  { red: 1, green: 0.4, blue: 0.9 },
  { red: 0.5, green: 1, blue: 0.6 },
];
const SIZE_NAMES = { tiny: "tiny", normal: "normal size", giant: "giant" };

const titans = new Map(); // player id -> state
const lastTap = new Map(); // player id -> tick (taps can arrive twice)
const lastColony = new Map(); // player id -> tick the colony last sent ants
const grabs = new Map(); // monster id -> { entity, player, until }
const movers = new Map(); // flying ant id -> velocity
const crystalTaken = new Map(); // "x y z" -> tick it can be picked again
const arriving = new Map(); // player id -> tick they started arriving in the realm

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
    player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 15 });
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

function dot(dimension, location, color, size = 0.1) {
  try {
    const vars = new MolangVariableMap();
    vars.setColorRGB("variable.color", color);
    vars.setFloat("variable.size", size);
    dimension.spawnParticle("bender:titans_dot", location, vars);
  } catch {
    // Skip a sparkle that can't spawn.
  }
}

function ring(dimension, at, radius, color, count = 16, size = 0.14) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    dot(dimension, { x: at.x + Math.cos(a) * radius, y: at.y, z: at.z + Math.sin(a) * radius }, color, size);
  }
}

function beam(dimension, from, to, color, step = 0.4, size = 0.1) {
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

function removeEffect(entity, effect) {
  try {
    entity.removeEffect(effect);
  } catch {
    // It wasn't there.
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

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

/** Only monsters and bosses: never players, pets, animals or our ants. */
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

/** Tiny Titans hits are "magic", so monsters don't get angry at anyone else. */
function hurt(target, amount) {
  if (!target?.isValid) return;
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

function worn(player) {
  const eq = player.getComponent("minecraft:equippable");
  return SLOTS.map((slot) => {
    try {
      return eq?.getEquipment(slot)?.typeId;
    } catch {
      return undefined;
    }
  });
}

function lookFlat(player) {
  const yaw = player.getRotation().y * (Math.PI / 180);
  return { x: -Math.sin(yaw), z: Math.cos(yaw) };
}

/** Taps can arrive twice (use and use-on): only count one every few ticks. */
function freshTap(player) {
  const now = system.currentTick;
  if (now - (lastTap.get(player.id) ?? -100) < 5) return false;
  lastTap.set(player.id, now);
  return true;
}

// ------------------------------------------------------------ sizes

function stateOf(player) {
  let s = titans.get(player.id);
  if (!s) {
    const size = player.getDynamicProperty(SIZE_KEY);
    s = {
      size: size === "tiny" || size === "giant" ? size : "normal",
      suit: /** @type {string | undefined} */ (player.getDynamicProperty(SUIT_KEY)) || undefined,
      wings: { flying: false, lastBoost: -100 },
      lastVy: 0,
      wasOnGround: true,
      camera: /** @type {string | undefined} */ (undefined),
      squeezed: false,
    };
    titans.set(player.id, s);
  }
  return s;
}

function suitByKey(key) {
  return SUITS.find((s) => s.key === key);
}

/** Things you can grow into: air, water, grass, flowers, torches... */
const SOFT = /air|water|lava|grass|fern|flower|torch|sapling|snow_layer|vine|carpet|button|lever|rail|sign|banner|bush|tulip|daisy|orchid|allium|poppy|dandelion|cornflower|lily|mushroom|dead_bush|seagrass|kelp|web|pressure_plate|tripwire|redstone_wire/;

function roomToGrow(player) {
  const { x, y, z } = player.location;
  for (const dy of [0.1, 1, 1.75]) {
    try {
      const b = player.dimension.getBlock({ x, y: y + dy, z });
      if (b && !b.isAir && !b.isLiquid && !SOFT.test(b.typeId)) return false;
    } catch {
      // Unloaded: assume there's room.
    }
  }
  return true;
}

function cameraFor(s) {
  if (s.size === "tiny") return "bender:tiny_view";
  if (s.size === "giant") return s.suit === "mega" ? "bender:mega_view" : "bender:giant_view";
  return undefined;
}

/** Tiny and giant players see themselves from just behind (unless they picked their own eyes). */
function applyCamera(player, s, force = false) {
  const want = player.getDynamicProperty(EYES_KEY) ? undefined : cameraFor(s);
  if (want === s.camera && !force) return;
  try {
    if (want) player.camera.setCamera(want);
    else player.camera.clear();
    s.camera = want;
  } catch {
    // Cameras unavailable: you still change size.
  }
}

/** Change size. Returns false when there isn't room to grow. */
function setSize(player, suit, size, quiet = false) {
  const s = stateOf(player);
  if (s.size === "tiny" && size !== "tiny" && !roomToGrow(player)) {
    if (!quiet) {
      actionBar(player, "§eNo room to grow here! Find some space first.");
      sound(player, "note.bass", 0.8, 0.8);
    }
    return false;
  }
  const from = s.size;
  try {
    player.triggerEvent(`bender:size_${sizeGroup(suit, size)}`);
  } catch {
    return false;
  }
  s.size = size;
  s.suit = size === "normal" ? undefined : suit?.key;
  s.wings.flying = false;
  s.squeezed = false;
  player.setDynamicProperty(SIZE_KEY, size);
  player.setDynamicProperty(SUIT_KEY, s.suit ?? "");
  applyCamera(player, s);
  sizeEffects(player, s, true);
  if (!quiet) {
    const smaller = (from === "giant" && size !== "giant") || size === "tiny";
    const color = suit ? rgbOf(suit.hex) : WHITE;
    for (let i = 0; i < 3; i++) ring(player.dimension, { x: player.location.x, y: player.location.y + 0.2 + i * 0.5, z: player.location.z }, 0.9 - i * 0.2, i === 1 ? WHITE : color, 14);
    sound(player, smaller ? "random.pop" : "mob.irongolem.repair", 1, smaller ? 1.8 : 0.6);
    if (size === "tiny") actionBar(player, `${suit?.color ?? ""}§lTiny!§r §7Look ahead + tap: normal size. Look down + tap: Micro Realm.`);
    else if (size === "giant") actionBar(player, `${suit?.color ?? ""}§lGiant!§r §7Punch monsters to throw them. Jump to stomp!`);
    else actionBar(player, "§fNormal size.");
  }
  return true;
}

/** Tiny is quick, giants jump high (to stomp) and are tough. */
function sizeEffects(player, s, now = false) {
  const suit = suitByKey(s.suit);
  if (!suit || s.size === "normal") {
    if (now) {
      for (const e of ["speed", "jump_boost", "resistance"]) removeEffect(player, e);
    }
    return;
  }
  if (s.size === "tiny") {
    if (suit.key !== "firefly") addEffect(player, "speed", 60, 1);
    if (now) removeEffect(player, "jump_boost");
  } else {
    addEffect(player, "jump_boost", 60, suit.key === "mega" ? 2 : 1);
    addEffect(player, "resistance", 60, suit.key === "mega" ? 1 : 0);
    if (now) removeEffect(player, "speed");
  }
}

function useSwitch(player) {
  if (!freshTap(player)) return;
  if (player.isSneaking) {
    switchMenu(player);
    return;
  }
  const s = stateOf(player);
  const realm = player.dimension.id === "minecraft:overworld" && inRealm(player.location);
  const suit = fullSuit(worn(player));
  if (!realm && !suit) {
    title(player, "§eWear a size suit!", "§7All 4 pieces: Pocket, Firefly or Mega");
    sound(player, "note.bass", 0.8, 0.8);
    return;
  }
  const action = switchAction(s.size, player.getRotation().x, realm);
  if (action === "home") leaveRealm(player);
  else if (action === "realm") enterRealm(player);
  else if (action === "need_tiny") actionBar(player, "§eShrink first (look ahead and tap), then look down and tap to dive into the §bMicro Realm§e!");
  else setSize(player, suit, action);
}

function switchMenu(player) {
  const s = stateOf(player);
  const suit = fullSuit(worn(player));
  const realm = player.dimension.id === "minecraft:overworld" && inRealm(player.location);
  const ownEyes = !!player.getDynamicProperty(EYES_KEY);
  /** @type {[string, () => void][]} */
  const buttons = [];
  if (suit) {
    if (s.size !== "tiny") buttons.push(["§9§lShrink tiny", () => setSize(player, suit, "tiny")]);
    if (s.size !== "normal") buttons.push(["§f§lNormal size", () => setSize(player, suit, "normal")]);
    if (s.size !== "giant") buttons.push(["§c§lGrow giant", () => setSize(player, suit, "giant")]);
  }
  if (realm) buttons.push(["§b§lGo home", () => leaveRealm(player)]);
  else if (suit && s.size === "tiny") buttons.push(["§b§lMicro Realm", () => enterRealm(player)]);
  buttons.push([ownEyes ? "§lCamera: §7my own eyes" : "§lCamera: §7follow me", () => {
    player.setDynamicProperty(EYES_KEY, !ownEyes);
    applyCamera(player, stateOf(player), true);
    actionBar(player, ownEyes ? "§7When you're tiny or giant, the camera follows you from behind." : "§7You'll always see through your own eyes.");
  }]);
  buttons.push(["§6§lCall my ants", () => callAnts(player, true)]);
  buttons.push(["§d§lSwap suit", () => suitCloset(player)]);
  buttons.push(["§lHow to play", () => howToPlay(player)]);
  const form = new ActionFormData().title("§lSize Switch").body(suit ? `You're wearing the ${suit.color}${suit.name}§r. You're §l${SIZE_NAMES[s.size]}§r.` : "Wear all 4 pieces of a size suit to change size.");
  for (const [label] of buttons) form.button(label);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    buttons[res.selection]?.[1]();
  }).catch(() => {});
}

/** Put on a different suit (your old armor goes into your bag, old size suits disappear). */
function suitCloset(player) {
  const form = new ActionFormData().title("§lSwap suit").body("Pick a size suit to wear.");
  for (const suit of SUITS) form.button(`${suit.color}§l${suit.name}\n§r§8${suit.about}`, `textures/items/titans/${suit.key}_chestplate`);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    const suit = SUITS[res.selection];
    const s = stateOf(player);
    if (s.size !== "normal" && !setSize(player, suitByKey(s.suit), "normal", true)) {
      actionBar(player, "§eGrow back to normal size first (find some room).");
      return;
    }
    wearSuit(player, suit);
    title(player, `${suit.color}${suit.name}`, `§7${suit.perk}`);
    sound(player, "armor.equip_iron", 1, 1.2);
  }).catch(() => {});
}

function wearSuit(player, suit) {
  const eq = player.getComponent("minecraft:equippable");
  if (!eq) return;
  SLOTS.forEach((slot, i) => {
    const old = eq.getEquipment(slot);
    if (old && !SUITS.some((x) => old.typeId === pieceId(x, PIECES[i]))) giveOrDrop(player, old);
    const piece = new ItemStack(pieceId(suit, PIECES[i]), 1);
    piece.setLore(LORE.piece);
    eq.setEquipment(slot, piece);
  });
}

// ------------------------------------------------------------ tiny punches, stings, grab and throw

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !isFoe(hitEntity)) return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  const s = stateOf(player);
  const suit = suitByKey(s.suit);
  if (!suit || s.size === "normal" || fullSuit(worn(player))?.key !== suit.key) return;
  if (s.size === "tiny") {
    hurt(hitEntity, TINY_PUNCH);
    const at = center(hitEntity, 0.6);
    for (let i = 0; i < 6; i++) dot(hitEntity.dimension, { x: at.x + (Math.random() - 0.5), y: at.y + Math.random() * 0.6, z: at.z + (Math.random() - 0.5) }, WHITE, 0.1);
    sound(hitEntity, "random.anvil_land", 0.4, 2);
    if (suit.flies) sting(player, hitEntity);
    return;
  }
  // a giant: grab the monster, hold it up for a moment, then throw it
  if (BOSSES.has(hitEntity.typeId)) {
    hurt(hitEntity, THROW_DAMAGE);
    return;
  }
  if (grabs.has(hitEntity.id)) return;
  grabs.set(hitEntity.id, { entity: hitEntity, player, until: system.currentTick + 12 });
  sound(player, "mob.irongolem.throw", 1, 0.7);
  actionBar(player, "§lGot it!§r §7...and THROW!");
});

/** The Firefly sting: a zap that jumps from the monster you hit to the next ones. */
function sting(player, first) {
  const from = center(first, 0.6);
  const others = foesNear(first.dimension, from, STING.range).filter((f) => f.id !== first.id).map((f) => ({ f, pos: center(f, 0.6) }));
  let prev = from;
  for (const { f, pos } of stingTargets(from, others)) {
    beam(first.dimension, prev, pos, STING_COLOR);
    hurt(f, STING.damage);
    prev = pos;
  }
  sound(first, "mob.bee.sting", 1, 1.4);
}

function holdGrabs(tick) {
  for (const [id, g] of grabs) {
    const { entity, player } = g;
    if (!entity.isValid || !player.isValid) {
      grabs.delete(id);
      continue;
    }
    const suit = suitByKey(stateOf(player).suit);
    const scale = suit?.giant ?? 2;
    const look = lookFlat(player);
    if (tick < g.until) {
      try {
        entity.teleport({ x: player.location.x + look.x * scale * 0.7, y: player.location.y + scale * 1.1, z: player.location.z + look.z * scale * 0.7 });
      } catch {
        grabs.delete(id);
      }
      continue;
    }
    grabs.delete(id);
    const v = throwVector(player.getRotation().y, player.getRotation().x, suit?.throwStrength ?? 3);
    fling(entity, v.x, v.z, v.up);
    hurt(entity, THROW_DAMAGE);
    sound(player, "random.bow", 1, 0.5);
    beam(entity.dimension, center(player, scale), center(entity, 0.5), WHITE, 0.6, 0.12);
  }
}

/** A giant landing from a jump makes a shockwave that knocks monsters flying. */
function stomp(player, suit) {
  const at = player.location;
  for (const foe of foesNear(player.dimension, at, suit.stomp.radius)) {
    const dx = foe.location.x - at.x;
    const dz = foe.location.z - at.z;
    const d = Math.hypot(dx, dz) || 1;
    hurt(foe, stompDamage(suit.stomp, d));
    fling(foe, (dx / d) * 1.2, (dz / d) * 1.2, 0.5);
  }
  const color = rgbOf(suit.hex);
  for (let r = 1; r <= suit.stomp.radius; r += 1.5) ring(player.dimension, { x: at.x, y: at.y + 0.15, z: at.z }, r, r % 3 < 1.5 ? color : WHITE, Math.round(r * 6), 0.18);
  soundAt(player.dimension, at, "random.explode", 0.5, 1.6);
  soundAt(player.dimension, at, "dig.gravel", 1, 0.5);
  try {
    player.runCommand(`camerashake add @s ${suit.key === "mega" ? 0.5 : 0.3} 0.35 positional`);
  } catch {
    // No shake: still a stomp.
  }
}

// ------------------------------------------------------------ Firefly wings

function readInput(player) {
  let forward = 0;
  let jump = false;
  try {
    jump = player.isJumping;
  } catch {
    jump = false;
  }
  try {
    forward = player.inputInfo.getMovementVector().y;
    jump = jump || player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // Controls unavailable this tick.
  }
  const rot = player.getRotation();
  return { forward, jump, yaw: rot.y, pitch: rot.x };
}

function flyWings(player, s, tick) {
  const input = readInput(player);
  let onGround = true;
  let inWater = false;
  try {
    onGround = player.isOnGround;
    inWater = player.isInWater;
  } catch {
    onGround = true;
  }
  const out = wingStep(s.wings, { onGround, inWater, jump: input.jump, sneak: player.isSneaking, forward: input.forward, tick });
  if (out.levitate) {
    addEffect(player, "levitation", 6, out.levitate - 1);
    removeEffect(player, "slow_falling");
  } else if (out.glide) {
    removeEffect(player, "levitation");
    addEffect(player, "slow_falling", 10);
  } else if (out.dive) {
    removeEffect(player, "levitation");
    removeEffect(player, "slow_falling");
  }
  if (out.boost) {
    const v = player.getViewDirection();
    const flat = Math.hypot(v.x, v.z) || 1;
    fling(player, (v.x / flat) * out.boost, (v.z / flat) * out.boost, Math.max(0.05, v.y * out.boost * 0.6));
  }
  if (s.wings.flying && tick % 3 === 0) {
    dot(player.dimension, { x: player.location.x + (Math.random() - 0.5) * 0.3, y: player.location.y + 0.2, z: player.location.z + (Math.random() - 0.5) * 0.3 }, { red: 1, green: 0.95, blue: 0.4 }, 0.05);
  }
}

// ------------------------------------------------------------ Size Discs

function sizeOfMob(entity) {
  const v = entity.getDynamicProperty(SIZE_KEY);
  return v === "tiny" || v === "giant" ? v : "normal";
}

world.afterEvents.projectileHitEntity.subscribe((event) => {
  let kind;
  try {
    kind = SHOTS[event.projectile.typeId];
  } catch {
    return;
  }
  if (!kind) return;
  const target = event.getEntityHit()?.entity;
  const thrower = event.source?.typeId === "minecraft:player" ? /** @type {import("@minecraft/server").Player} */ (event.source) : undefined;
  if (!target?.isValid) return;
  const color = kind === "grow" ? GROW_COLOR : SHRINK_COLOR;
  const tell = (msg) => {
    if (thrower) actionBar(thrower, msg);
  };
  if (target.typeId === "minecraft:player") {
    ring(target.dimension, center(target, 1), 0.6, color, 10);
    tell("§7Size Discs don't work on players: use a Size Switch!");
    return;
  }
  if (!DISCABLE.has(target.typeId)) {
    tell("§7Size Discs work on zombies, skeletons, creepers, spiders, pigs, cows, sheep, chickens and ants.");
    return;
  }
  if (target.getComponent("minecraft:is_baby")) {
    tell("§7That baby is already small!");
    return;
  }
  const from = sizeOfMob(target);
  const to = discStep(from, kind);
  if (to === from) {
    tell(kind === "grow" ? "§7It can't get any bigger!" : "§7It can't get any smaller!");
    ring(target.dimension, center(target, 0.5), 0.6, color, 10);
    return;
  }
  // don't grow something into a ceiling
  if (to === "giant" && !roomAbove(target, 4)) {
    tell("§7No room to grow it here!");
    return;
  }
  try {
    target.triggerEvent(`bender:size_${to}`);
    target.setDynamicProperty(SIZE_KEY, to);
  } catch {
    return;
  }
  const at = target.location;
  for (let i = 0; i < 4; i++) ring(target.dimension, { x: at.x, y: at.y + i * 0.5, z: at.z }, kind === "grow" ? 0.6 + i * 0.4 : 1.6 - i * 0.35, i % 2 ? WHITE : color, 14);
  soundAt(target.dimension, at, kind === "grow" ? "mob.irongolem.repair" : "random.pop", 1, kind === "grow" ? 0.6 : 1.8);
  tell(kind === "grow" ? `§cGrow!§r §7It's ${SIZE_NAMES[to]} now.` : `§9Shrink!§r §7It's ${SIZE_NAMES[to]} now.`);
});

function roomAbove(entity, height) {
  const { x, y, z } = entity.location;
  for (let dy = 1; dy <= height; dy++) {
    try {
      const b = entity.dimension.getBlock({ x, y: y + dy, z });
      if (b && !b.isAir && !b.isLiquid && !SOFT.test(b.typeId)) return false;
    } catch {
      // Unloaded: fine.
    }
  }
  return true;
}

// a disc that hits the ground drops back as an item, so you can pick it up again
world.afterEvents.projectileHitBlock.subscribe((event) => {
  let kind;
  try {
    kind = SHOTS[event.projectile.typeId];
  } catch {
    return;
  }
  if (!kind) return;
  const thrower = event.source;
  if (thrower?.typeId === "minecraft:player" && isCreative(/** @type {import("@minecraft/server").Player} */ (thrower))) return;
  try {
    event.dimension.spawnItem(new ItemStack(kind === "grow" ? GROW_DISC : SHRINK_DISC, 1), event.location);
  } catch {
    // Lost in the void.
  }
});

// ------------------------------------------------------------ ants

function antOwner(ant) {
  try {
    return ant.getComponent("minecraft:tameable")?.tamedToPlayerId;
  } catch {
    return undefined;
  }
}

function myAnts(player) {
  return nearby(player.dimension, player.location, 160, { families: ["bender_ant"] }).filter((a) => antOwner(a) === player.id);
}

function callAnts(player, say) {
  const mine = myAnts(player);
  mine.forEach((ant, i) => {
    const a = (i / Math.max(1, mine.length)) * Math.PI * 2;
    try {
      if (ant.getComponent("minecraft:rideable")?.getRiders().length) return;
      ant.teleport({ x: player.location.x + Math.cos(a) * 2, y: player.location.y + (ant.typeId === FLYER ? 1 : 0), z: player.location.z + Math.sin(a) * 2 });
    } catch {
      // Couldn't move that one.
    }
  });
  if (say) actionBar(player, mine.length ? `§6Here come your ${mine.length} ants!` : "§7You don't have any ants yet: tap an Ant Colony.");
  return mine.length;
}

function useColony(player) {
  if (!freshTap(player)) return;
  const now = system.currentTick;
  const mine = myAnts(player);
  if (player.isSneaking || mine.length >= COLONY.maxAnts) {
    callAnts(player, true);
    if (mine.length >= COLONY.maxAnts && !player.isSneaking) actionBar(player, `§6You have ${mine.length} ants: that's a whole colony! They came to you.`);
    return;
  }
  const wait = COLONY.cooldown - (now - (lastColony.get(player.id) ?? -COLONY.cooldown));
  if (wait > 0 && !isCreative(player)) {
    callAnts(player, false);
    actionBar(player, `§7The colony is busy digging. New ants in ${Math.ceil(wait / 20)}s. Your ants came to you.`);
    return;
  }
  lastColony.set(player.id, now);
  const kinds = [...Array(COLONY.workers).fill(WORKER), ...Array(COLONY.flyers).fill(FLYER)].slice(0, COLONY.maxAnts - mine.length);
  kinds.forEach((id, i) => {
    const a = (i / kinds.length) * Math.PI * 2 + Math.random();
    const at = { x: player.location.x + Math.cos(a) * 2, y: player.location.y + (id === FLYER ? 1 : 0.2), z: player.location.z + Math.sin(a) * 2 };
    try {
      const ant = player.dimension.spawnEntity(id, at);
      ant.getComponent("minecraft:tameable")?.tame(player);
      ant.triggerEvent("bender:on_tame");
      ant.setDynamicProperty(SIZE_KEY, "normal");
      for (let k = 0; k < 6; k++) dot(player.dimension, { x: at.x + (Math.random() - 0.5), y: at.y + Math.random() * 0.4, z: at.z + (Math.random() - 0.5) }, { red: 0.55, green: 0.35, blue: 0.2 }, 0.12);
    } catch {
      // No room there.
    }
  });
  sound(player, "dig.gravel", 1, 0.8);
  title(player, "§6§lAnts!", "§7Shrink tiny and tap one to ride it");
}

/** Tiny riders only, unless the ant is giant. Flying ants are flown here. */
function stepRiders(tick) {
  for (const player of world.getAllPlayers()) {
    let ant;
    try {
      ant = player.getComponent("minecraft:riding")?.entityRidingOn;
    } catch {
      ant = undefined;
    }
    if (!ant?.isValid || (ant.typeId !== WORKER && ant.typeId !== FLYER)) continue;
    const s = stateOf(player);
    const antSize = sizeOfMob(ant);
    if (!canRide(s.size, antSize)) {
      try {
        ant.getComponent("minecraft:rideable")?.ejectRider(player);
      } catch {
        // Try again next tick.
      }
      actionBar(player, "§eYou're too big for this ant! §7Shrink tiny first, or make the ant giant with a §cGrow Disc§7.");
      continue;
    }
    if (ant.typeId !== FLYER) continue;
    const input = readInput(player);
    const speed = ANTS[FLYER].speed * (antSize === "giant" ? 1.5 : antSize === "tiny" ? 0.7 : 1);
    try {
      const vel = steer(speed, movers.get(ant.id) ?? { x: 0, y: 0, z: 0 }, input, { onGround: ant.isOnGround });
      movers.set(ant.id, vel);
      ant.clearVelocity();
      ant.applyImpulse(vel);
      ant.setRotation({ x: 0, y: input.yaw });
    } catch {
      movers.delete(ant.id);
    }
    if (tick % 40 === 0) actionBar(player, "§7Flying ant: look where to go and push forward. Hold jump to climb. Sneak to get off.");
  }
  if (tick % 100 === 0) {
    for (const id of [...movers.keys()]) {
      if (!world.getEntity(id)?.isValid) movers.delete(id);
    }
  }
}

// ------------------------------------------------------------ the Micro Realm

let realmPlan;
let realmBuilding = false;
const permCache = new Map();

function perm(id, states) {
  const key = id + JSON.stringify(states ?? {});
  let p = permCache.get(key);
  if (!p) {
    p = BlockPermutation.resolve(id, states);
    permCache.set(key, p);
  }
  return p;
}

function realmPos(p) {
  return { x: REALM.x + p.x, y: REALM.y + p.y, z: REALM.z + p.z };
}

function overworld() {
  return world.getDimension("overworld");
}

function playersInRealm() {
  return world.getAllPlayers().filter((p) => p.dimension.id === "minecraft:overworld" && inRealm(p.location));
}

/** Build (or repair) the realm while someone is there to load it. The platform goes first. */
function buildRealm() {
  if (realmBuilding) return;
  realmBuilding = true;
  realmPlan ??= planRealm();
  const dim = overworld();
  let pending = realmPlan.ops;
  system.runJob(
    (function* () {
      for (let pass = 0; pass < 60 && pending.length; pass++) {
        const missed = [];
        for (const op of pending) {
          try {
            const b = dim.getBlock(realmPos(op));
            if (!b) missed.push(op);
            else if (b.typeId !== op.id) b.setPermutation(perm(op.id, op.states));
          } catch {
            missed.push(op);
          }
          yield;
        }
        pending = missed;
        if (!pending.length || !playersInRealm().length) break;
        const until = system.currentTick + 30;
        while (system.currentTick < until) yield;
      }
      if (!pending.length) world.setDynamicProperty(REALM_KEY, true);
      realmBuilding = false;
    })(),
  );
}

function portalThere() {
  realmPlan ??= planRealm();
  try {
    return overworld().getBlock(realmPos(realmPlan.portal))?.typeId === PORTAL_ID;
  } catch {
    return false;
  }
}

function enterRealm(player) {
  realmPlan ??= planRealm();
  const home = { dim: player.dimension.id, x: player.location.x, y: player.location.y, z: player.location.z };
  player.setDynamicProperty(HOME_KEY, JSON.stringify(home));
  const spawn = realmPos(realmPlan.spawn);
  try {
    player.teleport(spawn, { dimension: overworld(), rotation: { x: 10, y: 180 } });
  } catch {
    actionBar(player, "§7The Micro Realm is busy. Try again!");
    return;
  }
  arriving.set(player.id, system.currentTick);
  addEffect(player, "slow_falling", 200);
  addEffect(player, "resistance", 200, 4);
  title(player, "§b§lMicro Realm", "§7A whole world too small to see");
  soundAt(overworld(), spawn, "beacon.activate", 1, 1.6);
}

/** Hold new arrivals still until the platform is there under them. */
function stepArrivals(tick) {
  for (const [id, since] of arriving) {
    const player = world.getEntity(id);
    if (!player?.isValid) {
      arriving.delete(id);
      continue;
    }
    realmPlan ??= planRealm();
    const ready = portalThere();
    if (!ready && !realmBuilding) buildRealm();
    if (ready || tick - since > 20 * 15) {
      arriving.delete(id);
      if (ready && !world.getDynamicProperty(REALM_KEY)) buildRealm(); // finish the islands
      if (ready) {
        const p = /** @type {import("@minecraft/server").Player} */ (player);
        p.sendMessage("§bMicro Realm§r: hop along the glowing bridges to the islands and tap §bMicro Crystals§r to collect them. Tap your §bSize Switch§r (or the swirling portal) to go home.");
      }
      continue;
    }
    try {
      player.teleport(realmPos(realmPlan.spawn), { dimension: overworld() });
    } catch {
      // Next tick.
    }
    if (tick % 10 === 0) actionBar(/** @type {import("@minecraft/server").Player} */ (player), "§bShrinking into the Micro Realm...");
  }
}

function leaveRealm(player) {
  let home;
  try {
    home = JSON.parse(/** @type {string} */ (player.getDynamicProperty(HOME_KEY) ?? ""));
  } catch {
    home = undefined;
  }
  arriving.delete(player.id);
  let float = 100;
  try {
    if (home && !inRealm(home)) {
      player.teleport({ x: home.x, y: home.y, z: home.z }, { dimension: world.getDimension(home.dim) });
    } else {
      // no saved spot: drop gently onto your spawn point from high up
      const spot = player.getSpawnPoint() ?? { ...world.getDefaultSpawnLocation(), dimension: overworld() };
      player.teleport({ x: spot.x + 0.5, y: Math.min(spot.y, 300) + 1, z: spot.z + 0.5 }, { dimension: spot.dimension });
      float = 20 * 90;
    }
  } catch {
    actionBar(player, "§7Couldn't go home just now. Try again!");
    return;
  }
  removeEffect(player, "resistance");
  addEffect(player, "slow_falling", float);
  title(player, "§fHome again", "§7Back from the Micro Realm");
  sound(player, "beacon.deactivate", 1, 1.4);
}

function pickCrystal(block, player) {
  const key = `${block.x} ${block.y} ${block.z}`;
  const now = system.currentTick;
  const ready = crystalTaken.get(key) ?? 0;
  if (now < ready) {
    actionBar(player, `§7This crystal is still growing: ${Math.ceil((ready - now) / 20)}s`);
    return;
  }
  crystalTaken.set(key, now + REALM_CRYSTAL_REGROW);
  const item = new ItemStack(CRYSTAL_ITEM, 1);
  item.setLore(LORE[CRYSTAL_ITEM]);
  giveOrDrop(player, item);
  for (let i = 0; i < 8; i++) dot(block.dimension, { x: block.x + Math.random(), y: block.y + 1 + Math.random() * 0.5, z: block.z + Math.random() }, REALM_COLORS[1], 0.1);
  sound(player, "random.orb", 1, 1.6);
  actionBar(player, "§bMicro Crystal!§r §7Craft it with lapis or redstone for 8 Size Discs.");
}

/** Floating gently, glowing bits in the air, and a catch if you fall off. */
function stepRealm(tick) {
  realmPlan ??= planRealm();
  for (const player of playersInRealm()) {
    if (tick % 20 === 0) {
      addEffect(player, "slow_falling", 60);
      addEffect(player, "night_vision", 400);
    }
    for (let i = 0; i < 2; i++) {
      dot(player.dimension, { x: player.location.x + (Math.random() - 0.5) * 12, y: player.location.y + Math.random() * 5, z: player.location.z + (Math.random() - 0.5) * 12 }, REALM_COLORS[(tick + i) % REALM_COLORS.length], 0.08);
    }
    if (player.location.y < REALM.y - 30) {
      try {
        player.teleport(realmPos(realmPlan.spawn), { dimension: overworld() });
        actionBar(player, "§bWhoops! The realm caught you.");
      } catch {
        // Next time.
      }
    }
    const p = realmPos(realmPlan.portal);
    if (!arriving.has(player.id) && Math.hypot(player.location.x - (p.x + 0.5), player.location.z - (p.z + 0.5)) < 1.1 && Math.abs(player.location.y - p.y) < 2.5) {
      leaveRealm(player);
    }
  }
}

// ------------------------------------------------------------ every tick

system.runInterval(() => {
  const tick = system.currentTick;
  holdGrabs(tick);
  stepRiders(tick);
  if (tick % 5 === 0) stepArrivals(tick);
  if (tick % 10 === 0) stepRealm(tick);
  for (const player of world.getAllPlayers()) {
    const s = stateOf(player);
    if (s.size === "normal") continue;
    const suit = suitByKey(s.suit);
    const wearing = fullSuit(worn(player));
    // took the suit off (or swapped it): back to normal, as soon as there's room
    if (!suit || wearing?.key !== suit.key) {
      if (tick % 10 === 0 && !setSize(player, wearing ?? suit, "normal", true) && !s.squeezed) {
        s.squeezed = true;
        actionBar(player, "§eYou'll grow back to normal when there's room.");
      }
      continue;
    }
    if (tick % 20 === 0) sizeEffects(player, s);
    if (s.size === "tiny" && suit.flies) flyWings(player, s, tick);
    if (s.size === "giant") {
      let vy = 0;
      let onGround = true;
      try {
        vy = player.getVelocity().y;
        onGround = player.isOnGround;
      } catch {
        continue;
      }
      if (onGround && !s.wasOnGround && isStomp(s.lastVy)) stomp(player, suit);
      s.lastVy = vy;
      s.wasOnGround = onGround;
    }
  }
});

// the hint while holding the Size Switch
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (heldItem(player)?.typeId !== SWITCH) continue;
    const s = stateOf(player);
    const realm = player.dimension.id === "minecraft:overworld" && inRealm(player.location);
    if (realm) actionBar(player, "§bMicro Realm§7: tap to go home");
    else if (s.size === "tiny") actionBar(player, "§9Tiny§7 · tap: normal · look up + tap: giant · look down + tap: Micro Realm");
    else if (s.size === "giant") actionBar(player, "§cGiant§7 · tap: normal · punch monsters to throw · jump to stomp");
    else actionBar(player, "§7Tap: shrink · look up + tap: giant · sneak + tap: menu");
  }
}, 30);

// ------------------------------------------------------------ items and blocks

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:size_switch", {
    onUse(event) {
      const player = event.source;
      system.run(() => useSwitch(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:ant_colony", {
    onUse(event) {
      const player = event.source;
      system.run(() => useColony(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:micro_portal", {
    onPlayerInteract(event) {
      const { player } = event;
      if (!player) return;
      system.run(() => leaveRealm(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:micro_crystal_cluster", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => pickCrystal(block, player));
    },
  });
});

// ------------------------------------------------------------ descriptions and the welcome gift

const LORE = {
  piece: ["§7Wear all 4 pieces, then tap", "§7a §bSize Switch§7 to shrink or grow"],
  [SWITCH]: ["§eTap: shrink / normal size", "§eLook up + tap: giant", "§eLook down + tap (tiny): Micro Realm", "§7Sneak + tap: menu"],
  [SHRINK_DISC]: ["§7Throw it at a mob to shrink it"],
  [GROW_DISC]: ["§7Throw it at a mob to make it giant"],
  [COLONY_ITEM]: ["§eTap: 2 worker ants and a flying ant", "§7Sneak + tap: call your ants", "§7Shrink tiny to ride them"],
  [CRYSTAL_ITEM]: ["§7From the Micro Realm", "§7Craft with lapis: 8 Shrink Discs", "§7Craft with redstone: 8 Grow Discs"],
};
const PIECE_IDS = new Set(SUITS.flatMap((s) => PIECES.map((p) => pieceId(s, p))));

function loreFor(typeId) {
  if (PIECE_IDS.has(typeId)) return LORE.piece;
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

function howToPlay(player) {
  const body = [
    "§lSize suits§r: wear all 4 pieces of the §9Pocket§r, §aFirefly§r or §cMega§r suit.",
    "",
    "§lSize Switch§r: tap to shrink §9tiny§r (tap again for normal). Look §eup§r and tap to grow §cgiant§r. Sneak and tap for the menu.",
    "",
    "§9Tiny§r: you're fast and can squeeze through tiny gaps. Your punches hit hard. Firefly wings: hold jump to fly, push forward to zoom, sneak to dive. A Firefly punch zaps the next monsters too!",
    "",
    "§cGiant§r: punch a monster to grab it and throw it. Jump and land to §lSTOMP§r! The Mega Suit grows the biggest.",
    "",
    "§lSize Discs§r: throw a §9Shrink Disc§r or a §cGrow Disc§r at a zombie, skeleton, creeper, spider, pig, cow, sheep, chicken or ant.",
    "",
    "§lAnts§r: tap the §6Ant Colony§r for 2 worker ants and a flying ant. Shrink tiny and tap an ant to ride it. Make an ant giant and anyone can ride it!",
    "",
    "§bMicro Realm§r: when you're tiny, look §edown§r and tap the Size Switch. Collect §bMicro Crystals§r there. Tap again (or step on the portal) to go home.",
    "",
    "§7Powers only hurt monsters: never players, pets or animals.",
  ].join("\n");
  new ActionFormData().title("§lHow to play").body(body).button("Got it!").show(player).catch(() => {});
}

function giveStarter(player, index) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  const suit = SUITS[index] ?? SUITS[0];
  const eq = player.getComponent("minecraft:equippable");
  SLOTS.forEach((slot, i) => {
    const piece = new ItemStack(pieceId(suit, PIECES[i]), 1);
    piece.setLore(LORE.piece);
    if (eq && !eq.getEquipment(slot)) eq.setEquipment(slot, piece);
    else giveOrDrop(player, piece);
  });
  for (const [id, count] of [[SWITCH, 1], [SHRINK_DISC, 8], [GROW_DISC, 8], [COLONY_ITEM, 1]]) {
    const item = new ItemStack(/** @type {string} */ (id), /** @type {number} */ (count));
    item.setLore(LORE[id]);
    giveOrDrop(player, item);
  }
  title(player, `${suit.color}§l${suit.name}!`, "§7Hold the Size Switch and tap to shrink");
  player.sendMessage(`Welcome, Tiny Titan! You're wearing the ${suit.color}${suit.name}§r. You also got a §bSize Switch§r, §9Shrink Discs§r, §cGrow Discs§r and an §6Ant Colony§r. Hold the Size Switch and tap to shrink; look up and tap to grow giant. Sneak and tap it for the menu.`);
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lPick your size suit!").body("You can swap suits later in the Size Switch menu (sneak + tap).");
  for (const s of SUITS) form.button(`${s.color}§l${s.name}\n§r§8${s.about}`, `textures/items/titans/${s.key}_chestplate`);
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
  const s = stateOf(player);
  if (!initialSpawn) {
    // back from respawning: normal size, normal camera
    if (s.size !== "normal") setSize(player, suitByKey(s.suit), "normal", true);
    applyCamera(player, s, true);
    return;
  }
  // joining: put the saved size back (the player file kept it), with its camera
  const suit = suitByKey(s.suit);
  if (s.size !== "normal" && suit && fullSuit(worn(player))?.key === suit.key) {
    try {
      player.triggerEvent(`bender:size_${sizeGroup(suit, s.size)}`);
    } catch {
      // The tick loop will sort it out.
    }
  }
  applyCamera(player, s, true);
  // Say which version is running, so an old copy of the add-on is easy to spot.
  system.runTimeout(() => {
    if (player.isValid) player.sendMessage(`§7Bender Tiny Titans §fv${PACK_VERSION}§7 is on.`);
  }, 40);
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  system.runTimeout(() => starterForm(player, 0), 80);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  titans.delete(playerId);
  lastTap.delete(playerId);
  arriving.delete(playerId);
  for (const [id, g] of grabs) if (g.player.id === playerId) grabs.delete(id);
});
