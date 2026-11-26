# Bender Mini Cars add-on source

8 kinds of little cars in 16 colors (128 cars), each with a special move, and a Race
Track Kit that builds a raceway with countdown lights, laps, trophies and records.

- `BenderMiniCars_BP/`: behavior pack
  - `scripts/minicars.js`: the rules: the 8 cars (speed, jump, step height, seats,
    special) and the 16 paints, and how a race works: the countdown, checkpoints that
    only count in order, laps, places, times, trophies (gold/silver/bronze; racing alone,
    your time picks it) and records (no Minecraft imports, so it can be checked outside
    the game)
  - `scripts/track.js`: the raceway plan (61 x 41): a looping road with curbs, the
    checkered start/finish line under a gantry with 3 race lights, the starting grid,
    Race Control, a podium, a grandstand, garden lights, and the 4 checkpoint zones
  - `scripts/main.js`: placing cars (with a color picker), the Car Key specials (Turbo,
    Mega Jump, Horn, Siren, Water Spray, Ice-Cream Jingle), painting, packing up, races
    (a 10-second lobby to get in your cars, then the countdown lights, laps, places,
    trophies, results and track records), the track builder (with undo), item
    descriptions and the starter car choice
  - `entities/mini_*.json`: the cars, driven like horses (`input_ground_controlled`).
    `bender:paint` (0-15) picks the texture; police car and fire truck have
    `bender:siren` for the flashing lights. Cars never take damage.
  - `blocks/`: Race Light (`bender:light` 0 off, 1 red, 2 green), Race Control, and the
    gold, silver and bronze trophies (only won in races, never crafted)
- `BenderMiniCars_RP/`: resource pack: car models (`models/entity/minicars.geo.json`), 16
  paint textures per car (glowing lights have alpha 0 for `entity_emissive_alpha`), wheel
  and siren animations, the trophy model, icons, the `bender:minicar_dot` particle, and
  `texts/en_US.lang` for car names

The download page links to `../BenderMiniCars.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-mini-cars/addon
rm -f ../BenderMiniCars.mcaddon
zip -qrX ../BenderMiniCars.mcaddon BenderMiniCars_BP BenderMiniCars_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest). The pack names end in the version
(`Bender Mini Cars v1.0.1`), and `PACK_VERSION` in `scripts/main.js` (announced in chat
when you join) must match.

Target: Minecraft Bedrock 1.21.120 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
