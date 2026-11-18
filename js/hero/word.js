// The giant hero word. It is drawn once as real type, so its edges stay
// clean. A grid of squares lies over it: `shape` marks cells inside the
// letters and `filled` those whose square is in place. A lifted square leaves
// a gap, which is erased from the type each frame until an agent sets a
// square back into it (see jobs.js).

import { CONFIG } from "../config.js";
import { theme } from "../theme.js";
import { stage, ctx } from "../stage.js";
import { pointer } from "../pointer.js";
import { N, px, py, color, job } from "../swarm/agents.js";

const hero = document.querySelector(".hero");
const tagline = document.querySelector(".tagline");

export const word = {
  image: document.createElement("canvas"),
  cell: 14,
  cols: 0,
  rows: 0,
  x: 0, // page position of the word's top-left corner
  y: 0,
  w: 0,
  h: 0,
  shape: new Uint8Array(0),
  filled: new Uint8Array(0),
  locked: new Uint8Array(0), // spoken for by a job
  tint: new Uint8Array(0), // 0 = still black, else 1 + the palette colour it was last moved by
  ready: false
};

// Lay the word out for the current viewport. Call resetJobs() first: any
// squares in flight belong to the old layout.
export function buildWord() {
  const { width, dpr } = stage;

  // Fit the word between the nav and the tagline, as wide as allowed
  const heroBox = hero.getBoundingClientRect();
  const heroTop = heroBox.top + window.scrollY;
  const top = heroTop + 76;
  const bottom = tagline
    ? tagline.getBoundingClientRect().top + window.scrollY - CONFIG.wordGap
    : heroTop + heroBox.height - 120;
  const roomW = width * CONFIG.wordWidth;
  const roomH = Math.max(bottom - top, 80);

  const g = word.image.getContext("2d", { willReadFrequently: true });
  const font = "300px " + CONFIG.wordFont;
  g.font = font;
  const m = g.measureText(CONFIG.word);
  const textW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const textH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const scale = Math.min(roomW / textW, roomH / textH);

  word.w = Math.ceil(textW * scale);
  word.h = Math.ceil(textH * scale);
  word.x = Math.round((width - word.w) / 2);
  word.y = Math.round(top + (roomH - word.h) / 2);

  word.image.width = Math.ceil(word.w * dpr);
  word.image.height = Math.ceil(word.h * dpr);
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  g.font = font;
  g.fillStyle = theme.ink;
  g.fillText(CONFIG.word, m.actualBoundingBoxLeft, m.actualBoundingBoxAscent);

  // A cell belongs to the letters when most of it is inked
  const cell = CONFIG.square;
  word.cell = cell;
  word.cols = Math.ceil(word.w / cell);
  word.rows = Math.ceil(word.h / cell);
  const count = word.cols * word.rows;
  word.shape = new Uint8Array(count);
  word.filled = new Uint8Array(count);
  word.locked = new Uint8Array(count);
  word.tint = new Uint8Array(count);

  const iw = word.image.width;
  const ih = word.image.height;
  const data = g.getImageData(0, 0, iw, ih).data;
  const step = Math.max(1, Math.floor((cell * dpr) / 7)); // sample a 7x7-ish lattice per cell
  for (let r = 0; r < word.rows; r++) {
    for (let c = 0; c < word.cols; c++) {
      let sum = 0;
      let n = 0;
      const x1 = Math.min(iw, Math.floor((c + 1) * cell * dpr));
      const y1 = Math.min(ih, Math.floor((r + 1) * cell * dpr));
      for (let y = Math.floor(r * cell * dpr); y < y1; y += step) {
        for (let x = Math.floor(c * cell * dpr); x < x1; x += step) {
          sum += data[(y * iw + x) * 4 + 3];
          n++;
        }
      }
      // cells cut short by the word's right or bottom edge count their missing part as empty
      const full = Math.pow(Math.ceil((cell * dpr) / step), 2);
      if (n && sum / (Math.max(n, full) * 255) > 0.55) {
        word.shape[r * word.cols + c] = 1;
        word.filled[r * word.cols + c] = 1;
      }
    }
  }
  word.ready = true;
}

// Repaint the letters in the current theme's ink, keeping every square's state
export function inkWord() {
  if (!word.ready) return;
  const g = word.image.getContext("2d", { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = theme.ink;
  g.fillRect(0, 0, word.image.width, word.image.height);
  g.globalCompositeOperation = "source-over";
}

// Centre of a cell, in viewport coordinates
export const cellCX = (k) => word.x + ((k % word.cols) + 0.5) * word.cell;
export const cellCY = (k) => word.y + (Math.floor(k / word.cols) + 0.5) * word.cell - window.scrollY;

// Is the pointer over the word, or just beside it?
export function pointerOnWord() {
  if (!pointer.inside || !word.ready) return false;
  const edge = CONFIG.workRadius * 0.4;
  const x = pointer.x - word.x;
  const y = pointer.y + window.scrollY - word.y;
  return x >= -edge && y >= -edge && x < word.w + edge && y < word.h + edge;
}

export function drawWord() {
  const { dpr, height } = stage;
  const s = word.cell;
  const top = Math.round((word.y - window.scrollY) * dpr) / dpr;
  if (top > height || top + word.h < 0) return; // scrolled out of view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(word.image, word.x, top, word.image.width / dpr, word.image.height / dpr);

  // Erase the gaps where squares have been lifted out
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  for (let k = 0; k < word.shape.length; k++) {
    if (word.shape[k] && !word.filled[k]) {
      ctx.rect(word.x + (k % word.cols) * s, top + Math.floor(k / word.cols) * s, s, s);
    }
  }
  ctx.fill();

  // Colour the squares that agents have moved. Painting only where the word
  // already has ink keeps the letters' edges clean.
  ctx.globalCompositeOperation = "source-atop";
  for (let k = 0; k < word.tint.length; k++) {
    if (!word.tint[k] || !word.filled[k]) continue;
    ctx.fillStyle = CONFIG.palette[word.tint[k] - 1];
    ctx.fillRect(word.x + (k % word.cols) * s, top + Math.floor(k / word.cols) * s, s, s);
  }
  ctx.globalCompositeOperation = "source-over";

  // Squares in the air, centred on the agent carrying them and in its colour
  for (let i = 0; i < N; i++) {
    if (job[i] < 2) continue;
    ctx.fillStyle = CONFIG.palette[color[i]];
    ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
  }
}
