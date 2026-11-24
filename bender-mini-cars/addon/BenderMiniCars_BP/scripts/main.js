// Bender Mini Cars: 8 kinds of little cars in 16 colors, each with its own special move,
// and a Race Track Kit that builds a raceway with countdown lights, laps and trophies.
//
// Driving is done by Minecraft itself (like riding a horse). This script adds the
// color picker, the specials, races, trophies, records and the track builder.

import {
  system,
  world,
  BlockPermutation,
  BlockVolume,
  GameMode,
  ItemStack,
  MolangVariableMap,
  StructureSaveMode,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  CARS,
  CAR_IDS,
  JINGLE,
  LAPS,
  PAINTS,
  SPECIALS,
  carId,
  carOf,
  countdown,
  formatTime,
  gridSlots,
  isRecord,
  kitId,
  newRace,
  ordinal,
  raceOver,
  reachCheckpoint,
  standings,
  trophyFor,
} from "./minicars.js";
import { CHECKPOINTS, CONTROL_ID, LIGHT_ID, SIZE_X, SIZE_Z, checkpointAt, planTrack } from "./track.js";

const PACK_VERSION = "1.0.0";
const KEY = "bender:car_key";
const TRACK_KIT = "bender:race_track_kit";
const WELCOME_KEY = "bender:minicars_welcomed";
const LAST_KEY = "bender:last_raceway";
const TRACKS_KEY = "bender:raceways";
const RECORDS_KEY = "bender:race_records";
const CLEAR = 12;
const FOUNDATION = 6;
const CONFIRM_TICKS = 20 * 20;
const LOBBY = 20 * 10; // after Start: 10 seconds to get in your cars
const TROPHY = { gold: "bender:trophy_gold", silver: "bender:trophy_silver", bronze: "bender:trophy_bronze" };

const drivingNow = new Map(); // player id -> car id
const lastTap = new Map(); // player id -> tick
const lastPlaced = new Map();
const ready = new Map(); // car id -> { special: tick it can be used again }
const sirens = new Map(); // car id -> beat (police siren sound on)
const turbo = new Map(); // car id -> tick the turbo ends
const packHits = new Map(); // car id -> { count, tick }

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
    player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 0, stayDuration: 30, fadeOutDuration: 10 });
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
  particle(dimension, "bender:minicar_dot", location, vars);
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

function ridersOf(car) {
  try {
    return car.getComponent("minecraft:rideable")?.getRiders() ?? [];
  } catch {
    return [];
  }
}

function carUnder(player) {
  try {
    const v = player.getComponent("minecraft:riding")?.entityRidingOn;
    return v && CAR_IDS.has(v.typeId) ? v : undefined;
  } catch {
    return undefined;
  }
}

