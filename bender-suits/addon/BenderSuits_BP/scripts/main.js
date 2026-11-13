// Bender Power Suits: eight flying power suits, a Power Glove that uses your
// suit's special power, and six gadgets.
//
// Wear a full suit to fly: hold jump to rocket up, push forward to boost, let
// go to glide down gently, sneak to dive. Flying and suit powers use Suit
// Power, which refills on the ground. Powers and gadgets only ever hurt
// monsters (and bosses), never players, pets or animals, and never break blocks.
// The numbers live in suits.js; this file does the Minecraft side.

import { system, world, BlockPermutation, ButtonState, EntityDamageCause, EquipmentSlot, InputButton, ItemStack, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  DECOY_ID,
  GADGETS,
  GLOVE_ID,
  SUITS,
  flightStep,
  fullSuit,
  gadgetIndex,
  hud,
  newPilot,
  pieceLore,
  suitOfItem,
  useGadget,
  usePower,
} from "./suits.js";

const BOSSES = new Set(["bender:element_guardian", "bender:ender_dragon"]);
const WELCOME_KEY = "bender:suits_welcomed";
const FLAME = [1, 0.6, 0.2];

const pilots = new Map(); // player id -> Suit Power, flying, cooldowns, phase beacon mark
let active = []; // things happening over time: rockets, grapples, shockwaves...
const decoys = new Map(); // hologram id -> tick it ends
const messageUntil = new Map();
const lastUse = new Map();

// ------------------------------------------------------------ helpers

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const chest = (e) => add(e.location, { x: 0, y: 1, z: 0 });

function actionBar(player, message, hold = 0) {
  try {
    player.onScreenDisplay.setActionBar(message);
    if (hold) messageUntil.set(player.id, system.currentTick + hold);
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

function sound(dimension, id, location, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

const colorCache = new Map();
function colorVars(rgb) {
  const key = rgb.join(",");
  if (!colorCache.has(key)) {
    const vars = new MolangVariableMap();
    vars.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
    colorCache.set(key, vars);
  }
  return colorCache.get(key);
}

function spark(dimension, location, rgb, id = "bender:suit_spark") {
  try {
    dimension.spawnParticle(id, location, colorVars(rgb));
  } catch {
    // Skip a sparkle that can't spawn.
  }
}

function ring(dimension, center, radius, rgb, points = 24, id = "bender:suit_spark") {
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    spark(dimension, { x: center.x + Math.cos(a) * radius, y: center.y, z: center.z + Math.sin(a) * radius }, rgb, id);
  }
}

function line(dimension, from, to, rgb, step = 0.6, id = "bender:suit_spark") {
  const d = dist(from, to);
  const n = Math.min(60, Math.max(1, Math.ceil(d / step)));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    spark(dimension, { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f }, rgb, id);
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
    // Didn't have it.
  }
}

function hasFamily(entity, family) {
  try {
    return !!entity.getComponent("minecraft:type_family")?.hasTypeFamily(family);
  } catch {
    return false;
  }
}

function giveOrDrop(player, item) {
  const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

function worn(player) {
  const equip = player.getComponent("minecraft:equippable");
  return [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet].map((s) => {
    try {
      return equip?.getEquipment(s)?.typeId;
    } catch {
      return undefined;
    }
  });
}

function heldIds(player) {
  const equip = player.getComponent("minecraft:equippable");
  const id = (s) => {
    try {
      return equip?.getEquipment(s)?.typeId;
    } catch {
      return undefined;
    }
  };
  return [id(EquipmentSlot.Mainhand), id(EquipmentSlot.Offhand)];
}

function pilotOf(player) {
  let p = pilots.get(player.id);
  if (!p) {
    p = newPilot();
    pilots.set(player.id, p);
  }
  return p;
}

/** Only monsters and bosses: never players, pets or animals. */
function isFoe(entity) {
  if (!entity?.isValid || entity.typeId === "minecraft:player" || entity.typeId === DECOY_ID) return false;
  return BOSSES.has(entity.typeId) || hasFamily(entity, "monster");
}

function foesNear(dimension, location, radius) {
  let found = [];
  try {
    found = dimension.getEntities({ location, maxDistance: radius });
  } catch {
    found = [];
  }
  return found.filter(isFoe).sort((a, b) => dist(a.location, location) - dist(b.location, location));
}

function foesTouching(dimension, pos, radius) {
  return foesNear(dimension, pos, radius + 1.5).filter((e) => dist(pos, chest(e)) <= radius);
}

function hurt(target, amount, player, undead = 1) {
  if (!target.isValid) return;
  const dmg = Math.max(1, Math.round(amount * (hasFamily(target, "undead") ? undead : 1)));
  try {
    target.applyDamage(dmg, player?.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: player } : { cause: EntityDamageCause.magic });
  } catch {
    // Couldn't be hurt.
  }
}

function push(target, from, strength, lift = 0.3) {
  const dx = target.location.x - from.x;
  const dz = target.location.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    target.applyKnockback({ x: (dx / len) * strength, z: (dz / len) * strength }, lift);
  } catch {
    // Some things can't be pushed.
  }
}

