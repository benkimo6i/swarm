// Name pills on the main swarm. A fixed set of agents (see agents.js) always
// shows a name; a few more near the pointer fade in slowly and linger after
// they leave.

import { CONFIG } from "../config.js";
import { stage, ctx } from "../stage.js";
import { pointer } from "../pointer.js";
import { pillStyle, pill } from "../sprites.js";
import { shellFade } from "./draw.js";
import { N, px, py, color, labelAlpha, labelText, labelWidth, permanent } from "./agents.js";

const hovering = []; // agents currently holding a hover label
const holdUntil = new Float64Array(N);
const isNear = new Uint8Array(N);
const labelled = [];
const pillRoom = new Uint8Array(N);
const pillAlpha = new Float32Array(N);
let nextHoverAt = 0;

export function updateLabels(dt, now) {
  const r = CONFIG.labelRadius;

  // Agents still near the pointer keep their label; others run out their hold
  for (let k = hovering.length - 1; k >= 0; k--) {
    const i = hovering[k];
    if (pointer.inside && Math.hypot(px[i] - pointer.x, py[i] - pointer.y) < r * 1.4) {
      holdUntil[i] = now + CONFIG.labelHold;
    }
    if (now > holdUntil[i]) hovering.splice(k, 1);
  }

  // Hand a free label to the closest unlabelled agent, one at a time
  if (pointer.inside && hovering.length < CONFIG.hoverLabels && now > nextHoverAt) {
    const [gapX, gapY] = CONFIG.labelSpacing;
    let best = -1;
    let bestD = r * r;
    for (let i = 0; i < N; i++) {
      if (labelAlpha[i] > 0) continue;
      const dx = px[i] - pointer.x;
      const dy = py[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestD) continue;
      let clear = true;
      for (const j of hovering) {
        if (Math.abs(px[i] - px[j]) < gapX && Math.abs(py[i] - py[j]) < gapY) {
          clear = false;
          break;
        }
      }
      if (clear) {
        bestD = d2;
        best = i;
      }
    }
    if (best !== -1) {
      hovering.push(best);
      holdUntil[best] = now + CONFIG.labelHold;
      nextHoverAt = now + CONFIG.labelStagger;
    }
  }

  isNear.fill(0);
  for (const i of hovering) isNear[i] = 1;
  for (let i = 0; i < N; i++) {
    if (permanent[i]) continue;
    labelAlpha[i] += (isNear[i] - labelAlpha[i]) * Math.min(0.06 * dt, 1);
    if (!isNear[i] && labelAlpha[i] < 0.01) labelAlpha[i] = 0;
  }

  // Where the ribbon folds and two labels would cover each other, the one
  // already showing stays and the other fades until there is room again
  labelled.length = 0;
  for (let i = 0; i < N; i++) if (labelAlpha[i] > 0) labelled.push(i);
  labelled.sort((a, b) => pillAlpha[b] - pillAlpha[a] || a - b);
  const [gapX, gapY] = CONFIG.labelSpacing;
  for (let k = 0; k < labelled.length; k++) {
    const i = labelled[k];
    let room = 1;
    for (let m = 0; m < k; m++) {
      const j = labelled[m];
      if (pillRoom[j] && Math.abs(px[i] - px[j]) < gapX && Math.abs(py[i] - py[j]) < gapY) {
        room = 0;
        break;
      }
    }
    pillRoom[i] = room;
    pillAlpha[i] += (room - pillAlpha[i]) * Math.min(0.07 * dt, 1);
  }
}

// Name pills beside labelled agents
export function drawLabels() {
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  pillStyle();
  for (let i = 0; i < N; i++) {
    const la = labelAlpha[i];
    if (la <= 0) continue;
    if (!labelWidth[i]) labelWidth[i] = ctx.measureText(labelText[i]).width;
    const alpha = la * pillAlpha[i] * shellFade(i);
    if (alpha < 0.01) continue;
    ctx.globalAlpha = alpha;
    pill(px[i] + 13, py[i] + 5, labelWidth[i] + 16, labelText[i], CONFIG.palette[color[i]]);
  }
}