function driverOf(car) {
  return ridersOf(car).find((r) => r.typeId === "minecraft:player");
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function paintOf(car) {
  try {
    const p = car.getProperty("bender:paint");
    return typeof p === "number" ? p : 0;
  } catch {
    return 0;
  }
}

function setProp(entity, name, value) {
  try {
    if (entity.getProperty(name) !== value) entity.setProperty(name, value);
  } catch {
    // Not this kind of car.
  }
}

function dimensionOf(id) {
  try {
    return world.getDimension(id);
  } catch {
    return undefined;
  }
}

function lookFlat(yaw) {
  const y = (yaw * Math.PI) / 180;
  return { x: -Math.sin(y), z: Math.cos(y) };
}

// ------------------------------------------------------------ putting cars down and painting them

function colorForm(titleText, body) {
  const form = new ActionFormData().title(titleText).body(body);
  for (const p of PAINTS) form.button(`${p.text}§l${p.name}`);
  form.button("§d§lSurprise me!");
  return form;
}

function pickedPaint(selection) {
  return selection >= PAINTS.length ? Math.floor(Math.random() * PAINTS.length) : selection;
}

function placeCar(player, item, block, face) {
  const now = system.currentTick;
  if (now - (lastPlaced.get(player.id) ?? -100) < 20) return;
  lastPlaced.set(player.id, now);
  const car = carOf(item.typeId);
  if (!car) return;
  const at = aboveFace(block, face);
  colorForm(`§l${car.name}`, "Pick a color for your car!").show(player).then((res) => {
    if (!player.isValid) return;
    const paint = res.canceled || res.selection === undefined ? car.paint : pickedPaint(res.selection);
    let entity;
    try {
      entity = player.dimension.spawnEntity(carId(car), at);
      entity.setRotation({ x: 0, y: player.getRotation().y });
      entity.setProperty("bender:paint", paint);
    } catch {
      actionBar(player, "There's no room for a car here.");
      return;
    }
    sound(entity, "random.anvil_use", 0.5, 1.6);
    for (let i = 0; i < 10; i++) dot(entity.dimension, { x: at.x + (Math.random() - 0.5) * 1.5, y: at.y + Math.random(), z: at.z + (Math.random() - 0.5) * 1.5 }, rgb(PAINTS[paint].hex), 0.2);
    actionBar(player, `${PAINTS[paint].text}${PAINTS[paint].name} ${car.name}§r is ready! Tap it to drive.`);
    useUpHeld(player, item.typeId);
  }).catch(() => {
    // The form couldn't open.
  });
}

function paintCar(player, car) {
  const spec = carOf(car.typeId);
  colorForm(`§lPaint the ${spec?.name ?? "car"}`, "Pick a new color!").show(player).then((res) => {
    if (res.canceled || res.selection === undefined || !car.isValid) return;
    const paint = pickedPaint(res.selection);
    setProp(car, "bender:paint", paint);
    for (let i = 0; i < 14; i++) dot(car.dimension, { x: car.location.x + (Math.random() - 0.5) * 1.5, y: car.location.y + Math.random() * 1.2, z: car.location.z + (Math.random() - 0.5) * 1.5 }, rgb(PAINTS[paint].hex), 0.2);
    sound(car, "random.levelup", 0.5, 1.6);
    actionBar(player, `§aFresh paint!§r ${PAINTS[paint].text}${PAINTS[paint].name}`);
  }).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ getting in and the specials

function boarded(player, car) {
  const spec = carOf(car.typeId);
  if (!spec) return;
  const special = SPECIALS[spec.special];
  title(player, `§e§l${spec.name}`, `§7Tap the Car Key: ${special.name}`);
  player.sendMessage(`§e${spec.name}§r: drive like a horse, hold jump to hop. Tap the §cCar Key§r for §e${special.name}§r (${special.how}). Sneak to get out.`);
  sound(car, "random.click", 0.8, 0.8);
}

function leftCar(player, carIdNow) {
  actionBar(player, "");
  const car = world.getEntity(carIdNow);
  if (!car?.isValid || driverOf(car)) return;
  sirens.delete(car.id);
  setProp(car, "bender:siren", false);
}

function special(player, car) {
  const spec = carOf(car.typeId);
  if (!spec) return;
  const sp = SPECIALS[spec.special];
  const now = system.currentTick;
  const r = ready.get(car.id) ?? 0;
  if (now < r) {
    actionBar(player, `§7${sp.name} is recharging... ${Math.ceil((r - now) / 20)}s`);
    return;
  }
  ready.set(car.id, now + sp.cooldown);
  const at = car.location;
  if (spec.special === "turbo") {
    addEffect(car, "speed", sp.ticks, 2);
    turbo.set(car.id, now + sp.ticks);
    soundAt(car.dimension, at, "firework.launch", 1, 0.8);
    actionBar(player, "§6TURBO!");
  } else if (spec.special === "mega_jump") {
    try {
      car.applyKnockback({ x: 0, z: 0 }, sp.up);
    } catch {
      return;
    }
    addEffect(car, "slow_falling", 50);
    for (let i = 0; i < 12; i++) dot(car.dimension, { x: at.x + (Math.random() - 0.5) * 2, y: at.y + 0.2, z: at.z + (Math.random() - 0.5) * 2 }, { red: 0.6, green: 0.45, blue: 0.3 }, 0.25);
    soundAt(car.dimension, at, "mob.slime.big", 1, 0.7);
    actionBar(player, "§aMEGA JUMP!");
  } else if (spec.special === "horn") {
    soundAt(car.dimension, at, "note.trumpet", 1, 0.85);
    system.runTimeout(() => soundAt(car.dimension, car.isValid ? car.location : at, "note.trumpet", 1, 0.85), 5);
    actionBar(player, "§eBeep beep!");
  } else if (spec.special === "siren") {
    const on = !sirens.has(car.id);
    if (on) sirens.set(car.id, 0);
    else sirens.delete(car.id);
    setProp(car, "bender:siren", on);
    actionBar(player, on ? "§c● §9● §rSiren ON!" : "Siren off.");
  } else if (spec.special === "water") {
    sprayWater(player, car, sp);
  } else if (spec.special === "jingle") {
    iceCream(player, car, sp);
  }
}

/** The fire truck: a spray of water ahead that puts out fires and pushes mobs back a bit. */
function sprayWater(player, car, sp) {
  const dir = lookFlat(player.getRotation().y);
  const from = { x: car.location.x + dir.x, y: car.location.y + 1, z: car.location.z + dir.z };
  let fires = 0;
  for (let d = 1; d <= sp.range; d++) {
    for (const side of [-1, 0, 1]) {
      const p = { x: from.x + dir.x * d - dir.z * side * 0.8, y: from.y - d * 0.08, z: from.z + dir.z * d + dir.x * side * 0.8 };
      dot(car.dimension, p, { red: 0.45, green: 0.7, blue: 1 }, 0.2);
      for (const dy of [-1, 0]) {
        try {
          const b = car.dimension.getBlock({ x: p.x, y: p.y + dy, z: p.z });
          if (b && (b.typeId === "minecraft:fire" || b.typeId === "minecraft:soul_fire")) {
            b.setPermutation(BlockPermutation.resolve("minecraft:air"));
            fires++;
          }
        } catch {
          // Unloaded.
        }
      }
    }
  }
  let entities = [];
  try {
    entities = car.dimension.getEntities({ location: { x: from.x + dir.x * 3, y: from.y, z: from.z + dir.z * 3 }, maxDistance: 4 });
  } catch {
    entities = [];
  }
  for (const e of entities) {
    if (e.id === car.id || e.typeId === "minecraft:player" || CAR_IDS.has(e.typeId)) continue;
    try {
      e.extinguishFire(true);
      e.applyKnockback({ x: dir.x * 0.6, z: dir.z * 0.6 }, 0.15);
    } catch {
      // Some things can't be pushed.
    }
  }
  soundAt(car.dimension, from, "bucket.empty_water", 1, 1.2);
  soundAt(car.dimension, from, "note.bit", 0.6, 1.4);
  actionBar(player, fires ? `§bSplash!§r Put out ${fires} fire${fires === 1 ? "" : "s"}.` : "§bSplash!");
}

/** The ice-cream truck: a tune, and a treat for everyone close by. */
function iceCream(player, car, sp) {
  for (const [pitch, at] of JINGLE) {
    system.runTimeout(() => {
      if (car.isValid) soundAt(car.dimension, car.location, "note.bell", 1, pitch);
    }, at);
  }
  let friends = [];
  try {
    friends = car.dimension.getPlayers({ location: car.location, maxDistance: sp.range });
  } catch {
    friends = [player];
  }
  system.runTimeout(() => {
    for (const p of friends) {
      if (!p.isValid) continue;
      giveOrDrop(p, new ItemStack("minecraft:cookie", 1));
      actionBar(p, "§dIce-cream time!§r Here's a treat.");
    }
  }, 40);
}

/** Police sirens wee-woo; turbo flames out the back. */
function carEffects(car, tick) {
  const beat = sirens.get(car.id);
  if (beat !== undefined && tick % 8 === 0) {
    sirens.set(car.id, beat + 1);
    soundAt(car.dimension, car.location, "note.bit", 0.6, beat % 2 ? 1.5 : 1.1);
  }
  const t = turbo.get(car.id);
  if (t !== undefined) {
    if (tick > t) turbo.delete(car.id);
    else if (tick % 2 === 0) {
      const back = lookFlat(car.getRotation().y);
      dot(car.dimension, { x: car.location.x - back.x * 1.1, y: car.location.y + 0.35, z: car.location.z - back.z * 1.1 }, tick % 4 ? { red: 1, green: 0.55, blue: 0.1 } : { red: 1, green: 0.85, blue: 0.3 }, 0.22);
    }
  }
}

// ------------------------------------------------------------ race tracks

/** @type {{ id: string, tag: string, dim: string, x0: number, z0: number, floorY: number, owner: string }[]} */
let tracks = [];
let tracksLoaded = false;

function loadTracks() {
  if (tracksLoaded) return;
  tracksLoaded = true;
  try {
    const raw = world.getDynamicProperty(TRACKS_KEY);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(list)) tracks = list;
  } catch {
    tracks = [];
  }
}

function saveTracks() {
  try {
    world.setDynamicProperty(TRACKS_KEY, JSON.stringify(tracks));
  } catch {
    // Try again next time.
  }
}

function toWorld(t, p) {
  return { x: t.x0 + p.x, y: t.floorY + p.y, z: t.z0 + p.z };
}

function toLocal(t, p) {
  return { x: p.x - t.x0, y: p.y - t.floorY, z: p.z - t.z0 };
}

function onTrack(t, pos, margin = 2) {
  const l = toLocal(t, pos);
  return l.x >= -margin && l.x < SIZE_X + margin && l.z >= -margin && l.z < SIZE_Z + margin && l.y > -4 && l.y < 16;
}

function trackNear(dimId, pos, range = 0) {
  loadTracks();
  const mine = tracks.filter((t) => t.dim === dimId);
  return mine.find((t) => onTrack(t, pos, range));
}

function records() {
  try {
    const raw = world.getDynamicProperty(RECORDS_KEY);
    const r = typeof raw === "string" ? JSON.parse(raw) : {};
    return r && typeof r === "object" ? r : {};
  } catch {
    return {};
  }
}

function saveRecord(trackId, rec) {
  const all = records();
  all[trackId] = rec;
  try {
    world.setDynamicProperty(RECORDS_KEY, JSON.stringify(all));
  } catch {
    // Not saved this time.
  }
}

// ------------------------------------------------------------ races

/** @type {Map<string, { track: any, phase: string, lobbyUntil: number, starterId: string, race?: any, grid?: Map<string, { x: number, y: number, z: number }>, lights: number }>} */
const races = new Map();

function setLights(t, red, green) {
  const dimension = dimensionOf(t.dim);
  if (!dimension) return;
  planTrack().lights.forEach((l, i) => {
    const state = green ? 2 : i < red ? 1 : 0;
    try {
      const b = dimension.getBlock(toWorld(t, l));
      /** @type {any} */
      const perm = b?.permutation;
      if (b?.typeId === LIGHT_ID) b.setPermutation(perm.withState("bender:light", state));
    } catch {
      // Unloaded.
    }
  });
}

function playerById(id) {
  return world.getAllPlayers().find((p) => p.id === id);
}

function startRace(t, starter) {
  if (races.has(t.id)) {
    actionBar(starter, "§eA race is already starting or going on this track!");
    return;
  }
  races.set(t.id, { track: t, phase: "lobby", lobbyUntil: system.currentTick + LOBBY, starterId: starter.id, lights: -1 });
  sound(starter, "note.pling", 1, 1.2);
  starter.sendMessage(`§e🏁 Race!§r Everyone get in a car on the track: the race starts in ${LOBBY / 20} seconds. ${LAPS} laps.`);
}

function playersOnTrack(t) {
  return world.getAllPlayers().filter((p) => p.dimension.id === t.dim && onTrack(t, p.location, 8));
}

/** The lobby is over: everyone driving a car on the track races. */
function lineUp(r, tick) {
  const t = r.track;
  const racers = world.getAllPlayers().filter((p) => {
    const car = carUnder(p);
    return p.dimension.id === t.dim && !!car && onTrack(t, p.location, 4) && driverOf(car)?.id === p.id;
  });
  if (!racers.length) {
    races.delete(t.id);
    for (const p of playersOnTrack(t)) p.sendMessage("§7Nobody was driving a car on the track, so the race didn't start. Get in a car, then try again!");
    return;
  }
  const plan = planTrack();
  const slots = gridSlots(racers.length, plan.grid);
  r.grid = new Map();
  racers.forEach((p, i) => r.grid?.set(p.id, toWorld(t, slots[i])));
  r.race = newRace(racers.map((p) => ({ id: p.id, name: p.name })), CHECKPOINTS.length, tick);
  r.phase = "race";
  r.lights = -1;
  for (const p of racers) {
    p.sendMessage(`§e🏁 ${racers.length > 1 ? `Racers: ${racers.map((x) => x.name).join(", ")}` : "Race the clock: be quick for gold!"}§r ${LAPS} laps around ${t.owner}'s Raceway.`);
  }
}

function holdOnGrid(r) {
  for (const [id, spot] of r.grid ?? []) {
    const p = playerById(id);
    const car = p ? carUnder(p) : undefined;
    if (!car) continue;
    try {
      car.teleport(spot, { rotation: { x: 0, y: planTrack().yaw } });
    } catch {
      // Unloaded.
    }
  }
}

function stepRaces(tick) {
  for (const [key, r] of [...races]) {
    if (r.phase === "lobby") {
      if (tick >= r.lobbyUntil) {
        lineUp(r, tick);
        continue;
      }
      const left = Math.ceil((r.lobbyUntil - tick) / 20);
      if (left !== r.lights) {
        r.lights = left;
        for (const p of playersOnTrack(r.track)) title(p, `§e🏁 Race in ${left}`, carUnder(p) ? "§7Drive to the start line" : "§7Get in a car on the track!");
      }
      continue;
    }
    const { race, track } = r;
    if (!race) continue;
    const racers = Object.values(race.racers).map((x) => playerById(x.id)).filter((p) => !!p);
    const n = countdown(race, tick);
    if (n > 0) {
      holdOnGrid(r);
      if (r.lights !== n) {
        r.lights = n;
        setLights(track, 4 - n, false);
        for (const p of racers) {
          title(p, `§c${n}`, "§7Get ready...");
          sound(p, "note.pling", 1, 0.8);
        }
      }
      continue;
    }
    if (r.lights !== 0) {
      r.lights = 0;
      setLights(track, 0, true);
      for (const p of racers) {
        title(p, "§a§lGO!", `§7${LAPS} laps`);
        sound(p, "note.pling", 1, 2);
      }
      system.runTimeout(() => setLights(track, 0, false), 60);
    }
    for (const p of racers) {
      const car = carUnder(p);
      const pos = car ? car.location : p.location;
      const cp = checkpointAt(toLocal(track, pos));
      if (cp >= 0) {
        const ev = reachCheckpoint(race, p.id, cp, tick);
        if (ev?.what === "lap") {
          title(p, `§eLap ${ev.lap}/${LAPS}`, `§7Lap time ${formatTime(ev.lapTime)}`);
          sound(p, "random.orb", 1, 1.2);
        } else if (ev?.what === "finish") {
          finished(r, p, ev);
        }
      }
      const me = race.racers[p.id];
      if (tick % 10 === 0 && me && !me.done) {
        const place = standings(race).findIndex((x) => x.id === p.id) + 1;
        const many = Object.keys(race.racers).length > 1;
        actionBar(p, `§eLap ${Math.min(me.lap + 1, LAPS)}/${LAPS}§r  ${many ? `§b${ordinal(place)}§r  ` : ""}§f${formatTime(tick - race.goTick)}`);
      }
    }
    if (raceOver(race, tick)) {
      races.delete(key);
      setLights(track, 0, false);
      const lines = standings(race).map((x) => `${x.done ? `§e${ordinal(x.place)}` : "§7-"}§r ${x.name}${x.done ? ` ${formatTime(x.time)}` : " (didn't finish)"}`);
      for (const p of racers) p.sendMessage(`§e🏁 Results:§r ${lines.join("  ")}`);
    }
  }
}

function finished(r, player, ev) {
  const { race, track } = r;
  const trophy = trophyFor(race, player.id);
  const many = Object.keys(race.racers).length > 1;
  title(player, many ? `§6${ordinal(ev.place)}!` : `§6Finished!`, `§7${formatTime(ev.time)}`);
  sound(player, "random.levelup", 1, 1);
  for (let i = 0; i < 24; i++) {
    const c = [{ red: 1, green: 0.85, blue: 0.2 }, { red: 1, green: 1, blue: 1 }, { red: 0.2, green: 0.2, blue: 0.2 }][i % 3];
    dot(player.dimension, { x: player.location.x + (Math.random() - 0.5) * 3, y: player.location.y + 1 + Math.random() * 2, z: player.location.z + (Math.random() - 0.5) * 3 }, c, 0.25);
  }
  if (trophy) {
    const item = new ItemStack(TROPHY[trophy], 1);
    item.setLore([`§6${many ? `${ordinal(ev.place)} place` : `${trophy[0].toUpperCase()}${trophy.slice(1)} time`}!`, `§7${track.owner}'s Raceway`, `§7${formatTime(ev.time)} by ${player.name}`.slice(0, 50)]);
    giveOrDrop(player, item);
    player.sendMessage(`§6🏆 You won a ${trophy} trophy!§r Put it on a shelf. ${!many && trophy !== "gold" ? "§7(Finish faster for gold.)" : ""}`);
  }
  const rec = records()[track.id];
  if (isRecord(rec, ev.time)) {
    saveRecord(track.id, { time: ev.time, name: player.name });
    for (const p of world.getAllPlayers()) if (race.racers[p.id]) p.sendMessage(`§b⭐ New track record!§r ${player.name}: ${formatTime(ev.time)}`);
  }
}

function useControl(block, player) {
  const t = trackNear(block.dimension.id, { x: block.x, y: block.y, z: block.z });
  if (!t) {
    actionBar(player, "§7This Race Control isn't on a race track. Build one with the Race Track Kit.");
    return;
  }
  raceMenu(player, t);
}

function raceMenu(player, t) {
  const rec = records()[t.id];
  const form = new ActionFormData().title(`§l${t.owner}'s Raceway`)
    .body(`Tap Start, then get in your car: in 10 seconds, everyone driving a car on the track lines up and races. ${LAPS} laps.\n\nTrack record: ${rec ? `§e${formatTime(rec.time)}§r by ${rec.name}` : "§7none yet"}`)
    .button("§2§lStart a race!")
    .button("How to race");
  form.show(player).then((res) => {
    if (res.canceled || !player.isValid) return;
    if (res.selection === 0) startRace(t, player);
    else howToPlay(player);
  }).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ the Car Key

function useKey(player) {
  const now = system.currentTick;
  if (now - (lastTap.get(player.id) ?? -100) < 4) return;
  lastTap.set(player.id, now);
  const car = carUnder(player);
  if (car && driverOf(car)?.id === player.id) {
    special(player, car);
    return;
  }
  const t = trackNear(player.dimension.id, player.location, 16);
  let close = [];
  try {
    close = player.dimension.getEntities({ location: player.location, maxDistance: 5, families: ["bender_minicar"] });
  } catch {
    close = [];
  }
  const form = new ActionFormData().title("§lCar Key").body("Driving a car? Tap the key for its special move. Out here you can:")
    .button(close.length ? "§lPaint the car next to you" : "§7Paint a car§r\n§8Stand next to one first")
    .button(t ? "§2§lStart a race§r\n§8On this track" : "§7Start a race§r\n§8Build a track first")
    .button("How to play");
  form.show(player).then((res) => {
    if (res.canceled || !player.isValid) return;
    if (res.selection === 0 && close.length) {
      const nearest = close.sort((a, b) => Math.hypot(a.location.x - player.location.x, a.location.z - player.location.z) - Math.hypot(b.location.x - player.location.x, b.location.z - player.location.z))[0];
      paintCar(player, nearest);
    } else if (res.selection === 1 && t) raceMenu(player, t);
    else if (res.selection === 2) howToPlay(player);
  }).catch(() => {
    // The form couldn't open.
  });
}

function howToPlay(player) {
  const text = [
    "§lCars:§r tap the ground with a car kit and pick a color. Tap the car to get in, then drive like a horse: hold jump to hop. Sneak to get out.",
    `§lSpecials:§r tap the §cCar Key§r while driving. ${CARS.map((c) => `${c.name}: ${SPECIALS[c.special].name}`).join(", ")}.`,
    "§lPaint:§r stand next to a car and tap the Car Key.",
    `§lRaces:§r build a track with the §eRace Track Kit§r (tap twice). Tap §lRace Control§r (or the Car Key when you're not driving) and choose Start. You have 10 seconds to get in your cars, then everyone driving on the track lines up. Wait for the lights: red, red, red... GREEN! ${LAPS} laps; you have to go all the way round each time.`,
    "§lTrophies:§r 1st gets gold, 2nd silver, 3rd bronze. Racing alone, your time picks the trophy. Put trophies on a shelf!",
    "§lPack up§r a car by hitting it 3 times when nobody is in it.",
  ].join("\n\n");
  new ActionFormData().title("§lHow to play").body(text).button("Got it!").show(player).catch(() => {
    // The form couldn't open.
  });
}

// ------------------------------------------------------------ the main loop and packing up

system.runInterval(() => {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const car = carUnder(player);
    const before = drivingNow.get(player.id);
    if (car && before !== car.id) {
      if (before) leftCar(player, before);
      drivingNow.set(player.id, car.id);
      boarded(player, car);
    } else if (!car && before) {
      drivingNow.delete(player.id);
      leftCar(player, before);
    }
    if (!car) continue;
    if (car.typeId === "bender:mini_fire_truck" && driverOf(car)?.id === player.id) setProp(car, "bender:siren", true);
    carEffects(car, tick);
  }
  if (races.size && tick % 2 === 0) stepRaces(tick);
}, 1);

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid || !CAR_IDS.has(hitEntity.typeId)) return;
  const player = damagingEntity;
  if (ridersOf(hitEntity).length) {
    actionBar(player, "§7Someone is in that car!");
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
  const car = hitEntity;
  system.run(() => {
    if (!car.isValid || ridersOf(car).length) return;
    const spec = carOf(car.typeId);
    if (!spec) return;
    const kit = new ItemStack(kitId(spec), 1);
    kit.setLore(loreFor(kit.typeId) ?? []);
    const location = car.location;
    const dimension = car.dimension;
    car.remove();
    sirens.delete(car.id);
    const leftover = player.isValid ? player.getComponent("minecraft:inventory")?.container?.addItem(kit) : kit;
    if (leftover) dimension.spawnItem(leftover, location);
    sound(player, "random.pop", 1, 1);
    actionBar(player, `§aPacked up the ${spec.name}!`);
  });
});

