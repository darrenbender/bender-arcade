# Mob Rider add-on source

- `MobRider_BP/`: behavior pack (Magic Saddle item and recipe, the invisible `bender:ride_seat` entity, and `scripts/main.js`)
- `MobRider_RP/`: resource pack (saddle texture, invisible seat model)

How riding works: the player rides an invisible seat entity, and the script moves the
mob to the seat every tick. Walking mobs are steered by Minecraft's own controls
(`minecraft:input_ground_controlled`). Flying and swimming mobs are steered by the
script using the rider's movement input.

The seat heights in `entities/ride_seat.json` (`bender:seat_0` to `bender:seat_9`) must
match `SEAT_HEIGHTS` in `scripts/main.js`.

The download page links to `../MobRider.mcaddon`. After changing anything here, rebuild it:

```bash
cd mob-rider/addon
rm -f ../MobRider.mcaddon
zip -qrX ../MobRider.mcaddon MobRider_BP MobRider_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 (stable, no experiments needed).
