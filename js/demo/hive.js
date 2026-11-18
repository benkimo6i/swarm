// Hive: the agent hierarchy as rings around a centre node, one layer at a time.
// Each step pulls the view back and fades in the next, larger ring with its cards.

import { CONFIG, HIVE } from "../config.js";
import { keepLastWords } from "../text.js";
import { stage, ctx } from "../stage.js";
import { stamp, pillStyle, pill } from "../sprites.js";
import { board, clipOut, showCard } from "./board.js";

const coreCard = document.querySelector(".node-core");
const cardTitle = coreCard.querySelector(".node-title");
const cardCopy = coreCard.querySelector(".node-copy");
const stepPrev = document.querySelector(".step-prev");
const stepNext = document.querySelector(".step-next");
const stepCaption = document.querySelector(".step-caption");

let hiveStage = 0; // 0..4: the outermost tier showing
let hiveZoom = 1;
let hiveShown = 0; // eased 0..1: is the Hive view up
const tierAlpha = HIVE.tiers.map(() => 0);

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
export function layoutHive() {
  let radius = HIVE.coreRadius;
  for (const [k, tier] of HIVE.tiers.entries()) {
    tier.radius = radius;
    tier.zoom = Math.min(k === 0 ? 1.15 : 9, (board.fit - (tier.rows - 1) * HIVE.rowGap) / radius);
    tier.rowStep = HIVE.rowGap / tier.zoom; // in unzoomed px
    radius += (tier.rows - 1) * tier.rowStep + HIVE.ringGap / tier.zoom;
  }
}

// --- Stepper ----------------------------------------------------------------------
// Each step updates the caption and the centre card to describe the newest layer
function setHiveStage(n) {
  hiveStage = Math.max(0, Math.min(HIVE.tiers.length - 1, n));
  stepPrev.disabled = hiveStage === 0;
  stepNext.disabled = hiveStage === HIVE.tiers.length - 1;
  const tier = HIVE.tiers[hiveStage];
  stepCaption.textContent = "Agent layer " + (hiveStage + 1) + " of " + HIVE.tiers.length;
  coreCard.style.setProperty("--c", CONFIG.palette[tier.color]);
  cardTitle.textContent = tier.title;
  cardCopy.textContent = keepLastWords(tier.copy);
}

stepPrev.addEventListener("click", () => setHiveStage(hiveStage - 1));
stepNext.addEventListener("click", () => setHiveStage(hiveStage + 1));
setHiveStage(0);

// --- Geometry ---------------------------------------------------------------------
// Social draws its agents with the same ring geometry, so the two views line up.

// Each ring's index across all layers, so neighbouring rings can spin opposite ways
const ringStart = [];
{
  let n = 0;
  for (const tier of HIVE.tiers) {
    ringStart.push(n);
    n += tier.rows;
  }
}

// Angle of the n-th agent on ring `row` of layer k. Every ring turns the
// opposite way to the rings beside it; outer layers turn more slowly.
export const ringAngle = (k, row, n) => {
  const tier = HIVE.tiers[k];
  const dir = (ringStart[k] + row) % 2 ? -1 : 1;
  return (stage.time * HIVE.turn * dir) / (1 + k * 0.7) + ((n + (row % 2) * 0.5) / (tier.count / tier.rows)) * Math.PI * 2;
};
// A ring's radius on screen at the current zoom
export const ringRadius = (k, row) => (HIVE.tiers[k].radius + row * HIVE.tiers[k].rowStep) * hiveZoom;
// Arrow scale for layer k: arrows shrink more slowly than the rings do, so far layers stay readable
export const arrowScale = (k) => HIVE.tiers[k].size * Math.pow(hiveZoom / HIVE.tiers[k].zoom, 0.6);

// In Hive a ring arrives from slightly further out as it fades up
const hiveRadius = (k, row) => ringRadius(k, row) * (1 + 0.18 * (1 - tierAlpha[k]));

// --- Update and draw --------------------------------------------------------------
export function updateHive(dt) {
  if (!board.box) return;

  const ease = Math.min(0.09 * dt, 1);
  hiveShown += ((board.view === "hive" ? 1 : 0) - hiveShown) * ease;
  // Social shows every layer, so it uses the fully zoomed-out view
  const zoomTo = HIVE.tiers[board.view === "social" ? HIVE.tiers.length - 1 : hiveStage].zoom;
  hiveZoom += (zoomTo - hiveZoom) * ease;
  for (let k = 0; k < HIVE.tiers.length; k++) {
    tierAlpha[k] += ((k <= hiveStage ? 1 : 0) - tierAlpha[k]) * ease;
  }

  // The centre card is an ordinary element. It keeps its size as the view
  // zooms out, so it covers the inner rings at the later steps.
  showCard(coreCard, hiveShown);
  coreCard.style.transform =
    "translate(" + board.cx.toFixed(1) + "px," + board.cy.toFixed(1) + "px) translate(-50%,-50%)";

  // Labels follow their agents and shrink with the zoom, down to a readable
  // minimum. Where two would overlap, the outer tier's label keeps its place
  // and the other fades until there is room.
  for (const l of hiveLabels) {
    const a = ringAngle(l.tier, l.row, l.n);
    const r = hiveRadius(l.tier, l.row);
    l.scale = Math.max(0.7, Math.pow(hiveZoom / HIVE.tiers[l.tier].zoom, 0.6));
    l.x = board.cx + Math.cos(a) * r + 11 * l.scale;
    l.y = board.cy + Math.sin(a) * r + 4 * l.scale;
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

export function drawHive() {
  if (!board.box || hiveShown < 0.01) return;
  const { dpr } = stage;

  clipOut(coreCard); // the card covers the rings behind it

  const cx = board.box.left + board.cx;
  const cy = board.box.top + board.cy;
  for (const [k, tier] of HIVE.tiers.entries()) {
    const alpha = tierAlpha[k] * hiveShown;
    if (alpha < 0.01) continue;
    const size = arrowScale(k) * (0.6 + 0.4 * tierAlpha[k]) * dpr;
    const perRow = tier.count / tier.rows;
    ctx.globalAlpha = alpha;
    for (let row = 0; row < tier.rows; row++) {
      const r = hiveRadius(k, row);
      for (let n = 0; n < perRow; n++) {
        const a = ringAngle(k, row, n);
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // each arrow points at the centre node: (-c, -sn) is the inward direction
        ctx.setTransform(-c * size, -sn * size, sn * size, -c * size, (cx + c * r) * dpr, (cy + sn * r) * dpr);
        stamp(tier.color);
      }
    }
  }

  // Name pills, in the same style as the main swarm's
  pillStyle();
  for (const l of hiveLabels) {
    const alpha = l.show * tierAlpha[l.tier] * hiveShown;
    if (alpha < 0.01) continue;
    if (!l.width) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      l.width = ctx.measureText(l.text).width;
    }
    const s = l.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (board.box.left + l.x) * dpr, (board.box.top + l.y) * dpr);
    ctx.globalAlpha = alpha;
    pill(0, 0, l.width + 16, l.text, CONFIG.palette[HIVE.tiers[l.tier].color]);
  }
  ctx.restore();
}
