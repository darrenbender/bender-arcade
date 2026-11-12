// Bender Elements: ten element staffs with 40 powers, element guardians to
// beat, and element armor.
//
// Tap a staff to use its chosen power; sneak + tap to switch power. Powers
// only ever hurt monsters and guardians (never players, pets or animals).
// Walls and spikes made by powers disappear by themselves. Guardian Orbs call
// a guardian; beat it to win that element's staff and shards for its armor.
// The numbers and shapes live in elements.js; this file does the Minecraft side.

import { system, world, BlockPermutation, EntityDamageCause, EquipmentSlot, GameMode, ItemStack, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  ELEMENTS,
  GUARDIAN,
  GUARDIAN_ID,
  GUARDIAN_POWER,
  addCharge,
  canCast,
  elementOfItem,
  forward,
  fullSet,
  hud,
  inCone,
  inStrip,
  newCaster,
  nextSlot,
  pullToward,
  rainPlan,
  regen,
  spend,
  staffElement,
  staffLore,
  wallBlocks,
  whyNot,
} from "./elements.js";

const BOSSES = new Set([GUARDIAN_ID, "bender:ender_dragon"]);
const DIMENSIONS = ["overworld", "nether", "the_end"];
const TEMP_KEY = "bender:temp_blocks";
const WELCOME_KEY = "bender:elements_welcomed";
const SOUNDS = {
  fire: ["mob.blaze.shoot", "fire.ignite"],
  water: ["bucket.empty_water", "random.splash"],
  earth: ["dig.stone", "mob.irongolem.hit"],
  air: ["mob.breeze.shoot", "wind_charge.burst"],
  lightning: ["ambient.weather.lightning.impact", "ambient.weather.thunder"],
  ice: ["random.glass", "random.glass"],
  nature: ["dig.grass", "dig.grass"],
  lava: ["bucket.empty_lava", "random.fizz"],
  light: ["random.orb", "chime.amethyst_block"],
  shadow: ["mob.endermen.portal", "mob.wither.shoot"],
};

const casters = new Map(); // player id -> caster state (energy, ultimate charge, cooldowns, chosen powers)
let active = []; // things happening over time: flying bolts, whirls, auras...
let tempBlocks = []; // blocks made by powers, put back to air later
let tempDirty = false;
const guardians = new Map(); // guardian id -> its fight state
const lastUse = new Map();
const messageUntil = new Map(); // player id -> tick (so the status line doesn't cover a message)

// ------------------------------------------------------------ helpers

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

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

function spark(dimension, location, rgb, id = "bender:element_spark") {
  try {
    dimension.spawnParticle(id, location, colorVars(rgb));
  } catch {
    // Skip a sparkle that can't spawn.
  }
}

function ring(dimension, center, radius, rgb, points = 24, id = "bender:element_spark") {
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    spark(dimension, { x: center.x + Math.cos(a) * radius, y: center.y, z: center.z + Math.sin(a) * radius }, rgb, id);
  }
}

