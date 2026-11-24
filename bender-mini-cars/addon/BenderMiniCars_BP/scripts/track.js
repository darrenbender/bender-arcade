// The Bender Raceway: a list of blocks to place, relative to the north-west corner of a
// 61 x 41 rectangle at ground level (y = 0 is the ground). A looping road with curbs, a
// checkered start/finish line under a gantry with countdown lights, a grandstand, a
// podium, the Race Control, and checkpoints so laps only count the whole way round.
// No Minecraft imports, so it can be checked outside the game.

export const SIZE_X = 61;
export const SIZE_Z = 41;
export const LIGHT_ID = "bender:race_light";
export const CONTROL_ID = "bender:race_control";

// the middle of the road is a rounded rectangle
const CX = 30, CZ = 20, HX = 22, HZ = 12, R = 8;
const ROAD = 3.5; // half the road's width
const CURB = 4.5;
const WEIRDO = { E: 0, W: 1, S: 2, N: 3 }; // stairs: the side with the tall part

/** How far a spot is from the middle of the road (signed: negative = inside the loop). */
export function roadDistance(x, z) {
  const qx = Math.abs(x - CX) - (HX - R);
  const qz = Math.abs(z - CZ) - (HZ - R);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - R;
}

/** About how long one lap is, in blocks (the length of the middle of the road). */
export const LAP_LENGTH = Math.round(2 * (2 * (HX - R) + 2 * (HZ - R)) + 2 * Math.PI * R);

/** The checkpoints, in the order you drive through them. 0 is the start/finish line. */
export const CHECKPOINTS = [
  { name: "finish", x1: 30, x2: 31, z1: 27, z2: 37 },
  { name: "east", x1: 46, x2: 58, z1: 19, z2: 21 },
  { name: "north", x1: 29, x2: 31, z1: 2, z2: 14 },
  { name: "west", x1: 2, x2: 14, z1: 19, z2: 21 },
];

/** Which checkpoint a spot (relative to the track's corner) is in, or -1. */
export function checkpointAt(l) {
  const x = Math.floor(l.x);
  const z = Math.floor(l.z);
  if (l.y < -2 || l.y > 8) return -1;
  return CHECKPOINTS.findIndex((c) => x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2);
}

export function planTrack() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const fill = (x1, y1, z1, x2, y2, z2, id, states) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, id, states);
  };

  // ---- the ground, the road and its curbs
  fill(0, 0, 0, SIZE_X - 1, 0, SIZE_Z - 1, "minecraft:grass_block");
  for (let x = 0; x < SIZE_X; x++) {
    for (let z = 0; z < SIZE_Z; z++) {
      const d = Math.abs(roadDistance(x + 0.5, z + 0.5));
      if (d <= ROAD) set(x, 0, z, "minecraft:gray_concrete");
      else if (d <= CURB) set(x, 0, z, Math.floor((x + z) / 2) % 2 ? "minecraft:red_concrete" : "minecraft:white_concrete");
    }
  }
  // the checkered start/finish line across the bottom straight
  for (let z = 27; z <= 37; z++) {
    for (const x of [30, 31]) {
      if (Math.abs(roadDistance(x + 0.5, z + 0.5)) <= ROAD) set(x, 0, z, (x + z) % 2 ? "minecraft:black_concrete" : "minecraft:white_concrete");
    }
  }
  // the starting grid: white boxes behind the line
  const grid = [];
  for (const x of [27, 24, 21, 18]) {
    for (const z of [30, 33]) {
      grid.push({ x: x + 0.5, y: 1, z: z + 0.5 });
      set(x - 1, 0, z, "minecraft:white_concrete");
      set(x + 1, 0, z, "minecraft:white_concrete");
    }
  }

  // ---- the start gantry with three countdown lights
  for (const z of [27, 37]) fill(30, 1, z, 30, 5, z, "minecraft:iron_block");
  fill(29, 6, 27, 30, 6, 37, "minecraft:black_concrete");
  fill(29, 6, 32, 30, 6, 32, "minecraft:sea_lantern"); // lights up the top of the gantry
  const lights = [];
  for (const z of [31, 32, 33]) {
    set(29, 5, z, LIGHT_ID, { "bender:light": 0 });
    lights.push({ x: 29, y: 5, z });
  }
  set(28, 6, 32, "minecraft:white_concrete"); // a checkered flag on top
  set(28, 7, 32, "minecraft:black_concrete");
  set(28, 6, 33, "minecraft:black_concrete");
  set(28, 7, 33, "minecraft:white_concrete");

  // ---- the infield: Race Control, the podium, a sign
  fill(32, 0, 24, 34, 0, 26, "minecraft:polished_andesite");
  const control = { x: 33, y: 1, z: 25 };
  set(control.x, control.y, control.z, CONTROL_ID, { "minecraft:cardinal_direction": "south" });
  fill(27, 0, 15, 33, 0, 19, "minecraft:polished_andesite");
  set(28, 1, 17, "minecraft:iron_block"); // 2nd
  fill(30, 1, 17, 30, 2, 17, "minecraft:gold_block"); // 1st
  set(32, 1, 17, "minecraft:copper_block"); // 3rd
  const sign = { x: 26, y: 1, z: 25 };
  set(sign.x, sign.y, sign.z, "minecraft:standing_sign", { ground_sign_direction: 0 });

  // ---- the grandstand along the bottom straight, facing the track
  for (let x = 14; x <= 46; x++) {
    if (x === 30) continue; // a gap to walk through
    set(x, 1, 38, "minecraft:quartz_stairs", { weirdo_direction: WEIRDO.S, upside_down_bit: false });
    set(x, 1, 39, "minecraft:quartz_block");
    set(x, 2, 39, "minecraft:quartz_stairs", { weirdo_direction: WEIRDO.S, upside_down_bit: false });
    fill(x, 1, 40, x, 2, 40, "minecraft:quartz_block");
    set(x, 3, 40, "minecraft:quartz_stairs", { weirdo_direction: WEIRDO.S, upside_down_bit: false });
  }
  for (const x of [14, 46]) fill(x, 4, 40, x, 6, 40, "minecraft:iron_bars");
  set(14, 7, 40, "minecraft:red_wool"); // flags on the poles at each end
  set(46, 7, 40, "minecraft:light_blue_wool");

  // ---- garden lights in the grass, so monsters can't appear on the track
  const final = new Map();
  for (const op of ops) final.set(`${op.x},${op.y},${op.z}`, op.id);
  const at = (x, y, z) => final.get(`${x},${y},${z}`);
  for (let x = 2; x < SIZE_X; x += 7) {
    for (let z = 2; z < SIZE_Z; z += 7) {
      if (at(x, 0, z) === "minecraft:grass_block" && at(x, 1, z) === undefined) set(x, 0, z, "minecraft:sea_lantern");
    }
  }

  return {
    ops,
    grid,
    lights,
    control,
    sign,
    checkpoints: CHECKPOINTS,
    spawns: { cars: [grid[0], grid[1]] },
    viewpoint: { x: 29, y: 4, z: 40 },
    yaw: -90, // cars on the grid face east, toward the line
  };
}
