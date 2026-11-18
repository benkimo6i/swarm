// Shared drawing pieces: the cursor-arrow sprites every view stamps, and the
// coloured name pills.

import { CONFIG } from "./config.js";
import { ctx } from "./stage.js";

// A tailless dart, centred on its own middle, with its tip pointing along +x
// so rotating it by an agent's heading points it in the direction of travel.
const arrow = new Path2D("M8.5 0 L-8.5 -8 L-4.5 0 L-8.5 8 Z");

// One finished arrow per palette colour. Glow, border and fill are drawn once
// here, then stamped once per agent. White in both themes.
const SPRITE_UNITS = 40; // sprite covers this many arrow units, centred on the arrow
const SPRITE_RES = 3; // sprite pixels per arrow unit
function sprite(hex) {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_UNITS * SPRITE_RES;
  const g = c.getContext("2d");
  g.lineJoin = "round";

  // Glow: draw the arrow far off-canvas so only its blurred shadow lands in view
  const away = 4000;
  g.shadowColor = hex;
  g.shadowBlur = CONFIG.glowBleed * SPRITE_RES * 1.4;
  g.shadowOffsetX = away;
  g.setTransform(SPRITE_RES, 0, 0, SPRITE_RES, c.width / 2 - away, c.height / 2);
  g.lineWidth = CONFIG.glowBleed * 0.9 + CONFIG.border * 2;
  g.globalAlpha = CONFIG.glowStrength;
  for (let pass = 0; pass < 3; pass++) {
    g.fill(arrow);
    g.stroke(arrow);
  }

  // Border (its rounded joins soften the corners), then the fill on top
  g.shadowColor = "transparent";
  g.globalAlpha = 1;
  g.setTransform(SPRITE_RES, 0, 0, SPRITE_RES, c.width / 2, c.height / 2);
  if (CONFIG.border > 0) {
    g.strokeStyle = hex;
    g.lineWidth = CONFIG.border * 2;
    g.stroke(arrow);
  }
  g.fillStyle = CONFIG.arrowFill;
  g.fill(arrow);
  return c;
}
const sprites = CONFIG.palette.map(sprite);

// Draw the arrow in palette colour k at the context's current transform
export function stamp(k) {
  ctx.drawImage(sprites[k], -SPRITE_UNITS / 2, -SPRITE_UNITS / 2, SPRITE_UNITS, SPRITE_UNITS);
}

// --- Name pills ---------------------------------------------------------------
const LABEL_FONT = "600 11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

// Set the text and outline style once before drawing a batch of pills
export function pillStyle() {
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = CONFIG.ink;
  ctx.lineWidth = 1.25;
}

// A 20px-tall rounded pill w wide, with its top-left corner at (x, y)
export function pill(x, y, w, text, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, 20, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CONFIG.ink;
  ctx.fillText(text, x + 8, y + 10.5);
}
