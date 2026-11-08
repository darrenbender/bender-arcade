// Dragon arena planner: works out every block of the arena as a list of
// placements. No Minecraft imports, so it can be tested outside the game.
//
// Seen from above inside a 41x41 square: a round island of end stone with an
// end brick rim and end rod lights, six obsidian pillars with a ladder up each
// one (an End crystal sits on top), a ring path, and the dragon altar in the
// middle on an obsidian base where the dragon lands.
// Coordinates: x/z run 0..40 from the north-west corner; y = 0 is the ground.

export const ARENA_SIZE = 41;
export const ALTAR_ID = "bender:dragon_altar";
const C = 20; // middle
const ISLAND = 19.5;
const PILLAR_RING = 13;
const PILLAR_HEIGHTS = [7, 9, 11, 8, 10, 12];
const LADDER_FACING = { N: 2, S: 3, W: 4, E: 5 }; // which way the ladder faces (away from its wall)

export function planArena() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const dist = (x, z) => Math.hypot(x - C, z - C);

  // the island floor, its rim and the ring path
  for (let x = 0; x < ARENA_SIZE; x++) {
    for (let z = 0; z < ARENA_SIZE; z++) {
      const d = dist(x, z);
      if (d > ISLAND) continue;
      const rim = d > ISLAND - 1.2;
      const path = Math.abs(d - 7.5) < 0.6;
      set(x, 0, z, rim || path ? "minecraft:end_bricks" : "minecraft:end_stone");
      set(x, -1, z, "minecraft:end_stone");
    }
  }
  // lights around the rim
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.round(C + Math.cos(a) * (ISLAND - 0.6));
    const z = Math.round(C + Math.sin(a) * (ISLAND - 0.6));
    set(x, 1, z, "minecraft:end_rod", { facing_direction: 1 });
  }

  // six pillars, each with a ladder on the side facing the middle
  const pillars = [];
  PILLAR_HEIGHTS.forEach((h, i) => {
    const a = (i / PILLAR_HEIGHTS.length) * Math.PI * 2 + Math.PI / 6;
    const px = Math.round(C + Math.cos(a) * PILLAR_RING);
    const pz = Math.round(C + Math.sin(a) * PILLAR_RING);
    for (let y = 0; y <= h; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const crying = y > 0 && y < h && (dx + dz + y) % 5 === 0;
          set(px + dx, y, pz + dz, crying ? "minecraft:crying_obsidian" : "minecraft:obsidian");
        }
      }
    }
    // ladder on the face nearest the middle
    const toX = C - px;
    const toZ = C - pz;
    let side;
    if (Math.abs(toX) >= Math.abs(toZ)) side = toX > 0 ? "E" : "W";
    else side = toZ > 0 ? "S" : "N";
    const off = { N: [0, -2], S: [0, 2], E: [2, 0], W: [-2, 0] }[side];
    for (let y = 1; y <= h; y++) set(px + off[0], y, pz + off[1], "minecraft:ladder", { facing_direction: LADDER_FACING[side] });
    pillars.push({ x: px, y: h + 1, z: pz, height: h });
  });

  // the altar: an obsidian base with the altar block in the middle
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      set(C + dx, 0, C + dz, Math.abs(dx) === 2 || Math.abs(dz) === 2 ? "minecraft:obsidian" : "minecraft:crying_obsidian");
    }
  }
  set(C, 1, C, ALTAR_ID);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) set(C + dx, 1, C + dz, "minecraft:end_rod", { facing_direction: 1 });

  return {
    ops,
    pillars,
    altar: { x: C, y: 1, z: C },
    // where the dragon lands: on the altar base, facing the south edge
    perch: { x: C + 0.5, y: 1, z: C + 0.5 },
    // where players are put while it builds: the south edge, looking at the altar
    viewpoint: { x: C, y: 1, z: ARENA_SIZE - 3 },
    radius: ISLAND,
  };
}
