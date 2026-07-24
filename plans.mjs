/* ------------------------------------------------------------------
   PLANS — more castles.

   castle.mjs's makeTower() lays courses around a circle. Everything here
   lays courses along a POLYLINE instead, which is strictly more general:
   a square tower is a closed 4-gon, a curtain wall is an open 2-point
   line, an octagonal keep is a closed 8-gon. Same brick dictionary
   (p / h / yaw / course / ring), so the mortar graph, the union-find and
   every physics pass in castle.mjs work on these unchanged.

   ORIENTATION. A brick's local axes are x = length (along the wall),
   y = up, z = thickness (across the wall). A yaw of `a` maps local +x to
   (cos a, 0, -sin a), so to point +x along a wall running in direction
   (dx, dz) you need yaw = atan2(-dz, dx). Get this wrong and the bricks
   are laid as spokes -- which is what the round tower was doing.
------------------------------------------------------------------- */

const yawAlong = (dx, dz) => Math.atan2(-dz, dx);

/* ---------- polygon helpers -------------------------------------- */

/* Move every vertex of a convex polygon inward by `d` (miter offset).
   Vertices must be counter-clockwise in the XZ plane. */
function shrink(poly, d) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const P = poly[(i - 1 + n) % n], V = poly[i], N = poly[(i + 1) % n];
    const n1 = inwardNormal(P, V), n2 = inwardNormal(V, N);
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = d / Math.max(0.2, 1 + dot);          // miter, clamped at sharp corners
    out.push([V[0] + (n1[0] + n2[0]) * k, V[1] + (n1[1] + n2[1]) * k]);
  }
  return out;
}

/* inward normal of edge A->B for a CCW polygon in XZ */
function inwardNormal(A, B) {
  const dx = B[0] - A[0], dz = B[1] - A[1];
  const L = Math.hypot(dx, dz) || 1;
  return [dz / L, -dx / L];
}

export function square(cx, cz, side) {
  const h = side / 2;   // CCW in XZ
  return [[cx - h, cz - h], [cx - h, cz + h], [cx + h, cz + h], [cx + h, cz - h]];
}

export function ngon(cx, cz, r, n) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    p.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]);
  }
  return p;
}

/* ---------- the one true brick-layer ------------------------------
   Walk a path, drop bricks. Everything else in this file calls this.

   path      list of [x,z]. Closed = a tower/keep. Open = a wall.
   openings  [{x, z, w, from, to}] course range `from`..`to` is skipped
             within `w` metres of (x,z) -- that is a gate, or a window.
   crenels   top course is laid as merlons (brick, gap, brick, gap).
--------------------------------------------------------------------- */
export function layPath(path, P = {}) {
  const {
    closed = true,
    thickness = 0.8,
    rings = 2,
    courses = 12,
    courseH = 0.42,
    brickL = 0.62,
    baseY = 0,
    stagger = true,
    crenels = false,
    openings = [],
    tag = 'stone',
    elType,
    into = [],
  } = P;

  const ringDepth = thickness / rings;
  const bricks = into;

  for (let c = 0; c < courses; c++) {
    const y = baseY + courseH * (c + 0.5);
    const isTop = crenels && c === courses - 1;

    for (let ring = 0; ring < rings; ring++) {
      // mid-line of this ring: for a closed plan, shrink the outline inward;
      // for an open wall, offset sideways from the centre-line.
      const inset = ringDepth * (ring + 0.5) - (closed ? 0 : thickness / 2);
      const line = closed ? shrink(path, inset) : offsetLine(path, inset);
      const phase = (stagger ? (c % 2) * 0.5 : 0) + (ring % 2) * 0.25;

      const edges = [];
      for (let i = 0; i + 1 < line.length; i++) edges.push([line[i], line[i + 1]]);
      if (closed) edges.push([line[line.length - 1], line[0]]);

      let merlon = 0;
      for (const [A, B] of edges) {
        const dx = B[0] - A[0], dz = B[1] - A[1];
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;
        const ux = dx / len, uz = dz / len;
        const n = Math.max(1, Math.round(len / brickL));
        const bl = len / n;                       // exact fit along this edge
        const yaw = yawAlong(ux, uz);

        /* running bond. Alternate courses start half a brick along, so a
           crack cannot run straight down; the bricks that hang off the end
           of the edge are cut short -- that is a closer, and it is what a
           mason does at a corner. */
        const p = phase % 1;
        for (let i = 0; i <= n; i++) {
          const lo = Math.max(0, (i - p) * bl);
          const hi = Math.min(len, (i + 1 - p) * bl);
          const w = hi - lo;
          if (w < bl * 0.3) continue;                              // sliver: not a brick
          const s = (lo + hi) / 2;
          const x = A[0] + ux * s, z = A[1] + uz * s;

          if (isTop && (merlon++ % 2)) continue;                   // crenellation gap
          if (skip(openings, x, z, c)) continue;                   // gate / window

          bricks.push({
            p: [x, y, z],
            h: [w * 0.5 * 0.97, courseH * 0.5 * 0.96, ringDepth * 0.5 * 0.97],
            yaw, course: c, ring, isBanner: false, tag, elType,
          });
        }
      }
    }
  }
  return bricks;
}

