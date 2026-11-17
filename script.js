// Swarm AI landing page
// A swarm of AI-agent cursors flies over the page as a folding ribbon, like
// starlings, and trails your cursor when you move it. Hover part of the hero's
// giant word and agents lift squares out of the letter, carry them around the
// cursor, and set them back into other gaps in the same letter. Each square
// takes the colour of the agent that moved it, and keeps it. Scrolling on,
// the coloured arc at the bottom of the hero shrinks into a sphere while the
// swarm is drawn onto it as a spinning shell that turns toward the side your
// cursor is on. The About copy is laid out around the sphere.

const CONFIG = {
  count: 900,
  idleDelay: 1400, // ms without pointer movement before the swarm lets go

  // ribbon: each agent chases a point the leader passed some time ago
  maxLag: 150, // longest delay behind the leader, in 1/60s steps (ribbon length)
  lagBias: 1.3, // >1 packs more agents near the head, thinning the tail
  widthMin: 18, // ribbon half-width at its thinnest, px
  widthMax: 130, // and at its thickest
  twist: 0.5, // how fast agents wheel around the ribbon's centre line
  stillSpread: 1.6, // how much the swarm opens up when the leader stops moving

  // flow field: pushes agents off their targets for ragged, organic edges
  flowForce: 0.3,
  flowScale: 0.0035,
  flowSpeed: 0.14,

  // steering
  arrive: 0.06,
  steer: 0.07,
  align: 0.04,
  separation: 0.1,
  neighborRadius: 28,
  separationRadius: 11,
  maxSpeed: [6.5, 9.5], // [idle, following]

  // hero word
  word: "SWARM",
  wordFont: 'Anton, Impact, "Haettenschweiler", "Arial Narrow", sans-serif',
  wordWidth: 0.92, // of the viewport width, unless the height runs out first
  wordGap: 32, // px kept clear between the word and the tagline below it
  square: 14, // px, the size of the squares agents lift out of the letters
  workRadius: 110, // px around the pointer that agents work on
  maxJobs: 60, // agents handling squares at once
  liftsPerSecond: 40, // squares lifted per second while hovering
  holdTime: [350, 850], // ms an agent carries a square before setting it down
  carrySpeed: 12,
  clearing: 2.2, // how hard idle agents are pushed out of the work area, so it stays visible

  // about sphere
  arcWidth: 1.85, // diameter of the circle whose top peeks into the hero, in viewport widths
  arcPeek: 100, // px of that circle showing above the hero's bottom edge
  sphereSize: 0.46, // settled sphere diameter, of the viewport's shorter side
  gatherFrom: 0.3, // how far into the scroll (0..1) the first agents are drawn onto the sphere
  copyGap: 30, // px kept clear between the sphere and the copy around it
  copyWidth: [0.92, 1240], // copy block width: share of the viewport, and a cap in px
  stackBelow: 760, // narrower than this, the sphere sits high and the copy goes underneath
  shellRadius: 1.07, // the swarm's shell, relative to the sphere's radius
  shellTilt: 0.6, // radians the shell's spin axis leans away from facing you
  spinSpeed: 0.012, // radians per 1/60s

  // labels
  permanentLabels: 12, // agents that always show their name
  hoverLabels: 3, // extra agents near the pointer that pick up a label
  labelRadius: 150, // how close to the pointer an agent must be to pick one up
  labelHold: 2000, // ms a hover label stays after its agent leaves the pointer
  labelStagger: 350, // ms between hover labels appearing
  labelSpacing: [120, 30], // minimum [x, y] gap between labelled agents, px

  // arrows: white darts with a solid border and a soft glow in the agent's colour
  arrowFill: "#ffffff",
  border: 1.5, // border thickness (the arrow is 17 long); 0 for glow only
  glowBleed: 3, // how far the glow reaches past the arrow's edge
  glowStrength: 0.75,

  ink: "#0d0d0d",
  palette: ["#4f6df5", "#6fdc3c", "#ef5350", "#e254e8", "#7fe8cf", "#f7df4b"],
  roles: [
    "PM", "Designer", "Frontend", "Backend", "Staff Eng", "SRE", "QA", "Data Sci",
    "ML Eng", "Security", "DevRel", "Infra", "Eng Manager", "Intern"
  ]
};

const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");
const hero = document.querySelector(".hero");

let width = 0;
let height = 0;
let dpr = 1;

// --- Value noise (smooth random field, 0..1) --------------------------------
const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const X = xi & 255;
  const Y = yi & 255;
  const a = perm[perm[X] + Y];
  const b = perm[perm[X + 1] + Y];
  const c = perm[perm[X] + Y + 1];
  const d = perm[perm[X + 1] + Y + 1];
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
}

// --- The cursor arrow -------------------------------------------------------
// A tailless dart, centred on its own middle, with its tip pointing along +x
// so rotating it by an agent's heading points it in the direction of travel.
const arrow = new Path2D("M8.5 0 L-8.5 -8 L-4.5 0 L-8.5 8 Z");

// --- Swarm state ------------------------------------------------------------
// Agent positions are in viewport coordinates: the swarm stays on screen
// while the page scrolls underneath it.
const N = CONFIG.count;
const px = new Float32Array(N);
const py = new Float32Array(N);
const vx = new Float32Array(N);
const vy = new Float32Array(N);
const ax = new Float32Array(N);
const ay = new Float32Array(N);
const heading = new Float32Array(N);
const depth = new Float32Array(N); // 0 = far and small, 1 = near and large
const lag = new Float32Array(N); // delay behind the leader
const offR = new Float32Array(N); // distance from the ribbon centre line
const offA = new Float32Array(N); // angle around the centre line
const drift = new Float32Array(N); // how strongly the flow field moves this agent
const color = new Uint8Array(N);
const labelAlpha = new Float32Array(N);
const labelText = new Array(N);
const labelWidth = new Float32Array(N);

// jobs: an agent with a job leaves the ribbon to move one square
const job = new Uint8Array(N); // 0 none, 1 flying to a square, 2 carrying it, 3 setting it down
const jobFrom = new Int32Array(N); // cell the square is lifted from
const jobTo = new Int32Array(N); // gap it is set down into
const jobStart = new Float64Array(N);
const jobHold = new Float64Array(N); // when a carrying agent may set its square down
const busy = new Float32Array(N); // eased 0..1, used to enlarge working agents
let jobCount = 0;

// shell: each agent's own point on a unit sphere, used while wrapping the About sphere
const shX = new Float32Array(N);
const shY = new Float32Array(N);
const shZ = new Float32Array(N);
const shellAt = new Float32Array(N); // how far the gathering must be along before this agent joins
const shellOn = new Uint8Array(N); // on the shell this frame
const shellWas = new Uint8Array(N); // and the frame before
const shellK = new Float32Array(N); // eased 0..1, blends the agent's size and fade
const shellDepth = new Float32Array(N); // -1 far side .. 1 facing you
const shellTX = new Float32Array(N); // last shell target, to match its speed
const shellTY = new Float32Array(N);

for (let i = 0; i < N; i++) depth[i] = Math.random();
depth.sort(); // far arrows are drawn first, near ones on top

for (let i = 0; i < N; i++) {
  lag[i] = Math.pow(Math.random(), CONFIG.lagBias) * CONFIG.maxLag;
  // roughly bell-shaped spread across the ribbon
  offR[i] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  offA[i] = Math.random() * Math.PI * 2;
  drift[i] = 0.5 + Math.random();
  const sz = Math.random() * 2 - 1;
  const sa = Math.random() * Math.PI * 2;
  const sr = Math.sqrt(1 - sz * sz);
  shX[i] = Math.cos(sa) * sr;
  shY[i] = Math.sin(sa) * sr;
  shZ[i] = sz;
  shellAt[i] = 0.02 + Math.random() * 0.96;
  color[i] = (Math.random() * CONFIG.palette.length) | 0;
  const role = CONFIG.roles[(Math.random() * CONFIG.roles.length) | 0];
  labelText[i] = role + " " + String(i + 1).padStart(3, "0");
}

// --- Leader path ------------------------------------------------------------
// On its own the swarm follows a looping path; history stores where the
// leader has been so each agent can chase a delayed point along it.
const HISTORY = 256;
const histX = new Float32Array(HISTORY);
const histY = new Float32Array(HISTORY);
let histHead = 0;
let histAcc = 0;

function roam(t, out) {
  out.x = width / 2 + width * (0.28 * Math.cos(0.45 * t) + 0.09 * Math.cos(1.15 * t + 1.3));
  out.y = height / 2 + height * (0.19 * Math.sin(0.58 * t + 0.5) + 0.08 * Math.sin(1.37 * t));
}

function pushHistory(x, y) {
  histHead = (histHead + 1) % HISTORY;
  histX[histHead] = x;
  histY[histHead] = y;
}

const sample = { x: 0, y: 0 };
function sampleHistory(l, out) {
  const i0 = Math.floor(l);
  const f = l - i0;
  const a = (histHead - i0 + HISTORY * 2) % HISTORY;
  const b = (histHead - i0 - 1 + HISTORY * 2) % HISTORY;
  out.x = histX[a] + (histX[b] - histX[a]) * f;
  out.y = histY[a] + (histY[b] - histY[a]) * f;
}

// --- Neighbour grid ---------------------------------------------------------
const CELL = CONFIG.neighborRadius;
let cols = 1;
let rows = 1;
let cellHead = new Int32Array(1);
const cellNext = new Int32Array(N);

