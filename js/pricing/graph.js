// Pricing graph: the plan nodes, dragging them around, and the wires from
// each plan to the centre card. Every plan has a faint wire; the chosen one is
// laid down solid in ink while its cursors run along it.

import { CONFIG, PRICING } from "../config.js";
import { keepLastWords } from "../text.js";
import { stage, ctx } from "../stage.js";
import { theme } from "../theme.js";

export const section = document.querySelector(".pricing");
const graph = section.querySelector(".graph");
export const hub = section.querySelector(".plan-hub");

// Small DOM helper: el("p", "class", "text")
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// The logo, a ring of six cursors, in one of these styles: "color" (the
// default, used for the mission), or in black: "solid", "outline" (only one
// cursor solid) or "one-outline" (only one cursor outlined)
const LOGO_COLORS = ["blue", "mint", "green", "yellow", "red", "pink"];
const SVG = "http://www.w3.org/2000/svg";
export function logoMark(style) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "-18 -18 36 36");
  svg.setAttribute("class", "mark");
  svg.setAttribute("aria-hidden", "true");
  LOGO_COLORS.forEach((name, n) => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", "M8.5 0 L-8.5 -8 L-4.5 0 L-8.5 8 Z");
    path.setAttribute("transform", "rotate(" + n * 60 + ") translate(11.5 0) rotate(180) scale(0.62)");
    const ink = style === "color" ? "var(--" + name + ")" : "var(--ink)";
    path.style.stroke = ink;
    const hollow = (style === "outline" && n > 0) || (style === "one-outline" && n === 0);
    path.style.fill = hollow ? "var(--paper)" : ink;
    svg.append(path);
  });
  return svg;
}

// --- Plan nodes ----------------------------------------------------------------------
let pick = () => {};
export function onPick(fn) {
  pick = fn;
}

export const nodes = PRICING.plans.map((plan) => {
  const button = el("button", "plan-node");
  button.type = "button";
  button.dataset.plan = plan.id;
  button.setAttribute("aria-pressed", "false");
  const title = el("strong");
  title.append(logoMark(plan.logo), plan.name);
  const price = el("span", "plan-price");
  price.append(el("b", "", plan.price), " " + plan.per);
  button.append(title, price, el("span", "plan-terms", keepLastWords(plan.terms)), el("span", "plan-tag", keepLastWords(plan.tagline)));
  graph.append(button);
  return button;
});

// --- Dragging ------------------------------------------------------------------------
// A node can be dragged anywhere inside the section; a press that barely moves
// is still a click. Positions reset when the window changes width, so nothing
// ends up clipped on a narrower layout.
const offset = PRICING.plans.map(() => ({ x: 0, y: 0 }));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let drag = null;
let draggedAt = -1;

function moveNode(k) {
  nodes[k].style.setProperty("--dx", offset[k].x.toFixed(1) + "px");
  nodes[k].style.setProperty("--dy", offset[k].y.toFixed(1) + "px");
}

// Does node k overlap another plan node or the centre card (with a little gap)?
function overlapsAny(k) {
  const a = nodes[k].getBoundingClientRect();
  const gap = 8;
  return [hub, ...nodes].some((other) => {
    if (other === nodes[k]) return false;
    const b = other.getBoundingClientRect();
    return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
  });
}

nodes.forEach((node, k) => {
  node.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // where the node sits with no offset, from its layout box: unlike its
    // on-screen rect, that ignores a slide-back in progress and the hover lift
    const parent = node.offsetParent.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    drag = {
      k,
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: offset[k].x,
      oy: offset[k].y,
      left: parent.left + node.offsetLeft,
      top: parent.top + node.offsetTop,
      w: r.width,
      h: r.height,
      moved: false,
      clearX: offset[k].x, // the last spot where it overlapped nothing
      clearY: offset[k].y
    };
    node.setPointerCapture(e.pointerId);
  });
  node.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      node.classList.add("is-dragging");
    }
    const s = section.getBoundingClientRect();
    const m = 8;
    offset[k].x = clamp(drag.ox + dx, s.left + m - drag.left, s.right - m - drag.w - drag.left);
    offset[k].y = clamp(drag.oy + dy, s.top + m - drag.top, s.bottom - m - drag.h - drag.top);
    moveNode(k);
    const blocked = overlapsAny(k);
    node.classList.toggle("is-blocked", blocked);
    if (!blocked) {
      drag.clearX = offset[k].x;
      drag.clearY = offset[k].y;
    }
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.moved) {
      draggedAt = performance.now();
      node.classList.remove("is-dragging", "is-blocked");
      // dropped on another card: slide back to the last clear spot
      if (overlapsAny(k)) {
        offset[k].x = drag.clearX;
        offset[k].y = drag.clearY;
        moveNode(k);
      }
    }
    drag = null;
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", end);
  node.addEventListener("click", () => {
    if (performance.now() - draggedAt < 150) return; // the end of a drag, not a click
    pick(k);
  });
});