function solidAt(dimension, pos) {
  try {
    const b = dimension.getBlock(pos);
    return !b || (!b.isAir && !b.isLiquid);
  } catch {
    return true;
  }
}

function applyFx(target, list) {
  for (const f of list ?? []) addEffect(target, f.id, f.ticks, f.amp);
}

function friendsNear(dimension, location, radius) {
  try {
    return dimension.getPlayers({ location, maxDistance: radius });
  } catch {
    return [];
  }
}

function sunny(player) {
  if (player.dimension.id !== "minecraft:overworld") return false;
  try {
    const t = world.getTimeOfDay();
    return t < 12000 || t > 23500;
  } catch {
    return false;
  }
}

function inputOf(player) {
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
  return { forward, jump };
}

// ------------------------------------------------------------ flying

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const pilot = pilotOf(player);
    const suit = fullSuit(worn(player));
    let busy = false;
    try {
      busy = player.isFlying || player.isGliding;
    } catch {
      busy = false;
    }
    if (suit < 0 || busy) {
      if (pilot.flying) {
        // Took the suit off in the air: land softly.
        pilot.flying = false;
        removeEffect(player, "levitation");
        addEffect(player, "slow_falling", 100);
      }
      continue;
    }
    const s = SUITS[suit];
    const { forward, jump } = inputOf(player);
    let onGround = false;
    let inWater = false;
    try {
      onGround = player.isOnGround;
      inWater = player.isInWater;
    } catch {
      onGround = false;
    }
    const out = flightStep(pilot, suit, { onGround, inWater, jump, sneak: player.isSneaking, forward, sunny: sunny(player), tick });
    const feet = player.location;
    if (out.levitate) {
      addEffect(player, "levitation", 6, out.levitate - 1);
      removeEffect(player, "slow_falling");
      spark(player.dimension, add(feet, { x: 0.15, y: -0.1, z: 0 }), FLAME, "bender:suit_flame");
      spark(player.dimension, add(feet, { x: -0.15, y: -0.1, z: 0 }), FLAME, "bender:suit_flame");
      if (tick % 10 === 0) sound(player.dimension, "mob.blaze.breathe", feet, 0.4, 1.6);
    } else if (out.glide) {
      removeEffect(player, "levitation");
      addEffect(player, "slow_falling", 10);
    } else if (out.dive) {
      removeEffect(player, "levitation");
      removeEffect(player, "slow_falling");
      // soften the landing near the ground
      for (let d = 1; d <= 4; d++) {
        if (solidAt(player.dimension, add(feet, { x: 0, y: -d, z: 0 }))) {
          addEffect(player, "slow_falling", 20);
          break;
        }
      }
    }
    if (out.boost) {
      const v = player.getViewDirection();
      const flat = Math.hypot(v.x, v.z) || 1;
      try {
        player.applyKnockback({ x: (v.x / flat) * out.boost, z: (v.z / flat) * out.boost }, Math.max(0.05, v.y * out.boost * 0.6));
      } catch {
        // Couldn't boost this time.
      }
      spark(player.dimension, feet, s.rgb, "bender:suit_glow");
      if (tick % 12 === 0) sound(player.dimension, "firework.launch", feet, 0.5, 1.2);
    }
    // the status line while flying or holding a glove or gadget
    if (tick % 6 === 0 && tick >= (messageUntil.get(player.id) ?? 0)) {
      const holding = heldIds(player).some((id) => id === GLOVE_ID || gadgetIndex(id) >= 0);
      if (pilot.flying || holding) actionBar(player, hud(pilot, suit));
    }
  }
}, 2);