const cellX = (x) => Math.max(0, Math.min(cols - 1, Math.floor(x / CELL) + 1));
const cellY = (y) => Math.max(0, Math.min(rows - 1, Math.floor(y / CELL) + 1));

// --- About sphere -------------------------------------------------------------
// One circle does both jobs. At the top of the page it is huge and sits below
// the hero, so only an arc of it shows. Scrolling to About shrinks it, always
// in view, into a sphere that rests in the pinned About screen and then
// scrolls away with it.
const orbEl = document.querySelector(".orb");
const about = document.querySelector(".about");
const copyEl = document.querySelector(".lead");
const copyText = copyEl.textContent.trim().replace(/\s+/g, " ");
const orb = { x: 0, y: 0, r: 0, size: 100, restY: 0, progress: 0 };
let stacked = false; // narrow screen: sphere above, copy below
let shellMix = 0; // 0..1, how much of the swarm has been drawn onto the sphere
let spin = 0; // shell rotation
let spinVel = 0;
let spinDir = 1; // 1 clockwise, -1 counter-clockwise

function layoutOrb() {
  stacked = width < CONFIG.stackBelow;
  orb.size = Math.round(Math.min(width, height) * CONFIG.sphereSize);
  orb.restY = stacked ? Math.round(height * 0.27) : height / 2;
  orbEl.style.width = orbEl.style.height = orb.size + "px";
}

// Lay the About copy out around the sphere. Each line level with the sphere
// is split in two, so the text reads across it. The block is centred on the
// sphere and the type shrinks until it all fits on screen.
function layoutCopy() {
  const cx = width / 2;
  const cy = orb.restY;
  const reach = orb.size / 2 + CONFIG.copyGap;
  const frameW = Math.min(width * CONFIG.copyWidth[0], CONFIG.copyWidth[1]);
  const left = (width - frameW) / 2;
  const right = left + frameW;

  // Measure every word once at the stylesheet's size; widths scale with the type
  copyEl.style.fontSize = "";
  const words = copyText.split(" ");
  copyEl.innerHTML = words.map((w) => "<span>" + w + "</span>").join("") + "<span>&nbsp;</span>";
  const style = getComputedStyle(copyEl);
  const baseSize = parseFloat(style.fontSize);
  const leading = parseFloat(style.lineHeight) / baseSize || 1.1;
  const measured = Array.from(copyEl.children, (el) => el.getBoundingClientRect().width);
  const baseSpace = measured.pop();

  function flow(topY, size) {
    const k = size / baseSize;
    const lh = leading * size;
    const space = baseSpace * k;
    const pieces = []; // { x, y, text }
    let y = topY;
    let at = 0;
    while (at < words.length) {
      // the part of this line's band closest to the sphere's centre
      const dy = cy < y ? y - cy : cy > y + lh ? cy - (y + lh) : 0;
      const spans =
        stacked || dy >= reach
          ? [[left, right]]
          : (() => {
              const half = Math.sqrt(reach * reach - dy * dy);
              return [[left, cx - half], [cx + half, right]];
            })();
      const before = at;
      for (const [x0, x1] of spans) {
        let x = x0;
        let text = "";
        while (at < words.length && x + measured[at] * k <= x1) {
          text += (text ? " " : "") + words[at];
          x += measured[at] * k + space;
          at++;
        }
        if (text) pieces.push({ x: x0, y, text });
      }
      // a word too long for a whole clear line still has to go somewhere
      if (at === before && spans.length === 1) pieces.push({ x: left, y, text: words[at++] });
      y += lh;
    }
    return { pieces, top: topY, bottom: y, lh };
  }

  let best = null;
  let size = baseSize;
  for (; size >= 13; size *= 0.95) {
    if (stacked) {
      best = flow(cy + reach, size);
    } else {
      // try starting 0..10 lines above the sphere; keep the most centred block
      best = null;
      let bestOff = Infinity;
      const lh = leading * size;
      for (let above = 0; above <= 10; above++) {
        const tryIt = flow(cy - reach - above * lh, size);
        const off = Math.abs(cy - tryIt.top - (tryIt.bottom - cy));
        if (off < bestOff) {
          bestOff = off;
          best = tryIt;
        }
      }
    }
    if (best.top >= (stacked ? 0 : 72) && best.bottom <= height - 20) break;
  }

  copyEl.style.fontSize = size + "px";
  copyEl.innerHTML = best.pieces
    .map((p) => '<span style="left:' + p.x.toFixed(1) + "px;top:" + p.y.toFixed(1) + 'px">' + p.text + "</span>")
    .join(" ");
}

function updateOrb(dt) {
  const scroll = window.scrollY;
  const settleAt = about.offsetTop; // scroll position where the sphere has settled
  const leaveAt = settleAt + about.offsetHeight - height; // and where About starts scrolling away

  const t = Math.max(0, Math.min(1, scroll / settleAt));
  const e = t * t * (3 - 2 * t);
  orb.progress = t;

  // Shrink from the big arc to the sphere, keeping the circle's top edge on
  // screen the whole way so the scale-down is what you watch
  const big = width * CONFIG.arcWidth;
  const k = Math.pow(big / orb.size, 1 - e); // scale: from the big arc down to 1
  const peek = CONFIG.arcPeek + 10 * Math.sin(time * 1.7) * (1 - e); // breathes a little
  const topFrom = height - peek;
  const topTo = orb.restY - orb.size / 2;
  orb.r = (orb.size * k) / 2;
  orb.x = width / 2;
  orb.y = topFrom + (topTo - topFrom) * e + orb.r - Math.max(0, scroll - leaveAt);
  orbEl.style.transform =
    "translate3d(" + (orb.x - orb.size / 2) + "px," + (orb.y - orb.size / 2) + "px,0) scale(" + k + ")";
  orbEl.style.setProperty("--shade", e.toFixed(3));

  // The copy appears as the sphere nears its slot
  const show = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
  copyEl.style.opacity = (show * show * (3 - 2 * show)).toFixed(3);

  // Agents are drawn onto the sphere a few at a time as you scroll toward
  // About, and stay on it from then on
  const g = Math.max(0, Math.min(1, (t - CONFIG.gatherFrom) / (0.97 - CONFIG.gatherFrom)));
  shellMix += (g - shellMix) * Math.min(0.12 * dt, 1);

  // Spin toward the side of the sphere the pointer is on
  if (pointer.inside) spinDir = pointer.x >= orb.x ? 1 : -1;
  spinVel += (spinDir * CONFIG.spinSpeed - spinVel) * Math.min(0.05 * dt, 1);
  spin += spinVel * dt;
}

// --- Hero word ----------------------------------------------------------------
// The word is drawn once as real type, so its edges stay clean. A grid of
// squares lies over it: `shape` marks cells inside the letters and `filled`
// those whose square is in place. A lifted square leaves a gap, which is
// erased from the type each frame until an agent sets a square back into it.
const tagline = document.querySelector(".tagline");
const word = {
  image: document.createElement("canvas"),
  cell: 14,
  cols: 0,
  rows: 0,
  x: 0, // page position of the word's top-left corner
  y: 0,
  w: 0,
  h: 0,
  shape: new Uint8Array(0),
  filled: new Uint8Array(0),
  locked: new Uint8Array(0), // spoken for by a job
  tint: new Uint8Array(0), // 0 = still black, else 1 + the palette colour it was last moved by
  ready: false
};
const openGaps = []; // gaps no agent is heading for yet

function buildWord() {
  // Any squares in flight belong to the old layout
  job.fill(0);
  jobCount = 0;
  openGaps.length = 0;

  // Fit the word between the nav and the tagline, as wide as allowed
  const heroBox = hero.getBoundingClientRect();
  const heroTop = heroBox.top + window.scrollY;
  const top = heroTop + 76;
  const bottom = tagline
    ? tagline.getBoundingClientRect().top + window.scrollY - CONFIG.wordGap
    : heroTop + heroBox.height - 120;
  const roomW = width * CONFIG.wordWidth;
  const roomH = Math.max(bottom - top, 80);

  const g = word.image.getContext("2d", { willReadFrequently: true });
  const font = "300px " + CONFIG.wordFont;
  g.font = font;
  const m = g.measureText(CONFIG.word);
  const textW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const textH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const scale = Math.min(roomW / textW, roomH / textH);

  word.w = Math.ceil(textW * scale);
  word.h = Math.ceil(textH * scale);
  word.x = Math.round((width - word.w) / 2);
  word.y = Math.round(top + (roomH - word.h) / 2);

  word.image.width = Math.ceil(word.w * dpr);
  word.image.height = Math.ceil(word.h * dpr);
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  g.font = font;
  g.fillStyle = CONFIG.ink;
  g.fillText(CONFIG.word, m.actualBoundingBoxLeft, m.actualBoundingBoxAscent);

  // A cell belongs to the letters when most of it is inked
  const cell = CONFIG.square;
  word.cell = cell;
  word.cols = Math.ceil(word.w / cell);
  word.rows = Math.ceil(word.h / cell);
  const count = word.cols * word.rows;
  word.shape = new Uint8Array(count);
  word.filled = new Uint8Array(count);
  word.locked = new Uint8Array(count);
  word.tint = new Uint8Array(count);

  const iw = word.image.width;
  const ih = word.image.height;
  const data = g.getImageData(0, 0, iw, ih).data;
  const step = Math.max(1, Math.floor((cell * dpr) / 7)); // sample a 7x7-ish lattice per cell
  for (let r = 0; r < word.rows; r++) {
    for (let c = 0; c < word.cols; c++) {
      let sum = 0;
      let n = 0;
      const x1 = Math.min(iw, Math.floor((c + 1) * cell * dpr));
      const y1 = Math.min(ih, Math.floor((r + 1) * cell * dpr));
      for (let y = Math.floor(r * cell * dpr); y < y1; y += step) {
        for (let x = Math.floor(c * cell * dpr); x < x1; x += step) {
          sum += data[(y * iw + x) * 4 + 3];
          n++;
        }
      }
      // cells cut short by the word's right or bottom edge count their missing part as empty
      const full = Math.pow(Math.ceil((cell * dpr) / step), 2);
      if (n && sum / (Math.max(n, full) * 255) > 0.55) {
        word.shape[r * word.cols + c] = 1;
        word.filled[r * word.cols + c] = 1;
      }
    }
  }
  word.ready = true;
}

