/* Prove the loader before wiring it anywhere:
   - every sample plan builds
   - the structure is one connected piece and the banner is bonded
   - the same JSON builds the identical bricks twice (determinism) */
import { buildPlan, validatePlan } from './buildplan.mjs';

/* three plans authored purely as data, exercising every element type */
const PLANS = {
  'curtain wall': {
    name: 'curtain wall', camera: 30,
    defaults: { courses: 9, thickness: 1.0, courseH: 0.42, brickL: 0.7 },
    elements: [
      { type: 'wall', id: 'w', path: [[-6, 0], [6, 0]], crenels: true,
        openings: [{ x: 0, z: 0, w: 3, from: 0, to: 4 }] },   // a gate
      { type: 'banner', x: 3, y: 9 * 0.42, z: 0 },            // planted on the rampart
      { type: 'keg', x: 0, y: 0.45, z: 1.2 },
    ],
  },

  'square keep': {
    name: 'square keep', camera: 36,
    defaults: { courseH: 0.42, brickL: 0.6, rings: 2 },
    elements: [
      { type: 'tower', id: 'keep', shape: 'square', cx: 0, cz: 0, side: 5.6,
        thickness: 0.85, courses: 28, crenels: true,
        openings: [{ x: -2.8, z: 0, w: 1.8, from: 0, to: 4 }] },   // a door
      { type: 'magazine', x: 0, y: 0.45, z: 0, n: 5, spread: 1.3,
        spec: { blastR: 3.4, power: 2.4, crater: 2.1, impulse: 30000 } },
      { type: 'banner', on: 'keep' },
    ],
  },

  'twin-tower gate': {
    name: 'twin-tower gate', camera: 40,
    defaults: { courseH: 0.45, brickL: 0.66 },
    elements: [
      { type: 'wall', path: [[-7, -4], [-7, 4]], thickness: 1.0, courses: 9, crenels: true },
      { type: 'tower', id: 'north', shape: 'ngon', cx: -7, cz: 4, r: 2.2, n: 8,
        thickness: 0.7, rings: 1, courses: 16, crenels: true },
      { type: 'tower', shape: 'ngon', cx: -7, cz: -4, r: 2.2, n: 8,
        thickness: 0.7, rings: 1, courses: 16, crenels: true },
      { type: 'banner', on: 'north' },
      { type: 'keg', x: -7, z: 4, spec: { blastR: 2.8, power: 2.0 } },
    ],
  },
};

let pass = 0, fail = 0;
for (const [key, plan] of Object.entries(PLANS)) {
  const bricks = buildPlan(plan);
  const v = validatePlan(bricks);

  // determinism: same JSON -> byte-identical bricks
  const again = buildPlan(JSON.parse(JSON.stringify(plan)));
  const deterministic = JSON.stringify(bricks) === JSON.stringify(again);

  const ok = v.ok && deterministic;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${key.padEnd(16)} ` +
    `${String(v.stats.bricks).padStart(4)} bricks  ${String(v.stats.joints).padStart(4)} joints  ` +
    `${v.stats.kegs} kegs  ${v.stats.components} components  ` +
    `${deterministic ? 'deterministic' : 'NON-DETERMINISTIC'}`);
  for (const issue of v.issues) console.log(`        ! ${issue}`);
}

/* and a plan that is WRONG on purpose -- the validator must catch it */
const broken = {
  name: 'floating banner', elements: [
    { type: 'tower', shape: 'square', cx: 0, cz: 0, side: 5, courses: 10 },
    { type: 'banner', x: 20, y: 4, z: 20 },     // nowhere near the stone
  ],
};
const bv = validatePlan(buildPlan(broken));
const caught = !bv.ok && bv.issues.some(s => s.includes('not bonded'));
caught ? pass++ : fail++;
console.log(`${caught ? 'PASS' : 'FAIL'}  ${'(catches floating banner)'.padEnd(16)} ` +
            `validator ${caught ? 'flagged it' : 'MISSED IT'}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
