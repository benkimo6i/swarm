// Every tunable number on the page, in one place.
// CONFIG drives the main swarm, the hero word and the About sphere;
// HIVE, SOCIAL and MEMORY drive the three views of the Demo board.

export const CONFIG = {
  count: 900,
  idleDelay: 1400, // ms without pointer movement before the swarm lets go

  // ribbon: each agent chases a point the leader passed some time ago
  maxLag: 150, // longest delay behind the leader, in 1/60s steps (ribbon length)
  lagBias: 1.3, // >1 packs more agents near the head, thinning the tail
  widthMin: 18, // ribbon half-width at its thinnest, px
  widthMax: 130, // and at its thickest
  twist: 0.5, // how fast agents wheel around the ribbon's centre line
  stillSpread: 1.6, // how much the swarm opens up when the leader stops moving

  // flow field: pushes agents off their targets for ragged, organic edges
  flowForce: 0.3,
  flowScale: 0.0035,
  flowSpeed: 0.14,

  // steering
  arrive: 0.06,
  steer: 0.07,
  align: 0.04,
  separation: 0.1,
  neighborRadius: 28,
  separationRadius: 11,
  maxSpeed: [6.5, 9.5], // [idle, following]

  // hero word
  word: "SWARM",
  wordFont: 'Anton, Impact, "Haettenschweiler", "Arial Narrow", sans-serif',
  wordWidth: 0.92, // of the viewport width, unless the height runs out first
  wordGap: 32, // px kept clear between the word and the tagline below it
  square: 14, // px, the size of the squares agents lift out of the letters
  workRadius: 110, // px around the pointer that agents work on
  maxJobs: 60, // agents handling squares at once
  liftsPerSecond: 40, // squares lifted per second while hovering
  holdTime: [350, 850], // ms an agent carries a square before setting it down
  carrySpeed: 12,
  clearing: 2.2, // how hard idle agents are pushed out of the work area, so it stays visible

  // about sphere
  arcWidth: 1.85, // diameter of the circle whose top peeks into the hero, in viewport widths
  arcPeek: 100, // px of that circle showing above the hero's bottom edge
  sphereSize: 0.46, // settled sphere diameter, of the viewport's shorter side
  gatherFrom: 0.3, // how far into the scroll (0..1) the first agents are drawn onto the sphere
  copyGap: 30, // px kept clear between the sphere and the copy around it
  copyWidth: [0.92, 1240], // copy block width: share of the viewport, and a cap in px
  stackBelow: 760, // narrower than this, the sphere sits high and the copy goes underneath
  shellRadius: 1.07, // the swarm's shell, relative to the sphere's radius
  shellTilt: 0.6, // radians the shell's spin axis leans away from facing you
  spinSpeed: 0.012, // radians per 1/60s

  // labels
  permanentLabels: 12, // agents that always show their name
  hoverLabels: 3, // extra agents near the pointer that pick up a label
  labelRadius: 150, // how close to the pointer an agent must be to pick one up
  labelHold: 2000, // ms a hover label stays after its agent leaves the pointer
  labelStagger: 350, // ms between hover labels appearing
  labelSpacing: [120, 30], // minimum [x, y] gap between labelled agents, px

  // arrows: white darts with a solid border and a soft glow in the agent's colour
  arrowFill: "#ffffff", // in both themes
  border: 1.5, // border thickness (the arrow is 17 long); 0 for glow only
  glowBleed: 3, // how far the glow reaches past the arrow's edge
  glowStrength: 0.75,

  ink: "#0d0d0d", // name pills always use dark text; the page's ink comes from theme.js
  palette: ["#4f6df5", "#6fdc3c", "#ef5350", "#e254e8", "#7fe8cf", "#f7df4b"],
  roles: [
    "PM", "Designer", "Frontend", "Backend", "Staff Eng", "SRE", "QA", "Data Sci",
    "ML Eng", "Security", "DevRel", "Infra", "Eng Manager", "Intern"
  ]
};

