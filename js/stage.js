// The one fixed, full-screen canvas everything is drawn on, plus the values
// every module reads. main.js keeps width, height, dpr and time up to date.

export const canvas = document.getElementById("sky");
export const ctx = canvas.getContext("2d");

export const stage = {
  width: 0, // viewport size, CSS px
  height: 0,
  dpr: 1, // device pixel ratio, capped at 2
  time: Math.random() * 100 // seconds; starts somewhere random along the roaming path
};
