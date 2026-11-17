// Bender Robo Mobs: ride giant robot mobs, use their special attacks with the
// Robo Remote, and battle your friends' robots in Battle Mode.
//
// Walking robots are ridden like horses (the game moves them). Flying robots
// (Blaze, Ghast, Wither) and the hovering, swimming Guardian are steered here every tick:
// look where you want to go and push forward; hold jump to climb.
// Attacks only hurt monsters and bosses, plus other robots in Battle Mode
// (both pilots have to switch it on). They never hurt players, pets or blocks.

import { system, world, ButtonState, EntityDamageCause, GameMode, InputButton, ItemStack, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  ROBOTS, ROBOT_IDS, REMOTE_ID, PUNCH_DAMAGE, PUNCH_BATTLE, KO_TICKS,
  robotIndex, kitIndex, newRobotState, isDown, canBattle, battleHit, robotSecond,
  newPilot, useAttack, lookVector, fan, stepShot, newShot, waveDamage, bounceSmash,
  steer, inBeam, hud, kitLore,
} from "./robots.js";

const WELCOME_KEY = "bender:robo_welcomed";
const BATTLE_KEY = "bender:robo_battle";
const KOS_KEY = "bender:robo_kos";
const BOSSES = new Set(["bender:element_guardian", "bender:ender_dragon", "minecraft:ender_dragon"]);

const pilots = new Map(); // player id -> { ready, battle, kos }
const robotStates = new Map(); // robot id -> { armor, downUntil, lastHit }
const ridingNow = new Map(); // player id -> robot id
const movers = new Map(); // robot id -> { robot, index, vel, drivenTick } for flying/swimming robots
const dashes = new Map(); // robot id -> { until, hit, index, playerId, dir }
const lasers = new Map(); // robot id -> { fireAt, index, playerId }
const falls = new Map(); // robot id -> highest y while in the air (Robo Slime)
const packHits = new Map(); // robot id -> { count, tick }
const lastPlaced = new Map(); // player id -> tick (taps can arrive twice)
const lastRemote = new Map(); // player id -> tick
let shots = []; // flying shots: { shot, dimension, playerId, robotId, last }

const SHOT_LOOK = {
  arrow: { color: { red: 0.5, green: 0.95, blue: 1 }, size: 0.18, sound: "random.bow", pitch: 1.4 },
  web: { color: { red: 0.95, green: 0.95, blue: 0.95 }, size: 0.3, sound: "mob.spider.say", pitch: 1.6 },
  fire: { color: { red: 1, green: 0.55, blue: 0.1 }, size: 0.35, sound: "mob.blaze.shoot", pitch: 1.1 },
  big_fire: { color: { red: 1, green: 0.35, blue: 0.1 }, size: 0.7, sound: "mob.ghast.fireball", pitch: 0.9 },
  slime: { color: { red: 0.5, green: 1, blue: 0.4 }, size: 0.45, sound: "mob.slime.big", pitch: 1.2 },
  skull: { color: { red: 0.25, green: 0.25, blue: 0.3 }, size: 0.45, sound: "mob.wither.shoot", pitch: 1.3 },
};

// ------------------------------------------------------------ small helpers

function actionBar(player, message) {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // The player left.
  }
}

function title(player, main, sub) {
  try {
    player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 4, stayDuration: 50, fadeOutDuration: 10 });
  } catch {
    // The player left.
  }
}

function sound(entity, id, volume = 1, pitch = 1) {
  try {
    entity.dimension.playSound(id, entity.location, { volume, pitch });
  } catch {
    // Not loaded.
  }
}

function soundAt(dimension, location, id, volume = 1, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // Not loaded.
  }
}

function particle(dimension, id, location, vars) {
  try {
    dimension.spawnParticle(id, location, vars);
  } catch {
    // Not loaded.
  }
}

/** Sculk particles drift along "variable.direction"; this sends them upward. */
function soulParticle(dimension, id, location) {
  const vars = new MolangVariableMap();
  vars.setVector3("variable.direction", { x: 0, y: 1, z: 0 });
  particle(dimension, id, location, vars);
}

function dot(dimension, location, color, size) {
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", color);
  vars.setFloat("variable.size", size);
  particle(dimension, "bender:robo_dot", location, vars);
}