function line(dimension, from, to, rgb, step = 0.6, id = "bender:element_spark") {
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

function hasFamily(entity, family) {
  try {
    return !!entity.getComponent("minecraft:type_family")?.hasTypeFamily(family);
  } catch {
    return false;
  }
}

function isCreative(player) {
  try {
    return player.getGameMode() === GameMode.Creative;
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

function giveOrDrop(player, item) {
  const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

function held(player) {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
  } catch {
    return undefined;
  }
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

function casterOf(player) {
  let c = casters.get(player.id);
  if (!c) {
    c = { ...newCaster(), slots: {} };
    casters.set(player.id, c);
  }
  return c;
}

function playerById(id) {
  return world.getAllPlayers().find((p) => p.id === id);
}

// ------------------------------------------------------------ who powers can hit

/** Players' powers hit monsters and bosses; guardians' powers hit players. Nothing else. */
function isFoe(entity, side, caster) {
  if (!entity?.isValid || entity.id === caster?.id) return false;
  if (side === "player") return BOSSES.has(entity.typeId) || hasFamily(entity, "monster");
  return entity.typeId === "minecraft:player";
}

function foesNear(dimension, location, radius, side, caster) {
  let found = [];
  try {
    found = dimension.getEntities({ location, maxDistance: radius });
  } catch {
    found = [];
  }
  return found.filter((e) => isFoe(e, side, caster)).sort((a, b) => dist(a.location, location) - dist(b.location, location));
}

/** Foes whose body (not just their feet) is within `radius` of a point in the air. */
function foesTouching(dimension, pos, radius, side, caster) {
  return foesNear(dimension, pos, radius + 1.5, side, caster)
    .map((e) => ({ e, d: dist(pos, { x: e.location.x, y: e.location.y + 0.9, z: e.location.z }) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.e);
}

function friendsNear(dimension, location, radius, side, caster) {
  if (side !== "player") return caster?.isValid ? [caster] : [];
  try {
    return dimension.getPlayers({ location, maxDistance: radius });
  } catch {
    return [];
  }
}

function hurt(target, amount, ctx, undeadBonus = 1) {
  if (!target.isValid || amount <= 0) return;
  let dmg = amount * (hasFamily(target, "undead") ? undeadBonus : 1);
  if (ctx.side === "guardian") dmg *= ctx.p.ult ? 0.3 : GUARDIAN_POWER;
  dmg = Math.max(1, Math.round(dmg));
  try {
    target.applyDamage(dmg, ctx.caster?.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.caster } : { cause: EntityDamageCause.magic });
  } catch {
    return;
  }
  if (ctx.side === "player" && ctx.caster?.typeId === "minecraft:player") addCharge(casterOf(ctx.caster), dmg);
}

function applyFx(target, list) {
  for (const f of list ?? []) {
    if (f.id === "extinguish") {
      try {
        target.extinguishFire(true);
      } catch {
        // Not burning.
      }
    } else {
      addEffect(target, f.id, f.ticks, f.amp);
    }
  }
}

function burn(target, seconds) {
  if (!seconds) return;
  try {
    target.setOnFire(seconds, true);
  } catch {
    // Some things can't burn.
  }
}

function knock(target, from, strength, lift = 0.25) {
  if (!strength && !lift) return;
  const dx = target.location.x - from.x;
  const dz = target.location.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    target.applyKnockback({ x: (dx / len) * (strength ?? 0), z: (dz / len) * (strength ?? 0) }, lift);
  } catch {
    // Some things can't be pushed.
  }
}

function strike(target, ctx, from) {
  const p = ctx.p;
  hurt(target, p.damage, ctx, p.undead ?? 1);
  applyFx(target, p.effects);
  burn(target, p.fire);
  knock(target, from, p.knock ?? 0.4, p.lift ?? 0.25);
}

function solidAt(dimension, pos) {
  try {
    const b = dimension.getBlock(pos);
    return !b || (!b.isAir && !b.isLiquid);
  } catch {
    return true;
  }
}

function lookPoint(player, reach = 28) {
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: reach });
    if (hit) return { x: hit.block.x + 0.5, y: hit.block.y + 1, z: hit.block.z + 0.5 };
  } catch {
    // Fall back to straight ahead.
  }
  const head = player.getHeadLocation();
  const d = player.getViewDirection();
  return { x: head.x + d.x * 16, y: player.location.y, z: head.z + d.z * 16 };
}

const permCache = new Map();
function perm(id) {
  if (!permCache.has(id)) {
    try {
      permCache.set(id, BlockPermutation.resolve(id));
    } catch {
      permCache.set(id, undefined);
    }
  }
  return permCache.get(id);
}

function placeTemp(dimension, pos, id, ticks) {
  try {
    const b = dimension.getBlock(pos);
    const p = perm(id);
    if (!b || !b.isAir || !p) return false;
    b.setPermutation(p);
    tempBlocks.push({ dim: dimension.id, x: b.x, y: b.y, z: b.z, id, until: system.currentTick + ticks });
    tempDirty = true;
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the powers

function castBolt(ctx) {
  const { p, dim, e } = ctx;
  let pos = add(ctx.origin, scale(ctx.dir, 1.2));
  const vel = scale(ctx.dir, p.speed);
  let ttl = Math.ceil(32 / p.speed);
  const steps = Math.ceil(p.speed / 0.8);
  active.push({
    step() {
      for (let i = 0; i < steps; i++) {
        pos = add(pos, scale(vel, 1 / steps));
        if (solidAt(dim, pos)) {
          boltHit(ctx, pos, undefined);
          return false;
        }
        const hit = foesTouching(dim, pos, 1.3, ctx.side, ctx.caster)[0];
        if (hit) {
          boltHit(ctx, pos, hit);
          return false;
        }
      }
      spark(dim, pos, e.rgb, "bender:element_orb");
      spark(dim, pos, e.rgb);
      return --ttl > 0;
    },
  });
}

function boltHit(ctx, pos, hit) {
  const { p, dim, e } = ctx;
  const victims = p.splash ? foesTouching(dim, pos, p.splash + 0.5, ctx.side, ctx.caster) : [];
  if (hit && !victims.some((v) => v.id === hit.id)) victims.push(hit);
  const from = add(pos, scale(ctx.dir, -2));
  for (const v of victims) strike(v, ctx, from);
  if (p.chain && hit) {
    const done = new Set([hit.id]);
    let at = hit;
    for (let i = 0; i < p.chain; i++) {
      const next = foesNear(dim, at.location, 6, ctx.side, ctx.caster).find((x) => !done.has(x.id));
      if (!next) break;
      line(dim, add(at.location, { x: 0, y: 1, z: 0 }), add(next.location, { x: 0, y: 1, z: 0 }), e.rgb, 0.4, "bender:element_star");
      hurt(next, p.chainDamage, ctx);
      done.add(next.id);
      at = next;
    }
  }
  ring(dim, pos, 0.8, e.rgb, 12);
  sound(dim, SOUNDS[e.key][1], pos, 0.9, 1.1);
}

function castBurst(ctx) {
  const { p, dim, e, caster } = ctx;
  const c = caster.location;
  for (const r of [p.radius * 0.5, p.radius]) ring(dim, { x: c.x, y: c.y + 0.3, z: c.z }, r, e.rgb, Math.round(r * 7), "bender:element_star");
  for (const v of foesNear(dim, c, p.radius, ctx.side, caster)) strike(v, { ...ctx, p: { ...p, knock: p.knock ?? 0.7 } }, c);
  sound(dim, SOUNDS[e.key][1], c, 1, 0.9);
}

function castWave(ctx) {
  const { p, dim, e, caster } = ctx;
  const c = caster.location;
  const f = forward(ctx.yaw);
  for (let d = 1; d <= p.range; d += 1) {
    for (let a = -p.angle; a <= p.angle; a += 12) {
      const r = (a * Math.PI) / 180;
      const dx = f.x * Math.cos(r) - f.z * Math.sin(r);
      const dz = f.x * Math.sin(r) + f.z * Math.cos(r);
      spark(dim, { x: c.x + dx * d, y: c.y + 0.4 + Math.sin(d) * 0.3, z: c.z + dz * d }, e.rgb);
    }
  }
  for (const v of foesNear(dim, c, p.range + 1, ctx.side, caster)) if (inCone(c, ctx.yaw, v.location, p.range + 0.5, p.angle + 5)) strike(v, ctx, c);
  sound(dim, SOUNDS[e.key][1], c, 1, 0.8);
}

function castBeam(ctx) {
  const { p, dim, e } = ctx;
  const hits = new Map();
  let pos = ctx.origin;
  for (let s = 0; s < p.range * 2; s++) {
    pos = add(pos, scale(ctx.dir, 0.5));
    if (solidAt(dim, pos)) break;
    if (s % 2 === 0) spark(dim, pos, e.rgb, "bender:element_orb");
    for (const v of foesTouching(dim, pos, 1.2, ctx.side, ctx.caster)) hits.set(v.id, v);
  }
  for (const v of hits.values()) strike(v, ctx, ctx.origin);
  sound(dim, SOUNDS[e.key][1], ctx.origin, 1, 1.4);
}

function castDash(ctx, leap = false) {
  const { p, dim, e, caster } = ctx;
  const f = leap ? forward(ctx.yaw) : norm({ x: ctx.dir.x, y: 0, z: ctx.dir.z });
  try {
    caster.applyKnockback({ x: f.x * p.power, z: f.z * p.power }, p.lift ?? 0.3);
  } catch {
    // Couldn't move.
  }
  applyFx(caster, p.self);
  const hitIds = new Set();
  let t = 0;
  active.push({
    step() {
      if (!caster.isValid) return false;
      spark(dim, add(caster.location, { x: 0, y: 0.6, z: 0 }), e.rgb);
      spark(dim, add(caster.location, { x: 0, y: 1.2, z: 0 }), e.rgb, "bender:element_orb");
      if (p.damage) {
        for (const v of foesNear(dim, caster.location, 2.2, ctx.side, caster)) {
          if (hitIds.has(v.id)) continue;
          hitIds.add(v.id);
          strike(v, ctx, caster.location);
        }
      }
      return ++t < 14;
    },
  });
  sound(dim, SOUNDS[e.key][0], caster.location, 1, 1.2);
}

function castBlink(ctx) {
  const { p, dim, e, caster } = ctx;
  const f = norm({ x: ctx.dir.x, y: 0, z: ctx.dir.z });
  const start = caster.location;
  const reach = ctx.target ? Math.max(1, Math.min(p.distance, dist(start, ctx.target) - 2)) : p.distance;
  for (let d = reach; d >= 1; d -= 0.5) {
    const spot = { x: start.x + f.x * d, y: start.y, z: start.z + f.z * d };
    if (solidAt(dim, spot) || solidAt(dim, add(spot, { x: 0, y: 1, z: 0 }))) continue;
    // nothing in the way at head height along the path
    let clear = true;
    for (let s = 0.5; s < d; s += 0.5) if (solidAt(dim, { x: start.x + f.x * s, y: start.y + 1.2, z: start.z + f.z * s })) clear = false;
    if (!clear) continue;
    ring(dim, add(start, { x: 0, y: 1, z: 0 }), 0.7, e.rgb, 14, "bender:element_star");
    try {
      caster.teleport(spot, { rotation: caster.getRotation() });
    } catch {
      return;
    }
    ring(dim, add(spot, { x: 0, y: 1, z: 0 }), 0.7, e.rgb, 14, "bender:element_star");
    sound(dim, SOUNDS[e.key][0], spot, 1, 1.3);
    return;
  }
  if (caster.typeId === "minecraft:player") actionBar(caster, "§7No room to step there.", 30);
}

function castWall(ctx) {
  const { p, dim, e, caster } = ctx;
  let placed = 0;
  for (const b of wallBlocks(caster.location, ctx.yaw, p.width, p.height, p.distance)) {
    if (placeTemp(dim, b, p.block, p.seconds * 20)) {
      placed++;
      spark(dim, { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }, e.rgb);
    }
  }
  sound(dim, SOUNDS[e.key][0], caster.location, 1, 0.7);
  if (!placed && caster.typeId === "minecraft:player") actionBar(caster, "§7No room for a wall there.", 30);
}

function castHeal(ctx) {
  const { p, dim, e, caster } = ctx;
  for (const f of friendsNear(dim, caster.location, p.radius, ctx.side, caster)) {
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
  ring(dim, add(caster.location, { x: 0, y: 0.2, z: 0 }), p.radius, e.rgb, 30, "bender:element_star");
  sound(dim, "random.orb", caster.location, 1, 1.4);
}

function castShield(ctx) {
  const { dim, e, caster } = ctx;
  for (const y of [0.3, 1, 1.7]) ring(dim, add(caster.location, { x: 0, y, z: 0 }), 1, e.rgb, 14, "bender:element_star");
  sound(dim, SOUNDS[e.key][0], caster.location, 1, 0.8);
}

function castAura(ctx) {
  const { p, dim, e, caster } = ctx;
  let t = 0;
  const total = p.seconds * 20;
  active.push({
    step() {
      if (!caster.isValid) return false;
      const c = caster.location;
      if (t % 3 === 0) {
        const a = t * 0.4;
        for (let k = 0; k < 3; k++) {
          const r = (p.radius * ((t / 3 + k * 7) % 10)) / 10;
          spark(dim, { x: c.x + Math.cos(a + k * 2.1) * r, y: c.y + 0.5 + k * 0.5, z: c.z + Math.sin(a + k * 2.1) * r }, e.rgb);
        }
      }
      if (t % 10 === 0) {
        for (const v of foesNear(dim, c, p.radius, ctx.side, caster)) {
          if (p.damage) hurt(v, p.damage, ctx);
          applyFx(v, p.effects);
          if (p.knock) knock(v, c, p.knock, 0.2);
        }
        for (const f of friendsNear(dim, c, p.radius, ctx.side, caster)) applyFx(f, p.friends);
        ring(dim, add(c, { x: 0, y: 0.2, z: 0 }), p.radius, e.rgb, 20);
      }
      return ++t < total;
    },
  });
  sound(dim, SOUNDS[e.key][0], caster.location, 1, 0.7);
}

function castVortex(ctx) {
  const { p, dim, e } = ctx;
  const center = ctx.point;
  let t = 0;
  const total = p.seconds * 20;
  active.push({
    step() {
      for (let k = 0; k < 3; k++) {
        const a = t * 0.35 + k * 2.1;
        const h = (t % 20) / 20;
        const r = 0.5 + (p.radius * 0.5) * (1 - h);
        spark(dim, { x: center.x + Math.cos(a) * r, y: center.y + h * 5, z: center.z + Math.sin(a) * r }, e.rgb, k === 0 ? "bender:element_orb" : "bender:element_spark");
      }
      for (const v of foesNear(dim, center, p.radius, ctx.side, ctx.caster)) {
        const pull = pullToward(center, v.location);
        try {
          if (v.typeId === "minecraft:player") v.applyKnockback({ x: pull.x * 1.5, z: pull.z * 1.5 }, 0.05);
          else v.applyImpulse(pull);
        } catch {
          // Some things can't be pulled.
        }
        if (t % 10 === 0) {
          hurt(v, p.damage, ctx);
          applyFx(v, p.effects);
        }
      }
      if (++t < total) return true;
      for (const v of foesNear(dim, center, p.radius, ctx.side, ctx.caster)) {
        if (p.lift) knock(v, center, 0.3, p.lift);
        if (p.finale) hurt(v, p.finale, ctx);
      }
      ring(dim, add(center, { x: 0, y: 0.5, z: 0 }), p.radius * 0.6, e.rgb, 24, "bender:element_star");
      sound(dim, SOUNDS[e.key][1], center, 1.2, 0.7);
      return false;
    },
  });
  sound(dim, SOUNDS[e.key][0], center, 1.2, 0.6);
}

function castRain(ctx) {
  const { p, dim, e } = ctx;
  const center = ctx.point;
  const plan = rainPlan(center, p.count, p.over, 6, (system.currentTick * 2654435761) >>> 0);
  let t = 0;
  const falling = [];
  active.push({
    step() {
      for (const m of plan) {
        if (m.at !== t) continue;
        const end = { x: m.x, y: center.y, z: m.z };
        const start = p.from === "sky" ? { x: m.x + 3, y: center.y + 20, z: m.z - 3 } : { x: center.x, y: center.y + 1, z: center.z };
        falling.push({ start, end, t: 0, n: p.from === "sky" ? 12 : 20 });
      }
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.t++;
        const k = f.t / f.n;
        const arc = p.from === "sky" ? 0 : Math.sin(k * Math.PI) * 8;
        const pos = { x: f.start.x + (f.end.x - f.start.x) * k, y: f.start.y + (f.end.y - f.start.y) * k + arc, z: f.start.z + (f.end.z - f.start.z) * k };
        spark(dim, pos, e.rgb, "bender:element_orb");
        spark(dim, pos, e.rgb);
        if (f.t >= f.n) {
          falling.splice(i, 1);
          ring(dim, add(f.end, { x: 0, y: 0.2, z: 0 }), p.radius * 0.7, e.rgb, 12);
          sound(dim, "random.explode", f.end, 0.5, 1.4);
          for (const v of foesNear(dim, f.end, p.radius, ctx.side, ctx.caster)) strike(v, ctx, f.end);
        }
      }
      t++;
      return t <= p.over || falling.length > 0;
    },
  });
  sound(dim, SOUNDS[e.key][0], center, 1.5, 0.6);
}

function castStrikes(ctx) {
  const { p, dim, e, caster } = ctx;
  const targets = foesNear(dim, caster.location, p.reach, ctx.side, caster);
  if (p.heal) for (const f of friendsNear(dim, caster.location, 10, ctx.side, caster)) {
    try {
      const h = f.getComponent("minecraft:health");
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + p.heal));
    } catch {
      // Not important.
    }
  }
  let t = 0;
  let n = 0;
  active.push({
    step() {
      if (n < p.count && t >= Math.round((n * p.over) / p.count)) {
        const target = targets.length ? targets[n % targets.length] : undefined;
        const base = caster.isValid ? caster.location : ctx.point;
        const at = target?.isValid
          ? target.location
          : { x: base.x + (Math.random() - 0.5) * p.reach, y: base.y, z: base.z + (Math.random() - 0.5) * p.reach };
        line(dim, add(at, { x: 0, y: 14, z: 0 }), at, e.rgb, 0.5, n % 2 ? "bender:element_star" : "bender:element_orb");
        ring(dim, add(at, { x: 0, y: 0.2, z: 0 }), p.radius, e.rgb, 14);
        sound(dim, SOUNDS[e.key][1], at, 1.4, 1);
        for (const v of foesNear(dim, at, p.radius, ctx.side, caster)) strike(v, ctx, at);
        n++;
      }
      t++;
      return n < p.count;
    },
  });
}

function castSweep(ctx) {
  const { p, dim, e, caster } = ctx;
  const from = { ...caster.location };
  const f = forward(ctx.yaw);
  const hitIds = new Set();
  let t = 0;
  applyFx(caster, p.self);
  active.push({
    step() {
      t++;
      const d = (t / p.over) * p.range;
      for (let s = -p.width / 2; s <= p.width / 2; s += 0.8) {
        const pos = { x: from.x + f.x * d - f.z * s, y: from.y + 0.3, z: from.z + f.z * d + f.x * s };
        spark(dim, pos, e.rgb);
        if (Math.abs(s) < 0.5 || t % 2) spark(dim, add(pos, { x: 0, y: 1.2, z: 0 }), e.rgb, "bender:element_orb");
      }
      if (p.block && t % 2 === 0) {
        const at = { x: from.x + f.x * d, y: from.y, z: from.z + f.z * d };
        placeTemp(dim, at, p.block, 60);
        placeTemp(dim, add(at, { x: 0, y: 1, z: 0 }), p.block, 60);
      }
      for (const v of foesNear(dim, from, p.range + 2, ctx.side, caster)) {
        if (hitIds.has(v.id) || !inStrip(from, ctx.yaw, v.location, d, p.width + 1)) continue;
        hitIds.add(v.id);
        hurt(v, p.damage, ctx);
        knock(v, from, p.knock ?? 1, p.lift ?? 0.4);
      }
      if (t % 6 === 0) sound(dim, SOUNDS[e.key][1], { x: from.x + f.x * d, y: from.y, z: from.z + f.z * d }, 1, 0.8);
      return t < p.over;
    },
  });
}

/** Use a power. ctx: caster, side ("player" or "guardian"), element, p (the power), dim, origin, dir, yaw, point. */
function cast(ctx) {
  const { p } = ctx;
  if (p.kind !== "dash" && p.kind !== "leap" && p.kind !== "sweep") applyFx(ctx.caster, p.self);
  if (ctx.side === "player" && p.ult) sound(ctx.dim, "mob.evocation_illager.cast_spell", ctx.caster.location, 1.5, 1);
  else sound(ctx.dim, SOUNDS[ctx.e.key][0], ctx.caster.location, 0.8, 1);
  switch (p.kind) {
    case "bolt":
      return castBolt(ctx);
    case "burst":
      return castBurst(ctx);
    case "wave":
      return castWave(ctx);
    case "beam":
      return castBeam(ctx);
    case "dash":
      return castDash(ctx, false);
    case "leap":
      return castDash(ctx, true);
    case "blink":
      return castBlink(ctx);
    case "wall":
      return castWall(ctx);
    case "heal":
      return castHeal(ctx);
    case "shield":
      return castShield(ctx);
    case "aura":
      return castAura(ctx);
    case "vortex":
      return castVortex(ctx);
    case "rain":
      return castRain(ctx);
    case "strikes":
      return castStrikes(ctx);
    case "sweep":
      return castSweep(ctx);
  }
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

// ------------------------------------------------------------ using a staff

function useStaff(player, typeId) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < 4) return;
  lastUse.set(player.id, now);
  const el = staffElement(typeId);
  if (el < 0) return;
  const e = ELEMENTS[el];
  const c = casterOf(player);
  let slot = c.slots[el] ?? 0;
  if (player.isSneaking) {
    slot = nextSlot(slot);
    c.slots[el] = slot;
    actionBar(player, hud(c, el, slot), 40);
    sound(player.dimension, "random.click", player.location, 0.8, 1.3 + slot * 0.1);
    return;
  }
  const ok = canCast(c, el, slot, now);
  if (!ok.ok) {
    actionBar(player, whyNot(ok, el, slot), 40);
    return;
  }
  spend(c, el, slot, now);
  const p = e.powers[slot];
  cast({
    caster: player, side: "player", element: el, e, p, dim: player.dimension,
    origin: player.getHeadLocation(), dir: player.getViewDirection(), yaw: player.getRotation().y, point: lookPoint(player),
  });
  if (p.ult) title(player, `${e.color}§l${p.name}!`, `${e.name} ultimate`);
  actionBar(player, hud(c, el, slot), 20);
}

