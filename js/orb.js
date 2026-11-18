// The About sphere. One circle does both jobs. At the top of the page it is
// huge and sits below the hero, so only an arc of it shows. Scrolling to
// About shrinks it, always in view, into a sphere that rests in the pinned
// About screen and then scrolls away with it. The swarm is drawn onto it as a
// spinning shell (see flock.js), and the About copy is laid out around it.

import { CONFIG } from "./config.js";
import { keepLastWords } from "./text.js";
import { stage } from "./stage.js";
import { pointer } from "./pointer.js";

const orbEl = document.querySelector(".orb");
const about = document.querySelector(".about");
const copyEl = document.querySelector(".lead");
const copyText = copyEl.textContent.trim().replace(/\s+/g, " ");

export const orb = {
  x: 0, // centre, viewport px
  y: 0,
  r: 0, // current radius
  size: 100, // settled diameter
  restY: 0, // where the settled sphere sits
  progress: 0, // 0..1, scroll from the top of the page to About
  shellMix: 0, // 0..1, how much of the swarm has been drawn onto the sphere
  spin: 0 // shell rotation
};
let stacked = false; // narrow screen: sphere above, copy below
let spinVel = 0;
let spinDir = 1; // 1 clockwise, -1 counter-clockwise

export function layoutOrb() {
  const { width, height } = stage;
  stacked = width < CONFIG.stackBelow;
  orb.size = Math.round(Math.min(width, height) * CONFIG.sphereSize);
  orb.restY = stacked ? Math.round(height * 0.27) : height / 2;
  orbEl.style.width = orbEl.style.height = orb.size + "px";
}

// Lay the About copy out around the sphere. Each line level with the sphere
// is split in two, so the text reads across it. The block is centred on the
// sphere and the type shrinks until it all fits on screen.
export function layoutCopy() {
  const { width, height } = stage;
  const cx = width / 2;
  const cy = orb.restY;
  const reach = orb.size / 2 + CONFIG.copyGap;
  const frameW = Math.min(width * CONFIG.copyWidth[0], CONFIG.copyWidth[1]);
  const left = (width - frameW) / 2;
  const right = left + frameW;

  // Measure every word once at the stylesheet's size; widths scale with the type
  copyEl.style.fontSize = "";
  const words = keepLastWords(copyText).split(" "); // the last two words stay together
  copyEl.innerHTML = words.map((w) => "<span>" + w + "</span>").join("") + "<span>&nbsp;</span>";
  const style = getComputedStyle(copyEl);
  const baseSize = parseFloat(style.fontSize);
  const leading = parseFloat(style.lineHeight) / baseSize || 1.1;
  const measured = Array.from(copyEl.children, (el) => el.getBoundingClientRect().width);
  const baseSpace = measured.pop();

  function flow(topY, size) {
    const k = size / baseSize;
    const lh = leading * size;
    const space = baseSpace * k;
    const pieces = []; // { x, y, text }
    let y = topY;
    let at = 0;
    while (at < words.length) {
      // the part of this line's band closest to the sphere's centre
      const dy = cy < y ? y - cy : cy > y + lh ? cy - (y + lh) : 0;
      const spans =
        stacked || dy >= reach
          ? [[left, right]]
          : (() => {
              const half = Math.sqrt(reach * reach - dy * dy);
              return [[left, cx - half], [cx + half, right]];
            })();
      const before = at;
      for (const [x0, x1] of spans) {
        let x = x0;
        let text = "";
        while (at < words.length && x + measured[at] * k <= x1) {
          text += (text ? " " : "") + words[at];
          x += measured[at] * k + space;
          at++;
        }
        if (text) pieces.push({ x: x0, y, text });
      }
      // a word too long for a whole clear line still has to go somewhere
      if (at === before && spans.length === 1) pieces.push({ x: left, y, text: words[at++] });
      y += lh;
    }
    return { pieces, top: topY, bottom: y, lh };
  }

  let best = null;
  let size = baseSize;
  for (; size >= 13; size *= 0.95) {
    if (stacked) {
      best = flow(cy + reach, size);
    } else {
      // try starting 0..10 lines above the sphere; keep the most centred block
      best = null;
      let bestOff = Infinity;
      const lh = leading * size;
      for (let above = 0; above <= 10; above++) {
        const tryIt = flow(cy - reach - above * lh, size);
        const off = Math.abs(cy - tryIt.top - (tryIt.bottom - cy));
        if (off < bestOff) {
          bestOff = off;
          best = tryIt;
        }
      }
    }
    if (best.top >= (stacked ? 0 : 72) && best.bottom <= height - 20) break;
  }

  copyEl.style.fontSize = size + "px";
  copyEl.innerHTML = best.pieces
    .map((p) => '<span style="left:' + p.x.toFixed(1) + "px;top:" + p.y.toFixed(1) + 'px">' + p.text + "</span>")
    .join(" ");
}

export function updateOrb(dt) {
  const { width, height, time } = stage;
  const scroll = window.scrollY;
  const settleAt = about.offsetTop; // scroll position where the sphere has settled
  const leaveAt = settleAt + about.offsetHeight - height; // and where About starts scrolling away

  const t = Math.max(0, Math.min(1, scroll / settleAt));
  const e = t * t * (3 - 2 * t);
  orb.progress = t;

  // Shrink from the big arc to the sphere, keeping the circle's top edge on
  // screen the whole way so the scale-down is what you watch
  const big = width * CONFIG.arcWidth;
  const k = Math.pow(big / orb.size, 1 - e); // scale: from the big arc down to 1
  const peek = CONFIG.arcPeek + 10 * Math.sin(time * 1.7) * (1 - e); // breathes a little
  const topFrom = height - peek;
  const topTo = orb.restY - orb.size / 2;
  orb.r = (orb.size * k) / 2;
  orb.x = width / 2;
  orb.y = topFrom + (topTo - topFrom) * e + orb.r - Math.max(0, scroll - leaveAt);
  orbEl.style.transform =
    "translate3d(" + (orb.x - orb.size / 2) + "px," + (orb.y - orb.size / 2) + "px,0) scale(" + k + ")";
  orbEl.style.setProperty("--shade", e.toFixed(3));

  // The copy appears as the sphere nears its slot
  const show = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
  copyEl.style.opacity = (show * show * (3 - 2 * show)).toFixed(3);

  // Agents are drawn onto the sphere a few at a time as you scroll toward
  // About, and stay on it from then on
  const g = Math.max(0, Math.min(1, (t - CONFIG.gatherFrom) / (0.97 - CONFIG.gatherFrom)));
  orb.shellMix += (g - orb.shellMix) * Math.min(0.12 * dt, 1);

  // Spin toward the side of the sphere the pointer is on
  if (pointer.inside) spinDir = pointer.x >= orb.x ? 1 : -1;
  spinVel += (spinDir * CONFIG.spinSpeed - spinVel) * Math.min(0.05 * dt, 1);
  orb.spin += spinVel * dt;
}
