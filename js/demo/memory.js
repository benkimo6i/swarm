// Memory: five cores, each with a tower of context boxes over its topic.
// Coloured drones take black boxes from the tower (coloured ones if no black
// are left) and bring them back on top in their own colour, plus a new one:
// using context grows the tower. Once it gets tall, the blue core cursor
// gathers coloured boxes and combines them into black ones until it's lean. A meter card in the middle tracks it all;
// hovering a core shows which agents depend on it and that core's figures.

import { CONFIG, MEMORY } from "../config.js";
import { theme } from "../theme.js";
import { stage, ctx } from "../stage.js";
import { pointer } from "../pointer.js";
import { stamp } from "../sprites.js";
import { board, showCard, pillRoom } from "./board.js";

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MC = MEMORY.cores.length;
const W = MEMORY.towerWidth;
const CAP = W * MEMORY.towerRows; // boxes in a full tower
const PER_CORE = MEMORY.squads * MEMORY.squadSize;
const MD = MC * PER_CORE;
const BLACK = -1; // a box's colour: BLACK, or a palette index

// Sizes, set by layoutMemory(). A core's cluster is its tower over its label.
const L = { cell: 9, scale: 1, orbit: 1, font: "", gap: 6, labelH: 0, towerW: 0, towerH: 0, contentW: 0, contentH: 0, halfW: 0, halfH: 0 };

// Everything is positioned relative to the board's centre
const coreX = new Float32Array(MC); // cluster centres
const coreY = new Float32Array(MC);
const towers = MEMORY.cores.map(() => []); // boxes, bottom-left first: { color, x, y, held }

const towerBottom = (c) => coreY[c] + L.contentH / 2 - L.labelH - L.gap;
const slotX = (c, j) => coreX[c] - L.towerW / 2 + ((j % W) + 0.5) * L.cell;
const slotY = (c, j) => towerBottom(c) - (Math.floor(j / W) + 0.5) * L.cell;
const homeX = (c) => coreX[c] - L.towerW / 2 - 12 * L.scale; // where a core cursor rests
const homeY = (c) => towerBottom(c) - 6 * L.scale;
// a squad's orbit hugs the cluster: an ellipse this far out from its centre
const orbitRX = (g) => L.contentW / 2 + (MEMORY.orbitGap + g * MEMORY.orbitStep) * L.orbit;
const orbitRY = (g) => L.contentH / 2 + (MEMORY.orbitGap + g * MEMORY.orbitStep) * L.orbit;

// --- Drones ----------------------------------------------------------------------
const mdCore = (i) => Math.floor(i / PER_CORE);
const mdSquad = (i) => Math.floor(i / MEMORY.squadSize) % MEMORY.squads;
const mdColor = Uint8Array.from({ length: MD }, () => MEMORY.droneColors[(Math.random() * MEMORY.droneColors.length) | 0]);
const mdState = new Uint8Array(MD); // 0 orbiting, 1 going for a box, 2 taking it out,
//                                     3 holding it, 4 bringing it back, 5 rejoining the squad
const mdTrip = new Float32Array(MD); // 0 = at its squad, 1 = at the tower
const mdUntil = new Float32Array(MD);
const mdBox = new Array(MD).fill(null); // the box it is going for
const mdCarry = new Int8Array(MD); // the colour of the box it took
const mdTX = new Float32Array(MD); // where the trip ends
const mdTY = new Float32Array(MD);
const mdX = new Float32Array(MD);
const mdY = new Float32Array(MD);
const mdHead = new Float32Array(MD);
const memDue = new Float32Array(MC);

// --- Core cursors -------------------------------------------------------------------
const coState = new Uint8Array(MC); // 0 resting, 1 fetching a coloured box, 2 setting the combined box on top
const coBox = new Array(MC).fill(null);
const coRest = new Float32Array(MC); // when it may start its next pass
const coActive = new Uint8Array(MC); // curating: between curateFrom and curateTo
const coCarry = MEMORY.cores.map(() => []); // colours of the boxes it holds
const coX = new Float32Array(MC);
const coY = new Float32Array(MC);
const coHead = new Float32Array(MC);

