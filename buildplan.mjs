/* ------------------------------------------------------------------
   BUILDPLAN — a castle is DATA, not code.

   plans.mjs describes castles as JavaScript functions, which means a new
   one can only enter the game by shipping new code. This module reads a
   castle from a plain JSON object instead, so the app can load one at
   runtime (drag-drop, paste, fetch) and the editor can write one out.

   The output is the SAME brick dictionary every generator produces
   (p / h / yaw / course / ring / tags, kegs carrying a `keg` spec), so
   makeMortar, the union-find and every physics pass in castle.mjs consume
   it unchanged. Nothing downstream knows a plan was ever JSON.

   A plan:
   {
     "name": "my keep",
     "camera": 40,                       // starting orbit distance (optional)
     "defaults": { "courses": 12, ... }, // applied to every wall/tower (optional)
     "elements": [ ... ]                 // laid in order
   }

   Element types:
     wall     { path:[[x,z],...], closed?, thickness?, rings?, courses?,
                courseH?, brickL?, baseY?, crenels?, openings?, id? }
     tower    { shape:"square"|"ngon", cx, cz, side? | r?,n?, ...same opts, id? }
     keg      { x, y?, z?, spec?:{blastR,power,crater,impulse} }
     magazine { x, y?, z?, n?, spread?, spec? }
     banner   { on?:<element id> }  OR  { x, y, z }
     knight   { x, z, yaw?, baseY?, mortared? }
     tree     { x, z, baseY?, scale? }
     forest   { x, z, n?, spread?, baseY?, scale? }
     rock | crate | hay   { x, z, baseY?, scale? }
     clutter  { x, z, kind?:"rock"|"crate"|"hay", n?, spread?, baseY?, scale? }
     fence    { path:[[x,z],...], spacing?, baseY?, scale? }

   An `openings` entry is { x, z, w, from, to }: courses from..to are skipped
   within w/2 metres of (x,z) -- a gate, or a window.
------------------------------------------------------------------- */

import { layPath, square, ngon, addKeg, magazine, plantBanner, addKnight, addTree, forest,
         addProp, propCluster, addFence } from './plans.mjs';
import { makeMortar, components } from './castle.mjs';

/* the defaults a wall/tower falls back to, matching plans.mjs's house style */
const WALL_DEFAULTS = {
  closed: false, thickness: 1.0, rings: 2, courses: 12, courseH: 0.42,
  brickL: 0.62, baseY: 0, crenels: false, openings: [],
};

/* pull the layPath options off an element, over a plan-wide defaults layer */
function opts(el, defaults) {
  const d = { ...WALL_DEFAULTS, ...defaults };
  return {
    closed:    el.closed    ?? d.closed,
    thickness: el.thickness ?? d.thickness,
    rings:     el.rings     ?? d.rings,
    courses:   el.courses   ?? d.courses,
    courseH:   el.courseH   ?? d.courseH,
    brickL:    el.brickL    ?? d.brickL,
    baseY:     el.baseY     ?? d.baseY,
    crenels:   el.crenels   ?? d.crenels,
    openings:  el.openings  ?? [],
  };
}

/* the polygon for a tower element */
function towerPath(el) {
  if (el.shape === 'ngon') return ngon(el.cx, el.cz, el.r ?? 3, el.n ?? 8);
  return square(el.cx, el.cz, el.side ?? 5);   // default + 'square'
}

/* where does a banner planted "on" a closed element go? On a WALL, not in
   the hollow middle -- the pole has to physically touch stone or the mortar
   graph never bonds it (makeMortar sizes its hash cells from the biggest
   brick; a floating pole is simply its own component and falls off). We put
   it over the +x wall, the far side from the gun, as the shipped plans do. */
function bannerSpotFor(el, o) {
  const topY = o.baseY + o.courseH * o.courses;
  const inset = o.thickness / 2;
  if (el.shape === 'ngon') {
    const innerR = (el.r ?? 3) - inset;
    return [el.cx + innerR, topY, el.cz];
  }
  const innerHalf = (el.side ?? 5) / 2 - inset;
  return [el.cx + innerHalf, topY, el.cz];
}

