// City planner: works out every block of a city as a list of placements.
// It has no Minecraft imports, so it can be tested outside the game.
//
// Layout (seen from above): a 4x4 grid of 11x11 plots with 3-wide roads
// between them, a wall around the outside, and the middle 2x2 plots joined
// into a plaza with the town hall, fountain and bell.
//
// Coordinates: x/z run 0..FOOTPRINT-1 from the city's north-west corner.
// y is relative to the city floor (0 = ground level, 1 = first block above).

export const PLOT = 11;
export const ROAD = 3;
export const PLOTS = 4;
export const INNER = PLOTS * PLOT + (PLOTS + 1) * ROAD; // 59
export const FOOTPRINT = INNER + 2; // plus the wall ring: 61

const DIRS = ["N", "E", "S", "W"];
const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// Direction values used by different kinds of blocks.
const CARDINAL = { N: "north", E: "east", S: "south", W: "west" };
const LEGACY = { S: 0, W: 1, N: 2, E: 3 }; // beds, looms, grindstones, bells
const WEIRDO = { E: 0, W: 1, S: 2, N: 3 }; // stairs: the side the tall part is on
const FACING = { N: 2, S: 3, W: 4, E: 5 }; // wall signs, ladders
const SIGN16 = { S: 0, W: 4, N: 8, E: 12 }; // standing signs

// Logs stand upright; other blocks used as posts (like cut sandstone) have no axis.
function upright(id) {
  return id.endsWith("_log") ? { pillar_axis: "y" } : {};
}

export function rotDir(d, quarterTurns) {
  return DIRS[(DIRS.indexOf(d) + quarterTurns) % 4];
}

// ------------------------------------------------------------ random

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    shuffle(list) {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

const NAME_A = ["Sunny", "Maple", "Golden", "Clover", "Pebble", "Honey", "Willow", "Starlight", "Bramble",
  "Copper", "Misty", "Cherry", "Lucky", "Rainbow", "Acorn", "Bluebell", "Pumpkin", "Silver"];
const NAME_B = ["Hollow", "Harbor", "Falls", "Meadow", "Town", "Ridge", "Crossing", "Springs", "Grove",
  "Haven", "Valley", "Bay", "Brook", "Fields", "Hill", "Corner"];

export function cityName(rng) {
  return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
}

// ------------------------------------------------------------ styles

const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "cherry"];

function wood(w) {
  return {
    planks: `minecraft:${w}_planks`,
    log: `minecraft:${w}_log`,
    stairs: `minecraft:${w}_stairs`,
    slab: `minecraft:${w}_slab`,
    fence: `minecraft:${w}_fence`,
    door: w === "oak" ? "minecraft:wooden_door" : `minecraft:${w}_door`,
    leaves: `minecraft:${w}_leaves`,
  };
}

// walls, roof, masonry and ground for each kind of land
export const STYLES = {
  plains: { label: "meadow", walls: "oak", roof: "spruce", tree: "oak", masonry: "stone", ground: "minecraft:grass_block" },
  forest: { label: "forest", walls: "birch", roof: "dark_oak", tree: "birch", masonry: "stone", ground: "minecraft:grass_block" },
  taiga: { label: "snowy pine", walls: "spruce", roof: "dark_oak", tree: "spruce", masonry: "stone", ground: "minecraft:grass_block" },
  jungle: { label: "jungle", walls: "jungle", roof: "jungle", tree: "jungle", masonry: "mossy", ground: "minecraft:grass_block" },
  savanna: { label: "savanna", walls: "acacia", roof: "acacia", tree: "acacia", masonry: "stone", ground: "minecraft:grass_block" },
  dark: { label: "dark forest", walls: "dark_oak", roof: "spruce", tree: "dark_oak", masonry: "stone", ground: "minecraft:grass_block" },
  cherry: { label: "cherry blossom", walls: "birch", roof: "cherry", tree: "cherry", masonry: "stone", ground: "minecraft:grass_block" },
  desert: { label: "desert", walls: "sand", roof: "sand", tree: "acacia", masonry: "sand", ground: "minecraft:sand" },
};