// Hive: the agent hierarchy as rings around a centre node, one tier at a time.
export const HIVE = {
  // count: agents in the tier. rows: how many rings they are spread over.
  // size: arrow scale when the tier first appears. labels: how many carry a name.
  // title and copy: the centre card at that step.
  tiers: [
    {
      count: 5, rows: 1, size: 1.15, labels: 5, color: 0,
      title: "Core",
      copy: "Five core agents take your goal and split it into work. Each layer hands tasks down to the next and reports results back up. Step through the layers below to meet them."
    },
    {
      count: 15, rows: 1, size: 0.95, labels: 5, color: 3,
      title: "Leads",
      copy: "Fifteen leads each own a workstream, like product, platform or growth. They turn the core's plan into tasks and decide who picks them up."
    },
    {
      count: 50, rows: 1, size: 0.8, labels: 5, color: 2,
      title: "Specialists",
      copy: "Fifty specialists bring the deep skills: design, security, data and infrastructure. Leads call them in when a task needs an expert."
    },
    {
      count: 150, rows: 2, size: 0.62, labels: 6, color: 5,
      title: "Workers",
      copy: "A hundred and fifty workers do the building: writing code, running tests and drafting docs. Each takes a task, finishes it and reports back."
    },
    {
      count: 500, rows: 4, size: 0.5, labels: 6, color: 1,
      title: "Microdrones",
      copy: "Five hundred microdrones handle the small, fast jobs: checks, lookups, retries and cleanup. They keep every layer above them moving."
    }
  ],
  coreRadius: 190, // px from the centre to the first ring, before any zoom
  ringGap: 125, // px between one tier and the next when the outer one first appears
  rowGap: 13, // px between a tier's rings when it first appears
  turn: 0.1 // radians per second the first ring turns; outer rings turn slower
};

// Social shows all five Hive layers at once, laid out exactly like Hive's last
// step. Agents keep the colour of the layer they started in, so the rings
// visibly mix as they trade.
export const SOCIAL = {
  title: "Social",
  copy: "Agents govern themselves. Any agent can move toward the core or step back out as the work changes, and the swarm reorganizes around it.",
  swapsPerSecond: 5, // pairs of agents trading places
  travelTime: 1.5, // seconds a trade takes
  farChance: 0.2 // share of trades that skip a layer instead of going to the next one
};

// Memory: five cores, each with a tower of context boxes over its topic.
// Coloured drones take black boxes (or coloured ones, if no black are left)
// and bring them back on top in their own colour, plus a new one, so using
// context grows the tower. Once a tower gets tall, the blue core cursor
// gathers coloured boxes and condenses them into black ones until it's lean.
export const MEMORY = {
  // Each core holds one kind of shared memory. tokens: its context window,
  // i.e. what a full tower is worth.
  cores: [
    { topic: "Codebase", tokens: 32000 },
    { topic: "Product decisions", tokens: 24000 },
    { topic: "Customer history", tokens: 48000 },
    { topic: "Incidents", tokens: 16000 },
    { topic: "Style guide", tokens: 12000 }
  ],
  // The meter card in the middle: placeholder figures driven by the towers.
  // Hovering a core shows that core's figures instead.
  meterTitle: "Swarm memory",
  meterCopy: "Agents add context as they work; core agents condense it as it grows. Hover a core to see who depends on it.",
  coreColor: 0, // core cursors are blue, like Hive's core layer
  droneColors: [1, 2, 3, 4, 5], // drones get any colour but blue
  cell: 9, // px, the size of a box
  cellSmall: 7, // the same on narrow screens
  towerWidth: 4, // boxes per row
  towerRows: 10, // a full tower; full = the core's whole context window
  startRows: 5, // how tall towers start
  condense: 3, // coloured boxes a core combines into one black box
  curateFrom: 0.55, // a core starts curating once its tower is this full...
  curateTo: 0.4, // ...and keeps going until it's down to this
  coreRest: 0.25, // seconds a core rests after setting down a combined box
  coreSpeed: 5, // px per 1/60s a core cursor moves
  squads: 2, // groups of drones orbiting each core
  squadSize: 8,
  orbitGap: 12, // px from the tower and label to the first squad's orbit
  orbitStep: 16, // px between one squad's orbit and the next
  orbitSpeed: 0.55, // radians per second for the innermost squad
  borrowsPerSecond: 1.2, // per core
  holdTime: [1.5, 4], // seconds a drone keeps a box before bringing it back
  travelTime: 0.7, // seconds between a squad and the tower
  coreSize: 1.3,
  droneSize: 0.6
};

