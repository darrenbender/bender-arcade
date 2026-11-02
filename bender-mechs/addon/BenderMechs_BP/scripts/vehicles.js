// The mech and the motorcycle, and their paint colors.
// No Minecraft imports, so this can be tested outside the game.

export const COLORS = [
  "Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Sky Blue", "Blue",
  "Purple", "Pink", "White", "Silver", "Gray", "Black", "Brown", "Gold",
];

export const VEHICLES = {
  "bender:titan_mech": { name: "Titan Mech", kit: "bender:titan_mech_kit", seats: 1, paint: { body: 0, accent: 2 } },
  "bender:motorcycle": { name: "Motorcycle", kit: "bender:motorcycle_kit", seats: 2, paint: { body: 7, accent: 13 } },
};

export const KIT_TO_VEHICLE = Object.fromEntries(Object.entries(VEHICLES).map(([id, v]) => [v.kit, id]));

export const BOT_ID = "bender:helper_bot";
export const BOT_KIT = "bender:helper_bot_kit";
export const BOT_NAMES = ["Bolt", "Sprocket", "Beep", "Gizmo", "Widget", "Cog", "Zippy", "Pixel", "Rivet", "Sparky"];

export function paintText(paint) {
  return `${COLORS[paint.body]} with ${COLORS[paint.accent].toLowerCase()} trim`;
}

export function cleanPaint(p, fallback) {
  const pick = (v, d) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n < COLORS.length ? n : d;
  };
  return { body: pick(p?.body, fallback.body), accent: pick(p?.accent, fallback.accent) };
}