const MASONRY = {
  stone: {
    block: "minecraft:stone_bricks", stairs: "minecraft:stone_brick_stairs", slab: "minecraft:stone_brick_slab",
    rough: "minecraft:cobblestone", accent: "minecraft:polished_andesite", path: "minecraft:grass_path",
  },
  mossy: {
    block: "minecraft:mossy_stone_bricks", stairs: "minecraft:mossy_stone_brick_stairs", slab: "minecraft:mossy_stone_brick_slab",
    rough: "minecraft:mossy_cobblestone", accent: "minecraft:stone_bricks", path: "minecraft:grass_path",
  },
  sand: {
    block: "minecraft:cut_sandstone", stairs: "minecraft:smooth_sandstone_stairs", slab: "minecraft:smooth_sandstone_slab",
    rough: "minecraft:sandstone", accent: "minecraft:smooth_sandstone", path: "minecraft:smooth_sandstone",
  },
};

export function makePalette(styleName) {
  const s = STYLES[styleName] ?? STYLES.plains;
  const m = MASONRY[s.masonry];
  const desert = s.walls === "sand";
  const w = wood(desert ? "birch" : s.walls);
  const r = wood(desert ? "birch" : s.roof);
  return {
    name: styleName,
    label: s.label,
    ground: s.ground,
    planks: desert ? "minecraft:smooth_sandstone" : w.planks,
    log: desert ? "minecraft:cut_sandstone" : w.log,
    door: w.door,
    fence: w.fence,
    floor: desert ? "minecraft:birch_planks" : w.planks,
    roofStairs: desert ? m.stairs : r.stairs,
    roofSlab: desert ? m.slab : r.slab,
    roofFill: desert ? "minecraft:smooth_sandstone" : r.planks,
    leaves: wood(s.tree).leaves,
    trunk: wood(s.tree).log,
    brick: m.block,
    brickStairs: m.stairs,
    brickSlab: m.slab,
    rough: m.rough,
    accent: m.accent,
    path: m.path,
    mainRoad: desert ? "minecraft:smooth_sandstone" : m.block,
  };
}

// Pick a style from what the land looks like: surface blocks and leaves.
export function pickStyle(counts) {
  const n = (id) => counts[id] ?? 0;
  const sand = n("minecraft:sand") + n("minecraft:red_sand") + n("minecraft:sandstone");
  const snow = n("minecraft:snow_layer") + n("minecraft:snow") + n("minecraft:powder_snow");
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  if (sand / total > 0.3) return "desert";
  if (snow / total > 0.2) return "taiga";
  const leafStyle = {
    "minecraft:spruce_leaves": "taiga",
    "minecraft:birch_leaves": "forest",
    "minecraft:jungle_leaves": "jungle",
    "minecraft:acacia_leaves": "savanna",
    "minecraft:dark_oak_leaves": "dark",
    "minecraft:cherry_leaves": "cherry",
    "minecraft:oak_leaves": "plains",
  };
  let best = "plains";
  let bestCount = 2; // need a few trees before trusting the leaves
  for (const [leaf, style] of Object.entries(leafStyle)) {
    if (n(leaf) > bestCount) {
      best = style;
      bestCount = n(leaf);
    }
  }
  return best;
}

// ------------------------------------------------------------ the canvas

// Draws into one plot (or the plaza) in local coordinates, where the front
// door always faces south (+z). Rotation turns it to face the right road.
class Canvas {
  constructor(ops, ox, oz, size, turns) {
    this.ops = ops;
    this.ox = ox;
    this.oz = oz;
    this.size = size;
    this.turns = turns;
  }

  world(lx, lz) {
    const n = this.size - 1;
    switch (this.turns) {
      case 1:
        return [this.ox + n - lz, this.oz + lx];
      case 2:
        return [this.ox + n - lx, this.oz + n - lz];
      case 3:
        return [this.ox + lz, this.oz + n - lx];
      default:
        return [this.ox + lx, this.oz + lz];
    }
  }

  set(lx, y, lz, id, states) {
    const [x, z] = this.world(lx, lz);
    this.ops.push({ x, y, z, id, states: states ?? {} });
  }

  dir(d) {
    return rotDir(d, this.turns);
  }

