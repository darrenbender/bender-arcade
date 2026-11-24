# Bender Power Suits add-on source

- `BenderSuits_BP/`: behavior pack
  - `scripts/suits.js`: the rules: the 8 suits (perk, Power Glove power, flight
    numbers, crafting material), the 6 gadgets, Suit Power, and how flying works each
    moment (rise, glide, boost, dive). No Minecraft imports, so it can be run and checked
    outside the game. Change numbers here.
  - `scripts/main.js`: flying (levitation to rise, slow falling to glide, a push to
    boost, soft landings, and the flying pose: `animation.bender_suits.fly` is played on
    the player with `playAnimation` when a suit takes off; it ends by itself on landing,
    and `animation.bender_suits.land` fades it out if the suit stops flying in mid-air), suit perks, the 8 Power Glove powers, the 6 gadgets, the
    hologram decoy, the status line, the starting-suit choice and item descriptions
  - `entities/hologram.json`: the Hologram Decoy (it has "player" in its family, so
    monsters chase it)
  - `items/`: 32 suit pieces, the Power Glove and 6 gadgets; `recipes/` for all of them
- `BenderSuits_RP/`: resource pack: suit textures (layer 1 and 2 per suit), 64 armor
  attachables (one for players and one for other mobs per piece, like Minecraft's own
  armor), icons, the hologram model, and four particles (spark, glow, star, thruster flame).
  `animations/flight.animation.json` is the flying pose: the body leans to follow the
  view pitch (turning around the middle of the body so it stays inside the hitbox), the
  legs flutter, and it cancels vanilla's running swing (`v.tcos0`). It does nothing in
  first person

Powers and gadgets only ever hurt monsters (and the guardians and dragon from the other
Bender add-ons). None of them break blocks.

The download page (`../index.html`) lists the suits and gadgets from `suits.js`.
After changing anything here, rebuild the add-on:

```bash
cd bender-suits/addon
rm -f ../BenderSuits.mcaddon
zip -qrX ../BenderSuits.mcaddon BenderSuits_BP BenderSuits_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.
Pack names end in the version (like `Bender Power Suits v1.0.3`): Minecraft keeps old copies of a
pack next to new ones, and this is how you tell them apart. Keep the name in step with `version`.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (stable, no experiments needed).