function skip(openings, x, z, course) {
  for (const o of openings) {
    if (course < o.from || course > o.to) continue;
    if (Math.hypot(x - o.x, z - o.z) < o.w * 0.5) return true;
  }
  return false;
}

/* offset an open polyline sideways (its left-hand normal) */
function offsetLine(path, d) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const A = path[Math.max(0, i - 1)], B = path[Math.min(path.length - 1, i + 1)];
    const nx = inwardNormal(A, B);
    out.push([path[i][0] + nx[0] * d, path[i][1] + nx[1] * d]);
  }
  return out;
}

/* ---------- the banner ---------------------------------------------
   The objective. Pole + flag, planted on the top course. It must physically
   TOUCH the stone or the mortar graph will never bond it -- makeMortar's
   spatial hash sizes its cells from the biggest brick, so a long pole is
   fine, but a floating one is not.
--------------------------------------------------------------------- */
export function plantBanner(bricks, x, y, z) {
  bricks.push({ p: [x, y + 1.2, z], h: [0.06, 1.25, 0.06], yaw: 0,
                course: 999, ring: 0, isBanner: true, pole: true, tag: 'pole' });
  bricks.push({ p: [x, y + 1.9, z + 0.45], h: [0.03, 0.45, 0.45], yaw: 0,
                course: 999, ring: 0, isBanner: true, tag: 'flag' });
  return bricks;
}

/* ---------- powder kegs --------------------------------------------
   A keg is a brick with a `keg` spec on it. It is NOT mortared to anything
   (see makeMortar) -- it is a loose barrel standing on a floor, so it rides
   the rubble and can be crushed by it. When damage reaches one it detonates,
   and its own blast can reach the next one. Stack them and you get a chain.
--------------------------------------------------------------------- */
export function addKeg(bricks, x, y, z, spec = {}) {
  bricks.push({
    p: [x, y, z],
    h: [0.34, 0.42, 0.34],
    yaw: ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 * 3,  // deterministic
    course: 0, ring: 0, isBanner: false, isKeg: true, tag: 'keg',
    keg: { blastR: 2.6, power: 1.8, crater: 1.5, impulse: 2200, ...spec },
  });
  return bricks;
}

/* a magazine: a cluster of kegs on a floor, so one shot takes the lot */
export function magazine(bricks, x, y, z, n = 4, spread = 0.9, spec = {}) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    addKeg(bricks, x + Math.cos(t) * spread * (i ? 1 : 0),
                   y + 0.44 * (i % 2 === 0 && i > 2 ? 1 : 0),
                   z + Math.sin(t) * spread * (i ? 1 : 0), spec);
  }
  return bricks;
}