  fill(x1, y1, z1, x2, y2, z2, id, states) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) this.set(x, y, z, id, states);
  }

  walls(x1, z1, x2, z2, y1, y2, id, states) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        this.set(x, y, z1, id, states);
        this.set(x, y, z2, id, states);
      }
      for (let z = z1 + 1; z < z2; z++) {
        this.set(x1, y, z, id, states);
        this.set(x2, y, z, id, states);
      }
    }
  }

  corners(x1, z1, x2, z2, y1, y2, id) {
    for (const [x, z] of [[x1, z1], [x2, z1], [x1, z2], [x2, z2]]) this.fill(x, y1, z, x, y2, z, id, upright(id));
  }

  stairs(x, y, z, id, tallSide, upsideDown = false) {
    this.set(x, y, z, id, { weirdo_direction: WEIRDO[this.dir(tallSide)], upside_down_bit: upsideDown });
  }

  door(x, y, z, id, facing) {
    const d = CARDINAL[this.dir(facing)];
    this.set(x, y, z, id, { "minecraft:cardinal_direction": d, upper_block_bit: false, open_bit: false, door_hinge_bit: false });
    this.set(x, y + 1, z, id, { "minecraft:cardinal_direction": d, upper_block_bit: true, open_bit: false, door_hinge_bit: false });
  }

  bed(x, y, z, headDir) {
    const [dx, dz] = STEP[headDir];
    const direction = LEGACY[this.dir(headDir)];
    this.set(x, y, z, "minecraft:bed", { direction, head_piece_bit: false, occupied_bit: false });
    this.set(x + dx, y, z + dz, "minecraft:bed", { direction, head_piece_bit: true, occupied_bit: false });
  }

  facing(x, y, z, id, front) {
    this.set(x, y, z, id, { "minecraft:cardinal_direction": CARDINAL[this.dir(front)] });
  }

  legacy(x, y, z, id, front, extra) {
    this.set(x, y, z, id, { direction: LEGACY[this.dir(front)], ...extra });
  }

  ladder(x, y1, y2, z, front) {
    for (let y = y1; y <= y2; y++) this.set(x, y, z, "minecraft:ladder", { facing_direction: FACING[this.dir(front)] });
  }

  lantern(x, y, z, hanging = false) {
    this.set(x, y, z, "minecraft:lantern", { hanging });
  }

  lampPost(x, z, fence, height = 3) {
    this.fill(x, 1, z, x, height, z, fence);
    this.lantern(x, height + 1, z);
  }

  // Gable roof with the ridge running east-west over x1..x2, z1..z2.
  roof(x1, z1, x2, z2, yBase, p) {
    for (let k = 0; ; k++) {
      const north = z1 - 1 + k;
      const south = z2 + 1 - k;
      const y = yBase + k;
      if (north > south) break;
      for (let x = x1 - 1; x <= x2 + 1; x++) {
        if (north === south) {
          this.set(x, y, north, p.roofSlab, { "minecraft:vertical_half": "bottom" });
        } else {
          this.stairs(x, y, north, p.roofStairs, "S");
          this.stairs(x, y, south, p.roofStairs, "N");
        }
      }
      // close the triangle at both gable ends
      for (let z = z1 + k; z <= z2 - k; z++) {
        this.set(x1, y, z, p.roofFill);
        this.set(x2, y, z, p.roofFill);
      }
    }
  }

  tree(x, z, p, height = 4) {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let y = height - 1; y <= height + 2; y++) {
          const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, y - height);
          if (r <= 3 && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) {
            this.set(x + dx, y, z + dz, p.leaves, { persistent_bit: true, update_bit: false });
          }
        }
    this.fill(x, 1, z, x, height, z, p.trunk, upright(p.trunk));
  }

  flowers(spots, rng) {
    for (const [x, z] of spots) {
      this.set(x, 0, z, "minecraft:grass_block"); // flowers can't grow on sand
      this.set(x, 1, z, rng.pick(FLOWERS));
    }
  }
}

const FLOWERS = ["minecraft:poppy", "minecraft:dandelion", "minecraft:blue_orchid", "minecraft:allium",
  "minecraft:azure_bluet", "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:red_tulip"];

