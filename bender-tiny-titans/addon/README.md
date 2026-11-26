# Bender Tiny Titans add-on source

Three size suits (Pocket, Firefly, Mega): shrink tiny, grow giant, grab and throw
monsters, stomp, fly on Firefly wings, ride ants, throw Size Discs at mobs, and dive into
the Micro Realm.

- `BenderTinyTitans_BP/`: behavior pack
  - `scripts/sizes.js`: the rules: the 3 suits (how tiny and how giant, stomp size, throw
    strength), which size a Size Switch tap picks (look ahead / up / down), throws,
    stomps, tiny punches, the Firefly sting and wings, Size Disc steps, the ants, flying
    ant steering and where the Micro Realm is (no Minecraft imports, so it can be checked
    outside the game)
  - `scripts/realm.js`: the Micro Realm plan: a platform with the exit portal, 9 glowing
    floating islands with crystal spires and Micro Crystal clusters, light bridges and
    see-through bubbles. It's built at x 30000, y 200, z 30000 the first time someone
    goes there.
  - `scripts/main.js`: changing size (with a headroom check), the follow cameras, giant
    grab-and-throw and stomps, tiny punches and stings, Firefly wings, Size Discs, the Ant
    Colony and riding, the Micro Realm (building, arriving, crystals, going home), the
    Size Switch menu, suit swapping, item descriptions and the starter suit choice
  - `entities/player.json` and `entities/vanilla_*.json`: **Mojang's own player, zombie,
    skeleton, creeper, spider, pig, cow, sheep and chicken files** (from
    `Mojang/bedrock-samples`, 1.26.60) with only `bender:size_*` component groups and
    events added (`minecraft:scale`; the player's tiny sizes also shrink the hitbox, and
    tiny and giant players take no fall damage). The script triggers the events.
  - `entities/worker_ant.json`, `flying_ant.json`: tameable, rideable ants with
    tiny/normal/giant size groups (each with its own seat height). Flying ants have no
    gravity: the script flies them when ridden.
  - `entities/*_disc_shot.json`: the thrown Size Discs
  - `cameras/presets/`: `bender:tiny_view`, `bender:giant_view`, `bender:mega_view`
    (follow-orbit cameras, because the first-person camera doesn't follow the player's
    size)
  - `blocks/`: the Micro Portal and Micro Crystal Cluster (Micro Realm only; they can't
    be mined)
- `BenderTinyTitans_RP/`: resource pack: suit armor textures and attachables (the Firefly
  chestplate adds see-through wings with their own geometry, render controller and flap
  animation), ant and disc models (`models/entity/titans.geo.json`), animations, icons,
  the swirling portal flipbook, the `bender:titans_dot` particle, and `texts/en_US.lang`

To update the vanilla files for a newer Minecraft, download the new ones from
`Mojang/bedrock-samples` (`behavior_pack/entities/`) and add the same size groups again.
Raise `min_engine_version` to match the newest `format_version` among them.

The download page links to `../BenderTinyTitans.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-tiny-titans/addon
rm -f ../BenderTinyTitans.mcaddon
zip -qrX ../BenderTinyTitans.mcaddon BenderTinyTitans_BP BenderTinyTitans_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest). The pack names end in the version
(`Bender Tiny Titans v1.0.0`), and `PACK_VERSION` in `scripts/main.js` (announced in chat
when you join) must match.

Target: Minecraft Bedrock 1.26.60 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
