// Safe Mansion planner: every block of the mansion as a list of placements, plus where the
// cameras, lasers, traps, turrets and vehicles go. No Minecraft imports, so it can be tested
// outside the game.
//
// Seen from above (north at the top), the 41x41 grounds have:
//   - a wall all round with a laser gate on the south side, motion sensors on top
//   - a lawn with a pool, a driveway, and launch-pad traps for monsters
//   - a two-floor mansion: hall, living room, kitchen, security room and garage downstairs;
//     two bedrooms, a library with a secret bookshelf door to the vault, and a control room
//     upstairs; a helipad with laser turrets on the roof
// Coordinates: x/z run 0..40 from the north-west corner; y = 0 is the ground.

export const SIZE = 41;
export const DOOR_ID = "bender:security_door";
export const SECRET_ID = "bender:secret_bookshelf";
export const CAMERA_ID = "bender:security_camera";
export const MONITOR_ID = "bender:security_monitor";
export const LASER_POST_ID = "bender:laser_post";
export const SENSOR_ID = "bender:motion_sensor";
export const TRAP_ID = "bender:trap_pad";

const CARDINAL = { N: "north", E: "east", S: "south", W: "west" };
const LEGACY = { S: 0, W: 1, N: 2, E: 3 }; // beds
const WEIRDO = { E: 0, W: 1, S: 2, N: 3 }; // stairs: the side with the tall part
const FACING = { N: 2, S: 3, W: 4, E: 5 }; // ladders, chests by facing_direction

// the house
const HX1 = 6, HX2 = 34, HZ1 = 6, HZ2 = 24;
const UP = 6; // second floor level
const ROOF = 12;

