// The Micro Realm: what you see when you shrink all the way down. Glowing floating islands
// joined by light bridges to a central platform with the exit portal, see-through bubbles,
// crystal spires and Micro Crystals to collect. Positions are relative to the realm's
// center (REALM in sizes.js), y = 0 is the central platform. The same realm every time.
// No Minecraft imports, so it can be checked outside the game.

export const PORTAL_ID = "bender:micro_portal";
export const CRYSTAL_ID = "bender:micro_crystal_cluster";

/** A small repeatable random number generator, so the realm looks the same every time. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISLAND_COLORS = [
  ["minecraft:purple_concrete", "minecraft:magenta_concrete"],
  ["minecraft:cyan_concrete", "minecraft:light_blue_concrete"],
  ["minecraft:lime_concrete", "minecraft:green_concrete"],
  ["minecraft:pink_concrete", "minecraft:magenta_concrete"],
  ["minecraft:orange_concrete", "minecraft:yellow_concrete"],
];
const BUBBLES = ["minecraft:light_blue_stained_glass", "minecraft:magenta_stained_glass", "minecraft:lime_stained_glass", "minecraft:pink_stained_glass"];

export function planRealm() {
  const ops = [];
  const set = (x, y, z, id, states = {}) => ops.push({ x, y, z, id, states });
  const r = rng(20261126);

  // ---- the central platform, with the exit portal in the middle
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) {
      const d = Math.hypot(x, z);
      if (d > 6.4) continue;
      set(x, -1, z, "minecraft:prismarine_bricks");
      set(x, 0, z, d > 5.4 ? "minecraft:sea_lantern" : (x + z) % 2 ? "minecraft:dark_prismarine" : "minecraft:prismarine");
    }
  }
  const portal = { x: 0, y: 1, z: 0 };
  set(0, 1, 0, PORTAL_ID);
  for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) set(x, 1, z, "minecraft:end_rod", { facing_direction: 1 });

  // ---- islands in a ring around the middle, at different heights
  const islands = [];
  const crystals = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const dist = 20 + r() * 18;
    const c = { x: Math.round(Math.cos(a) * dist), y: Math.round(-6 + r() * 14), z: Math.round(Math.sin(a) * dist), rad: 3 + Math.floor(r() * 3) };
    islands.push(c);
    const [top, side] = ISLAND_COLORS[i % ISLAND_COLORS.length];
    // a rounded blob, flat on top, hanging down underneath
    for (let x = -c.rad; x <= c.rad; x++) {
      for (let z = -c.rad; z <= c.rad; z++) {
        const flat = Math.hypot(x, z);
        if (flat > c.rad + 0.4) continue;
        const depth = Math.max(1, Math.round((c.rad - flat) * 1.3 + 1));
        for (let y = 0; y >= -depth; y--) {
          const id = y === 0 ? top : (y === -depth && (x + z) % 3 === 0) ? "minecraft:shroomlight" : side;
          set(c.x + x, c.y + y, c.z + z, id);
        }
      }
    }
    // glowing spots on top, a crystal spire, and Micro Crystals to tap
    set(c.x + 1, c.y, c.z - 1, "minecraft:sea_lantern");
    set(c.x - 1, c.y, c.z + 1, "minecraft:sea_lantern");
    const h = 3 + Math.floor(r() * 4);
    for (let y = 1; y <= h; y++) set(c.x, c.y + y, c.z, "minecraft:amethyst_block");
    set(c.x, c.y + h + 1, c.z, "minecraft:end_rod", { facing_direction: 1 });
    for (const [dx, dz] of [[2, 0], [-2, 1]]) {
      if (Math.hypot(dx, dz) <= c.rad - 0.5) {
        set(c.x + dx, c.y + 1, c.z + dz, CRYSTAL_ID);
        crystals.push({ x: c.x + dx, y: c.y + 1, z: c.z + dz });
      }
    }
    // a glowing bridge from the platform out to the island
    const steps = Math.ceil(dist);
    for (let s = 6; s <= steps - c.rad + 1; s++) {
      const t = s / dist;
      const bx = Math.round(Math.cos(a) * s);
      const bz = Math.round(Math.sin(a) * s);
      const by = Math.round(c.y * t);
      set(bx, by, bz, s % 4 === 0 ? "minecraft:sea_lantern" : "minecraft:light_blue_stained_glass");
    }
  }

  // ---- bubbles floating above, hollow, with a glow in the middle
  const bubbles = [];
  for (let i = 0; i < 7; i++) {
    const b = { x: Math.round((r() - 0.5) * 70), y: Math.round(12 + r() * 16), z: Math.round((r() - 0.5) * 70), rad: 2 + Math.floor(r() * 2) };
    bubbles.push(b);
    const glass = BUBBLES[i % BUBBLES.length];
    for (let x = -b.rad; x <= b.rad; x++) {
      for (let y = -b.rad; y <= b.rad; y++) {
        for (let z = -b.rad; z <= b.rad; z++) {
          const d = Math.hypot(x, y, z);
          if (d <= b.rad + 0.4 && d > b.rad - 0.6) set(b.x + x, b.y + y, b.z + z, glass);
        }
      }
    }
    set(b.x, b.y, b.z, "minecraft:shroomlight");
  }

  // the platform is placed first, so there's somewhere to stand while the rest appears
  return { ops, portal, crystals, islands, bubbles, spawn: { x: 1.5, y: 1, z: 3.5 } };
}
