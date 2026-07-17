# Tower test — findings

> **CORRECTION (after watching it run).** The first version of this document reported a
> spectacular one-shell collapse into 431 fragments. That was **inflated by a bug**. See
> "The reset bug" below. The corrected result is a 7-shell siege into 23 fragments, and it
> is a better game. Nothing below the correction has been left in its wrong form.

Headless. Jolt via npm, Node, no renderer. Run: `npm i jolt-physics && node control.mjs && node siege.mjs`

## The three questions

**Q1 — does it stand still?** Yes, and the union-find thesis is confirmed harder than expected.

| | bodies | sim/frame | max drift | outcome |
|---|---|---|---|---|
| merged (one compound per component) | 1 | **0.02 ms** | 8 mm | asleep @0.5 s |
| naive (one body per brick) | 1,062 | 5.78 ms | **10,244 mm** | slumped and collapsed |

The naive tower *fell over under its own weight*. Merged is ~290× faster **and** it's the only one that stands. This is no longer an optimisation, it's the only viable architecture.

**Q2 — does it topple like masonry?** Yes, once two things were added:

- **Stone removal.** Breaking mortar alone leaves a dry-stone stack, which stands — correctly. A cannonball must *eject material*.
- **Tensile failure (`tensionPass`).** Mortar can't pull. Load reaches the ground downward or sideways; mortar bridges a short lateral span (that's an arch) but not a long one. Undermine wider than the span and the stone above is a cantilever, which cracks off. Pure graph work on the mortar graph — no physics.
- **Impact fracture.** Without it a toppling tower falls as one rigid banana. With it: **431 fragments.**

**Q3 — does the banner come down?** Mechanically yes: 13.90 m → 0.48 m, and `bannerDown()` is a union-find query, as predicted. *Whether it reads as a satisfying win still needs eyes.*

## The siege (this is the game)

```
#  shot                    stone mortar cracked  impact  bodies   banner
 1 solid shot, mid-height     3     67       0        0       1   13.89m
 2 solid shot, mid-height     4     53       0        0       1   13.89m
 3 shell, base               32    355       0        0       1   13.89m
 4 shell, base                9     69       0        0       1   13.89m
 5 shell, base                9     67      26     3430     431    0.48m  <<< BANNER DOWN
```

Shots at the wrong place are wasted. Undermining one side of the base accumulates until the centre of mass leaves the support polygon — then it goes. **That is exactly the loop we wanted, and it fell out of the physics rather than being scripted.**

## The reset bug — what only *watching* it could find

`rebuild()` reconstructed each body from `bricks[i].p` — the **generator's original positions**, which never change. So every time mortar broke mid-collapse, every fragment was teleported back into the intact tower and dropped again. A collapse that broke mortar 14 times visibly collapsed 14 times.

`damage()` and `tensionPass()` had the same disease: damage measured distances against the original layout (so once stone moved, shells cratered empty air), and tension decided what was "grounded" from `course === 0` (meaningless once a chunk is lying on its side). All three now work in world space, from live poses.

**The headless harness could not have caught this**, and didn't. It only checked the *final* banner height, which came out the same either way. The fake re-drops were also manufacturing enormous phantom impact energies (24.5 m/s vs a true 7.0), which cascaded into mass fracture — that was the "431 fragments."

Corrected siege: shots must **walk around the base to widen the breach**. Hitting the same hole ten times does nothing (correctly — later shells fly into the cave the earlier ones dug).

```
#  shot                  stone mortar cracked  impact  bodies   banner
 1 shell, base +0.00rad     32    353      12       0       2   13.89m
 2 shell, base -0.45rad     17    128       0       0       1   13.89m
 3 shell, base +0.45rad     14    115      64       0       2   13.89m
 4 shell, base -0.90rad     14    110      17       2       5   13.89m
 5 shell, base +0.90rad     15    111      48       0       6   13.89m
 6 shell, base -1.35rad     16    125      70       0       7   13.89m
 7 shell, base +1.35rad     18    131     107     235      23    0.56m  <<< BANNER DOWN
```

Worst frame fell from 54 ms to **10.6 ms** — most of that spike *was* the phantom explosion.

**Lesson.** "It passes headless" and "it is correct" are different claims. Three of the five bugs below were found by tests; the worst one was found by a human looking at the screen and saying *it exploded four times.*

## Bugs the headless harness caught (all invisible in a viewport)

1. `CompoundShapeSettings.AddShape` wants a *ShapeSettings*; passing a *Shape* needs `AddShapeShape`. Hard crash.
2. `ShapeSettings` is refcounted — `Release()`, not `destroy()`.
3. **Jolt's Vec3 getters return a pointer into a shared temporary.** Reading body 2's velocity clobbers body 1's, so the static floor appeared to be falling at the same speed as the thing hitting it and *every impact read as zero*. Copy components out before the next call. (Same bug class as the sphere-project wound cavity: the symptom is silence, not an error.)
4. `GetWorldSpaceContactPointOn1()` **already includes** `mBaseOffset`. Adding it again doubled every coordinate and landed the damage in empty space.
5. **The spatial hash cell was smaller than the largest brick.** The 2.4 m flagpole's neighbours sat two cells away and a ±1 scan missed them, so the banner never bonded to the tower — it just fell off. The squat tower only linked by luck. *The control test (build it, fire nothing) is what caught this; the siege test had been quietly reporting a "win" that was really the flag falling off an undamaged tower.*

## Known issues