/* ---------- knights: a blocky defender, six boxes ---------------------
   There is no actor/AI layer in this engine -- nothing here is animated
   or scripted. A knight is a physics prop exactly like the banner or a
   keg: a handful of ordinary bricks, tagged so castle.mjs knows to treat
   them specially in three small ways (see makeMortar/damage/rebuild):
     - the knight's own pieces ALWAYS bond to each other, so it topples
       and flies as one coherent figure, never explodes into loose boxes.
     - `mortared: true` also bonds it to whatever it's standing on, so it
       comes down WITH the wall/tower when that goes; `mortared: false`
       (the default) leaves it standing alone, like a keg -- the first
       hit that reaches it sends it flying on its own.
     - it's excluded from crater removal (like the banner) so a direct
       hit knocks it flying instead of just deleting it.
   `yaw` follows the same convention as everything else here: local +x is
   the direction the knight faces. */
let _knightSerial = 0;
export function addKnight(bricks, x, z, opts = {}) {
  const { yaw = 0, baseY = 0, mortared = false } = opts;
  const id = _knightSerial++;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const put = (lx, ly, lz, hx, hy, hz, tag) => {
    bricks.push({
      p: [x + lx * cy + lz * sy, baseY + ly, z - lx * sy + lz * cy],
      h: [hx, hy, hz], yaw, course: 0, ring: 0, isBanner: false, tag,
      knight: { id, mortared },
    });
  };
  put(0,    0.35, 0,      0.16, 0.35, 0.14, 'knight-legs');
  put(0,    0.95, 0,      0.20, 0.25, 0.16, 'knight-torso');
  put(0,    1.31, 0,      0.11, 0.11, 0.11, 'knight-head');
  put(0,    0.95, 0.26,   0.08, 0.22, 0.08, 'knight-arm');
  put(0,    0.95, -0.26,  0.08, 0.22, 0.08, 'knight-arm');
  put(0.30, 1.05, -0.26,  0.30, 0.025, 0.025, 'knight-spear');
  return bricks;
}

/* ---------- trees: blocky scenery, trunk + tiered foliage -------------
   A tree is a physics prop like the knight, minus the defender behaviour:
   just a trunk box and a few stacked foliage boxes, tagged so castle.mjs
   knows to treat them as one unit (see makeMortar/damage/rebuild):
     - a tree's own pieces ALWAYS bond to each other, so it topples as one
       trunk-and-crown instead of exploding into loose boxes.
     - it never bonds to whatever it's standing on -- always loose, like a
       keg, since trees stand free in a courtyard rather than on a wall.
     - it's excluded from crater removal (like the banner/knight) so a
       direct hit knocks it over instead of deleting it.
   Rotationally symmetric, so unlike the knight there's no facing/yaw. */
let _treeSerial = 0;
export function addTree(bricks, x, z, opts = {}) {
  const { baseY = 0, scale = 1 } = opts;
  const id = _treeSerial++;
  const put = (ly, hx, hy, hz, tag) => {
    bricks.push({
      p: [x, baseY + ly * scale, z],
      h: [hx * scale, hy * scale, hz * scale], yaw: 0, course: 0, ring: 0, isBanner: false, tag,
      tree: { id },
    });
  };
  // the trunk is what actually touches the ground -- everything above it
  // (up to 1.1m of canopy) rides on however wide THIS footprint is. The
  // original 0.18x0.18 base was too slender for a 2.5m top-heavy tree (a
  // ~14:1 height-to-base ratio) and tipped over on its own; a knight, by
  // comparison, stands on a base closer to 5:1.
  put(0.6,  0.22, 0.6,  0.22, 'tree-trunk');
  put(1.35, 0.55, 0.35, 0.55, 'tree-foliage');
  put(1.85, 0.40, 0.30, 0.40, 'tree-foliage');
  put(2.25, 0.25, 0.25, 0.25, 'tree-foliage');
  return bricks;
}

