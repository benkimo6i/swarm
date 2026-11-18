// The pricing swarm: the cursors a plan releases. Picking a plan grows or
// shrinks one persistent swarm to that plan's size: new cursors pour out of
// the plan's node, extras fly back into the node they came from and vanish.
// Then it gets to work: a few run along the wire, some take the old copy off
// the centre card word by word, and others fetch the new words from the plan's
// node and put them in place. Free cursors drift around the card on a flow
// field, like the hero's swarm, and keep clear of every card so all of it
// stays readable. Positions are relative to the section, so it scrolls with
// the page.

import { CONFIG, PRICING } from "../config.js";
import { stage, ctx } from "../stage.js";
import { stamp } from "../sprites.js";
import { theme } from "../theme.js";
import { noise } from "../noise.js";
import { clipOut } from "../demo/board.js";
import { section, hub, nodes, wires, wireDrawn, along } from "./graph.js";

const S = PRICING.swarm;
const MAX = Math.max(...PRICING.plans.map((p) => p.swarm));

const px = new Float32Array(MAX);
const py = new Float32Array(MAX);
const vx = new Float32Array(MAX);
const vy = new Float32Array(MAX);
const head = new Float32Array(MAX);
const alpha = new Float32Array(MAX); // fades in when released, out when leaving
const busy = new Float32Array(MAX); // eased 0..1, enlarges working cursors
const drift = new Float32Array(MAX); // how strongly the flow field moves this one
const orbitA = new Float32Array(MAX); // its place on the loose orbit round the card
const orbitR = new Float32Array(MAX);
const state = new Uint8Array(MAX); // 0 unused, 1 in the swarm, 2 leaving
const home = new Int8Array(MAX); // the plan node a leaving cursor flies into
const color = new Uint8Array(MAX);
const recolor = new Int8Array(MAX).fill(-1); // its next colour, once recolorAt passes
const recolorAt = new Float32Array(MAX);
for (let i = 0; i < MAX; i++) {
  drift[i] = 0.6 + Math.random() * 0.7;
  orbitA[i] = Math.random() * Math.PI * 2;
  orbitR[i] = Math.sqrt(Math.random());
}

// Jobs
const FREE = 0;
const WIRE = 1; // running along the wire
const FETCH = 2; // heading for an old word to take
const DROP = 3; // carrying it off; it fades as it goes
const PICK = 4; // heading to the plan node for a new word
const PUT = 5; // carrying the new word to its place
const job = new Uint8Array(MAX);
const jobN = new Int16Array(MAX); // which piece, or which wire cursor
const jobT = new Float32Array(MAX);
const dropX = new Float32Array(MAX);
const dropY = new Float32Array(MAX);
const chip = new Array(MAX).fill(null); // the word being carried
const ax_ = new Float32Array(MAX); // this frame's steering
const ay_ = new Float32Array(MAX);
const push = { x: 0, y: 0 }; // avoid() adds to this

let live = 0; // cursors in the swarm, not counting those leaving
let target = 0; // cursors the current plan wants
let from = 0; // the node new cursors pour out of
let cursorSize = 0.6; // eased toward the plan's
let wantSize = 0.6;
let spawnDue = 0;

const work = { k: -1, t: 0, take: [], place: [], nextTake: 0, nextPlace: 0, taken: 0, placed: 0, wired: 0, takeDue: 0, placeDue: 0 };

// --- This frame's boxes, relative to the section ------------------------------------
let sec = null;
let W = 0;
let H = 0;
const box = (r) => ({
  l: r.left - sec.left,
  t: r.top - sec.top,
  r: r.right - sec.left,
  b: r.bottom - sec.top,
  w: r.width,
  h: r.height,
  cx: r.left - sec.left + r.width / 2,
  cy: r.top - sec.top + r.height / 2
});
let hubBox = null;
let nodeBox = [];

// --- Picking a plan ----------------------------------------------------------------
// every swarm is an even mix of the whole palette
const planColor = () => (Math.random() * CONFIG.palette.length) | 0;