// energy refills, the status line, armor bonuses
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const el = staffElement(held(player));
    const set = fullSet(worn(player));
    regen(casterOf(player), el >= 0 && set === el);
  }
}, 20);

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const el = staffElement(held(player));
    if (el < 0 || now < (messageUntil.get(player.id) ?? 0)) continue;
    const c = casterOf(player);
    actionBar(player, hud(c, el, c.slots[el] ?? 0));
  }
}, 5);

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const set = fullSet(worn(player));
    if (set < 0) continue;
    for (const f of ELEMENTS[set].bonus.effects) addEffect(player, f.id, f.ticks, f.amp);
  }
}, 40);

// Ice armor: water under your feet freezes so you can walk on it (it melts again by itself).
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (fullSet(worn(player)) < 0 || !ELEMENTS[fullSet(worn(player))].bonus.frostWalk) continue;
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
          if (b?.typeId === "minecraft:water" && b.permutation.getState("liquid_depth") === 0) {
            const ice = perm("minecraft:frosted_ice");
            if (ice) b.setPermutation(ice);
          }
        } catch {
          // Skip that block.
        }
      }
    }
  }
}, 4);

// ------------------------------------------------------------ blocks made by powers go away again

let loadedTemp = false;
system.runInterval(() => {
  const now = system.currentTick;
  if (!loadedTemp) {
    // Anything left over from before the world was closed goes now.
    loadedTemp = true;
    try {
      const saved = JSON.parse(String(world.getDynamicProperty(TEMP_KEY) ?? "[]"));
      for (const b of saved) b.until = 0;
      tempBlocks = saved.concat(tempBlocks);
    } catch {
      // Nothing saved.
    }
  }
  const keep = [];
  for (const b of tempBlocks) {
    if (b.until > now) {
      keep.push(b);
      continue;
    }
    try {
      const block = world.getDimension(b.dim).getBlock(b);
      const air = perm("minecraft:air");
      if (block && air && block.typeId === b.id) block.setPermutation(air);
    } catch {
      // Not loaded; it will be tried again.
      keep.push({ ...b, until: now + 100 });
      continue;
    }
    tempDirty = true;
  }
  tempBlocks = keep;
  if (tempDirty) {
    tempDirty = false;
    world.setDynamicProperty(TEMP_KEY, JSON.stringify(tempBlocks.map(({ dim, x, y, z, id }) => ({ dim, x, y, z, id }))));
  }
}, 10);

