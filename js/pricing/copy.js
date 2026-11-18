// The centre card's copy, split into word pieces the swarm can carry. A piece
// is shown while it has the class "on". During a swap the old copy and the new
// one share the card: the old pieces are taken away one by one while the new
// ones (hidden until placed) are put in, and the card's height eases between them.

import { PRICING } from "../config.js";
import { hub, el, logoMark } from "./graph.js";

const body = hub.querySelector(".hub-body");
const status = el("p", "sr-only"); // screen readers hear the whole plan at once
status.setAttribute("aria-live", "polite");
hub.append(status);

// Append text as one piece per word
function words(parent, text) {
  const all = text.split(/\s+/).filter(Boolean);
  all.forEach((word, n) => {
    if (n) parent.append(n === all.length - 1 ? "\u00a0" : " "); // no orphaned last word
    parent.append(el("span", "w", word));
  });
  return parent;
}

// The card's content: the mission (k = -1), or plan k
function layer(k) {
  const plan = PRICING.plans[k];
  const out = el("div", "hub-layer");
  const title = el("strong");
  title.append(logoMark(plan ? plan.logo : "color"), words(el("span"), plan ? plan.name : PRICING.mission.title));
  out.append(title);
  out.append(words(el("p"), plan ? plan.copy : PRICING.mission.copy));
  if (plan) {
    const schedule = el("dl", "hub-schedule");
    for (const [when, what] of plan.schedule) schedule.append(words(el("dt"), when), words(el("dd"), what));
    out.append(schedule);
    const list = el("ul");
    for (const item of plan.includes) list.append(words(el("li"), item));
    const cta = el("a", "hub-cta w", plan.cta); // the button moves as one piece
    cta.href = "#pricing";
    out.append(list, cta);
  } else {
    out.append(words(el("p", "hub-prompt"), PRICING.mission.prompt));
  }
  return out;
}

{
  const mission = layer(-1);
  for (const piece of mission.querySelectorAll(".w")) piece.classList.add("on");
  body.append(mission);
}

// Ease the card's height across a change to its layers
let settle = 0;
function easeHeight(change) {
  body.style.transition = "none";
  body.style.height = body.offsetHeight + "px";
  change();
  const to = Math.max(0, ...Array.from(body.children, (l) => l.offsetHeight));
  void body.offsetHeight; // commit the starting height before transitioning
  body.style.transition = "height 0.45s ease";
  body.style.height = to + "px";
  clearTimeout(settle);
  settle = setTimeout(() => {
    body.style.transition = "";
    body.style.height = "";
  }, 500);
}

// Start swapping in plan k. Returns the pieces to take away and the pieces to
// put in, both in reading order.
export function startSwap(k) {
  const plan = PRICING.plans[k];
  status.textContent =
    plan.name + ": " + plan.schedule.map((row) => row.join(" ")).join(", ") + ". " + plan.copy;
  let fresh;
  easeHeight(() => {
    // layers from an unfinished swap with nothing left showing can go now
    for (const l of Array.from(body.children)) {
      if (!l.querySelector(".w.on")) l.remove();
      else l.setAttribute("aria-hidden", "true");
    }
    fresh = layer(k);
    fresh.classList.add("is-settling"); // rules and dividers wait for the words
    body.append(fresh);
  });
  return {
    take: Array.from(body.querySelectorAll(".hub-layer[aria-hidden] .w.on")),
    place: Array.from(fresh.querySelectorAll(".w"))
  };
}

// Every piece is placed: drop the old layers
export function finishSwap() {
  easeHeight(() => {
    for (const l of Array.from(body.querySelectorAll(".hub-layer[aria-hidden]"))) l.remove();
  });
  for (const l of body.querySelectorAll(".is-settling")) l.classList.remove("is-settling");
}