// Grow or shrink the swarm for plan k (prev: the plan picked before, or -1)
export function setSwarm(k, prev) {
  const plan = PRICING.plans[k];
  target = plan.swarm;
  from = k;
  wantSize = plan.cursorSize;
  // keep busy cursors first, then free ones, until there are enough
  let kept = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < MAX; i++) {
      if (state[i] !== 1 || (job[i] === FREE) !== (pass === 1)) continue;
      if (kept < target) {
        kept++;
        recolor[i] = planColor();
        recolorAt[i] = stage.time + Math.random() * 0.9;
      } else {
        state[i] = 2;
        live--; // it's on its way out: the swarm can refill while it leaves
        home[i] = prev >= 0 ? prev : k;
      }
    }
  }
}

// Start the jobs for plan k: take the old pieces, put in the new ones
export function startWork(k, take, place) {
  // jobs for the copy that's being replaced are dropped; carried words are carried off
  for (let i = 0; i < MAX; i++) {
    if (job[i] === PICK || job[i] === WIRE || job[i] === FETCH) {
      job[i] = FREE;
      chip[i] = null;
    } else if (job[i] === PUT) {
      startDrop(i);
    }
  }
  Object.assign(work, { k, t: 0, take, place, nextTake: 0, nextPlace: 0, taken: 0, placed: 0, wired: 0, takeDue: 0, placeDue: 0 });
}

export const workDone = () => work.k >= 0 && work.placed >= work.place.length && work.taken >= work.take.length;