// ------------------------------------------------------------ guardians

/** A guardian's close-up move: the first of its 2nd/3rd powers that works at a target. */
function guardianMove(el) {
  const kinds = ["burst", "wave", "aura", "bolt", "blink"];
  for (const i of [1, 2]) if (kinds.includes(ELEMENTS[el].powers[i].kind)) return i;
  return 0;
}

function summonGuardian(player, el, spot) {
  const e = ELEMENTS[el];
  const dim = player.dimension;
  let t = 0;
  active.push({
    step() {
      const a = t * 0.5;
      for (let k = 0; k < 3; k++) spark(dim, { x: spot.x + Math.cos(a + k * 2.1) * 1.5, y: spot.y + (t / 60) * 3, z: spot.z + Math.sin(a + k * 2.1) * 1.5 }, e.rgb, "bender:element_orb");
      if (t % 20 === 0) sound(dim, SOUNDS[e.key][0], spot, 1, 0.5 + t / 60);
      if (++t < 60) return true;
      let g;
      try {
        g = dim.spawnEntity(GUARDIAN_ID, spot, { spawnEvent: `bender:element_${e.key}` });
      } catch {
        giveOrDrop(player, new ItemStack(e.orb, 1));
        return false;
      }
      g.nameTag = `${e.color}${e.name} Guardian`;
      g.setDynamicProperty("bender:summoner", player.id);
      g.setDynamicProperty("bender:element", el);
      ring(dim, add(spot, { x: 0, y: 0.3, z: 0 }), 3, e.rgb, 30, "bender:element_star");
      sound(dim, "mob.ravager.roar", spot, 2, 0.8);
      for (const p of dim.getPlayers({ location: spot, maxDistance: 40 })) title(p, `${e.color}The ${e.name} Guardian awakens!`, `Beat it to win the ${e.name} Staff!`);
      return false;
    },
  });
}