// Centre of a cell, in viewport coordinates
const cellCX = (k) => word.x + ((k % word.cols) + 0.5) * word.cell;
const cellCY = (k) => word.y + (Math.floor(k / word.cols) + 0.5) * word.cell - window.scrollY;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = document.documentElement.clientWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  cols = Math.ceil(width / CELL) + 2;
  rows = Math.ceil(height / CELL) + 2;
  cellHead = new Int32Array(cols * rows);
  buildWord();
  layoutOrb();
  layoutCopy();
}
window.addEventListener("resize", resize);
resize();
// Lay the word out again once the display font has loaded
if (document.fonts && document.fonts.load) {
  document.fonts.load("300px " + CONFIG.wordFont, CONFIG.word).then(buildWord, () => {});
}

// --- Pointer ----------------------------------------------------------------
const pointer = { x: width / 2, y: height / 2, lastMove: -Infinity, inside: false };

window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.lastMove = performance.now();
  pointer.inside = true;
});
const release = () => {
  pointer.lastMove = -Infinity;
  pointer.inside = false;
};
document.addEventListener("pointerleave", release);
window.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse") release();
});
window.addEventListener("blur", release);

// Is the pointer over the word, or just beside it?
function pointerOnWord() {
  if (!pointer.inside || !word.ready) return false;
  const edge = CONFIG.workRadius * 0.4;
  const x = pointer.x - word.x;
  const y = pointer.y + window.scrollY - word.y;
  return x >= -edge && y >= -edge && x < word.w + edge && y < word.h + edge;
}

