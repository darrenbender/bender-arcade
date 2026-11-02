// The three planes, their paint options, and how each one flies.
// No Minecraft imports here, so the flight code can be tested outside the game.
//
// Speeds are in blocks per tick (20 ticks = 1 second). Angles are in degrees.

export const COLORS = [
  "Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Sky Blue", "Blue",
  "Purple", "Pink", "White", "Silver", "Gray", "Black", "Brown", "Gold",
];

export const DECALS = [
  "None", "Racing stripes", "Flames", "Lightning", "Stars", "Checkers", "Shark teeth", "Rainbow", "Polka dots",
];

export const PLANES = {
  "bender:stunt_plane": {
    name: "Stunt Plane",
    kit: "bender:stunt_plane_kit",
    seats: 2,
    maxSpeed: 0.8,
    boostSpeed: 0.8,
    takeoffSpeed: 0.36,
    accel: 0.012,
    brake: 0.03,
    turnRate: 6,
    pitchRate: 4.5,
    maxPitch: 80,
    special: "smoke",
    paint: { body: 0, wings: 2, decal: 0 },
  },
  "bender:jet": {
    name: "Jet",
    kit: "bender:jet_kit",
    seats: 1,
    maxSpeed: 1.25,
    boostSpeed: 1.7,
    takeoffSpeed: 0.55,
    accel: 0.02,
    brake: 0.04,
    turnRate: 4.5,
    pitchRate: 3.5,
    maxPitch: 70,
    special: "boost",
    paint: { body: 11, wings: 12, decal: 6 },
  },
  "bender:private_jet": {
    name: "Private Jet",
    kit: "bender:private_jet_kit",
    seats: 4,
    maxSpeed: 1.0,
    boostSpeed: 1.0,
    takeoffSpeed: 0.5,
    accel: 0.014,
    brake: 0.035,
    turnRate: 3,
    pitchRate: 2.5,
    maxPitch: 45,
    special: "chime",
    paint: { body: 10, wings: 7, decal: 1 },
  },
};

export const KIT_TO_PLANE = Object.fromEntries(Object.entries(PLANES).map(([id, p]) => [p.kit, id]));

export function paintText(paint) {
  const decal = paint.decal > 0 ? `, ${DECALS[paint.decal].toLowerCase()}` : "";
  return `${COLORS[paint.body]} body, ${COLORS[paint.wings].toLowerCase()} wings${decal}`;
}

// ------------------------------------------------------------ flying

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Shortest signed difference between two angles, in -180..180.
export function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function newFlight(yaw) {
  return {
    speed: 0,
    yaw,
    pitch: 0, // like the player's view: positive = nose down
    roll: 0,
    smoke: false,
    boost: false,
    usedStick: false, // has the pilot's joystick ever reached us?
    lastJump: false,
    expected: 0, // how far we meant to move last tick
    stuckTicks: 0,
    bonkCooldown: 0,
  };
}

// One tick of flying.
//   input: { pilot, stickX, stickY, jump, lookYaw, lookPitch }
//   env:   { onGround, inWater, moved }  (moved = distance actually travelled last tick)
// Returns the velocity to apply and a list of events for sounds and effects.
export function flyStep(spec, s, input, env) {
  const events = [];

  // Hit something solid at speed? Stop with a bonk instead of grinding along.
  if (s.bonkCooldown > 0) s.bonkCooldown--;
  if (s.expected > 0.45 && env.moved < s.expected * 0.25) {
    if (!s.bonkCooldown) events.push("bonk");
    s.bonkCooldown = 40;
    s.speed = 0;
  }
  if (s.expected > 0.12 && env.moved < 0.02) s.stuckTicks++;
  else s.stuckTicks = 0;
  if (s.stuckTicks > 10) s.speed = 0;

  // Controls. If no joystick movement ever arrives, Jump works the throttle.
  let throttle = 0;
  let special = false;
  if (input.pilot) {
    if (Math.abs(input.stickY) > 0.2 || Math.abs(input.stickX) > 0.2) s.usedStick = true;
    if (Math.abs(input.stickY) > 0.2) throttle = input.stickY;
    if (!s.usedStick) {
      if (input.jump) throttle = 1;
    } else {
      special = input.jump;
    }
  }
  const pressed = special && !s.lastJump;
  s.lastJump = special;
  s.boost = spec.special === "boost" && special;
  if (spec.special === "smoke" && pressed) {
    s.smoke = !s.smoke;
    events.push(s.smoke ? "smoke_on" : "smoke_off");
  }
  if (spec.special === "chime" && pressed) events.push("chime");
  if (s.boost && pressed) events.push("boost");

  // Speed.
  const top = s.boost ? spec.boostSpeed : spec.maxSpeed;
  const before = s.speed;
  if (throttle > 0) s.speed += spec.accel * throttle;
  else if (throttle < 0) s.speed += spec.brake * throttle;
  else if (env.onGround) s.speed *= 0.95; // rolling to a stop
  else if (!input.pilot) s.speed *= 0.985; // nobody flying: slow glide
  if (s.boost) s.speed += spec.accel * 1.5;
  // Never pass top speed; after a boost or a dive, ease back down to it.
  if (s.speed > top) s.speed = before > top ? Math.max(top, before - spec.brake) : top;
  if (s.speed < 0.005) s.speed = 0;

  // Steering: turn toward where the pilot is looking.
  const flying = s.speed >= spec.takeoffSpeed;
  let targetYaw = input.pilot ? input.lookYaw : s.yaw;
  let targetPitch = input.pilot ? clamp(input.lookPitch, -spec.maxPitch, spec.maxPitch) : 15;
  if (!flying) targetPitch = env.onGround ? 0 : Math.max(targetPitch, 20); // too slow to climb
  if (env.onGround && targetPitch > 0) targetPitch = 0; // can't dive into the ground

  const grip = env.onGround ? clamp(s.speed / spec.takeoffSpeed, 0.3, 1) : 1;
  const turn = clamp(angleDiff(targetYaw, s.yaw), -spec.turnRate * grip, spec.turnRate * grip);
  s.yaw = (s.yaw + turn + 360) % 360;
  s.pitch += clamp(targetPitch - s.pitch, -spec.pitchRate, spec.pitchRate);
  const targetRoll = env.onGround ? 0 : clamp(turn * 8, -40, 40); // bank into turns
  s.roll += (targetRoll - s.roll) * 0.2;

  // Diving speeds you up, climbing slows you down.
  const airborne = !env.onGround && !env.inWater;
  if (airborne && flying) s.speed = clamp(s.speed + Math.sin(s.pitch * DEG) * 0.006, 0, top * 1.15);

  // Velocity from heading and speed.
  const cp = Math.cos(s.pitch * DEG);
  const vel = {
    x: -Math.sin(s.yaw * DEG) * cp * s.speed,
    y: -Math.sin(s.pitch * DEG) * s.speed,
    z: Math.cos(s.yaw * DEG) * cp * s.speed,
  };
  if (airborne && !flying) vel.y = Math.min(vel.y, -0.18); // gentle glide down
  if (env.onGround && vel.y < 0) vel.y = 0;
  if (env.inWater) {
    vel.y = Math.max(vel.y, 0.06); // planes float
    s.speed *= 0.9;
  }
  s.expected = Math.hypot(vel.x, vel.y, vel.z);
  return { vel, events };
}