// suit perks
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const suit = fullSuit(worn(player));
    if (suit >= 0) applyFx(player, SUITS[suit].perk.effects);
  }
}, 40);

// Frost Suit: water under your feet freezes so you can walk on it (it melts again by itself).
const frostedIce = (() => {
  try {
    return BlockPermutation.resolve("minecraft:frosted_ice");
  } catch {
    return undefined;
  }
})();
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const suit = fullSuit(worn(player));
    if (suit < 0 || !SUITS[suit].perk.frostWalk || !frostedIce) continue;
    let inWater = false;
    try {
      inWater = player.isInWater;
    } catch {
      inWater = false;
    }
    if (inWater) continue;
    const { x, y, z } = player.location;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dz * dz > 5) continue;
        try {
          const b = player.dimension.getBlock({ x: x + dx, y: y - 1, z: z + dz });
          if (b?.typeId === "minecraft:water" && b.permutation.getState("liquid_depth") === 0) b.setPermutation(frostedIce);
        } catch {
          // Skip that block.
        }
      }
    }
  }
}, 4);

// ------------------------------------------------------------ the Power Glove

function powerRockets(player, s) {
  const p = s.power;
  const dim = player.dimension;
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  const targets = foesNear(dim, player.location, p.range).filter((e) => {
    const d = norm({ x: e.location.x - head.x, y: chest(e).y - head.y, z: e.location.z - head.z });
    return d.x * view.x + d.y * view.y + d.z * view.z > 0.3;
  });
  for (let i = 0; i < p.count; i++) {
    const target = targets.length ? targets[i % targets.length] : undefined;
    const spread = (i - (p.count - 1) / 2) * 0.15;
    let pos = add(head, { x: -view.z * spread, y: 0.2 + Math.abs(spread), z: view.x * spread });
    let vel = scale(norm({ x: view.x - view.z * spread * 2, y: view.y + 0.25, z: view.z + view.x * spread * 2 }), 0.7);
    let t = 0;
    const delay = i * 3;
    active.push({
      step() {
        if (t++ < delay) return true;
        const aim = target?.isValid ? chest(target) : add(head, scale(view, p.range));
        vel = scale(norm(add(scale(vel, 0.8), scale(norm({ x: aim.x - pos.x, y: aim.y - pos.y, z: aim.z - pos.z }), 0.35))), 1.1);
        pos = add(pos, vel);
        spark(dim, pos, s.rgb, "bender:suit_glow");
        spark(dim, pos, FLAME, "bender:suit_flame");
        const hit = foesTouching(dim, pos, 1.3)[0];
        if (hit || solidAt(dim, pos) || t > delay + 40) {
          ring(dim, pos, 1, s.rgb, 10, "bender:suit_star");
          sound(dim, "random.explode", pos, 0.5, 1.6);
          for (const v of foesTouching(dim, pos, p.radius)) {
            hurt(v, p.damage, player);
            push(v, pos, 0.5, 0.3);
          }
          return false;
        }
        return true;
      },
    });
  }
  sound(dim, "crossbow.shoot", head, 1, 0.8);
}

function powerBeam(player, s) {
  const p = s.power;
  const dim = player.dimension;
  const head = player.getHeadLocation();
  const dir = player.getViewDirection();
  const hits = new Map();
  let pos = head;
  for (let k = 0; k < p.range * 2; k++) {
    pos = add(pos, scale(dir, 0.5));
    if (solidAt(dim, pos)) break;
    spark(dim, pos, s.rgb, k % 2 ? "bender:suit_spark" : "bender:suit_glow");
    for (const v of foesTouching(dim, pos, 1.2)) hits.set(v.id, v);
  }
  for (const v of hits.values()) {
    hurt(v, p.damage, player, p.undead ?? 1);
    applyFx(v, p.effects);
    if (p.knock) push(v, head, p.knock, 0.35);
  }
  sound(dim, s.key === "aqua" ? "bucket.empty_water" : s.key === "frost" ? "random.glass" : "beacon.power", head, 1, 1.4);
}