function useOrb(player, typeId, block, face) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id + "orb") ?? -100) < 20) return;
  lastUse.set(player.id + "orb", now);
  const el = ELEMENTS.findIndex((e) => e.orb === typeId);
  if (el < 0) return;
  let spot;
  if (block) {
    const o = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
    spot = { x: block.x + 0.5 + o[0], y: block.y + o[1], z: block.z + 0.5 + o[2] };
  } else {
    const f = forward(player.getRotation().y);
    spot = { x: player.location.x + f.x * 5, y: player.location.y, z: player.location.z + f.z * 5 };
  }
  useUpHeld(player, typeId);
  summonGuardian(player, el, spot);
  actionBar(player, `${ELEMENTS[el].color}The ${ELEMENTS[el].name} Guardian is coming...`, 60);
}

function guardianElement(g) {
  try {
    return Number(g.getProperty("bender:element")) || 0;
  } catch {
    return Number(g.getDynamicProperty("bender:element") ?? 0);
  }
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const dimensionId of DIMENSIONS) {
    let found = [];
    try {
      found = world.getDimension(dimensionId).getEntities({ type: GUARDIAN_ID });
    } catch {
      found = [];
    }
    for (const g of found) {
      const el = guardianElement(g);
      const e = ELEMENTS[el];
      let s = guardians.get(g.id);
      if (!s) {
        s = { nextCast: now + 40, nextMove: now + 100, ultUsed: false, lonely: 0, el };
        guardians.set(g.id, s);
      }
      s.el = el;
      const near = g.dimension.getPlayers({ location: g.location, maxDistance: GUARDIAN.reach });
      if (!near.length) {
        s.lonely += 5;
        if (s.lonely > GUARDIAN.leaveAfter) {
          // Nobody came to fight: it goes back into its orb.
          const owner = playerById(String(g.getDynamicProperty("bender:summoner") ?? ""));
          if (owner) {
            giveOrDrop(owner, new ItemStack(e.orb, 1));
            owner.sendMessage(`§7The ${e.name} Guardian went back into its orb. Use it again when you're ready!`);
          }
          ring(g.dimension, g.location, 2, e.rgb, 20, "bender:element_star");
          guardians.delete(g.id);
          g.remove();
        }
        continue;
      }
      s.lonely = 0;
      const target = near.sort((a, b) => dist(a.location, g.location) - dist(b.location, g.location))[0];
      const d = dist(target.location, g.location);
      if (d > 24) continue;
      const origin = add(g.location, { x: 0, y: 2.2, z: 0 });
      const aim = add(target.location, { x: 0, y: 1, z: 0 });
      const dir = norm({ x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z });
      const yaw = (Math.atan2(-dir.x, dir.z) * 180) / Math.PI;
      const ctxFor = (slot) => ({ caster: g, side: "guardian", element: el, e, p: e.powers[slot], dim: g.dimension, origin, dir, yaw, point: target.location, target: target.location });
      const health = g.getComponent("minecraft:health");
      let slot = -1;
      if (!s.ultUsed && health && health.currentValue <= health.effectiveMax * GUARDIAN.ultAt) {
        s.ultUsed = true;
        slot = 3;
        for (const p of near) title(p, `${e.color}${e.powers[3].name}!`, `The ${e.name} Guardian is angry!`);
      } else if (now >= s.nextMove && d <= GUARDIAN.burstReach) {
        slot = guardianMove(el);
        s.nextMove = now + GUARDIAN.burstEvery;
      } else if (now >= s.nextCast) {
        slot = 0;
        s.nextCast = now + GUARDIAN.castEvery + Math.floor(Math.random() * 20);
      }
      if (slot < 0) continue;
      try {
        g.playAnimation("animation.bender_guardian.cast");
      } catch {
        // The power still works.
      }
      cast(ctxFor(slot));
    }
  }
}, 5);

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  let location;
  let dimension;
  try {
    location = deadEntity.location;
    dimension = deadEntity.dimension;
  } catch {
    return;
  }
  const s = guardians.get(deadEntity.id);
  guardians.delete(deadEntity.id);
  const el = s?.el ?? guardianElement(deadEntity);
  const e = ELEMENTS[el];
  for (let i = 0; i < 3; i++) ring(dimension, add(location, { x: 0, y: 0.5 + i, z: 0 }), 1 + i, e.rgb, 24, "bender:element_star");
  sound(dimension, "random.totem", location, 1, 1);
  for (let i = 0; i < 8; i++) {
    try {
      dimension.spawnEntity("minecraft:xp_orb", add(location, { x: Math.random() * 2 - 1, y: 0.5, z: Math.random() * 2 - 1 }));
    } catch {
      break;
    }
  }
  for (const p of dimension.getPlayers({ location, maxDistance: 48 })) {
    const staff = new ItemStack(e.staff, 1);
    staff.setLore(staffLore(el));
    giveOrDrop(p, staff);
    const shards = new ItemStack(e.shard, GUARDIAN.reward.shards);
    shards.setLore(LORE_FOR(e.shard));
    giveOrDrop(p, shards);
    title(p, `${e.color}§lYou beat the ${e.name} Guardian!`, `You won the ${e.name} Staff and ${GUARDIAN.reward.shards} shards`);
    sound(p.dimension, "random.levelup", p.location, 1, 1);
    p.sendMessage(`${e.color}${e.name} Staff§r: tap to use a power, sneak + tap to switch. Craft ${e.name} armor from the shards!`);
  }
}, { entityTypes: [GUARDIAN_ID] });