function addEffect(entity, effect, ticks, amplifier = 0) {
  try {
    entity.addEffect(effect, ticks, { amplifier, showParticles: false });
  } catch {
    // Unknown effect or the entity is gone.
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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function center(entity, up = 0.9) {
  return { x: entity.location.x, y: entity.location.y + up, z: entity.location.z };
}

/** The middle of a robot's giant body. */
function robotMiddle(robot) {
  const body = ROBOTS[robotIndex(robot.typeId)]?.body;
  return center(robot, body ? body.size[1] / 2 : 1);
}

/** How far a spot is from a robot's body (0 when it's inside it). */
function distToRobot(robot, at) {
  const body = ROBOTS[robotIndex(robot.typeId)]?.body;
  const half = body ? body.size[0] / 2 : 1;
  const top = robot.location.y + (body ? body.size[1] : 2);
  const flat = Math.max(0, Math.hypot(at.x - robot.location.x, at.z - robot.location.z) - half);
  const up = at.y < robot.location.y ? robot.location.y - at.y : at.y > top ? at.y - top : 0;
  return Math.hypot(flat, up);
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

function solidAt(dimension, pos) {
  try {
    const b = dimension.getBlock(pos);
    return !!b && !b.isAir && !b.isLiquid;
  } catch {
    return false;
  }
}

function ridersOf(robot) {
  try {
    return robot.getComponent("minecraft:rideable")?.getRiders() ?? [];
  } catch {
    return [];
  }
}

function pilotPlayerOf(robot) {
  return ridersOf(robot).find((r) => r.typeId === "minecraft:player");
}

function robotUnder(player) {
  try {
    const v = player.getComponent("minecraft:riding")?.entityRidingOn;
    return v && ROBOT_IDS.has(v.typeId) ? v : undefined;
  } catch {
    return undefined;
  }
}

function pilotState(player) {
  let p = pilots.get(player.id);
  if (!p) {
    p = newPilot();
    p.battle = player.getDynamicProperty(BATTLE_KEY) === true;
    const kos = player.getDynamicProperty(KOS_KEY);
    p.kos = typeof kos === "number" ? kos : 0;
    pilots.set(player.id, p);
  }
  return p;
}

function stateOf(robot) {
  let s = robotStates.get(robot.id);
  if (!s) {
    s = newRobotState(robotIndex(robot.typeId));
    let down = false;
    try {
      down = robot.getProperty("bender:down") === true;
    } catch {
      down = false;
    }
    if (down) {
      // Knocked out before the world was saved: finish repairing soon.
      s.armor = 0;
      s.downUntil = system.currentTick + 60;
    }
    robotStates.set(robot.id, s);
  }
  return s;
}

/** Only monsters and bosses: never players, pets, animals or robots. */
function isFoe(entity) {
  if (!entity?.isValid || entity.typeId === "minecraft:player" || ROBOT_IDS.has(entity.typeId)) return false;
  return BOSSES.has(entity.typeId) || hasFamily(entity, "monster");
}

function nearby(dimension, location, radius) {
  try {
    return dimension.getEntities({ location, maxDistance: radius });
  } catch {
    return [];
  }
}

function hurt(target, amount, player) {
  if (!target.isValid) return;
  try {
    target.applyDamage(Math.max(1, Math.round(amount)), player?.isValid
      ? { cause: EntityDamageCause.entityAttack, damagingEntity: player }
      : { cause: EntityDamageCause.magic });
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

function applyAttackEffects(target, attack) {
  for (const e of attack.effects ?? []) addEffect(target, e.id, e.ticks, e.amp);
  if (attack.fire) {
    try {
      target.setOnFire(attack.fire, true);
    } catch {
      // Fireproof.
    }
  }
}

// ------------------------------------------------------------ Battle Mode

/** Who is battling: the attacking pilot's robot, and their Battle Mode switch. */
function sideOf(player, robot) {
  return player && robot ? { robotId: robot.id, battle: pilotState(player).battle } : undefined;
}

/** Robots near a spot that this attacker may hit in Battle Mode. */
function battleTargets(player, myRobot, location, radius) {
  const me = sideOf(player, myRobot);
  return nearby(myRobot.dimension, location, radius + 14).filter((e) => {
    if (!ROBOT_IDS.has(e.typeId) || e.id === myRobot.id) return false;
    const pilot = pilotPlayerOf(e);
    if (!pilot || !canBattle(me, sideOf(pilot, e))) return false;
    return distToRobot(e, location) <= radius;
  });
}

function hitRobot(player, myRobot, target, damage) {
  const index = robotIndex(target.typeId);
  if (index < 0) return;
  const state = stateOf(target);
  const res = battleHit(state, index, damage, system.currentTick);
  if (res.ignored) return;
  particle(target.dimension, "minecraft:critical_hit_emitter", center(target, 1.5));
  sound(target, "random.anvil_land", 0.35, 1.8);
  if (res.ko) knockOut(target, player, myRobot);
}

function knockOut(robot, byPlayer, byRobot) {
  const index = robotIndex(robot.typeId);
  const victims = ridersOf(robot).filter((r) => r.typeId === "minecraft:player");
  try {
    robot.getComponent("minecraft:rideable")?.ejectRiders();
  } catch {
    // Nobody aboard.
  }
  try {
    robot.triggerEvent("bender:knock_out");
  } catch {
    // Gone.
  }
  movers.delete(robot.id);
  dashes.delete(robot.id);
  lasers.delete(robot.id);
  particle(robot.dimension, "minecraft:huge_explosion_emitter", robotMiddle(robot));
  for (let i = 0; i < 6; i++) {
    particle(robot.dimension, "minecraft:basic_smoke_particle", {
      x: robot.location.x + (Math.random() - 0.5) * 1.5, y: robot.location.y + 1 + Math.random() * 2, z: robot.location.z + (Math.random() - 0.5) * 1.5,
    });
  }
  sound(robot, "random.explode", 0.6, 1.5);
  const loser = ROBOTS[index].name;
  for (const v of victims) title(v, "§cKnocked out!", `§7Your ${loser} repairs itself in ${KO_TICKS / 20} seconds`);
  if (byPlayer?.isValid) {
    const p = pilotState(byPlayer);
    p.kos += 1;
    byPlayer.setDynamicProperty(KOS_KEY, p.kos);
    title(byPlayer, "§aKnockout!", `§7You have ${p.kos} knockout${p.kos === 1 ? "" : "s"}`);
    const winner = byRobot ? ROBOTS[robotIndex(byRobot.typeId)].name : "robot";
    const loserName = victims[0]?.name ?? "someone";
    for (const pl of robot.dimension.getPlayers({ location: robot.location, maxDistance: 96 })) {
      pl.sendMessage(`§c⚔ ${byPlayer.name}'s ${winner} knocked out ${loserName}'s ${loser}!`);
    }
  }
}

// ------------------------------------------------------------ getting in and out

function boarded(player, robot) {
  const r = ROBOTS[robotIndex(robot.typeId)];
  const how = r.move === "fly" ? "Look where to go and push forward. Hold jump to climb."
    : r.move === "swim" ? "It hovers! Look where to go and push forward, hold jump to rise. Even faster underwater. Its spikes zap monsters that get close."
      : r.climb ? "Walk into a wall to climb it!" : r.bounce ? "Hold jump for a super bounce!" : "Hold jump to jump high.";
  title(player, `${r.color}§l${r.name}`, `§7${how}`);
  player.sendMessage(`${r.color}${r.name}§r: ${how} Hold the §bRobo Remote§r and tap for §e${r.attack.name}§r. Sneak to get off. §7Tip: first-person view puts you in the cockpit.`);
  sound(robot, "mob.irongolem.repair", 0.8, 0.8);
  if (r.key === "warden") {
    sound(robot, "mob.warden.roar", 1, 0.9);
    const at = fromRobot(robot, r.body.mouth, r.body.front);
    for (let i = 0; i < 4; i++) particle(robot.dimension, "minecraft:shriek_particle", { x: at.x, y: at.y + 1 + i * 0.8, z: at.z });
  }
}

function leftRobot(player) {
  actionBar(player, "");
}

// ------------------------------------------------------------ flying, swimming, climbing, bouncing

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

function drive(robot, index, player, tick) {
  const spec = ROBOTS[index];
  let m = movers.get(robot.id);
  if (!m) {
    m = { robot, index, vel: { x: 0, y: 0, z: 0 } };
    movers.set(robot.id, m);
  }
  m.drivenTick = tick;
  const input = readInput(player);
  try {
    if (spec.move === "fly") {
      m.vel = steer(spec.speed, m.vel, input, { onGround: robot.isOnGround });
      robot.clearVelocity();
      robot.applyImpulse(m.vel);
    } else {
      // The Robo Guardian hovers on land and zooms faster underwater.
      const wet = robot.isInWater;
      m.vel = steer(wet ? spec.swimSpeed : spec.speed, m.vel, input, { onGround: robot.isOnGround });
      robot.clearVelocity();
      robot.applyImpulse(m.vel);
    }
    robot.setRotation({ x: 0, y: input.yaw });
  } catch {
    // Unloaded this tick.
  }
}

/** Parked flying robots drift gently down to the ground. */
function settle(m, tick) {
  const { robot } = m;
  if (!robot.isValid || ROBOTS[m.index].move === "walk") {
    movers.delete(robot.id);
    return;
  }
  try {
    m.vel = steer(ROBOTS[m.index].speed, m.vel, undefined, { onGround: robot.isOnGround });
    robot.clearVelocity();
    robot.applyImpulse(m.vel);
    if (robot.isOnGround && Math.hypot(m.vel.x, m.vel.z) < 0.01) movers.delete(robot.id);
  } catch {
    movers.delete(robot.id);
  }
  if (tick - (m.drivenTick ?? 0) > 20 * 60) movers.delete(robot.id);
}

function climb(robot, player) {
  const input = readInput(player);
  if (input.forward < 0.3) return;
  const yaw = robot.getRotation().y;
  const f = lookVector(yaw, 0);
  const base = robot.location;
  const reach = 2.0;
  const low = { x: base.x + f.x * reach, y: base.y + 0.4, z: base.z + f.z * reach };
  const high = { x: base.x + f.x * reach, y: base.y + 1.3, z: base.z + f.z * reach };
  if (!solidAt(robot.dimension, low) && !solidAt(robot.dimension, high)) return;
  try {
    const v = robot.getVelocity();
    robot.applyImpulse({ x: 0, y: 0.3 - v.y, z: 0 });
  } catch {
    // Unloaded.
  }
}

function bounce(robot, player, index) {
  const y = robot.location.y;
  if (!robot.isOnGround) {
    falls.set(robot.id, Math.max(falls.get(robot.id) ?? y, y));
    return;
  }
  const top = falls.get(robot.id);
  falls.delete(robot.id);
  if (!bounceSmash(top, y)) return;
  // Robo Slime smash: everything close by gets bounced.
  const at = robot.location;
  for (const foe of nearby(robot.dimension, at, 7).filter(isFoe)) {
    hurt(foe, 6, player);
    push(foe, at, 1.4, 0.6);
  }
  for (const other of battleTargets(player, robot, at, 5)) hitRobot(player, robot, other, 6);
  particle(robot.dimension, "minecraft:huge_explosion_emitter", at);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    dot(robot.dimension, { x: at.x + Math.cos(a) * 5, y: at.y + 0.3, z: at.z + Math.sin(a) * 5 }, SHOT_LOOK.slime.color, 0.9);
  }
  sound(robot, "mob.slime.big", 1, 0.6);
}

// ------------------------------------------------------------ special attacks

function fromRobot(robot, up, forward) {
  const f = lookVector(robot.getRotation().y, 0);
  return { x: robot.location.x + f.x * forward, y: robot.location.y + up, z: robot.location.z + f.z * forward };
}

function attack(player, robot, index) {
  const tick = system.currentTick;
  if (isDown(stateOf(robot), tick)) return;
  const pilot = pilotState(player);
  const r = ROBOTS[index];
  const res = useAttack(pilot, index, tick);
  if (!res.ok) {
    actionBar(player, `§7${r.attack.name} is recharging: ${res.wait}s`);
    return;
  }
  const a = r.attack;
  if (a.kind === "wave") wave(player, robot, index);
  else if (a.kind === "volley") volley(player, robot, index);
  else if (a.kind === "punch") megaPunch(player, robot, index);
  else if (a.kind === "dash") startDash(player, robot, index, tick);
  else if (a.kind === "laser") startLaser(player, robot, index, tick);
}

function wave(player, robot, index) {
  const a = ROBOTS[index].attack;
  const at = robot.location;
  for (const foe of nearby(robot.dimension, at, a.radius + 1).filter(isFoe)) {
    const d = dist(foe.location, at);
    const dmg = waveDamage(index, Math.min(d, a.radius));
    hurt(foe, dmg, player);
    push(foe, at, a.knock, a.lift);
  }
  for (const other of battleTargets(player, robot, at, a.radius)) hitRobot(player, robot, other, waveDamage(index, Math.min(distToRobot(other, at), a.radius)));
  const color = ROBOTS[index].key === "creeper" ? { red: 0.55, green: 1, blue: 0.4 } : { red: 0.9, green: 0.85, blue: 0.75 };
  for (let ring = 1; ring <= 3; ring++) {
    const r = (a.radius * ring) / 3;
    for (let i = 0; i < 10 * ring; i++) {
      const ang = (i / (10 * ring)) * Math.PI * 2;
      dot(robot.dimension, { x: at.x + Math.cos(ang) * r, y: at.y + 0.4, z: at.z + Math.sin(ang) * r }, color, 0.5);
    }
  }
  if (ROBOTS[index].key === "creeper") {
    particle(robot.dimension, "minecraft:huge_explosion_emitter", robotMiddle(robot));
    sound(robot, "random.explode", 1, 1.2);
  } else {
    particle(robot.dimension, "minecraft:large_explosion", at);
    sound(robot, "mob.irongolem.throw", 1, 0.6);
    sound(robot, "random.anvil_land", 0.6, 0.5);
  }
}

function volley(player, robot, index) {
  const r = ROBOTS[index];
  const a = r.attack;
  const body = r.body;
  const from = fromRobot(robot, body.mouth, body.front);
  // Aim from the robot at whatever is under the pilot's crosshair (the robot's mouth
  // is a few blocks away from the pilot's eyes).
  const aim = laserAim(player, a.range).point;
  const toAim = { x: aim.x - from.x, y: aim.y - from.y, z: aim.z - from.z };
  for (const dir of fan(toAim, a.count, a.spread)) {
    shots.push({ shot: newShot(index, from, dir), dimension: robot.dimension, playerId: player.id, robotId: robot.id, last: { ...from } });
  }
  const look = SHOT_LOOK[a.shot];
  sound(robot, look.sound, 1, look.pitch);
}

function megaPunch(player, robot, index) {
  const a = ROBOTS[index].attack;
  const f = lookVector(robot.getRotation().y, 0);
  const at = robot.location;
  const inFront = (e) => {
    const dx = e.location.x - at.x;
    const dz = e.location.z - at.z;
    const d = Math.hypot(dx, dz) || 1;
    return d <= a.reach + 1 && (dx * f.x + dz * f.z) / d > 0.35;
  };
  for (const foe of nearby(robot.dimension, at, a.reach + 2).filter(isFoe).filter(inFront)) {
    hurt(foe, a.damage, player);
    push(foe, at, a.knock, 0.5);
    particle(foe.dimension, "minecraft:critical_hit_emitter", center(foe));
  }
  for (const other of battleTargets(player, robot, at, a.reach).filter(inFront)) hitRobot(player, robot, other, a.damage);
  const body = ROBOTS[index].body;
  const fist = { x: at.x + f.x * (body.front + 2), y: at.y + body.mouth, z: at.z + f.z * (body.front + 2) };
  for (let i = 0; i < 8; i++) dot(robot.dimension, { x: fist.x + (Math.random() - 0.5), y: fist.y + (Math.random() - 0.5), z: fist.z + (Math.random() - 0.5) }, { red: 1, green: 0.6, blue: 0.2 }, 0.4);
  sound(robot, "mob.zombie.woodbreak", 0.8, 0.8);
  sound(robot, "mob.irongolem.throw", 1, 0.9);
}

function startDash(player, robot, index, tick) {
  const a = ROBOTS[index].attack;
  const dir = lookVector(robot.getRotation().y, 0);
  try {
    robot.applyImpulse({ x: dir.x * a.power, y: a.up, z: dir.z * a.power });
  } catch {
    return;
  }
  dashes.set(robot.id, { until: tick + a.ticks, hit: new Set(), index, playerId: player.id, dir });
  if (ROBOTS[index].key === "enderman") sound(robot, "mob.endermen.portal", 1, 0.8);
  else sound(robot, "mob.wolf.growl", 1, 0.7);
}

function stepDashes(tick) {
  for (const [id, d] of dashes) {
    const robot = world.getEntity(id);
    const player = world.getEntity(d.playerId);
    if (!robot?.isValid || tick > d.until) {
      dashes.delete(id);
      continue;
    }
    const enderman = ROBOTS[d.index].key === "enderman";
    const at = robotMiddle(robot);
    const reach = ROBOTS[d.index].body.size[0] / 2 + 1.5;
    dot(robot.dimension, at, enderman ? { red: 0.85, green: 0.4, blue: 1 } : { red: 0.9, green: 0.9, blue: 0.95 }, 0.6);
    if (enderman) particle(robot.dimension, "minecraft:portal_directional", at);
    const a = ROBOTS[d.index].attack;
    for (const foe of nearby(robot.dimension, at, reach + ROBOTS[d.index].body.size[1] / 2).filter(isFoe)) {
      if (Math.hypot(foe.location.x - at.x, foe.location.z - at.z) > reach) continue;
      if (d.hit.has(foe.id)) continue;
      d.hit.add(foe.id);
      hurt(foe, a.damage, player);
      try {
        foe.applyKnockback({ x: d.dir.x * 1.5, z: d.dir.z * 1.5 }, 0.5);
      } catch {
        // Can't be pushed.
      }
    }
    if (player?.isValid) {
      for (const other of battleTargets(player, robot, at, reach)) {
        if (d.hit.has(other.id)) continue;
        d.hit.add(other.id);
        hitRobot(player, robot, other, a.damage);
      }
    }
  }
}

function laserAim(player, range) {
  let target;
  try {
    target = player.getEntitiesFromViewDirection({ maxDistance: range })
      .map((h) => h.entity)
      .find((e) => isFoe(e) || (ROBOT_IDS.has(e.typeId) && e.id !== robotUnder(player)?.id));
  } catch {
    target = undefined;
  }
  if (target) return { target, point: center(target, 1) };
  const head = player.getHeadLocation();
  const dir = player.getViewDirection();
  let d = range;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: range });
    if (hit) d = dist(head, { x: hit.block.x + 0.5, y: hit.block.y + 0.5, z: hit.block.z + 0.5 });
  } catch {
    d = range;
  }
  return { target: undefined, point: { x: head.x + dir.x * d, y: head.y + dir.y * d, z: head.z + dir.z * d } };
}

function startLaser(player, robot, index, tick) {
  const a = ROBOTS[index].attack;
  lasers.set(robot.id, { fireAt: tick + a.charge, index, playerId: player.id });
  if (a.style === "sonic") {
    sound(robot, "mob.warden.sonic_charge", 1.2, 1);
    actionBar(player, "§bSonic Boom charging... keep aiming!");
  } else {
    sound(robot, "mob.guardian.attack_loop", 1, 1);
    actionBar(player, "§eLaser charging... keep aiming!");
  }
}

function stepLasers(tick) {
  for (const [id, l] of lasers) {
    const robot = world.getEntity(id);
    const player = world.getEntity(l.playerId);
    if (!robot?.isValid || !player?.isValid || robotUnder(player)?.id !== id) {
      lasers.delete(id);
      continue;
    }
    const a = ROBOTS[l.index].attack;
    const body = ROBOTS[l.index].body;
    const from = fromRobot(robot, body.mouth, body.front);
    const { target, point } = laserAim(player, a.range);
    const firing = tick >= l.fireAt;
    // The beam goes from the robot to the spot under the pilot's crosshair. A piercing one then
    // keeps going along the pilot's line of sight, to its full range (a giant's mouth is high
    // up, so carrying on at the mouth's angle would dive into the ground).
    const len = dist(from, point) || 1;
    const dir = { x: (point.x - from.x) / len, y: (point.y - from.y) / len, z: (point.z - from.z) / len };
    const eye = player.getHeadLocation();
    const view = player.getViewDirection();
    const far = { x: eye.x + view.x * a.range, y: eye.y + view.y * a.range, z: eye.z + view.z * a.range };
    const beamPoints = (step) => {
      const pts = [];
      for (let d = 0; d <= len; d += step) pts.push({ x: from.x + dir.x * d, y: from.y + dir.y * d, z: from.z + dir.z * d });
      if (a.pierce && firing) {
        const rest = dist(point, far);
        for (let d = step; d <= rest; d += step) pts.push({ x: point.x + (far.x - point.x) * d / rest, y: point.y + (far.y - point.y) * d / rest, z: point.z + (far.z - point.z) * d / rest });
      }
      return pts.slice(0, 120);
    };
    if (a.style === "sonic") {
      // Charging: shrieks from its chest and a faint aiming line. Firing: the real sonic rings.
      if (!firing && tick % 4 === 0) {
        particle(robot.dimension, "minecraft:shriek_particle", { x: from.x, y: from.y + 0.5, z: from.z });
        for (const p of beamPoints(1.6)) dot(robot.dimension, p, { red: 0.2, green: 0.9, blue: 0.95 }, 0.12);
      }
      if (firing) for (const p of beamPoints(1.5).slice(1)) particle(robot.dimension, "minecraft:sonic_explosion", p);
    } else if (tick % 2 === 0 || firing) {
      for (const p of beamPoints(firing ? 0.4 : 0.8)) {
        dot(robot.dimension, p, firing ? { red: 1, green: 0.95, blue: 0.4 } : { red: 0.75, green: 0.5, blue: 1 }, firing ? 0.7 : 0.15);
      }
    }
    if (!firing) continue;
    lasers.delete(id);
    if (a.style === "sonic") {
      sound(robot, "mob.warden.sonic_boom", 1.5, 1);
    } else {
      sound(robot, "mob.shulker.shoot", 1, 0.8);
      sound(robot, "beacon.deactivate", 0.6, 2);
    }
    const hitList = a.pierce ? [] : target ? [target] : [];
    if (a.pierce) {
      // Everything along the beam: robot -> crosshair spot, then on along the pilot's sight line.
      for (const e of nearby(robot.dimension, robotMiddle(robot), a.range + 10)) {
        if (e.id === robot.id || !isFoe(e)) continue;
        const c = center(e);
        if (inBeam(from, dir, c, len + 0.5, a.width) || inBeam(eye, view, c, a.range, a.width)) hitList.push(e);
      }
      const seen = new Set();
      for (const p of beamPoints(1.5)) {
        for (const other of battleTargets(player, robot, p, a.width)) {
          if (!seen.has(other.id)) hitList.push(other);
          seen.add(other.id);
        }
      }
    }
    for (const t of hitList) {
      if (ROBOT_IDS.has(t.typeId)) {
        const pilot = pilotPlayerOf(t);
        if (pilot && canBattle(sideOf(player, robot), sideOf(pilot, t))) hitRobot(player, robot, t, a.damage);
      } else if (isFoe(t)) {
        hurt(t, a.damage, player);
        particle(t.dimension, "minecraft:critical_hit_emitter", center(t));
      }
    }
    if (hitList.length > 1) actionBar(player, `§e${a.name} hit ${hitList.length} at once!`);
  }
}

/** Robo Warden: senses monsters nearby, even through walls, and its heart beats. */
function monsterSense(player, robot, index, tick) {
  const sn = ROBOTS[index].sense;
  if (!sn) return;
  if (tick % 24 === 0) sound(robot, "mob.warden.heartbeat", 0.5, 1);
  if (tick % sn.every !== 0) return;
  const mid = robotMiddle(robot);
  const foes = nearby(robot.dimension, mid, sn.radius).filter(isFoe).sort((a, b) => dist(a.location, mid) - dist(b.location, mid));
  pilotState(player).sensed = foes.length;
  for (const foe of foes.slice(0, 12)) {
    const top = { x: foe.location.x, y: foe.location.y + 2.4, z: foe.location.z };
    soulParticle(foe.dimension, "minecraft:sculk_soul_particle", top);
    dot(foe.dimension, top, { red: 0.2, green: 0.9, blue: 0.95 }, 0.5);
  }
  if (foes.length && tick % (sn.every * 3) === 0) sound(robot, "mob.warden.listening", 0.6, 1);
}

/** Robo Guardian: its spikes zap monsters that come too close. */
function spikeShield(player, robot, index, tick) {
  const sh = ROBOTS[index].shield;
  if (!sh || tick % sh.every !== 0) return;
  const mid = robotMiddle(robot);
  const foes = nearby(robot.dimension, mid, sh.radius + 2).filter((e) => isFoe(e) && dist(center(e), mid) <= sh.radius);
  const others = battleTargets(player, robot, mid, sh.radius - 2);
  if (!foes.length && !others.length) return;
  for (const foe of foes) {
    hurt(foe, sh.damage, player);
    push(foe, mid, 1.2, 0.4);
    const c = center(foe);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      dot(robot.dimension, { x: mid.x + (c.x - mid.x) * t, y: mid.y + (c.y - mid.y) * t, z: mid.z + (c.z - mid.z) * t }, { red: 1, green: 0.6, blue: 0.2 }, 0.35);
    }
  }
  for (const other of others) hitRobot(player, robot, other, 3);
  sound(robot, "mob.guardian.hit", 0.8, 1.6);
  actionBar(player, `§6${sh.name}!§r Zapped ${foes.length + others.length}`);
}