// Villager job blocks handed out to houses and shops.
const JOBS = [
  { id: "minecraft:barrel", kind: "barrel" },
  { id: "minecraft:smoker", kind: "card" },
  { id: "minecraft:cartography_table", kind: "plain" },
  { id: "minecraft:fletching_table", kind: "plain" },
  { id: "minecraft:loom", kind: "legacy" },
  { id: "minecraft:brewing_stand", kind: "plain" },
  { id: "minecraft:cauldron", kind: "plain" },
  { id: "minecraft:stonecutter_block", kind: "card" },
];

function placeJob(c, x, y, z, job, front) {
  if (job.kind === "card") c.facing(x, y, z, job.id, front);
  else if (job.kind === "legacy") c.legacy(x, y, z, job.id, front);
  else if (job.kind === "barrel") c.set(x, y, z, job.id, { facing_direction: 1, open_bit: false });
  else c.set(x, y, z, job.id);
}

// ------------------------------------------------------------ buildings
// Each one draws inside an 11x11 plot with its door facing south, and
// returns how many beds it has.

function cottage(c, p, rng, job) {
  c.fill(2, 0, 2, 8, 0, 8, p.floor);
  c.walls(2, 2, 8, 8, 1, 3, p.planks);
  c.corners(2, 2, 8, 8, 1, 3, p.log);
  for (const [x, z] of [[5, 2], [2, 5], [8, 5], [3, 8], [7, 8]]) c.set(x, 2, z, "minecraft:glass_pane");
  c.door(5, 1, 8, p.door, "S");
  c.roof(2, 2, 8, 8, 4, p);
  c.bed(3, 1, 4, "N");
  placeJob(c, 7, 1, 3, job, "S");
  c.set(7, 1, 4, "minecraft:crafting_table");
  c.lantern(7, 1, 7);
  c.fill(5, 0, 9, 5, 0, 10, p.path);
  c.flowers([[3, 9], [7, 9], [1, 3], [9, 6]], rng);
  return 1;
}

function bigHouse(c, p, rng, job) {
  c.fill(1, 0, 2, 9, 0, 8, p.rough);
  c.walls(1, 2, 9, 8, 1, 3, p.rough);
  c.fill(1, 4, 2, 9, 4, 8, p.floor);
  c.walls(1, 2, 9, 8, 5, 7, p.planks);
  c.corners(1, 2, 9, 8, 1, 7, p.log);
  for (const [x, z] of [[3, 2], [7, 2], [1, 5], [9, 5], [3, 8], [7, 8]]) {
    c.set(x, 2, z, "minecraft:glass_pane");
    c.set(x, 6, z, "minecraft:glass_pane");
  }
  c.door(5, 1, 8, p.door, "S");
  c.set(8, 4, 3, "minecraft:air");
  c.ladder(8, 1, 4, 3, "S");
  c.roof(1, 2, 9, 8, 8, p);
  placeJob(c, 2, 1, 3, job, "S");
  c.facing(3, 1, 3, "minecraft:chest", "S");
  c.set(4, 1, 3, "minecraft:crafting_table");
  c.lantern(2, 1, 7);
  c.bed(2, 5, 4, "N");
  c.bed(4, 5, 4, "N");
  c.lantern(7, 5, 7);
  c.fill(5, 0, 9, 5, 0, 10, p.path);
  c.flowers([[2, 9], [8, 9], [0, 4]], rng);
  return 2;
}

function market(c, p, rng, jobs) {
  const awnings = rng.shuffle(["red", "yellow", "blue", "lime", "orange", "pink", "light_blue", "purple"]);
  [[1, 4], [6, 9]].forEach(([x1, x2], i) => {
    const color = `minecraft:${awnings[i]}_wool`;
    c.fill(x1, 0, 3, x2, 0, 7, p.floor);
    for (const [x, z] of [[x1, 3], [x2, 3], [x1, 7], [x2, 7]]) c.fill(x, 1, z, x, 3, z, p.fence);
    for (let x = x1; x <= x2; x++)
      for (let z = 3; z <= 8; z++) c.set(x, 4, z, (x + z) % 2 ? color : "minecraft:white_wool");
    c.set(x1 + 1, 1, 7, "minecraft:barrel", { facing_direction: 1, open_bit: false });
    c.facing(x2 - 1, 1, 7, "minecraft:chest", "S");
    placeJob(c, x1 + 1, 1, 4, jobs[i], "S");
    c.lantern(x1 + 1, 3, 5, true);
  });
  c.fill(5, 0, 2, 5, 0, 10, p.path);
  c.lampPost(5, 1, p.fence);
  return 0;
}