function powerChain(player, s) {
  const p = s.power;
  const dim = player.dimension;
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  const first = foesNear(dim, player.location, p.range).find((e) => {
    const d = norm({ x: e.location.x - head.x, y: chest(e).y - head.y, z: e.location.z - head.z });
    return d.x * view.x + d.y * view.y + d.z * view.z > 0.6;
  });
  if (!first) {
    line(dim, head, add(head, scale(view, 10)), s.rgb, 0.4, "bender:suit_star");
    actionBar(player, "§7No monster to zap there.", 30);
    return;
  }
  const done = new Set();
  let from = head;
  let at = first;
  for (let i = 0; at && i <= p.chain; i++) {
    line(dim, from, chest(at), s.rgb, 0.35, "bender:suit_star");
    hurt(at, p.damage, player);
    done.add(at.id);
    from = chest(at);
    at = foesNear(dim, at.location, 8).find((e) => !done.has(e.id));
  }
  sound(dim, "ambient.weather.lightning.impact", first.location, 1, 1.4);
}

function powerSlam(player, s) {
  const p = s.power;
  const dim = player.dimension;
  try {
    player.applyKnockback({ x: 0, z: 0 }, 1);
  } catch {
    // Slam from where you are.
  }
  let t = 0;
  let falling = false;
  active.push({
    step() {
      t++;
      if (!player.isValid) return false;
      if (t > 8 && !falling) {
        falling = true;
        try {
          player.applyKnockback({ x: 0, z: 0 }, -2.5);
        } catch {
          // Fall the normal way.
        }
      }
      let landed = false;
      try {
        landed = t > 10 && player.isOnGround;
      } catch {
        landed = t > 30;
      }
      if (!landed && t < 60) return true;
      const c = player.location;
      for (const r of [1.5, 3, 4.5, p.radius]) ring(dim, add(c, { x: 0, y: 0.2, z: 0 }), r, s.rgb, Math.round(r * 6), "bender:suit_star");
      sound(dim, "random.explode", c, 1, 0.6);
      for (const v of foesNear(dim, c, p.radius)) {
        hurt(v, p.damage, player);
        push(v, c, 0.8, p.lift);
      }
      return false;
    },
  });
  // no fall damage from your own slam
  addEffect(player, "resistance", 60, 4);
  sound(dim, "mob.irongolem.hit", player.location, 1, 0.6);
}

function powerRepair(player, s) {
  const p = s.power;
  const dim = player.dimension;
  for (const f of friendsNear(dim, player.location, p.radius)) {
    try {
      const h = f.getComponent("minecraft:health");
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + p.heal));
    } catch {
      // Not important.
    }
    applyFx(f, p.effects);
    for (let i = 0; i < 4; i++) {
      try {
        dim.spawnParticle("minecraft:heart_particle", add(f.location, { x: Math.random() - 0.5, y: 1 + Math.random(), z: Math.random() - 0.5 }));
      } catch {
        // Skip.
      }
    }
  }
  ring(dim, add(player.location, { x: 0, y: 0.3, z: 0 }), p.radius, s.rgb, 30, "bender:suit_star");
  sound(dim, "beacon.activate", player.location, 1, 1.5);
}

function powerCloak(player, s) {
  applyFx(player, s.power.self);
  for (const y of [0.3, 1, 1.7]) ring(player.dimension, add(player.location, { x: 0, y, z: 0 }), 0.8, s.rgb, 12);
  sound(player.dimension, "mob.endermen.portal", player.location, 1, 1.4);
}

function useGlove(player) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id + "glove") ?? -100) < 4) return;
  lastUse.set(player.id + "glove", now);
  const suit = fullSuit(worn(player));
  if (suit < 0) {
    actionBar(player, "§ePut on all 4 pieces of a power suit§r to use the Power Glove.", 50);
    return;
  }
  const s = SUITS[suit];
  const pilot = pilotOf(player);
  const r = usePower(pilot, suit, now);
  if (!r.ok) {
    actionBar(player, r.why === "power" ? `§eNot enough Suit Power for ${s.power.name}.§r Land to recharge!` : `§7${s.power.name} is recharging...`, 40);
    return;
  }
  const kinds = { rockets: powerRockets, beam: powerBeam, chain: powerChain, slam: powerSlam, repair: powerRepair, cloak: powerCloak };
  kinds[s.power.kind]?.(player, s);
  actionBar(player, `${s.color}§l${s.power.name}!§r  ${hud(pilot, suit).split("  ")[1]}`, 30);
}