// --- Jobs: lifting squares and setting them back ------------------------------
function nearestFreeAgent(x, y) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (job[i] || permanent[i]) continue;
    const dx = px[i] - x;
    const dy = py[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

// A random square in place within the work radius of the pointer
function squareNearPointer() {
  const r = CONFIG.workRadius;
  for (let tries = 0; tries < 14; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    const c = Math.floor((pointer.x + Math.cos(a) * d - word.x) / word.cell);
    const rw = Math.floor((pointer.y + window.scrollY + Math.sin(a) * d - word.y) / word.cell);
    if (c < 0 || rw < 0 || c >= word.cols || rw >= word.rows) continue;
    const k = rw * word.cols + c;
    if (word.filled[k] && !word.locked[k]) return k;
  }
  return -1;
}

let liftsDue = 0;

function updateJobs(dt, now, onWord) {
  if (!word.ready || !onWord) return;
  liftsDue = Math.min(liftsDue + (CONFIG.liftsPerSecond * dt) / 60, 4);
  while (liftsDue >= 1 && jobCount < CONFIG.maxJobs) {
    liftsDue -= 1;
    const from = squareNearPointer();
    if (from === -1) continue;
    const i = nearestFreeAgent(cellCX(from), cellCY(from));
    if (i === -1) return;
    word.locked[from] = 1;
    job[i] = 1;
    jobFrom[i] = from;
    jobStart[i] = now;
    jobCount++;
  }
}

// An agent reached its square: lift it out, leaving a gap
function liftSquare(i, now) {
  const k = jobFrom[i];
  word.filled[k] = 0;
  word.locked[k] = 0;
  openGaps.push(k);
  job[i] = 2;
  const [lo, hi] = CONFIG.holdTime;
  jobHold[i] = now + lo + Math.random() * (hi - lo);
}

// A carrying agent picks the gap it will fill. Gaps left behind where the
// pointer used to be come first, so the letter heals in your wake; then
// another gap near the pointer; failing that, whichever is closest.
function chooseGap(i, now, onWord) {
  if (!openGaps.length) return;
  let pick = -1;
  if (onWord) {
    const reach = CONFIG.workRadius * 1.15;
    const start = (Math.random() * openGaps.length) | 0;
    for (let n = 0; n < openGaps.length; n++) {
      const at = (start + n) % openGaps.length;
      const k = openGaps[at];
      if (Math.hypot(cellCX(k) - pointer.x, cellCY(k) - pointer.y) > reach) {
        pick = at; // left behind: fill it first
        break;
      }
      if (pick === -1 && (k !== jobFrom[i] || openGaps.length === 1)) pick = at;
    }
  }
  if (pick === -1) {
    let bestD = Infinity;
    for (let at = 0; at < openGaps.length; at++) {
      const k = openGaps[at];
      const d = Math.hypot(cellCX(k) - px[i], cellCY(k) - py[i]);
      if (d < bestD) {
        bestD = d;
        pick = at;
      }
    }
  }
  const k = openGaps.splice(pick, 1)[0];
  word.locked[k] = 1;
  jobTo[i] = k;
  job[i] = 3;
  jobStart[i] = now;
}

// The agent reached the gap: the square goes back into the letter
function setSquare(i) {
  word.filled[jobTo[i]] = 1;
  word.tint[jobTo[i]] = color[i] + 1; // it keeps the colour of the agent that placed it
  word.locked[jobTo[i]] = 0;
  job[i] = 0;
  jobCount--;
}

// --- Labels -------------------------------------------------------------------
// A fixed set of agents, spread along the ribbon, always shows a name.
// A few more near the pointer fade in slowly and linger after they leave.
const permanent = new Uint8Array(N);
{
  for (let k = 0; k < CONFIG.permanentLabels; k++) {
    const want = ((k + 0.5) / CONFIG.permanentLabels) * CONFIG.maxLag;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < N; i++) {
      if (permanent[i]) continue;
      // prefer near (large) agents close to the wanted spot along the ribbon
      const score = Math.abs(lag[i] - want) + (1 - depth[i]) * 12;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    permanent[best] = 1;
    labelAlpha[best] = 1;
  }
}

const hovering = []; // agents currently holding a hover label
const holdUntil = new Float64Array(N);
const isNear = new Uint8Array(N);
const labelled = [];
const pillRoom = new Uint8Array(N);
const pillAlpha = new Float32Array(N);
let nextHoverAt = 0;

function updateLabels(dt, now) {
  const r = CONFIG.labelRadius;

  // Agents still near the pointer keep their label; others run out their hold
  for (let k = hovering.length - 1; k >= 0; k--) {
    const i = hovering[k];
    if (pointer.inside && Math.hypot(px[i] - pointer.x, py[i] - pointer.y) < r * 1.4) {
      holdUntil[i] = now + CONFIG.labelHold;
    }
    if (now > holdUntil[i]) hovering.splice(k, 1);
  }

  // Hand a free label to the closest unlabelled agent, one at a time
  if (pointer.inside && hovering.length < CONFIG.hoverLabels && now > nextHoverAt) {
    const [gapX, gapY] = CONFIG.labelSpacing;
    let best = -1;
    let bestD = r * r;
    for (let i = 0; i < N; i++) {
      if (labelAlpha[i] > 0) continue;
      const dx = px[i] - pointer.x;
      const dy = py[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestD) continue;
      let clear = true;
      for (const j of hovering) {
        if (Math.abs(px[i] - px[j]) < gapX && Math.abs(py[i] - py[j]) < gapY) {
          clear = false;
          break;
        }
      }
      if (clear) {
        bestD = d2;
        best = i;
      }
    }
    if (best !== -1) {
      hovering.push(best);
      holdUntil[best] = now + CONFIG.labelHold;
      nextHoverAt = now + CONFIG.labelStagger;
    }
  }

  isNear.fill(0);
  for (const i of hovering) isNear[i] = 1;
  for (let i = 0; i < N; i++) {
    if (permanent[i]) continue;
    labelAlpha[i] += (isNear[i] - labelAlpha[i]) * Math.min(0.06 * dt, 1);
    if (!isNear[i] && labelAlpha[i] < 0.01) labelAlpha[i] = 0;
  }

  // Where the ribbon folds and two labels would cover each other, the one
  // already showing stays and the other fades until there is room again
  labelled.length = 0;
  for (let i = 0; i < N; i++) if (labelAlpha[i] > 0) labelled.push(i);
  labelled.sort((a, b) => pillAlpha[b] - pillAlpha[a] || a - b);
  const [gapX, gapY] = CONFIG.labelSpacing;
  for (let k = 0; k < labelled.length; k++) {
    const i = labelled[k];
    let room = 1;
    for (let m = 0; m < k; m++) {
      const j = labelled[m];
      if (pillRoom[j] && Math.abs(px[i] - px[j]) < gapX && Math.abs(py[i] - py[j]) < gapY) {
        room = 0;
        break;
      }
    }
    pillRoom[i] = room;
    pillAlpha[i] += (room - pillAlpha[i]) * Math.min(0.07 * dt, 1);
  }
}

// --- Start as a ribbon already in flight -------------------------------------
let time = Math.random() * 100;
let follow = 0; // 0 = free murmuration, 1 = fully following the pointer
let last = performance.now();
const leader = { x: 0, y: 0 };

for (let k = HISTORY - 1; k >= 0; k--) {
  roam(time - k / 60, leader);
  pushHistory(leader.x, leader.y);
}
for (let i = 0; i < N; i++) {
  sampleHistory(lag[i], sample);
  px[i] = sample.x + Math.cos(offA[i]) * offR[i] * 60;
  py[i] = sample.y + Math.sin(offA[i]) * offR[i] * 60;
  sampleHistory(Math.max(lag[i] - 1, 0), sample);
  vx[i] = sample.x - px[i];
  vy[i] = sample.y - py[i];
  const s = Math.hypot(vx[i], vy[i]) + 0.0001;
  vx[i] *= 4 / s;
  vy[i] *= 4 / s;
  heading[i] = Math.atan2(vy[i], vx[i]);
}

// --- Simulation -------------------------------------------------------------
function step(now) {
  const dt = Math.min((now - last) / 16.667, 2.5); // 1 = one 60fps frame
  last = now;
  time += dt / 60;

  // The swarm follows while the pointer moves, or rests on the word
  const onWord = pointerOnWord();
  const following = now - pointer.lastMove < CONFIG.idleDelay || onWord;
  follow += ((following ? 1 : 0) - follow) * Math.min(0.05 * dt, 1);

  updateJobs(dt, now, onWord);
  updateOrb(dt);
  const spinC = Math.cos(spin);
  const spinS = Math.sin(spin);
  const tiltC = Math.cos(CONFIG.shellTilt);
  const tiltS = Math.sin(CONFIG.shellTilt);
  const shellR = orb.r * CONFIG.shellRadius;

  // Leader: the roaming path, or the pointer, or somewhere in between
  roam(time, leader);
  leader.x += (pointer.x - leader.x) * follow;
  leader.y += (pointer.y - leader.y) * follow;
  // The sphere pulls the whole ribbon toward itself as it comes up the screen
  const pull = Math.max(0, Math.min(1, (orb.progress - 0.1) / 0.6));
  const pullY = Math.min(orb.y, orb.y - orb.r + 140, height - 70);
  leader.x += (orb.x - leader.x) * pull;
  leader.y += (pullY - leader.y) * pull;
  histAcc += dt;
  while (histAcc >= 1) {
    pushHistory(leader.x, leader.y);
    histAcc -= 1;
  }

  // Rebuild the neighbour grid
  cellHead.fill(-1);
  for (let i = 0; i < N; i++) {
    const c = cellX(px[i]) + cellY(py[i]) * cols;
    cellNext[i] = cellHead[c];
    cellHead[c] = i;
  }

  // When the leader has barely moved lately, open the swarm up so it
  // mills around the spot instead of piling onto it
  sampleHistory(24, sample);
  const moved = Math.hypot(leader.x - sample.x, leader.y - sample.y);
  const spread = 1 + CONFIG.stillSpread * Math.max(0, 1 - moved / 160);

  const maxSpeed = CONFIG.maxSpeed[0] + (CONFIG.maxSpeed[1] - CONFIG.maxSpeed[0]) * follow;
  const nr2 = CONFIG.neighborRadius * CONFIG.neighborRadius;
  const sr = CONFIG.separationRadius;
  const sr2 = sr * sr;
  const fs = CONFIG.flowScale;
  const ft = time * CONFIG.flowSpeed;

  for (let i = 0; i < N; i++) {
    const x = px[i];
    const y = py[i];
    const working = job[i] !== 0;
    let tx;
    let ty;
    let top = maxSpeed;
    let gain = 1;

    // On the shell: ride this agent's point on the spinning sphere
    shellWas[i] = shellOn[i];
    shellOn[i] = !working && shellMix > shellAt[i] ? 1 : 0;
    shellK[i] += (shellOn[i] - shellK[i]) * Math.min(0.08 * dt, 1);
    if (shellOn[i]) {
      // spin the point about the shell's axis, then lean that axis back
      const rx = shX[i] * spinC - shY[i] * spinS;
      const ry = shX[i] * spinS + shY[i] * spinC;
      const sx = orb.x + rx * shellR;
      const sy = orb.y + (ry * tiltC - shZ[i] * tiltS) * shellR;
      shellDepth[i] = ry * tiltS + shZ[i] * tiltC;
      // keep pace with the point's own motion and close any remaining distance
      let wantX = (sx - x) * 0.14;
      let wantY = (sy - y) * 0.14;
      if (shellWas[i]) {
        wantX += (sx - shellTX[i]) / dt;
        wantY += (sy - shellTY[i]) / dt;
      }
      shellTX[i] = sx;
      shellTY[i] = sy;
      const want = Math.hypot(wantX, wantY);
      if (want > 16) {
        wantX *= 16 / want;
        wantY *= 16 / want;
      }
      ax[i] = (wantX - vx[i]) * 0.4;
      ay[i] = (wantY - vy[i]) * 0.4;
      continue;
    }

    if (working) {
      if (job[i] === 2) {
        // Carrying: circle the pointer until it's time to set the square down
        const a = offA[i] + time * 2.4;
        const r = CONFIG.workRadius * (0.35 + 0.5 * Math.abs(offR[i]));
        tx = pointer.x + Math.cos(a) * r;
        ty = pointer.y + Math.sin(a) * r;
      } else {
        // Fly straight to the square, or to the gap it's going into
        const k = job[i] === 1 ? jobFrom[i] : jobTo[i];
        tx = cellCX(k);
        ty = cellCY(k);
      }
      top = CONFIG.carrySpeed;
      gain = 2.2;
    } else {
      // A delayed point on the leader's path, offset across a ribbon
      // whose width swells and pinches along its length
      sampleHistory(lag[i], sample);
      const swell = noise(lag[i] * 0.016 - time * 0.3, 7.3);
      const w =
        (CONFIG.widthMin + (CONFIG.widthMax - CONFIG.widthMin) * swell * swell) * spread +
        50 * (spread - 1);
      const ang = offA[i] + time * CONFIG.twist + lag[i] * 0.012;
      tx = sample.x + Math.cos(ang) * offR[i] * w;
      ty = sample.y + Math.sin(ang) * offR[i] * w;
    }

    // Arrive: head for the target, easing off when close
    let dvx = (tx - x) * CONFIG.arrive * gain;
    let dvy = (ty - y) * CONFIG.arrive * gain;
    const dv = Math.hypot(dvx, dvy);
    if (dv > top) {
      dvx *= top / dv;
      dvy *= top / dv;
    }
    let fx = (dvx - vx[i]) * CONFIG.steer * gain;
    let fy = (dvy - vy[i]) * CONFIG.steer * gain;

    if (!working) {
      // While the word is being rearranged, the rest of the swarm rings the
      // work area instead of covering it
      if (onWord) {
        const ox = x - pointer.x;
        const oy = y - pointer.y;
        const od = Math.hypot(ox, oy) + 0.0001;
        const ring = CONFIG.workRadius * 1.35;
        if (od < ring) {
          const out = (1 - od / ring) * CONFIG.clearing;
          fx += (ox / od) * out;
          fy += (oy / od) * out;
        }
      }

      // Flow field
      const fa = noise(x * fs + ft, y * fs - ft * 0.7) * Math.PI * 4;
      fx += Math.cos(fa) * CONFIG.flowForce * drift[i];
      fy += Math.sin(fa) * CONFIG.flowForce * drift[i];

      // Neighbours: match their direction, keep a little distance
      let n = 0;
      let sumVx = 0;
      let sumVy = 0;
      let sepX = 0;
      let sepY = 0;
      const cx = cellX(x);
      const cy = cellY(y);
      for (let gy = Math.max(cy - 1, 0); gy <= Math.min(cy + 1, rows - 1); gy++) {
        for (let gx = Math.max(cx - 1, 0); gx <= Math.min(cx + 1, cols - 1); gx++) {
          for (let j = cellHead[gx + gy * cols]; j !== -1; j = cellNext[j]) {
            if (j === i) continue;
            const dx = px[j] - x;
            const dy = py[j] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > nr2) continue;
            n++;
            sumVx += vx[j];
            sumVy += vy[j];
            if (d2 < sr2 && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (1 - d / sr) / d;
              sepX -= dx * push;
              sepY -= dy * push;
            }
          }
        }
      }
      if (n > 0) {
        fx += (sumVx / n - vx[i]) * CONFIG.align;
        fy += (sumVy / n - vy[i]) * CONFIG.align;
        fx += sepX * CONFIG.separation;
        fy += sepY * CONFIG.separation;
      }
    }

    ax[i] = fx;
    ay[i] = fy;

    if (working) {
      const d2 = (tx - x) * (tx - x) + (ty - y) * (ty - y);
      const arrived = d2 < 36 || now - jobStart[i] > 4000; // or stuck too long
      if (job[i] === 1) {
        if (!onWord) {
          // you moved on before the square was reached: leave it where it is
          word.locked[jobFrom[i]] = 0;
          job[i] = 0;
          jobCount--;
        } else if (arrived) {
          liftSquare(i, now);
        }
      } else if (job[i] === 2) {
        if (!onWord || now > jobHold[i]) chooseGap(i, now, onWord);
      } else if (arrived) {
        setSquare(i);
      }
    }
  }

  for (let i = 0; i < N; i++) {
    vx[i] += ax[i] * dt;
    vy[i] += ay[i] * dt;

    const top = shellOn[i] ? 16 : (job[i] ? CONFIG.carrySpeed : maxSpeed) * (0.85 + 0.3 * depth[i]);
    const floor = shellOn[i] ? 0 : 0.9; // agents on the shell may slow to a stop
    const speed = Math.hypot(vx[i], vy[i]) + 0.0001;
    if (speed > top) {
      vx[i] *= top / speed;
      vy[i] *= top / speed;
    } else if (speed < floor) {
      vx[i] *= floor / speed;
      vy[i] *= floor / speed;
    }

    px[i] += vx[i] * dt;
    py[i] += vy[i] * dt;

    // Turn smoothly toward the direction of travel
    if (speed > 0.25) {
      let turn = Math.atan2(vy[i], vx[i]) - heading[i];
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      heading[i] += turn * Math.min(0.25 * dt, 1);
    }

    busy[i] += ((job[i] ? 1 : 0) - busy[i]) * Math.min(0.15 * dt, 1);
  }

  updateLabels(dt, now);
  updateHive(dt);
  updateSocial(dt);
  updateMemory(dt);
  draw();
  requestAnimationFrame(step);
}

