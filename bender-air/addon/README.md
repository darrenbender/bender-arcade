# Bender Air add-on source

- `BenderAir_BP/`: behavior pack
  - `entities/`: the three planes (`bender:stunt_plane`, `bender:jet`, `bender:private_jet`).
    Paint, nose angle, banking and throttle are entity properties, so the model can show them.
  - `items/`, `recipes/`: the three plane kits and the Paint Brush
  - `scripts/planes.js`: plane stats, paint names, and the flight maths. It has no
    Minecraft imports, so it can be run and tested outside the game.
  - `scripts/main.js`: the Minecraft side: flying each tick, camera, speed readout,
    paint shop form, placing and packing up planes, parachutes.
- `BenderAir_RP/`: resource pack
  - `models/entity/planes.geo.json`: each plane is three models drawn on top of each
    other: body, wings and decals. That lets the body and wings be painted separately.
  - `textures/entity/planes/paint_*.png`: 16 paint colors that share one layout, so any
    plane can use any color. `decal_*.png`: the 8 decal patterns.
  - `render_controllers/`, `animations/`, `particles/`: picking textures from the paint
    properties, tilting the plane, spinning the propeller, and the smoke trail.

Flying is done by the script: the plane steers toward where the pilot is looking,
the joystick sets the speed, and Jump does each plane's special move. If the game
doesn't pass joystick movement through while riding, Jump works the throttle instead.

The download page links to `../BenderAir.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-air/addon
rm -f ../BenderAir.mcaddon
zip -qrX ../BenderAir.mcaddon BenderAir_BP BenderAir_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