// ------------------------------------------------------------ gadgets

function lookTarget(player, range) {
  try {
    const hit = player.getEntitiesFromViewDirection({ maxDistance: range }).find((h) => isFoe(h.entity));
    if (hit) return { entity: hit.entity };
  } catch {
    // No entity in the way.
  }
  try {
    const b = player.getBlockFromViewDirection({ maxDistance: range });
    if (b) return { point: { x: b.block.x + 0.5, y: b.block.y + 0.5, z: b.block.z + 0.5 } };
  } catch {
    // Nothing there.
  }
  return {};
}

function grapple(player) {
  const dim = player.dimension;
  const target = lookTarget(player, GADGETS[0].range);
  const grey = [0.8, 0.82, 0.86];
  if (target.entity) {
    const e = target.entity;
    const d = norm({ x: player.location.x - e.location.x, y: 0, z: player.location.z - e.location.z });
    line(dim, player.getHeadLocation(), chest(e), grey, 0.4);
    try {
      e.applyKnockback({ x: d.x * 2.2, z: d.z * 2.2 }, 0.45);
    } catch {
      // Too heavy to pull.
    }
    sound(dim, "crossbow.loading.end", player.location, 1, 1.2);
    return;
  }
  if (!target.point) {
    actionBar(player, "§7Aim at a block or a monster to grapple.", 30);
    return;
  }
  const anchor = target.point;
  let t = 0;
  sound(dim, "crossbow.shoot", player.location, 1, 1.3);
  active.push({
    step() {
      t++;
      if (!player.isValid) return false;
      if (t % 2 === 0) line(dim, player.getHeadLocation(), anchor, grey, 0.8);
      const d = dist(player.location, anchor);
      if (d < 2.2 || t > 40) {
        addEffect(player, "slow_falling", 40);
        return false;
      }
      if (t % 3 === 1) {
        const v = norm({ x: anchor.x - player.location.x, y: anchor.y - player.location.y, z: anchor.z - player.location.z });
        const k = Math.min(2.2, 0.5 + d * 0.12);
        try {
          player.applyKnockback({ x: v.x * k, z: v.z * k }, Math.max(0.25, v.y * k + 0.15));
        } catch {
          return false;
        }
      }
      return true;
    },
  });
}

function nova(player, g) {
  const dim = player.dimension;
  const purple = [0.75, 0.3, 1];
  let pos = player.getHeadLocation();
  let vel = scale(player.getViewDirection(), g.speed);
  let t = 0;
  active.push({
    step() {
      t++;
      vel = { x: vel.x * 0.99, y: vel.y - 0.04, z: vel.z * 0.99 };
      const next = add(pos, vel);
      const stop = solidAt(dim, next) || foesTouching(dim, next, 1).length > 0;
      if (!stop) pos = next;
      spark(dim, pos, purple, "bender:suit_glow");
      if (!stop && t < g.fuse) return true;
      for (const r of [1, 2, 3, g.radius]) ring(dim, pos, r, purple, Math.round(r * 8), "bender:suit_star");
      sound(dim, "random.explode", pos, 1, 1.2);
      for (const v of foesTouching(dim, pos, g.radius)) {
        hurt(v, g.damage, player);
        push(v, pos, 1, 0.5);
      }
      return false;
    },
  });
  sound(dim, "random.bow", player.location, 1, 0.8);
}