function explodeShot(s, at, direct, player) {
  const a = ROBOTS[s.shot.robot].attack;
  const robot = world.getEntity(s.robotId);
  if (a.blast) {
    for (const foe of nearby(s.dimension, at, a.blast + 1.5).filter(isFoe)) {
      const d = dist(center(foe), at);
      if (d > a.blast + 0.6) continue;
      hurt(foe, waveDamage(s.shot.robot, Math.min(d, a.blast)), player);
      applyAttackEffects(foe, a);
      push(foe, at, 0.8, 0.3);
    }
    if (robot?.isValid && player?.isValid) for (const other of battleTargets(player, robot, at, a.blast)) hitRobot(player, robot, other, waveDamage(s.shot.robot, Math.min(distToRobot(other, at), a.blast)));
    const look = SHOT_LOOK[a.shot];
    for (let i = 0; i < 10; i++) {
      dot(s.dimension, { x: at.x + (Math.random() - 0.5) * a.blast, y: at.y + (Math.random() - 0.5) * a.blast, z: at.z + (Math.random() - 0.5) * a.blast }, look.color, look.size);
    }
    particle(s.dimension, a.shot === "big_fire" ? "minecraft:huge_explosion_emitter" : "minecraft:large_explosion", at);
    soundAt(s.dimension, at, a.shot === "slime" ? "mob.slime.big" : "random.explode", 0.7, 1.3);
    return;
  }
  if (!direct) return;
  if (ROBOT_IDS.has(direct.typeId)) {
    if (robot?.isValid && player?.isValid) hitRobot(player, robot, direct, a.damage);
    return;
  }
  hurt(direct, a.damage, player);
  applyAttackEffects(direct, a);
  particle(s.dimension, "minecraft:critical_hit_emitter", at);
}