// ------------------------------------------------------------ hitting with a staff

const TOUCH = {
  fire: (t) => burn(t, 3),
  water: (t, p) => knock(t, p.location, 0.8, 0.3),
  earth: (t, p) => knock(t, p.location, 0.6, 0.45),
  air: (t, p) => knock(t, p.location, 1.6, 0.4),
  lightning: (t) => addEffect(t, "slowness", 30, 1),
  ice: (t) => addEffect(t, "slowness", 40, 2),
  nature: (t) => addEffect(t, "poison", 40),
  lava: (t) => burn(t, 4),
  light: (t) => addEffect(t, "weakness", 60),
  shadow: (t) => addEffect(t, "wither", 40),
};

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId === GUARDIAN_ID) {
    try {
      damagingEntity.playAnimation("animation.bender_guardian.swing");
    } catch {
      // Not important.
    }
    return;
  }
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;
  const el = staffElement(held(player));
  if (el < 0 || !isFoe(hitEntity, "player", player)) return;
  const e = ELEMENTS[el];
  const target = hitEntity;
  system.run(() => {
    if (!target.isValid) return;
    TOUCH[e.key](target, player);
    ring(target.dimension, add(target.location, { x: 0, y: 1, z: 0 }), 0.6, e.rgb, 10);
    addCharge(casterOf(player), 3);
  });
});

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
      const { block, blockFace } = event;
      system.run(() => fn(player, id, block, blockFace));
    },
  };
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:staff", both((player, id) => useStaff(player, id)));
  itemComponentRegistry.registerCustomComponent("bender:orb", both((player, id, block, face) => useOrb(player, id, block, face)));
});