function shield(player, g) {
  const dim = player.dimension;
  const blue = [0.4, 0.8, 1];
  applyFx(player, g.self);
  let t = 0;
  active.push({
    step() {
      t++;
      if (!player.isValid) return false;
      if (t % 4 === 0) {
        const c = add(player.location, { x: 0, y: 1, z: 0 });
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const b = Math.acos(Math.random() * 2 - 1);
          spark(dim, { x: c.x + Math.sin(b) * Math.cos(a) * 1.6, y: c.y + Math.cos(b) * 1.6, z: c.z + Math.sin(b) * Math.sin(a) * 1.6 }, blue);
        }
        for (const v of foesNear(dim, player.location, g.radius)) push(v, player.location, 1.2, 0.2);
      }
      return t < g.seconds * 20;
    },
  });
  sound(dim, "beacon.activate", player.location, 1, 1.6);
}

function phase(player) {
  const pilot = pilotOf(player);
  const dim = player.dimension;
  const violet = [0.75, 0.45, 1];
  if (!pilot.phase || player.isSneaking) {
    pilot.phase = { dim: dim.id, x: player.location.x, y: player.location.y, z: player.location.z, rot: player.getRotation() };
    for (let y = 0; y < 3; y += 0.3) spark(dim, add(player.location, { x: 0, y, z: 0 }), violet, "bender:suit_glow");
    sound(dim, "respawn_anchor.charge", player.location, 1, 1.4);
    actionBar(player, "§dPhase Beacon set here!§r Tap again to warp back. Sneak + tap to move it.", 60);
    return;
  }
  if (pilot.phase.dim !== dim.id) {
    actionBar(player, "§7Your Phase Beacon is in another world.", 40);
    return;
  }
  ring(dim, add(player.location, { x: 0, y: 1, z: 0 }), 0.8, violet, 16, "bender:suit_star");
  try {
    player.teleport({ x: pilot.phase.x, y: pilot.phase.y, z: pilot.phase.z }, { rotation: pilot.phase.rot });
  } catch {
    return;
  }
  ring(dim, add(pilot.phase, { x: 0, y: 1, z: 0 }), 0.8, violet, 16, "bender:suit_star");
  sound(dim, "mob.endermen.portal", player.location, 1, 1.2);
}

function seismic(player, g) {
  const dim = player.dimension;
  const c = { ...player.location };
  const orange = [1, 0.6, 0.2];
  const hit = new Set();
  let t = 0;
  active.push({
    step() {
      t++;
      const r = (t / 12) * g.radius;
      ring(dim, add(c, { x: 0, y: 0.15, z: 0 }), r, orange, Math.round(r * 5) + 6);
      for (const v of foesNear(dim, c, r + 0.5)) {
        if (hit.has(v.id)) continue;
        hit.add(v.id);
        hurt(v, g.damage, player);
        applyFx(v, g.effects);
        push(v, c, 0.4, g.lift);
      }
      return t < 12;
    },
  });
  sound(dim, "random.explode", c, 1, 0.5);
  sound(dim, "mob.irongolem.hit", c, 1, 0.5);
}

function decoy(player, g) {
  const dim = player.dimension;
  for (const [id] of decoys) {
    const old = world.getEntity(id);
    if (old && old.getDynamicProperty("bender:owner") === player.id) {
      old.remove();
      decoys.delete(id);
    }
  }
  const v = player.getViewDirection();
  const flat = Math.hypot(v.x, v.z) || 1;
  const spot = { x: player.location.x + (v.x / flat) * 2, y: player.location.y, z: player.location.z + (v.z / flat) * 2 };
  let h;
  try {
    h = dim.spawnEntity(DECOY_ID, spot);
  } catch {
    actionBar(player, "§7No room for a hologram there.", 30);
    return;
  }
  h.setRotation({ x: 0, y: player.getRotation().y + 180 });
  h.setDynamicProperty("bender:owner", player.id);
  h.nameTag = player.name;
  decoys.set(h.id, system.currentTick + g.seconds * 20);
  for (let y = 0; y < 2; y += 0.25) spark(dim, add(spot, { x: 0, y, z: 0 }), [0.3, 0.95, 1], "bender:suit_glow");
  sound(dim, "beacon.power", spot, 1, 1.8);
}

// holograms fade away, including any left over from before a reload
system.runInterval(() => {
  const now = system.currentTick;
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    let found = [];
    try {
      found = world.getDimension(dimensionId).getEntities({ type: DECOY_ID });
    } catch {
      found = [];
    }
    for (const h of found) {
      const until = decoys.get(h.id);
      if (until !== undefined && now < until) continue;
      for (let y = 0; y < 2; y += 0.4) spark(h.dimension, add(h.location, { x: 0, y, z: 0 }), [0.3, 0.95, 1]);
      decoys.delete(h.id);
      h.remove();
    }
  }
}, 10);

