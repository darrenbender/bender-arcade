# Bender Arcade — Project Standards

A custom-built collection of small browser games made by Darren for his two kids, **Michael (age 6)** and **James (age 9)**. Hosted at **games.darrenbender.com**.

This document is the single source of truth for how the project is built and run. If anything in a chat or codebase contradicts this file, this file wins (or the file gets updated — whichever is correct).

---

## 1. Mission & non-negotiables

**Why this project exists:** to give Michael and James a small library of fun, custom games that have no ads, no tracking, no logins, and no microtransactions. Just play.

**Non-negotiables — every game must meet all of these:**

- Fully age-appropriate (6 and 9). No scary themes, no real violence, no mature humor.
- No external dependencies loaded at runtime. No CDN fonts, no CDN scripts, no analytics, no ad networks, no third-party anything. Pure self-contained HTML/CSS/JS.
- No data leaves the browser. Ever. All persistence is `localStorage` only.
- No accounts, no logins, no email, no passwords.
- Big buttons, big text, forgiving controls. The 6-year-old must be able to play solo without help.

---

## 2. Audience profiles

**Michael (6)** — Still learning to read; relies on color, icons, and audio cues. Needs huge tap targets, no fail states that feel punishing, lots of positive feedback. Loves dogs and silly characters.

**James (9)** — Reads fluently; enjoys high-score chases, levels, and visible progress. Tolerates a bit more challenge but still wants forgiving controls.

**Design implication:** when a game has to choose between accommodating Michael or James, accommodate Michael. James can handle a too-easy game; Michael cannot handle a too-hard one.

---

## 3. Tech stack

- **HTML, CSS, vanilla JavaScript.** No frameworks (no React, Vue, Svelte). No build tools (no webpack, Vite, npm scripts). No TypeScript. No preprocessors.
- **One `index.html` per game** when possible. Inline `<style>` and `<script>` tags are fine and preferred for small games — keeps everything in one file you can email or AirDrop.
- **For games that grow beyond ~1000 lines**, split into `index.html`, `style.css`, `game.js` inside the game's folder. No further structure than that.
- **No external libraries** unless explicitly approved. If a game needs sound, use the Web Audio API directly. If it needs animation, use CSS transitions or `requestAnimationFrame`.
- **Browser support target:** latest Safari (iPad and Mac), latest Chrome. No need to support old browsers.

---

## 4. File structure

```
bender-arcade/
├── index.html              ← landing page (player picker + game menu)
├── STANDARDS.md            ← this file
├── README.md               ← short description for the GitHub repo page
├── CNAME                   ← contains: games.darrenbender.com
├── .gitignore
│
├── pup-patrol/
│   └── index.html
├── rainbow-sound-garden/
│   └── index.html
└── [new-game-name]/
    └── index.html
```

**Folder naming:** lowercase, hyphens between words, no spaces, no underscores. The folder name becomes the URL path (`games.darrenbender.com/pup-patrol/`).

**Each game lives in its own folder** with `index.html` as the entry point. This gives clean URLs and keeps games fully isolated from each other.

---

## 5. The player picker pattern

Every game starts by knowing who's playing. The landing page (`/index.html`) handles initial player selection and stores the result in `localStorage` under the key `arcade-current-player`.

Individual games should:

1. On load, read `arcade-current-player` from localStorage.
2. If empty, redirect to `/` (the landing page) so the player can pick a name.
3. If present, use that name to scope all save data for the game.

```javascript
// Standard snippet at the top of every game's script
const player = localStorage.getItem('arcade-current-player');
if (!player) {
  window.location.href = '/';
}
```

---

## 6. localStorage conventions

All keys are prefixed with the game's folder name to avoid collisions:

```
arcade-current-player              ← global: who's playing right now
pup-patrol:Michael:highScore       ← per-game, per-player
pup-patrol:Michael:dogsRescued     ← per-game, per-player
rainbow-sound-garden:James:level   ← per-game, per-player
```

**Format:** `<game-folder>:<player-name>:<dataKey>`

**Values:** stored as strings (localStorage only stores strings). For numbers, wrap in `Number()` on read. For objects, use `JSON.stringify` on write and `JSON.parse` on read.

```javascript
// Reading
const score = Number(localStorage.getItem(`pup-patrol:${player}:highScore`)) || 0;

// Writing
localStorage.setItem(`pup-patrol:${player}:highScore`, String(newScore));
```

---

## 7. Visual & interaction standards