// --- Arrow sprites: one finished arrow per palette colour ---------------------
// Glow, border and fill are drawn once here, then stamped once per agent.
const SPRITE_UNITS = 40; // sprite covers this many arrow units, centred on the arrow
const SPRITE_RES = 3; // sprite pixels per arrow unit
const sprites = CONFIG.palette.map((hex) => {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_UNITS * SPRITE_RES;
  const g = c.getContext("2d");
  g.lineJoin = "round";

  // Glow: draw the arrow far off-canvas so only its blurred shadow lands in view
  const away = 4000;
  g.shadowColor = hex;
  g.shadowBlur = CONFIG.glowBleed * SPRITE_RES * 1.4;
  g.shadowOffsetX = away;
  g.setTransform(SPRITE_RES, 0, 0, SPRITE_RES, c.width / 2 - away, c.height / 2);
  g.lineWidth = CONFIG.glowBleed * 0.9 + CONFIG.border * 2;
  g.globalAlpha = CONFIG.glowStrength;
  for (let pass = 0; pass < 3; pass++) {
    g.fill(arrow);
    g.stroke(arrow);
  }

  // Border (its rounded joins soften the corners), then the fill on top
  g.shadowColor = "transparent";
  g.globalAlpha = 1;
  g.setTransform(SPRITE_RES, 0, 0, SPRITE_RES, c.width / 2, c.height / 2);
  if (CONFIG.border > 0) {
    g.strokeStyle = hex;
    g.lineWidth = CONFIG.border * 2;
    g.stroke(arrow);
  }
  g.fillStyle = CONFIG.arrowFill;
  g.fill(arrow);
  return c;
});

// --- Drawing ----------------------------------------------------------------
const LABEL_FONT = "600 11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

// On the shell an agent's size and visibility come from where it is on the
// sphere: large facing you, small at the rim, hidden round the back.
const shellFade = (i) => {
  const facing = Math.max(0, Math.min(1, (shellDepth[i] + 0.05) / 0.35));
  return 1 + (facing - 1) * shellK[i];
};
const sizeOf = (i) => {
  const base = 0.4 + 0.42 * depth[i];
  const worked = base + (0.95 - base) * busy[i];
  const free = worked + (1.25 - worked) * labelAlpha[i];
  const onShell = 0.4 + 0.6 * Math.max(shellDepth[i], 0);
  return free + (onShell + (1.25 - onShell) * labelAlpha[i] - free) * shellK[i];
};
const alphaOf = (i) => {
  const base = 0.6 + 0.4 * depth[i];
  return (base + (1 - base) * Math.max(labelAlpha[i], busy[i], shellK[i])) * shellFade(i);
};

