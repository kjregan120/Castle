/* CONTROL + SIEGE for every plan in the roster.
   Q1: does it stand when nothing hits it?   (the control test — this is the
       one that caught the banner never bonding, so run it on every new plan)
   Q2: how heavy is it?                       (bricks, bodies, ms/frame)
   Q3: does the powder chain?                 (fire ONE round at the magazine) */
import initJolt from 'jolt-physics/wasm-compat';
import { makeTower, makeMortar, Castle, LAYER_STATIC, LAYER_MOVING, NUM_LAYERS } from './castle.mjs';
import { PLANS } from './plans.mjs';

const Jolt = await initJolt();
const V = (x,y,z) => new Jolt.Vec3(x,y,z), RV = (x,y,z) => new Jolt.RVec3(x,y,z);
const QI = () => Jolt.Quat.prototype.sIdentity();

function world() {
  const of = new Jolt.ObjectLayerPairFilterTable(NUM_LAYERS);
  of.EnableCollision(0,1); of.EnableCollision(1,1);
  const bp = new Jolt.BroadPhaseLayerInterfaceTable(NUM_LAYERS,2);
  bp.MapObjectToBroadPhaseLayer(0,new Jolt.BroadPhaseLayer(0));
  bp.MapObjectToBroadPhaseLayer(1,new Jolt.BroadPhaseLayer(1));
  const s = new Jolt.JoltSettings();
  s.mObjectLayerPairFilter = of; s.mBroadPhaseLayerInterface = bp;
  s.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    s.mBroadPhaseLayerInterface,2,s.mObjectLayerPairFilter,NUM_LAYERS);
  const j = new Jolt.JoltInterface(s); Jolt.destroy(s);
  const bi = j.GetPhysicsSystem().GetBodyInterface();
  const fs = new Jolt.BoxShape(V(90,0.5,90),0.05,null);
  const cfg = new Jolt.BodyCreationSettings(fs,RV(0,-0.5,0),QI(),Jolt.EMotionType_Static,LAYER_STATIC);
  cfg.mFriction = 0.9;
  const f = bi.CreateBody(cfg); bi.AddBody(f.GetID(), Jolt.EActivation_DontActivate);
  Jolt.destroy(cfg);
  return j;
}

const SHELL = { name:'shell', calibre:0.30, mass:150, speed:95, crater:0.70, blastR:1.40,
                power:2.2, impulse:800 };
const PENE  = { name:'pene',  calibre:0.16, mass:220, speed:150, crater:0.50, blastR:1.05,
                power:2.6, impulse:500, penetration:1.4 };
const DT = 1/60, MUZZLE = [-30, 1.0, 0];

function ballistic(from, to, speed) {
  const dx = to[0]-from[0], dy = to[1]-from[1], dz = to[2]-from[2];
  const d = Math.hypot(dx,dz), g = 9.81;
  const disc = speed**4 - g*(g*d*d + 2*dy*speed*speed);
  if (disc < 0) { const L = Math.hypot(dx,dy,dz); return [dx/L,dy/L,dz/L]; }
  const ang = Math.atan2(speed*speed - Math.sqrt(disc), g*d);
  return [dx/d*Math.cos(ang), Math.sin(ang), dz/d*Math.cos(ang)];
}

console.log('\nPLANS — control (stands?) then one round at the powder (chains?)\n');
console.log('plan            bricks joints kegs  build  step   drift  stands   1 round at the magazine');
console.log('-'.repeat(104));

for (const [key, plan] of Object.entries(PLANS)) {
  const j = world();
  const t0 = performance.now();
  const bricks = plan.make(makeTower);
  const links  = makeMortar(bricks);
  const c = new Castle(Jolt, j, bricks, links);
  c.installImpactFracture(6.0, 1.6, 2.4);
  c.crushFactor = 2.2;
  c.rebuild();
  const build = performance.now() - t0;
  const kegs0 = c.kegsLeft();
  // loose knights are exactly like kegs here: each is legitimately its own
  // body, not a sign the structure fell apart -- count them the same way.
  const looseKnights0 = new Set(
    bricks.filter(b => b.knight && !b.knight.mortared).map(b => b.knight.id)
  ).size;

  /* --- Q1: control. fire nothing for 6 s. --- */
  const h0 = c.bannerHeight();
  let step = 0;
  for (let f = 0; f < 360; f++) {
    const a = performance.now(); j.Step(DT,1); step = Math.max(step, performance.now()-a);
  }
  const h1 = c.bannerHeight();
  const drift = (h0 - h1) * 1000;
  const stands = drift < 300 && c.bodies.length <= Math.max(2, kegs0 + looseKnights0 + 2);

  /* --- Q3: one round, aimed at the powder. --- */
  const aim = key === 'castle' ? [2.0, 1.0, 0] : [0, 1.0, 0];   // the magazine
  const ammo = key === 'castle' ? PENE : SHELL;
  const dir = ballistic(MUZZLE, aim, ammo.speed);
  c.fire(MUZZLE, dir, ammo);
  let worst = 0;
  for (let f = 0; f < 900; f++) {
    const a = performance.now();
    j.Step(DT,1); c.applyImpacts(); c.applyHits(); c.commitDamage();
    worst = Math.max(worst, performance.now()-a);
  }
  const h2 = c.bannerHeight();

  console.log(
    `${plan.name.padEnd(15)} ${String(bricks.length).padStart(5)} ${String(links.length).padStart(6)}` +
    ` ${String(kegs0).padStart(4)} ${build.toFixed(0).padStart(5)}ms ${step.toFixed(1).padStart(5)}ms` +
    ` ${drift.toFixed(0).padStart(5)}mm  ${(stands?'yes':'NO ').padEnd(7)}` +
    ` blew ${c.kegsBlown}/${kegs0} kegs, ${c.destroyedBricks} stone, ` +
    `banner ${h0.toFixed(1)}->${h2.toFixed(1)}m${c.bannerDown()?' <<< DOWN':''} (worst ${worst.toFixed(0)}ms)`);

  Jolt.destroy(j);
}
console.log('');
