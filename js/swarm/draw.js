// Drawing the main swarm's arrows

import { stage, ctx } from "../stage.js";
import { stamp } from "../sprites.js";
import { N, px, py, heading, depth, color, busy, labelAlpha, shellK, shellDepth } from "./agents.js";

// On the shell an agent's size and visibility come from where it is on the
// sphere: large facing you, small at the rim, hidden round the back.
export const shellFade = (i) => {
  const facing = Math.max(0, Math.min(1, (shellDepth[i] + 0.05) / 0.35));
  return 1 + (facing - 1) * shellK[i];
};
const sizeOf = (i) => {
  const base = 0.4 + 0.42 * depth[i];
  const worked = base + (0.95 - base) * busy[i];
  const free = worked + (1.25 - worked) * labelAlpha[i];
  const onShell = 0.4 + 0.6 * Math.max(shellDepth[i], 0);
  return free + (onShell + (1.25 - onShell) * labelAlpha[i] - free) * shellK[i];
};
const alphaOf = (i) => {
  const base = 0.6 + 0.4 * depth[i];
  return (base + (1 - base) * Math.max(labelAlpha[i], busy[i], shellK[i])) * shellFade(i);
};

function drawAgent(i) {
  const s = sizeOf(i) * stage.dpr;
  const c = Math.cos(heading[i]) * s;
  const sn = Math.sin(heading[i]) * s;
  ctx.setTransform(c, sn, -sn, c, px[i] * stage.dpr, py[i] * stage.dpr);
  ctx.globalAlpha = alphaOf(i);
  stamp(color[i]);
}

export function drawSwarm() {
  // Labelled agents are drawn last so they sit on top of the swarm
  for (let i = 0; i < N; i++) if (labelAlpha[i] === 0) drawAgent(i);
  for (let i = 0; i < N; i++) if (labelAlpha[i] > 0) drawAgent(i);
}
