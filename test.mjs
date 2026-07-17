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
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(NUM_LAYERS, 2);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, new Jolt.BroadPhaseLayer(0));
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(1));
  const s = new Jolt.JoltSettings();
  s.mObjectLayerPairFilter = objFilter;
  s.mBroadPhaseLayerInterface = bpInterface;
  s.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    s.mBroadPhaseLayerInterface, 2, s.mObjectLayerPairFilter, NUM_LAYERS);
  const j = new Jolt.JoltInterface(s);
  Jolt.destroy(s);

  const bi = j.GetPhysicsSystem().GetBodyInterface();
  const floorShape = new Jolt.BoxShape(V(60, 0.5, 60), 0.05, null);
  const cfg = new Jolt.BodyCreationSettings(floorShape, RV(0, -0.5, 0), QI(), Jolt.EMotionType_Static, LAYER_STATIC);
  cfg.mFriction = 0.9;
  const floor = bi.CreateBody(cfg);
  bi.AddBody(floor.GetID(), Jolt.EActivation_DontActivate);
  Jolt.destroy(cfg);
  return j;
}

const DT = 1 / 60;
const bar = (v, max, w = 24) => '#'.repeat(Math.round(Math.min(1, v / max) * w)).padEnd(w, '.');

// =====================================================================
console.log('='.repeat(72));
console.log('  TOWER TEST');
console.log('='.repeat(72));

const bricks = makeTower();
const links = makeMortar(bricks);
console.log(`\ngenerated: ${bricks.length} bricks, ${links.length} mortar joints`);
const g0 = components(bricks.length, links);
console.log(`connected components: ${g0.length}  (largest = ${Math.max(...g0.map(g => g.length))} bricks)`);
if (g0.length > 1) console.log(`  !! tower is not one piece -- mortar tolerance is wrong`);

// =====================================================================
// Q1: DOES IT STAND STILL?
// =====================================================================
console.log('\n' + '-'.repeat(72));
console.log('  Q1  does it stand still?');
console.log('-'.repeat(72));

for (const mode of ['merged', 'naive']) {
  const j = world();
  const bs = makeTower();
  const ls = makeMortar(bs);
  if (mode === 'naive') for (const L of ls) L.alive = 0;   // every brick its own body

  const c = new Castle(Jolt, j, bs, ls);
  const t0 = Date.now();
  const nBodies = c.rebuild();
  const buildMs = Date.now() - t0;

  const t = new Float32Array(bs.length * 7);
  c.brickTransforms(t);
  const start = Float32Array.from(t);

  let stepMs = 0, sleptAt = -1;
  for (let s = 0; s < 600; s++) {           // 10 seconds
    const a = process.hrtime.bigint();
    j.Step(DT, 1);
    stepMs += Number(process.hrtime.bigint() - a) / 1e6;
    if (sleptAt < 0 && c.awake() === 0) sleptAt = s * DT;
  }
  c.brickTransforms(t);

  let drift = 0, sink = 0;
  for (let i = 0; i < bs.length; i++) {
    const d = Math.hypot(t[i * 7] - start[i * 7], t[i * 7 + 1] - start[i * 7 + 1], t[i * 7 + 2] - start[i * 7 + 2]);
    if (d > drift) drift = d;
    sink += start[i * 7 + 1] - t[i * 7 + 1];
  }
  console.log(
    `  ${mode.padEnd(7)} bodies=${String(nBodies).padStart(5)}  build ${String(buildMs).padStart(4)}ms  ` +
    `sim ${(stepMs / 600).toFixed(2)}ms/frame  max drift ${(drift * 1000).toFixed(1)}mm  ` +
    `mean sink ${(sink / bs.length * 1000).toFixed(1)}mm  ` +
    (sleptAt >= 0 ? `asleep @${sleptAt.toFixed(1)}s` : 'NEVER SLEPT'));
  Jolt.destroy(j);
}

// =====================================================================
// Q2 + Q3: KNOCK OUT THE BASE. DOES IT TOPPLE, AND DOES THE BANNER COME DOWN?
// =====================================================================
console.log('\n' + '-'.repeat(72));
console.log('  Q2/Q3  knock out the base -- topple, and does the banner fall?');
console.log('-'.repeat(72));

for (const shot of [
  { name: 'solid shot, base ', x: 3.0, y: 0.8, z: 0, r: 1.6, power: 1.4, crater: 0.7 },
  { name: 'shell, base       ', x: 3.0, y: 0.8, z: 0, r: 2.8, power: 2.2, crater: 1.5 },
  { name: 'shell, midway     ', x: 3.0, y: 4.0, z: 0, r: 2.8, power: 2.2, crater: 1.5 },
  { name: 'heavy shell, base ', x: 3.0, y: 0.8, z: 0, r: 3.6, power: 2.6, crater: 2.2 },
]) {
  const j = world();
  const bs = makeTower();
  const ls = makeMortar(bs);
  const c = new Castle(Jolt, j, bs, ls);
  c.rebuild();

  for (let s = 0; s < 90; s++) j.Step(DT, 1);      // let it settle
  const h0 = c.bannerHeight();

  const { broke, gone } = c.damage(shot.x, shot.y, shot.z, shot.r, shot.power, shot.crater);
  const cracked = c.tensionPass();
  const nb = c.rebuild(true);
  c.blast(shot.x, shot.y, shot.z, shot.r * 1.3, 900);

  let peakBodies = nb, fellAt = -1, simMs = 0;
  for (let s = 0; s < 600; s++) {
    const a = process.hrtime.bigint();
    j.Step(DT, 1);
    simMs += Number(process.hrtime.bigint() - a) / 1e6;
    if (fellAt < 0 && c.bannerHeight() < 2.0) fellAt = s * DT;
  }
  const h1 = c.bannerHeight();
  const groups = components(bs.length, ls, c.alive).length;

  console.log(`\n  ${shot.name}   stone destroyed: ${gone}/${bs.length}   mortar broken: ${broke}/${ls.length}`);
  console.log(`    fragments        ${nb} -> ${groups}`);
  console.log(`    banner  ${h0.toFixed(2)}m -> ${h1.toFixed(2)}m   ${bar(h0 - h1, h0)}  ` +
              `${h1 < 2.0 ? 'DOWN' : 'still up'}`);
  console.log(`    time to fall     ${fellAt < 0 ? '--' : fellAt.toFixed(2) + 's'}   ` +
              `sim ${(simMs / 600).toFixed(2)}ms/frame   supported=${c.bannerSupported()}`);
  Jolt.destroy(j);
}
console.log();
