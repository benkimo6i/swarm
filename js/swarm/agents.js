// Per-agent state for the main swarm, one typed array per property.
// Agent positions are in viewport coordinates: the swarm stays on screen
// while the page scrolls underneath it.

import { CONFIG } from "../config.js";

export const N = CONFIG.count;

// motion
export const px = new Float32Array(N);
export const py = new Float32Array(N);
export const vx = new Float32Array(N);
export const vy = new Float32Array(N);
export const ax = new Float32Array(N);
export const ay = new Float32Array(N);
export const heading = new Float32Array(N);

// place in the ribbon
export const depth = new Float32Array(N); // 0 = far and small, 1 = near and large
export const lag = new Float32Array(N); // delay behind the leader
export const offR = new Float32Array(N); // distance from the ribbon centre line
export const offA = new Float32Array(N); // angle around the centre line
export const drift = new Float32Array(N); // how strongly the flow field moves this agent
export const color = new Uint8Array(N);

// labels
export const labelAlpha = new Float32Array(N);
export const labelText = new Array(N);
export const labelWidth = new Float32Array(N);
export const permanent = new Uint8Array(N); // always shows its name

// jobs: an agent with a job leaves the ribbon to move one square of the hero word
export const job = new Uint8Array(N); // 0 none, 1 flying to a square, 2 carrying it, 3 setting it down
export const jobFrom = new Int32Array(N); // cell the square is lifted from
export const jobTo = new Int32Array(N); // gap it is set down into
export const jobStart = new Float64Array(N);
export const jobHold = new Float64Array(N); // when a carrying agent may set its square down
export const busy = new Float32Array(N); // eased 0..1, used to enlarge working agents

// shell: each agent's own point on a unit sphere, used while wrapping the About sphere
export const shX = new Float32Array(N);
export const shY = new Float32Array(N);
export const shZ = new Float32Array(N);
export const shellAt = new Float32Array(N); // how far the gathering must be along before this agent joins
export const shellOn = new Uint8Array(N); // on the shell this frame
export const shellWas = new Uint8Array(N); // and the frame before
export const shellK = new Float32Array(N); // eased 0..1, blends the agent's size and fade
export const shellDepth = new Float32Array(N); // -1 far side .. 1 facing you
export const shellTX = new Float32Array(N); // last shell target, to match its speed
export const shellTY = new Float32Array(N);

// --- Starting values ------------------------------------------------------------
for (let i = 0; i < N; i++) depth[i] = Math.random();
depth.sort(); // far arrows are drawn first, near ones on top

for (let i = 0; i < N; i++) {
  lag[i] = Math.pow(Math.random(), CONFIG.lagBias) * CONFIG.maxLag;
  // roughly bell-shaped spread across the ribbon
  offR[i] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  offA[i] = Math.random() * Math.PI * 2;
  drift[i] = 0.5 + Math.random();
  const sz = Math.random() * 2 - 1;
  const sa = Math.random() * Math.PI * 2;
  const sr = Math.sqrt(1 - sz * sz);
  shX[i] = Math.cos(sa) * sr;
  shY[i] = Math.sin(sa) * sr;
  shZ[i] = sz;
  shellAt[i] = 0.02 + Math.random() * 0.96;
  color[i] = (Math.random() * CONFIG.palette.length) | 0;
  const role = CONFIG.roles[(Math.random() * CONFIG.roles.length) | 0];
  labelText[i] = role + " " + String(i + 1).padStart(3, "0");
}

// A fixed set of agents, spread along the ribbon, always shows a name
for (let k = 0; k < CONFIG.permanentLabels; k++) {
  const want = ((k + 0.5) / CONFIG.permanentLabels) * CONFIG.maxLag;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < N; i++) {
    if (permanent[i]) continue;
    // prefer near (large) agents close to the wanted spot along the ribbon
    const score = Math.abs(lag[i] - want) + (1 - depth[i]) * 12;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  permanent[best] = 1;
  labelAlpha[best] = 1;
}