/* deterministic 0..1 noise (same trick as addKeg's yaw) -- used to scatter
   clusters without Math.random, so a plan renders identically every time */
function hash01(a, b, c, d) {
  const s = Math.sin(a * 12.9898 + b * 37.719 + c * 3.1 + d * 7.7) * 43758.5453;
  return ((s % 1) + 1) % 1;
}

/* n points scattered around (x,z) on a golden-angle spiral -- the same
   "sunflower seed" packing that spreads points out with no clumping, by
   construction rather than by luck. The spiral is built at the requested
   spread, then uniformly grown (never shrunk) just enough that its
   closest pair clears minGap -- so a cluster of tall, top-heavy props
   (trees) can't spawn with canopies overlapping and shoving each other
   over on the first physics step. A plain random-angle scatter tried
   this via rejection sampling, but random attempts routinely failed to
   find a clear spot once a few points were already down. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function scatterPoints(x, z, n, spread, minGap) {
  if (n <= 1) return [[x, z]];
  const offs = [];
  for (let i = 0; i < n; i++) {
    const r = spread * Math.sqrt((i + 0.5) / n), t = i * GOLDEN_ANGLE;
    offs.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  let dmin = Infinity;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      dmin = Math.min(dmin, Math.hypot(offs[i][0] - offs[j][0], offs[i][1] - offs[j][1]));
  const k = dmin > 0 ? Math.max(1, minGap / dmin) : 1;
  return offs.map(([ox, oz]) => [x + ox * k, z + oz * k]);
}

/* ---------- single-box clutter: rocks, crates, hay bales ---------------
   All three are exactly one box apiece, so they share one shape and one
   physics treatment in castle.mjs -- a `prop` kind tag makes them behave
   like a keg without the explosive spec: never mortared to anything (a
   standalone body, free-standing), excluded from crater removal (a hit
   sends it flying, not deletes it), lighter than stone. */
const PROP_SHAPE = {
  rock:  { h: [0.30, 0.24, 0.27], y: 0.24 },
  crate: { h: [0.26, 0.26, 0.26], y: 0.26 },
  hay:   { h: [0.55, 0.32, 0.42], y: 0.32 },
};
export function addProp(bricks, x, z, kind, opts = {}) {
  const { baseY = 0, scale = 1 } = opts;
  const shape = PROP_SHAPE[kind];
  const yaw = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 * Math.PI * 2;
  bricks.push({
    p: [x, baseY + shape.y * scale, z],
    h: shape.h.map(v => v * scale), yaw, course: 0, ring: 0, isBanner: false,
    tag: kind, prop: kind,
  });
  return bricks;
}

/* a scattered cluster of one prop kind, e.g. a rockpile or a stack of crates.
   These are squat, so a modest gap keeps them from spawning stacked. */
export function propCluster(bricks, x, z, kind, n = 5, spread = 1.6, opts = {}) {
  const minGap = 0.6 * (opts.scale ?? 1);
  for (const [px, pz] of scatterPoints(x, z, n, spread, minGap)) addProp(bricks, px, pz, kind, opts);
  return bricks;
}

/* ---------- wooden fence: posts + rails, one connected line ------------
   Unlike the single-box clutter, a fence needs to look and behave like
   one continuous structure, so every post and rail along the path shares
   one `fence` id (see makeMortar/damage/rebuild in castle.mjs): its own
   pieces always bond to each other -- it stands or comes down as one
   line -- but the line itself never bonds to the ground or nearby
   masonry, always loose, like a keg. */