// --- Helpers ------------------------------------------------------------------------
function nearestFree(x, y) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < MAX; i++) {
    if (state[i] !== 1 || job[i] !== FREE || alpha[i] < 0.5) continue;
    const d = (px[i] - x) ** 2 + (py[i] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function makeChip(piece) {
  const r = piece.getBoundingClientRect();
  const s = getComputedStyle(piece);
  return {
    text: piece.textContent,
    font: s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily,
    color: s.color,
    bg: piece.classList.contains("hub-cta") ? s.backgroundColor : null,
    w: r.width,
    h: r.height,
    a: 1
  };
}

// The cursor holds a word by its top-left corner; this is where the cursor
// has to be for the word to sit on piece p
const hold = { x: 0, y: 0 };
function holdAt(p) {
  const b = box(p.getBoundingClientRect());
  hold.x = b.l + 4;
  hold.y = b.t + 2;
  return hold;
}

function startDrop(i) {
  job[i] = DROP;
  jobT[i] = 0;
  // carry it out past the card's edge, away from its middle
  const dx = px[i] - hubBox.cx;
  const dy = py[i] - hubBox.cy;
  const d = Math.hypot(dx, dy) + 0.001;
  const reach = Math.max(hubBox.w, hubBox.h) / 2 + 50 + Math.random() * 110;
  dropX[i] = Math.max(20, Math.min(W - 20, hubBox.cx + (dx / d) * reach));
  dropY[i] = Math.max(20, Math.min(H - 20, hubBox.cy + (dy / d) * reach));
}

// A new word may go in once enough of the old copy has been taken, so the
// two never pile up on top of each other
function mayPlace(n) {
  const need = Math.min(1, (n + 1) / work.place.length + 0.15);
  return work.taken >= Math.ceil(need * work.take.length);
}

// --- Neighbour grid ----------------------------------------------------------------
const CELL = S.neighborRadius;
let cols = 1;
let rows = 1;
let cellHead = new Int32Array(1);
const cellNext = new Int32Array(MAX);
const cellX = (x) => Math.max(0, Math.min(cols - 1, Math.floor(x / CELL) + 1));
const cellY = (y) => Math.max(0, Math.min(rows - 1, Math.floor(y / CELL) + 1));

// --- Update -------------------------------------------------------------------------
export function updateSwarm(dt) {
  sec = section.getBoundingClientRect();
  W = sec.width;
  H = sec.height;
  hubBox = box(hub.getBoundingClientRect());
  nodeBox = nodes.map((n) => box(n.getBoundingClientRect()));
  if (work.k < 0) return; // nothing picked yet
  const seconds = dt / 60;
  const time = stage.time;
  work.t += seconds;
  cursorSize += (wantSize - cursorSize) * Math.min(0.05 * dt, 1);

  // Release new cursors from the plan's node
  if (live < target) {
    spawnDue = Math.min(spawnDue + (target / S.releaseTime) * seconds, target - live);
    const n = nodeBox[from];
    const plan = PRICING.plans[from];
    for (let i = 0; i < MAX && spawnDue >= 1; i++) {
      if (state[i]) continue;
      spawnDue -= 1;
      live++;
      state[i] = 1;
      job[i] = FREE;
      chip[i] = null;
      alpha[i] = 0;
      busy[i] = 0;
      px[i] = n.l + Math.random() * n.w;
      py[i] = n.t + Math.random() * n.h;
      const a = Math.atan2(py[i] - n.cy, px[i] - n.cx) + (Math.random() - 0.5);
      vx[i] = Math.cos(a) * (2 + Math.random() * 3);
      vy[i] = Math.sin(a) * (2 + Math.random() * 3);
      head[i] = a;
      color[i] = planColor();
      recolor[i] = -1;
    }
  }

  // Hand out jobs
  if (work.wired < S.wireCursors && work.t < PRICING.connectTime * 0.5) {
    const w = wires[work.k];
    const i = nearestFree(w.ax - sec.left, w.ay - sec.top);
    if (i !== -1) {
      job[i] = WIRE;
      jobN[i] = work.wired++;
    }
  }
  if (work.t >= S.takeStart) {
    work.takeDue = Math.min(work.takeDue + S.takesPerSecond * seconds, 3);
    while (work.takeDue >= 1 && work.nextTake < work.take.length) {
      const p = holdAt(work.take[work.nextTake]);
      const i = nearestFree(p.x, p.y);
      if (i === -1) break;
      work.takeDue -= 1;
      job[i] = FETCH;
      jobN[i] = work.nextTake++;
    }
  }
  if (work.t >= S.placeStart) {
    work.placeDue = Math.min(work.placeDue + S.placesPerSecond * seconds, 3);
    const n = nodeBox[work.k];
    while (work.placeDue >= 1 && work.nextPlace < work.place.length) {
      const i = nearestFree(n.cx, n.cy);
      if (i === -1) break;
      work.placeDue -= 1;
      job[i] = PICK;
      jobN[i] = work.nextPlace++;
    }
  }

  // Rebuild the neighbour grid
  const c = Math.ceil(W / CELL) + 2;
  const r = Math.ceil(H / CELL) + 2;
  if (c !== cols || r !== rows) {
    cols = c;
    rows = r;
    cellHead = new Int32Array(cols * rows);
  }
  cellHead.fill(-1);
  for (let i = 0; i < MAX; i++) {
    if (!state[i]) continue;
    const k = cellX(px[i]) + cellY(py[i]) * cols;
    cellNext[i] = cellHead[k];
    cellHead[k] = i;
  }

  const nr2 = S.neighborRadius * S.neighborRadius;
  const sr = S.separationRadius;
  const sr2 = sr * sr;
  const fs = S.flowScale;
  const ft = time * S.flowSpeed;
  // the loose orbit free cursors drift around, filling the section round the card
  // (an ellipse clears the card's corners once it's √2 times the card's half-size)
  const innerX = (hubBox.w / 2 + S.avoid) * 1.42;
  const innerY = (hubBox.h / 2 + S.avoid) * 1.42;
  const spanX = Math.max(W / 2 - innerX - 20, 30);
  const spanY = Math.max(H / 2 - innerY - 20, 30);

  for (let i = 0; i < MAX; i++) {
    if (!state[i]) continue;
    if (recolor[i] >= 0 && time >= recolorAt[i]) {
      color[i] = recolor[i];
      recolor[i] = -1;
    }
    const x = px[i];
    const y = py[i];
    let tx = x;
    let ty = y;
    let pull = S.pull;
    let top = S.maxSpeed;
    let free = false;
    let snap = false; // close in exactly on the target

    if (state[i] === 2) {
      // leaving: fly into the old plan's node and fade out there
      const n = nodeBox[home[i]];
      tx = n.cx;
      ty = n.cy;
      pull = 0.13;
      top = S.carrySpeed;
      if (x > n.l && x < n.r && y > n.t && y < n.b) alpha[i] -= seconds * 5;
      if (chip[i]) chip[i].a = Math.max(0, chip[i].a - seconds * 3);
      if (alpha[i] <= 0) {
        state[i] = 0;
        job[i] = FREE;
        chip[i] = null;
        continue;
      }
    } else {
      alpha[i] = Math.min(1, alpha[i] + seconds * 4);
      switch (job[i]) {
        case WIRE: {
          if (work.t > PRICING.connectTime + 0.15) {
            job[i] = FREE;
            break;
          }
          // trail the end of the solid wire, a little either side of it
          const m = jobN[i];
          const p = along(wires[work.k], Math.max(0, Math.min(1, wireDrawn[work.k] - m * 0.05)));
          const side = (m % 2 ? 1 : -1) * Math.ceil(m / 2) * 5;
          tx = p.x - Math.sin(p.a) * side - sec.left;
          ty = p.y + Math.cos(p.a) * side - sec.top;
          pull = 0.2;
          top = S.carrySpeed * 1.3;
          break;
        }
        case FETCH: {
          const piece = work.take[jobN[i]];
          const p = holdAt(piece);
          tx = p.x;
          ty = p.y;
          pull = 0.13;
          top = S.carrySpeed;
          snap = true;
          if (Math.hypot(tx - x, ty - y) < 1.5) {
            chip[i] = makeChip(piece);
            piece.classList.remove("on");
            work.taken++;
            startDrop(i);
          }
          break;
        }
        case DROP: {
          jobT[i] += seconds;
          tx = dropX[i];
          ty = dropY[i];
          pull = 0.1;
          top = S.carrySpeed * 0.7;
          chip[i].a = Math.max(0, 1 - Math.max(0, jobT[i] - S.dropAfter) / S.dropFade);
          if (chip[i].a <= 0) {
            chip[i] = null;
            job[i] = FREE;
          }
          break;
        }
        case PICK: {
          const n = nodeBox[work.k];
          tx = n.cx;
          ty = n.cy;
          pull = 0.13;
          top = S.carrySpeed;
          if (Math.abs(x - n.cx) < n.w / 2 - 6 && Math.abs(y - n.cy) < n.h / 2 - 4) {
            chip[i] = makeChip(work.place[jobN[i]]);
            chip[i].a = 0;
            job[i] = PUT;
          }
          break;
        }
        case PUT: {
          const piece = work.place[jobN[i]];
          const p = holdAt(piece);
          tx = p.x;
          ty = p.y;
          pull = 0.13;
          top = S.carrySpeed;
          snap = true;
          chip[i].a = Math.min(1, chip[i].a + seconds * 6);
          if (Math.hypot(tx - x, ty - y) < 1.5 && mayPlace(jobN[i])) {
            piece.classList.add("on");
            work.placed++;
            chip[i] = null;
            job[i] = FREE;
          }
          break;
        }
        default: {
          free = true;
          const a = orbitA[i] + time * S.orbitSpeed * (i % 2 ? 1 : -0.6);
          const rr = 0.25 + orbitR[i] * 0.75;
          tx = hubBox.cx + Math.cos(a) * (innerX + rr * spanX);
          ty = hubBox.cy + Math.sin(a) * (innerY + rr * spanY);
        }
      }
    }

    // Arrive: head for the target, easing off when close
    let dvx = (tx - x) * pull;
    let dvy = (ty - y) * pull;
    const dv = Math.hypot(dvx, dvy);
    if (dv > top) {
      dvx *= top / dv;
      dvy *= top / dv;
    }
    if (snap && Math.hypot(tx - x, ty - y) < 16) {
      // the last few pixels: settle straight onto the word
      vx[i] = (tx - x) * 0.35;
      vy[i] = (ty - y) * 0.35;
      ax_[i] = 0;
      ay_[i] = 0;
      continue;
    }
    let fx = (dvx - vx[i]) * (free ? 0.07 : 0.16);
    let fy = (dvy - vy[i]) * (free ? 0.07 : 0.16);

    if (free) {
      // Flow field
      const fa = noise(x * fs + ft, y * fs - ft * 0.7) * Math.PI * 4;
      fx += Math.cos(fa) * S.flowForce * drift[i];
      fy += Math.sin(fa) * S.flowForce * drift[i];

      // Neighbours: match their direction, keep a little distance
      let n = 0;
      let sumVx = 0;
      let sumVy = 0;
      let sepX = 0;
      let sepY = 0;
      const gx0 = cellX(x);
      const gy0 = cellY(y);
      for (let gy = Math.max(gy0 - 1, 0); gy <= Math.min(gy0 + 1, rows - 1); gy++) {
        for (let gx = Math.max(gx0 - 1, 0); gx <= Math.min(gx0 + 1, cols - 1); gx++) {
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
        fx += (sumVx / n - vx[i]) * S.align;
        fy += (sumVy / n - vy[i]) * S.align;
        fx += sepX * S.separation;
        fy += sepY * S.separation;
      }

      // Keep clear of the cards and inside the section
      avoid(hubBox, x, y);
      for (const b of nodeBox) avoid(b, x, y);
      fx += push.x;
      fy += push.y;
      push.x = push.y = 0;
      const m = 24;
      if (x < m) fx += ((m - x) / m) * 0.6;
      if (x > W - m) fx -= ((x - W + m) / m) * 0.6;
      if (y < m) fy += ((m - y) / m) * 0.6;
      if (y > H - m) fy -= ((y - H + m) / m) * 0.6;
    }
    ax_[i] = fx;
    ay_[i] = fy;
  }

  // Integrate
  for (let i = 0; i < MAX; i++) {
    if (!state[i]) continue;
    vx[i] += ax_[i] * dt;
    vy[i] += ay_[i] * dt;
    const working = job[i] !== FREE || state[i] === 2;
    const top = working ? S.carrySpeed * 1.3 : S.maxSpeed * (0.8 + 0.3 * drift[i]);
    const floor = working ? 0 : S.minSpeed;
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
    if (speed > 0.4) {
      const turn = Math.atan2(vy[i], vx[i]) - head[i];
      head[i] += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(0.25 * dt, 1);
    }
    busy[i] += ((job[i] !== FREE ? 1 : 0) - busy[i]) * Math.min(0.15 * dt, 1);
  }
}
// Push a point out of box b (grown by S.avoid), harder the deeper it is
function avoid(b, x, y) {
  const m = S.avoid;
  const qx = Math.max(b.l, Math.min(b.r, x));
  const qy = Math.max(b.t, Math.min(b.b, y));
  const dx = x - qx;
  const dy = y - qy;
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    // inside: out through the nearest edge
    const out = [b.l - x, x - b.r, b.t - y, y - b.b].map(Math.abs);
    const k = out.indexOf(Math.min(...out));
    const f = S.push * 2;
    if (k === 0) push.x -= f;
    else if (k === 1) push.x += f;
    else if (k === 2) push.y -= f;
    else push.y += f;
  } else if (d < m) {
    const f = (1 - d / m) * S.push;
    push.x += (dx / d) * f;
    push.y += (dy / d) * f;
  }
}

// --- Draw ---------------------------------------------------------------------------
function drawCursor(i) {
  const s = cursorSize * (1 + 0.45 * busy[i]) * stage.dpr;
  const c = Math.cos(head[i]) * s;
  const sn = Math.sin(head[i]) * s;
  ctx.setTransform(c, sn, -sn, c, (sec.left + px[i]) * stage.dpr, (sec.top + py[i]) * stage.dpr);
  ctx.globalAlpha = alpha[i];
  stamp(color[i]);
}

function drawChip(i) {
  const c = chip[i];
  if (c.a <= 0) return;
  const { dpr } = stage;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = c.a * alpha[i];
  // the cursor holds the word by its top-left corner
  const x = sec.left + px[i] - 4;
  const y = sec.top + py[i] - 2;
  ctx.beginPath();
  if (c.bg) {
    ctx.roundRect(x, y, c.w, c.h, c.h / 2);
    ctx.fillStyle = c.bg;
    ctx.fill();
  } else {
    ctx.roundRect(x - 2, y, c.w + 4, c.h, 3);
    ctx.fillStyle = theme.paper;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.line;
    ctx.stroke();
  }
  ctx.font = c.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = c.color;
  ctx.fillText(c.text, x + c.w / 2, y + c.h / 2 + 0.5);
}

export function drawSwarm() {
  if (!sec || work.k < 0) return;
  // free cursors never cover the centre card
  clipOut(hub);
  for (let i = 0; i < MAX; i++) {
    if (state[i] && job[i] === FREE && !chip[i]) drawCursor(i);
  }
  ctx.restore();
  // working cursors on top, each with the word it carries
  for (let i = 0; i < MAX; i++) {
    if (!state[i] || (job[i] === FREE && !chip[i])) continue;
    if (chip[i]) drawChip(i);
    drawCursor(i);
  }
  ctx.textAlign = "start";
}
