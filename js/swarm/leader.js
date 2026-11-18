// The leader the swarm follows. On its own it loops along a roaming path;
// while you move the pointer it follows you; scrolling toward About pulls it
// to the sphere. History stores where it has been so each agent can chase a
// delayed point along it, which is what stretches the swarm into a ribbon.

import { CONFIG } from "../config.js";
import { stage } from "../stage.js";
import { pointer } from "../pointer.js";
import { orb } from "../orb.js";

const HISTORY = 256;
const histX = new Float32Array(HISTORY);
const histY = new Float32Array(HISTORY);
let histHead = 0;
let histAcc = 0;

export const leader = { x: 0, y: 0 };
let follow = 0; // 0 = free murmuration, 1 = fully following the pointer

function roam(t, out) {
  const { width, height } = stage;
  out.x = width / 2 + width * (0.28 * Math.cos(0.45 * t) + 0.09 * Math.cos(1.15 * t + 1.3));
  out.y = height / 2 + height * (0.19 * Math.sin(0.58 * t + 0.5) + 0.08 * Math.sin(1.37 * t));
}

function pushHistory(x, y) {
  histHead = (histHead + 1) % HISTORY;
  histX[histHead] = x;
  histY[histHead] = y;
}

// Where the leader was l steps (1/60s each) ago
export function sampleHistory(l, out) {
  const i0 = Math.floor(l);
  const f = l - i0;
  const a = (histHead - i0 + HISTORY * 2) % HISTORY;
  const b = (histHead - i0 - 1 + HISTORY * 2) % HISTORY;
  out.x = histX[a] + (histX[b] - histX[a]) * f;
  out.y = histY[a] + (histY[b] - histY[a]) * f;
}

// Fill the history as if the leader had been roaming for a while already
export function prefillHistory() {
  for (let k = HISTORY - 1; k >= 0; k--) {
    roam(stage.time - k / 60, leader);
    pushHistory(leader.x, leader.y);
  }
}

// Move the leader one frame. Returns how much the swarm is following the pointer.
export function updateLeader(dt, now, onWord) {
  // The swarm follows while the pointer moves, or rests on the word
  const following = now - pointer.lastMove < CONFIG.idleDelay || onWord;
  follow += ((following ? 1 : 0) - follow) * Math.min(0.05 * dt, 1);

  // The roaming path, or the pointer, or somewhere in between
  roam(stage.time, leader);
  leader.x += (pointer.x - leader.x) * follow;
  leader.y += (pointer.y - leader.y) * follow;

  // The sphere pulls the whole ribbon toward itself as it comes up the screen
  const pull = Math.max(0, Math.min(1, (orb.progress - 0.1) / 0.6));
  const pullY = Math.min(orb.y, orb.y - orb.r + 140, stage.height - 70);
  leader.x += (orb.x - leader.x) * pull;
  leader.y += (pullY - leader.y) * pull;

  histAcc += dt;
  while (histAcc >= 1) {
    pushHistory(leader.x, leader.y);
    histAcc -= 1;
  }
  return follow;
}