function library(c, p, rng) {
  c.fill(2, 0, 2, 8, 0, 8, p.floor);
  c.walls(2, 2, 8, 8, 1, 11, p.brick);
  c.fill(3, 4, 3, 7, 4, 7, p.floor);
  c.fill(3, 8, 3, 7, 8, 7, p.floor);
  c.fill(2, 12, 2, 8, 12, 8, p.brick);
  for (let i = 0; i < 7; i += 2) {
    c.set(2 + i, 13, 2, p.brick);
    c.set(2 + i, 13, 8, p.brick);
    c.set(2, 13, 2 + i, p.brick);
    c.set(8, 13, 2 + i, p.brick);
  }
  for (const y of [2, 6, 10]) {
    for (const [x, z] of [[5, 2], [2, 5], [8, 5]]) c.set(x, y, z, "minecraft:glass_pane");
    if (y > 2) c.set(5, y, 8, "minecraft:glass_pane");
  }
  c.door(5, 1, 8, p.door, "S");
  // ladder all the way up to a lookout on the roof
  c.ladder(7, 1, 12, 3, "S");
  c.fill(3, 1, 3, 3, 3, 7, "minecraft:bookshelf");
  c.fill(4, 1, 3, 6, 3, 3, "minecraft:bookshelf");
  c.fill(3, 5, 3, 3, 7, 7, "minecraft:bookshelf");
  c.fill(7, 5, 4, 7, 7, 7, "minecraft:bookshelf");
  c.fill(3, 9, 3, 6, 9, 3, "minecraft:bookshelf");
  c.facing(5, 1, 5, "minecraft:lectern", "S");
  c.lantern(6, 1, 7);
  c.lantern(5, 5, 5);
  c.lantern(5, 9, 5);
  c.lantern(5, 13, 5);
  c.fill(5, 0, 9, 5, 0, 10, p.path);
  c.flowers([[3, 9], [7, 9]], rng);
  return 0;
}

function blacksmith(c, p, rng) {
  c.fill(2, 0, 2, 8, 0, 8, p.rough);
  c.fill(2, 1, 2, 8, 3, 2, p.rough);
  c.fill(2, 1, 3, 2, 3, 8, p.rough);
  c.fill(8, 1, 3, 8, 3, 8, p.rough);
  c.fill(2, 1, 8, 2, 3, 8, p.log, upright(p.log));
  c.fill(8, 1, 8, 8, 3, 8, p.log, upright(p.log));
  c.fill(1, 4, 1, 9, 4, 9, p.brickSlab, { "minecraft:vertical_half": "bottom" });
  c.set(3, 1, 3, "minecraft:smithing_table");
  c.facing(4, 1, 3, "minecraft:blast_furnace", "S");
  c.facing(5, 1, 3, "minecraft:furnace", "S");
  c.facing(6, 1, 3, "minecraft:anvil", "E");
  c.legacy(7, 1, 3, "minecraft:grindstone", "S", { attachment: "standing" });
  c.facing(7, 1, 5, "minecraft:chest", "W");
  c.lantern(5, 3, 5, true);
  c.fill(5, 0, 9, 5, 0, 10, p.path);
  return 0;
}

function farm(c, p, rng) {
  const crops = rng.shuffle(["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"]);
  for (let z = 1; z <= 9; z++) {
    for (let x = 1; x <= 9; x++) {
      if (z === 5) {
        c.set(x, 0, z, "minecraft:water");
      } else {
        c.set(x, 0, z, "minecraft:farmland", { moisturized_amount: 7 });
        c.set(x, 1, z, z < 5 ? crops[0] : crops[1], { growth: 7 });
      }
    }
  }
  c.walls(0, 0, 10, 10, 1, 1, p.fence);
  c.set(5, 1, 10, "minecraft:air");
  c.set(5, 0, 10, p.path);
  for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) c.lantern(x, 2, z);
  c.set(9, 0, 9, p.ground);
  c.set(9, 1, 9, "minecraft:composter", { composter_fill_level: 0 });
  c.set(1, 0, 9, p.ground);
  c.set(1, 1, 9, "minecraft:hay_block", { pillar_axis: "y" });
  return 0;
}