export function buildPlan(plan) {
  if (!plan || !Array.isArray(plan.elements))
    throw new Error('plan needs an elements array');

  const bricks = [];
  const byId = new Map();      // element id -> { el, opts } for banner "on"

  for (const el of plan.elements) {
    switch (el.type) {
      case 'wall': {
        const o = opts(el, plan.defaults);
        layPath(el.path, { ...o, into: bricks, elType: 'wall' });
        if (el.id) byId.set(el.id, { el, opts: o });
        break;
      }
      case 'tower': {
        const o = opts(el, plan.defaults);
        o.closed = true;                       // a tower is always closed
        layPath(towerPath(el), { ...o, into: bricks, elType: 'tower' });
        if (el.id) byId.set(el.id, { el, opts: o });
        break;
      }
      case 'keg':
        addKeg(bricks, el.x, el.y ?? 0.45, el.z ?? 0, el.spec ?? {});
        break;
      case 'magazine':
        magazine(bricks, el.x, el.y ?? 0.45, el.z ?? 0,
                 el.n ?? 4, el.spread ?? 0.9, el.spec ?? {});
        break;
      case 'knight':
        addKnight(bricks, el.x, el.z ?? 0, {
          yaw: el.yaw ?? 0, baseY: el.baseY ?? 0, mortared: !!el.mortared,
        });
        break;
      case 'tree':
        addTree(bricks, el.x, el.z ?? 0, { baseY: el.baseY ?? 0, scale: el.scale ?? 1 });
        break;
      case 'forest':
        forest(bricks, el.x, el.z ?? 0, el.n ?? 6, el.spread ?? 2.5,
               { baseY: el.baseY ?? 0, scale: el.scale ?? 1 });
        break;
      case 'rock': case 'crate': case 'hay':
        addProp(bricks, el.x, el.z ?? 0, el.type, { baseY: el.baseY ?? 0, scale: el.scale ?? 1 });
        break;
      case 'clutter':
        propCluster(bricks, el.x, el.z ?? 0, el.kind ?? 'rock', el.n ?? 5, el.spread ?? 1.6,
                    { baseY: el.baseY ?? 0, scale: el.scale ?? 1 });
        break;
      case 'fence':
        addFence(bricks, el.path, { spacing: el.spacing ?? 1.4, baseY: el.baseY ?? 0, scale: el.scale ?? 1 });
        break;
      case 'banner': {
        if (el.on != null) {
          const ref = byId.get(el.on);
          if (!ref) throw new Error(`banner refers to unknown element id "${el.on}"`);
          const [x, y, z] = bannerSpotFor(ref.el, ref.opts);
          plantBanner(bricks, x, y, z);
        } else {
          plantBanner(bricks, el.x, el.y, el.z);
        }
        break;
      }
      default:
        throw new Error(`unknown element type "${el.type}"`);
    }
  }
  return bricks;
}

/* ------------------------------------------------------------------
   VALIDATION. Two authoring bugs are easy to reintroduce by hand and
   invisible until you fire a shot, so catch them at build time:
     - the banner floating free (never bonded to the tower), and
     - the structure laid in disconnected pieces.
   Kegs are SUPPOSED to be their own components (they are unmortared loose
   barrels), so they are not counted against connectivity.
------------------------------------------------------------------- */
export function validatePlan(bricks) {
  const links = makeMortar(bricks);
  const groups = components(bricks.length, links);

  const group = new Int32Array(bricks.length).fill(-1);
  groups.forEach((g, gi) => { for (const i of g) group[i] = gi; });

  const isStone = i => !bricks[i].isKeg && !bricks[i].isBanner && !bricks[i].knight
                    && !bricks[i].tree && !bricks[i].prop && !bricks[i].fence;

  // the main structure = the largest group that is actual stone
  let main = -1, mainSize = -1;
  groups.forEach((g, gi) => {
    const stone = g.filter(isStone).length;
    if (stone > mainSize) { mainSize = stone; main = gi; }
  });

  const issues = [];

  // banner bonding
  const banners = bricks.map((b, i) => b.isBanner ? i : -1).filter(i => i >= 0);
  const looseBanner = banners.filter(i => group[i] !== main);
  if (banners.length === 0) issues.push('no banner: nothing to knock down');
  else if (looseBanner.length)
    issues.push(`banner not bonded to the structure (${looseBanner.length} of ${banners.length} pieces float free) -- move it so its pole touches a wall`);

  // stray structural chunks (ignore kegs)
  const stoneGroups = groups
    .map((g, gi) => ({ gi, stone: g.filter(isStone).length }))
    .filter(x => x.stone > 0);
  if (stoneGroups.length > 1) {
    const others = stoneGroups.filter(x => x.gi !== main).reduce((s, x) => s + x.stone, 0);
    issues.push(`structure is in ${stoneGroups.length} disconnected pieces (${others} bricks are not attached to the main body) -- close the gap or overlap the courses`);
  }

  const kegs = bricks.filter(b => b.isKeg).length;
  const knights = new Set(bricks.filter(b => b.knight).map(b => b.knight.id)).size;
  const trees = new Set(bricks.filter(b => b.tree).map(b => b.tree.id)).size;
  const props = bricks.filter(b => b.prop).length;
  const fences = new Set(bricks.filter(b => b.fence).map(b => b.fence.id)).size;
  return {
    ok: issues.length === 0,
    issues,
    stats: { bricks: bricks.length, joints: links.length, components: groups.length,
             kegs, knights, trees, props, fences, mainStone: mainSize },
  };
}
