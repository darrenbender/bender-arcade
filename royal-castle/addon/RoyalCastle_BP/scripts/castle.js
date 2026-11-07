// Castle planner: works out every block of the castle as a list of placements.
// No Minecraft imports, so it can be tested outside the game.
//
// Seen from above (north at the top) inside a 61x61 square:
//   moat with a stone rim, then curtain walls with a walkway and battlements,
//   a tower on each corner, a gatehouse with a portcullis on the south side,
//   a drawbridge over the moat, a three-floor keep (great hall with throne,
//   royal bedroom, library, roof with a flag) and a treasure vault under it,
//   and a courtyard with stables, a blacksmith, barracks, a kitchen, a well,
//   a garden and a training yard.
// Coordinates: x/z run 0..60 from the north-west corner; y = 0 is the ground.

export const CASTLE_SIZE = 61;
export const GATE_ID = "bender:castle_gate";

const CARDINAL = { N: "north", E: "east", S: "south", W: "west" };
const LEGACY = { S: 0, W: 1, N: 2, E: 3 }; // beds, grindstones
const WEIRDO = { E: 0, W: 1, S: 2, N: 3 }; // stairs: side with the tall part
const FACING = { N: 2, S: 3, W: 4, E: 5 }; // ladders

const NAME_A = ["Sun", "Oak", "Star", "Bright", "Silver", "Golden", "Dragon", "Lion", "Rose", "Thunder", "Crystal", "Maple"];
const NAME_B = ["peak", "shield", "haven", "water", "crest", "hold", "spire", "mere", "gate", "wood", "fall", "keep"];

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return { next, pick: (list) => list[Math.floor(next() * list.length)] };
}

export function castleName(seed) {
  const rng = makeRng(seed);
  const a = rng.pick(NAME_A);
  return `Castle ${a}${rng.pick(NAME_B)}`;
}

