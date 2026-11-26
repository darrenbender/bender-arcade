# Bender Star Knights add-on source

An original space-knight add-on: glowing Star Blades, Star Powers, robots to train
against, a Droid Buddy, the Star Dart starfighter and Duel Mode.

- `BenderStarKnights_BP/`: behavior pack
  - `scripts/knights.js`: the rules: the 9 blade colors (7 + a color-changing rainbow
    and a striped rainbow), which Star Power a tap uses (look ahead = Push, up = Lift,
    down = Leap, sneak = Pull) and who it reaches, bouncing blaster bolts back, Duel Mode
    scores, the training waves, droid paints and how the Star Dart flies (no Minecraft
    imports, so it can be checked outside the game)
  - `scripts/temple.js`: the Star Knight Temple plan (41 x 41): the hall with the Blade
    Workbench, the crystal cave (a crystal of every color), the droid bay, the training
    arena with robot pads and the Training Console, the landing pad and garden lights
  - `scripts/main.js`: blades (lighting up, extra damage to monsters, bouncing bolts),
    Star Powers, Duel Mode, the crystal cave and workbench, training waves, the Droid
    Buddy (follows, zaps monsters, paint and call), the Star Dart (flying and lasers),
    the Knight Comm menu, the Temple Kit builder (with undo), item descriptions, the
    starter blade choice and the welcome gift
  - `entities/`: Clank Trooper and Clank Captain (monsters that shoot `blaster_bolt`
    projectiles), the Droid Buddy (tamed to whoever puts it down; players can't hurt it),
    the Star Dart (no gravity: flown by the script; never takes damage)
  - `items/`, `recipes/`, `blocks/`, `loot_tables/`
- `BenderStarKnights_RP/`: resource pack
  - `attachables/star_blade_*.json`: the 3D held blade. Its root bone is bound to the
    hand (`q.item_slot_to_bone_name(c.item_slot)`); Minecraft puts model y = 24 at the
    hand, and the hilt's grip is at y = 13. The first-person pose is Minecraft's own
    trident pose, shifted so the hand is on the hilt. The blade core glows
    (`entity_emissive_alpha`) and the halo bone uses `entity_beam_additive`. The rainbow
    blade's render controller cycles 12 colored textures, 8 a second.
  - models, textures (glowing pixels have alpha 0), animations, render controllers,
    the `bender:knight_dot` particle, and `texts/en_US.lang` for entity names

Blade hits, powers, the droid's zaps and the Star Dart's lasers only hurt monsters and
bosses (as "magic" damage). Blades themselves do fist damage (1); the extra damage to
monsters comes from the script. In Duel Mode, duelists close together get Resistance V,
so blade hits only score points.

The download page links to `../BenderStarKnights.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-star-knights/addon
rm -f ../BenderStarKnights.mcaddon
zip -qrX ../BenderStarKnights.mcaddon BenderStarKnights_BP BenderStarKnights_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest). The pack names end in the version
(`Bender Star Knights v1.0.1`), and `PACK_VERSION` in `scripts/main.js` (announced in
chat when you join) must match.

Target: Minecraft Bedrock 1.21.120 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