// ------------------------------------------------------------ the track builder

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
  if (dimension.id !== "minecraft:overworld") return { error: "Race tracks can only be built in the Overworld." };
  const cx = Math.floor(player.location.x);
  const cz = Math.floor(player.location.z);
  const x0 = cx - Math.floor(SIZE_X / 2);
  const z0 = cz - Math.floor(SIZE_Z / 2);
  const heights = [];
  let samples = 0;
  let water = 0;
  let highestWater = -Infinity;
  for (let dx = 0; dx < SIZE_X; dx += 5) {
    for (let dz = 0; dz < SIZE_Z; dz += 5) {
      let ground;
      try {
        ground = dimension.getTopmostBlock({ x: x0 + dx, z: z0 + dz });
        for (let i = 0; i < 40 && ground && COVER.test(ground.typeId); i++) ground = ground.below();
      } catch {
        ground = undefined;
      }
      if (!ground) return { error: "Stand in the middle of where you want the track, then try again." };
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
    return p.dimension.id === site.dimension.id && x >= site.x0 - 1 && x <= site.x0 + SIZE_X + 1 && z >= site.z0 - 1 && z <= site.z0 + SIZE_Z + 1;
  });
}

function showOutline(player, site) {
  let bursts = 0;
  const run = system.runInterval(() => {
    if (++bursts > CONFIRM_TICKS / 10 || pendingBuild.get(player.id) !== site) {
      system.clearRun(run);
      return;
    }
    for (let a = 0; a < SIZE_X; a++) {
      for (const z of [0, SIZE_Z - 1]) particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + a + 0.5, y: site.floorY + 1.3, z: site.z0 + z + 0.5 });
    }
    for (let a = 0; a < SIZE_Z; a++) {
      for (const x of [0, SIZE_X - 1]) particle(site.dimension, "minecraft:villager_happy", { x: site.x0 + x + 0.5, y: site.floorY + 1.3, z: site.z0 + a + 0.5 });
    }
  }, 10);
}

