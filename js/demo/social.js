// Social: all five Hive layers on screen together, laid out exactly like
// Hive's last step so switching between the two views is seamless. Every
// agent owns a slot (layer, ring within the layer, place on the ring). A trade
// swaps the slots of two agents in different layers; each then flies a curved
// path to its new slot while the rings keep turning.

import { HIVE, SOCIAL } from "../config.js";
import { stage, ctx } from "../stage.js";
import { stamp } from "../sprites.js";
import { board, clipOut, showCard } from "./board.js";
import { ringAngle, ringRadius, arrowScale } from "./hive.js";

const card = document.querySelector(".node-social");
card.querySelector(".node-title").textContent = SOCIAL.title;
card.querySelector(".node-copy").textContent = SOCIAL.copy;

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
const tierStart = []; // index of each layer's first agent, to pick one at random
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
// who currently holds each layer's slots, so a random member of a layer can be found
const tierMembers = HIVE.tiers.map((t, k) => Array.from({ length: t.count }, (_, n) => tierStart[k] + n));

let socialShown = 0; // eased 0..1
let swapsDue = 0;
let socialPlaced = false;
const slot = { r: 0, a: 0 };

// Where a slot is right now: distance from the centre and angle, as in Hive
function slotAt(k, row, n, out) {
  out.r = ringRadius(k, row);
  out.a = ringAngle(k, row, n);
}

function trade() {
  // pick an agent, then a partner one layer in or out (sometimes two)
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

export function updateSocial(dt) {
  if (!board.box) return;
  const on = board.view === "social";
  socialShown += ((on ? 1 : 0) - socialShown) * Math.min(0.09 * dt, 1);

  // The centre card, in the same place as Hive's
  showCard(card, socialShown);
  card.style.transform =
    "translate(" + board.cx.toFixed(1) + "px," + board.cy.toFixed(1) + "px) translate(-50%,-50%)";
  if (socialShown < 0.01) return;

  const seconds = dt / 60;
  if (on) {
    swapsDue = Math.min(swapsDue + SOCIAL.swapsPerSecond * seconds, 3);
    while (swapsDue >= 1) {
      swapsDue -= 1;
      trade();
    }
  }

  for (let i = 0; i < SN; i++) {
    if (soMove[i] < 1) soMove[i] = Math.min(1, soMove[i] + seconds / SOCIAL.travelTime);
    const t = soMove[i];
    const e = t * t * (3 - 2 * t);

    slotAt(soTier[i], soRow[i], soIdx[i], slot);
    let r = slot.r;
    let a = slot.a;
    let size = arrowScale(soTier[i]);
    if (t < 1) {
      // part-way: blend distance and angle (the short way round) from the old slot
      const toR = r;
      const toA = a;
      slotAt(soFromTier[i], soFromRow[i], soFromIdx[i], slot);
      const turn = Math.atan2(Math.sin(toA - slot.a), Math.cos(toA - slot.a));
      r = slot.r + (toR - slot.r) * e;
      a = slot.a + turn * e;
      const fromSize = arrowScale(soFromTier[i]);
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
    soSize[i] = size;
  }
  socialPlaced = true;
}

export function drawSocial() {
  if (!board.box || socialShown < 0.01 || !socialPlaced) return;
  const { dpr } = stage;
  const cx = board.box.left + board.cx;
  const cy = board.box.top + board.cy;

  clipOut(card); // the card covers the rings behind it
  // settled agents first, movers on top
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < SN; i++) {
      if ((soMove[i] < 1) !== (pass === 1)) continue;
      const s = soSize[i] * dpr;
      const c = Math.cos(soHead[i]) * s;
      const sn = Math.sin(soHead[i]) * s;
      ctx.setTransform(c, sn, -sn, c, (cx + soX[i]) * dpr, (cy + soY[i]) * dpr);
      ctx.globalAlpha = socialShown;
      stamp(soColor[i]);
    }
  }
  ctx.restore();
}