export function planCastle(seed) {
  const rng = makeRng(seed);
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const fill = (x1, y1, z1, x2, y2, z2, id, states) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, id, states);
  };
  // castle stone: mostly stone bricks with some cracked and mossy ones
  const stone = () => {
    const r = rng.next();
    return r < 0.1 ? "minecraft:cracked_stone_bricks" : r < 0.2 ? "minecraft:mossy_stone_bricks" : "minecraft:stone_bricks";
  };
  const wall = (x1, y1, z1, x2, y2, z2) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, stone());
  };
  const ring = (x1, z1, x2, z2, y1, y2, maker) => {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        maker(x, y, z1);
        maker(x, y, z2);
      }
      for (let z = z1 + 1; z < z2; z++) {
        maker(x1, y, z);
        maker(x2, y, z);
      }
    }
  };
  const battlements = (x1, z1, x2, z2, y) => ring(x1, z1, x2, z2, y, y, (x, yy, z) => {
    if ((x + z) % 2 === 0) set(x, yy, z, stone());
  });
  const lantern = (x, y, z, hanging = false) => set(x, y, z, "minecraft:lantern", { hanging });
  const ladder = (x, y1, y2, z, facing) => {
    for (let y = y1; y <= y2; y++) set(x, y, z, "minecraft:ladder", { facing_direction: FACING[facing] });
  };
  const stairs = (x, y, z, id, tall) => set(x, y, z, id, { weirdo_direction: WEIRDO[tall], upside_down_bit: false });
  const bed = (x, y, z, headDir) => {
    const step = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[headDir];
    set(x, y, z, "minecraft:bed", { direction: LEGACY[headDir], head_piece_bit: false, occupied_bit: false });
    set(x + step[0], y, z + step[1], "minecraft:bed", { direction: LEGACY[headDir], head_piece_bit: true, occupied_bit: false });
  };
  const facing = (x, y, z, id, dir, extra = {}) => set(x, y, z, id, { "minecraft:cardinal_direction": CARDINAL[dir], ...extra });
  const gate = (x, y, z) => set(x, y, z, GATE_ID, { "bender:open": false });
  const flowers = ["minecraft:poppy", "minecraft:dandelion", "minecraft:cornflower", "minecraft:allium", "minecraft:oxeye_daisy", "minecraft:red_tulip"];
  const L = CASTLE_SIZE - 1;
  let beds = 0;

  // ---- moat: a stone rim at the edge, water, then a grassy bank
  for (let a = 0; a <= L; a++) {
    for (let b = 0; b <= L; b++) {
      const edge = Math.min(a, b, L - a, L - b);
      if (edge === 0) {
        set(a, 0, b, "minecraft:stone_bricks");
        set(a, -1, b, "minecraft:stone_bricks");
      } else if (edge <= 3) {
        set(a, -2, b, "minecraft:stone_bricks");
        set(a, -1, b, "minecraft:water");
        set(a, 0, b, "minecraft:water");
      }
    }
  }

  // ---- curtain walls (2 thick, top at y 9) with battlements and lamps
  const W1 = 6, W2 = L - 6;
  ring(W1, W1, W2, W2, 1, 9, (x, y, z) => set(x, y, z, stone()));
  ring(W1 + 1, W1 + 1, W2 - 1, W2 - 1, 1, 9, (x, y, z) => set(x, y, z, stone()));
  battlements(W1, W1, W2, W2, 10);
  ring(W1 + 1, W1 + 1, W2 - 1, W2 - 1, 10, 10, (x, y, z) => {
    if ((x + z) % 8 === 0) lantern(x, y, z);
  });
  // ladders up to the wall walk
  ladder(14, 1, 9, W2 - 2, "N");
  ladder(46, 1, 9, W2 - 2, "N");
  ladder(14, 1, 9, W1 + 2, "S");
  ladder(46, 1, 9, W1 + 2, "S");

  // ---- corner towers: 9x9, hollow, three floors, ladder to the top
  // openings: [x1, z1, x2, z2] wall-walk doorways into the tower at y 10..11
  const tower = (x0, z0, door, ladderAt, ladderFacing, openings) => {
    const x1 = x0 + 8, z1 = z0 + 8;
    ring(x0, z0, x1, z1, 1, 15, (x, y, z) => set(x, y, z, stone()));
    fill(x0 + 1, 0, z0 + 1, x1 - 1, 0, z1 - 1, "minecraft:spruce_planks");
    fill(x0 + 1, 1, z0 + 1, x1 - 1, 14, z1 - 1, "minecraft:air"); // clear out the curtain wall inside
    // floors line up with the wall walk (you stand at y 10 on both)
    for (const y of [4, 9, 15]) fill(x0 + 1, y, z0 + 1, x1 - 1, y, z1 - 1, "minecraft:spruce_planks");
    battlements(x0, z0, x1, z1, 16);
    for (const y of [2, 7, 12]) {
      for (const [x, z] of [[x0 + 4, z0], [x0 + 4, z1], [x0, z0 + 4], [x1, z0 + 4]]) set(x, y, z, "minecraft:iron_bars");
    }
    fill(door[0], 1, door[1], door[0], 2, door[1], "minecraft:air");
    for (const [a, b, c, d] of openings) fill(a, 10, b, c, 11, d, "minecraft:air");
    ladder(ladderAt[0], 1, 15, ladderAt[1], ladderFacing);
    for (const y of [1, 5, 10]) lantern(x0 + 4, y, z0 + 4);
    lantern(x0 + 4, 16, z0 + 4);
  };
  tower(3, 3, [11, 9], [4, 4], "S", [[11, 6, 11, 7], [6, 11, 7, 11]]);
  tower(49, 3, [49, 9], [56, 4], "S", [[49, 6, 49, 7], [53, 11, 54, 11]]);
  tower(3, 49, [11, 51], [4, 56], "N", [[11, 53, 11, 54], [6, 49, 7, 49]]);
  tower(49, 49, [49, 51], [56, 56], "N", [[49, 53, 49, 54], [53, 49, 54, 49]]);

  // ---- gatehouse on the south wall, with a portcullis and a drawbridge
  const G1 = 24, G2 = 36, GZ1 = 49, GZ2 = 56;
  wall(G1, 1, GZ1, G2, 12, GZ2);
  fill(28, 1, GZ1, 32, 6, GZ2, "minecraft:air"); // the gate passage
  fill(G1, 10, 53, G2, 11, 54, "minecraft:air"); // the wall walk goes through the gatehouse
  lantern(30, 10, 53);
  fill(28, 0, GZ1, 32, 0, GZ2, "minecraft:stone_bricks");
  battlements(G1, GZ1, G2, GZ2, 13);
  for (const x of [26, 34]) lantern(x, 13, 52);
  for (let x = 28; x <= 32; x++) for (let y = 1; y <= 6; y++) gate(x, y, GZ2 - 1);
  for (const z of [GZ1 + 1, GZ2 - 3]) for (const x of [28, 32]) lantern(x, 6, z, true);
  // drawbridge over the moat
  fill(28, 0, 57, 32, 0, 59, "minecraft:spruce_planks");
  fill(28, -1, 57, 32, -1, 59, "minecraft:spruce_planks");
  for (const x of [27, 33]) {
    fill(x, 1, 57, x, 1, 59, "minecraft:spruce_fence");
    lantern(x, 2, 59);
  }
  set(27, 0, L, "minecraft:stone_bricks");
  set(33, 0, L, "minecraft:stone_bricks");

  // ---- the keep: x 18..42, z 10..32, floors at y 0, 6, 12 and roof at 18
  const K1 = 18, K2 = 42, KZ1 = 10, KZ2 = 32;
  fill(K1, 0, KZ1, K2, 0, KZ2, "minecraft:polished_andesite");
  ring(K1, KZ1, K2, KZ2, 1, 18, (x, y, z) => set(x, y, z, stone()));
  for (const y of [6, 12]) fill(K1 + 1, y, KZ1 + 1, K2 - 1, y, KZ2 - 1, "minecraft:spruce_planks");
  fill(K1, 18, KZ1, K2, 18, KZ2, "minecraft:stone_bricks");
  battlements(K1, KZ1, K2, KZ2, 19);
  // corner turrets on the roof
  for (const [x, z] of [[K1, KZ1], [K2 - 2, KZ1], [K1, KZ2 - 2], [K2 - 2, KZ2 - 2]]) {
    wall(x, 19, z, x + 2, 22, z + 2);
    lantern(x + 1, 23, z + 1);
  }
  // flag on a pole in the middle of the roof
  fill(30, 19, 21, 30, 27, 21, "minecraft:spruce_fence");
  fill(31, 25, 21, 34, 27, 21, "minecraft:red_wool");
  set(32, 26, 21, "minecraft:yellow_wool");
  set(33, 26, 21, "minecraft:yellow_wool");
  // windows on every floor
  for (const y of [3, 4, 9, 10, 15, 16]) {
    for (const x of [22, 26, 34, 38]) {
      set(x, y, KZ1, "minecraft:glass_pane");
      set(x, y, KZ2, "minecraft:glass_pane");
    }
    for (const z of [15, 21, 27]) {
      set(K1, y, z, "minecraft:glass_pane");
      set(K2, y, z, "minecraft:glass_pane");
    }
  }
  // grand archway into the great hall
  fill(29, 1, KZ2, 31, 4, KZ2, "minecraft:air");
  lantern(28, 4, KZ2 + 1);
  lantern(32, 4, KZ2 + 1);
  // ladder in the north-east corner, all the way to the roof
  ladder(K2 - 1, 1, 18, KZ1 + 1, "S");

  // great hall: red carpet, throne on a dais, banners, feast tables
  fill(29, 1, KZ1 + 4, 31, 1, KZ2 - 1, "minecraft:red_carpet");
  fill(27, 1, KZ1 + 1, 33, 1, KZ1 + 3, "minecraft:smooth_quartz");
  set(30, 2, KZ1 + 2, "minecraft:gold_block"); // throne seat
  fill(30, 3, KZ1 + 1, 30, 5, KZ1 + 1, "minecraft:gold_block"); // throne back
  set(29, 2, KZ1 + 1, "minecraft:gold_block");
  set(31, 2, KZ1 + 1, "minecraft:gold_block");
  set(29, 3, KZ1 + 2, "minecraft:spruce_fence");
  set(31, 3, KZ1 + 2, "minecraft:spruce_fence");
  for (const x of [22, 26, 34, 38]) {
    fill(x, 2, KZ1 + 1, x, 4, KZ1 + 1, "minecraft:red_wool");
    set(x, 3, KZ1 + 1, "minecraft:yellow_wool");
  }
  for (const tx of [23, 37]) {
    fill(tx, 1, 16, tx, 1, 27, "minecraft:dark_oak_slab", { "minecraft:vertical_half": "top" });
    for (let z = 16; z <= 27; z += 2) {
      stairs(tx - 1, 1, z, "minecraft:spruce_stairs", "W");
      stairs(tx + 1, 1, z, "minecraft:spruce_stairs", "E");
    }
    set(tx, 2, 19, "minecraft:cake");
    set(tx, 2, 24, "minecraft:cake");
  }
  for (const x of [22, 30, 38]) for (const z of [14, 21, 28]) lantern(x, 5, z, true);

  // treasure vault under the great hall (a ladder goes down through the floor)
  wall(21, -5, 14, 27, -1, 20);
  fill(22, -4, 15, 26, -1, 19, "minecraft:air");
  fill(22, -5, 15, 26, -5, 19, "minecraft:gold_block");
  ladder(22, -4, 0, 15, "E");
  const vault = [{ x: 24, y: -4, z: 19 }, { x: 25, y: -4, z: 19 }, { x: 26, y: -4, z: 17 }, { x: 26, y: -4, z: 16 }];
  for (const c of vault) facing(c.x, c.y, c.z, "minecraft:chest", c.z === 19 ? "N" : "W");
  lantern(24, -4, 16);
  lantern(24, -1, 17, true);

  // second floor: royal bedroom
  fill(K1 + 1, 7, KZ1 + 1, K2 - 1, 7, KZ2 - 1, "minecraft:red_carpet");
  fill(27, 7, KZ1 + 4, 33, 7, KZ1 + 8, "minecraft:yellow_carpet");
  bed(28, 7, KZ1 + 2, "N");
  bed(32, 7, KZ1 + 2, "N");
  beds += 2;
  fill(K1 + 1, 7, 20, K1 + 1, 9, 26, "minecraft:bookshelf");
  set(24, 7, 23, "minecraft:enchanting_table");
  for (const x of [34, 35, 36]) facing(x, 7, KZ2 - 1, "minecraft:chest", "N");
  for (const x of [22, 30, 38]) for (const z of [14, 21, 28]) lantern(x, 11, z, true);
  set(K2 - 1, 6, KZ1 + 1, "minecraft:ladder", { facing_direction: FACING.S });
  set(K2 - 1, 12, KZ1 + 1, "minecraft:ladder", { facing_direction: FACING.S });

  // third floor: library and map room
  fill(K1 + 1, 13, KZ1 + 1, K1 + 1, 15, KZ2 - 1, "minecraft:bookshelf");
  fill(K2 - 1, 13, KZ1 + 3, K2 - 1, 15, KZ2 - 1, "minecraft:bookshelf");
  set(30, 13, 20, "minecraft:cartography_table");
  facing(30, 13, 23, "minecraft:lectern", "S", { powered_bit: false });
  for (const x of [22, 30, 38]) for (const z of [14, 21, 28]) lantern(x, 17, z, true);
  ladder(K2 - 1, 1, 18, KZ1 + 1, "S"); // again, after carpets and shelves

  // ---- stables (west courtyard)
  fill(9, 0, 36, 17, 0, 46, "minecraft:grass_path");
  wall(9, 1, 36, 9, 4, 46);
  wall(10, 1, 36, 17, 4, 36);
  wall(10, 1, 46, 17, 4, 46);
  fill(9, 5, 36, 17, 5, 46, "minecraft:spruce_slab", { "minecraft:vertical_half": "bottom" });
  for (const z of [39, 43]) fill(10, 1, z, 14, 1, z, "minecraft:spruce_fence");
  for (const z of [37, 41, 45]) set(10, 1, z, "minecraft:hay_block", { pillar_axis: "y" });
  set(10, 1, 38, "minecraft:cauldron");
  set(10, 1, 44, "minecraft:cauldron");
  for (const z of [38, 44]) lantern(13, 4, z, true);
  fill(17, 1, 37, 17, 4, 37, "minecraft:spruce_log", { pillar_axis: "y" });
  fill(17, 1, 45, 17, 4, 45, "minecraft:spruce_log", { pillar_axis: "y" });

  // ---- blacksmith (east courtyard)
  fill(43, 0, 36, 51, 0, 44, "minecraft:cobblestone");
  wall(51, 1, 36, 51, 4, 44);
  wall(43, 1, 36, 50, 4, 36);
  wall(43, 1, 44, 50, 4, 44);
  fill(43, 5, 36, 51, 5, 44, "minecraft:stone_brick_slab", { "minecraft:vertical_half": "bottom" });
  set(50, 1, 38, "minecraft:smithing_table");
  facing(50, 1, 39, "minecraft:anvil", "W");
  set(50, 1, 40, "minecraft:grindstone", { attachment: "standing", direction: LEGACY.W });
  facing(50, 1, 41, "minecraft:blast_furnace", "W");
  facing(50, 1, 42, "minecraft:chest", "W");
  lantern(47, 4, 40, true);

  // ---- kitchen (west of the keep) and barracks (east of the keep)
  const hut = (x1, z1, x2, z2, doorSide) => {
    fill(x1, 0, z1, x2, 0, z2, "minecraft:spruce_planks");
    ring(x1, z1, x2, z2, 1, 4, (x, y, z) => set(x, y, z, stone()));
    fill(x1, 5, z1, x2, 5, z2, "minecraft:spruce_slab", { "minecraft:vertical_half": "bottom" });
    const midZ = Math.floor((z1 + z2) / 2);
    const dx = doorSide === "E" ? x2 : x1;
    fill(dx, 1, midZ, dx, 2, midZ, "minecraft:air");
    for (const z of [z1 + 2, z2 - 2]) set(dx, 3, z, "minecraft:glass_pane");
    lantern(Math.floor((x1 + x2) / 2), 4, midZ, true);
  };
  hut(9, 12, 16, 26, "E");
  facing(10, 1, 13, "minecraft:smoker", "S");
  facing(11, 1, 13, "minecraft:furnace", "S");
  set(12, 1, 13, "minecraft:crafting_table");
  for (const z of [16, 17, 18]) set(10, 1, z, "minecraft:barrel", { facing_direction: 1, open_bit: false });
  set(13, 1, 17, "minecraft:cake");
  bed(10, 1, 22, "N");
  bed(12, 1, 22, "N");
  beds += 2;
  hut(44, 12, 51, 26, "W");
  for (const z of [14, 17, 20, 23]) {
    bed(50, 1, z, "W");
    beds += 1;
  }
  set(45, 1, 13, "minecraft:fletching_table");

  // ---- well in the middle of the courtyard
  wall(28, 0, 38, 32, 1, 42);
  fill(29, -2, 39, 31, -2, 41, "minecraft:stone_bricks");
  fill(29, -1, 39, 31, 1, 41, "minecraft:water");
  fill(29, 1, 39, 31, 1, 41, "minecraft:air");
  for (const [x, z] of [[28, 38], [32, 38], [28, 42], [32, 42]]) fill(x, 2, z, x, 4, z, "minecraft:spruce_fence");
  fill(28, 5, 38, 32, 5, 42, "minecraft:spruce_slab", { "minecraft:vertical_half": "bottom" });
  lantern(30, 4, 40, true);

  // ---- training yard (targets) and a flower garden
  for (const x of [37, 39, 41]) {
    set(x, 1, 46, "minecraft:spruce_fence");
    set(x, 2, 46, "minecraft:target");
  }
  set(36, 1, 42, "minecraft:hay_block", { pillar_axis: "y" });
  set(42, 1, 42, "minecraft:hay_block", { pillar_axis: "y" });
  for (let i = 0; i < 18; i++) {
    const x = 19 + Math.floor(rng.next() * 6);
    const z = 37 + Math.floor(rng.next() * 9);
    set(x, 0, z, "minecraft:grass_block");
    set(x, 1, z, rng.pick(flowers));
  }
  // courtyard lamp posts
  for (const [x, z] of [[24, 36], [36, 36], [24, 47], [36, 47], [20, 34], [40, 34]]) {
    fill(x, 1, z, x, 3, z, "minecraft:spruce_fence");
    lantern(x, 4, z);
  }

  // welcome sign by the drawbridge
  const sign = { x: 26, y: 1, z: 58 };
  set(26, 0, 58, "minecraft:stone_bricks");
  set(sign.x, sign.y, sign.z, "minecraft:standing_sign", { ground_sign_direction: 0 });

  return {
    ops,
    beds,
    name: castleName(seed),
    sign,
    vault,
    throne: { x: 30.5, y: 3, z: KZ1 + 2.5 },
    viewpoint: { x: 30, y: 1, z: 46 },
    spawns: {
      villagers: [[26, 35], [34, 35], [26, 44], [34, 44], [22, 40], [38, 40]].map(([x, z]) => ({ x: x + 0.5, y: 1, z: z + 0.5 })),
      guards: [{ x: 27.5, y: 1, z: 47.5 }, { x: 33.5, y: 1, z: 47.5 }],
      horses: [{ x: 12.5, y: 1, z: 41.5 }, { x: 12.5, y: 1, z: 45 }],
      cats: [{ x: 30.5, y: 1, z: 34.5 }],
    },
  };
}