function* buildJob(player, site, plan, record) {
  try {
    yield* buildSteps(site, plan);
    finishTrack(player, site, plan, record);
  } finally {
    building = false;
  }
}

function* buildSteps(site, plan) {
  const { dimension, x0, z0, floorY: F } = site;
  const at = (x, y, z) => ({ x: x0 + x, y: F + y, z: z0 + z });
  for (let tx = 0; tx < SIZE_X; tx += 16) {
    for (let tz = 0; tz < SIZE_Z; tz += 16) {
      const x2 = Math.min(tx + 15, SIZE_X - 1);
      const z2 = Math.min(tz + 15, SIZE_Z - 1);
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
      p.teleport({ x: x0 + v.x + 0.5, y: F + v.y, z: z0 + v.z + 0.5 }, { rotation: { x: 10, y: 180 } });
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
    if (i % 64 === 63) yield;
  }
}

function finishTrack(player, site, plan, record) {
  const { dimension } = site;
  const t = { x0: site.x0, z0: site.z0, floorY: site.floorY };
  // two cars waiting on the grid
  [["go_kart", 0], ["race_car", 7]].forEach(([key, paint], i) => {
    try {
      const car = dimension.spawnEntity(`bender:mini_${key}`, toWorld(t, plan.spawns.cars[i]));
      car.setRotation({ x: 0, y: plan.yaw });
      car.setProperty("bender:paint", paint);
      car.addTag(record.tag);
    } catch {
      // The track still works without them.
    }
  });
  system.runTimeout(() => {
    try {
      dimension.getBlock(toWorld(t, plan.sign))?.getComponent("minecraft:sign")?.setText(`${record.owner}'s\nRaceway\n\n${LAPS} laps!\nTap Race Control`);
    } catch {
      // A blank sign is fine.
    }
  }, 10);
  loadTracks();
  tracks = tracks.filter((x) => x.dim !== record.dim || Math.abs(x.x0 - t.x0) >= SIZE_X || Math.abs(x.z0 - t.z0) >= SIZE_Z);
  tracks.push({ id: record.id, tag: record.tag, dim: record.dim, x0: t.x0, z0: t.z0, floorY: t.floorY, owner: record.owner });
  if (tracks.length > 40) tracks.shift();
  saveTracks();
  if (player.isValid) {
    title(player, "§e🏁 Raceway", "Your race track is ready!");
    sound(player, "random.levelup", 1, 1);
    player.sendMessage("§aYour Raceway is ready!§r Get in a car on the track and tap §lRace Control§r (or the Car Key) to start a race. §7(Sneak and tap the Race Track Kit twice to undo it.)");
  }
}

function startBuild(player, site) {
  const plan = planTrack();
  const seed = ((site.cx * 73856093) ^ (site.cz * 19349663) ^ system.currentTick) >>> 0;
  const record = {
    id: `benderraceway:r${seed.toString(36)}`,
    tag: `bender_raceway_${seed.toString(36)}`,
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
      { x: site.x0 + SIZE_X - 1, y: site.floorY + CLEAR, z: site.z0 + SIZE_Z - 1 },
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
  actionBar(player, "§eBuilding your Raceway...");
  system.runJob(buildJob(player, site, plan, record));
}

function undo(player) {
  const raw = player.getDynamicProperty(LAST_KEY);
  if (typeof raw !== "string") {
    actionBar(player, "You haven't built a race track to undo.");
    return;
  }
  const record = JSON.parse(raw);
  const dimension = dimensionOf(record.dim);
  const cx = record.x + SIZE_X / 2;
  const cz = record.z + SIZE_Z / 2;
  if (!dimension || player.dimension.id !== record.dim || Math.hypot(player.location.x - cx, player.location.z - cz) > 60) {
    actionBar(player, "Go back to your race track to undo it.");
    return;
  }
  try {
    world.structureManager.place(record.id, dimension, { x: record.x, y: record.y, z: record.z });
  } catch {
    actionBar(player, "Couldn't undo the track. Stand in the middle of it and try again.");
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
  loadTracks();
  tracks = tracks.filter((x) => x.tag !== record.tag);
  saveTracks();
  races.delete(record.id);
  player.setDynamicProperty(LAST_KEY, undefined);
  sound(player, "random.pop", 1, 1);
  actionBar(player, "§aThe track is gone and the land is back the way it was.");
}

function useTrackKit(player) {
  const now = system.currentTick;
  if (player.isSneaking) {
    pendingBuild.delete(player.id);
    const offer = pendingUndo.get(player.id);
    if (offer !== undefined && now <= offer && now - (offer - CONFIRM_TICKS) > 10) {
      pendingUndo.delete(player.id);
      undo(player);
    } else if (typeof player.getDynamicProperty(LAST_KEY) === "string") {
      pendingUndo.set(player.id, now + CONFIRM_TICKS);
      actionBar(player, "§cUndo your last race track?§r Sneak and tap again to say yes.");
    } else {
      actionBar(player, "You haven't built a race track to undo.");
    }
    return;
  }
  if (building) {
    actionBar(player, "Hold on, a track is still being built!");
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
  player.sendMessage("§eYour race track will fill the sparkly rectangle.§r Everything inside gets replaced.");
  actionBar(player, "§aTap Build Track! again to build here.");
}

// ------------------------------------------------------------ registering items and blocks

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, blockComponentRegistry }) => {
  itemComponentRegistry.registerCustomComponent("bender:minicar_kit", {
    onUseOn(event) {
      const player = event.source;
      if (player?.typeId !== "minecraft:player") return;
      const { itemStack, block, blockFace } = event;
      system.run(() => placeCar(player, itemStack, block, blockFace));
    },
    onUse(event) {
      const player = event.source;
      system.run(() => actionBar(player, "Tap the ground to put your car down."));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:car_key", {
    onUse(event) {
      const player = event.source;
      system.run(() => useKey(player));
    },
    onUseOn(event) {
      const player = event.source;
      if (player?.typeId !== "minecraft:player") return;
      system.run(() => useKey(player));
    },
  });
  itemComponentRegistry.registerCustomComponent("bender:race_track_kit", {
    onUse(event) {
      const player = event.source;
      system.run(() => useTrackKit(player));
    },
  });
  blockComponentRegistry.registerCustomComponent("bender:race_control", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!player) return;
      system.run(() => useControl(block, player));
    },
  });
});

