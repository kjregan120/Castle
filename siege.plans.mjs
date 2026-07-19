/* Is each plan actually WINNABLE, and does it take a sensible number of rounds?
   A castle that cannot be taken is not a level, and one that falls to the first
   shot is not either. Policy per plan is deliberately dumb -- a human aiming can
   only do better, so this is a lower bound on the fun. */
import initJolt from 'jolt-physics/wasm-compat';
import { makeTower, makeMortar, Castle, NUM_LAYERS, LAYER_STATIC } from './castle.mjs';
import { PLANS } from './plans.mjs';

const Jolt = await initJolt();
const V=(x,y,z)=>new Jolt.Vec3(x,y,z), RV=(x,y,z)=>new Jolt.RVec3(x,y,z);
const QI=()=>Jolt.Quat.prototype.sIdentity();
function world(){
  const of=new Jolt.ObjectLayerPairFilterTable(NUM_LAYERS); of.EnableCollision(0,1); of.EnableCollision(1,1);
  const bp=new Jolt.BroadPhaseLayerInterfaceTable(NUM_LAYERS,2);
  bp.MapObjectToBroadPhaseLayer(0,new Jolt.BroadPhaseLayer(0)); bp.MapObjectToBroadPhaseLayer(1,new Jolt.BroadPhaseLayer(1));
  const s=new Jolt.JoltSettings(); s.mObjectLayerPairFilter=of; s.mBroadPhaseLayerInterface=bp;
  s.mObjectVsBroadPhaseLayerFilter=new Jolt.ObjectVsBroadPhaseLayerFilterTable(s.mBroadPhaseLayerInterface,2,s.mObjectLayerPairFilter,NUM_LAYERS);
  const j=new Jolt.JoltInterface(s); Jolt.destroy(s);
  const bi=j.GetPhysicsSystem().GetBodyInterface();
  const fs=new Jolt.BoxShape(V(90,0.5,90),0.05,null);
  const cfg=new Jolt.BodyCreationSettings(fs,RV(0,-0.5,0),QI(),Jolt.EMotionType_Static,LAYER_STATIC);
  cfg.mFriction=0.9; const f=bi.CreateBody(cfg); bi.AddBody(f.GetID(),Jolt.EActivation_DontActivate);
  Jolt.destroy(cfg); return j;
}
/* Two solutions always exist: the flat one and the lobbed one. The flat one is
   what a gun does. The lobbed one clears a curtain wall -- and once there are
   walls in the game, the player MUST have a way over them or the keep behind is
   simply unreachable. That is what `high` is for. */
function ballistic(from,to,speed,high=false){
  const dx=to[0]-from[0], dy=to[1]-from[1], dz=to[2]-from[2];
  const d=Math.hypot(dx,dz), g=9.81;
  const disc=speed**4-g*(g*d*d+2*dy*speed*speed);
  if(disc<0){const L=Math.hypot(dx,dy,dz); return [dx/L,dy/L,dz/L];}
  const root=Math.sqrt(disc);
  const ang=Math.atan2(speed*speed + (high?root:-root), g*d);
  return [dx/d*Math.cos(ang), Math.sin(ang), dz/d*Math.cos(ang)];
}
const SHELL={name:'shell', calibre:0.30,mass:150,speed:95, crater:0.70,blastR:1.40,power:2.2,impulse:800};
const MORTAR={name:'mortar',calibre:0.34,mass:170,speed:26, crater:0.75,blastR:1.55,power:2.3,impulse:900,arc:'high'};
const PENE ={name:'pene',  calibre:0.16,mass:220,speed:150,crater:0.50,blastR:1.05,power:2.6,impulse:500,penetration:1.4};
const MUZZLE=[-30,1.0,0], DT=1/60;

/* aim policy: where does shot #k go, and with what? */
const POLICY = {
  round:  k => [SHELL, [-2.2*Math.cos(k*0.45), 0.9, 2.2*Math.sin(k*0.45)]],
  square: k => [SHELL, [-2.5, 0.9, (k%2?1:-1) * Math.min(2.0, k*0.6)]],
  keep:   k => [k<1?SHELL:PENE, [-2.8, 1.1, 0]],                 // through the door
  // breach the gate, put a penetrator through it into the magazine, then
  // walk shells around the keep's base like you would any other tower
  // thread the gate into the magazine, then LOB rounds over the curtain wall
  // onto the keep's base -- flat shots just hit the wall, which is the point of
  // having a wall.
  castle: k => k < 1 ? [PENE, [2.2, 1.0, 0]]                      // through the gate, into the powder
             : [MORTAR, [-0.2, 1.0, (k % 2 ? 1 : -1) * Math.min(2.0, k * 0.7)]],  // lob onto the keep's west footing
};

console.log('\nSIEGE — every plan, dumb aim, max 10 rounds\n');
for (const [key, plan] of Object.entries(PLANS)) {
  const j=world();
  const bricks=plan.make(makeTower), links=makeMortar(bricks);
  const c=new Castle(Jolt,j,bricks,links);
  c.installImpactFracture(6.0,1.6,2.4); c.crushFactor=2.2; c.rebuild();
  const h0=c.bannerHeight();
  console.log(`${plan.name.toUpperCase()}  (${bricks.length} bricks, ${c.kegsLeft()} kegs, banner ${h0.toFixed(1)}m)`);
  console.log('   #  round   aim                stone  kegs  bodies  worst   banner');

  let won=false, worstAll=0;
  for (let k=0; k<10 && !won; k++) {
    const [ammo, aim] = POLICY[key](k);
    c.fire(MUZZLE, ballistic(MUZZLE, aim, ammo.speed, ammo.arc === 'high'), ammo);
    let worst=0;
    for (let f=0; f<540; f++) {
      const t=performance.now();
      j.Step(DT,1); c.applyImpacts(); c.applyHits(); c.commitDamage();
      worst=Math.max(worst, performance.now()-t);
      if (f>120 && c.awake()===0) break;              // everything has settled
    }
    worstAll=Math.max(worstAll,worst);
    won = c.bannerDown();
    console.log(`  ${String(k+1).padStart(2)}  ${ammo.name.padEnd(6)}  ` +
      `(${aim[0].toFixed(1)},${aim[1].toFixed(1)},${aim[2].toFixed(1)})`.padEnd(18) +
      `${String(c.destroyedBricks).padStart(6)} ${String(c.kegsBlown).padStart(5)} ` +
      `${String(c.bodies.length).padStart(7)} ${worst.toFixed(0).padStart(4)}ms  ` +
      `${c.bannerHeight().toFixed(2)}m${won?'   <<< BANNER DOWN':''}`);
  }
  console.log(`   -> ${won?'taken':'STOOD'}   worst frame ${worstAll.toFixed(0)}ms   rebuilds ${c.rebuilds}\n`);
  Jolt.destroy(j);
}