let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastWidth) return; // mobile toolbars change the height only
  lastWidth = window.innerWidth;
  offset.forEach((o, k) => {
    o.x = o.y = 0;
    moveNode(k);
  });
});

// --- Wires ---------------------------------------------------------------------------
// Each wire is a curve from a port on the plan's card to a port on the centre
// card, leaving each side square-on, like a node editor's. Screen coordinates.
export const wires = PRICING.plans.map(() => ({ ax: 0, ay: 0, bx: 0, by: 0, c1x: 0, c1y: 0, c2x: 0, c2y: 0 }));
export const wireAlpha = PRICING.plans.map(() => 0); // eased 0..1: the solid wire is showing
export const wireDrawn = PRICING.plans.map(() => 0); // 0..1: how far along the solid wire is laid

function port(rect, dx, dy) {
  // the middle of the side of rect that faces (dx, dy)
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: dx > 0 ? rect.right : rect.left, y: rect.top + rect.height / 2, nx: Math.sign(dx), ny: 0 };
  }
  return { x: rect.left + rect.width / 2, y: dy > 0 ? rect.bottom : rect.top, nx: 0, ny: Math.sign(dy) };
}

export function layoutWires() {
  const h = hub.getBoundingClientRect();
  const hx = h.left + h.width / 2;
  const hy = h.top + h.height / 2;
  nodes.forEach((node, k) => {
    const r = node.getBoundingClientRect();
    const nx = r.left + r.width / 2;
    const ny = r.top + r.height / 2;
    const a = port(r, hx - nx, hy - ny);
    const b = port(h, nx - hx, ny - hy);
    const reach = Math.hypot(b.x - a.x, b.y - a.y) * 0.45;
    const w = wires[k];
    w.ax = a.x;
    w.ay = a.y;
    w.bx = b.x;
    w.by = b.y;
    w.c1x = a.x + a.nx * reach;
    w.c1y = a.y + a.ny * reach;
    w.c2x = b.x + b.nx * reach;
    w.c2y = b.y + b.ny * reach;
  });
}

// A point on wire w at t (0 = the plan, 1 = the centre), and the way it is heading
const at = { x: 0, y: 0, a: 0 };
export function along(w, t) {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  at.x = b0 * w.ax + b1 * w.c1x + b2 * w.c2x + b3 * w.bx;
  at.y = b0 * w.ay + b1 * w.c1y + b2 * w.c2y + b3 * w.by;
  const dx = 3 * u * u * (w.c1x - w.ax) + 6 * u * t * (w.c2x - w.c1x) + 3 * t * t * (w.bx - w.c2x);
  const dy = 3 * u * u * (w.c1y - w.ay) + 6 * u * t * (w.c2y - w.c1y) + 3 * t * t * (w.by - w.c2y);
  at.a = Math.atan2(dy, dx);
  return at;
}

function strokeWire(w, upTo) {
  ctx.beginPath();
  ctx.moveTo(w.ax, w.ay);
  const steps = Math.max(2, Math.ceil(40 * upTo));
  for (let n = 1; n <= steps; n++) {
    const p = along(w, (n / steps) * upTo);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

export function drawWires(active) {
  const { dpr } = stage;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Faint wires
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.wire;
  ctx.setLineDash([3, 5]);
  for (const w of wires) strokeWire(w, 1);
  ctx.setLineDash([]);

  // Solid wires: the chosen plan's, and any still fading out
  ctx.lineWidth = 2.5;
  PRICING.plans.forEach((_, k) => {
    if (wireAlpha[k] < 0.01) return;
    ctx.globalAlpha = wireAlpha[k];
    ctx.strokeStyle = theme.ink;
    strokeWire(wires[k], k === active ? wireDrawn[k] : 1);
  });

  // Ports, a dot at each end
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  PRICING.plans.forEach((_, k) => {
    const w = wires[k];
    const lit = k === active && wireDrawn[k] >= 1;
    for (const [x, y] of [[w.ax, w.ay], [w.bx, w.by]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = lit || (k === active && x === w.ax) ? theme.ink : theme.paper;
      ctx.strokeStyle = k === active ? theme.ink : theme.wire;
      ctx.fill();
      ctx.stroke();
    }
  });
}
