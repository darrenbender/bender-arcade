# Bender Mechs add-on source

- `BenderMechs_BP/`: behavior pack
  - `entities/`: the Titan Mech and Motorcycle (ridden like horses, with paint properties)
    and the Helper Bot (a tamed robot that follows its owner and fights monsters)
  - `blocks/sliding_door.json`: a door block that opens (no collision, see-through) when a
    player is within 3 blocks, using a tick component and the `bender:auto_door` script component
  - `items/`, `recipes/`: kits, the Mech Controller, the Base Kit
  - `scripts/vehicles.js`: vehicle list and paint names (no Minecraft imports)
  - `scripts/base.js`: plans the mech base block by block (no Minecraft imports)
  - `scripts/main.js`: placing and packing up, paint shop, power punch, rocket flames,
    blaster, horn, bot taming, door ticking, and the base builder with undo
- `BenderMechs_RP/`: resource pack: models, paint and bot textures, door textures,
  animations (walking, wheels, head look), the blaster particle

The download page links to `../BenderMechs.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-mechs/addon
rm -f ../BenderMechs.mcaddon
zip -qrX ../BenderMechs.mcaddon BenderMechs_BP BenderMechs_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
