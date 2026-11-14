# Bender Realism resource pack source

A resource pack that makes Minecraft Bedrock look more realistic with **Vibrant Visuals**.
It changes no gameplay and adds no blocks, items or mobs. It only works when Vibrant
Visuals is on (Settings > Video > Graphics Mode). On devices that can't run Vibrant
Visuals, it does nothing.

- `BenderRealism_RP/manifest.json`: the `"pbr"` capability tells Minecraft to read the
  Vibrant Visuals files below (needs `min_engine_version` 1.21.120 or newer)
- `water/water.json`: all water
- `lighting/`, `color_grading/`, `atmospherics/`: the default file plus one per group
  of overworld biomes
- `fogs/default_fog_setting.json`: haze for biomes that don't set their own
- `shadows/global.json`: soft shadows

## How it reaches every biome

Since 1.21.90, Mojang's per-biome Vibrant Visuals settings take priority over a pack's
global files. So each file here is a copy of Mojang's vanilla file **at the same path
and with the same identifier** (from Mojang's `bedrock-samples`, version 1.26.60).
Each copy replaces the vanilla one for every biome that uses it. Biome files, fog colors
and music are not touched. The Nether and the End keep Mojang's settings.

## What changes compared to vanilla

| File | Change | Why |
|---|---|---|
| water | waves on (vanilla ships them off), caustics power 1 to 2, a little chlorophyll, sediment and dissolved matter (Mojang's ocean example values), 20% of each biome's water color | moving waves, sunlight dancing underwater, natural water color, swamps stay murky |
| lighting (overworld) | `orbital_offset_degrees` 0 to 20; sky fill 1.0 to 0.85 | the sun travels a tilted path like real sunlight, so shadows stay long and angled all day; shade is a bit deeper |
| color grading | tone mapping `generic` to `aces` in every file | film-camera color |
| atmospherics (overworld) | daytime sun glow (mie) 0 to 0.2 | a soft halo around the sun in the daytime sky, not just at sunrise and sunset |
| default fog | thin volumetric air haze (density 0.05, the same values Mojang uses in jungles and taigas) | sunbeams show through leaves and windows |

Old-format (1.21.70) biome lighting files were moved to the 1.21.80 layout of Mojang's
own `lighting/global.json`: `sun`, `moon` and the offset sit inside `orbital`, plus
`flash`. Tone mapping, orbital offset and waves can't blend between biomes, so every file
uses the same value.

Keyframe times: 0.0 is noon, 0.25 sunset, 0.5 midnight and 0.75 sunrise.
