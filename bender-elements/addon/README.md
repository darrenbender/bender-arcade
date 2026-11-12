# Bender Elements add-on source

- `BenderElements_BP/`: behavior pack
  - `scripts/elements.js`: the rules: the 10 elements, their 40 powers (3 abilities and
    an ultimate each), energy and ultimate charge, armor set bonuses, guardian numbers,
    and the shapes powers use (cones, walls, whirls, meteor showers). No Minecraft
    imports, so it can be run and checked outside the game. Change numbers here.
  - `scripts/main.js`: casting (tap = use the chosen power, sneak + tap = switch), the
    status line, every kind of power, blocks made by powers that vanish again (saved so
    they're cleaned up even if the world closes), guardians (summoning, fighting,
    rewards, going back into the orb if nobody fights), armor bonuses, element touches
    on staff hits, the starting-element choice and item descriptions
  - `entities/element_guardian.json`: one guardian entity; the `bender:element`
    property says which element it is
  - `items/`: 10 staffs, 10 Guardian Orbs, 10 shards, 40 armor pieces
  - `recipes/`: orbs (4 element materials + a gold ingot) and armor from shards
- `BenderElements_RP/`: resource pack: the guardian model, its 10 textures and
  animations, armor textures (layer 1 and 2 per element), 80 armor attachables (one for
  players and one for other mobs per piece, like Minecraft's own armor), icons, and
  three tinted particles

Powers only ever hurt monsters (and guardians, and the Bender Dragons boss). Guardians'
powers only hurt players, and less than at full strength.

The download page (`../index.html`) lists the elements and powers from `elements.js`.
After changing powers, regenerate the page and rebuild the add-on:

```bash
cd bender-elements/addon
rm -f ../BenderElements.mcaddon
zip -qrX ../BenderElements.mcaddon BenderElements_BP BenderElements_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (stable, no experiments needed).