// ------------------------------------------------------------ descriptions, starting element

function LORE_FOR(typeId) {
  const el = elementOfItem(typeId);
  if (el < 0) return undefined;
  const e = ELEMENTS[el];
  if (typeId === e.staff) return staffLore(el);
  if (typeId === e.orb) return [`§7Tap the ground to summon the ${e.name} Guardian`, `§7Beat it to win the ${e.name} Staff!`];
  if (typeId === e.shard) return [`§7Craft ${e.name} armor from these`, "§7(like iron armor, but with shards)"];
  return [`§7Wear all 4 ${e.name} pieces for:`, `${e.color}${e.bonus.name}`, "§7and faster energy with the matching staff"];
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.getLore().length > 0) continue;
      const lore = LORE_FOR(item.typeId);
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

function giveStarter(player, el) {
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  const e = ELEMENTS[el];
  const staff = new ItemStack(e.staff, 1);
  staff.setLore(staffLore(el));
  giveOrDrop(player, staff);
  const others = ELEMENTS.map((_, i) => i).filter((i) => i !== el);
  for (let k = 0; k < 2; k++) {
    const o = others.splice(Math.floor(Math.random() * others.length), 1)[0];
    const orb = new ItemStack(ELEMENTS[o].orb, 1);
    orb.setLore(LORE_FOR(ELEMENTS[o].orb) ?? []);
    giveOrDrop(player, orb);
  }
  title(player, `${e.color}§lYou are a ${e.name} bender!`, "Tap your staff to use a power");
  player.sendMessage(`${e.color}${e.name} Staff§r: tap to use a power, sneak + tap to switch powers. The 4th power is your ultimate!`);
  player.sendMessage("§7You also got 2 Guardian Orbs. Tap the ground with one to summon a guardian, and beat it to win its staff!");
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lChoose your element!").body("Pick your first element. You can win the others by beating their guardians.");
  for (const e of ELEMENTS) form.button(`${e.color}§l${e.name}`, `textures/items/${e.key}_staff`);
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
