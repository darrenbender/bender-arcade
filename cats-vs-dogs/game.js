/* ============================================================
   Cats vs Dogs — Step 1: pick + customize a cat and a dog.
   Per STANDARDS.md: player picker, nav pattern, localStorage keys,
   inline SVG with proper anatomy and gradient shading.
   ============================================================ */

/* ---------- PLAYER CHECK (§5) ---------- */
const player = localStorage.getItem('arcade-current-player');
if (!player) window.location.href = '/';

/* ---------- STORAGE KEYS (§6) ---------- */
const CAT_KEY = `cats-vs-dogs:${player}:cat`;
const DOG_KEY = `cats-vs-dogs:${player}:dog`;

/* ---------- STATE ---------- */
const DEFAULT_CAT = { designId: 0, size: 'medium', build: 'normal', eyeColor: 'blue',  collarColor: 'none' };
const DEFAULT_DOG = { designId: 0, size: 'medium', build: 'normal', eyeColor: 'blue',  collarColor: 'none' };
const state = {
  cat: { ...DEFAULT_CAT },
  dog: { ...DEFAULT_DOG },
};

/* ---------- SCREEN NAV ---------- */
const SCREENS = ['intro', 'cat-choose', 'cat-customize', 'dog-choose', 'dog-customize', 'team'];
function goto(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
  // Nav bar visible on choose/customize screens, hidden on intro/team
  const showNav = (name !== 'intro' && name !== 'team');
  document.getElementById('nav-bar').classList.toggle('visible', showNav);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function goHome() { window.location.href = '/'; }

/* ============================================================
   SVG HELPERS — palettes + gradient defs
   ============================================================ */
const CAT_PALETTE = {
  bodyHi:     '#fdf3e2',
  bodyMid:    '#efddc1',
  bodyLo:     '#c9b08c',
  bodyShadow: '#a08562',
  pointsHi:   '#f0b27a',
  pointsMid:  '#c97134',
  pointsLo:   '#7d3a10',
  noseHi:     '#f6b4b0',
  noseLo:     '#b86a68',
  innerEarHi: '#f5c4be',
  innerEarLo: '#a06158',
  whiskerCol: '#fffaf0',
  outline:    '#3a2415',
  pawPad:     '#c97474',
};
const DOG_PALETTE = {
  copperHi:  '#e3a06a',
  copperMid: '#b06a2e',
  copperLo:  '#5e2f10',
  patchHi:   '#5b2a0f',
  patchLo:   '#2c1305',
  whiteHi:   '#fbf2e0',
  whiteMid:  '#e9ddc4',
  whiteLo:   '#b9ad92',
  noseHi:    '#5a5a5a',
  noseLo:    '#0d0d0d',
  innerEarHi:'#d59386',
  innerEarLo:'#6a3024',
  tongueHi:  '#f59999',
  tongueLo:  '#a83b3b',
  outline:   '#1d130b',
};
const EYE_PALETTE = {
  blue:  { hi: '#bce0ff', mid: '#3e85c4', lo: '#15406f' },
  green: { hi: '#cfe9a8', mid: '#5a9b3a', lo: '#234d18' },
  gold:  { hi: '#f8df88', mid: '#c89324', lo: '#6b440a' },
};
const COLLAR_COLORS = {
  none:   null,
  red:    { hi: '#ff8a7a', mid: '#d63a2a', lo: '#7a1408', stud: '#ffd86b' },
  blue:   { hi: '#86b8ff', mid: '#2960c8', lo: '#0f2c6b', stud: '#e0f0ff' },
  pink:   { hi: '#ffc4dd', mid: '#e368a8', lo: '#7a2f5a', stud: '#fffae6' },
  purple: { hi: '#cbb0ff', mid: '#7a4ad0', lo: '#34186a', stud: '#ffd86b' },
};
const BUILD_SCALE = { skinny: 0.78, normal: 1.0, chonky: 1.24 };
const SIZE_SCALE  = { small: 0.78, medium: 1.0, large: 1.18 };

let _svgUid = 0;
function uid() { return `c${++_svgUid}`; }

/* ---------- shared gradient defs (cat) ---------- */
function catDefs(id, eye, collar) {
  const e = EYE_PALETTE[eye];
  const c = COLLAR_COLORS[collar];
  return `
    <defs>
      <radialGradient id="${id}-body" cx="42%" cy="35%" r="78%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.bodyHi}"/>
        <stop offset="55%" stop-color="${CAT_PALETTE.bodyMid}"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.bodyLo}"/>
      </radialGradient>
      <radialGradient id="${id}-belly" cx="50%" cy="20%" r="90%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.bodyHi}" stop-opacity="0"/>
        <stop offset="55%" stop-color="${CAT_PALETTE.bodyHi}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.bodyShadow}" stop-opacity="0.55"/>
      </radialGradient>
      <radialGradient id="${id}-points" cx="48%" cy="38%" r="68%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.pointsHi}"/>
        <stop offset="55%" stop-color="${CAT_PALETTE.pointsMid}"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.pointsLo}"/>
      </radialGradient>
      <radialGradient id="${id}-mask" cx="50%" cy="42%" r="60%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.pointsHi}" stop-opacity="0.05"/>
        <stop offset="55%" stop-color="${CAT_PALETTE.pointsMid}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.pointsLo}" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="${id}-mask-fade" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.pointsLo}" stop-opacity="0"/>
        <stop offset="40%" stop-color="${CAT_PALETTE.pointsMid}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.pointsLo}" stop-opacity="0.92"/>
      </linearGradient>
      <radialGradient id="${id}-ear" cx="50%" cy="55%" r="80%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.pointsHi}"/>
        <stop offset="60%" stop-color="${CAT_PALETTE.pointsMid}"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.pointsLo}"/>
      </radialGradient>
      <radialGradient id="${id}-ear-inner" cx="50%" cy="55%" r="80%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.innerEarHi}"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.innerEarLo}"/>
      </radialGradient>
      <radialGradient id="${id}-iris" cx="40%" cy="38%" r="70%">
        <stop offset="0%"  stop-color="${e.hi}"/>
        <stop offset="55%" stop-color="${e.mid}"/>
        <stop offset="100%" stop-color="${e.lo}"/>
      </radialGradient>
      <radialGradient id="${id}-nose" cx="40%" cy="35%" r="70%">
        <stop offset="0%"  stop-color="${CAT_PALETTE.noseHi}"/>
        <stop offset="100%" stop-color="${CAT_PALETTE.noseLo}"/>
      </radialGradient>
      ${c ? `
      <linearGradient id="${id}-collar" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"  stop-color="${c.hi}"/>
        <stop offset="55%" stop-color="${c.mid}"/>
        <stop offset="100%" stop-color="${c.lo}"/>
      </linearGradient>` : ''}
    </defs>
  `;
}

/* ---------- shared gradient defs (dog) ---------- */
function dogDefs(id, eye, collar) {
  const e = EYE_PALETTE[eye];
  const c = COLLAR_COLORS[collar];
  return `
    <defs>
      <radialGradient id="${id}-copper" cx="40%" cy="35%" r="80%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.copperHi}"/>
        <stop offset="55%" stop-color="${DOG_PALETTE.copperMid}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.copperLo}"/>
      </radialGradient>
      <radialGradient id="${id}-belly" cx="50%" cy="25%" r="85%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.copperHi}" stop-opacity="0"/>
        <stop offset="55%" stop-color="${DOG_PALETTE.copperHi}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.copperLo}" stop-opacity="0.6"/>
      </radialGradient>
      <radialGradient id="${id}-patch" cx="45%" cy="40%" r="65%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.patchHi}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.patchLo}"/>
      </radialGradient>
      <radialGradient id="${id}-white" cx="45%" cy="30%" r="80%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.whiteHi}"/>
        <stop offset="55%" stop-color="${DOG_PALETTE.whiteMid}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.whiteLo}"/>
      </radialGradient>
      <linearGradient id="${id}-feather" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.copperMid}"/>
        <stop offset="60%" stop-color="${DOG_PALETTE.copperLo}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.patchLo}"/>
      </linearGradient>
      <radialGradient id="${id}-ear" cx="50%" cy="35%" r="80%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.copperMid}"/>
        <stop offset="55%" stop-color="${DOG_PALETTE.copperLo}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.patchLo}"/>
      </radialGradient>
      <radialGradient id="${id}-ear-inner" cx="50%" cy="55%" r="80%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.innerEarHi}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.innerEarLo}"/>
      </radialGradient>
      <radialGradient id="${id}-iris" cx="40%" cy="38%" r="70%">
        <stop offset="0%"  stop-color="${e.hi}"/>
        <stop offset="55%" stop-color="${e.mid}"/>
        <stop offset="100%" stop-color="${e.lo}"/>
      </radialGradient>
      <radialGradient id="${id}-nose" cx="40%" cy="30%" r="80%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.noseHi}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.noseLo}"/>
      </radialGradient>
      <linearGradient id="${id}-tongue" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"  stop-color="${DOG_PALETTE.tongueHi}"/>
        <stop offset="100%" stop-color="${DOG_PALETTE.tongueLo}"/>
      </linearGradient>
      ${c ? `
      <linearGradient id="${id}-collar" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"  stop-color="${c.hi}"/>
        <stop offset="55%" stop-color="${c.mid}"/>
        <stop offset="100%" stop-color="${c.lo}"/>
      </linearGradient>` : ''}
    </defs>
  `;
}

/* ---------- eye builders ---------- */
// Cat eye: almond shape, vertical slit pupil
function catEye(id, cx, cy, w, h, tilt = 0, closed = false) {
  if (closed) {
    return `
      <g transform="rotate(${tilt} ${cx} ${cy})">
        <path d="M ${cx - w} ${cy} Q ${cx} ${cy + h*0.35} ${cx + w} ${cy}"
              stroke="${CAT_PALETTE.outline}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M ${cx - w*0.85} ${cy - h*0.2} l -6 -4
                 M ${cx} ${cy - h*0.25} l 0 -5
                 M ${cx + w*0.85} ${cy - h*0.2} l 6 -4"
              stroke="${CAT_PALETTE.outline}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.6"/>
      </g>`;
  }
  // almond clipping path so iris/pupil stay inside lid
  return `
    <g transform="rotate(${tilt} ${cx} ${cy})">
      <defs>
        <clipPath id="${id}-eyeclip-${Math.round(cx)}-${Math.round(cy)}">
          <path d="M ${cx - w} ${cy}
                   Q ${cx} ${cy - h*1.05} ${cx + w} ${cy}
                   Q ${cx} ${cy + h*1.05} ${cx - w} ${cy} Z"/>
        </clipPath>
      </defs>
      <!-- sclera -->
      <path d="M ${cx - w} ${cy}
               Q ${cx} ${cy - h*1.05} ${cx + w} ${cy}
               Q ${cx} ${cy + h*1.05} ${cx - w} ${cy} Z"
            fill="#fff8e8"/>
      <g clip-path="url(#${id}-eyeclip-${Math.round(cx)}-${Math.round(cy)})">
        <!-- iris fills most of the eye -->
        <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.92}" ry="${h * 1.0}" fill="url(#${id}-iris)"/>
        <!-- darker outer ring -->
        <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.92}" ry="${h * 1.0}" fill="none"
                 stroke="${EYE_PALETTE.blue.lo === EYE_PALETTE.blue.lo ? '' : ''}"/>
        <!-- vertical slit pupil -->
        <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.15}" ry="${h * 0.92}" fill="#0a0805"/>
        <!-- highlights -->
        <ellipse cx="${cx - w*0.32}" cy="${cy - h*0.45}" rx="${w*0.22}" ry="${h*0.28}" fill="#ffffff" opacity="0.92"/>
        <ellipse cx="${cx + w*0.28}" cy="${cy + h*0.35}" rx="${w*0.09}" ry="${h*0.12}" fill="#ffffff" opacity="0.65"/>
      </g>
      <!-- upper lid -->
      <path d="M ${cx - w*1.02} ${cy + h*0.05}
               Q ${cx} ${cy - h*1.15} ${cx + w*1.02} ${cy + h*0.05}"
            stroke="${CAT_PALETTE.outline}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- lower lid (subtle) -->
      <path d="M ${cx - w*1.02} ${cy - h*0.05}
               Q ${cx} ${cy + h*1.1} ${cx + w*1.02} ${cy - h*0.05}"
            stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.85"/>
    </g>`;
}

// Dog eye: rounder almond, round pupil
function dogEye(id, cx, cy, w, h, tilt = 0, closed = false) {
  if (closed) {
    return `
      <g transform="rotate(${tilt} ${cx} ${cy})">
        <path d="M ${cx - w} ${cy} Q ${cx} ${cy + h*0.4} ${cx + w} ${cy}"
              stroke="${DOG_PALETTE.outline}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g>`;
  }
  return `
    <g transform="rotate(${tilt} ${cx} ${cy})">
      <defs>
        <clipPath id="${id}-deyeclip-${Math.round(cx)}-${Math.round(cy)}">
          <path d="M ${cx - w} ${cy}
                   Q ${cx} ${cy - h*1.1} ${cx + w} ${cy}
                   Q ${cx} ${cy + h*1.0} ${cx - w} ${cy} Z"/>
        </clipPath>
      </defs>
      <path d="M ${cx - w} ${cy}
               Q ${cx} ${cy - h*1.1} ${cx + w} ${cy}
               Q ${cx} ${cy + h*1.0} ${cx - w} ${cy} Z"
            fill="#fff8e8"/>
      <g clip-path="url(#${id}-deyeclip-${Math.round(cx)}-${Math.round(cy)})">
        <circle cx="${cx}" cy="${cy + h*0.06}" r="${Math.min(w, h) * 0.92}" fill="url(#${id}-iris)"/>
        <circle cx="${cx}" cy="${cy + h*0.06}" r="${Math.min(w, h) * 0.42}" fill="#0a0805"/>
        <ellipse cx="${cx - w*0.28}" cy="${cy - h*0.32}" rx="${w*0.22}" ry="${h*0.24}" fill="#ffffff" opacity="0.92"/>
        <ellipse cx="${cx + w*0.25}" cy="${cy + h*0.3}" rx="${w*0.08}" ry="${h*0.1}" fill="#ffffff" opacity="0.6"/>
      </g>
      <path d="M ${cx - w*1.02} ${cy + h*0.05}
               Q ${cx} ${cy - h*1.2} ${cx + w*1.02} ${cy + h*0.05}"
            stroke="${DOG_PALETTE.outline}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M ${cx - w*1.02} ${cy - h*0.05}
               Q ${cx} ${cy + h*1.05} ${cx + w*1.02} ${cy - h*0.05}"
            stroke="${DOG_PALETTE.outline}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.75"/>
    </g>`;
}

/* ---------- collar builders ---------- */
function collarBand(id, collar, pathD, plateCX, plateCY, plateR) {
  if (collar === 'none') return '';
  return `
    <g class="collar">
      <path d="${pathD}" fill="url(#${id}-collar)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${plateCX}" cy="${plateCY}" r="${plateR}" fill="${COLLAR_COLORS[collar].stud}" stroke="${CAT_PALETTE.outline}" stroke-width="1.5"/>
      <circle cx="${plateCX - plateR*0.25}" cy="${plateCY - plateR*0.3}" r="${plateR*0.35}" fill="#ffffff" opacity="0.7"/>
    </g>`;
}

/* ---------- build/scale wrapper ---------- */
function buildScaleAttr(cx, cy, build) {
  const s = BUILD_SCALE[build] || 1;
  return `transform="translate(${cx} ${cy}) scale(${s} 1) translate(${-cx} ${-cy})"`;
}

/* ============================================================
   CAT POSES — 5 distinct designs
   ============================================================ */

/* ----- Cat 0: sitting upright (front view) ----- */
function catSitting(opts) {
  const id = uid();
  const cx = 200, cy = 280;
  const collarPath = `M 142 226 Q 200 260 258 226 Q 200 238 142 226 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${catDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="cat-${id}">

        <!-- TAIL behind body, curls around right side toward front -->
        <g class="tail-wag" style="transform-origin: 268px 320px;">
          <!-- tail base (cream) -->
          <path d="M 252 304
                   C 308 296 344 320 342 354
                   C 340 374 318 386 296 378
                   C 280 372 280 360 290 360
                   C 304 360 308 348 296 342
                   C 280 336 264 326 252 314 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <!-- darker point at tail tip -->
          <path d="M 322 318
                   C 348 326 348 364 322 378
                   C 304 384 286 376 296 368
                   C 308 364 312 354 300 348
                   C 296 344 304 338 314 332
                   C 320 328 322 322 322 318 Z"
                fill="url(#${id}-points)" opacity="0.9"/>
          <!-- fur blend band where point meets body -->
          <path d="M 308 310 q -10 6 -22 6" stroke="url(#${id}-mask-fade)" stroke-width="16" fill="none" opacity="0.5" stroke-linecap="round"/>
        </g>

        <!-- BODY group -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- HAUNCH bulges peek out at the sides (gives sitting shape) -->
          <path d="M 132 296
                   C 116 312 116 348 134 360
                   C 152 368 168 360 168 344
                   C 168 326 158 304 142 296 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 268 296
                   C 284 312 284 348 266 360
                   C 248 368 232 360 232 344
                   C 232 326 242 304 258 296 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>

          <!-- MAIN BODY: slim pear, narrows at chest, widens at base -->
          <path d="M 200 198
                   C 162 200 144 230 144 268
                   C 144 304 156 340 176 358
                   C 188 366 212 366 224 358
                   C 244 340 256 304 256 268
                   C 256 230 238 200 200 198 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- belly shadow -->
          <path d="M 200 198
                   C 162 200 144 230 144 268
                   C 144 304 156 340 176 358
                   C 188 366 212 366 224 358
                   C 244 340 256 304 256 268
                   C 256 230 238 200 200 198 Z"
                fill="url(#${id}-belly)" opacity="0.9"/>
          <!-- chest fluff (lighter cream) -->
          <path d="M 168 252
                   C 174 280 184 310 200 320
                   C 216 310 226 280 232 252
                   C 220 268 200 270 200 270
                   C 200 270 180 268 168 252 Z"
                fill="${CAT_PALETTE.bodyHi}" opacity="0.55"/>

          <!-- FRONT LEGS: tapered shapes emerging from body, paws splayed slightly outward -->
          <path d="M 168 308
                   C 158 320 156 348 160 366
                   C 162 374 170 378 180 378
                   C 188 378 192 374 192 366
                   C 196 348 196 320 188 308
                   C 184 304 174 304 168 308 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 212 308
                   C 204 320 204 348 208 366
                   C 208 374 212 378 220 378
                   C 230 378 238 374 240 366
                   C 244 348 242 320 232 308
                   C 226 304 216 304 212 308 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <!-- subtle muscle shading on legs -->
          <path d="M 162 322 q 4 22 6 42" stroke="${CAT_PALETTE.bodyShadow}" stroke-width="3" opacity="0.35" fill="none" stroke-linecap="round"/>
          <path d="M 238 322 q -4 22 -6 42" stroke="${CAT_PALETTE.bodyShadow}" stroke-width="3" opacity="0.35" fill="none" stroke-linecap="round"/>

          <!-- PAWS: point-colored, slightly larger and softer than the legs -->
          <ellipse cx="175" cy="380" rx="18" ry="10" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="225" cy="380" rx="18" ry="10" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <!-- where paws blend into legs: fur band -->
          <path d="M 162 372 q 14 -4 26 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55" stroke-linecap="round"/>
          <path d="M 212 372 q 14 -4 26 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55" stroke-linecap="round"/>
          <!-- toe definition -->
          <path d="M 168 381 q 0 -7 0 -11 M 175 381 q 0 -8 0 -12 M 182 381 q 0 -7 0 -11" stroke="${CAT_PALETTE.outline}" stroke-width="1" fill="none" opacity="0.55"/>
          <path d="M 218 381 q 0 -7 0 -11 M 225 381 q 0 -8 0 -12 M 232 381 q 0 -7 0 -11" stroke="${CAT_PALETTE.outline}" stroke-width="1" fill="none" opacity="0.55"/>

          <!-- collar -->
          ${collarBand(id, opts.collarColor, collarPath, 200, 240, 12)}
        </g>

        <!-- HEAD -->
        <g class="head">
          <!-- LEFT EAR: large triangular, slightly outward-tilted -->
          <path d="M 142 96
                   L 104 22
                   C 102 18 108 14 114 18
                   L 184 80
                   Q 170 100 142 96 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <!-- inner ear pink -->
          <path d="M 148 92 L 118 36 L 178 80 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- ear tuft hair hint -->
          <path d="M 110 24 q 4 4 8 8 M 116 30 q 4 4 6 6" stroke="${CAT_PALETTE.pointsLo}" stroke-width="1" fill="none" opacity="0.7"/>

          <!-- RIGHT EAR -->
          <path d="M 258 96
                   L 296 22
                   C 298 18 292 14 286 18
                   L 216 80
                   Q 230 100 258 96 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 252 92 L 282 36 L 222 80 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <path d="M 290 24 q -4 4 -8 8 M 284 30 q -4 4 -6 6" stroke="${CAT_PALETTE.pointsLo}" stroke-width="1" fill="none" opacity="0.7"/>

          <!-- HEAD WEDGE: wider at top, narrows to chin -->
          <path d="M 200 78
                   C 154 82 132 124 138 162
                   C 144 188 162 208 184 214
                   Q 200 218 216 214
                   C 238 208 256 188 262 162
                   C 268 124 246 82 200 78 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>

          <!-- FACE MASK (points) — covers eye area, brow, muzzle. Blends at bottom. -->
          <path d="M 158 110
                   C 152 138 154 164 168 184
                   C 178 198 222 198 232 184
                   C 246 164 248 138 242 110
                   C 226 122 200 126 200 126
                   C 200 126 174 122 158 110 Z"
                fill="url(#${id}-mask)" opacity="0.9"/>
          <!-- cheek cream patches (break up the mask, look like fur) -->
          <path d="M 152 172
                   C 158 188 174 200 192 200
                   C 188 192 184 178 188 168
                   C 174 168 160 168 152 172 Z"
                fill="url(#${id}-body)" opacity="0.88"/>
          <path d="M 248 172
                   C 242 188 226 200 208 200
                   C 212 192 216 178 212 168
                   C 226 168 240 168 248 172 Z"
                fill="url(#${id}-body)" opacity="0.88"/>
          <!-- forehead cream highlight (Siamese mask gap at top of head) -->
          <path d="M 188 92
                   C 196 86 204 86 212 92
                   C 208 102 200 108 200 108
                   C 200 108 192 102 188 92 Z"
                fill="${CAT_PALETTE.bodyHi}" opacity="0.7"/>

          <!-- EYES — slanted upward toward ears, almond shape -->
          ${catEye(id, 168, 146, 20, 13, -16)}
          ${catEye(id, 232, 146, 20, 13, 16)}

          <!-- NOSE: pink triangle with subtle rim shadow -->
          <path d="M 190 176
                   L 210 176
                   C 212 176 212 178 210 180
                   L 200 192
                   L 190 180
                   C 188 178 188 176 190 176 Z"
                fill="url(#${id}-nose)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3" stroke-linejoin="round"/>
          <!-- philtrum line -->
          <path d="M 200 192 L 200 200" stroke="${CAT_PALETTE.outline}" stroke-width="1.4" fill="none"/>
          <!-- mouth (subtle W) -->
          <path d="M 200 200 q -7 6 -13 4 M 200 200 q 7 6 13 4"
                stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <!-- chin shadow -->
          <path d="M 188 206 q 12 6 24 0" stroke="${CAT_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.4"/>

          <!-- WHISKERS — white over dark for depth -->
          <g stroke="${CAT_PALETTE.outline}" stroke-width="0.7" fill="none" opacity="0.45" stroke-linecap="round">
            <path d="M 178 188 q -28 -3 -42 -10 M 178 195 q -28 1 -42 3 M 178 202 q -25 7 -38 14"/>
            <path d="M 222 188 q 28 -3 42 -10 M 222 195 q 28 1 42 3 M 222 202 q 25 7 38 14"/>
          </g>
          <g stroke="${CAT_PALETTE.whiskerCol}" stroke-width="1.3" fill="none" opacity="0.9" stroke-linecap="round">
            <path d="M 178 188 q -28 -3 -42 -10 M 178 195 q -28 1 -42 3 M 178 202 q -25 7 -38 14"/>
            <path d="M 222 188 q 28 -3 42 -10 M 222 195 q 28 1 42 3 M 222 202 q 25 7 38 14"/>
          </g>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Cat 1: loaf ----- */
function catLoaf(opts) {
  const id = uid();
  const cx = 200, cy = 300;
  const collarPath = `M 150 240 Q 200 272 250 240 Q 200 252 150 240 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${catDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="cat-${id}">
        <!-- BODY: classic loaf — low oval, slightly humped at the shoulders -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- main loaf body -->
          <path d="M 84 304
                   C 84 252 130 226 200 226
                   C 270 226 316 252 316 304
                   C 316 340 286 358 240 362
                   L 160 362
                   C 114 358 84 340 84 304 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- belly shadow (underside darker) -->
          <path d="M 84 304
                   C 84 252 130 226 200 226
                   C 270 226 316 252 316 304
                   C 316 340 286 358 240 362
                   L 160 362
                   C 114 358 84 340 84 304 Z"
                fill="url(#${id}-belly)" opacity="0.95"/>
          <!-- shoulder/back highlight (top of loaf catches light) -->
          <path d="M 120 250
                   C 160 232 240 232 280 250"
                stroke="${CAT_PALETTE.bodyHi}" stroke-width="18" fill="none" opacity="0.6" stroke-linecap="round"/>
          <!-- subtle haunch bump on left side -->
          <ellipse cx="110" cy="312" rx="22" ry="32" fill="url(#${id}-body)" opacity="0.7"/>
          <!-- TAIL wrapping around right side, curling under -->
          <path d="M 296 302
                   C 336 296 350 318 344 342
                   C 338 360 318 366 304 360
                   C 296 354 302 346 312 346
                   C 322 344 322 334 312 332
                   C 304 330 296 314 290 308 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <!-- tail tip point colored -->
          <path d="M 326 322
                   C 344 326 344 354 326 360
                   C 312 364 300 358 306 354
                   C 318 350 320 340 310 338
                   C 308 336 314 332 322 326 Z"
                fill="url(#${id}-points)" opacity="0.92"/>
          <!-- TUCKED PAWS — just a hint of point color at front -->
          <path d="M 158 360
                   C 168 354 182 354 190 360
                   L 188 366
                   C 178 368 168 368 158 366 Z"
                fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.1" opacity="0.95"/>
          <path d="M 210 360
                   C 218 354 232 354 242 360
                   L 242 366
                   C 232 368 222 368 212 366 Z"
                fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.1" opacity="0.95"/>
          <!-- toe definition on tucked paws -->
          <path d="M 168 365 q 0 -4 0 -6 M 174 366 q 0 -5 0 -7 M 180 365 q 0 -4 0 -6" stroke="${CAT_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>
          <path d="M 220 365 q 0 -4 0 -6 M 226 366 q 0 -5 0 -7 M 232 365 q 0 -4 0 -6" stroke="${CAT_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>
          ${collarBand(id, opts.collarColor, collarPath, 200, 256, 11)}
        </g>

        <!-- HEAD on top of loaf -->
        <g class="head">
          <!-- LEFT EAR — large triangular -->
          <path d="M 144 108
                   L 110 38
                   C 108 34 114 30 120 34
                   L 188 96
                   Q 172 112 144 108 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 150 104 L 124 52 L 182 96 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- RIGHT EAR -->
          <path d="M 256 108
                   L 290 38
                   C 292 34 286 30 280 34
                   L 212 96
                   Q 228 112 256 108 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 250 104 L 276 52 L 218 96 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- HEAD WEDGE -->
          <path d="M 200 96
                   C 154 100 134 142 142 178
                   C 148 200 166 218 188 224
                   Q 200 228 212 224
                   C 234 218 252 200 258 178
                   C 266 142 246 100 200 96 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- MASK -->
          <path d="M 162 126
                   C 156 152 158 174 172 192
                   C 182 204 218 204 228 192
                   C 242 174 244 152 238 126
                   C 224 138 200 142 200 142
                   C 200 142 176 138 162 126 Z"
                fill="url(#${id}-mask)" opacity="0.88"/>
          <!-- cheek cream blending -->
          <path d="M 152 184 C 158 198 174 208 192 208 C 188 200 184 188 188 178 C 174 178 160 180 152 184 Z" fill="url(#${id}-body)" opacity="0.88"/>
          <path d="M 248 184 C 242 198 226 208 208 208 C 212 200 216 188 212 178 C 226 178 240 180 248 184 Z" fill="url(#${id}-body)" opacity="0.88"/>
          <!-- forehead cream patch -->
          <path d="M 188 106 C 196 100 204 100 212 106 C 208 116 200 122 200 122 C 200 122 192 116 188 106 Z" fill="${CAT_PALETTE.bodyHi}" opacity="0.7"/>
          <!-- EYES — relaxed, slightly squinted for loaf calm -->
          ${catEye(id, 172, 162, 17, 11, -14)}
          ${catEye(id, 228, 162, 17, 11, 14)}
          <!-- NOSE -->
          <path d="M 190 190 L 210 190 C 212 190 212 192 210 194 L 200 204 L 190 194 C 188 192 188 190 190 190 Z"
                fill="url(#${id}-nose)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M 200 204 L 200 212" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 200 212 q -7 6 -13 4 M 200 212 q 7 6 13 4" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <!-- WHISKERS -->
          <g stroke="${CAT_PALETTE.outline}" stroke-width="0.7" fill="none" opacity="0.45" stroke-linecap="round">
            <path d="M 180 200 q -26 -2 -38 -8 M 180 206 q -26 2 -38 4 M 180 212 q -22 6 -34 12"/>
            <path d="M 220 200 q 26 -2 38 -8 M 220 206 q 26 2 38 4 M 220 212 q 22 6 34 12"/>
          </g>
          <g stroke="${CAT_PALETTE.whiskerCol}" stroke-width="1.3" fill="none" opacity="0.9" stroke-linecap="round">
            <path d="M 180 200 q -26 -2 -38 -8 M 180 206 q -26 2 -38 4 M 180 212 q -22 6 -34 12"/>
            <path d="M 220 200 q 26 -2 38 -8 M 220 206 q 26 2 38 4 M 220 212 q 22 6 34 12"/>
          </g>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Cat 2: standing alert, side profile, tail up ----- */
function catStanding(opts) {
  const id = uid();
  const cx = 220, cy = 250;
  const collarPath = `M 96 196 Q 138 218 178 198 Q 138 208 96 196 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${catDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="cat-${id}">

        <!-- TAIL up, tapered, slight S-curve (classic Siamese alert tail) -->
        <g class="tail-wag" style="transform-origin: 330px 260px;">
          <path d="M 312 246
                   C 318 196 326 152 332 110
                   C 336 84 354 70 366 84
                   C 372 96 360 110 354 130
                   C 348 158 340 196 332 246
                   C 324 256 316 256 312 246 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.5"/>
          <!-- tail tip point color -->
          <path d="M 356 92
                   C 366 84 374 94 366 110
                   C 360 122 352 132 348 134
                   C 340 130 342 120 350 112
                   C 354 102 354 96 356 92 Z"
                fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <!-- blend band -->
          <path d="M 348 144 q 6 -4 12 -8" stroke="url(#${id}-mask-fade)" stroke-width="10" fill="none" opacity="0.5" stroke-linecap="round"/>
        </g>

        <!-- TORSO: elongated slim Siamese body (side profile) -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- BACK LEGS first (rear side) — tapered with subtle joint -->
          <path d="M 288 250
                   C 296 268 300 296 296 320
                   C 294 336 296 344 300 348
                   L 314 348
                   C 318 344 320 336 318 320
                   C 318 296 314 268 308 248 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 248 254
                   C 254 274 256 304 252 326
                   C 250 338 252 344 256 348
                   L 268 348
                   C 272 344 274 338 274 326
                   C 276 304 272 274 268 252 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>

          <!-- BODY OVAL: elongated, with subtle chest/haunch bulges -->
          <path d="M 120 196
                   C 90 200 78 232 92 264
                   C 80 282 96 304 130 304
                   C 200 312 280 308 308 282
                   C 322 268 322 244 312 224
                   C 304 208 286 198 268 196
                   C 220 188 160 188 120 196 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- haunch bulge (back hip) -->
          <ellipse cx="290" cy="244" rx="32" ry="40" fill="url(#${id}-body)" opacity="0.7"/>
          <!-- shoulder bulge (front) -->
          <ellipse cx="138" cy="232" rx="26" ry="34" fill="url(#${id}-body)" opacity="0.7"/>
          <!-- belly shading -->
          <path d="M 120 196 C 90 200 78 232 92 264 C 80 282 96 304 130 304 C 200 312 280 308 308 282 C 322 268 322 244 312 224 C 304 208 286 198 268 196 C 220 188 160 188 120 196 Z"
                fill="url(#${id}-belly)" opacity="0.95"/>
          <!-- back highlight strip -->
          <path d="M 140 196 q 80 -14 170 4" stroke="${CAT_PALETTE.bodyHi}" stroke-width="14" fill="none" opacity="0.55" stroke-linecap="round"/>

          <!-- FRONT LEGS (closer to viewer) — slim with subtle elbow curve -->
          <path d="M 132 286
                   C 124 308 120 332 124 348
                   C 124 354 130 358 138 358
                   L 152 358
                   C 152 348 150 332 152 314
                   C 154 296 152 282 148 280 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 168 290
                   C 162 312 160 334 162 350
                   C 162 356 168 360 174 360
                   L 188 360
                   C 190 350 188 334 188 316
                   C 188 298 186 284 182 282 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>

          <!-- POINTS on paws -->
          <ellipse cx="134" cy="358" rx="15" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="174" cy="360" rx="15" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="262" cy="350" rx="15" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="306" cy="350" rx="15" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <!-- paw/leg fur blend bands -->
          <path d="M 122 350 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>
          <path d="M 162 352 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>
          <path d="M 250 342 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>
          <path d="M 294 342 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>

          <!-- CHEST FLUFF -->
          <path d="M 108 220 C 100 248 110 268 130 272 C 132 250 124 232 116 218 Z" fill="${CAT_PALETTE.bodyHi}" opacity="0.55"/>
          ${collarBand(id, opts.collarColor, collarPath, 138, 208, 10)}
        </g>

        <!-- HEAD (side profile, facing left) — wedge with long muzzle -->
        <g class="head">
          <!-- back ear (further) -->
          <path d="M 140 130
                   L 158 76
                   C 160 72 166 76 164 82
                   L 156 132 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
          <!-- front ear (closer) — bigger -->
          <path d="M 100 148
                   L 76 76
                   C 74 70 82 66 90 70
                   L 132 138
                   Q 116 154 100 148 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 106 144 L 86 86 L 126 138 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>

          <!-- HEAD WEDGE in profile -->
          <path d="M 152 130
                   C 96 132 64 162 56 192
                   C 50 208 60 220 80 222
                   C 96 224 116 224 134 218
                   Q 152 212 162 200
                   Q 172 184 170 162
                   Q 168 144 158 132 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>

          <!-- MUZZLE / face point -->
          <path d="M 58 192
                   C 48 196 48 214 64 216
                   C 80 216 98 212 108 204
                   Q 116 196 112 188
                   C 96 184 76 184 58 192 Z"
                fill="url(#${id}-mask)" opacity="0.92"/>
          <!-- forehead point area -->
          <path d="M 110 138 C 134 132 156 138 162 152 Q 156 178 138 192 Q 116 184 108 156 Z" fill="url(#${id}-mask)" opacity="0.78"/>
          <!-- cheek cream patch -->
          <path d="M 92 200 C 102 216 122 222 138 218 C 130 208 124 196 126 184 C 114 188 100 192 92 200 Z" fill="url(#${id}-body)" opacity="0.85"/>

          <!-- EYE (one visible — slanted almond) -->
          ${catEye(id, 116, 180, 16, 11, -8)}
          <!-- brow shadow -->
          <path d="M 108 164 q 16 -6 24 0" stroke="${CAT_PALETTE.pointsLo}" stroke-width="2.5" fill="none" opacity="0.4" stroke-linecap="round"/>

          <!-- NOSE in profile -->
          <path d="M 56 196
                   L 50 200
                   C 48 203 50 207 54 208
                   L 62 209
                   Q 70 207 72 202
                   Q 72 196 62 194 Z"
                fill="url(#${id}-nose)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <!-- nose highlight -->
          <ellipse cx="58" cy="200" rx="3" ry="1.5" fill="#ffffff" opacity="0.7"/>
          <!-- mouth -->
          <path d="M 72 210 Q 84 218 96 213" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <!-- WHISKERS -->
          <g stroke="${CAT_PALETTE.outline}" stroke-width="0.7" fill="none" opacity="0.45" stroke-linecap="round">
            <path d="M 76 200 q -24 -3 -34 -8 M 76 206 q -24 2 -34 4 M 76 212 q -22 6 -32 12"/>
          </g>
          <g stroke="${CAT_PALETTE.whiskerCol}" stroke-width="1.3" fill="none" opacity="0.92" stroke-linecap="round">
            <path d="M 76 200 q -24 -3 -34 -8 M 76 206 q -24 2 -34 4 M 76 212 q -22 6 -32 12"/>
          </g>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Cat 3: playful pounce (side view, butt up, front down) ----- */
function catPounce(opts) {
  const id = uid();
  const cx = 230, cy = 240;
  const collarPath = `M 100 274 Q 144 298 184 280 Q 144 290 100 274 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${catDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="cat-${id}">

        <!-- TAIL: swooping up and back -->
        <g class="tail-wag" style="transform-origin: 320px 220px;">
          <path d="M 308 226
                   C 348 200 376 168 366 130
                   C 360 112 340 116 336 130
                   C 332 146 348 162 348 184
                   C 348 204 332 226 312 240 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.5"/>
          <!-- tail tip point colored -->
          <path d="M 360 120
                   C 370 112 374 124 366 140
                   C 358 152 350 158 346 156
                   C 340 150 348 138 354 130
                   C 358 122 358 120 360 120 Z"
                fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <path d="M 344 160 q 6 -4 12 -8" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.5"/>
        </g>

        <!-- BODY: single curved silhouette with raised back, low front -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- single continuous body -->
          <path d="M 96 290
                   C 80 296 70 312 76 326
                   C 84 340 110 340 134 332
                   C 150 326 168 318 184 310
                   C 200 302 220 296 240 290
                   C 274 280 308 264 320 240
                   C 326 222 320 196 300 184
                   C 270 168 230 170 198 188
                   C 168 204 138 232 116 260
                   C 104 274 96 282 96 290 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- raised haunch (back hip muscle) -->
          <ellipse cx="270" cy="222" rx="40" ry="48" fill="url(#${id}-body)" opacity="0.65"/>
          <!-- belly shading -->
          <path d="M 96 290 C 80 296 70 312 76 326 C 84 340 110 340 134 332 C 150 326 168 318 184 310 C 200 302 220 296 240 290 C 274 280 308 264 320 240 C 326 222 320 196 300 184 C 270 168 230 170 198 188 C 168 204 138 232 116 260 C 104 274 96 282 96 290 Z"
                fill="url(#${id}-belly)" opacity="0.9"/>
          <!-- back highlight strip -->
          <path d="M 130 264 q 70 -50 170 -76" stroke="${CAT_PALETTE.bodyHi}" stroke-width="14" fill="none" opacity="0.55" stroke-linecap="round"/>

          <!-- BACK LEG (tucked, only one visible) -->
          <path d="M 282 268
                   C 296 286 306 312 302 340
                   C 300 354 304 360 310 360
                   L 326 360
                   C 330 350 332 332 326 314
                   C 320 296 308 274 296 264 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <ellipse cx="318" cy="362" rx="16" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <path d="M 306 354 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>

          <!-- FRONT LEGS splayed forward -->
          <path d="M 100 320
                   C 84 332 70 346 64 358
                   C 62 364 70 366 80 364
                   C 96 360 110 354 122 348
                   C 132 342 128 332 118 326 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 138 322
                   C 126 334 116 348 112 360
                   C 112 366 122 368 132 366
                   C 148 362 162 354 174 346
                   C 184 340 178 330 168 326 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <!-- PAWS point colored -->
          <ellipse cx="72" cy="362" rx="16" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="124" cy="364" rx="16" ry="7" fill="url(#${id}-points)" stroke="${CAT_PALETTE.outline}" stroke-width="1.2"/>
          <path d="M 64 358 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>
          <path d="M 114 360 q 12 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="8" fill="none" opacity="0.55"/>

          ${collarBand(id, opts.collarColor, collarPath, 144, 286, 10)}
        </g>

        <!-- HEAD low (closer to ground), looking forward (left) -->
        <g class="head">
          <!-- back ear -->
          <path d="M 138 234
                   L 154 188
                   C 156 184 162 186 162 190
                   L 158 234 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4" opacity="0.9"/>
          <!-- front ear -->
          <path d="M 98 248
                   L 80 192
                   C 78 186 86 184 92 188
                   L 132 240
                   Q 116 254 98 248 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 104 244 L 88 196 L 126 240 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- head -->
          <path d="M 150 246
                   C 96 244 64 270 60 296
                   C 56 312 68 326 90 326
                   C 116 326 138 320 154 304
                   Q 166 290 168 270
                   Q 168 252 158 244 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- muzzle / mask -->
          <path d="M 60 292
                   C 50 296 50 312 64 314
                   C 80 316 96 312 106 304
                   Q 114 296 110 286
                   C 94 284 76 286 60 292 Z"
                fill="url(#${id}-mask)" opacity="0.92"/>
          <!-- forehead point -->
          <path d="M 110 244 C 132 240 154 246 162 258 Q 156 282 138 296 Q 116 286 108 260 Z" fill="url(#${id}-mask)" opacity="0.75"/>
          <!-- cheek cream -->
          <path d="M 96 304 C 106 318 122 322 138 318 C 130 308 124 296 126 286 C 114 290 102 296 96 304 Z" fill="url(#${id}-body)" opacity="0.85"/>
          <!-- eye -->
          ${catEye(id, 118, 280, 15, 11, -8)}
          <path d="M 110 264 q 14 -6 22 0" stroke="${CAT_PALETTE.pointsLo}" stroke-width="2.5" fill="none" opacity="0.4" stroke-linecap="round"/>
          <!-- nose -->
          <path d="M 56 296 L 50 300 C 48 303 50 307 54 308 L 62 309 Q 70 307 72 302 Q 72 296 62 294 Z"
                fill="url(#${id}-nose)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="58" cy="300" rx="3" ry="1.5" fill="#ffffff" opacity="0.7"/>
          <!-- mouth (playful smile) -->
          <path d="M 72 310 Q 84 318 96 313" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <g stroke="${CAT_PALETTE.outline}" stroke-width="0.7" fill="none" opacity="0.45" stroke-linecap="round">
            <path d="M 76 300 q -24 -3 -34 -8 M 76 306 q -24 2 -34 4 M 76 312 q -22 6 -32 12"/>
          </g>
          <g stroke="${CAT_PALETTE.whiskerCol}" stroke-width="1.3" fill="none" opacity="0.92" stroke-linecap="round">
            <path d="M 76 300 q -24 -3 -34 -8 M 76 306 q -24 2 -34 4 M 76 312 q -22 6 -32 12"/>
          </g>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Cat 4: sleepy curled ball ----- */
function catCurled(opts) {
  const id = uid();
  const cx = 200, cy = 250;
  const collarPath = `M 162 208 Q 200 226 238 208 Q 200 218 162 208 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${catDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="cat-${id}">
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- BODY: curled ball, more egg-shaped than perfect circle -->
          <path d="M 76 264
                   C 78 196 132 144 200 142
                   C 268 144 322 196 324 264
                   C 322 314 282 348 220 352
                   L 180 352
                   C 118 348 78 314 76 264 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- belly shading underneath -->
          <path d="M 76 264 C 78 196 132 144 200 142 C 268 144 322 196 324 264 C 322 314 282 348 220 352 L 180 352 C 118 348 78 314 76 264 Z"
                fill="url(#${id}-belly)" opacity="0.95"/>
          <!-- back highlight along top -->
          <path d="M 120 186 q 80 -28 160 0" stroke="${CAT_PALETTE.bodyHi}" stroke-width="16" fill="none" opacity="0.6" stroke-linecap="round"/>

          <!-- TAIL wrapping around front (from left side, curving in front of body, tip near right) -->
          <path d="M 88 272
                   C 70 296 80 332 116 344
                   C 168 354 232 354 282 342
                   C 316 332 332 304 318 282
                   C 306 270 286 274 278 286
                   C 256 312 216 322 178 316
                   C 138 308 116 290 108 270 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <!-- tail tip dark point at the right end where it lays -->
          <path d="M 308 282
                   C 326 282 332 304 318 318
                   C 304 326 290 324 286 318
                   C 290 312 302 308 300 300
                   C 298 292 304 286 308 282 Z"
                fill="url(#${id}-points)" opacity="0.92"/>
          <!-- blend band where tail point meets cream -->
          <path d="M 290 304 q -10 4 -16 8" stroke="url(#${id}-mask-fade)" stroke-width="10" fill="none" opacity="0.55"/>

          <!-- one tucked paw hint on left peeking from under -->
          <ellipse cx="160" cy="338" rx="22" ry="5" fill="url(#${id}-points)" opacity="0.9" stroke="${CAT_PALETTE.outline}" stroke-width="1.1"/>
          <path d="M 150 336 q 22 -3 22 0" stroke="url(#${id}-mask-fade)" stroke-width="6" fill="none" opacity="0.5"/>
          ${collarBand(id, opts.collarColor, collarPath, 200, 220, 10)}
        </g>

        <!-- HEAD resting on top of curled body -->
        <g class="head">
          <!-- LEFT EAR -->
          <path d="M 148 116
                   L 116 50
                   C 114 46 120 42 126 46
                   L 190 108
                   Q 174 122 148 116 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 154 112 L 128 62 L 184 108 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- RIGHT EAR -->
          <path d="M 252 116
                   L 284 50
                   C 286 46 280 42 274 46
                   L 210 108
                   Q 226 122 252 116 Z"
                fill="url(#${id}-ear)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 246 112 L 272 62 L 216 108 Z" fill="url(#${id}-ear-inner)" opacity="0.95"/>
          <!-- HEAD WEDGE -->
          <path d="M 200 100
                   C 158 102 138 142 144 178
                   C 150 200 168 216 200 218
                   C 232 216 250 200 256 178
                   C 262 142 242 102 200 100 Z"
                fill="url(#${id}-body)" stroke="${CAT_PALETTE.outline}" stroke-width="1.6"/>
          <!-- MASK (softer for sleeping cat) -->
          <path d="M 168 132
                   C 162 158 164 178 178 196
                   C 188 208 212 208 222 196
                   C 236 178 238 158 232 132
                   C 218 142 200 146 200 146
                   C 200 146 182 142 168 132 Z"
                fill="url(#${id}-mask)" opacity="0.85"/>
          <path d="M 156 184 C 162 198 178 208 192 208 C 188 200 184 188 188 178 C 174 178 162 180 156 184 Z" fill="url(#${id}-body)" opacity="0.88"/>
          <path d="M 244 184 C 238 198 222 208 208 208 C 212 200 216 188 212 178 C 226 178 238 180 244 184 Z" fill="url(#${id}-body)" opacity="0.88"/>
          <path d="M 188 112 C 196 106 204 106 212 112 C 208 122 200 128 200 128 C 200 128 192 122 188 112 Z" fill="${CAT_PALETTE.bodyHi}" opacity="0.6"/>
          <!-- CLOSED EYES with eyelashes -->
          ${catEye(id, 178, 168, 16, 10, -10, true)}
          ${catEye(id, 222, 168, 16, 10, 10, true)}
          <!-- NOSE -->
          <path d="M 190 192 L 210 192 C 212 192 212 194 210 196 L 200 206 L 190 196 C 188 194 188 192 190 192 Z"
                fill="url(#${id}-nose)" stroke="${CAT_PALETTE.outline}" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M 200 206 L 200 212" stroke="${CAT_PALETTE.outline}" stroke-width="1.4"/>
          <!-- contented little smile -->
          <path d="M 200 212 q -7 4 -12 1 M 200 212 q 7 4 12 1"
                stroke="${CAT_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <g stroke="${CAT_PALETTE.whiskerCol}" stroke-width="1.2" fill="none" opacity="0.85" stroke-linecap="round">
            <path d="M 180 206 q -22 -3 -32 -6 M 180 212 q -22 4 -32 6"/>
            <path d="M 220 206 q 22 -3 32 -6 M 220 212 q 22 4 32 6"/>
          </g>
        </g>
      </g>
    </svg>
  `;
}

const CAT_RENDERERS = [catSitting, catLoaf, catStanding, catPounce, catCurled];
const CAT_LABELS = ['Sitting', 'Loaf', 'Alert', 'Pounce', 'Sleepy'];

/* ============================================================
   DOG POSES — 5 distinct red-merle Australian Shepherds
   ============================================================ */

/* helper: a few merle patches the dog body can borrow */
function merlePatches(id) {
  return `
    <ellipse cx="-30" cy="-10" rx="22" ry="14" fill="url(#${id}-patch)" opacity="0.85"/>
    <ellipse cx="14"  cy="-22" rx="14" ry="10" fill="url(#${id}-patch)" opacity="0.8"/>
    <ellipse cx="32"  cy="6"   rx="20" ry="12" fill="url(#${id}-patch)" opacity="0.85"/>
    <ellipse cx="-8"  cy="20"  rx="16" ry="10" fill="url(#${id}-patch)" opacity="0.78"/>
  `;
}

/* ----- Dog 0: sitting (front view) — Aussie with one floppy right ear ----- */
function dogSitting(opts) {
  const id = uid();
  const cx = 200, cy = 290;
  const collarPath = `M 144 226 Q 200 258 256 226 Q 200 240 144 226 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${dogDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="dog-${id}">

        <!-- BODY group -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- Visible HAUNCH bulges at sides — copper with merle (outer edges show through) -->
          <path d="M 124 296
                   C 104 312 102 358 122 374
                   C 144 386 168 376 168 358
                   C 168 338 156 308 138 298 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 276 296
                   C 296 312 298 358 278 374
                   C 256 386 232 376 232 358
                   C 232 338 244 308 262 298 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- merle patches on haunches -->
          <path d="M 116 320 Q 130 314 142 322 Q 138 340 122 342 Q 112 332 116 320 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 282 320 Q 268 314 256 322 Q 260 340 276 342 Q 286 332 282 320 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 142 360 Q 158 358 168 365 Q 162 375 148 374 Q 138 368 142 360 Z" fill="url(#${id}-patch)" opacity="0.78"/>
          <path d="M 256 360 Q 242 358 232 365 Q 238 375 252 374 Q 262 368 256 360 Z" fill="url(#${id}-patch)" opacity="0.78"/>
          <!-- white blends into the inner edge of each haunch -->
          <path d="M 150 350 C 158 360 168 360 168 350 Q 158 348 150 350 Z" fill="url(#${id}-white)" opacity="0.95"/>
          <path d="M 250 350 C 242 360 232 360 232 350 Q 242 348 250 350 Z" fill="url(#${id}-white)" opacity="0.95"/>

          <!-- MAIN BODY (copper base — outer rim shows through) -->
          <path d="M 200 200
                   C 152 204 132 240 134 282
                   C 134 320 152 358 178 372
                   C 192 378 208 378 222 372
                   C 248 358 266 320 266 282
                   C 268 240 248 204 200 200 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- merle patches around the upper shoulders (where copper is still visible) -->
          <path d="M 142 236 Q 156 230 168 238 Q 164 254 148 256 Q 134 250 142 236 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 258 236 Q 244 230 232 238 Q 236 254 252 256 Q 266 250 258 236 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 152 220 Q 162 216 170 220 Q 166 230 158 232 Q 148 228 152 220 Z" fill="url(#${id}-patch)" opacity="0.78"/>
          <path d="M 248 220 Q 238 216 230 220 Q 234 230 242 232 Q 252 228 248 220 Z" fill="url(#${id}-patch)" opacity="0.78"/>

          <!-- LARGE WHITE CHEST/BELLY — covers most of the front, leaves copper visible only on the upper shoulders -->
          <path d="M 200 208
                   C 170 210 152 240 148 274
                   C 144 318 162 360 200 372
                   C 238 360 256 318 252 274
                   C 248 240 230 210 200 208 Z"
                fill="url(#${id}-white)"/>
          <!-- belly shadow over copper edges -->
          <path d="M 200 200 C 152 204 132 240 134 282 C 134 320 152 358 178 372 C 192 378 208 378 222 372 C 248 358 266 320 266 282 C 268 240 248 204 200 200 Z"
                fill="url(#${id}-belly)" opacity="0.55"/>
          <!-- subtle white feathering tuft on chest -->
          <path d="M 184 244 C 192 270 200 286 216 248 C 214 272 208 286 200 290 C 192 286 188 274 184 244 Z" fill="${DOG_PALETTE.whiteHi}" opacity="0.6"/>

          <!-- FRONT LEGS — now ENTIRELY white -->
          <path d="M 164 316
                   C 156 332 154 360 160 376
                   C 162 384 170 388 180 388
                   L 196 388
                   C 196 376 196 360 198 340
                   C 200 320 198 312 192 312 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 208 312
                   C 202 320 200 340 202 360
                   C 204 376 204 388 204 388
                   L 220 388
                   C 230 388 238 384 240 376
                   C 246 360 244 332 236 316 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <!-- subtle shading on legs to keep depth (otherwise pure white is flat) -->
          <path d="M 170 340 q 4 22 4 42" stroke="${DOG_PALETTE.whiteLo}" stroke-width="3" opacity="0.45" fill="none" stroke-linecap="round"/>
          <path d="M 230 340 q -4 22 -4 42" stroke="${DOG_PALETTE.whiteLo}" stroke-width="3" opacity="0.45" fill="none" stroke-linecap="round"/>
          <!-- toe lines -->
          <path d="M 174 388 q 0 -8 0 -14 M 182 388 q 0 -9 0 -15 M 190 388 q 0 -8 0 -14"
                stroke="${DOG_PALETTE.outline}" stroke-width="1" fill="none" opacity="0.55"/>
          <path d="M 210 388 q 0 -8 0 -14 M 218 388 q 0 -9 0 -15 M 226 388 q 0 -8 0 -14"
                stroke="${DOG_PALETTE.outline}" stroke-width="1" fill="none" opacity="0.55"/>
          <!-- PAWS -->
          <ellipse cx="180" cy="390" rx="20" ry="8" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="220" cy="390" rx="20" ry="8" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          ${collarBand(id, opts.collarColor, collarPath, 200, 240, 12)}
        </g>

        <!-- HEAD (front view) -->
        <g class="head">

          <!-- LEFT EAR (dog's RIGHT) — FLOPPY: upper portion folds forward and down -->
          <!-- short standing base portion -->
          <path d="M 142 110
                   C 134 100 128 90 128 80
                   L 168 96
                   Q 158 110 142 110 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <!-- the FOLDED tip — a tongue-shaped flap that bends forward and points down -->
          <path d="M 128 80
                   C 122 64 132 50 146 54
                   C 162 60 176 80 178 100
                   C 178 110 172 116 162 114
                   C 152 110 142 100 134 90
                   C 130 86 128 82 128 80 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5" stroke-linejoin="round"/>
          <!-- underside of fold (darker — the inside of the ear is showing) -->
          <path d="M 134 70
                   C 142 64 152 66 160 74
                   C 168 86 172 100 168 108
                   C 162 112 154 108 148 100
                   C 142 92 136 80 134 70 Z"
                fill="${DOG_PALETTE.copperLo}" opacity="0.6"/>
          <!-- pink inside-fur peeking in the fold -->
          <path d="M 142 78 C 148 76 154 80 158 88 C 162 96 158 102 152 100 C 146 94 142 86 142 78 Z"
                fill="url(#${id}-ear-inner)" opacity="0.7"/>
          <!-- crease line where the ear folds -->
          <path d="M 128 82 q 8 -4 20 0" stroke="${DOG_PALETTE.outline}" stroke-width="1.2" fill="none" opacity="0.55"/>

          <!-- RIGHT EAR (dog's LEFT) — standing upright with the standard subtle fold -->
          <path d="M 258 110
                   C 278 92 290 62 284 36
                   C 278 30 268 36 262 50
                   C 252 70 242 90 230 108 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 284 36
                   C 278 30 268 36 262 50
                   C 256 60 248 76 242 88
                   C 254 88 268 80 278 64
                   C 284 52 286 42 284 36 Z"
                fill="${DOG_PALETTE.copperLo}" opacity="0.55"/>
          <path d="M 262 96 C 270 80 272 60 266 50 C 254 64 244 82 236 102 Q 246 110 262 96 Z"
                fill="url(#${id}-ear-inner)" opacity="0.85"/>
          <path d="M 278 52 q -18 -2 -30 18" stroke="${DOG_PALETTE.outline}" stroke-width="1" fill="none" opacity="0.55"/>

          <!-- HEAD: broader at top, narrows to muzzle (copper base) -->
          <path d="M 200 88
                   C 150 90 128 132 134 178
                   C 140 206 162 224 188 230
                   Q 200 232 212 230
                   C 238 224 260 206 266 178
                   C 272 132 250 90 200 88 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- merle patches only at the upper corners where copper still shows -->
          <path d="M 142 132 Q 158 124 168 132 Q 164 150 148 152 Q 134 144 142 132 Z" fill="url(#${id}-patch)" opacity="0.9"/>
          <path d="M 258 132 Q 242 124 232 132 Q 236 150 252 152 Q 266 144 258 132 Z" fill="url(#${id}-patch)" opacity="0.9"/>

          <!-- WIDE WHITE FACE — covers almost the entire front of the face -->
          <path d="M 200 92
                   C 178 96 162 116 160 144
                   C 158 168 158 192 164 210
                   C 172 222 184 230 200 232
                   C 216 230 228 222 236 210
                   C 242 192 242 168 240 144
                   C 238 116 222 96 200 92 Z"
                fill="url(#${id}-white)"/>
          <!-- WHITE MUZZLE (covers all the lower face) -->
          <path d="M 174 184
                   C 168 204 174 226 200 228
                   C 226 226 232 204 226 184
                   C 220 176 200 174 200 174
                   C 200 174 180 176 174 184 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <!-- subtle shadow at edges of white face for dimension -->
          <path d="M 200 92 C 178 96 162 116 160 144 C 158 168 158 192 164 210 C 172 222 184 230 200 232 C 216 230 228 222 236 210 C 242 192 242 168 240 144 C 238 116 222 96 200 92 Z"
                fill="url(#${id}-belly)" opacity="0.35"/>

          <!-- EYES — set under brow ridge -->
          ${dogEye(id, 172, 160, 16, 13, -10)}
          ${dogEye(id, 228, 160, 16, 13, 10)}
          <!-- BROW RIDGE — soft copper shadows above eyes (since white face, brow needs to read) -->
          <path d="M 152 142 C 168 134 184 134 192 142" stroke="${DOG_PALETTE.copperMid}" stroke-width="3.5" fill="none" opacity="0.55" stroke-linecap="round"/>
          <path d="M 208 142 C 216 134 232 134 248 142" stroke="${DOG_PALETTE.copperMid}" stroke-width="3.5" fill="none" opacity="0.55" stroke-linecap="round"/>

          <!-- NOSE: black triangular -->
          <path d="M 188 188
                   C 184 184 184 180 188 178
                   L 212 178
                   C 216 180 216 184 212 188
                   L 208 196
                   C 204 200 196 200 192 196 Z"
                fill="url(#${id}-nose)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4" stroke-linejoin="round"/>
          <ellipse cx="195" cy="190" rx="2" ry="3" fill="#000"/>
          <ellipse cx="205" cy="190" rx="2" ry="3" fill="#000"/>
          <ellipse cx="196" cy="182" rx="3" ry="1.5" fill="#ffffff" opacity="0.85"/>
          <!-- mouth -->
          <path d="M 200 202 L 200 212" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <path d="M 200 212 q -10 8 -16 4 M 200 212 q 10 8 16 4"
                stroke="${DOG_PALETTE.outline}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          <path d="M 186 218 q 14 5 28 0" stroke="${DOG_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.4"/>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Dog 1: lying down sphinx pose (side view, paws extended) ----- */
function dogSphinx(opts) {
  const id = uid();
  const cx = 220, cy = 300;
  const collarPath = `M 96 232 Q 138 254 178 234 Q 138 244 96 232 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${dogDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="dog-${id}">

        <!-- TAIL feathered, lying behind body -->
        <g class="tail-wag" style="transform-origin: 332px 296px;">
          <path d="M 318 296
                   C 348 286 376 286 380 312
                   C 380 330 360 340 348 332
                   C 358 326 360 312 350 308
                   C 338 306 326 312 320 314 Z"
                fill="url(#${id}-feather)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- tail feathering wisps -->
          <path d="M 348 316 q 18 -2 24 -8 M 340 322 q 22 0 30 -6" stroke="${DOG_PALETTE.copperLo}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.65"/>
        </g>

        <!-- BODY: lying flat, head end on left, back end on right -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- main lying body (copper base) -->
          <path d="M 92 266
                   C 64 278 64 326 108 338
                   C 200 354 290 348 320 322
                   C 348 296 340 264 310 256
                   C 240 240 134 248 92 266 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- haunch bulge (back end) -->
          <ellipse cx="290" cy="290" rx="46" ry="38" fill="url(#${id}-copper)" opacity="0.65"/>
          <!-- merle patches on the back saddle (only in copper areas) -->
          <path d="M 180 252 Q 200 246 214 256 Q 210 274 188 274 Q 174 268 180 252 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 234 254 Q 252 248 266 258 Q 262 276 244 278 Q 230 270 234 254 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <path d="M 280 268 Q 296 264 308 272 Q 304 286 290 288 Q 276 282 280 268 Z" fill="url(#${id}-patch)" opacity="0.82"/>
          <!-- BIG WHITE belly/side area covering most of the body -->
          <path d="M 100 296
                   C 96 320 130 340 200 346
                   C 270 340 308 322 314 298
                   C 280 304 240 308 200 308
                   C 160 308 130 304 100 296 Z"
                fill="url(#${id}-white)"/>
          <!-- belly shading (subtle) -->
          <path d="M 92 266 C 64 278 64 326 108 338 C 200 354 290 348 320 322 C 348 296 340 264 310 256 C 240 240 134 248 92 266 Z"
                fill="url(#${id}-belly)" opacity="0.55"/>
          <!-- back highlight along the spine -->
          <path d="M 130 260 q 90 -10 180 4" stroke="${DOG_PALETTE.copperHi}" stroke-width="14" fill="none" opacity="0.5" stroke-linecap="round"/>

          <!-- FRONT PAWS extended FORWARD (sphinx pose) — now ENTIRELY white -->
          <path d="M 108 330
                   C 80 340 56 354 50 366
                   C 50 372 60 372 70 370
                   C 86 366 102 360 116 352
                   C 126 346 122 336 116 332 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 144 334
                   C 122 344 104 356 100 368
                   C 100 374 110 374 120 372
                   C 134 368 150 362 162 354
                   C 172 348 168 338 160 334 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <!-- PAWS -->
          <ellipse cx="62" cy="372" rx="16" ry="6" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="108" cy="374" rx="16" ry="6" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <path d="M 56 372 q 0 -5 0 -8 M 62 372 q 0 -6 0 -9 M 68 372 q 0 -5 0 -8" stroke="${DOG_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>
          <path d="M 102 374 q 0 -5 0 -8 M 108 374 q 0 -6 0 -9 M 114 374 q 0 -5 0 -8" stroke="${DOG_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>

          <!-- BACK LEG tucked along body — white with copper upper -->
          <path d="M 292 322
                   C 308 334 318 342 320 354
                   C 320 360 312 362 304 362
                   L 286 362
                   C 272 354 270 340 274 326 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <ellipse cx="300" cy="362" rx="16" ry="6" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <path d="M 290 358 q 14 -3 22 0" stroke="url(#${id}-feather)" stroke-width="6" fill="none" opacity="0.55"/>
          ${collarBand(id, opts.collarColor, collarPath, 138, 244, 10)}
        </g>

        <!-- HEAD up alert (sphinx) -->
        <g class="head">
          <!-- back ear (further from viewer) - folded -->
          <path d="M 138 144
                   C 152 110 158 76 144 70
                   C 130 76 122 96 122 130
                   Q 124 144 138 144 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4" opacity="0.9"/>
          <path d="M 144 70 C 130 76 122 96 122 130 C 132 124 142 110 144 90 C 145 80 145 74 144 70 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.45"/>

          <!-- front ear (closer) - Aussie folded -->
          <path d="M 96 156
                   C 86 116 84 78 100 70
                   C 116 76 124 100 130 144
                   Q 124 168 96 156 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <!-- folded tip overlay -->
          <path d="M 100 70 C 116 76 124 100 130 144 Q 122 156 110 152 C 102 122 96 96 92 80 C 92 72 96 68 100 70 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.5"/>
          <path d="M 104 148 C 100 116 100 90 108 80 C 118 96 124 124 124 148 Q 116 152 104 148 Z" fill="url(#${id}-ear-inner)" opacity="0.85"/>

          <!-- HEAD profile (copper base) -->
          <path d="M 154 156
                   C 102 152 68 184 60 216
                   C 56 234 70 246 96 248
                   C 124 248 146 244 164 228
                   Q 178 214 178 192
                   Q 178 168 168 154 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- WIDE WHITE face — covers most of front, copper only at top -->
          <path d="M 90 192
                   C 70 200 70 224 90 234
                   C 110 240 140 238 158 230
                   Q 172 222 170 200
                   Q 168 184 152 178
                   C 130 178 108 184 90 192 Z"
                fill="url(#${id}-white)"/>
          <!-- copper top stays visible: small merle patch -->
          <path d="M 156 174 Q 168 168 176 174 Q 174 188 162 190 Q 150 184 156 174 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <!-- muzzle (white) -->
          <path d="M 60 212
                   C 48 216 48 234 64 238
                   C 88 240 110 236 124 226
                   Q 136 218 132 208
                   C 112 204 80 204 60 212 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- eye -->
          ${dogEye(id, 120, 198, 14, 11, -5)}
          <!-- brow ridge -->
          <path d="M 108 182 C 116 176 128 176 134 182" stroke="${DOG_PALETTE.copperMid}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
          <!-- nose -->
          <path d="M 56 214 C 50 212 48 218 50 222 L 50 226 C 52 230 60 230 62 226 L 70 224 Q 76 220 74 212 Q 70 208 62 208 Z"
                fill="url(#${id}-nose)" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="56" cy="220" rx="2" ry="2.5" fill="#000"/>
          <ellipse cx="58" cy="214" rx="3" ry="1.5" fill="#ffffff" opacity="0.85"/>
          <!-- mouth -->
          <path d="M 70 234 Q 84 244 96 238" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Dog 2: standing alert (side view) ----- */
function dogStanding(opts) {
  const id = uid();
  const cx = 210, cy = 240;
  const collarPath = `M 90 204 Q 132 226 172 206 Q 132 216 90 204 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${dogDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="dog-${id}">

        <!-- TAIL: feathered, raised slightly with plumes -->
        <g class="tail-wag" style="transform-origin: 320px 226px;">
          <path d="M 312 234
                   C 342 208 358 180 362 154
                   C 364 138 348 132 342 144
                   C 336 168 322 196 308 222
                   Z"
                fill="url(#${id}-feather)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- feathering plumes -->
          <path d="M 320 204 q 20 -6 28 -22 M 328 188 q 18 -10 22 -26 M 314 220 q 22 -4 28 -16"
                stroke="${DOG_PALETTE.copperLo}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.7"/>
          <path d="M 328 180 q 14 -8 18 -22 M 332 168 q 12 -8 16 -20"
                stroke="${DOG_PALETTE.whiteHi}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
        </g>

        <!-- TORSO -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- BACK LEGS (further side) — copper upper (still attached to haunch), white lower -->
          <path d="M 280 256
                   C 290 280 296 312 294 336
                   C 292 350 296 358 302 358
                   L 316 358
                   C 320 350 322 336 320 322
                   C 318 296 312 270 304 254 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 242 268
                   C 246 292 246 320 244 336
                   C 244 350 248 358 254 358
                   L 268 358
                   C 272 350 274 336 274 322
                   C 274 296 272 270 266 258 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- White lower portion of back legs (long white socks) -->
          <path d="M 282 316 L 318 320 L 316 358 L 296 358 Z" fill="url(#${id}-white)"/>
          <path d="M 244 316 L 274 320 L 268 358 L 248 358 Z" fill="url(#${id}-white)"/>

          <!-- BODY: muscular and slightly longer than tall -->
          <path d="M 108 204
                   C 76 220 76 282 130 298
                   C 200 308 280 302 312 274
                   C 332 256 324 220 296 208
                   C 226 196 148 196 108 204 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- haunch bulge -->
          <ellipse cx="288" cy="252" rx="40" ry="46" fill="url(#${id}-copper)" opacity="0.65"/>
          <!-- shoulder bulge -->
          <ellipse cx="140" cy="240" rx="32" ry="42" fill="url(#${id}-copper)" opacity="0.65"/>

          <!-- BIG WHITE chest/belly side (covers most of the body) -->
          <path d="M 100 250
                   C 90 280 102 300 130 304
                   C 200 314 280 308 312 286
                   C 314 268 306 256 290 256
                   C 228 246 148 244 100 250 Z"
                fill="url(#${id}-white)"/>
          <!-- merle patches only on the upper back (where copper still shows) -->
          <path d="M 174 198 Q 196 192 212 202 Q 208 222 186 226 Q 170 218 174 198 Z" fill="url(#${id}-patch)" opacity="0.9"/>
          <path d="M 228 200 Q 250 194 264 204 Q 260 224 240 226 Q 224 220 228 200 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 278 210 Q 298 206 308 216 Q 304 232 290 234 Q 274 226 278 210 Z" fill="url(#${id}-patch)" opacity="0.85"/>

          <!-- back highlight -->
          <path d="M 130 204 q 90 -14 190 4" stroke="${DOG_PALETTE.copperHi}" stroke-width="12" fill="none" opacity="0.5" stroke-linecap="round"/>
          <!-- belly shading -->
          <path d="M 108 204 C 76 220 76 282 130 298 C 200 308 280 302 312 274 C 332 256 324 220 296 208 C 226 196 148 196 108 204 Z"
                fill="url(#${id}-belly)" opacity="0.55"/>

          <!-- FRONT LEGS — entirely white -->
          <path d="M 132 290
                   C 124 312 120 336 124 354
                   C 124 360 130 364 138 364
                   L 152 364
                   C 154 354 152 336 152 318
                   C 154 300 152 286 148 284 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 166 292
                   C 160 314 158 336 160 354
                   C 160 360 166 364 172 364
                   L 186 364
                   C 188 354 186 336 186 318
                   C 186 300 184 286 180 284 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <!-- PAWS -->
          <ellipse cx="139" cy="364" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="173" cy="366" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="258" cy="360" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="306" cy="360" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>
          <!-- toe pads -->
          <path d="M 132 364 q 0 -5 0 -7 M 139 364 q 0 -6 0 -8 M 146 364 q 0 -5 0 -7" stroke="${DOG_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>
          <path d="M 166 366 q 0 -5 0 -7 M 173 366 q 0 -6 0 -8 M 180 366 q 0 -5 0 -7" stroke="${DOG_PALETTE.outline}" stroke-width="0.8" fill="none" opacity="0.5"/>

          <!-- chest white tuft -->
          <path d="M 108 226 C 98 254 110 272 132 274 C 132 252 124 234 116 224 Z" fill="${DOG_PALETTE.whiteHi}" opacity="0.85"/>

          ${collarBand(id, opts.collarColor, collarPath, 132, 216, 10)}
        </g>

        <!-- HEAD profile facing left -->
        <g class="head">
          <!-- back ear (folded) -->
          <path d="M 144 138
                   C 158 100 162 78 148 70
                   C 134 80 124 102 122 140 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4" opacity="0.9"/>
          <path d="M 148 70 C 134 80 124 102 122 140 C 134 130 144 110 148 92 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.45"/>

          <!-- front ear folded forward -->
          <path d="M 96 154
                   C 84 116 86 80 102 72
                   C 118 80 126 102 132 142
                   Q 124 168 96 154 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <!-- folded tip overlay -->
          <path d="M 102 72 C 118 80 126 102 132 142 Q 124 152 116 148 C 108 122 100 96 94 80 C 94 74 98 70 102 72 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.5"/>
          <path d="M 104 150 C 100 118 102 90 110 80 C 120 96 124 124 126 148 Q 116 154 104 150 Z" fill="url(#${id}-ear-inner)" opacity="0.85"/>

          <!-- HEAD (copper base) -->
          <path d="M 154 146
                   C 102 142 64 174 56 204
                   C 52 222 66 236 92 238
                   C 122 238 146 234 164 218
                   Q 178 204 178 184
                   Q 180 162 170 148 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- merle patch on copper top -->
          <path d="M 156 168 Q 168 162 178 170 Q 174 184 162 186 Q 150 180 156 168 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <!-- WIDE WHITE face — covers most of the face -->
          <path d="M 84 186
                   C 64 196 64 222 86 232
                   C 110 238 142 236 160 226
                   Q 174 218 172 196
                   Q 168 178 152 174
                   C 124 174 100 178 84 186 Z"
                fill="url(#${id}-white)"/>
          <!-- muzzle -->
          <path d="M 60 200
                   C 48 204 48 224 64 228
                   C 88 230 110 226 122 216
                   Q 132 206 128 196
                   C 110 192 80 192 60 200 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- eye -->
          ${dogEye(id, 118, 200, 14, 11, -5)}
          <!-- brow ridge -->
          <path d="M 108 186 C 116 180 128 180 134 186" stroke="${DOG_PALETTE.copperMid}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
          <!-- nose -->
          <path d="M 56 204 C 50 202 48 208 50 212 L 50 216 C 52 220 60 220 62 216 L 70 214 Q 76 210 74 202 Q 70 198 62 198 Z"
                fill="url(#${id}-nose)" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="56" cy="210" rx="2" ry="2.5" fill="#000"/>
          <ellipse cx="58" cy="204" rx="3" ry="1.5" fill="#ffffff" opacity="0.85"/>
          <!-- mouth -->
          <path d="M 70 222 Q 84 230 96 224" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Dog 3: play bow (front down, butt up, tail wagging) ----- */
function dogPlayBow(opts) {
  const id = uid();
  const cx = 220, cy = 240;
  const collarPath = `M 106 282 Q 152 304 192 286 Q 152 296 106 282 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${dogDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="dog-${id}">

        <!-- TAIL up high and wagging -->
        <g class="tail-wag" style="transform-origin: 312px 220px;">
          <path d="M 304 230
                   C 348 196 366 152 354 124
                   C 346 108 326 116 324 132
                   C 322 156 336 180 326 210
                   Z"
                fill="url(#${id}-feather)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 332 176 q 16 -10 18 -28 M 320 198 q 22 -8 26 -22" stroke="${DOG_PALETTE.copperLo}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.7"/>
          <path d="M 332 162 q 12 -8 14 -22" stroke="${DOG_PALETTE.whiteHi}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
        </g>

        <!-- BODY: single curve from raised hindquarters to low front -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- main body silhouette -->
          <path d="M 104 296
                   C 86 304 76 322 84 336
                   C 96 350 124 348 148 340
                   C 168 334 192 326 212 318
                   C 240 310 280 296 304 270
                   C 322 250 320 220 300 204
                   C 268 188 226 194 192 216
                   C 162 234 132 264 116 282
                   C 108 290 104 294 104 296 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- raised haunch -->
          <ellipse cx="276" cy="240" rx="44" ry="50" fill="url(#${id}-copper)" opacity="0.6"/>
          <!-- merle patches scattered -->
          <path d="M 230 212 Q 254 206 268 216 Q 266 240 244 246 Q 222 238 230 212 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 274 224 Q 294 220 304 232 Q 302 252 286 256 Q 270 246 274 224 Z" fill="url(#${id}-patch)" opacity="0.86"/>
          <path d="M 186 246 Q 206 240 218 252 Q 216 270 198 274 Q 180 264 186 246 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <path d="M 140 278 Q 158 274 170 284 Q 168 298 152 300 Q 138 292 140 278 Z" fill="url(#${id}-patch)" opacity="0.8"/>
          <!-- BIG WHITE chest/belly side covering most of the front-lower body -->
          <path d="M 90 304
                   C 80 326 100 348 138 348
                   C 180 348 230 336 254 318
                   C 256 308 244 302 232 302
                   C 188 308 132 312 100 296
                   C 92 298 90 302 90 304 Z"
                fill="url(#${id}-white)"/>
          <!-- belly shading -->
          <path d="M 104 296 C 86 304 76 322 84 336 C 96 350 124 348 148 340 C 168 334 192 326 212 318 C 240 310 280 296 304 270 C 322 250 320 220 300 204 C 268 188 226 194 192 216 C 162 234 132 264 116 282 C 108 290 104 294 104 296 Z"
                fill="url(#${id}-belly)" opacity="0.55"/>
          <!-- back highlight -->
          <path d="M 140 280 q 70 -50 160 -76" stroke="${DOG_PALETTE.copperHi}" stroke-width="14" fill="none" opacity="0.5" stroke-linecap="round"/>

          <!-- BACK LEGS — copper upper, white lower socks -->
          <path d="M 254 286
                   C 264 312 264 340 256 358
                   C 252 364 248 364 244 360
                   L 232 358
                   C 226 340 230 316 240 286 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 296 274
                   C 306 304 306 336 298 358
                   C 294 364 290 364 286 360
                   L 274 358
                   C 270 336 274 308 282 274 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <!-- long white socks on back legs -->
          <path d="M 232 324 L 256 326 L 254 362 L 234 360 Z" fill="url(#${id}-white)"/>
          <path d="M 274 322 L 298 324 L 296 362 L 276 360 Z" fill="url(#${id}-white)"/>
          <ellipse cx="244" cy="362" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>
          <ellipse cx="286" cy="362" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>

          <!-- FRONT LEGS splayed forward — entirely white -->
          <path d="M 116 326
                   C 96 338 76 352 72 364
                   C 70 370 80 372 92 370
                   C 108 366 124 360 138 352
                   C 148 346 144 336 136 332 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 152 332
                   C 132 342 116 354 110 366
                   C 108 372 120 374 132 372
                   C 148 368 164 360 176 352
                   C 186 346 182 336 174 332 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <ellipse cx="82" cy="372" rx="16" ry="6" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="124" cy="374" rx="16" ry="6" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>

          ${collarBand(id, opts.collarColor, collarPath, 152, 296, 10)}
        </g>

        <!-- HEAD low, mouth open in play invitation -->
        <g class="head">
          <!-- back ear -->
          <path d="M 142 252
                   C 156 218 162 192 148 184
                   C 134 192 124 214 122 254 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4" opacity="0.9"/>
          <path d="M 148 184 C 134 192 124 214 122 254 C 134 244 144 224 148 206 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.45"/>
          <!-- front ear folded -->
          <path d="M 96 264
                   C 84 226 86 196 102 188
                   C 118 196 126 218 132 256
                   Q 124 280 96 264 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 102 188 C 118 196 126 218 132 256 Q 124 264 116 260 C 108 234 100 210 94 196 C 94 190 98 186 102 188 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.5"/>
          <path d="M 104 262 C 100 230 102 202 110 192 C 120 208 124 236 126 260 Q 116 266 104 262 Z" fill="url(#${id}-ear-inner)" opacity="0.85"/>

          <!-- HEAD (copper base) -->
          <path d="M 152 260
                   C 100 256 64 284 60 312
                   C 56 328 70 342 96 342
                   C 124 342 146 336 164 320
                   Q 178 306 178 286
                   Q 178 266 168 256 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- WIDE WHITE face — covers most of face front -->
          <path d="M 84 294
                   C 64 304 64 330 86 340
                   C 110 346 142 344 160 334
                   Q 174 326 172 304
                   Q 168 286 152 282
                   C 124 282 100 286 84 294 Z"
                fill="url(#${id}-white)"/>
          <path d="M 156 276 Q 168 270 178 278 Q 174 292 162 294 Q 150 288 156 276 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <!-- muzzle (white, mouth open showing tongue) -->
          <path d="M 60 304
                   C 48 306 48 326 64 330
                   C 92 332 116 328 128 318
                   Q 138 308 134 298
                   C 110 296 80 296 60 304 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- open mouth with tongue (panting in play) -->
          <path d="M 72 332 Q 92 348 116 338 Q 116 332 110 328 Q 92 332 72 332 Z"
                fill="url(#${id}-tongue)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 90 332 L 90 346" stroke="${DOG_PALETTE.tongueLo}" stroke-width="1.2" opacity="0.6"/>
          <!-- teeth hint -->
          <path d="M 76 330 L 80 326 L 84 330 L 88 326 L 92 330" stroke="#fff" stroke-width="2" fill="none" opacity="0.8"/>
          <!-- eye - excited -->
          ${dogEye(id, 118, 302, 14, 12, -5)}
          <!-- brow ridge -->
          <path d="M 108 286 C 116 282 128 282 134 288" stroke="${DOG_PALETTE.copperMid}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
          <!-- nose -->
          <path d="M 56 308 C 50 306 48 312 50 316 L 50 320 C 52 324 60 324 62 320 L 70 318 Q 76 314 74 306 Q 70 302 62 302 Z"
                fill="url(#${id}-nose)" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="56" cy="314" rx="2" ry="2.5" fill="#000"/>
          <ellipse cx="58" cy="308" rx="3" ry="1.5" fill="#ffffff" opacity="0.85"/>
        </g>
      </g>
    </svg>
  `;
}

/* ----- Dog 4: trotting (side view, mid-stride, diagonal pair of legs) ----- */
function dogTrotting(opts) {
  const id = uid();
  const cx = 210, cy = 234;
  const collarPath = `M 90 206 Q 132 228 172 208 Q 132 218 90 206 Z`;
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${dogDefs(id, opts.eyeColor, opts.collarColor)}
      <g class="dog-${id}">

        <!-- TAIL streaming behind, almost horizontal -->
        <g class="tail-wag" style="transform-origin: 318px 224px;">
          <path d="M 312 232
                   C 348 224 372 220 374 200
                   C 372 188 358 186 352 192
                   C 342 208 326 220 310 226 Z"
                fill="url(#${id}-feather)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <path d="M 326 214 q 20 -4 32 -12 M 318 224 q 22 -2 32 -10" stroke="${DOG_PALETTE.copperLo}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.7"/>
          <path d="M 340 198 q 12 -4 20 -10" stroke="${DOG_PALETTE.whiteHi}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
        </g>

        <!-- TORSO -->
        <g class="torso" ${buildScaleAttr(cx, cy, opts.build)}>
          <!-- BACK LEFT leg back (extended) — copper upper, white lower -->
          <path d="M 282 250
                   C 294 280 304 314 296 340
                   C 294 348 290 352 284 352
                   L 270 350
                   C 264 322 262 296 268 250 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <path d="M 268 316 L 296 322 L 296 350 L 270 350 Z" fill="url(#${id}-white)"/>
          <ellipse cx="282" cy="352" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>

          <!-- BACK RIGHT leg forward (lifted, bent at knee) — fully white since lifted -->
          <path d="M 244 264
                   C 250 286 250 304 244 320
                   C 240 326 232 326 226 322
                   L 218 320
                   C 216 304 220 286 230 266 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <ellipse cx="232" cy="324" rx="12" ry="4" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>

          <!-- BODY: horizontal (copper base) -->
          <path d="M 100 204
                   C 70 222 70 282 124 298
                   C 200 310 288 302 316 270
                   C 336 246 326 210 296 200
                   C 226 188 140 188 100 204 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- BIG WHITE chest/belly covering most of the body -->
          <path d="M 90 248
                   C 80 280 100 300 130 304
                   C 200 314 280 308 312 282
                   C 314 264 304 252 286 250
                   C 222 240 142 240 100 244
                   C 92 246 90 246 90 248 Z"
                fill="url(#${id}-white)"/>
          <!-- merle patches only on upper back (where copper still shows) -->
          <path d="M 172 198 Q 196 192 210 202 Q 206 222 184 226 Q 168 218 172 198 Z" fill="url(#${id}-patch)" opacity="0.9"/>
          <path d="M 226 200 Q 248 194 264 204 Q 258 222 238 226 Q 222 218 226 200 Z" fill="url(#${id}-patch)" opacity="0.88"/>
          <path d="M 274 210 Q 294 206 304 216 Q 300 230 286 234 Q 270 226 274 210 Z" fill="url(#${id}-patch)" opacity="0.85"/>

          <path d="M 130 204 q 90 -14 188 4" stroke="${DOG_PALETTE.copperHi}" stroke-width="12" fill="none" opacity="0.5" stroke-linecap="round"/>
          <path d="M 100 204 C 70 222 70 282 124 298 C 200 310 288 302 316 270 C 336 246 326 210 296 200 C 226 188 140 188 100 204 Z"
                fill="url(#${id}-belly)" opacity="0.55"/>

          <!-- FRONT LEFT leg back — entirely white -->
          <path d="M 132 290
                   C 134 312 132 332 124 350
                   C 122 356 116 358 110 354
                   L 102 352
                   C 102 332 110 312 118 286 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <ellipse cx="118" cy="352" rx="14" ry="5" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>

          <!-- FRONT RIGHT leg forward (lifted, bent) — entirely white -->
          <path d="M 174 290
                   C 184 308 188 318 184 332
                   C 180 338 174 338 168 334
                   L 162 332
                   C 162 318 164 304 170 290 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.5"/>
          <ellipse cx="176" cy="336" rx="12" ry="4" fill="${DOG_PALETTE.whiteHi}" stroke="${DOG_PALETTE.outline}" stroke-width="1.2"/>

          ${collarBand(id, opts.collarColor, collarPath, 132, 218, 10)}
        </g>

        <!-- HEAD facing forward (left), alert -->
        <g class="head">
          <!-- back ear (folded) -->
          <path d="M 144 142
                   C 158 104 162 80 148 72
                   C 134 82 124 104 122 144 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4" opacity="0.9"/>
          <path d="M 148 72 C 134 82 124 104 122 144 C 134 134 144 114 148 96 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.45"/>
          <!-- front ear folded -->
          <path d="M 96 158
                   C 84 120 86 84 102 76
                   C 118 84 126 106 132 146
                   Q 124 172 96 158 Z"
                fill="url(#${id}-ear)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M 102 76 C 118 84 126 106 132 146 Q 124 154 116 150 C 108 124 100 100 94 84 C 94 78 98 74 102 76 Z" fill="${DOG_PALETTE.copperLo}" opacity="0.5"/>
          <path d="M 104 154 C 100 122 102 92 110 82 C 120 98 124 126 126 150 Q 116 156 104 154 Z" fill="url(#${id}-ear-inner)" opacity="0.85"/>

          <!-- HEAD (copper base) -->
          <path d="M 154 148
                   C 102 144 64 176 56 206
                   C 52 224 66 238 92 240
                   C 122 240 146 236 164 220
                   Q 178 206 178 186
                   Q 180 164 170 150 Z"
                fill="url(#${id}-copper)" stroke="${DOG_PALETTE.outline}" stroke-width="1.6"/>
          <!-- merle on copper top -->
          <path d="M 156 172 Q 168 166 178 174 Q 174 188 162 190 Q 150 184 156 172 Z" fill="url(#${id}-patch)" opacity="0.85"/>
          <!-- WIDE WHITE face -->
          <path d="M 84 188
                   C 64 198 64 224 86 234
                   C 110 240 142 238 160 228
                   Q 174 220 172 198
                   Q 168 180 152 176
                   C 124 176 100 180 84 188 Z"
                fill="url(#${id}-white)"/>
          <!-- muzzle -->
          <path d="M 60 202
                   C 48 206 48 226 64 230
                   C 88 232 110 228 122 218
                   Q 132 208 128 198
                   C 110 194 80 194 60 202 Z"
                fill="url(#${id}-white)" stroke="${DOG_PALETTE.outline}" stroke-width="1.4"/>
          <!-- eye -->
          ${dogEye(id, 118, 202, 14, 11, -5)}
          <!-- brow ridge -->
          <path d="M 108 188 C 116 182 128 182 134 188" stroke="${DOG_PALETTE.copperMid}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>
          <!-- nose -->
          <path d="M 56 206 C 50 204 48 210 50 214 L 50 218 C 52 222 60 222 62 218 L 70 216 Q 76 212 74 204 Q 70 200 62 200 Z"
                fill="url(#${id}-nose)" stroke="${DOG_PALETTE.outline}" stroke-width="1.3"/>
          <ellipse cx="56" cy="212" rx="2" ry="2.5" fill="#000"/>
          <ellipse cx="58" cy="206" rx="3" ry="1.5" fill="#ffffff" opacity="0.85"/>
          <!-- mouth slightly open (panting while trotting) -->
          <path d="M 70 224 Q 82 232 96 230 Q 104 228 106 222" stroke="${DOG_PALETTE.outline}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <path d="M 82 224 Q 88 232 96 230 L 96 222 Z" fill="url(#${id}-tongue)" stroke="${DOG_PALETTE.outline}" stroke-width="1"/>
        </g>
      </g>
    </svg>
  `;
}

const DOG_RENDERERS = [dogSitting, dogSphinx, dogStanding, dogPlayBow, dogTrotting];
const DOG_LABELS = ['Sitting', 'Resting', 'Alert', 'Play Bow', 'Trotting'];

/* ============================================================
   RENDER A FRAMED ANIMAL with size scaling
   ============================================================ */
function renderAnimal(kind, opts) {
  const fn = (kind === 'cat' ? CAT_RENDERERS : DOG_RENDERERS)[opts.designId];
  const scale = SIZE_SCALE[opts.size] || 1;
  const svg = fn(opts);
  // Wrap the inner SVG with size scaling via a transform group on a second SVG layer.
  // We parse out the root <svg ...> tag and inject a wrapping <g transform="scale(s)" transform-origin>.
  // Simpler: return raw and let the caller scale via container.
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <div style="width:${Math.round(scale*100)}%;height:${Math.round(scale*100)}%;">
              ${svg}
            </div>
          </div>`;
}

/* ============================================================
   CHOOSE SCREENS
   ============================================================ */
function paintChooseGrid(kind) {
  const grid = document.getElementById(`${kind}-choose-grid`);
  const renderers = (kind === 'cat' ? CAT_RENDERERS : DOG_RENDERERS);
  const labels    = (kind === 'cat' ? CAT_LABELS    : DOG_LABELS);
  grid.innerHTML = '';
  renderers.forEach((_, i) => {
    const card = document.createElement('button');
    card.className = 'choose-card';
    card.type = 'button';
    card.innerHTML = `
      <div class="card-art">${renderers[i]({ ...DEFAULT_CAT, designId: i })}</div>
      <div class="card-label">${labels[i]}</div>
    `;
    card.addEventListener('click', () => {
      state[kind].designId = i;
      // mark visually, then advance
      grid.querySelectorAll('.choose-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => {
        if (kind === 'cat') { paintCustomize('cat'); goto('cat-customize'); }
        else                { paintCustomize('dog'); goto('dog-customize'); }
      }, 180);
    });
    grid.appendChild(card);
  });
}

/* ============================================================
   CUSTOMIZE SCREENS
   ============================================================ */
function paintCustomize(kind) {
  // Build the option buttons (only once is fine; idempotent).
  const sizeBox   = document.getElementById(`${kind}-opts-size`);
  const buildBox  = document.getElementById(`${kind}-opts-build`);
  const eyeBox    = document.getElementById(`${kind}-opts-eye`);
  const collarBox = document.getElementById(`${kind}-opts-collar`);

  const sizes  = [['small','Small'], ['medium','Medium'], ['large','Large']];
  const builds = [['skinny','Skinny'], ['normal','Normal'], ['chonky','Chonky']];
  const eyes   = [['blue','#3e85c4'], ['green','#5a9b3a'], ['gold','#c89324']];
  const collars = [['none', null], ['red','#d63a2a'], ['blue','#2960c8'], ['pink','#e368a8'], ['purple','#7a4ad0']];

  sizeBox.innerHTML   = sizes.map(([v,label])  => `<button class="opt-btn" data-kind="size" data-val="${v}">${label}</button>`).join('');
  buildBox.innerHTML  = builds.map(([v,label]) => `<button class="opt-btn" data-kind="build" data-val="${v}">${label}</button>`).join('');
  eyeBox.innerHTML    = eyes.map(([v,col])     => `<button class="opt-btn" data-kind="eyeColor" data-val="${v}" aria-label="${v}"><span class="opt-swatch" style="background:${col}"></span>${cap(v)}</button>`).join('');
  collarBox.innerHTML = collars.map(([v,col])  => v === 'none'
    ? `<button class="opt-btn" data-kind="collarColor" data-val="none" aria-label="No collar"><span class="opt-swatch none"></span>None</button>`
    : `<button class="opt-btn" data-kind="collarColor" data-val="${v}" aria-label="${v}"><span class="opt-swatch" style="background:${col}"></span>${cap(v)}</button>`
  ).join('');

  // wire option buttons
  [sizeBox, buildBox, eyeBox, collarBox].forEach(box => {
    box.querySelectorAll('.opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind, v = btn.dataset.val;
        state[kind][k] = v;
        rerenderPreview(kind);
      });
    });
  });

  rerenderPreview(kind);
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function rerenderPreview(kind) {
  const opts = state[kind];
  const preview = document.getElementById(`${kind}-preview`);
  preview.innerHTML = renderAnimal(kind, opts);
  // sync active state
  ['size','build','eyeColor','collarColor'].forEach(k => {
    document.querySelectorAll(`#${kind}-opts-${k === 'eyeColor' ? 'eye' : k === 'collarColor' ? 'collar' : k} .opt-btn`)
      .forEach(b => b.classList.toggle('active', b.dataset.val === opts[k]));
  });
}

/* ============================================================
   TEAM SCREEN
   ============================================================ */
function paintTeam(savedAlready) {
  document.getElementById('team-name').textContent = player;
  document.getElementById('team-cat-slot').innerHTML = renderAnimal('cat', state.cat);
  document.getElementById('team-dog-slot').innerHTML = renderAnimal('dog', state.dog);
  document.getElementById('team-save').classList.toggle('hidden', !!savedAlready);
  document.getElementById('team-edit').classList.toggle('hidden', !savedAlready);
  document.getElementById('team-restart').classList.toggle('hidden', !!savedAlready);
}
function saveTeam() {
  localStorage.setItem(CAT_KEY, JSON.stringify(state.cat));
  localStorage.setItem(DOG_KEY, JSON.stringify(state.dog));
  toast('Saved! 🎉');
  paintTeam(true);
}
function startOver() {
  state.cat = { ...DEFAULT_CAT };
  state.dog = { ...DEFAULT_DOG };
  goto('intro');
  paintIntro();
}
function editTeam() {
  goto('cat-choose');
}

/* ============================================================
   INTRO ART (preview pair)
   ============================================================ */
function paintIntro() {
  document.getElementById('intro-name').textContent = player;
  document.getElementById('intro-cat-slot').innerHTML =
    catSitting({ ...DEFAULT_CAT });
  document.getElementById('intro-dog-slot').innerHTML =
    dogSitting({ ...DEFAULT_DOG, eyeColor: 'blue' });
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============================================================
   NAV BAR HANDLERS — since there's no live gameplay in step 1
   the nav buttons just go (no confirm dialog needed per brief).
   ============================================================ */
document.getElementById('nav-menu').addEventListener('click', () => {
  goto('intro');
});
document.getElementById('nav-arcade').addEventListener('click', goHome);

/* ============================================================
   INIT
   ============================================================ */
document.getElementById('intro-start').addEventListener('click', () => {
  paintChooseGrid('cat');
  goto('cat-choose');
});
document.getElementById('cat-confirm').addEventListener('click', () => {
  paintChooseGrid('dog');
  goto('dog-choose');
});
document.getElementById('dog-confirm').addEventListener('click', () => {
  paintTeam(false);
  goto('team');
});
document.getElementById('team-save').addEventListener('click', saveTeam);
document.getElementById('team-edit').addEventListener('click', editTeam);
document.getElementById('team-restart').addEventListener('click', startOver);

function boot() {
  // If both saved, skip to team
  const sCat = localStorage.getItem(CAT_KEY);
  const sDog = localStorage.getItem(DOG_KEY);
  if (sCat && sDog) {
    try {
      state.cat = { ...DEFAULT_CAT, ...JSON.parse(sCat) };
      state.dog = { ...DEFAULT_DOG, ...JSON.parse(sDog) };
      paintTeam(true);
      goto('team');
      return;
    } catch (_) { /* fall through to intro */ }
  }
  paintIntro();
  goto('intro');
}
boot();
