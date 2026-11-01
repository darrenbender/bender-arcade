// Mob Rider: ride any mob with the Magic Saddle.
//
// How it works: the player sits on an invisible "seat" entity that they
// steer, and the mob is moved to the seat every tick, so it looks like the
// player is riding the mob. While ridden, the mob is calm and can't be hurt.

import { system, world, ButtonState, InputButton, ItemStack } from "@minecraft/server";

const SEAT_ID = "bender:ride_seat";
const SADDLE_ID = "bender:magic_saddle";

// Rider heights. Each one matches a "bender:seat_N" event in ride_seat.json.
const SEAT_HEIGHTS = [0.45, 0.65, 0.85, 1.05, 1.3, 1.6, 2.0, 2.6, 3.4, 4.4];

// Big or oddly shaped mobs whose eye height doesn't match their size.
const SEAT_OVERRIDE = {
  "minecraft:ghast": 9,
  "minecraft:happy_ghast": 9,
  "minecraft:wither": 8,
  "minecraft:warden": 7,
  "minecraft:iron_golem": 6,
  "minecraft:ravager": 6,
  "minecraft:elder_guardian": 6,
  "minecraft:sniffer": 5,
  "minecraft:camel": 5,
};

const FLYERS = new Set(
  ["ghast", "happy_ghast", "phantom", "bee", "parrot", "allay", "bat", "blaze", "vex", "wither"].map(
    (id) => `minecraft:${id}`
  )
);

const SWIMMERS = new Set(
  [
    "dolphin",
    "squid",
    "glow_squid",
    "cod",
    "salmon",
    "pufferfish",
    "tropicalfish",
    "guardian",
    "elder_guardian",
    "axolotl",
    "turtle",
    "tadpole",
    "nautilus",
  ].map((id) => `minecraft:${id}`)
);

const NO_RIDE = new Set([
  SEAT_ID,
  "minecraft:player",
  "minecraft:ender_dragon",
  "minecraft:shulker",
  "minecraft:armor_stand",
  "minecraft:npc",
  "minecraft:agent",
]);

const FLY_SPEED = 0.45;
const SWIM_SPEED = 0.35;
const LAND_CRAWL_SPEED = 0.1;

// playerId -> { player, seat, mob, mobId, mode, tick }
const rides = new Map();
// Mob ids that are being ridden right now.
const ridden = new Set();
// Seats spawned but not yet ridden (the 2-tick gap before the player climbs on).
const pendingSeats = new Set();

// ------------------------------------------------------------ helpers

function actionBar(player, message) {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // Not important if this fails.
  }
}

function sound(dimension, id, location, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // Missing sound: carry on silently.
  }
}

function addEffect(entity, effect, ticks, amplifier) {
  try {
    entity.addEffect(effect, ticks, { amplifier, showParticles: false });
  } catch {
    // Some entities can't have effects.
  }
}

function mobName(mob) {
  if (mob.nameTag) return { text: mob.nameTag };
  return { translate: mob.localizationKey };
}

function canRide(mob) {
  if (!mob || !mob.isValid) return false;
  if (NO_RIDE.has(mob.typeId)) return false;
  if (!mob.getComponent("minecraft:health")) return false;
  const family = mob.getComponent("minecraft:type_family");
  if (family && (family.hasTypeFamily("inanimate") || family.hasTypeFamily("player"))) return false;
  return true;
}

function modeFor(mob) {
  if (FLYERS.has(mob.typeId)) return "fly";
  if (SWIMMERS.has(mob.typeId)) return "swim";
  return "ground";
}

function seatIndexFor(mob) {
  const baby = !!mob.getComponent("minecraft:is_baby");
  if (!baby && SEAT_OVERRIDE[mob.typeId] !== undefined) return SEAT_OVERRIDE[mob.typeId];
  let eye = 1;
  try {
    eye = mob.getHeadLocation().y - mob.location.y;
  } catch {
    eye = 1;
  }
  const target = 0.85 * eye + 0.1;
  let best = 0;
  for (let i = 1; i < SEAT_HEIGHTS.length; i++) {
    if (Math.abs(SEAT_HEIGHTS[i] - target) < Math.abs(SEAT_HEIGHTS[best] - target)) best = i;
  }
  return best;
}

