# Bender Boxing add-on source

- `BenderBoxing_BP/`: behavior pack
  - `scripts/training.js`: the training rules: bags, gloves, points, levels and combos
    (no Minecraft imports, so it can be run and checked outside the game)
  - `scripts/main.js`: counts punches on the bags, gives the extra hearts (a health
    boost effect that is put back after milk, death or rejoining), swings the bags,
    sets bags up and packs them away, gives gloves extra punch against monsters,
    adds item descriptions and hands out the welcome gifts
  - `entities/punching_bag.json`: the bag (one entity; the `bender:material` property
    says which of the 5 bags it is)
  - `items/`: 3 pairs of gloves (held in either hand or worn in the chestplate slot)
    and 5 bag kits
- `BenderBoxing_RP/`: resource pack: the bag model, its 5 textures and swing
  animations, the glove model (an attachable that follows the player's arms), icons

## Training

| Bag | Trains you up to | Hearts | Points per punch |
|---|---|---|---|
| Hay | level 1 | 12 | 1 |
| Leather | level 2 | 14 | 2 |
| Iron | level 3 | 16 | 3 |
| Diamond | level 4 | 18 | 4 |
| Netherite | level 5 | 20 | 5 |

Levels need 100, 400, 1000, 2000 and 3500 points in total. Pro Gloves train 1.5x
faster and Champion Gloves 2x. 5 punches in a row (no more than 1.5 seconds apart)
make a combo worth 1.5x, 10 in a row 2x. Punches less than a quarter of a second
apart don't count. Progress is saved on the player as the dynamic property
`bender:boxing_points`.

The download page links to `../BenderBoxing.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-boxing/addon
rm -f ../BenderBoxing.mcaddon
zip -qrX ../BenderBoxing.mcaddon BenderBoxing_BP BenderBoxing_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0
(stable, no experiments needed).
