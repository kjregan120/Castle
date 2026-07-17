# Castle
<img width="1280" height="924" alt="image" src="https://github.com/user-attachments/assets/55f09fc7-8238-4c53-ba31-7399ce9579ab" />

Masonry destruction simulation: one rigid body per intact structure, headless
physics via [Jolt](https://github.com/jrouwe/JoltPhysics) (through
[jolt-physics](https://www.npmjs.com/package/jolt-physics) in Node, no
renderer required), with an optional browser viewer for watching sieges play
out.

<img width="1280" height="1024" alt="image" src="https://github.com/user-attachments/assets/a76f7ec2-8bcb-473e-8b1d-b920a8eb5bd1" />


Castles, towers, and walls are procedurally laid brick-by-brick, bonded with
mortar, and then bombarded with cannon fire. Mortar breaks under tension,
stone gets ejected on impact, and — when enough of one side is undermined —
the structure topples under its own weight. Nothing about the collapse is
scripted; it falls out of the physics.

See [`FINDINGS.md`](./FINDINGS.md) for the full write-up of what was built,
what broke, and what was learned along the way.

## Requirements

- [Node.js](https://nodejs.org/)

## Setup

```
npm install
```

## Running

```
npm start        # node serve.mjs   -> serves the browser viewer at http://localhost:8080
npm run control   # node control.mjs -> headless: build towers, fire nothing, confirm they stand
npm run siege     # node siege.plans.mjs -> headless: build + bombard a plan, print the siege log
npm run plans     # node plans.test.mjs  -> headless: sanity-check all four plans stand still
npm run cannon    # node cannon.mjs  -> headless: single fixed-aim shot test
npm run tune      # node tune.mjs    -> headless: sweep tuning constants (crater/blast radius, etc.)
```

For the browser viewer, run `npm start` and open `http://localhost:8080`.

## Layout

| file | purpose |
|---|---|
| `castle.mjs` | Core sim: `Castle` class, brick/mortar bonding, damage, tension, and fracture passes |
| `plans.mjs` | `layPath()` — generalized wall/tower layout; ships round, square, keep, and castle plans |
| `cannon.mjs` | Cannon/mortar ballistics and firing |
| `siege.mjs`, `siege.plans.mjs` | Siege loop: fire a sequence of shots at a structure and log the outcome |
| `buildplan.mjs` | Builds a structure from a plan |
| `control.mjs` | Headless control test — structure stands with no shots fired |
| `tune.mjs` | Sweeps tuning constants to find stable settings |
| `serve.mjs` | Static file server for the browser viewer |
| `editor.html`, `viewer*.html` | Browser-based viewers/editors for watching a siege visually |
| `*.test.mjs`, `test.mjs` | Test suites |
| `FINDINGS.md` | Development log: results, bugs found, and lessons learned |
