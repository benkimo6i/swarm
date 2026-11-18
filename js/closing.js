// Closing: start the logo's animation (the last cursor pushes into the ring,
// then the ring turns) once the section is well into view. Plain CSS does the rest.

const closing = document.querySelector(".closing");

if ("IntersectionObserver" in window) {
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      closing.classList.add("is-in");
      seen.disconnect();
    },
    { threshold: 0.4 }
  );
  seen.observe(closing);
} else {
  closing.classList.add("is-in");
}