function drawAgent(i) {
  const s = sizeOf(i) * dpr;
  const c = Math.cos(heading[i]) * s;
  const sn = Math.sin(heading[i]) * s;
  ctx.setTransform(c, sn, -sn, c, px[i] * dpr, py[i] * dpr);
  ctx.globalAlpha = alphaOf(i);
  ctx.drawImage(sprites[color[i]], -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
}

function drawWord() {
  const s = word.cell;
  const top = Math.round((word.y - window.scrollY) * dpr) / dpr;
  if (top > height || top + word.h < 0) return; // scrolled out of view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(word.image, word.x, top, word.image.width / dpr, word.image.height / dpr);

  // Erase the gaps where squares have been lifted out
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  for (let k = 0; k < word.shape.length; k++) {
    if (word.shape[k] && !word.filled[k]) {
      ctx.rect(word.x + (k % word.cols) * s, top + Math.floor(k / word.cols) * s, s, s);
    }
  }
  ctx.fill();

  // Colour the squares that agents have moved. Painting only where the word
  // already has ink keeps the letters' edges clean.
  ctx.globalCompositeOperation = "source-atop";
  for (let k = 0; k < word.tint.length; k++) {
    if (!word.tint[k] || !word.filled[k]) continue;
    ctx.fillStyle = CONFIG.palette[word.tint[k] - 1];
    ctx.fillRect(word.x + (k % word.cols) * s, top + Math.floor(k / word.cols) * s, s, s);
  }
  ctx.globalCompositeOperation = "source-over";

  // Squares in the air, centred on the agent carrying them and in its colour
  for (let i = 0; i < N; i++) {
    if (job[i] < 2) continue;
    ctx.fillStyle = CONFIG.palette[color[i]];
    ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (word.ready) drawWord();
  drawHive();
  drawSocial();
  drawMemory();

  // Labelled agents are drawn last so they sit on top of the swarm
  for (let i = 0; i < N; i++) if (labelAlpha[i] === 0) drawAgent(i);
  for (let i = 0; i < N; i++) if (labelAlpha[i] > 0) drawAgent(i);

  // Name pills beside labelled agents
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = CONFIG.ink;
  ctx.lineWidth = 1.25;
  for (let i = 0; i < N; i++) {
    const la = labelAlpha[i];
    if (la <= 0) continue;
    if (!labelWidth[i]) labelWidth[i] = ctx.measureText(labelText[i]).width;
    const w = labelWidth[i] + 16;
    const h = 20;
    const x = px[i] + 13;
    const y = py[i] + 5;
    const pill = la * pillAlpha[i] * shellFade(i);
    if (pill < 0.01) continue;
    ctx.globalAlpha = pill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fillStyle = CONFIG.palette[color[i]];
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CONFIG.ink;
    ctx.fillText(labelText[i], x + 8, y + h / 2 + 0.5);
  }
}

// --- Demo -------------------------------------------------------------------
// The pill nav switches between Hive, Social and Memory.
// Hive: the agent hierarchy as rings around a centre node, one tier at a time.
// Each step pulls the view back and fades in the next, larger ring with its cards.
// Social: all five rings at once, with agents trading places between them.
// Memory: five core agents each hold a stack of memory blocks; squads of drones
// orbit them, borrowing blocks and bringing them back.
const board = document.querySelector(".board");
const coreCard = document.querySelector(".node-core");
const demoTabs = Array.from(document.querySelectorAll(".pill button"));
const stepButtons = Array.from(document.querySelectorAll(".stepper [data-stage]"));
const stepPrev = document.querySelector(".step-prev");
const stepNext = document.querySelector(".step-next");
const stepCaption = document.querySelector(".step-caption");
const viewNote = document.querySelector(".view-note");

const HIVE = {
  // count: agents in the tier. rows: how many rings they are spread over.
  // size: arrow scale when the tier first appears. labels: how many carry a name.
  tiers: [
    { name: "Core", count: 5, rows: 1, size: 1.15, labels: 5, color: 0 },
    { name: "Lead", count: 15, rows: 1, size: 0.95, labels: 5, color: 3 },
    { name: "Specialist", count: 50, rows: 1, size: 0.8, labels: 5, color: 2 },
    { name: "Worker", count: 150, rows: 2, size: 0.62, labels: 6, color: 5 },
    { name: "Microdrone", count: 500, rows: 4, size: 0.5, labels: 6, color: 1 }
  ],
  coreRadius: 190, // px from the centre to the first ring, before any zoom
  ringGap: 125, // px between one tier and the next when the outer one first appears
  rowGap: 13, // px between a tier's rings when it first appears
  turn: 0.1 // radians per second the first ring turns; outer rings turn slower
};

// Social uses the same five tiers, all on screen together. Agents keep the
// colour of the tier they started in, so the rings visibly mix as they trade.
const SOCIAL = {
  note: "<strong>Social</strong> Agents govern themselves. Any agent can move toward the core or step back out as the work changes, and the swarm reorganizes around it.",
  radius: [0.16, 0.33, 0.52, 0.72, 0.92], // each tier's ring, as a share of the space available
  size: [0.85, 0.72, 0.6, 0.5, 0.44], // arrow scale per tier
  rowGap: 12, // px between a tier's rings
  swapsPerSecond: 5, // pairs of agents trading places
  travelTime: 1.5, // seconds a trade takes
  farChance: 0.2, // share of trades that skip a ring instead of going to the next one
  turn: 0.07 // radians per second the first ring turns; outer rings turn slower
};

// Memory: the blocks are the same black squares the swarm lifts out of the
// hero word. Hovering a core shows which agents depend on it.
const MEMORY = {
  note: "<strong>Memory</strong> Five core agents hold what the swarm knows. Every squad borrows the blocks it needs from its core and brings them back, so nothing is copied and nothing is lost. Hover a core to see who depends on it.",
  coreColors: [0, 3, 2, 5, 4], // palette colour of each core and its squads
  stack: [4, 3], // memory blocks per core: columns, rows
  block: 9, // px
  blockGap: 3,
  squads: 3, // groups of drones orbiting each core
  squadSize: 8,
  orbit: [58, 82, 106], // px radius of each squad's orbit (scaled down on small boards)
  orbitSpeed: 0.55, // radians per second for the innermost squad
  borrowsPerSecond: 1.6, // per core
  keepBack: 2, // blocks a core never lends out
  holdTime: [2.5, 6.5], // seconds a drone keeps a block before returning it
  travelTime: 0.7, // seconds between a squad and its core
  coreSize: 1.3,
  droneSize: 0.6,
  hoverRadius: 95 // px from a core that counts as hovering it
};

let demoView = "hive";
let hiveStage = 0; // 0..4: the outermost tier showing
let hiveZoom = 1;
let hiveShown = 0; // eased 0..1: is the Hive view up
const hive = { w: 0, h: 0, cx: 0, cy: 0, portrait: false };
const tierAlpha = HIVE.tiers.map(() => 0);

coreCard.style.setProperty("--c", CONFIG.palette[HIVE.tiers[0].color]);

// Name labels: a few agents per tier, evenly spaced round its outer ring,
// each with a job role like the main swarm's
const hiveLabels = [];
{
  let id = 0;
  for (const [k, tier] of HIVE.tiers.entries()) {
    const perRow = tier.count / tier.rows;
    for (let j = 0; j < tier.labels; j++) {
      const n = Math.floor(((j + 0.5) / tier.labels) * perRow);
      const role = CONFIG.roles[(Math.random() * CONFIG.roles.length) | 0];
      hiveLabels.push({
        tier: k,
        row: tier.rows - 1,
        n,
        text: role + " " + String(id + n + 1).padStart(3, "0"),
        width: 0,
        show: 0, // eased 0..1: has room, not covered by another label
        x: 0,
        y: 0,
        scale: 1
      });
    }
    id += tier.count;
  }
}

// Work out each tier's ring radius and the zoom at which it is the outermost
// ring. Depends on the board's size.
function layoutHive(w, h) {
  hive.w = w;
  hive.h = h;
  hive.cx = w / 2;
  hive.cy = h / 2 + 28; // a little low, clear of the stepper
  hive.fit = Math.max(120, Math.min(w / 2 - 16, h / 2 - 66)); // px radius the outer ring gets

  let radius = HIVE.coreRadius;
  for (const [k, tier] of HIVE.tiers.entries()) {
    tier.radius = radius;
    tier.zoom = Math.min(k === 0 ? 1.15 : 9, (hive.fit - (tier.rows - 1) * HIVE.rowGap) / radius);
    tier.rowStep = HIVE.rowGap / tier.zoom; // in unzoomed px
    radius += (tier.rows - 1) * tier.rowStep + HIVE.ringGap / tier.zoom;
  }
}

function setDemoView(view) {
  demoView = view;
  for (const t of demoTabs) t.setAttribute("aria-selected", t.dataset.view === view ? "true" : "false");
  board.classList.toggle("is-hive", view === "hive");
  const note = view === "social" ? SOCIAL.note : view === "memory" ? MEMORY.note : "";
  board.classList.toggle("has-note", note !== "");
  if (note) viewNote.innerHTML = note;
}

function setHiveStage(stage) {
  hiveStage = Math.max(0, Math.min(HIVE.tiers.length - 1, stage));
  for (const b of stepButtons) b.setAttribute("aria-pressed", Number(b.dataset.stage) === hiveStage ? "true" : "false");
  stepPrev.disabled = hiveStage === 0;
  stepNext.disabled = hiveStage === HIVE.tiers.length - 1;
  const tier = HIVE.tiers[hiveStage];
  stepCaption.textContent = "Tier " + (hiveStage + 1) + " of " + HIVE.tiers.length + " · " + tier.count + " " + tier.name.toLowerCase() + " agents";
}

for (const tab of demoTabs) tab.addEventListener("click", () => setDemoView(tab.dataset.view));
for (const b of stepButtons) b.addEventListener("click", () => setHiveStage(Number(b.dataset.stage)));
stepPrev.addEventListener("click", () => setHiveStage(hiveStage - 1));
stepNext.addEventListener("click", () => setHiveStage(hiveStage + 1));
setDemoView("hive");
setHiveStage(0);

let boardBox = null; // the board's place on screen this frame, or null when out of view

// Angle of the n-th agent on a ring of tier k, and how far that ring has turned
const hiveTurn = (k) => (time * HIVE.turn * (k % 2 ? -1 : 1)) / (1 + k * 0.7);
const hiveAngle = (k, row, n) => {
  const tier = HIVE.tiers[k];
  return hiveTurn(k) + ((n + (row % 2) * 0.5) / (tier.count / tier.rows)) * Math.PI * 2;
};
// A ring's radius on screen; it arrives from slightly further out as it fades up
const hiveRadius = (k, row) =>
  (HIVE.tiers[k].radius + row * HIVE.tiers[k].rowStep) * hiveZoom * (1 + 0.18 * (1 - tierAlpha[k]));

function updateHive(dt) {
  const box = board.getBoundingClientRect();
  boardBox = box.bottom > 0 && box.top < height ? box : null;
  if (!boardBox) return;
  if (box.width !== hive.w || box.height !== hive.h) layoutHive(box.width, box.height);

  const ease = Math.min(0.09 * dt, 1);
  hiveShown += ((demoView === "hive" ? 1 : 0) - hiveShown) * ease;
  hiveZoom += (HIVE.tiers[hiveStage].zoom - hiveZoom) * ease;
  for (let k = 0; k < HIVE.tiers.length; k++) {
    tierAlpha[k] += ((k <= hiveStage ? 1 : 0) - tierAlpha[k]) * ease;
  }

  // The centre card is an ordinary element; place and scale it to match the zoom
  coreCard.style.opacity = hiveShown.toFixed(3);
  coreCard.style.transform =
    "translate(" + hive.cx.toFixed(1) + "px," + hive.cy.toFixed(1) + "px) translate(-50%,-50%) scale(" +
    (hiveZoom / HIVE.tiers[0].zoom).toFixed(4) + ")";

  // Labels follow their agents and shrink with the zoom, down to a readable
  // minimum. Where two would overlap, the outer tier's label keeps its place
  // and the other fades until there is room.
  for (const l of hiveLabels) {
    const a = hiveAngle(l.tier, l.row, l.n);
    const r = hiveRadius(l.tier, l.row);
    l.scale = Math.max(0.7, Math.pow(hiveZoom / HIVE.tiers[l.tier].zoom, 0.6));
    l.x = hive.cx + Math.cos(a) * r + 11 * l.scale;
    l.y = hive.cy + Math.sin(a) * r + 4 * l.scale;
  }
  for (let i = hiveLabels.length - 1; i >= 0; i--) {
    const l = hiveLabels[i];
    let room = l.tier <= hiveStage ? 1 : 0;
    const w = (l.width + 16) * l.scale;
    const h = 20 * l.scale;
    for (let j = hiveLabels.length - 1; j > i && room; j--) {
      const o = hiveLabels[j];
      if (o.show < 0.5 || o.tier > hiveStage) continue;
      const ow = (o.width + 16) * o.scale;
      const oh = 20 * o.scale;
      if (l.x < o.x + ow + 4 && o.x < l.x + w + 4 && l.y < o.y + oh + 3 && o.y < l.y + h + 3) room = 0;
    }
    l.show += (room - l.show) * Math.min(0.1 * dt, 1);
  }
}

function drawHive() {
  if (!boardBox || hiveShown < 0.01) return;
  const cx = boardBox.left + hive.cx;
  const cy = boardBox.top + hive.cy;
  for (const [k, tier] of HIVE.tiers.entries()) {
    const alpha = tierAlpha[k] * hiveShown;
    if (alpha < 0.01) continue;
    const sprite = sprites[tier.color];
    // arrows shrink more slowly than the rings do, so far tiers stay readable
    const size = tier.size * Math.pow(hiveZoom / tier.zoom, 0.6) * (0.6 + 0.4 * tierAlpha[k]) * dpr;
    const perRow = tier.count / tier.rows;
    ctx.globalAlpha = alpha;
    for (let row = 0; row < tier.rows; row++) {
      const r = hiveRadius(k, row);
      for (let n = 0; n < perRow; n++) {
        const a = hiveAngle(k, row, n);
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // each arrow points at the centre node: (-c, -sn) is the inward direction
        ctx.setTransform(-c * size, -sn * size, sn * size, -c * size, (cx + c * r) * dpr, (cy + sn * r) * dpr);
        ctx.drawImage(sprite, -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
      }
    }
  }

  // Name pills, in the same style as the main swarm's
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = CONFIG.ink;
  ctx.lineWidth = 1.25;
  for (const l of hiveLabels) {
    const alpha = l.show * tierAlpha[l.tier] * hiveShown;
    if (alpha < 0.01) continue;
    if (!l.width) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      l.width = ctx.measureText(l.text).width;
    }
    const s = l.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (boardBox.left + l.x) * dpr, (boardBox.top + l.y) * dpr);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(0, 0, l.width + 16, 20, 6);
    ctx.fillStyle = CONFIG.palette[HIVE.tiers[l.tier].color];
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CONFIG.ink;
    ctx.fillText(l.text, 8, 10.5);
  }
}

// --- Social -------------------------------------------------------------------
// Every agent owns a slot (tier, ring within the tier, place on the ring).
// A trade swaps the slots of two agents in different tiers; each then flies
// a curved path to its new slot while the rings keep turning.
const SN = HIVE.tiers.reduce((sum, t) => sum + t.count, 0);
const soTier = new Uint8Array(SN); // the slot the agent is in, or heading for
const soRow = new Uint8Array(SN);
const soIdx = new Uint16Array(SN);
const soFromTier = new Uint8Array(SN); // the slot it is leaving
const soFromRow = new Uint8Array(SN);
const soFromIdx = new Uint16Array(SN);
const soMove = new Float32Array(SN).fill(1); // 0..1 progress of the current move; 1 = settled
const soColor = new Uint8Array(SN);
const soHead = new Float32Array(SN);
const soX = new Float32Array(SN);
const soY = new Float32Array(SN);
const soSize = new Float32Array(SN);
const tierStart = []; // index of each tier's first agent, to pick one at random
{
  let i = 0;
  for (const [k, tier] of HIVE.tiers.entries()) {
    tierStart.push(i);
    const perRow = tier.count / tier.rows;
    for (let n = 0; n < tier.count; n++, i++) {
      soTier[i] = soFromTier[i] = k;
      soRow[i] = soFromRow[i] = Math.floor(n / perRow);
      soIdx[i] = soFromIdx[i] = n % perRow;
      soColor[i] = tier.color;
    }
  }
  tierStart.push(i);
}
// who currently holds each tier's slots, so a random member of a tier can be found
const tierMembers = HIVE.tiers.map((t, k) => Array.from({ length: t.count }, (_, n) => tierStart[k] + n));

let socialShown = 0; // eased 0..1
let swapsDue = 0;
let socialPlaced = false;
const slot = { r: 0, a: 0 };

// Where a slot is right now: distance from the centre and angle
function slotAt(k, row, n, out) {
  const tier = HIVE.tiers[k];
  const perRow = tier.count / tier.rows;
  out.r = hive.fit * SOCIAL.radius[k] + row * SOCIAL.rowGap;
  out.a = (time * SOCIAL.turn * (k % 2 ? -1 : 1)) / (1 + k * 0.6) + ((n + (row % 2) * 0.5) / perRow) * Math.PI * 2;
}

function trade() {
  // pick an agent, then a partner one ring in or out (sometimes two)
  const ka = (Math.random() * HIVE.tiers.length) | 0;
  const jump = (Math.random() < SOCIAL.farChance ? 2 : 1) * (Math.random() < 0.5 ? -1 : 1);
  const kb = ka + jump;
  if (kb < 0 || kb >= HIVE.tiers.length) return;
  const ia = (Math.random() * tierMembers[ka].length) | 0;
  const ib = (Math.random() * tierMembers[kb].length) | 0;
  const a = tierMembers[ka][ia];
  const b = tierMembers[kb][ib];
  if (soMove[a] < 1 || soMove[b] < 1) return; // one of them is already on the move

  for (const i of [a, b]) {
    soFromTier[i] = soTier[i];
    soFromRow[i] = soRow[i];
    soFromIdx[i] = soIdx[i];
    soMove[i] = 0;
  }
  soTier[a] = soFromTier[b];
  soRow[a] = soFromRow[b];
  soIdx[a] = soFromIdx[b];
  soTier[b] = soFromTier[a];
  soRow[b] = soFromRow[a];
  soIdx[b] = soFromIdx[a];
  tierMembers[ka][ia] = b;
  tierMembers[kb][ib] = a;
}

function updateSocial(dt) {
  if (!boardBox) return;
  const on = demoView === "social";
  socialShown += ((on ? 1 : 0) - socialShown) * Math.min(0.09 * dt, 1);
  if (socialShown < 0.01) return;

  const seconds = dt / 60;
  if (on) {
    swapsDue = Math.min(swapsDue + SOCIAL.swapsPerSecond * seconds, 3);
    while (swapsDue >= 1) {
      swapsDue -= 1;
      trade();
    }
  }

  const scale = Math.sqrt(Math.min(1, hive.fit / 290)); // smaller arrows on small boards
  for (let i = 0; i < SN; i++) {
    if (soMove[i] < 1) soMove[i] = Math.min(1, soMove[i] + seconds / SOCIAL.travelTime);
    const t = soMove[i];
    const e = t * t * (3 - 2 * t);

    slotAt(soTier[i], soRow[i], soIdx[i], slot);
    let r = slot.r;
    let a = slot.a;
    let size = SOCIAL.size[soTier[i]];
    if (t < 1) {
      // part-way: blend distance and angle (the short way round) from the old slot
      const toR = r;
      const toA = a;
      slotAt(soFromTier[i], soFromRow[i], soFromIdx[i], slot);
      const turn = Math.atan2(Math.sin(toA - slot.a), Math.cos(toA - slot.a));
      r = slot.r + (toR - slot.r) * e;
      a = slot.a + turn * e;
      const fromSize = SOCIAL.size[soFromTier[i]];
      // movers swell a little mid-flight so the trade is easy to follow
      size = (fromSize + (size - fromSize) * e) * (1 + 0.55 * Math.sin(Math.PI * t));
    }
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    // settled agents face the centre; movers face where they are going
    let want = a + Math.PI;
    if (t < 1 && socialPlaced) {
      const dx = x - soX[i];
      const dy = y - soY[i];
      if (dx * dx + dy * dy > 0.01) want = Math.atan2(dy, dx);
    }
    if (socialPlaced) {
      const turn = Math.atan2(Math.sin(want - soHead[i]), Math.cos(want - soHead[i]));
      soHead[i] += turn * Math.min(0.2 * dt, 1);
    } else {
      soHead[i] = want;
    }
    soX[i] = x;
    soY[i] = y;
    soSize[i] = size * scale;
  }
  socialPlaced = true;
}

function drawSocial() {
  if (!boardBox || socialShown < 0.01 || !socialPlaced) return;
  const cx = boardBox.left + hive.cx;
  const cy = boardBox.top + hive.cy;

  // settled agents first, movers on top
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < SN; i++) {
      if ((soMove[i] < 1) !== (pass === 1)) continue;
      const s = soSize[i] * dpr;
      const c = Math.cos(soHead[i]) * s;
      const sn = Math.sin(soHead[i]) * s;
      ctx.setTransform(c, sn, -sn, c, (cx + soX[i]) * dpr, (cy + soY[i]) * dpr);
      ctx.globalAlpha = socialShown;
      ctx.drawImage(sprites[soColor[i]], -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
    }
  }
}

