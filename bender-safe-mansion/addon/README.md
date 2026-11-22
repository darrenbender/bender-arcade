# Bender Safe Mansion add-on source

- `BenderSafeMansion_BP/`: behavior pack
  - `scripts/mansion.js`: the mansion plan (41 x 41 blocks): the house, yard, pool, wall,
    laser gate, traps, garden lights, cameras, the secret vault and the helipad
    (no Minecraft imports, so it can be checked outside the game)
  - `scripts/security.js`: the rules: where the yard and house are, which monster a turret
    aims at, where traps fling monsters, the alarm, camera views, laser beams, the radar,
    and how the drone and helicopter fly (no Minecraft imports either)
  - `scripts/main.js`: the Mansion Kit builder (with undo), the yard alarm and siren,
    security doors, the secret bookshelf, cameras and monitors, laser posts, motion
    sensors, launch pads, turrets, the vehicles, the Security Remote, item descriptions
    and the welcome gift
  - `blocks/`: Security Door, Secret Bookshelf, Security Camera, Security Monitor, Laser
    Post, Motion Sensor, Launch Pad Trap. Their custom components are registered in
    `main.js` (`bender:mansion_*`). Doors, lasers, sensors and traps use tick components.
  - `entities/`: Police Car (ridden like a horse), Police Helicopter and Security Drone
    (no gravity, flown by the script), Laser Turret. None of them ever take damage.
  - `items/`, `recipes/`: the Mansion Kit, the Security Remote, the vehicle and turret
    kits, and recipes for every item and block
- `BenderSafeMansion_RP/`: resource pack: vehicle and turret models
  (`models/entity/mansion.geo.json`), the camera block model, textures (glowing pixels
  have alpha 0 for the `entity_emissive_alpha` material), rotor, wheel and siren-light
  animations (driven by the `bender:siren` and `bender:active` properties), icons, and
  the `bender:mansion_dot` laser particle

Lasers, turrets, traps and vehicle zaps only hurt monsters and bosses (as "magic" damage,
so monsters don't get angry at a player). They never hurt players, pets, animals or blocks.

Saved state: the list of mansions (`bender:mansions`) and cameras players put up
(`bender:mansion_cameras`) are world dynamic properties. Each player's last mansion (for
undo) is `bender:last_mansion`, and their alarm switch is `bender:mansion_alarm_off`.

The download page links to `../BenderSafeMansion.mcaddon`. After changing anything here, rebuild it:

```bash
cd bender-safe-mansion/addon
rm -f ../BenderSafeMansion.mcaddon
zip -qrX ../BenderSafeMansion.mcaddon BenderSafeMansion_BP BenderSafeMansion_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest). The pack names end in the version
(`Bender Safe Mansion v1.0.0`), and `PACK_VERSION` in `scripts/main.js` (announced in
chat when you join) must match. Minecraft keeps old copies of a pack next to new ones,
so this is how you tell them apart.

Target: Minecraft Bedrock 1.21.120 or newer, Script API `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 (both stable, no experiments needed).
