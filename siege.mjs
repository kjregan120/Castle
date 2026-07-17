import initJolt from 'jolt-physics/wasm-compat';
import { makeTower, makeMortar, components, Castle, LAYER_STATIC, LAYER_MOVING, NUM_LAYERS } from './castle.mjs';

const Jolt = await initJolt();
const V = (x, y, z) => new Jolt.Vec3(x, y, z);
const RV = (x, y, z) => new Jolt.RVec3(x, y, z);
const QI = () => Jolt.Quat.prototype.sIdentity();

function world() {
  const objFilter = new Jolt.ObjectLayerPairFilterTable(NUM_LAYERS);
  objFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING);
  objFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);
  const bp = new Jolt.BroadPhaseLayerInterfaceTable(NUM_LAYERS, 2);
  bp.MapObjectToBroadPhaseLayer(LAYER_STATIC, new Jolt.BroadPhaseLayer(0));
  bp.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(1));
  const s = new Jolt.JoltSettings();
  s.mObjectLayerPairFilter = objFilter;
  s.mBroadPhaseLayerInterface = bp;
  s.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    s.mBroadPhaseLayerInterface, 2, s.mObjectLayerPairFilter, NUM_LAYERS);
  const j = new Jolt.JoltInterface(s);
  Jolt.destroy(s);
  const bi = j.GetPhysicsSystem().GetBodyInterface();
  const fs = new Jolt.BoxShape(V(80, 0.5, 80), 0.05, null);
  const cfg = new Jolt.BodyCreationSettings(fs, RV(0, -0.5, 0), QI(), Jolt.EMotionType_Static, LAYER_STATIC);
  cfg.mFriction = 0.9;
  const f = bi.CreateBody(cfg);
  bi.AddBody(f.GetID(), Jolt.EActivation_DontActivate);
  Jolt.destroy(cfg);
  return j;
}

const DT = 1 / 60;

// a SLENDER tower -- the squat one was 6m wide and 8m tall, which is why it
// shrugged off a hole in its base. Real towers are tall and thin.
const SPEC = { outerR: 2.2, wall: 0.8, courses: 30, courseH: 0.40, brickL: 0.55, rings: 2 };

console.log('='.repeat(74));
console.log('  SIEGE — fire shells into one side of the base until it goes');
console.log('='.repeat(74));

const j = world();
const bricks = makeTower(SPEC);
const links = makeMortar(bricks);
const c = new Castle(Jolt, j, bricks, links);
c.installImpactFracture(6.0, 1.6, 2.4);
c.rebuild();
c.loadPass();   // calibrate: what does an intact tower carry?

const H = SPEC.courses * SPEC.courseH;
console.log(`\ntower: ${bricks.length} bricks, ${links.length} joints, ` +
            `${(SPEC.outerR * 2).toFixed(1)}m wide x ${H.toFixed(1)}m tall  (slenderness ${(H / (SPEC.outerR * 2)).toFixed(1)}:1)`);
console.log(`banner at ${c.bannerHeight().toFixed(2)}m\n`);

for (let s = 0; s < 90; s++) j.Step(DT, 1);   // settle
console.log('#  shot                    stone mortar cracked  impact  bodies   banner  settled    worst');
console.log('-'.repeat(92));

let won = false;
// walk the shots around one side of the base -- you cannot undermine a tower
// by hitting the same hole ten times, you have to widen the breach.
const ANG = [0, -0.45, 0.45, -0.9, 0.9, -1.35, 1.35, -1.8];
const PLAN = ANG.map((a, i) => ({
  name: `shell, base ${a >= 0 ? '+' : ''}${a.toFixed(2)}rad`,
  ang: a, y: 0.8, r: 2.4, pow: 2.2, crater: 1.25 }));
for (let shot = 1; shot <= PLAN.length && !won; shot++) {
  const S = PLAN[shot - 1];
  const ang = S.ang;
  const px = Math.cos(ang) * SPEC.outerR, pz = Math.sin(ang) * SPEC.outerR;
  const py = S.y;

  const { broke, gone } = c.damage(px, py, pz, S.r, S.pow, S.crater);
  const cracked = c.settleStructure();     // crush + shed, to equilibrium
  const nb = c.rebuild(true);
  c.blast(px, py, pz, S.r * 1.3, 700);

  // let the physics answer
  let settle = 0, impactBreaks = 0, peak = 0, worstFrame = 0;
  for (let f = 0; f < 600; f++) {
    const t0 = process.hrtime.bigint();
    j.Step(DT, 1);
    impactBreaks += c.applyImpacts();          // masonry shatters where it lands
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > worstFrame) worstFrame = ms;
    if (c.bodies.length > peak) peak = c.bodies.length;
    if (c.awake() === 0) { settle = f * DT; break; }
  }

  const bh = c.bannerHeight();
  won = bh < 2.5;
  console.log(
    `${String(shot).padStart(2)} ${S.name}  ${String(gone).padStart(4)} ${String(broke).padStart(6)} ` +
    `${String(cracked).padStart(7)} ${String(impactBreaks).padStart(8)} ${String(c.bodies.length).padStart(7)} ` +
    `${bh.toFixed(2).padStart(7)}m ${settle.toFixed(2).padStart(7)}s ${worstFrame.toFixed(1).padStart(7)}ms` +
    (won ? '   <<< BANNER DOWN' : ''));
}

console.log(`\n  impacts detected: ${c.dbgCalls}, hardest ${c.dbgMax.toFixed(1)} m/s`);
console.log('\n' + '-'.repeat(74));
console.log(won ? '  RESULT: tower toppled, banner is on the ground.'
                : '  RESULT: still standing after 8 shots.');
console.log(`  stone destroyed ${c.destroyedBricks}/${bricks.length}   ` +
            `mortar broken ${c.brokenLinks}/${links.length}   rebuilds ${c.rebuilds}`);
console.log(`  win check (graph): bannerDown = ${c.bannerDown()}`);
