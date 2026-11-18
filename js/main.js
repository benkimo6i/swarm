// Swarm AI landing page
// A swarm of AI-agent cursors flies over the page as a folding ribbon, like
// starlings, and trails your cursor when you move it. Hover part of the hero's
// giant word and agents lift squares out of the letter, carry them around the
// cursor, and set them back into other gaps in the same letter. Each square
// takes the colour of the agent that moved it, and keeps it. Scrolling on,
// the coloured arc at the bottom of the hero shrinks into a sphere while the
// swarm is drawn onto it as a spinning shell that turns toward the side your
// cursor is on. The About copy is laid out around the sphere.
//
// This file starts everything up and runs the frame loop. See the README for
// a map of the other modules.

import { CONFIG } from "./config.js";
import { canvas, ctx, stage } from "./stage.js";
import { pointer } from "./pointer.js";
import { layoutOrb, layoutCopy, updateOrb } from "./orb.js";
import { word, buildWord, inkWord, pointerOnWord, drawWord } from "./hero/word.js";
import { resetJobs, updateJobs } from "./hero/jobs.js";
import { updateLeader } from "./swarm/leader.js";
import { resizeGrid, placeRibbon, updateFlock } from "./swarm/flock.js";
import { drawSwarm } from "./swarm/draw.js";
import { updateLabels, drawLabels } from "./swarm/labels.js";
import { updateBoard, placePill } from "./demo/board.js";
import { layoutHive, updateHive, drawHive } from "./demo/hive.js";
import { updateSocial, drawSocial } from "./demo/social.js";
import { layoutMemory, updateMemory, drawMemory } from "./demo/memory.js";
import { updatePricing, drawPricing } from "./pricing/index.js";
import "./closing.js";
import { onTheme } from "./theme.js";

// --- Layout ---------------------------------------------------------------------
function layoutWord() {
  resetJobs(); // any squares in flight belong to the old layout
  buildWord();
}

function resize() {
  stage.dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.width = document.documentElement.clientWidth;
  stage.height = window.innerHeight;
  canvas.width = Math.round(stage.width * stage.dpr);
  canvas.height = Math.round(stage.height * stage.dpr);
  resizeGrid();
  layoutWord();
  layoutOrb();
  layoutCopy();
}
window.addEventListener("resize", resize);
onTheme(inkWord); // the word's letters are drawn once, in ink
resize();
// Lay the word out again once the display font has loaded
if (document.fonts && document.fonts.load) {
  document.fonts.load("300px " + CONFIG.wordFont, CONFIG.word).then(layoutWord, () => {});
}

// --- Start ----------------------------------------------------------------------
pointer.x = stage.width / 2;
pointer.y = stage.height / 2;
placeRibbon();

// --- Frame loop -----------------------------------------------------------------
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 16.667, 2.5); // 1 = one 60fps frame
  last = now;
  stage.time += dt / 60;

  // Main swarm
  const onWord = pointerOnWord();
  updateJobs(dt, now, onWord);
  updateOrb(dt);
  const follow = updateLeader(dt, now, onWord);
  updateFlock(dt, now, onWord, follow);
  updateLabels(dt, now);

  // Demo board
  if (updateBoard()) {
    layoutHive();
    layoutMemory();
  }
  updateHive(dt);
  updateSocial(dt);
  updateMemory(dt);
  placePill(dt);

  // Pricing
  updatePricing(dt);

  draw();
  requestAnimationFrame(frame);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (word.ready) drawWord();
  drawHive();
  drawSocial();
  drawMemory();
  drawPricing();
  drawSwarm();
  drawLabels();
}

requestAnimationFrame(frame);
