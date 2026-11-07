# Royal Castle add-on source

- `RoyalCastle_BP/`: behavior pack
  - `scripts/castle.js`: plans the whole castle block by block (no Minecraft imports,
    so it can be run and checked outside the game)
  - `scripts/main.js`: surveys the land, shows the outline, saves the area for undo,
    builds the castle a few blocks per tick, fills the treasure vault, spawns the castle
    folk and the throne seat, crowns whoever sits on the throne, and raises the portcullis
  - `blocks/castle_gate.json`: the portcullis (opens when a player is within 4 blocks)
  - `entities/throne_seat.json`: an invisible seat on the throne
  - `items/`: Castle Kit and Royal Crown (wearable on the head)
- `RoyalCastle_RP/`: resource pack: portcullis textures, crown model (an attachable),
  icons, and the invisible seat

A castle is 61x61 blocks. Before building, the area (8 blocks below the ground to 34
above) is saved as a structure so the newest castle can be undone.

The download page links to `../RoyalCastle.mcaddon`. After changing anything here, rebuild it:

```bash
cd royal-castle/addon
rm -f ../RoyalCastle.mcaddon
zip -qrX ../RoyalCastle.mcaddon RoyalCastle_BP RoyalCastle_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0
(stable, no experiments needed).
