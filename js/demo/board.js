// The Demo board: a dotted panel whose pill nav switches between three views.
//   Hive (hive.js): the agent hierarchy as rings around a centre node, one layer at a time.
//   Social (social.js): all five rings at once, with agents trading places between them.
//   Memory (memory.js): core agents lend memory blocks to squads of drones.
// This module tracks which view is up and where the board is on screen.

import { stage, ctx } from "../stage.js";

const boardEl = document.querySelector(".board");
const demoTabs = Array.from(document.querySelectorAll(".pill button"));

export const board = {
  view: "hive",
  box: null, // the board's place on screen this frame, or null when out of view
  w: 0, // board size, px
  h: 0,
  cx: 0, // centre of the drawing, relative to the board
  cy: 0,
  fit: 0 // px radius the outermost ring gets
};

export function setDemoView(view) {
  board.view = view;
  for (const t of demoTabs) t.setAttribute("aria-selected", t.dataset.view === view ? "true" : "false");
}

// A centre card is faded by its view; once it's gone, its buttons go too
export function showCard(card, shown) {
  card.style.opacity = shown < 0.01 ? "0" : shown.toFixed(3);
  card.style.visibility = shown < 0.01 ? "hidden" : "";
  card.inert = shown < 0.5; // a fading card's buttons stop taking clicks right away
}

for (const tab of demoTabs) tab.addEventListener("click", () => setDemoView(tab.dataset.view));
setDemoView("hive");

// Find the board on screen. Returns true when its size changed, so the views
// need laying out again.
export function updateBoard() {
  const box = boardEl.getBoundingClientRect();
  board.box = box.bottom > 0 && box.top < stage.height ? box : null;
  if (!board.box || (box.width === board.w && box.height === board.h)) return false;
  board.w = box.width;
  board.h = box.height;
  board.cx = box.width / 2;
  board.cy = box.height / 2;
  board.fit = Math.max(120, Math.min(box.width / 2 - 16, box.height / 2 - 66));
  return true;
}

// On short screens the pill nav would fall below the fold at the bottom of
// the section, so it sits just under the current view's centre card instead
// (the CSS breakpoint puts it in that mode)
const demoEl = document.querySelector(".demo");
const pillEl = document.querySelector(".pill");
const short = window.matchMedia("(max-height: 759px), (max-width: 600px) and (max-height: 859px)");
const cardOf = { hive: ".node-core", social: ".node-social", memory: ".node-meter" };
let pillY = NaN;

// Height to keep free under the centre card for the pill, when it sits there
export const pillRoom = () => (short.matches ? pillEl.offsetHeight + 14 : 0);

export function placePill(dt) {
  if (!short.matches || !board.box) {
    pillEl.style.transform = "";
    pillY = NaN;
    return;
  }
  const c = document.querySelector(cardOf[board.view]).getBoundingClientRect();
  const d = demoEl.getBoundingClientRect();
  const y = c.bottom - d.top + 14;
  // ease between the views' cards, which differ in height
  pillY = Number.isNaN(pillY) ? y : pillY + (y - pillY) * Math.min(0.2 * dt, 1);
  pillEl.style.transform =
    "translate(" + (c.left + c.width / 2 - d.left).toFixed(1) + "px," + pillY.toFixed(1) + "px) translate(-50%, 0)";
}

// Keep drawing off the given cards and the pill nav, so they cover whatever
// is behind them (the canvas sits above the page). Call ctx.restore() when done.
export function clipOut(...els) {
  ctx.save();
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, stage.width, stage.height);
  for (const el of [...els, pillEl]) {
    const r = el.getBoundingClientRect();
    if (r.width) ctx.roundRect(r.left, r.top, r.width, r.height, el === pillEl ? r.height / 2 : 10);
  }
  ctx.clip("evenodd");
}