function stepShots() {
  const still = [];
  for (const s of shots) {
    const going = stepShot(s.shot);
    const at = s.shot.pos;
    const look = SHOT_LOOK[ROBOTS[s.shot.robot].attack.shot];
    // trail between last spot and this one
    for (let i = 1; i <= 2; i++) {
      const t = i / 2;
      dot(s.dimension, { x: s.last.x + (at.x - s.last.x) * t, y: s.last.y + (at.y - s.last.y) * t, z: s.last.z + (at.z - s.last.z) * t }, look.color, look.size);
    }
    if (look === SHOT_LOOK.fire || look === SHOT_LOOK.big_fire) particle(s.dimension, "minecraft:basic_flame_particle", at);
    s.last = { ...at };
    const player = world.getEntity(s.playerId);
    // what did it hit?
    let direct = nearby(s.dimension, at, 1.6).find((e) => isFoe(e) && dist(center(e), at) <= 1.3);
    if (!direct && player?.isValid) {
      const robot = world.getEntity(s.robotId);
      if (robot?.isValid) direct = battleTargets(player, robot, at, 1.2)[0];
    }
    const wall = solidAt(s.dimension, at);
    if (direct || wall || !going) {
      if (direct || wall || ROBOTS[s.shot.robot].attack.blast) explodeShot(s, at, direct, player);
      continue;
    }
    still.push(s);
  }
  shots = still;
}

