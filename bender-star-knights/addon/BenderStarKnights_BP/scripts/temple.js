// The Star Knight Temple: a list of blocks to place, relative to the north-west corner of
// a 41 x 41 square at ground level (y = 0 is the ground). Inside: a great hall with the
// Blade Workbench, a crystal cave behind it, a droid bay, a training arena with robot
// spawn pads and the Training Console out front, and a landing pad for the Star Dart.
// No Minecraft imports, so it can be checked outside the game.

export const SIZE = 41;
export const CRYSTAL_ID = "bender:star_crystal_block";
export const WORKBENCH_ID = "bender:blade_workbench";
export const CONSOLE_ID = "bender:training_console";

// the temple building
const TX1 = 8, TX2 = 32, TZ1 = 2, TZ2 = 22;
const TOP = 10; // the roof
const CAVE_Z = 8; // the wall between the hall and the crystal cave
const WEIRDO = { E: 0, W: 1, S: 2, N: 3 }; // stairs: the side with the tall part

export function planTemple() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const fill = (x1, y1, z1, x2, y2, z2, id, states) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, id, states);
  };
  const stairs = (x, y, z, id, tall) => set(x, y, z, id, { weirdo_direction: WEIRDO[tall], upside_down_bit: false });
  const last = SIZE - 1;

  // ---- the grounds: lawn, a path to the door
  fill(0, 0, 0, last, 0, last, "minecraft:grass_block");
  fill(19, 0, TZ2 + 1, 21, 0, last, "minecraft:smooth_stone");

  // ---- the training arena in front of the temple
  const AX1 = 10, AX2 = 30, AZ1 = 25, AZ2 = 38;
  fill(AX1, 0, AZ1, AX2, 0, AZ2, "minecraft:smooth_sandstone");
  fill(AX1 + 1, 0, AZ1 + 1, AX2 - 1, 0, AZ2 - 1, "minecraft:cut_sandstone");
  for (let x = AX1; x <= AX2; x++) {
    for (const z of [AZ1, AZ2]) if (x < 19 || x > 21) set(x, 1, z, "minecraft:stone_bricks"); // low wall, gaps for the path
  }
  for (let z = AZ1; z <= AZ2; z++) for (const x of [AX1, AX2]) set(x, 1, z, "minecraft:stone_bricks");
  for (const [x, z] of [[AX1, AZ1], [AX2, AZ1], [AX1, AZ2], [AX2, AZ2], [AX1, 31], [AX2, 31]]) {
    fill(x, 1, z, x, 3, z, "minecraft:quartz_pillar", { pillar_axis: "y" });
    set(x, 4, z, "minecraft:lantern", { hanging: false });
  }
  // robot spawn pads (red), out at the far end and the sides
  const pads = [{ x: 13, z: 36 }, { x: 27, z: 36 }, { x: 13, z: 29 }, { x: 27, z: 29 }];
  for (const p of pads) {
    fill(p.x - 1, 0, p.z - 1, p.x + 1, 0, p.z + 1, "minecraft:red_concrete");
    set(p.x, 0, p.z, "minecraft:shroomlight");
  }
  // the Training Console, at the top of the arena by the door, facing the arena
  const consoleSpot = { x: 23, y: 1, z: 26 };
  set(consoleSpot.x, 0, consoleSpot.z, "minecraft:polished_blackstone");
  set(consoleSpot.x, consoleSpot.y, consoleSpot.z, CONSOLE_ID, { "minecraft:cardinal_direction": "south" });

  // ---- the Star Dart landing pad, west of the arena
  fill(1, 0, 27, 7, 0, 35, "minecraft:black_concrete");
  fill(4, 0, 28, 4, 0, 34, "minecraft:white_concrete");
  fill(2, 0, 31, 6, 0, 31, "minecraft:white_concrete");
  for (const [x, z] of [[1, 27], [7, 27], [1, 35], [7, 35]]) set(x, 1, z, "minecraft:sea_lantern");

  // ---- the temple: floor, walls with gold bands and pillars, windows
  fill(TX1, 0, TZ1, TX2, 0, TZ2, "minecraft:polished_deepslate");
  for (let y = 1; y < TOP; y++) {
    for (let x = TX1; x <= TX2; x++) {
      for (const z of [TZ1, TZ2]) set(x, y, z, wallBlock(x - TX1, y));
    }
    for (let z = TZ1 + 1; z < TZ2; z++) {
      for (const x of [TX1, TX2]) set(x, y, z, wallBlock(z - TZ1, y));
    }
  }
  function wallBlock(a, y) {
    if (a % 6 === 0) return "minecraft:quartz_pillar";
    if (y === 4 || y === TOP - 1) return "minecraft:gold_block";
    if ((y === 2 || y === 3 || y === 6 || y === 7) && a % 6 >= 2 && a % 6 <= 4) return "minecraft:light_blue_stained_glass";
    return "minecraft:smooth_quartz";
  }
  for (const op of ops) if (op.id === "minecraft:quartz_pillar") op.states = { pillar_axis: "y" };
  // the big front door (an open archway) and steps up to it
  fill(19, 1, TZ2, 21, 5, TZ2, "minecraft:air");
  fill(18, 6, TZ2, 22, 6, TZ2, "minecraft:gold_block");
  // the roof, with a raised middle and a crystal spire
  fill(TX1, TOP, TZ1, TX2, TOP, TZ2, "minecraft:smooth_quartz");
  for (let x = TX1; x <= TX2; x++) for (const z of [TZ1, TZ2]) set(x, TOP + 1, z, "minecraft:quartz_stairs", { weirdo_direction: z === TZ1 ? WEIRDO.N : WEIRDO.S, upside_down_bit: false });
  for (let z = TZ1 + 1; z < TZ2; z++) for (const x of [TX1, TX2]) set(x, TOP + 1, z, "minecraft:quartz_stairs", { weirdo_direction: x === TX1 ? WEIRDO.W : WEIRDO.E, upside_down_bit: false });
  for (let y = TOP + 1; y <= TOP + 3; y++) {
    const i = y - TOP; // a stepped pyramid in the middle
    fill(14 + i, y, 7 + i, 26 - i, y, 17 - i, "minecraft:smooth_quartz");
  }
  fill(17, TOP + 4, 10, 23, TOP + 4, 14, "minecraft:gold_block");
  fill(20, TOP + 5, 12, 20, TOP + 8, 12, "minecraft:quartz_pillar", { pillar_axis: "y" });
  set(20, TOP + 9, 12, CRYSTAL_ID, { "bender:color": 0 });

  // ---- inside the great hall
  const HZ1 = CAVE_Z + 1, HZ2 = TZ2 - 1;
  fill(20, 0, HZ1, 20, 0, HZ2, "minecraft:gold_block"); // a gold line up the middle
  fill(19, 1, 15, 21, 1, HZ2, "minecraft:blue_carpet"); // the carpet to the workbench
  // the dais with the Blade Workbench
  fill(18, 1, 11, 22, 1, 13, "minecraft:chiseled_quartz_block");
  for (const x of [18, 19, 21, 22]) stairs(x, 1, 14, "minecraft:quartz_stairs", "N");
  stairs(20, 1, 14, "minecraft:quartz_stairs", "N");
  const workbench = { x: 20, y: 2, z: 12 };
  set(workbench.x, workbench.y, workbench.z, WORKBENCH_ID);
  // tall pillars down the hall, with lights in the ceiling
  for (const z of [11, 15, 19]) {
    for (const x of [11, 29]) fill(x, 1, z, x, TOP - 1, z, "minecraft:quartz_pillar", { pillar_axis: "y" });
  }
  for (const [x, z] of [[14, 12], [26, 12], [14, 18], [26, 18], [20, 16], [20, 20], [10, 16], [30, 16], [14, 10], [26, 10]]) set(x, TOP, z, "minecraft:sea_lantern");
  // banners of light: a row of end rods above the door
  for (const x of [17, 23]) fill(x, 1, HZ2, x, 3, HZ2, "minecraft:end_rod", { facing_direction: 1 });

  // ---- the droid bay, on the east side of the hall
  fill(26, 0, 17, 28, 0, 20, "minecraft:iron_block");
  set(27, 1, 20, "minecraft:lantern", { hanging: false });
  const droidSpot = { x: 27.5, y: 1, z: 18.5 };

  // ---- the crystal cave, behind the hall (through an arch in the inner wall)
  fill(TX1 + 1, 1, CAVE_Z, TX2 - 1, TOP - 1, CAVE_Z, "minecraft:smooth_quartz");
  fill(19, 1, CAVE_Z, 21, 4, CAVE_Z, "minecraft:air");
  fill(18, 5, CAVE_Z, 22, 5, CAVE_Z, "minecraft:gold_block");
  fill(TX1 + 1, 0, TZ1 + 1, TX2 - 1, 0, CAVE_Z - 1, "minecraft:calcite");
  // amethyst walls and ceiling inside the cave
  fill(TX1 + 1, 1, TZ1 + 1, TX1 + 1, TOP - 1, CAVE_Z - 1, "minecraft:amethyst_block");
  fill(TX2 - 1, 1, TZ1 + 1, TX2 - 1, TOP - 1, CAVE_Z - 1, "minecraft:amethyst_block");
  fill(TX1 + 1, 1, TZ1 + 1, TX2 - 1, TOP - 1, TZ1 + 1, "minecraft:amethyst_block");
  fill(TX1 + 1, TOP - 1, TZ1 + 1, TX2 - 1, TOP - 1, CAVE_Z - 1, "minecraft:amethyst_block");
  // nine Star Crystals: one of each color, set in the back wall where you can tap them
  const crystals = [];
  for (let i = 0; i < 9; i++) {
    const x = 12 + i * 2;
    crystals.push({ x, y: 2, z: TZ1 + 1, color: i });
    set(x, 2, TZ1 + 1, CRYSTAL_ID, { "bender:color": i });
    set(x, 1, TZ1 + 2, "minecraft:amethyst_cluster", { "minecraft:block_face": "up" });
  }
  for (const x of [11, 29]) for (const z of [4, 6]) set(x, 1, z, "minecraft:amethyst_cluster", { "minecraft:block_face": "up" });

  // ---- garden lights in the lawn, so monsters can't appear around the temple
  const final = new Map();
  for (const op of ops) final.set(`${op.x},${op.y},${op.z}`, op.id);
  const at = (x, y, z) => final.get(`${x},${y},${z}`);
  const grid = [3, 10, 17, 24, 31, 37];
  for (const x of grid) for (const z of grid) if (at(x, 0, z) === "minecraft:grass_block" && at(x, 1, z) === undefined) set(x, 0, z, "minecraft:sea_lantern");
  for (const x of [3, 37]) for (const z of [6, 13, 20]) if (at(x, 0, z) === "minecraft:grass_block" && at(x, 1, z) === undefined) set(x, 0, z, "minecraft:sea_lantern");
  for (const x of [12, 20, 28]) for (const z of [4, 15]) if (at(x, TOP, z) === "minecraft:smooth_quartz" && at(x, TOP + 1, z) === undefined) set(x, TOP, z, "minecraft:sea_lantern");
  // a sign by the path (the script writes on it)
  const sign = { x: 23, y: 1, z: 39 };
  set(sign.x, sign.y, sign.z, "minecraft:standing_sign", { ground_sign_direction: 0 });

  return {
    ops,
    crystals,
    workbench,
    console: consoleSpot,
    pads,
    sign,
    arena: { x1: AX1, x2: AX2, z1: AZ1, z2: AZ2 },
    temple: { x1: TX1, x2: TX2, z1: TZ1, z2: TZ2, top: TOP },
    spawns: { fighter: { x: 4.5, y: 1, z: 31.5 }, droid: droidSpot },
    viewpoint: { x: 20, y: 1, z: 33 },
  };
}
