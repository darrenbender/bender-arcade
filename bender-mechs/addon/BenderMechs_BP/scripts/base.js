// Mech base planner: works out every block of the base as a list of placements.
// No Minecraft imports, so it can be tested outside the game.
//
// Seen from above (north at the top), the 27x27 compound has:
//   - a building with a hangar (big sliding door) and a lab
//   - a landing pad in front for Bender Air planes
//   - a fence with a gate, and lamps
// Coordinates: x/z run 0..26 from the north-west corner; y = 0 is the ground.

export const BASE_SIZE = 27;
export const DOOR_ID = "bender:sliding_door";

const SOUTH = "south";

export function planBase() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const fill = (x1, y1, z1, x2, y2, z2, id, states) => {
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++)
        for (let z = z1; z <= z2; z++) set(x, y, z, id, states);
  };
  const door = (x, y, z) => set(x, y, z, DOOR_ID, { "bender:open": false });
  const last = BASE_SIZE - 1;

  // ---- fence with a gate on the south side, and lamp posts
  for (let a = 0; a <= last; a++) {
    for (const [x, z] of [[a, 0], [a, last], [0, a], [last, a]]) {
      const gate = z === last && x >= 11 && x <= 15;
      if (gate) continue;
      if (a % 6 === 0) {
        fill(x, 1, z, x, 2, z, "minecraft:gray_concrete");
        set(x, 3, z, "minecraft:lantern", { hanging: false });
      } else {
        fill(x, 1, z, x, 2, z, "minecraft:iron_bars");
      }
    }
  }
  for (const x of [10, 16]) {
    fill(x, 1, last, x, 3, last, "minecraft:gray_concrete");
    set(x, 4, last, "minecraft:lantern", { hanging: false });
  }

  // ---- main building: x 3..23, z 3..16, walls up to y 7, roof at y 8
  const X1 = 3, X2 = 23, Z1 = 3, Z2 = 16, TOP = 7;
  fill(X1, 0, Z1, X2, 0, Z2, "minecraft:polished_andesite");
  for (let y = 1; y <= TOP; y++) {
    const band = y === 4 || y === 5;
    for (let x = X1; x <= X2; x++) {
      for (const z of [Z1, Z2]) {
        const corner = x === X1 || x === X2;
        set(x, y, z, corner ? "minecraft:gray_concrete" : band && x % 3 !== 0 ? "minecraft:cyan_stained_glass" : "minecraft:light_gray_concrete");
      }
    }
    for (let z = Z1 + 1; z < Z2; z++) {
      for (const x of [X1, X2]) set(x, y, z, band && z % 3 !== 0 ? "minecraft:cyan_stained_glass" : "minecraft:light_gray_concrete");
    }
  }
  // roof with a grid of lights
  for (let x = X1; x <= X2; x++) {
    for (let z = Z1; z <= Z2; z++) {
      const edge = x === X1 || x === X2 || z === Z1 || z === Z2;
      const light = !edge && (x - X1) % 4 === 2 && (z - Z1) % 4 === 2;
      set(x, TOP + 1, z, edge ? "minecraft:gray_concrete" : light ? "minecraft:sea_lantern" : "minecraft:white_concrete");
    }
  }

  // ---- hangar (west side): big 6x4 sliding door, hazard stripes, tool wall
  fill(6, 1, Z2, 11, 4, Z2, "minecraft:air");
  for (let x = 6; x <= 11; x++) for (let y = 1; y <= 4; y++) door(x, y, Z2);
  for (let x = 5; x <= 12; x++) {
    for (const z of [6, 14]) set(x, 0, z, (x % 2 ? "minecraft:yellow_concrete" : "minecraft:black_concrete"));
  }
  for (let z = 7; z <= 13; z++) {
    for (const x of [5, 12]) set(x, 0, z, (z % 2 ? "minecraft:yellow_concrete" : "minecraft:black_concrete"));
  }
  set(5, 1, 4, "minecraft:crafting_table");
  set(6, 1, 4, "minecraft:smithing_table");
  set(7, 1, 4, "minecraft:anvil", { "minecraft:cardinal_direction": SOUTH });
  set(8, 1, 4, "minecraft:grindstone", { attachment: "standing", direction: 0 });
  set(9, 1, 4, "minecraft:chest", { "minecraft:cardinal_direction": SOUTH });
  set(10, 1, 4, "minecraft:chest", { "minecraft:cardinal_direction": SOUTH });
  set(11, 1, 4, "minecraft:blast_furnace", { "minecraft:cardinal_direction": SOUTH });

  // ---- wall between hangar and lab, with a sliding doorway
  fill(14, 1, Z1 + 1, 14, TOP, Z2 - 1, "minecraft:light_gray_concrete");
  for (let z = 9; z <= 10; z++) for (let y = 1; y <= 2; y++) door(14, y, z);

  // ---- lab (east side): computers, books, potions, a bed
  for (let y = 1; y <= 2; y++) door(18, y, Z2), door(19, y, Z2);
  fill(15, 1, 4, 22, 1, 4, "minecraft:polished_blackstone");
  for (let x = 15; x <= 22; x++) {
    const frame = x === 15 || x === 22 || x === 18 || x === 19;
    fill(x, 2, 4, x, 3, 4, frame ? "minecraft:gray_concrete" : "minecraft:light_blue_stained_glass");
  }
  fill(22, 1, 6, 22, 2, 12, "minecraft:bookshelf");
  set(20, 1, 9, "minecraft:enchanting_table");
  set(16, 1, 7, "minecraft:lectern", { "minecraft:cardinal_direction": SOUTH, powered_bit: false });
  set(16, 1, 11, "minecraft:brewing_stand");
  set(21, 1, 14, "minecraft:chest", { "minecraft:cardinal_direction": "west" });
  set(15, 1, 14, "minecraft:bed", { direction: 0, head_piece_bit: false, occupied_bit: false });
  set(15, 1, 15, "minecraft:bed", { direction: 0, head_piece_bit: true, occupied_bit: false });

  // ---- landing pad in front, with a big H and corner lights
  fill(7, 0, 19, 19, 0, 25, "minecraft:gray_concrete");
  for (let x = 7; x <= 19; x++) for (const z of [19, 25]) set(x, 0, z, "minecraft:yellow_concrete");
  for (let z = 19; z <= 25; z++) for (const x of [7, 19]) set(x, 0, z, "minecraft:yellow_concrete");
  fill(11, 0, 20, 11, 0, 24, "minecraft:white_concrete");
  fill(15, 0, 20, 15, 0, 24, "minecraft:white_concrete");
  fill(12, 0, 22, 14, 0, 22, "minecraft:white_concrete");
  for (const [x, z] of [[7, 19], [19, 19], [7, 25], [19, 25]]) set(x, 0, z, "minecraft:sea_lantern");

  // welcome sign by the gate
  const sign = { x: 9, y: 1, z: last - 1 };
  set(sign.x, sign.y, sign.z, "minecraft:standing_sign", { ground_sign_direction: 0 });

  return {
    ops,
    sign,
    viewpoint: { x: 13, y: 1, z: 18 },
    spawns: {
      mech: { x: 8.5, y: 1, z: 9.5 },
      bike: { x: 11.5, y: 1, z: 12.5 },
      bot: { x: 18.5, y: 1, z: 11.5 },
    },
  };
}
