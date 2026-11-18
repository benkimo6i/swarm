// The flocking simulation: each frame, every agent steers toward its target
// (a point on the ribbon, a square it is moving, or its spot on the About
// sphere's shell), matches its neighbours and keeps a little distance.

import { CONFIG } from "../config.js";
import { stage } from "../stage.js";
import { pointer } from "../pointer.js";
import { noise } from "../noise.js";
import { orb } from "../orb.js";
import { jobTarget, advanceJob } from "../hero/jobs.js";
import { leader, sampleHistory, prefillHistory } from "./leader.js";
import {
  N, px, py, vx, vy, ax, ay, heading, depth, lag, offR, offA, drift,
  job, busy, shX, shY, shZ, shellAt, shellOn, shellWas, shellK, shellDepth, shellTX, shellTY
} from "./agents.js";

const sample = { x: 0, y: 0 };
const target = { x: 0, y: 0 };

// --- Neighbour grid ---------------------------------------------------------------
const CELL = CONFIG.neighborRadius;
let cols = 1;
let rows = 1;
let cellHead = new Int32Array(1);
const cellNext = new Int32Array(N);

const cellX = (x) => Math.max(0, Math.min(cols - 1, Math.floor(x / CELL) + 1));
const cellY = (y) => Math.max(0, Math.min(rows - 1, Math.floor(y / CELL) + 1));

export function resizeGrid() {
  cols = Math.ceil(stage.width / CELL) + 2;
  rows = Math.ceil(stage.height / CELL) + 2;
  cellHead = new Int32Array(cols * rows);
}

// --- Start as a ribbon already in flight ------------------------------------------
export function placeRibbon() {
  prefillHistory();
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
}

// --- One frame ----------------------------------------------------------------------
export function updateFlock(dt, now, onWord, follow) {
  const { time } = stage;
  const spinC = Math.cos(orb.spin);
  const spinS = Math.sin(orb.spin);
  const tiltC = Math.cos(CONFIG.shellTilt);
  const tiltS = Math.sin(CONFIG.shellTilt);
  const shellR = orb.r * CONFIG.shellRadius;

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
    shellOn[i] = !working && orb.shellMix > shellAt[i] ? 1 : 0;
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
      // Moving a square of the hero word
      jobTarget(i, target);
      tx = target.x;
      ty = target.y;
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

    if (working) advanceJob(i, tx, ty, now, onWord);
  }

  // Integrate
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
}
