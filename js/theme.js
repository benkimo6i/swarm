// Light or dark: follows the device's setting, and switches live when it
// changes. ?theme=dark or ?theme=light in the URL forces one (handy for testing).
// The page's colours live in style.css; the canvas reads the same tokens here.

const root = document.documentElement;
const forced = new URLSearchParams(location.search).get("theme");
if (forced === "dark" || forced === "light") root.dataset.theme = forced;

const query = window.matchMedia("(prefers-color-scheme: dark)");

// The colours the canvas draws with, read from the CSS tokens
export const theme = { dark: false, paper: "#ffffff", ink: "#0d0d0d", line: "#deded9", wire: "#bdbdb8" };

function read() {
  const css = getComputedStyle(root);
  const token = (name) => css.getPropertyValue(name).trim();
  theme.dark = root.dataset.theme ? root.dataset.theme === "dark" : query.matches;
  theme.paper = token("--paper");
  theme.ink = token("--ink");
  theme.line = token("--line");
  theme.wire = token("--wire");
}
read();

const listeners = [];
// Call fn whenever the theme changes, e.g. to redraw something cached
export function onTheme(fn) {
  listeners.push(fn);
}

query.addEventListener("change", () => {
  if (root.dataset.theme) return; // forced from the URL
  read();
  for (const fn of listeners) fn();
});