// ------------------------------------------------------------ descriptions and the welcome gift

const LORE = {
  [KEY]: ["§eDriving: your car's special move", "§7Not driving: paint, race, how to play"],
  [TRACK_KIT]: ["§eTap on open land to build a race track", "§7Sneak + tap twice to undo it"],
  [CONTROL_ID]: ["§7Tap it to start a race"],
  [LIGHT_ID]: ["§7A countdown light for races"],
  trophy: ["§7Won in a race!"],
};

function loreFor(typeId) {
  const car = carOf(typeId);
  if (car && typeId === kitId(car)) return [`§e${car.about}`, `§7Car Key: ${SPECIALS[car.special].name}`];
  if (Object.values(TROPHY).includes(typeId)) return LORE.trophy;
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
  const car = CARS[index] ?? CARS[0];
  for (const id of [kitId(car), KEY, TRACK_KIT]) {
    const item = new ItemStack(id, 1);
    item.setLore(loreFor(id) ?? []);
    giveOrDrop(player, item);
  }
  title(player, `§e${car.name}!`, "§7Tap the ground with it and pick a color");
  player.sendMessage(`§aBender Mini Cars!§r You got a §e${car.name}§r, a §cCar Key§r and a §eRace Track Kit§r. Tap the ground with the car, pick a color, and tap the car to drive. Build a track and race for trophies! Craft the other ${CARS.length - 1} cars too.`);
}

function starterForm(player, tries) {
  if (!player.isValid || player.getDynamicProperty(WELCOME_KEY)) return;
  const form = new ActionFormData().title("§lPick your first mini car!").body("You can craft the others later, in any color.");
  for (const c of CARS) form.button(`§l${c.name}§r\n§8${c.about}`, `textures/items/minicars/${c.key}_kit`);
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
    if (player.isValid) player.sendMessage(`§7Bender Mini Cars §fv${PACK_VERSION}§7 is on.`);
  }, 40);
  if (player.getDynamicProperty(WELCOME_KEY)) return;
  system.runTimeout(() => starterForm(player, 0), 80);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  drivingNow.delete(playerId);
  lastTap.delete(playerId);
  lastPlaced.delete(playerId);
});
