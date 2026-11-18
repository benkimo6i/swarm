// Pricing: a node graph. Plan nodes sit around a centre card that starts with
// the mission. Picking a plan lays down its wire, releases its swarm, and the
// swarm rewrites the card word by word.
//   graph.js: the plan nodes, dragging them, and the wires
//   copy.js: the centre card's copy, split into word pieces
//   swarm.js: the cursors, their jobs and the flow field they drift on

import { PRICING } from "../config.js";
import { stage } from "../stage.js";
import { section, nodes, onPick, layoutWires, drawWires, wireAlpha, wireDrawn } from "./graph.js";
import { startSwap, finishSwap } from "./copy.js";
import { setSwarm, startWork, workDone, updateSwarm, drawSwarm } from "./swarm.js";

let active = -1;
let t = 0; // seconds since the pick
let swapping = false;
let visible = false;

onPick((k) => {
  if (k === active) return;
  const prev = active;
  active = k;
  nodes.forEach((node, j) => node.setAttribute("aria-pressed", j === k ? "true" : "false"));
  t = 0;
  wireDrawn[k] = 0;
  const { take, place } = startSwap(k);
  startWork(k, take, place);
  setSwarm(k, prev);
  swapping = true;
});

const ease = (x) => x * x * (3 - 2 * x);

export function updatePricing(dt) {
  const box = section.getBoundingClientRect();
  visible = box.bottom > 0 && box.top < stage.height;
  if (!visible) return;
  layoutWires();

  const fade = Math.min(0.08 * dt, 1);
  PRICING.plans.forEach((_, k) => {
    wireAlpha[k] += ((k === active ? 1 : 0) - wireAlpha[k]) * fade;
  });
  if (active >= 0) {
    t += dt / 60;
    wireDrawn[active] = ease(Math.min(t / PRICING.connectTime, 1));
  }

  updateSwarm(dt);
  if (swapping && workDone()) {
    swapping = false;
    finishSwap();
  }
}

export function drawPricing() {
  if (!visible) return;
  drawWires(active);
  drawSwarm();
}
