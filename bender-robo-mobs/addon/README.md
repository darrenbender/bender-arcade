# Bender Robo Mobs add-on source

- `BenderRoboMobs_BP/`: behavior pack
  - `scripts/robots.js`: the rules: the 12 robots and their attacks, Battle Mode armor,
    knockouts and repairs, cooldowns, shots, and how flying and swimming robots steer
    (no Minecraft imports, so it can be run and checked outside the game)
  - `scripts/main.js`: riding, flying/swimming each tick, wall climbing, the slime
    smash, all special attacks, Battle Mode, robo punches, packing up, the Robo Remote
    menu, item descriptions and the welcome gift
  - `entities/robo_*.json`: one per robot. Walkers are ridden like horses
    (`input_ground_controlled`); the Blaze, Ghast and Wither have no gravity and are
    flown by the script; the Guardian is steered by the script. Robots never take normal
    damage. `bender:knock_out` removes the `bender:rideable` group and sets
    `bender:down`; `bender:repair` puts both back.
  - `items/`, `recipes/`: 12 robot kits and the Robo Remote
- `BenderRoboMobs_RP/`: resource pack: models (`models/entity/robo_mobs.geo.json`; each
  robot is a giant, 5-11 blocks, with a hollow cockpit in its chest where the pilot sits:
  the seat in each entity file is on the cockpit floor),
  textures (glowing pixels have alpha 0 for the `entity_emissive_alpha` material),
  walk/idle/knocked-out animations, kit and remote icons, the `bender:robo_dot` particle

## The robots

| Robot | Moves | Special attack | Crafting item |
|---|---|---|---|
| Robo Creeper | walks | Boom Wave: shockwave all around | Gunpowder |
| Robo Skeleton | walks | Arrow Storm: 5 laser arrows | Arrow |
| Robo Spider | walks, climbs walls | Web Shot: slows monsters | String |
| Robo Zombie | walks | Mega Punch | Rotten Flesh |
| Robo Enderman | walks | Warp Dash | Ender Pearl |
| Robo Blaze | flies | Fire Burst: 3 fireballs | Blaze Rod |
| Robo Ghast | flies | Mega Fireball | Ghast Tear |
| Robo Golem | walks | Ground Slam | Block of Iron |
| Robo Slime | walks, super bounce | Slime Ball | Slimeball |
| Robo Wither | flies | Skull Volley | Block of Coal |
| Robo Guardian | swims | Laser (charges for 1 second) | Prismarine Shard |
| Robo Wolf | walks, fastest | Pounce | Bone |

Kits: 6 iron ingots, 1 redstone and the robot's item (`IXI / IRI / I I`). Remote:
redstone over 2 iron ingots. Attacks only hurt monsters and bosses, plus other robots
when both pilots have Battle Mode on (saved on the player as `bender:robo_battle`;
knockouts as `bender:robo_kos`). They never hurt players, pets, animals or blocks.

The download page links to `../BenderRoboMobs.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-robo-mobs/addon
rm -f ../BenderRoboMobs.mcaddon
zip -qrX ../BenderRoboMobs.mcaddon BenderRoboMobs_BP BenderRoboMobs_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.120 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
