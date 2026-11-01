# Village Cities add-on source

- `VillageCities_BP/`: behavior pack (City Charter item and recipe, and the scripts)
  - `scripts/city.js`: plans a whole city as a list of blocks. It has no Minecraft
    imports, so it can be run and checked outside the game.
  - `scripts/main.js`: the Minecraft side: surveys the land, shows the outline,
    builds the city a few blocks per tick, spawns villagers, and handles undo.
- `VillageCities_RP/`: resource pack (charter texture)

A city is 61x61 blocks. Before building, the area (from 12 blocks below the floor to
48 above) is saved as a structure so the newest city can be undone.

The download page links to `../VillageCities.mcaddon`. After changing anything here, rebuild it:

```bash
cd village-cities/addon
rm -f ../VillageCities.mcaddon
zip -qrX ../VillageCities.mcaddon VillageCities_BP VillageCities_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 (stable, no experiments needed).