function park(c, p, rng) {
  c.tree(3, 3, p);
  c.tree(7, 7, p, 5);
  c.fill(7, 0, 2, 9, 0, 4, "minecraft:water");
  c.lampPost(5, 5, p.fence);
  c.stairs(2, 1, 7, p.roofStairs, "W");
  c.stairs(2, 1, 8, p.roofStairs, "W");
  c.fill(5, 0, 6, 5, 0, 10, p.path);
  c.flowers([[1, 6], [3, 9], [6, 1], [9, 6], [8, 9], [1, 1], [4, 6], [6, 3]], rng);
  return 0;
}

// The plaza: town hall, fountain, bell and benches. 25x25, local coords.
function plaza(c, p, rng) {
  const S = 25;
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++) c.set(x, 0, z, (x + z) % 2 ? p.mainRoad : p.accent);

  // fountain
  const f = 12;
  c.fill(f - 3, -2, f - 3, f + 3, -2, f + 3, p.brick);
  c.walls(f - 3, f - 3, f + 3, f + 3, -1, 1, p.brick);
  c.fill(f - 2, -1, f - 2, f + 2, 0, f + 2, "minecraft:water");
  c.fill(f, -1, f, f, 2, f, p.brick);
  c.lantern(f, 3, f);

  // bell on a little pedestal, where villagers gather
  c.set(f, 1, 7, p.brick);
  c.legacy(f, 2, 7, "minecraft:bell", "S", { attachment: "standing", toggle_bit: false });

  // town hall along the north side
  c.fill(5, 0, 0, 19, 0, 5, p.floor);
  c.walls(5, 0, 19, 5, 1, 5, p.brick);
  c.corners(5, 0, 19, 5, 1, 5, p.log);
  for (const x of [7, 9, 15, 17]) {
    c.fill(x, 2, 5, x, 3, 5, "minecraft:glass_pane");
    c.fill(x, 2, 0, x, 3, 0, "minecraft:glass_pane");
  }
  c.door(11, 1, 5, p.door, "S");
  c.door(13, 1, 5, p.door, "S");
  c.set(12, 1, 5, p.log, upright(p.log));
  c.roof(5, 0, 19, 5, 6, p);
  c.facing(12, 1, 1, "minecraft:lectern", "S");
  c.set(10, 1, 1, "minecraft:cartography_table");
  c.facing(14, 1, 1, "minecraft:chest", "S");
  for (const x of [7, 12, 17]) c.lantern(x, 1, 3);

  // benches facing the fountain
  for (const [x, z, d] of [[f - 5, f, "W"], [f - 5, f + 1, "W"], [f + 5, f, "E"], [f + 5, f + 1, "E"],
    [f, f + 5, "S"], [f + 1, f + 5, "S"]]) c.stairs(x, 1, z, p.roofStairs, d);

  // trees in planters and lamp posts in the corners
  for (const [x, z] of [[2, 21], [22, 21]]) {
    c.walls(x - 1, z - 1, x + 1, z + 1, 1, 1, p.brickSlab, { "minecraft:vertical_half": "bottom" });
    c.set(x, 0, z, "minecraft:grass_block");
    c.tree(x, z, p);
  }
  for (const [x, z] of [[1, 7], [23, 7], [7, 23], [17, 23]]) c.lampPost(x, z, p.fence);
  return 0;
}

// ------------------------------------------------------------ the whole city

// Plot (column, row) -> top-left corner in footprint coordinates.
function plotOrigin(j) {
  return 1 + ROAD + j * (PLOT + ROAD);
}

function roadStart(i) {
  return 1 + i * (PLOT + ROAD);
}

// Which way the front door should face so it looks toward the middle.
function plotTurns(jx, jz) {
  if (jz === 0) return 0; // face south
  if (jz === PLOTS - 1) return 2; // face north
  return jx === 0 ? 3 : 1; // face east / west
}