- **Minimum tap target:** 64×64 px. Buttons that matter should be much larger.
- **Minimum body text size:** 18px. Game UI text: 24px+.
- **Color:** high contrast, no thin gray text on white. Test the screen with a kid squinting at it.
- **Animation:** generous and friendly. Bounces, pops, sparkles. Nothing that flashes or strobes (seizure-safe).
- **Audio:** optional, never required. Always provide a mute button. Default to muted on first load if iOS audio gesture isn't yet unlocked.
- **Fail states:** soft. "Try again!" not "Game Over." No lives system that locks them out. No timers that punish slow thinking.
- **Win states:** big, celebratory, and obvious. Confetti, sound, a clear "You did it!" screen.

---

## 8. Navigation pattern

Every game needs two ways out: back to its own start screen, and back to the arcade. Both live in a small **nav bar in the top-right corner**, visible only during active gameplay (not on menu or win screens).

**Two buttons, always in this order, left to right:**

- ↩ **Menu** — returns to the game's own start screen (in-page screen switch, no URL change)
- 🏠 **Arcade** — `window.location.href = '/'` to the landing page

Each button is 64×64 px minimum with 12 px between them.

**Mid-game safeguard.** If gameplay is active when either button is tapped, show a soft confirm dialog: *"Leave game? Your score won't be saved."* with two big buttons — "Keep Playing" and "Yes, Leave." This protects Michael from accidental taps mid-run.

If the player is on the game's own menu or win screen, no confirm is needed — go straight back.

**On menu and win screens**, include a large **"← Back to Arcade"** button as part of the layout itself, in addition to the (hidden) nav bar. The kid-obvious way out needs to be a full-size button, not just a corner icon.

**Reference implementation:** see `nav-pattern-demo/` for the working template. Copy and adapt the screen system, the nav bar, and the confirm modal into new games rather than re-inventing.

---

## 9. Privacy & security

- Zero third-party network requests at runtime. Verify in browser DevTools → Network tab: nothing should appear except the page itself and same-origin resources.
- No cookies. localStorage only.
- No external fonts. Use the system font stack:
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif;
  ```
- No image hotlinking. If a game needs images, they live in the game's folder.
- No telemetry, ever — not even "anonymous usage stats."

---

## 10. Git & deployment

**Repo:** `github.com/darrenbender/bender-arcade`
**Live site:** `https://games.darrenbender.com`
**Deploy:** GitHub Pages, `main` branch, root folder. Pushing to `main` deploys automatically (usually under a minute).

**Standard commit flow for adding a new game:**

```bash
cd ~/Documents/bender-arcade
# (add the new game folder, add a button to index.html)
git add .
git commit -m "Add [game name]"
git push
```

**Commit messages:** short, present-tense, describe what changed.
- ✅ `Add Color Tap game`
- ✅ `Fix Rainbow Garden audio not unlocking on iPad`
- ❌ `updates`
- ❌ `fixed stuff`

---

## 11. Definition of "done" for a new game

A new game is ready to deploy when:

- [ ] It works in Safari on a Mac.
- [ ] It works in Safari on an iPad (touch-tested).
- [ ] The player picker pattern is wired up (redirects to `/` if no player selected).
- [ ] The navigation pattern is wired up (Menu + Arcade buttons in the corner, mid-game confirm dialog, full-size "Back to Arcade" button on menu and win screens).
- [ ] Per-player save data uses the localStorage key convention.
- [ ] A button has been added to the landing page (`/index.html`).
- [ ] The folder name follows naming convention (lowercase, hyphens).
- [ ] No `console.log` debug noise in the production code.
- [ ] No external network requests (check DevTools).
- [ ] Both Michael and James have played it at least once and given feedback.

---

## 12. When working with Claude on this project

- Always work inside the **Bender Arcade** project so the project's custom instructions apply.
- Use **one chat per game**; keep this current "infrastructure" chat for hosting/repo/DNS work.
- When starting a new chat, point Claude at this file: "See STANDARDS.md in the repo for conventions."
- If a convention in this file ever feels wrong or outdated, update the file — don't work around it.

---

## 13. Open ideas / future games

A running list of game ideas to pull from:

- Color Tap (reflex: tap the named color)
- Memory Match (card pairs)
- Whack-a-Mole variant with friendly creatures
- Sight word racer (reading practice for Michael)
- Math fact dash (practice for James)
- Simple maze with collectibles
- Drawing pad with stickers
- [add more as the kids request them]

---

*Last updated: 2026-05-23*