export function planMansion() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const fill = (x1, y1, z1, x2, y2, z2, id, states) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, id, states);
  };
  const stairs = (x, y, z, id, tall) => set(x, y, z, id, { weirdo_direction: WEIRDO[tall], upside_down_bit: false });
  const bed = (x, y, z, headDir) => {
    const step = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[headDir];
    set(x, y, z, "minecraft:bed", { direction: LEGACY[headDir], head_piece_bit: false, occupied_bit: false });
    set(x + step[0], y, z + step[1], "minecraft:bed", { direction: LEGACY[headDir], head_piece_bit: true, occupied_bit: false });
  };
  const camera = (x, y, z, dir) => set(x, y, z, CAMERA_ID, { "minecraft:cardinal_direction": CARDINAL[dir] });
  const last = SIZE - 1;

  // ---- grounds: lawn, the wall with a gate, motion sensors
  fill(1, 0, 1, last - 1, 0, last - 1, "minecraft:grass_block");
  for (let a = 0; a <= last; a++) {
    for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
      const gate = z === last && x >= 17 && x <= 23;
      if (gate) continue;
      fill(x, 0, z, x, 2, z, "minecraft:white_concrete");
      const sensor = (x % 10 === 0 && (z === 0 || z === last)) || (z % 10 === 0 && (x === 0 || x === last));
      set(x, 3, z, sensor ? SENSOR_ID : "minecraft:iron_bars");
    }
  }
  // the laser gate: two posts, beams between them (drawn by the script)
  for (const x of [17, 23]) fill(x, 0, last, x, 3, last, LASER_POST_ID);
  fill(18, 0, last, 22, 0, last, "minecraft:polished_andesite");

  // driveway to the front door and the garage, with lamps
  fill(18, 0, 25, 22, 0, last - 1, "minecraft:polished_andesite");
  fill(23, 0, 33, 33, 0, 36, "minecraft:polished_andesite");
  fill(29, 0, 25, 33, 0, 32, "minecraft:polished_andesite");
  for (const z of [28, 33, 38]) {
    for (const x of [17, 23]) {
      if (x === 23 && z >= 33 && z <= 36) continue;
      set(x, 1, z, "minecraft:andesite_wall");
      set(x, 2, z, "minecraft:lantern", { hanging: false });
    }
  }

  // the pool, with a quartz rim
  fill(2, 0, 27, 13, 0, 38, "minecraft:quartz_block");
  fill(3, -2, 28, 12, -1, 37, "minecraft:quartz_block");
  fill(3, -1, 28, 12, 0, 37, "minecraft:water");
  fill(4, -2, 29, 11, -2, 36, "minecraft:sea_lantern");

  // launch-pad traps for monsters, on the lawn either side of the driveway
  const traps = [{ x: 15, z: 31 }, { x: 25, z: 30 }, { x: 15, z: 37 }, { x: 26, z: 38 }, { x: 36, z: 30 }, { x: 36, z: 37 }];
  for (const t of traps) set(t.x, 0, t.z, TRAP_ID);

  // bushes in the corners
  for (const [x, z] of [[2, 2], [38, 2], [2, 24], [38, 24], [38, 38]]) {
    fill(x - 1, 1, z - 1, x + 1, 1, z + 1, "minecraft:oak_leaves", { persistent_bit: true, update_bit: false });
    set(x, 2, z, "minecraft:oak_leaves", { persistent_bit: true, update_bit: false });
  }

  // ---- the house shell
  fill(HX1, 0, HZ1, HX2, 0, HZ2, "minecraft:smooth_quartz");
  for (let y = 1; y < ROOF; y++) {
    for (let x = HX1; x <= HX2; x++) {
      for (const z of [HZ1, HZ2]) set(x, y, z, edge(x, y) ? "minecraft:light_gray_concrete" : "minecraft:white_concrete");
    }
    for (let z = HZ1 + 1; z < HZ2; z++) {
      for (const x of [HX1, HX2]) set(x, y, z, edge(z, y) ? "minecraft:light_gray_concrete" : "minecraft:white_concrete");
    }
  }
  function edge(a, y) {
    return y === UP || a === HX1 || a === HX2 || a === HZ1 || a === HZ2;
  }
  // big windows: two tall panes in every four along each wall, both floors
  const windowAt = (a, from) => (a - from) % 4 === 1 || (a - from) % 4 === 2;
  for (const [y1, y2] of [[2, 4], [UP + 2, UP + 4]]) {
    for (let x = HX1 + 2; x <= HX2 - 2; x++) {
      if (!windowAt(x, HX1)) continue;
      for (const z of [HZ1, HZ2]) fill(x, y1, z, x, y2, z, "minecraft:light_blue_stained_glass");
    }
    for (let z = HZ1 + 2; z <= HZ2 - 2; z++) {
      if (!windowAt(z, HZ1)) continue;
      for (const x of [HX1, HX2]) fill(x, y1, z, x, y2, z, "minecraft:light_blue_stained_glass");
    }
  }
  fill(17, UP + 1, HZ1, 23, ROOF - 1, HZ1, "minecraft:white_concrete");   // no windows into the secret vault
  // the second floor and the roof
  fill(HX1 + 1, UP, HZ1 + 1, HX2 - 1, UP, HZ2 - 1, "minecraft:smooth_quartz");
  fill(HX1, ROOF, HZ1, HX2, ROOF, HZ2, "minecraft:smooth_quartz");
  for (let x = HX1; x <= HX2; x++) for (const z of [HZ1, HZ2]) set(x, ROOF + 1, z, "minecraft:iron_bars");
  for (let z = HZ1 + 1; z < HZ2; z++) for (const x of [HX1, HX2]) set(x, ROOF + 1, z, "minecraft:iron_bars");

  // front door and garage door (they slide open for players, never for monsters)
  fill(19, 1, HZ2, 21, 3, HZ2, DOOR_ID, { "bender:open": false });
  fill(19, 4, HZ2, 21, 5, HZ2, "minecraft:light_blue_stained_glass");
  fill(29, 1, HZ2, 33, 4, HZ2, DOOR_ID, { "bender:open": false });
  fill(29, 5, HZ2, 33, 5, HZ2, "minecraft:light_gray_concrete");

  // ---- downstairs
  // walls: living room | hall | security room | garage, kitchen at the back
  fill(16, 1, HZ1 + 1, 16, UP - 1, HZ2 - 1, "minecraft:white_concrete");
  fill(16, 1, 16, 16, 3, 17, "minecraft:air");                         // into the living room (beside the stairs)
  fill(HX1 + 1, 1, 15, 15, UP - 1, 15, "minecraft:white_concrete");     // kitchen | living room
  fill(16, 1, 9, 16, 2, 10, "minecraft:air");                          // kitchen doorway
  fill(17, 1, 15, 27, UP - 1, 15, "minecraft:white_concrete");          // hall | kitchen
  fill(20, 1, 15, 21, 2, 15, "minecraft:air");
  fill(24, 1, 16, 24, UP - 1, 23, "minecraft:white_concrete");          // hall | security room
  fill(24, 1, 20, 24, 2, 21, "minecraft:air");
  fill(28, 1, HZ1 + 1, 28, UP - 1, HZ2 - 1, "minecraft:white_concrete"); // garage wall
  // stairs up, in the hall
  fill(17, UP, 18, 18, UP, 22, "minecraft:air");                        // the stairwell
  for (let i = 0; i < 6; i++) {                                          // six steps; the top one is in the floor
    const z = 22 - i;
    for (const x of [17, 18]) {
      if (i > 0) fill(x, 1, z, x, i, z, "minecraft:quartz_block");
      stairs(x, i + 1, z, "minecraft:quartz_stairs", "N");
    }
  }
  // living room: sofa, TV wall, rug
  fill(9, 1, 17, 13, 1, 21, "minecraft:light_blue_carpet");
  for (let x = 9; x <= 13; x++) stairs(x, 1, 22, "minecraft:quartz_stairs", "S");
  fill(10, 2, 15, 12, 3, 15, "minecraft:black_concrete");               // a big TV on the wall
  // kitchen: counters and a table
  fill(7, 1, 7, 15, 1, 7, "minecraft:smooth_quartz");
  set(9, 1, 7, "minecraft:furnace", { "minecraft:cardinal_direction": CARDINAL.S });
  set(12, 1, 7, "minecraft:cauldron", { cauldron_liquid: "water", fill_level: 6 });
  fill(10, 1, 11, 12, 1, 12, "minecraft:oak_planks");
  // the security room: three monitors on a desk and a chair
  fill(25, 1, 16, 27, 1, 16, "minecraft:light_gray_concrete");
  const monitors = [];
  for (const x of [25, 26, 27]) {
    set(x, 2, 16, MONITOR_ID, { "minecraft:cardinal_direction": CARDINAL.S });
    monitors.push({ x, y: 2, z: 16 });
  }
  stairs(26, 1, 18, "minecraft:quartz_stairs", "S");
  // garage: lights
  for (const z of [10, 16, 21]) set(31, UP - 1, z, "minecraft:sea_lantern");

  // ---- upstairs
  const U = UP + 1;
  fill(16, U, HZ1 + 1, 16, ROOF - 1, HZ2 - 1, "minecraft:white_concrete");   // bedrooms | library
  fill(16, U, 20, 16, U + 1, 21, "minecraft:air");
  fill(HX1 + 1, U, 15, 15, ROOF - 1, 15, "minecraft:white_concrete");         // the two bedrooms
  fill(10, U, 15, 11, U + 1, 15, "minecraft:air");
  fill(24, U, HZ1 + 1, 24, ROOF - 1, HZ2 - 1, "minecraft:white_concrete");   // library | control room
  fill(24, U, 20, 24, U + 1, 21, "minecraft:air");
  // the library, with a wall of bookshelves hiding the vault
  fill(17, U, 15, 23, ROOF - 1, 15, "minecraft:bookshelf");
  set(20, U, 15, SECRET_ID, { "bender:open": false });
  set(20, U + 1, 15, SECRET_ID, { "bender:open": false });
  fill(17, U, 23, 23, U + 2, 23, "minecraft:bookshelf");
  fill(19, U + 3, 23, 21, U + 3, 23, "minecraft:light_blue_stained_glass");
  fill(21, U, 18, 22, U, 19, "minecraft:red_carpet");
  // the vault: gold, diamonds and two treasure chests
  fill(17, UP, HZ1 + 1, 23, UP, 14, "minecraft:gold_block");
  fill(18, U, 8, 22, U, 8, "minecraft:diamond_block");
  const chests = [{ x: 18, y: U, z: 10 }, { x: 22, y: U, z: 10 }];
  for (const c of chests) set(c.x, c.y, c.z, "minecraft:chest", { "minecraft:cardinal_direction": CARDINAL.S });
  for (const x of [17, 23]) set(x, ROOF - 1, 11, "minecraft:sea_lantern");
  // bedrooms
  fill(8, U, 17, 13, U, 22, "minecraft:blue_carpet");                  // the blue bedroom
  bed(9, U, 20, "N");
  fill(8, U, 8, 13, U, 13, "minecraft:orange_carpet");                 // the orange bedroom
  bed(9, U, 10, "N");
  fill(19, U, 18, 19, U, 22, "minecraft:iron_bars");                    // railing round the stairwell
  // the control room, with stairs up to the roof
  fill(32, ROOF, 18, 33, ROOF, 22, "minecraft:air");
  for (let i = 0; i < 6; i++) {                                          // six steps; the top one is in the roof
    const z = 22 - i;
    for (const x of [32, 33]) {
      if (i > 0) fill(x, U, z, x, U + i - 1, z, "minecraft:quartz_block");
      stairs(x, U + i, z, "minecraft:quartz_stairs", "N");
    }
  }
  for (let z = 18; z <= 23; z++) set(31, ROOF + 1, z, "minecraft:iron_bars");   // railing round the roof stairs
  fill(32, ROOF + 1, 23, 33, ROOF + 1, 23, "minecraft:iron_bars");
  // lights everywhere
  for (const [x, z] of [[11, 11], [11, 19], [20, 19], [26, 19], [20, 11], [29, 11], [29, 19]]) {
    set(x, UP - 1, z, "minecraft:sea_lantern");
    if (!(x >= 17 && x <= 23 && z <= 14)) set(x, ROOF - 1, z, "minecraft:sea_lantern");
  }

  // ---- the roof: a helipad (black with a yellow H)
  fill(12, ROOF, 9, 24, ROOF, 21, "minecraft:black_concrete");
  fill(15, ROOF, 12, 15, ROOF, 18, "minecraft:yellow_concrete");
  fill(21, ROOF, 12, 21, ROOF, 18, "minecraft:yellow_concrete");
  fill(15, ROOF, 15, 21, ROOF, 15, "minecraft:yellow_concrete");

  // ---- garden lights set into the lawn and the roof, so monsters can't spawn inside the walls
  const final = new Map();
  for (const op of ops) final.set(`${op.x},${op.y},${op.z}`, op.id);
  const at = (x, y, z) => final.get(`${x},${y},${z}`);
  const lawnLights = [3, 10, 17, 24, 31, 37];
  for (const x of lawnLights) {
    for (const z of lawnLights) {
      if (at(x, 0, z) === "minecraft:grass_block" && at(x, 1, z) === undefined) set(x, 0, z, "minecraft:sea_lantern");
    }
  }
  for (const x of [8, 16, 24, 32]) {
    for (const z of [8, 15, 22]) {
      if (at(x, ROOF, z) === "minecraft:smooth_quartz" && at(x, ROOF + 1, z) === undefined) set(x, ROOF, z, "minecraft:sea_lantern");
    }
  }

  // ---- cameras, all over (they look where "look" says)
  const cameras = [
    { name: "Front Door", x: 20, y: 6, z: 25, dir: "S", look: { x: 20.5, y: 1, z: 36 } },
    { name: "Gate", x: 17, y: 4, z: 40, dir: "S", look: { x: 20.5, y: 0.5, z: 48 } },
    { name: "Pool & Garden", x: 7, y: 6, z: 25, dir: "S", look: { x: 7.5, y: 0, z: 32.5 } },
    { name: "Garage", x: 31, y: 4, z: 7, dir: "S", look: { x: 31.5, y: 1, z: 20 } },
    { name: "Back Yard", x: 20, y: 6, z: 5, dir: "N", look: { x: 20.5, y: 0, z: 1 } },
    { name: "Helipad", x: 20, y: ROOF + 1, z: 24, dir: "N", look: { x: 18.5, y: ROOF, z: 15 } },
    { name: "Vault", x: 20, y: ROOF - 2, z: 14, dir: "N", look: { x: 20.5, y: U, z: 9 } },
  ];
  for (const c of cameras) camera(c.x, c.y, c.z, c.dir);
  // a sign by the gate (the script writes the owner's name on it)
  const sign = { x: 24, y: 1, z: 38 };
  set(sign.x, sign.y, sign.z, "minecraft:standing_sign", { ground_sign_direction: 0 });

  return {
    ops,
    cameras,
    monitors,
    chests,
    traps,
    sign,
    gate: { x1: 18, x2: 22, z: last, posts: [17, 23], heights: [0.5, 1.5, 2.5, 3.5] },
    yard: { x1: 1, x2: last - 1, z1: 1, z2: last - 1 },
    house: { x1: HX1, x2: HX2, z1: HZ1, z2: HZ2, roof: ROOF },
    turrets: [{ x: 8.5, y: ROOF + 1, z: 8.5 }, { x: 32.5, y: ROOF + 1, z: 8.5 }, { x: 8.5, y: ROOF + 1, z: 22.5 }, { x: 28.5, y: ROOF + 1, z: 22.5 }],
    spawns: {
      car: { x: 31, y: 1, z: 15 },
      helicopter: { x: 18.5, y: ROOF + 1, z: 15.5 },
      drone: { x: 27.5, y: ROOF + 1, z: 11.5 },
    },
    viewpoint: { x: 20, y: 1, z: 37 },
  };
}