export function planCity(styleName, seed) {
  const rng = makeRng(seed);
  const p = makePalette(styleName);
  const ops = [];
  const name = cityName(rng);

  // roads
  const isMain = (i) => i === 2;
  for (let i = 0; i <= PLOTS; i++) {
    const r0 = roadStart(i);
    const id = isMain(i) ? p.mainRoad : p.path;
    for (let a = r0; a < r0 + ROAD; a++) {
      for (let b = 1; b <= INNER; b++) {
        ops.push({ x: a, y: 0, z: b, id, states: {} });
        ops.push({ x: b, y: 0, z: a, id, states: {} });
      }
    }
  }

  // street lamps at every crossing and halfway along each road
  const lamp = (x, z) => {
    for (let y = 1; y <= 3; y++) ops.push({ x, y, z, id: p.fence, states: {} });
    ops.push({ x, y: 4, z, id: "minecraft:lantern", states: { hanging: false } });
  };
  for (let i = 0; i <= PLOTS; i++) {
    for (let j = 0; j <= PLOTS; j++) {
      const inPlaza = (k) => k >= 1 && k <= 3;
      if (!(inPlaza(i) && inPlaza(j) && i === 2 && j === 2)) lamp(roadStart(i), roadStart(j));
      if (j < PLOTS) {
        const mid = plotOrigin(j) + 5;
        const centreRoad = i === 2 && (j === 1 || j === 2);
        if (!centreRoad) {
          lamp(roadStart(i), mid);
          lamp(mid, roadStart(i));
        }
      }
    }
  }

  // plaza across the middle 2x2 plots
  const pz = plotOrigin(1);
  plaza(new Canvas(ops, pz, pz, 2 * PLOT + ROAD, 0), p, rng);

  // ring of buildings
  const kinds = rng.shuffle(["cottage", "cottage", "cottage", "cottage", "big", "big", "market",
    "library", "blacksmith", "farm", "farm", "park"]);
  const jobs = rng.shuffle(JOBS);
  let jobIndex = 0;
  const nextJob = () => jobs[jobIndex++ % jobs.length];
  let beds = 0;
  let k = 0;
  for (let jz = 0; jz < PLOTS; jz++) {
    for (let jx = 0; jx < PLOTS; jx++) {
      if (jx >= 1 && jx <= 2 && jz >= 1 && jz <= 2) continue;
      const c = new Canvas(ops, plotOrigin(jx), plotOrigin(jz), PLOT, plotTurns(jx, jz));
      const kind = kinds[k++];
      if (kind === "cottage") beds += cottage(c, p, rng, nextJob());
      else if (kind === "big") beds += bigHouse(c, p, rng, nextJob());
      else if (kind === "market") beds += market(c, p, rng, [nextJob(), nextJob()]);
      else if (kind === "library") beds += library(c, p, rng);
      else if (kind === "blacksmith") beds += blacksmith(c, p, rng);
      else if (kind === "farm") beds += farm(c, p, rng);
      else beds += park(c, p, rng);
    }
  }

  // city wall with a gate in the middle of each side
  const last = FOOTPRINT - 1;
  const gate0 = roadStart(2);
  const inGate = (a) => a >= gate0 && a < gate0 + ROAD;
  for (let a = 0; a <= last; a++) {
    for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
      if (inGate(a)) continue;
      for (let y = 1; y <= 3; y++) ops.push({ x, y, z, id: p.brick, states: {} });
      if (a % 6 === 0) ops.push({ x, y: 4, z, id: "minecraft:lantern", states: { hanging: false } });
    }
  }
  for (const a of [gate0 - 1, gate0 + ROAD]) {
    for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
      for (let y = 1; y <= 4; y++) ops.push({ x, y, z, id: p.log, states: upright(p.log) });
      ops.push({ x, y: 5, z, id: "minecraft:lantern", states: { hanging: false } });
    }
  }

  // welcome sign just inside the south gate
  const sign = { x: gate0 - 2, y: 1, z: last - 1 };
  ops.push({ ...sign, id: "minecraft:standing_sign", states: { ground_sign_direction: SIGN16.S } });

  // where new villagers appear: around the fountain
  const f = pz + 12;
  const spawns = [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, -6], [0, 6], [-6, 0], [6, 0]].map(([dx, dz]) => ({
    x: f + dx,
    y: 1,
    z: f + dz,
  }));

  // a good place to stand and watch: on the plaza, south of the fountain
  const viewpoint = { x: f, y: 1, z: f + 7 };

  return { name, style: p, ops, beds, sign, spawns, viewpoint };
}