- **Worst frame ~11 ms during collapse.** `rebuild()` still reconstructs *every* component whenever any mortar breaks. Tolerable now, but it should rebuild only changed components.
- **23 fragments may be too chunky** for masonry. The dial is `installImpactFracture(minSpeed, …)` — lower it and the tower shatters more on landing.
- **A round tower is very hard to topple** — the base ring is a wide support polygon. Square towers, and towers with fewer/thinner walls, will fall much more readily. Worth generating both.
- Tuning constants (`span`, `minChunk`, crater radii, impact threshold) are hand-set, not derived.
- No cannon yet — damage is applied at a point. No projectile, no aiming, no ammo table.

---

## Session 2 — plans, walls, and powder

### The bricks were laid wrong the whole time

`makeTower()` set `yaw: -th`, which points each brick's **length** axis radially
outward. Every tower ever built by this project was a ring of *spokes* with
tangential gaps between them, not a course of stone. The fix is one term:

```js
yaw: -th - Math.PI / 2      // +x runs along the course, +z points outward
```

This is not cosmetic. It changes the answer to every tuning question that was
asked before it:

| test | before the fix | after |
|---|---|---|
| `cannon.mjs`, one fixed aim | tower down in **1** shell | survives 6 |
| `tune.mjs` "good siege" setting | crater 0.70 / blastR 1.40 | crater **0.90 / 1.80** |
| `siege.mjs`, walking aim | 3 shells | 3 shells |

A correctly bonded tower is markedly stronger, because the bricks now interlock
along the course instead of touching only at their inner corners. **Every number
in the sections above was measured on a badly built tower.** The siege still
takes 3 shells because a walking aim was always the thing that mattered — but if
you re-tune, re-tune from here.

### Plans: `layPath()` generalises the circle

`plans.mjs` replaces "a tower is a circle of bricks" with "a wall is a polyline
of bricks." `layPath(path, opts)` walks any polyline dropping courses with a
running bond, closer bricks at the ends, crenellations, and openings (a gate is
just a course-range plus a radius to skip). A closed path is a tower or a keep;
an open path is a curtain wall. Everything else — `square()`, `ngon()`,
`keep()`, `castle()` — is a call to it. Four plans ship: **round, square, keep,
castle**.

### Powder kegs

A keg is a brick with `isKeg`, and the single thing that makes it a keg is that
`makeMortar()` **skips it**. It bonds to nothing, so it is a loose body sitting
in a room — and, being loose, it never participates in `tensionPass`/`loadPass`
either. Getting hit doesn't destroy it; it *fuses* it (`kegQueue`). Then:

```js
resolveKegs()   // each detonation is just another damage() call
```

and a `damage()` call can fuse more kegs, which the same loop drains. **The
chain reaction is free** — nobody wrote chain-reaction code.

Three things fell out of this that were not designed:

- A `pene` round aimed at the castle **gate** flies *through* the open gateway
  and strikes the keep behind it. Nobody put that shot in the game.
- Rubble landing on a keg sets it off (`applyImpacts` fuses too), so a collapse
  can detonate a magazine under it.
- The castle's magazine chains 4 kegs, and the keep's chains all 5 in one shot.

### Three tuning laws, all the same law

1. **Symmetric damage never topples anything.** A magazine in the *centre* of a
   keep guts all four walls evenly and the keep sits straight down on its own
   rubble. Moved against the west wall, it goes over. Same law as "walk your
   shots" — you must undermine *one side*.
2. **Slenderness is destiny.** A fat keep sits on its rubble; the castle's keep
   only topples at ~4.8 m wide × 13.5 m tall. (This is the round-tower
   observation again, restated.)
3. **A blast has to be able to move what it broke.** The magazine removed the
   keep's base and the keep still stood, because `impulse: 4200` against a
   200-tonne stump is a nudge. At `impulse: 30000` it goes over. A magazine
   *heaves*; it doesn't only crumble.

### Walls create a weapon requirement

Once a curtain wall shields the keep, flat fire cannot reach it — the wall eats
every round. The castle is not winnable without an over-wall weapon, so the
**mortar** exists: a high-arc solution to the same ballistic equation.

```js
const ang = Math.atan2(speed*speed + (high ? root : -root), g*d);
```

Its muzzle speed had to drop to **26 m/s**. The gun is wildly overpowered for a
30 m range, and at 95 m/s the high-arc solution is a near-vertical shot that
lands *on the cannon*.

### Performance: the worst frame was 323 ms, now 43–85 ms

Three fixes, in order of what they were worth:

1. **World-pose caching.** `settleStructure()` was re-reading every brick's pose
   through the WASM boundary ~48× per frame. Poses only change when Jolt steps,
   so capture once per step behind a `_worldFresh` flag. Step total over 900
   frames: **45.6 s → 7.4 s.**
2. **Incremental rebuild.** Components only ever *shrink* — so a new group with
   the same brick count as its first brick's old body **is** that body,
   untouched. Skip the destroy/recreate. Only changed components are rebuilt.
3. **Fragment budget.** Impact fracture would subdivide rubble to 2800+ bodies,
   which is pure broadphase cost for no visual gain. Stop fracturing past
   `maxBodies` (600).

### Still true, still annoying

- `test.mjs` calls `c.bannerSupported()`, which has never existed on `Castle`.
  It has been throwing since before this session. Left as found.
- `Math.random()` in a generator silently destroys headless reproducibility —
  the keg yaw used it, and two identical sieges gave different answers. Kegs now
  hash their position for a deterministic angle. **No generator may be random.**

### Where each plan stands

| plan | bricks | kegs | falls in | worst frame |
|---|---|---|---|---|
| round tower | 1232 | 0 | 3 shells | 61 ms |
| square tower | 1833 | 3 | 7 shells | 65 ms |
| keep + magazine | 1794 | 5 | **1 penetrator** through the door | 52 ms |
| castle | 4660 | 10 | 4 (pene through the gate, then a mortar on the keep's west footing) | 48 ms |

All four stand still under `plans.test.mjs` (8–9 mm settle, asleep in 0.5 s).