let _fenceSerial = 0;
export function addFence(bricks, path, opts = {}) {
  const { spacing = 1.4, baseY = 0, scale = 1, postH = 0.55, railYs = [0.35, 0.75] } = opts;
  const id = _fenceSerial++;
  const put = (x, ly, z, hx, hy, hz, yaw, tag) => {
    bricks.push({
      p: [x, baseY + ly * scale, z],
      h: [hx * scale, hy * scale, hz * scale], yaw, course: 0, ring: 0, isBanner: false, tag,
      fence: { id },
    });
  };
  const posts = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
      const t = k / n;
      posts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  for (const [x, z] of posts) put(x, postH, z, 0.05, postH, 0.05, 0, 'fence-post');
  for (let i = 0; i + 1 < posts.length; i++) {
    const [ax, az] = posts[i], [bx, bz] = posts[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const yaw = Math.atan2(-dz, dx), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const ry of railYs) put(mx, ry, mz, len / 2 * 0.96, 0.035, 0.035, yaw, 'fence-rail');
  }
  return bricks;
}

/* a forest: a scattered cluster of trees, like magazine() is to addKeg.
   The gap is sized off the canopy (up to 1.1m across at its widest tier)
   so trees don't spawn with foliage overlapping -- that interpenetration
   was shoving trees over on the very first physics step. */
export function forest(bricks, x, z, n = 6, spread = 2.5, opts = {}) {
  const scale0 = opts.scale ?? 1;
  scatterPoints(x, z, n, spread, 1.5 * scale0).forEach(([px, pz], i) => {
    const h3 = hash01(i, 0, x, z, 5);
    addTree(bricks, px, pz, { ...opts, scale: scale0 * (0.75 + 0.5 * h3) });
  });
  return bricks;
}

/* =====================================================================
   THE PLANS
   Each returns a brick array ready for makeMortar(). `blurb` is for the HUD.
===================================================================== */

/* --- square tower: the FINDINGS note said a round base is a wide support
       polygon and very hard to topple. A square one has flat faces and
       corners, so undermining a face drops it far more readily. ------- */
export function squareTower(P = {}) {
  const { side = 5.0, wall = 0.8, courses = 30, courseH = 0.40, brickL = 0.55, rings = 2 } = P;
  const bricks = layPath(square(0, 0, side), {
    closed: true, thickness: wall, rings, courses, courseH, brickL, crenels: true,
  });
  const topY = courseH * courses;
  plantBanner(bricks, side / 2 - wall / 2, topY, 0);
  return bricks;
}

/* --- keep: a fat square tower, thick-walled and unpowered ----------- */
export function keep(P = {}) {
  const { side = 7.0, wall = 1.0, courses = 26, courseH = 0.42, brickL = 0.62, rings = 2,
          cx = 0, cz = 0, baseY = 0, banner = true } = P;
  const bricks = layPath(square(cx, cz, side), {
    closed: true, thickness: wall, rings, courses, courseH, brickL, baseY, crenels: true,
    openings: [{ x: cx - side / 2, z: cz, w: 1.8, from: 0, to: 4 }],   // a door
  });
  if (banner) plantBanner(bricks, cx + side / 2 - wall / 2, baseY + courseH * courses, cz);
  return bricks;
}

/* --- the castle: curtain walls, corner towers, gatehouse, keep ------
       and some powder. Aim: the walls are a shield. A keg in a corner
       tower is a lucky shortcut if you can reach it, but the keep itself
       carries no magazine -- breach the wall and bring it down on merit. */