// --- Memory -------------------------------------------------------------------
const MC = MEMORY.coreColors.length;
const MCELLS = MEMORY.stack[0] * MEMORY.stack[1];
const MD = MC * MEMORY.squads * MEMORY.squadSize;
const memCoreX = new Float32Array(MC);
const memCoreY = new Float32Array(MC);
const memCell = new Uint8Array(MC * MCELLS).fill(1); // 1 = block is in the stack
const memHeld = new Uint8Array(MC * MCELLS); // a drone is on its way to this cell
const memFocus = new Float32Array(MC); // eased 0..1: this core is hovered
const memDue = new Float32Array(MC);
const mdState = new Uint8Array(MD); // 0 orbiting, 1 going for a block, 2 bringing it out,
//                                     3 orbiting with it, 4 taking it back, 5 returning empty
const mdTrip = new Float32Array(MD); // 0 = at its squad, 1 = at the stack
const mdCellOf = new Int16Array(MD);
const mdUntil = new Float32Array(MD);
const mdX = new Float32Array(MD);
const mdY = new Float32Array(MD);
const mdHead = new Float32Array(MD);
let memoryShown = 0; // eased 0..1
let memDim = 0; // eased 0..1: some core is hovered, so the others fade back
let memOrbitScale = 1;
let memPlaced = false;

const mdCore = (i) => Math.floor(i / (MEMORY.squads * MEMORY.squadSize));
const mdSquad = (i) => Math.floor(i / MEMORY.squadSize) % MEMORY.squads;
const memPitch = MEMORY.block + MEMORY.blockGap;
// centre of a stack cell, relative to the board's centre
const memCellX = (c, cell) => memCoreX[c] + ((cell % MEMORY.stack[0]) - (MEMORY.stack[0] - 1) / 2) * memPitch;
const memCellY = (c, cell) => memCoreY[c] + (Math.floor(cell / MEMORY.stack[0]) - (MEMORY.stack[1] - 1) / 2) * memPitch;

// A random cell of core c that is filled (want = 1) or empty (want = 0) and not spoken for
function memPick(c, want) {
  const start = (Math.random() * MCELLS) | 0;
  for (let n = 0; n < MCELLS; n++) {
    const cell = (start + n) % MCELLS;
    if (memCell[c * MCELLS + cell] === want && !memHeld[c * MCELLS + cell]) return cell;
  }
  return -1;
}