// the Phase Beacon mark shimmers so you can find it
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const mark = pilots.get(player.id)?.phase;
    if (!mark || mark.dim !== player.dimension.id || dist(mark, player.location) > 64) continue;
    for (let y = 0; y < 2.5; y += 0.5) spark(player.dimension, add(mark, { x: 0, y, z: 0 }), [0.75, 0.45, 1]);
  }
}, 20);

function useGadgetItem(player, typeId) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id + typeId) ?? -100) < 4) return;
  lastUse.set(player.id + typeId, now);
  const gi = gadgetIndex(typeId);
  if (gi < 0) return;
  const g = GADGETS[gi];
  const pilot = pilotOf(player);
  // moving the Phase Beacon doesn't wait for the recharge
  if (g.key === "phase_beacon" && player.isSneaking) {
    phase(player);
    return;
  }
  const r = useGadget(pilot, gi, now);
  if (!r.ok) {
    actionBar(player, `§7${g.name} is recharging (${r.wait}s)...`, 30);
    return;
  }
  const uses = { grapple_hook: grapple, nova_charge: nova, energy_shield: shield, phase_beacon: phase, seismic_charge: seismic, hologram_decoy: decoy };
  uses[g.key]?.(player, g);
}

system.runInterval(() => {
  const keep = [];
  for (const a of active) {
    let more = false;
    try {
      more = a.step();
    } catch {
      more = false;
    }
    if (more) keep.push(a);
  }
  active = keep;
}, 1);

// ------------------------------------------------------------ custom item parts

function both(fn) {
  return {
    onUse(event) {
      const player = event.source;
      const id = event.itemStack?.typeId;
      system.run(() => fn(player, id));
    },
    onUseOn(event) {
      const player = event.source;
      if (player.typeId !== "minecraft:player") return;
      const id = event.itemStack?.typeId;
      system.run(() => fn(player, id));
    },
  };
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:power_glove", both((player) => useGlove(player)));
  itemComponentRegistry.registerCustomComponent("bender:gadget", both((player, id) => useGadgetItem(player, id)));
});

// ------------------------------------------------------------ descriptions and the starting suit

function loreFor(typeId) {
  if (typeId === GLOVE_ID) return ["§7Tap to use your suit's special power", "§7(wear all 4 pieces of a suit)"];
  const gi = gadgetIndex(typeId);
  if (gi >= 0) return [`§7${GADGETS[gi].about}`, `§7Recharges in ${Math.round(GADGETS[gi].cooldown / 20)}s`];
  const si = suitOfItem(typeId);
  if (si >= 0) return pieceLore(si);
  return undefined;
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

function giveStarter(player, suit) {
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  const s = SUITS[suit];
  for (const id of s.armor) {
    const piece = new ItemStack(id, 1);
    piece.setLore(pieceLore(suit));
    giveOrDrop(player, piece);
  }
  const extras = [GLOVE_ID, "bender:grapple_hook", "bender:energy_shield"];
  for (const id of extras) {
    const item = new ItemStack(id, 1);
    item.setLore(loreFor(id) ?? []);
    giveOrDrop(player, item);
  }
  title(player, `${s.color}§l${s.name}!`, "Put it on, then hold jump to fly");
  player.sendMessage(`${s.color}${s.name}§r: put on all 4 pieces, then §ehold jump to fly§r, push forward to boost, sneak to dive.`);
  player.sendMessage(`§7Tap the Power Glove for ${s.power.name}. You also got a Grapple Hook and an Energy Shield. Craft the other suits and gadgets!`);
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lChoose your power suit!").body("Every suit can fly. Each one has its own special power and perk.");
  for (const s of SUITS) form.button(`${s.color}§l${s.name}§r\n§8${s.power.name}`, `textures/items/${s.key}_helmet`);
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
  if (!initialSpawn || player.getDynamicProperty(WELCOME_KEY)) return;
  system.runTimeout(() => starterForm(player, 0), 60);
});