// Pricing: a node graph. The centre card starts with the mission; picking a
// plan wires it to the centre, releases its swarm, and the swarm rewrites the
// card with that plan. logo: which version of the logo marks the plan, all in
// black: "outline" (one cursor solid), "one-outline" (one cursor outlined) or "solid".
export const PRICING = {
  mission: {
    title: "Go fast, go far, go forever",
    copy: "Big companies get whole teams of AI agents. We think everyone else should too. Swarm gives freelancers, founders, small teams and community groups a workforce that plans, builds and ships alongside them.",
    prompt: "Pick a plan to see how you'd fly."
  },
  // price and per: the big figure and what it covers. terms: the line under it.
  // schedule: the full pricing, listed on the centre card once the plan is picked.
  plans: [
    {
      id: "fast",
      swarm: 50, // cursors it releases
      cursorSize: 0.72,
      name: "Go fast",
      price: "$0",
      per: "for 2 years",
      terms: "then $15,000/mo, or 7% equity",
      tagline: "For solo builders, whether you're founding or freelancing",
      logo: "outline",
      copy: "Your own swarm, ready when you are. Whether you're founding something or freelancing as a specialist, hand off the busywork, keep the creative calls, and ship in an afternoon what used to take a sprint.",
      schedule: [
        ["Years 1–2", "$0"],
        ["Year 3 on", "$15,000 / month"],
        ["Or instead", "7% equity"]
      ],
      includes: ["1 seat with a swarm of 50 agents", "Hive and Memory for every project", "Email support"],
      cta: "Start with Go fast"
    },
    {
      id: "far",
      swarm: 500,
      cursorSize: 0.5,
      name: "Go far",
      price: "$0",
      per: "for 2 years",
      terms: "then $68,000/mo, $240,000/mo from year 5, or 7% equity",
      tagline: "For startups and small teams",
      logo: "one-outline",
      copy: "One swarm for the whole team. Agents share memory across your projects, pick up work from anyone, and keep everyone moving in the same direction.",
      schedule: [
        ["Years 1–2", "$0"],
        ["Years 3–4", "$68,000 / month"],
        ["Year 5 on", "$240,000 / month"],
        ["Or instead", "7% equity"]
      ],
      includes: ["A shared swarm of 500 agents", "Team memory across projects", "Priority support"],
      cta: "Start with Go far"
    },
    {
      id: "forever",
      swarm: 150,
      cursorSize: 0.6,
      name: "Go forever",
      price: "$0",
      per: "for eligible orgs",
      terms: "for as long as you qualify",
      tagline: "For non-profits, schools and community groups",
      logo: "solid",
      copy: "A lighter Go far for the people doing the long work. Non-profits, schools and community organizations get a shared team swarm at no cost, for as long as they're doing it.",
      schedule: [["Always", "$0 for eligible orgs"]],
      includes: ["A shared swarm of 150 agents", "Team memory across projects", "Onboarding with our team"],
      cta: "Apply for Go forever"
    }
  ],
  connectTime: 0.9, // seconds to lay the wire
  swarm: {
    releaseTime: 0.7, // seconds for a plan's node to pour out its cursors
    wireCursors: 6, // cursors that run along the wire to connect a plan
    takeStart: 0.45, // seconds after a pick before words start coming off the card
    placeStart: 0.55, // and before cursors fetch the new words from the plan
    takesPerSecond: 45,
    placesPerSecond: 40,
    dropAfter: 0.25, // seconds a taken word is carried before it starts to fade
    dropFade: 0.5,
    carrySpeed: 11, // px per 1/60s for working cursors
    // free cursors: a loose orbit round the card, roughed up by a flow field
    maxSpeed: 3.2,
    minSpeed: 0.8,
    pull: 0.012, // how hard a free cursor is drawn to its place on the orbit
    orbitSpeed: 0.12, // radians per second
    flowForce: 0.22,
    flowScale: 0.004,
    flowSpeed: 0.12,
    align: 0.05,
    separation: 0.12,
    neighborRadius: 24,
    separationRadius: 10,
    avoid: 18, // px free cursors keep clear of every card
    push: 0.9 // how hard they're pushed back out
  }
};
