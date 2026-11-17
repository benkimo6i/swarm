# Swarm AI

A landing page for a fictional Swarm AI startup, built around a flock of AI-agent cursors that moves like a starling murmuration. Only HTML, CSS and Canvas 2D, all on one fixed canvas, with no build step and no dependencies.

**Live:** https://benkimo6i.github.io/swarm/

- **Hero:** each agent chases the spot a looping leader point passed up to 2.5 seconds earlier. This stretches the flock into a ribbon that folds over itself, and a drifting noise field roughs up its edges. Move the pointer and it becomes the leader. Hover the SWARM headline and agents lift pixels out of the letters and rearrange them, leaving each pixel the color of the agent that moved it.
- **About:** the colored arc under the hero turns into a sphere as you scroll, and the copy is laid out around it.
- **Demo:** a board with three views (Hive, Social, Memory).

Originally made [on CodePen](https://codepen.io/editor/benbearfoot/pen/01a1e5ba-47e8-7c3b-88c9-1be8fd832761).

## Run locally

```sh
python3 -m http.server
```

Then open http://localhost:8000.

## License

MIT