// ------------------------------------------------------------ the main loop

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const robot = robotUnder(player);
    const before = ridingNow.get(player.id);
    if (robot && before !== robot.id) {
      ridingNow.set(player.id, robot.id);
      boarded(player, robot);
    } else if (!robot && before) {
      ridingNow.delete(player.id);
      leftRobot(player);
    }
    if (!robot) continue;
    const index = robotIndex(robot.typeId);
    const spec = ROBOTS[index];
    if (tick % 20 === 0) {
      addEffect(player, "resistance", 40, 2);
      if (spec.move === "fly") addEffect(player, "fire_resistance", 40);
      if (spec.move === "swim") addEffect(player, "water_breathing", 40);
    }
    if (tick % 5 === 0) actionBar(player, hud(index, stateOf(robot), pilotState(player), tick));
    if (pilotPlayerOf(robot)?.id !== player.id) continue;
    if (spec.move === "fly" || spec.move === "swim") drive(robot, index, player, tick);
    if (spec.shield) spikeShield(player, robot, index, tick);
    if (spec.sense) monsterSense(player, robot, index, tick);
    else {
      if (spec.climb) climb(robot, player);
      if (spec.bounce) bounce(robot, player, index);
    }
  }
  for (const m of movers.values()) if (m.drivenTick !== tick) settle(m, tick);
  if (shots.length) stepShots();
  if (dashes.size) stepDashes(tick);
  if (lasers.size) stepLasers(tick);

  // once a second: repairs and armor refills
  if (tick % 20 === 0) {
    for (const [id, state] of robotStates) {
      const robot = world.getEntity(id);
      if (!robot?.isValid) {
        robotStates.delete(id);
        continue;
      }
      if (robotSecond(state, robotIndex(robot.typeId), tick) === "repaired") {
        try {
          robot.triggerEvent("bender:repair");
        } catch {
          // Gone.
        }
        sound(robot, "random.anvil_use", 0.8, 1.4);
        for (let i = 0; i < 6; i++) particle(robot.dimension, "minecraft:villager_happy", { x: robot.location.x + (Math.random() - 0.5) * 2, y: robot.location.y + 1 + Math.random() * 2, z: robot.location.z + (Math.random() - 0.5) * 2 });
      }
    }
  }
}, 1);