// Keep the mob calm and safe while it's being ridden.
function protectMob(mob) {
  addEffect(mob, "resistance", 40, 4);
  addEffect(mob, "weakness", 40, 255);
}

// ------------------------------------------------------------ getting on

function startRide(player) {
  if (rides.has(player.id) || player.getComponent("minecraft:riding")) {
    actionBar(player, "Sneak to get off first!");
    return;
  }
  const hits = player.getEntitiesFromViewDirection({ maxDistance: 6 });
  const hit = hits.find((h) => h.entity.id !== player.id && canRide(h.entity));
  if (!hit) {
    actionBar(player, "Look at a mob, then tap Ride!");
    return;
  }
  const mob = hit.entity;
  if (ridden.has(mob.id)) {
    actionBar(player, "Someone is already riding that one!");
    return;
  }

  const mode = modeFor(mob);
  let seat;
  try {
    seat = mob.dimension.spawnEntity(SEAT_ID, mob.location);
  } catch {
    actionBar(player, "Can't ride that one here.");
    return;
  }
  seat.setRotation({ x: 0, y: mob.getRotation().y });
  seat.setDynamicProperty("bender:mob", mob.id);
  seat.triggerEvent(`bender:seat_${seatIndexFor(mob)}`);
  seat.triggerEvent(`bender:mode_${mode}`);
  ridden.add(mob.id);
  pendingSeats.add(seat.id);
  const mobId = mob.id;

  // Give the seat a moment to pick up its size and mode, then climb on.
  system.runTimeout(() => {
    pendingSeats.delete(seat.id);
    const ok =
      seat.isValid && mob.isValid && player.isValid && seat.getComponent("minecraft:rideable")?.addRider(player);
    if (!ok) {
      ridden.delete(mobId);
      if (seat.isValid) seat.remove();
      if (player.isValid) actionBar(player, "Couldn't climb on. Try again!");
      return;
    }
    rides.set(player.id, { player, seat, mob, mobId, mode, tick: 0 });
    protectMob(mob);
    sound(player.dimension, "mob.horse.saddle", player.location);
    const how =
      mode === "fly"
        ? " Look where you want to go and walk forward. Jump to go up."
        : mode === "swim"
          ? " Swim where you look. Jump to go up."
          : "";
    actionBar(player, { rawtext: [{ text: "§aRiding " }, mobName(mob), { text: `!§r${how}` }] });
  }, 2);
}

// ------------------------------------------------------------ getting off

function endRide(playerId, ride) {
  rides.delete(playerId);
  ridden.delete(ride.mobId);
  const { player, seat, mob, mode } = ride;
  if (seat.isValid) {
    try {
      seat.remove();
    } catch {
      // Already gone.
    }
  }
  if (mob.isValid) {
    // Give the rider a head start before a grumpy mob can bite.
    addEffect(mob, "weakness", 100, 255);
    addEffect(mob, "slowness", 60, 3);
  }
  if (player.isValid && mode === "fly") {
    // Float down gently if you hop off a flying mob.
    addEffect(player, "slow_falling", 200, 0);
  }
}

// ------------------------------------------------------------ steering

// Ground mobs are steered by Minecraft itself (like a horse). Flying and
// swimming mobs are steered here using the rider's controls.
function steer(ride) {
  const { player, seat, mode } = ride;
  let move = { x: 0, y: 0 };
  let jump = false;
  try {
    move = player.inputInfo.getMovementVector();
    jump = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // Controls unavailable this tick.
  }
  const dir = player.getViewDirection();
  seat.setRotation({ x: 0, y: player.getRotation().y });

  if (mode === "fly" || seat.isInWater) {
    const speed = mode === "fly" ? FLY_SPEED : SWIM_SPEED;
    const f = move.y * speed;
    const v = { x: dir.x * f, y: dir.y * f, z: dir.z * f };
    if (jump) v.y = Math.max(v.y, speed * 0.7);
    seat.clearVelocity();
    seat.applyImpulse(v);
  } else {
    // A swimmer on dry land: shuffle along slowly, gravity still works.
    const len = Math.hypot(dir.x, dir.z) || 1;
    const fall = seat.getVelocity().y;
    const f = move.y * LAND_CRAWL_SPEED;
    seat.clearVelocity();
    seat.applyImpulse({ x: (dir.x / len) * f, y: fall, z: (dir.z / len) * f });
  }
}