function updateMemory(dt) {
  if (!boardBox) return;
  const on = demoView === "memory";
  memoryShown += ((on ? 1 : 0) - memoryShown) * Math.min(0.09 * dt, 1);
  if (memoryShown < 0.01) return;
  const seconds = dt / 60;

  // Cores sit on an oval that uses the board's shape; orbits shrink if cores are close
  const rx = Math.min(hive.w * 0.34, hive.fit * 1.5);
  const ry = Math.max(hive.fit * 0.6, Math.min(hive.h * 0.26, rx * 1.6)); // taller on tall boards
  for (let c = 0; c < MC; c++) {
    const a = -Math.PI / 2 + (c / MC) * Math.PI * 2;
    memCoreX[c] = Math.cos(a) * rx;
    memCoreY[c] = Math.sin(a) * ry + 10;
  }
  let nearest = Infinity;
  for (let c = 1; c < MC; c++) {
    nearest = Math.min(nearest, Math.hypot(memCoreX[c] - memCoreX[c - 1], memCoreY[c] - memCoreY[c - 1]));
  }
  memOrbitScale = Math.min(1, nearest / 250);

  // Which core is the pointer on?
  let hovered = -1;
  if (on && pointer.inside) {
    const mx = pointer.x - boardBox.left - hive.cx;
    const my = pointer.y - boardBox.top - hive.cy;
    let best = MEMORY.hoverRadius * Math.max(memOrbitScale, 0.6);
    for (let c = 0; c < MC; c++) {
      const d = Math.hypot(mx - memCoreX[c], my - memCoreY[c]);
      if (d < best) {
        best = d;
        hovered = c;
      }
    }
  }
  const ease = Math.min(0.12 * dt, 1);
  memDim += ((hovered !== -1 ? 1 : 0) - memDim) * ease;
  for (let c = 0; c < MC; c++) memFocus[c] += ((c === hovered ? 1 : 0) - memFocus[c]) * ease;

  // Send drones to borrow blocks
  if (on) {
    for (let c = 0; c < MC; c++) {
      memDue[c] = Math.min(memDue[c] + MEMORY.borrowsPerSecond * seconds, 2);
      while (memDue[c] >= 1) {
        memDue[c] -= 1;
        let inStack = 0;
        for (let cell = 0; cell < MCELLS; cell++) {
          if (memCell[c * MCELLS + cell] && !memHeld[c * MCELLS + cell]) inStack++;
        }
        if (inStack <= MEMORY.keepBack) break;
        const perCore = MEMORY.squads * MEMORY.squadSize;
        const i = c * perCore + ((Math.random() * perCore) | 0);
        if (mdState[i] !== 0) continue;
        const cell = memPick(c, 1);
        memHeld[c * MCELLS + cell] = 1;
        mdCellOf[i] = cell;
        mdState[i] = 1;
        mdTrip[i] = 0;
      }
    }
  }

  const tripStep = seconds / MEMORY.travelTime;
  for (let i = 0; i < MD; i++) {
    const c = mdCore(i);
    const g = mdSquad(i);
    const at = c * MCELLS + mdCellOf[i];

    switch (mdState[i]) {
      case 1: // reach the stack, take the block
        mdTrip[i] += tripStep;
        if (mdTrip[i] >= 1) {
          mdTrip[i] = 1;
          memCell[at] = 0;
          memHeld[at] = 0;
          mdState[i] = 2;
        }
        break;
      case 2: // carry it out to the squad
        mdTrip[i] -= tripStep;
        if (mdTrip[i] <= 0) {
          mdTrip[i] = 0;
          mdState[i] = 3;
          mdUntil[i] = time + MEMORY.holdTime[0] + Math.random() * (MEMORY.holdTime[1] - MEMORY.holdTime[0]);
        }
        break;
      case 3: { // keep it for a while, then pick an empty cell to return it to
        if (time < mdUntil[i]) break;
        const cell = memPick(c, 0);
        if (cell === -1) break;
        memHeld[c * MCELLS + cell] = 1;
        mdCellOf[i] = cell;
        mdState[i] = 4;
        break;
      }
      case 4: // carry it back
        mdTrip[i] += tripStep;
        if (mdTrip[i] >= 1) {
          mdTrip[i] = 1;
          memCell[at] = 1;
          memHeld[at] = 0;
          mdState[i] = 5;
        }
        break;
      case 5: // rejoin the squad
        mdTrip[i] -= tripStep;
        if (mdTrip[i] <= 0) {
          mdTrip[i] = 0;
          mdState[i] = 0;
        }
        break;
    }

    // Its place in the squad: squads circle the core, alternating direction
    const radius = MEMORY.orbit[g] * memOrbitScale;
    const dir = g % 2 ? -1 : 1;
    const a =
      c * 1.7 + g * 2.1 + ((dir * time * MEMORY.orbitSpeed) / (1 + g * 0.45)) +
      ((i % MEMORY.squadSize) * 15 * dir) / MEMORY.orbit[g];
    const sx = memCoreX[c] + Math.cos(a) * radius;
    const sy = memCoreY[c] + Math.sin(a) * radius;
    const t = mdTrip[i];
    const e = t * t * (3 - 2 * t);
    const x = sx + (memCellX(c, mdCellOf[i]) - sx) * e;
    const y = sy + (memCellY(c, mdCellOf[i]) - sy) * e;

    // face the way it is moving
    if (memPlaced) {
      const dx = x - mdX[i];
      const dy = y - mdY[i];
      if (dx * dx + dy * dy > 0.01) {
        const turn = Math.atan2(Math.sin(Math.atan2(dy, dx) - mdHead[i]), Math.cos(Math.atan2(dy, dx) - mdHead[i]));
        mdHead[i] += turn * Math.min(0.25 * dt, 1);
      }
    } else {
      mdHead[i] = a + (dir * Math.PI) / 2;
    }
    mdX[i] = x;
    mdY[i] = y;
  }
  memPlaced = true;
}

function drawMemory() {
  if (!boardBox || memoryShown < 0.01 || !memPlaced) return;
  const cx = boardBox.left + hive.cx;
  const cy = boardBox.top + hive.cy;
  const half = MEMORY.block / 2;
  // a hovered core's agents stay bright while the others fade back
  const fade = (c) => memoryShown * (1 - memDim * (1 - memFocus[c]) * 0.72);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Hovered: a line from the core to every agent that depends on it
  ctx.lineWidth = 1;
  for (let c = 0; c < MC; c++) {
    if (memFocus[c] < 0.02) continue;
    ctx.globalAlpha = memoryShown * memFocus[c] * 0.5;
    ctx.strokeStyle = CONFIG.palette[MEMORY.coreColors[c]];
    ctx.beginPath();
    for (let i = 0; i < MD; i++) {
      if (mdCore(i) !== c) continue;
      ctx.moveTo(cx + memCoreX[c], cy + memCoreY[c]);
      ctx.lineTo(cx + mdX[i], cy + mdY[i]);
    }
    ctx.stroke();
  }

  // Stacks: blocks in place are solid, lent-out cells are outlines
  for (let c = 0; c < MC; c++) {
    ctx.globalAlpha = fade(c);
    ctx.fillStyle = CONFIG.ink;
    ctx.strokeStyle = "#c2c2bd";
    ctx.beginPath();
    for (let cell = 0; cell < MCELLS; cell++) {
      const x = cx + memCellX(c, cell) - half;
      const y = cy + memCellY(c, cell) - half;
      if (memCell[c * MCELLS + cell]) ctx.rect(x, y, MEMORY.block, MEMORY.block);
      else ctx.strokeRect(x + 0.5, y + 0.5, MEMORY.block - 1, MEMORY.block - 1);
    }
    ctx.fill();
  }

  // Blocks being carried, under their drones
  ctx.fillStyle = CONFIG.ink;
  for (let i = 0; i < MD; i++) {
    if (mdState[i] < 2 || mdState[i] > 4) continue;
    ctx.globalAlpha = fade(mdCore(i));
    ctx.fillRect(cx + mdX[i] - half, cy + mdY[i] - half, MEMORY.block, MEMORY.block);
  }

  // Drones
  const scale = Math.max(0.75, memOrbitScale);
  for (let i = 0; i < MD; i++) {
    const c = mdCore(i);
    const s = MEMORY.droneSize * scale * (1 + 0.25 * memFocus[c]) * dpr;
    const co = Math.cos(mdHead[i]) * s;
    const sn = Math.sin(mdHead[i]) * s;
    ctx.setTransform(co, sn, -sn, co, (cx + mdX[i]) * dpr, (cy + mdY[i]) * dpr);
    ctx.globalAlpha = fade(c);
    ctx.drawImage(sprites[MEMORY.coreColors[c]], -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
  }

  // Cores: a large cursor at the corner of each stack, pointing into it
  const stackW = MEMORY.stack[0] * memPitch;
  const stackH = MEMORY.stack[1] * memPitch;
  for (let c = 0; c < MC; c++) {
    const s = MEMORY.coreSize * scale * dpr;
    const k = Math.SQRT1_2 * s;
    const x = cx + memCoreX[c] - stackW / 2 - 9;
    const y = cy + memCoreY[c] - stackH / 2 - 9;
    ctx.setTransform(k, k, -k, k, x * dpr, y * dpr);
    ctx.globalAlpha = fade(c);
    ctx.drawImage(sprites[MEMORY.coreColors[c]], -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
  }

  // Hovered: how many of the core's blocks are in the stack right now
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = CONFIG.ink;
  ctx.lineWidth = 1.25;
  for (let c = 0; c < MC; c++) {
    if (memFocus[c] < 0.02) continue;
    let inStack = 0;
    for (let cell = 0; cell < MCELLS; cell++) inStack += memCell[c * MCELLS + cell];
    const text = "Core " + String(c + 1).padStart(2, "0") + " · " + inStack + " of " + MCELLS + " blocks in";
    const w = ctx.measureText(text).width + 16;
    const x = cx + memCoreX[c] - w / 2;
    const y = cy + memCoreY[c] + stackH / 2 + 10;
    ctx.globalAlpha = memoryShown * memFocus[c];
    ctx.beginPath();
    ctx.roundRect(x, y, w, 20, 6);
    ctx.fillStyle = CONFIG.palette[MEMORY.coreColors[c]];
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CONFIG.ink;
    ctx.fillText(text, x + 8, y + 10.5);
  }
}

requestAnimationFrame(step);