// Every 2 seconds: notice parked flying robots left in the air, and robots that were
// knocked out before the world was saved.
system.runInterval(() => {
  const seen = new Set();
  for (const player of world.getAllPlayers()) {
    let found = [];
    try {
      found = player.dimension.getEntities({ location: player.location, maxDistance: 96, families: ["bender_robo"] });
    } catch {
      found = [];
    }
    for (const robot of found) {
      if (seen.has(robot.id)) continue;
      seen.add(robot.id);
      const index = robotIndex(robot.typeId);
      if (index < 0) continue;
      stateOf(robot);
      if (ROBOTS[index].move !== "walk" && !movers.has(robot.id) && !robot.isOnGround && !ridersOf(robot).length) {
        movers.set(robot.id, { robot, index, vel: { x: 0, y: 0, z: 0 }, drivenTick: system.currentTick });
      }
    }
  }
}, 40);

// ------------------------------------------------------------ hitting things

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const player = damagingEntity;
  const myRobot = robotUnder(player);

  if (ROBOT_IDS.has(hitEntity.typeId)) {
    if (myRobot?.id === hitEntity.id) return;
    if (myRobot) {
      // Punching another robot from your robot: only counts in Battle Mode.
      const pilot = pilotPlayerOf(hitEntity);
      if (pilot && canBattle(sideOf(player, myRobot), sideOf(pilot, hitEntity))) {
        system.run(() => hitRobot(player, myRobot, hitEntity, PUNCH_BATTLE));
      } else if (pilot) {
        actionBar(player, "§7To battle, you and the other pilot both switch on §cBattle Mode§7 with the Robo Remote.");
      }
      return;
    }
    if (ridersOf(hitEntity).length) {
      actionBar(player, "§7Someone is riding that robot!");
      return;
    }
    // Packing up: hit an empty robot three times.
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

  // A robo punch: extra damage when a pilot hits a monster.
  if (!myRobot || !isFoe(hitEntity)) return;
  const target = hitEntity;
  system.run(() => {
    if (!target.isValid) return;
    push(target, player.location, 1.8, 0.5);
    particle(target.dimension, "minecraft:critical_hit_emitter", center(target));
    sound(target, "mob.irongolem.throw", 1, 0.9);
  });
  system.runTimeout(() => {
    if (target.isValid && player.isValid) hurt(target, PUNCH_DAMAGE, player);
  }, 10);
});

