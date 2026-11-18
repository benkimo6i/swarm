// Jobs: while the pointer is on the hero word, agents fly to squares near
// it, lift them out, carry them around the pointer, and set them back into
// gaps in the letters. Each square keeps the colour of the agent that moved it.

import { CONFIG } from "../config.js";
import { stage } from "../stage.js";
import { pointer } from "../pointer.js";
import { word, cellCX, cellCY } from "./word.js";
import {
  N, px, py, offA, offR, color, permanent, job, jobFrom, jobTo, jobStart, jobHold
} from "../swarm/agents.js";

let jobCount = 0;
let liftsDue = 0;
const openGaps = []; // gaps no agent is heading for yet

// Drop every job, e.g. before the word is laid out again
export function resetJobs() {
  job.fill(0);
  jobCount = 0;
  openGaps.length = 0;
}

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

// Hand out new jobs while the pointer is on the word
export function updateJobs(dt, now, onWord) {
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

// Where a working agent is heading this frame
export function jobTarget(i, out) {
  if (job[i] === 2) {
    // Carrying: circle the pointer until it's time to set the square down
    const a = offA[i] + stage.time * 2.4;
    const r = CONFIG.workRadius * (0.35 + 0.5 * Math.abs(offR[i]));
    out.x = pointer.x + Math.cos(a) * r;
    out.y = pointer.y + Math.sin(a) * r;
  } else {
    // Fly straight to the square, or to the gap it's going into
    const k = job[i] === 1 ? jobFrom[i] : jobTo[i];
    out.x = cellCX(k);
    out.y = cellCY(k);
  }
}

// Move a working agent's job on once it reaches (tx, ty)
export function advanceJob(i, tx, ty, now, onWord) {
  const dx = tx - px[i];
  const dy = ty - py[i];
  const arrived = dx * dx + dy * dy < 36 || now - jobStart[i] > 4000; // or stuck too long
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
