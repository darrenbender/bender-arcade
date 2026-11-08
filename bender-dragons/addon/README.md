# Bender Dragons add-on source

- `BenderDragons_BP/`: behavior pack
  - `scripts/arena.js`: plans the Dragon Arena block by block (an end stone island,
    six obsidian pillars with ladders, and the altar). No Minecraft imports, so it can
    be run and checked outside the game.
  - `scripts/dragon.js`: the dragon rules: how the boss circles, swoops, lands on the
    altar, shoots fireballs and breathes; fireball flight; how pet dragons follow,
    fly when ridden, grow when fed; and the pet colors. Also no Minecraft imports.
  - `scripts/main.js`: builds the arena (with undo), runs the boss fight (crystals heal
    the dragon), hands out an egg to everyone in the fight when it's beaten, hatches
    eggs, steers pet dragons, and handles the whistle, feeding and the welcome gifts
  - `entities/`: the boss dragon (`ender_dragon`), pet dragons (3 sizes, rideable when
    grown up, 6 colors), the End crystals, and the egg
  - `blocks/dragon_altar.json`: tap it to call the dragon (Easy, Normal or Hard)
  - `items/`: Dragon Arena Kit, Ender Dragon Egg, Dragon Whistle
- `BenderDragons_RP/`: resource pack
  - `models/entity/ender_dragon.geo.json`: Minecraft's Ender Dragon rebuilt as an
    ordinary model (Minecraft draws its own dragon with special code, so a custom entity
    can't use that model directly). The pieces match Minecraft's dragon texture, which is
    used by name (`textures/entity/dragon/dragon`) and is not copied into this pack. The
    crystals likewise use Minecraft's own End crystal model and texture by name.
  - `animations/dragons.animation.json`: flying, landed and roaring poses, and the egg
    wobble
  - the egg model, altar textures, icons, and the fireball and crystal-beam particles

The boss never breaks blocks: it is a custom entity, not Minecraft's own dragon, so the
Ender Dragon in the End is untouched.

An arena is 41x41 blocks. Before building, the area (4 blocks below the ground to 26
above) is saved as a structure so the newest arena can be undone.

The download page links to `../BenderDragons.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-dragons/addon
rm -f ../BenderDragons.mcaddon
zip -qrX ../BenderDragons.mcaddon BenderDragons_BP BenderDragons_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (stable, no experiments needed).