function packUp(player, robot) {
  if (!robot.isValid || ridersOf(robot).length) return;
  const index = robotIndex(robot.typeId);
  const location = robot.location;
  const dimension = robot.dimension;
  const kit = new ItemStack(ROBOTS[index].kit, 1);
  kit.setLore(kitLore(index));
  robot.remove();
  robotStates.delete(robot.id);
  movers.delete(robot.id);
  const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(kit) : kit;
  if (leftover) dimension.spawnItem(leftover, location);
  sound(player, "random.pop", 1, 1);
  actionBar(player, `§aPacked up the ${ROBOTS[index].name}!`);
}

// ------------------------------------------------------------ kits and the remote

function placeRobot(player, item, block, face) {
  const index = kitIndex(item.typeId);
  if (index < 0) return;
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 10) return;
  lastPlaced.set(player.id, now);
  const r = ROBOTS[index];
  let robot;
  try {
    robot = player.dimension.spawnEntity(r.id, aboveFace(block, face));
  } catch {
    actionBar(player, "There's no room for that here.");
    return;
  }
  try {
    robot.setRotation({ x: 0, y: player.getRotation().y });
    robot.triggerEvent("bender:repair");
  } catch {
    // It's there either way.
  }
  sound(robot, "random.anvil_use", 0.5, 1.4);
  for (let i = 0; i < 8; i++) particle(robot.dimension, "minecraft:villager_happy", { x: robot.location.x + (Math.random() - 0.5) * 2, y: robot.location.y + Math.random() * 2.5, z: robot.location.z + (Math.random() - 0.5) * 2 });
  actionBar(player, `§a${r.name} is ready!§r Tap it to ride.`);
  useUpHeld(player, item.typeId);
}