export function castle(P = {}) {
  const {
    court = 17,          // courtyard side, m
    wallH = 9,           // curtain courses
    towerH = 16,         // corner tower courses
    courseH = 0.45,
    powder = true,
    knights = true,
  } = P;

  const bricks = [];
  const h = court / 2;
  const TOWER = 4.2, TW = 0.7;

  /* curtain walls: four straight runs between the corner towers. The front
     wall (facing the gun at -x) carries the gate. */
  const corners = [[-h, -h], [-h, h], [h, h], [h, -h]];
  const runs = [
    [[-h, -h], [-h, h]],   // west  (the gun looks at this one)
    [[-h,  h], [ h, h]],   // north
    [[ h,  h], [ h, -h]],  // east
    [[ h, -h], [-h, -h]],  // south
  ];
  for (const [a, b] of runs) {
    const isFront = a[0] === -h && b[0] === -h;
    layPath([a, b], {
      closed: false, thickness: 1.0, rings: 2, courses: wallH, courseH,
      brickL: 0.7, crenels: true, into: bricks,
      openings: isFront ? [{ x: -h, z: 0, w: 3.0, from: 0, to: Math.floor(wallH * 0.55) }] : [],
    });
  }

  /* four corner towers, taller than the curtain, so they read as towers */
  for (const [cx, cz] of corners) {
    layPath(square(cx, cz, TOWER), {
      closed: true, thickness: TW, rings: 1, courses: towerH, courseH,
      brickL: 0.66, crenels: true, into: bricks,
    });
  }

  /* the keep, off-centre so the gate has a bailey in front of it.
     It must be SLENDER -- a fat keep just sits down on its own rubble
     once its base is undermined, banner still 7 m in the air, which
     reads as a fizzle. 5.6 m wide x 12 m tall topples properly. No
     magazine of its own: it has to be earned by direct fire. */
  const kx = 2.2, kz = 0;
  keep({ side: 4.8, wall: 0.8, courses: 30, courseH,
         brickL: 0.58, rings: 2, cx: kx, cz: kz }).forEach(b => bricks.push(b));

  /* THE POWDER.
     - one keg in each corner tower: a lucky shot brings the tower down.
     - a couple in the bailey, in the open, for the player who overshoots.
     The keep itself carries none. */
  if (powder) {
    for (const [cx, cz] of corners) addKeg(bricks, cx, 0.45, cz, { blastR: 2.8, power: 2.0, crater: 1.7 });
    addKeg(bricks, -3.5, 0.45,  4.5);
    addKeg(bricks, -3.5, 0.45, -4.5);
  }

  /* THE GARRISON. Two mortared onto curtain walls (come down WITH them --
     a tower's interior is a hollow shaft with no floor, so wall-tops are
     the only place that's actually solid to stand on), and two standing
     loose flanking the keep's door -- each goes down on its own the
     moment anything reaches them. Both placement modes side by side,
     on purpose. */
  if (knights) {
    addKnight(bricks, -h, 0, { yaw: Math.PI, baseY: (wallH - 1) * courseH, mortared: true });          // west wall-top
    addKnight(bricks, 0, -h, { yaw: -Math.PI / 2, baseY: (wallH - 1) * courseH, mortared: true });     // south wall-top
    addKnight(bricks, kx - 1.7, kz + 1.3, { yaw: Math.PI, mortared: false });
    addKnight(bricks, kx - 1.7, kz - 1.3, { yaw: Math.PI, mortared: false });
  }
  return bricks;
}

/* --- the roster the viewer offers ---------------------------------- */
export const PLANS = {
  round: {
    name: 'round tower',
    blurb: 'the original. wide base ring — hard to topple.',
    camera: 34,
    make: (makeTower) => makeTower({ outerR: 2.2, wall: 0.8, courses: 30, courseH: 0.40, brickL: 0.55, rings: 2 }),
  },
  square: {
    name: 'square tower',
    blurb: 'flat faces, corners. undermine one face and it goes.',
    camera: 34,
    make: () => squareTower(),
  },
  keep: {
    name: 'keep',
    blurb: 'a single fortified keep. no powder — earn it brick by brick.',
    camera: 36,
    make: () => keep({ side: 5.6, wall: 0.85, courses: 28, courseH: 0.42, brickL: 0.6 }),
  },
  castle: {
    name: 'castle',
    blurb: 'curtain walls, four towers, gate, keep. powder in the towers, none in the keep.',
    camera: 52,
    make: () => castle(),
  },
};
