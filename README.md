# Swarm AI

A landing page for a fictional Swarm AI startup, built around a flock of AI-agent cursors that moves like a starling murmuration. Only HTML, CSS and Canvas 2D, all on one fixed canvas, with no build step and no dependencies.

**Live:** https://benkimo6i.github.io/swarm/

- **Hero:** each agent chases the spot a looping leader point passed up to 2.5 seconds earlier. This stretches the flock into a ribbon that folds over itself, and a drifting noise field roughs up its edges. Move the pointer and it becomes the leader. Hover the SWARM headline and agents lift pixels out of the letters and rearrange them, leaving each pixel the color of the agent that moved it.
- **About:** the colored arc under the hero turns into a sphere as you scroll, and the copy is laid out around it.
- **Demo:** a board with three views (Hive, Social, Memory).

Originally made [on CodePen](https://codepen.io/editor/benbearfoot/pen/01a1e5ba-47e8-7c3b-88c9-1be8fd832761).

## Where things live

No build step: the page loads `js/main.js` as an ES module, and that imports the rest.

| File | What it does |
| --- | --- |
| `js/config.js` | **Every tunable number**: swarm size, speeds, colours, labels, sphere, and the three Demo views. Start here. |
| `js/main.js` | Startup, resize, and the frame loop (update everything, then draw) |
| `js/stage.js` | The canvas, plus the shared width/height/dpr/time |
| `js/pointer.js` | Pointer position and whether it's on the page |
| `js/sprites.js` | The arrow sprites and the coloured name pills |
| `js/noise.js` | Smooth noise for the flow field |
| `js/orb.js` | The About sphere, and laying the About copy out around it |
| `js/swarm/agents.js` | Per-agent state (position, colour, label, job, shell) |
| `js/swarm/leader.js` | The point the ribbon follows: roaming path, pointer, or sphere |
| `js/swarm/flock.js` | The flocking simulation |
| `js/swarm/draw.js` | Drawing the swarm's arrows |
| `js/swarm/labels.js` | Which agents show a name, and drawing their pills |
| `js/hero/word.js` | The SWARM headline: layout, square grid, drawing |
| `js/hero/jobs.js` | Agents lifting squares out of the word and setting them back |
| `js/demo/board.js` | The Demo board and its Hive/Social/Memory tabs |
| `js/demo/hive.js` | Hive view and its tier stepper |
| `js/demo/social.js` | Social view |
| `js/demo/memory.js` | Memory view: context towers, drones and core curators |
| `js/pricing/index.js` | Pricing: what happens when a plan is picked, and the frame hooks |
| `js/pricing/graph.js` | The plan nodes, dragging them, and the wires to the centre card |
| `js/pricing/copy.js` | The centre card's copy, split into words the swarm carries |
| `js/pricing/swarm.js` | The plan's swarm: releasing it, its jobs, and its flow-field drift |
| `js/closing.js` | Closing mission: starts the logo animation when it scrolls into view |
| `js/theme.js` | Light/dark: follows the device (`?theme=dark` or `?theme=light` forces one) and gives the canvas the CSS colour tokens |

## Run locally

```sh
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because browsers only load ES modules over http.

## License

MIT