function useRemote(player) {
  const now = system.currentTick;
  if (now - (lastRemote.get(player.id) ?? -100) < 4) return;
  lastRemote.set(player.id, now);
  const robot = robotUnder(player);
  if (robot) {
    attack(player, robot, robotIndex(robot.typeId));
    return;
  }
  remoteMenu(player);
}

function remoteMenu(player) {
  const p = pilotState(player);
  const form = new ActionFormData()
    .title("§lRobo Remote")
    .body("Ride a robot and tap the remote for its special attack. Out here, you can switch Battle Mode or read how to play.")
    .button(p.battle ? "§c⚔ Battle Mode is ON§r\n§8Tap to switch it off" : "§2Battle Mode is off§r\n§8Tap to switch it on")
    .button("§lHow to play")
    .button(`§lKnockouts§r\n§8You have ${p.kos}`);
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === 0) {
      p.battle = !p.battle;
      player.setDynamicProperty(BATTLE_KEY, p.battle);
      if (p.battle) {
        title(player, "§c⚔ Battle Mode ON", "§7Your attacks can hit other robots in Battle Mode");
        player.sendMessage("§c⚔ Battle Mode ON.§r When you and another pilot both have it on, your attacks hit each other's robot armor. A robot with no armor left gets knocked out: its pilot pops out safe and it repairs itself. Players never get hurt.");
      } else {
        title(player, "§2Battle Mode off", "§7Your robot only fights monsters");
      }
    } else if (res.selection === 1) {
      howToPlay(player);
    } else if (res.selection === 2) {
      const lines = world.getAllPlayers().map((pl) => `${pl.name}: ${pilotState(pl).kos}`);
      player.sendMessage(`§e⚔ Knockouts§r  ${lines.join("  ")}`);
    }
  }).catch(() => {
    // The form couldn't open.
  });
}

function howToPlay(player) {
  const text = [
    "§lPlace§r a robot kit on the ground, then §ltap the robot§r to ride. Sneak to get off.",
    "§lWalking robots§r move like a horse. Hold jump to jump high.",
    "§lFlying robots§r (Blaze, Ghast, Wither): look where you want to go and push forward. Hold jump to climb. Look down to land.",
    "§lRobo Guardian§r zooms underwater the same way.",
    "§lSpecial attack:§r hold the Robo Remote and tap. Each robot has its own, and it needs a few seconds to recharge.",
    "§lRobo punch:§r hit monsters while riding.",
    "§lBattle Mode:§r both pilots switch it on, then attacks hit each other's robot armor. Knocked-out robots repair in 10 seconds. Players never get hurt.",
    "§lPack up§r a robot by hitting it 3 times when nobody is riding it.",
    "§lCraft more:§r 6 iron, 1 redstone and the robot's mob item (look in the recipe book).",
  ].join("\n\n");
  new ActionFormData().title("§lHow to play").body(text).button("Got it!").show(player).catch(() => {
    // The form couldn't open.
  });
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:robo_kit", {
    onUseOn: (e) => {
      const player = e.source;
      if (player?.typeId !== "minecraft:player") return;
      const item = e.itemStack;
      const block = e.block;
      const face = e.blockFace;
      system.run(() => placeRobot(player, item, block, face));
    },
    onUse: (e) => {
      const player = e.source;
      system.run(() => actionBar(player, "Tap the ground to put your robot down."));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:robo_remote", {
    onUse: (e) => {
      const player = e.source;
      system.run(() => useRemote(player));
    },
    onUseOn: (e) => {
      const player = e.source;
      if (player?.typeId !== "minecraft:player") return;
      system.run(() => useRemote(player));
    },
  });
});

// ------------------------------------------------------------ item descriptions and the welcome gift

const REMOTE_LORE = ["§7Ride a robot and tap for its special attack", "§7Not riding: Battle Mode and how to play"];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      const k = kitIndex(item.typeId);
      if (k < 0 && item.typeId !== REMOTE_ID) continue;
      if (item.getLore().length) continue;
      item.setLore(k >= 0 ? kitLore(k) : REMOTE_LORE);
      container.setItem(i, item);
    }
  }
}, 40);

function giveStarter(player, index) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  player.setDynamicProperty(WELCOME_KEY, true);
  const remote = new ItemStack(REMOTE_ID, 1);
  remote.setLore(REMOTE_LORE);
  giveOrDrop(player, remote);
  const kit = new ItemStack(ROBOTS[index].kit, 1);
  kit.setLore(kitLore(index));
  giveOrDrop(player, kit);
  const r = ROBOTS[index];
  title(player, `${r.color}§l${r.name}!`, "§7Tap the ground with it, then tap the robot to ride");
  player.sendMessage(`${r.color}${r.name}§r is yours! Put it down, tap it to ride, and hold the §bRobo Remote§r to use §e${r.attack.name}§r. Tap the remote when you're not riding for §cBattle Mode§r and how to play. Craft the other 11 robots!`);
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lPick your first robot!").body("Every robot has its own special attack. You can craft the others later.");
  for (const r of ROBOTS) form.button(`${r.color}§l${r.name}§r\n§8${r.attack.name}`, `textures/items/robo_mobs/${r.key}_kit`);
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
  system.runTimeout(() => starterForm(player, 0), 80);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  ridingNow.delete(playerId);
  pilots.delete(playerId);
});
