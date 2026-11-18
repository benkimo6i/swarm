// Where the pointer is, and whether it is on the page at all.
// main.js centres it once the viewport size is known.

export const pointer = { x: 0, y: 0, lastMove: -Infinity, inside: false };

window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.lastMove = performance.now();
  pointer.inside = true;
});

const release = () => {
  pointer.lastMove = -Infinity;
  pointer.inside = false;
};
document.addEventListener("pointerleave", release);
window.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse") release();
});
window.addEventListener("blur", release);