system.runInterval(() => {
  for (const [playerId, ride] of rides) {
    const { player, seat, mob } = ride;
    if (!player.isValid || !seat.isValid || !mob.isValid || mob.dimension.id !== seat.dimension.id) {
      endRide(playerId, ride);
      continue;
    }
    ride.tick++;
    if (ride.tick > 5) {
      const on = player.getComponent("minecraft:riding")?.entityRidingOn;
      if (!on || on.id !== seat.id) {
        endRide(playerId, ride);
        continue;
      }
    }
    if (ride.mode !== "ground") steer(ride);
    try {
      mob.teleport(seat.location, { rotation: { x: 0, y: seat.getRotation().y }, keepVelocity: false });
    } catch {
      // Try again next tick.
    }
    if (ride.tick % 5 === 0 && mob.typeId === "minecraft:creeper") {
      try {
        mob.triggerEvent("minecraft:stop_exploding");
      } catch {
        // Older creepers may name this differently; the explosion guard below still applies.
      }
    }
    if (ride.tick % 20 === 1) protectMob(mob);
    if (ride.tick % 80 === 40) actionBar(player, "§7Sneak to get off");
  }
}, 1);

// After a world reload, reconnect seats to their mobs, and clear out any
// leftover empty seats.
system.runInterval(() => {
  const tracked = new Set([...rides.values()].map((r) => r.seat.id));
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    let seats = [];
    try {
      seats = world.getDimension(dimensionId).getEntities({ type: SEAT_ID });
    } catch {
      continue;
    }
    for (const seat of seats) {
      if (tracked.has(seat.id) || pendingSeats.has(seat.id)) continue;
      const riders = seat.getComponent("minecraft:rideable")?.getRiders() ?? [];
      const player = riders.find((r) => r.typeId === "minecraft:player");
      const mobId = seat.getDynamicProperty("bender:mob");
      const mob = typeof mobId === "string" ? world.getEntity(mobId) : undefined;
      if (player && mob && mob.isValid && !rides.has(player.id) && !ridden.has(mob.id)) {
        rides.set(player.id, { player, seat, mob, mobId: mob.id, mode: modeFor(mob), tick: 6 });
        ridden.add(mob.id);
      } else {
        try {
          seat.remove();
        } catch {
          // Already gone.
        }
      }
    }
  }
}, 40);

// ------------------------------------------------------------ keeping the rider safe

// If the mob you're riding hurts you (a skeleton's arrow, say), heal it back.
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damage, damageSource }) => {
  if (hurtEntity.typeId !== "minecraft:player") return;
  const ride = rides.get(hurtEntity.id);
  if (!ride || damageSource.damagingEntity?.id !== ride.mobId) return;
  const health = hurtEntity.getComponent("minecraft:health");
  if (health && health.currentValue > 0) {
    health.setCurrentValue(Math.min(health.currentValue + damage, health.effectiveMax));
  }
});

// A creeper you're riding never explodes.
world.beforeEvents.explosion.subscribe((event) => {
  if (event.source && ridden.has(event.source.id)) event.cancel = true;
});

// ------------------------------------------------------------ the saddle

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:ride_saddle", {
    onUse(event) {
      const player = event.source;
      system.run(() => startRide(player));
    },
  });
});

const SADDLE_LORE = ["§eLook at any mob and tap Ride!", "§7Sneak to get off"];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item || item.typeId !== SADDLE_ID || item.getLore().length > 0) continue;
      try {
        item.setLore(SADDLE_LORE);
        container.setItem(slot, item);
      } catch {
        // Try again next time.
      }
    }
  }
}, 40);

// Hand every player a Magic Saddle the first time they join.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (player.getDynamicProperty("bender:rider_welcomed")) return;
  player.setDynamicProperty("bender:rider_welcomed", true);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const saddle = new ItemStack(SADDLE_ID, 1);
    saddle.setLore(SADDLE_LORE);
    const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(saddle);
    if (leftover) player.dimension.spawnItem(leftover, player.location);
    player.sendMessage("§aMob Rider is on!§r Here's a §6Magic Saddle§r. Look at any mob and tap §eRide!§r");
    player.sendMessage("§7Sneak to get off. Flying mobs fly where you look!");
  }, 60);
});