let memoryShown = 0; // eased 0..1
let memDim = 0; // eased 0..1: some core is hovered, so the others fade back
const memFocus = new Float32Array(MC); // eased 0..1: this core is hovered
let placed = false;

// --- Meter card ----------------------------------------------------------------------
const totalTokens = MEMORY.cores.reduce((sum, core) => sum + core.tokens, 0);
const fmtTokens = (n) => (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k" : String(Math.round(n)));
const meterCard = document.querySelector(".node-meter");
const meterTitle = meterCard.querySelector(".node-title");
meterCard.querySelector(".node-copy").textContent = MEMORY.meterCopy;
const meterRows = {};
for (const row of meterCard.querySelectorAll(".meter-row")) {
  meterRows[row.dataset.metric] = { value: row.querySelector("dd"), bar: row.querySelector(".bar u"), text: "" };
}
const meter = { bloat: 0, context: 0, system1: 1 }; // eased 0..1
let meterFocus = -2; // which core the card is showing (-1 = the whole swarm)

function setMeterRow(name, text, fill) {
  const row = meterRows[name];
  if (row.text !== text) {
    row.value.textContent = text;
    row.text = text;
  }
  row.bar.style.width = (fill * 100).toFixed(1) + "%";
}

// Placeholder figures, read off the towers:
//   token bloat: the share of a tower that is coloured, i.e. not yet condensed
//   context window: the tower plus the boxes agents are holding
//   System 1 / System 2: quick work by drones vs slow curation by cores
function updateMeter(dt, hovered) {
  if (hovered !== meterFocus) {
    meterFocus = hovered;
    meterTitle.textContent = hovered === -1 ? MEMORY.meterTitle : MEMORY.cores[hovered].topic;
    if (hovered === -1) meterCard.style.removeProperty("--c");
    else meterCard.style.setProperty("--c", CONFIG.palette[MEMORY.coreColor]);
  }

  let boxes = 0;
  let raw = 0;
  let tokens = 0;
  let fast = 0;
  let slow = 0;
  for (let c = 0; c < MC; c++) {
    if (hovered !== -1 && c !== hovered) continue;
    const t = towers[c];
    boxes += t.length;
    for (const box of t) if (box.color !== BLACK) raw++;
    tokens += (Math.min(contextBoxes(c), CAP) / CAP) * MEMORY.cores[c].tokens;
    if (coState[c]) slow += 4; // a core's careful pass counts for more than one drone's
    for (let i = c * PER_CORE; i < (c + 1) * PER_CORE; i++) if (mdState[i]) fast++;
  }
  const capacity = hovered === -1 ? totalTokens : MEMORY.cores[hovered].tokens;

  const ease = Math.min(0.06 * dt, 1);
  meter.bloat += ((boxes ? raw / boxes : 0) - meter.bloat) * ease;
  meter.context += (tokens / capacity - meter.context) * ease;
  meter.system1 += ((fast + slow ? fast / (fast + slow) : 1) - meter.system1) * ease;

  const s1 = Math.round(meter.system1 * 100);
  setMeterRow("bloat", Math.round(meter.bloat * 100) + "%", meter.bloat);
  setMeterRow("context", fmtTokens(meter.context * capacity) + " / " + fmtTokens(capacity), meter.context);
  setMeterRow("system", s1 + " / " + (100 - s1), meter.system1);
}

// --- Layout ------------------------------------------------------------------------
// Size each cluster: a tower over a one-line label. Depends on the board's
// width (smaller boxes on narrow screens), so it runs when the board resizes.
export function layoutMemory() {
  const narrow = board.w < 600;
  L.cell = narrow ? MEMORY.cellSmall : MEMORY.cell;
  L.scale = L.cell / MEMORY.cell;
  L.orbit = narrow ? 0.7 : 1;
  L.font = "600 " + (L.cell * 1.3).toFixed(2) + "px " + SANS;
  L.gap = 6 * L.scale;
  L.labelH = Math.round(L.cell * 1.6);
  L.towerW = W * L.cell;
  L.towerH = MEMORY.towerRows * L.cell;

  ctx.font = L.font;
  let labelW = 0;
  for (const core of MEMORY.cores) labelW = Math.max(labelW, ctx.measureText(core.topic).width);
  L.contentW = Math.max(labelW, L.towerW + 30 * L.scale); // room for the core cursor beside the tower
  L.contentH = L.towerH + L.gap + L.labelH;
  const reach = (MEMORY.orbitGap + (MEMORY.squads - 1) * MEMORY.orbitStep) * L.orbit + 6;
  L.halfW = L.contentW / 2 + reach;
  L.halfH = L.contentH / 2 + reach;
  placed = false;
}

// Start each tower a few rows tall, all black, with every drone in orbit
for (const tower of towers) {
  for (let j = 0; j < MEMORY.startRows * W; j++) tower.push({ color: BLACK, x: NaN, y: NaN, held: false });
}

// Place the clusters around the meter card, which stays in the middle. Wide
// boards use a pentagon; narrow ones put three in a row above the card and
// two below it.
function placeCores() {
  const { halfW, halfH } = L;
  const meterH = meterCard.offsetHeight;
  const top = 12 - board.cy; // the board's edges, relative to its centre
  const bottom = board.h - 12 - board.cy;
  const oy = board.w < 600 ? board.h / 2 - board.cy : 10; // the meter's centre

  if (board.w < 600) {
    const above = Math.max(top + halfH, oy - meterH / 2 - 10 - halfH);
    // (on short screens the pill nav sits right under the card, so leave it room)
    const below = Math.min(bottom - halfH, oy + meterH / 2 + pillRoom() + 10 + halfH);
    const side = Math.max(0, board.w / 2 - 4 - halfW);
    const lift = Math.min(24, above - (top + halfH)); // the middle one sits a little higher
    const spots = [
      [0, above - lift], // 0: top
      [side, above], // 1: upper right
      [side * 0.55, below], // 2: lower right
      [-side * 0.55, below], // 3: lower left
      [-side, above] // 4: upper left
    ];
    for (let c = 0; c < MC; c++) [coreX[c], coreY[c]] = spots[c];
  } else {
    const rx = Math.max(0, Math.min(board.w * 0.34, board.fit * 1.5, (board.w / 2 - 8 - halfW) / 0.951));
    const ryFit = Math.min(oy - top - halfH, (bottom - oy - halfH) / 0.809);
    // tall enough that the top cluster clears the meter card, as far as the board allows
    const clear = meterH / 2 + halfH + 10;
    const ry = Math.max(0, Math.min(Math.max(board.fit * 0.6, Math.min(board.h * 0.26, rx * 1.6), clear), ryFit));
    for (let c = 0; c < MC; c++) {
      const a = -Math.PI / 2 + (c / MC) * Math.PI * 2;
      coreX[c] = Math.cos(a) * rx;
      coreY[c] = Math.sin(a) * ry + oy;
    }
  }

  meterCard.style.transform =
    "translate(" + board.cx.toFixed(1) + "px," + (board.cy + oy).toFixed(1) + "px) translate(-50%,-50%)";
}

// --- Tower helpers -----------------------------------------------------------------
// A random box in core c's tower that nobody has claimed: black ones for
// drones, coloured ones for the core
function pickBox(c, black) {
  const t = towers[c];
  const start = (Math.random() * t.length) | 0;
  for (let n = 0; n < t.length; n++) {
    const box = t[(start + n) % t.length];
    if (!box.held && (box.color === BLACK) === black) return box;
  }
  return null;
}

function countFree(c, black) {
  let n = 0;
  for (const box of towers[c]) if (!box.held && (box.color === BLACK) === black) n++;
  return n;
}

// Take a box out; the boxes above it drop down to close the gap
function removeBox(c, box) {
  const t = towers[c];
  t.splice(t.indexOf(box), 1);
}

// A core's context: the boxes in its tower plus the ones agents are holding
function contextBoxes(c) {
  let n = towers[c].length + coCarry[c].length;
  for (let i = c * PER_CORE; i < (c + 1) * PER_CORE; i++) if (mdState[i] >= 2 && mdState[i] <= 4) n++;
  return n;
}

function addBox(c, color, x, y) {
  if (towers[c].length < CAP) towers[c].push({ color, x, y, held: false });
}

// --- Update ------------------------------------------------------------------------
export function updateMemory(dt) {
  if (!board.box) return;
  const on = board.view === "memory";
  memoryShown += ((on ? 1 : 0) - memoryShown) * Math.min(0.09 * dt, 1);
  showCard(meterCard, memoryShown);
  if (memoryShown < 0.01) return;
  const seconds = dt / 60;
  const { time } = stage;
  placeCores();

  // Which core is the pointer on?
  let hovered = -1;
  if (on && pointer.inside) {
    const mx = pointer.x - board.box.left - board.cx;
    const my = pointer.y - board.box.top - board.cy;
    let best = 1;
    for (let c = 0; c < MC; c++) {
      const dx = (mx - coreX[c]) / L.halfW;
      const dy = (my - coreY[c]) / L.halfH;
      if (dx * dx + dy * dy < best) {
        best = dx * dx + dy * dy;
        hovered = c;
      }
    }
  }
  const focusEase = Math.min(0.12 * dt, 1);
  memDim += ((hovered !== -1 ? 1 : 0) - memDim) * focusEase;
  for (let c = 0; c < MC; c++) memFocus[c] += ((c === hovered ? 1 : 0) - memFocus[c]) * focusEase;

  // Boxes settle into their slots, so a gap closes by the boxes above dropping down
  const boxEase = Math.min(0.25 * dt, 1);
  for (let c = 0; c < MC; c++) {
    towers[c].forEach((box, j) => {
      const tx = slotX(c, j);
      const ty = slotY(c, j);
      if (!placed || Number.isNaN(box.x)) {
        box.x = tx;
        box.y = ty;
      } else {
        box.x += (tx - box.x) * boxEase;
        box.y += (ty - box.y) * boxEase;
      }
    });
    if (!placed) {
      coX[c] = homeX(c);
      coY[c] = homeY(c);
    }
  }

  // Send drones for black boxes
  if (on) {
    for (let c = 0; c < MC; c++) {
      memDue[c] = Math.min(memDue[c] + MEMORY.borrowsPerSecond * seconds, 2);
      while (memDue[c] >= 1) {
        memDue[c] -= 1;
        const i = c * PER_CORE + ((Math.random() * PER_CORE) | 0);
        if (mdState[i] !== 0) continue;
        const box = pickBox(c, true) || pickBox(c, false); // black if there is any
        if (!box) break;
        box.held = true;
        mdBox[i] = box;
        mdState[i] = 1;
        mdTrip[i] = 0;
      }
    }
  }

  // Drones
  const tripStep = seconds / MEMORY.travelTime;
  for (let i = 0; i < MD; i++) {
    const c = mdCore(i);
    const g = mdSquad(i);
    switch (mdState[i]) {
      case 1: // fly to the box and lift it out
        mdTX[i] = mdBox[i].x;
        mdTY[i] = mdBox[i].y;
        mdTrip[i] += tripStep;
        if (mdTrip[i] >= 1) {
          mdTrip[i] = 1;
          removeBox(c, mdBox[i]);
          mdCarry[i] = mdBox[i].color;
          mdBox[i] = null;
          mdState[i] = 2;
        }
        break;
      case 2: // take it out to the squad
        mdTrip[i] -= tripStep;
        if (mdTrip[i] <= 0) {
          mdTrip[i] = 0;
          mdState[i] = 3;
          mdUntil[i] = time + MEMORY.holdTime[0] + Math.random() * (MEMORY.holdTime[1] - MEMORY.holdTime[0]);
        }
        break;
      case 3: // work with it for a while
        if (time >= mdUntil[i]) mdState[i] = 4;
        break;
      case 4: // bring it back on top in its own colour, with a new box
        mdTX[i] = slotX(c, towers[c].length);
        mdTY[i] = slotY(c, towers[c].length);
        mdTrip[i] += tripStep;
        if (mdTrip[i] >= 1) {
          mdTrip[i] = 1;
          addBox(c, mdColor[i], mdTX[i], mdTY[i]);
          addBox(c, mdColor[i], mdTX[i], mdTY[i]);
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

    // Its place in the squad: squads circle the cluster, alternating direction
    const rX = orbitRX(g);
    const rY = orbitRY(g);
    const dir = g % 2 ? -1 : 1;
    const a =
      c * 1.7 + g * 2.1 + (dir * time * MEMORY.orbitSpeed) / (1 + g * 0.45) +
      ((i % MEMORY.squadSize) * 15 * dir) / ((rX + rY) / 2);
    const sx = coreX[c] + Math.cos(a) * rX;
    const sy = coreY[c] + Math.sin(a) * rY;
    const t = mdTrip[i];
    const e = t * t * (3 - 2 * t);
    const x = sx + (mdTX[i] - sx) * e;
    const y = sy + (mdTY[i] - sy) * e;

    // face the way it is moving
    if (placed) {
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

  // Core cursors: gather coloured boxes, then set one black box on top
  for (let c = 0; c < MC; c++) {
    const fill = contextBoxes(c) / CAP;
    if (fill >= MEMORY.curateFrom) coActive[c] = 1;
    else if (fill <= MEMORY.curateTo) coActive[c] = 0;
    if (coState[c] === 0 && on && coActive[c] && time >= coRest[c] && countFree(c, false) >= MEMORY.condense) {
      coBox[c] = pickBox(c, false);
      coBox[c].held = true;
      coState[c] = 1;
    }
    let tx = homeX(c);
    let ty = homeY(c);
    if (coState[c] === 1) {
      tx = coBox[c].x;
      ty = coBox[c].y;
    } else if (coState[c] === 2) {
      tx = slotX(c, towers[c].length);
      ty = slotY(c, towers[c].length);
    }

    const dx = tx - coX[c];
    const dy = ty - coY[c];
    const d = Math.hypot(dx, dy);
    const stepLen = MEMORY.coreSpeed * L.scale * dt;
    const arrived = d <= stepLen;
    if (arrived) {
      coX[c] = tx;
      coY[c] = ty;
    } else {
      coX[c] += (dx / d) * stepLen;
      coY[c] += (dy / d) * stepLen;
    }
    // face the way it is moving; at rest, face the tower
    const want = arrived && coState[c] === 0 ? 0 : Math.atan2(dy, dx);
    const turn = Math.atan2(Math.sin(want - coHead[c]), Math.cos(want - coHead[c]));
    coHead[c] += turn * Math.min(0.2 * dt, 1);

    if (!arrived) continue;
    if (coState[c] === 1) {
      removeBox(c, coBox[c]);
      coCarry[c].push(coBox[c].color);
      coBox[c] = null;
      const next = coCarry[c].length < MEMORY.condense ? pickBox(c, false) : null;
      if (next) {
        next.held = true;
        coBox[c] = next;
      } else {
        coState[c] = 2;
      }
    } else if (coState[c] === 2) {
      addBox(c, BLACK, tx, ty);
      coCarry[c].length = 0;
      coState[c] = 0;
      coRest[c] = time + MEMORY.coreRest;
    }
  }

  placed = true;
  updateMeter(dt, hovered);
}

// --- Draw --------------------------------------------------------------------------
export function drawMemory() {
  if (!board.box || memoryShown < 0.01 || !placed) return;
  const { dpr } = stage;
  const cx = board.box.left + board.cx;
  const cy = board.box.top + board.cy;
  const s = L.cell;
  const half = s / 2;
  // a hovered core's agents stay bright while the others fade back
  const fade = (c) => memoryShown * (1 - memDim * (1 - memFocus[c]) * 0.72);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Hovered: a line from the core to every agent that depends on it
  ctx.lineWidth = 1;
  ctx.strokeStyle = CONFIG.palette[MEMORY.coreColor];
  for (let c = 0; c < MC; c++) {
    if (memFocus[c] < 0.02) continue;
    ctx.globalAlpha = memoryShown * memFocus[c] * 0.5;
    ctx.beginPath();
    for (let i = c * PER_CORE; i < (c + 1) * PER_CORE; i++) {
      ctx.moveTo(cx + coX[c], cy + coY[c]);
      ctx.lineTo(cx + mdX[i], cy + mdY[i]);
    }
    ctx.stroke();
  }

  // Towers and their labels
  ctx.font = L.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c < MC; c++) {
    ctx.globalAlpha = fade(c);
    for (const box of towers[c]) {
      ctx.fillStyle = box.color === BLACK ? theme.ink : CONFIG.palette[box.color];
      // overlap a hair so neighbouring boxes read as one solid piece
      ctx.fillRect(cx + box.x - half, cy + box.y - half, s + 0.5, s + 0.5);
    }
    ctx.fillStyle = theme.ink;
    ctx.fillText(MEMORY.cores[c].topic, cx + coreX[c], cy + coreY[c] + L.contentH / 2 - L.labelH / 2);
  }
  ctx.textAlign = "start";

  // Boxes on the move: as taken on the way out, two in the drone's colour on the way back
  for (let i = 0; i < MD; i++) {
    const state = mdState[i];
    if (state < 2 || state > 4) continue;
    ctx.globalAlpha = fade(mdCore(i));
    const x = cx + mdX[i];
    const y = cy + mdY[i];
    if (state === 4) {
      ctx.fillStyle = CONFIG.palette[mdColor[i]];
      ctx.fillRect(x - s, y - half, s * 2, s);
    } else {
      ctx.fillStyle = mdCarry[i] === BLACK ? theme.ink : CONFIG.palette[mdCarry[i]];
      ctx.fillRect(x - half, y - half, s, s);
    }
  }

  // Drones
  for (let i = 0; i < MD; i++) {
    const c = mdCore(i);
    const size = MEMORY.droneSize * L.scale * (1 + 0.25 * memFocus[c]) * dpr;
    const co = Math.cos(mdHead[i]) * size;
    const sn = Math.sin(mdHead[i]) * size;
    ctx.setTransform(co, sn, -sn, co, (cx + mdX[i]) * dpr, (cy + mdY[i]) * dpr);
    ctx.globalAlpha = fade(c);
    stamp(mdColor[i]);
  }

  // Core cursors, with what they have gathered: the coloured boxes, which
  // become one black box once combined
  for (let c = 0; c < MC; c++) {
    const x = cx + coX[c];
    const y = cy + coY[c];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = fade(c);
    if (coState[c] === 2) {
      ctx.fillStyle = theme.ink;
      ctx.fillRect(x - half, y - half, s, s);
    } else {
      coCarry[c].forEach((color, k) => {
        ctx.fillStyle = CONFIG.palette[color];
        ctx.fillRect(x - half + (k - (coCarry[c].length - 1) / 2) * s, y - half, s, s);
      });
    }
    const size = MEMORY.coreSize * L.scale * dpr;
    const co = Math.cos(coHead[c]) * size;
    const sn = Math.sin(coHead[c]) * size;
    ctx.setTransform(co, sn, -sn, co, x * dpr, y * dpr);
    stamp(MEMORY.coreColor);
  }
}
