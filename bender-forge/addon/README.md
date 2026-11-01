# Bender Forge add-on source

These two folders are the Minecraft Bedrock add-on:

- `BenderForge_BP/`: behavior pack (items, recipes, and `scripts/main.js` for the special powers)
- `BenderForge_RP/`: resource pack (textures)

The download page links to `../BenderForge.mcaddon`, which is a zip of both folders. After changing anything here, rebuild it:

```bash
cd bender-forge/addon
rm -f ../BenderForge.mcaddon
zip -qrX ../BenderForge.mcaddon BenderForge_BP BenderForge_RP -x '*.DS_Store'
```

When you ship a change, bump `version` in both `manifest.json` files (and the
dependency version in the behavior pack manifest), or Minecraft will keep the old copy.

Target: Minecraft Bedrock 1.21.110 or newer, Script API `@minecraft/server` 2.2.0 (stable, no experiments needed).
